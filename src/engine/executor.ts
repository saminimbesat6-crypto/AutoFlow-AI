import { DatabaseSync } from 'node:sqlite';
import { v4 as uuidv4 } from 'uuid';
import { getDatabase } from '../database/connection';
import {
  DataItem,
  ExecutionMode,
  ExecutionRecord,
  NodeExecutionRecord,
  NodeOutput,
  Workflow,
  WorkflowNode
} from '../types/workflow';
import { ExecutionContext } from './context';
import { WorkflowGraph } from './graph';
import { NodeRegistry } from '../nodes/registry';
import { CredentialsManager } from '../credentials/manager';

export interface ExecuteOptions {
  mode?: ExecutionMode;
  startNodeId?: string;
  initialData?: DataItem[];
  saveExecution?: boolean;
}

export class WorkflowExecutor {
  private db: DatabaseSync;
  private nodeRegistry: NodeRegistry;
  private credentialsManager: CredentialsManager;

  constructor(db?: DatabaseSync) {
    this.db = db || getDatabase();
    this.nodeRegistry = NodeRegistry.getInstance();
    this.credentialsManager = new CredentialsManager(this.db);
  }

  async execute(workflow: Workflow, options: ExecuteOptions = {}): Promise<ExecutionRecord> {
    const executionId = uuidv4();
    const mode = options.mode || 'manual';
    const startedAt = new Date().toISOString();
    const startTimeMs = Date.now();
    const saveExecution = options.saveExecution !== false;

    // Build and validate graph
    const graph = new WorkflowGraph(workflow);
    const validation = graph.validate();

    if (!validation.valid) {
      const errorMsg = `Workflow validation failed: ${validation.errors.join('; ')}`;
      const failedRecord: ExecutionRecord = {
        id: executionId,
        workflowId: workflow.id,
        workflowName: workflow.name,
        mode,
        status: 'error',
        startedAt,
        finishedAt: new Date().toISOString(),
        duration: Date.now() - startTimeMs,
        errorMessage: errorMsg,
        data: { validationErrors: validation.errors }
      };

      if (saveExecution) {
        this.saveExecutionRecord(failedRecord, []);
      }
      return failedRecord;
    }

    const context = new ExecutionContext(this.credentialsManager);
    const nodeRecords: NodeExecutionRecord[] = [];
    const executedNodeIds = new Set<string>();
    const nodeInputsMap = new Map<string, DataItem[]>();

    // Determine initial trigger / root nodes
    const rootNodes = graph.findTriggerNodes();
    let startNodes: WorkflowNode[] = [];

    if (options.startNodeId) {
      const specific = graph.getNode(options.startNodeId);
      if (specific) startNodes = [specific];
    }

    if (startNodes.length === 0) {
      startNodes = rootNodes.length > 0 ? rootNodes : [workflow.nodes[0]];
    }

    // Seed initial data for start nodes
    for (const startNode of startNodes) {
      if (options.initialData && options.initialData.length > 0) {
        nodeInputsMap.set(startNode.id, options.initialData);
      } else {
        nodeInputsMap.set(startNode.id, []);
      }
    }

    let overallStatus: 'success' | 'error' = 'success';
    let fatalError: string | undefined = undefined;

    // Execute in topological order
    for (const nodeId of validation.executionOrder) {
      const node = graph.getNode(nodeId);
      if (!node || node.disabled) continue;

      // Check if this node has input data ready (from start or from predecessor output)
      const inputItems = nodeInputsMap.get(node.id);

      // If not a start node and received no input items, skip this node (branch was not taken)
      const isStartNode = startNodes.some((s) => s.id === node.id);
      if (!isStartNode && inputItems === undefined) {
        continue;
      }

      const currentInput = inputItems || [];
      const nodeRecordId = uuidv4();
      const nodeStartedAt = new Date().toISOString();
      const nodeStartMs = Date.now();

      const nodeDef = this.nodeRegistry.get(node.type);
      if (!nodeDef) {
        const errMsg = `Unknown node type: "${node.type}". It is not registered in AutoFlow.`;
        const nodeRecord: NodeExecutionRecord = {
          id: nodeRecordId,
          executionId,
          nodeId: node.id,
          nodeName: node.name,
          nodeType: node.type,
          status: 'error',
          inputData: currentInput,
          error: errMsg,
          startedAt: nodeStartedAt,
          finishedAt: new Date().toISOString(),
          duration: Date.now() - nodeStartMs
        };
        nodeRecords.push(nodeRecord);

        if (!node.continueOnFail) {
          overallStatus = 'error';
          fatalError = errMsg;
          break;
        }
        continue;
      }

      // Execute node with retry logic if configured
      let output: NodeOutput | null = null;
      let nodeError: string | null = null;
      const maxTries = node.retryOnFail ? (node.maxTries || 3) : 1;
      const waitMs = (node.waitBetweenTries || 1) * 1000;

      for (let attempt = 1; attempt <= maxTries; attempt++) {
        try {
          const nodeContext = context.createNodeContext(node, currentInput, 0);
          output = await nodeDef.execute(nodeContext);
          nodeError = null;
          break;
        } catch (err: any) {
          nodeError = err.message || String(err);
          if (attempt < maxTries) {
            await new Promise((r) => setTimeout(r, waitMs));
          }
        }
      }

      const nodeDuration = Date.now() - nodeStartMs;
      const nodeFinishedAt = new Date().toISOString();

      if (nodeError) {
        const nodeRecord: NodeExecutionRecord = {
          id: nodeRecordId,
          executionId,
          nodeId: node.id,
          nodeName: node.name,
          nodeType: node.type,
          status: 'error',
          inputData: currentInput,
          error: nodeError,
          startedAt: nodeStartedAt,
          finishedAt: nodeFinishedAt,
          duration: nodeDuration
        };
        nodeRecords.push(nodeRecord);

        if (!node.continueOnFail) {
          overallStatus = 'error';
          fatalError = `Node "${node.name}" failed: ${nodeError}`;
          break;
        }
      } else if (output) {
        context.setNodeOutput(node.name, output);
        context.setNodeOutput(node.id, output);

        const nodeRecord: NodeExecutionRecord = {
          id: nodeRecordId,
          executionId,
          nodeId: node.id,
          nodeName: node.name,
          nodeType: node.type,
          status: 'success',
          inputData: currentInput,
          outputData: output,
          startedAt: nodeStartedAt,
          finishedAt: nodeFinishedAt,
          duration: nodeDuration
        };
        nodeRecords.push(nodeRecord);
        executedNodeIds.add(node.id);

        // Forward outputs to downstream connected nodes
        const edges = graph.getSuccessors(node.id);
        for (const edge of edges) {
          const outIndex = edge.sourceOutput;
          const outputDataForPort = output[outIndex] || [];

          if (outputDataForPort.length > 0) {
            const existing = nodeInputsMap.get(edge.target) || [];
            nodeInputsMap.set(edge.target, [...existing, ...outputDataForPort]);
          }
        }
      }
    }

    const duration = Date.now() - startTimeMs;
    const finishedAt = new Date().toISOString();

    const record: ExecutionRecord = {
      id: executionId,
      workflowId: workflow.id,
      workflowName: workflow.name,
      mode,
      status: overallStatus,
      startedAt,
      finishedAt,
      duration,
      errorMessage: fatalError,
      data: {
        nodeCount: workflow.nodes.length,
        executedNodes: Array.from(executedNodeIds),
        nodeResults: nodeRecords.map((nr) => ({
          nodeId: nr.nodeId,
          nodeName: nr.nodeName,
          status: nr.status,
          duration: nr.duration,
          error: nr.error
        }))
      }
    };

    if (saveExecution) {
      this.saveExecutionRecord(record, nodeRecords);
    }

    return record;
  }

