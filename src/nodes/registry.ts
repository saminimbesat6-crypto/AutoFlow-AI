import { BaseNode, INodeDefinition } from './base';
import { ManualTriggerNode } from './triggers/manual-trigger';
import { WebhookTriggerNode } from './triggers/webhook-trigger';
import { ScheduleTriggerNode } from './triggers/schedule-trigger';
import { HttpRequestNode } from './core/http-request';
import { IfConditionNode } from './core/if-condition';
import { SetDataNode } from './core/set-data';
import { MergeNode } from './core/merge';
import { CodeNode } from './core/code';
import { GeminiNode } from './ai/gemini-node';
import { AiAgentNode } from './ai/ai-agent-node';

export class NodeRegistry {
  private static instance: NodeRegistry;
  private nodes: Map<string, BaseNode> = new Map();

  private constructor() {
    this.registerDefaults();
  }

  static getInstance(): NodeRegistry {
    if (!NodeRegistry.instance) {
      NodeRegistry.instance = new NodeRegistry();
    }
    return NodeRegistry.instance;
  }

  private registerDefaults(): void {
    // Triggers
    this.register(new ManualTriggerNode());
    this.register(new WebhookTriggerNode());
    this.register(new ScheduleTriggerNode());

    // Core Actions & Logic
    this.register(new HttpRequestNode());
    this.register(new IfConditionNode());
    this.register(new SetDataNode());
    this.register(new MergeNode());
    this.register(new CodeNode());

    // AI & Gemini
    this.register(new GeminiNode());
    this.register(new AiAgentNode());
  }

  register(node: BaseNode): void {
    this.nodes.set(node.type, node);
  }

  get(type: string): BaseNode | undefined {
    return this.nodes.get(type);
  }

  list(): Array<Omit<INodeDefinition, 'execute'>> {
    return Array.from(this.nodes.values()).map((node) => ({
      type: node.type,
      name: node.name,
      description: node.description,
      category: node.category,
      icon: node.icon,
      color: node.color,
      inputs: node.inputs,
      outputs: node.outputs,
      properties: node.properties
    }));
  }
}
