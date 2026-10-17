import { DataItem, NodeOutput, WorkflowNode } from '../types/workflow';
import { CredentialsManager } from '../credentials/manager';

export interface NodeExecutionContext {
  node: WorkflowNode;
  inputData: DataItem[];
  getNodeParameter(paramName: string, itemIndex?: number, defaultValue?: any): any;
  getCredentials<T = Record<string, any>>(credentialType: string): T | null;
  evaluateExpression(expression: string, itemIndex?: number): any;
  getAllNodeData(nodeName: string): DataItem[] | null;
  itemIndex: number;
}

export class ExecutionContext {
  private nodeOutputs: Map<string, NodeOutput> = new Map();
  private credentialsManager: CredentialsManager;
  private workflowEnv: Record<string, string>;

  constructor(credentialsManager?: CredentialsManager, env?: Record<string, string>) {
    this.credentialsManager = credentialsManager || new CredentialsManager();
    this.workflowEnv = env || (process.env as Record<string, string>);
  }

  setNodeOutput(nodeNameOrId: string, output: NodeOutput): void {
    this.nodeOutputs.set(nodeNameOrId, output);
  }

  getNodeOutput(nodeNameOrId: string): NodeOutput | undefined {
    return this.nodeOutputs.get(nodeNameOrId);
  }

  getNodeMainData(nodeNameOrId: string): DataItem[] | null {
    const out = this.nodeOutputs.get(nodeNameOrId);
    if (out && out.length > 0 && out[0]) {
      return out[0];
    }
    return null;
  }

  createNodeContext(
    node: WorkflowNode,
    inputData: DataItem[],
    itemIndex = 0
  ): NodeExecutionContext {
    const self = this;

    return {
      node,
      inputData,
      itemIndex,

      getNodeParameter(paramName: string, index = itemIndex, defaultValue = undefined) {
        const rawValue = node.parameters?.[paramName];
        if (rawValue === undefined) return defaultValue;

        if (typeof rawValue === 'string' && rawValue.includes('{{') && rawValue.includes('}}')) {
          return self.evaluateExpression(rawValue, inputData, index, self);
        }
        return rawValue;
      },

      getCredentials<T = Record<string, any>>(credentialType: string): T | null {
        const credId = node.credentials?.[credentialType];
        if (!credId) return null;
        const cred = self.credentialsManager.get(credId, true);
        return (cred?.data as T) || null;
      },

      evaluateExpression(expr: string, index = itemIndex): any {
        return self.evaluateExpression(expr, inputData, index, self);
      },

      getAllNodeData(nodeName: string): DataItem[] | null {
        return self.getNodeMainData(nodeName);
      }
    };
  }

  evaluateExpression(
    expr: string,
    currentItems: DataItem[],
    itemIndex: number,
    context: ExecutionContext
  ): any {
    if (typeof expr !== 'string') return expr;

    // Check if the whole string is an expression: {{ ... }}
    const singleMatch = expr.match(/^\s*\{\{\s*([\s\S]+?)\s*\}\}\s*$/);
    if (singleMatch) {
      return this.evalCode(singleMatch[1], currentItems, itemIndex, context);
    }

    // Replace embedded expressions: "Hello {{ $json.name }}, how are you?"
    return expr.replace(/\{\{\s*([\s\S]+?)\s*\}\}/g, (_, code) => {
      const res = this.evalCode(code, currentItems, itemIndex, context);
      return res !== undefined && res !== null ? String(res) : '';
    });
  }

  private evalCode(
    code: string,
    currentItems: DataItem[],
    itemIndex: number,
    context: ExecutionContext
  ): any {
    const currentItem = currentItems[itemIndex] || { json: {} };
    const $json = currentItem.json;
    const $itemIndex = itemIndex;
    const $now = new Date().toISOString();
    const $today = new Date().toISOString().split('T')[0];
    const $env = this.workflowEnv;

    const nodeLookup = (name: string) => {
      const out = context.getNodeMainData(name);
      return {
        json: out && out.length > 0 ? out[0].json : {},
        all: () => out || []
      };
    };

    const $node = new Proxy(nodeLookup, {
      get(target, prop: string | symbol) {
        if (typeof prop === 'string') {
          return nodeLookup(prop);
        }
        return undefined;
      },
      apply(target, thisArg, argArray) {
        return nodeLookup(argArray[0]);
      }
    });

    // Unescape \" if code was extracted from inside a JSON string
    const cleanCode = code.replace(/\\"/g, '"').replace(/\\'/g, "'");

    try {
      const fn = new Function('$json', '$itemIndex', '$now', '$today', '$env', '$node', `
        try {
          return (${cleanCode});
        } catch (e) {
          return undefined;
        }
      `);
      return fn($json, $itemIndex, $now, $today, $env, $node);
    } catch {
      return undefined;
    }
  }
}