  private saveExecutionRecord(exec: ExecutionRecord, nodes: NodeExecutionRecord[]): void {
    // Ensure workflow row exists to satisfy foreign key constraint
    const checkWf = this.db.prepare('SELECT id FROM workflows WHERE id = ?').get(exec.workflowId);
    if (!checkWf) {
      const now = new Date().toISOString();
      const insertWf = this.db.prepare(`
        INSERT OR IGNORE INTO workflows (id, name, description, nodes, connections, settings, active, created_at, updated_at)
        VALUES (?, ?, '', '[]', '[]', '{}', 0, ?, ?)
      `);
      insertWf.run(exec.workflowId, exec.workflowName, now, now);
    }

    const execStmt = this.db.prepare(`
      INSERT INTO executions (
        id, workflow_id, workflow_name, mode, status, started_at, finished_at, duration, error_message, data
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    execStmt.run(
      exec.id,
      exec.workflowId,
      exec.workflowName,
      exec.mode,
      exec.status,
      exec.startedAt,
      exec.finishedAt || null,
      exec.duration || null,
      exec.errorMessage || null,
      exec.data ? JSON.stringify(exec.data) : null
    );

    const nodeStmt = this.db.prepare(`
      INSERT INTO execution_nodes (
        id, execution_id, node_id, node_name, node_type, status, input_data, output_data, error, started_at, finished_at, duration
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const node of nodes) {
      nodeStmt.run(
        node.id,
        node.executionId,
        node.nodeId,
        node.nodeName,
        node.nodeType,
        node.status,
        node.inputData ? JSON.stringify(node.inputData) : null,
        node.outputData ? JSON.stringify(node.outputData) : null,
        node.error || null,
        node.startedAt || null,
        node.finishedAt || null,
        node.duration || null
      );
    }
  }

  getExecution(executionId: string): { execution: ExecutionRecord; nodes: NodeExecutionRecord[] } | null {
    const execStmt = this.db.prepare('SELECT * FROM executions WHERE id = ?');
    const row = execStmt.get(executionId) as any;
    if (!row) return null;

    const nodesStmt = this.db.prepare('SELECT * FROM execution_nodes WHERE execution_id = ? ORDER BY started_at ASC');
    const nodeRows = nodesStmt.all(executionId) as any[];

    const execution: ExecutionRecord = {
      id: row.id,
      workflowId: row.workflow_id,
      workflowName: row.workflow_name,
      mode: row.mode,
      status: row.status,
      startedAt: row.started_at,
      finishedAt: row.finished_at,
      duration: row.duration,
      errorMessage: row.error_message,
      data: row.data ? JSON.parse(row.data) : undefined
    };

    const nodes: NodeExecutionRecord[] = nodeRows.map((nr) => ({
      id: nr.id,
      executionId: nr.execution_id,
      nodeId: nr.node_id,
      nodeName: nr.node_name,
      nodeType: nr.node_type,
      status: nr.status,
      inputData: nr.input_data ? JSON.parse(nr.input_data) : undefined,
      outputData: nr.output_data ? JSON.parse(nr.output_data) : undefined,
      error: nr.error,
      startedAt: nr.started_at,
      finishedAt: nr.finished_at,
      duration: nr.duration
    }));

    return { execution, nodes };
  }
}
