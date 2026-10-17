import { DatabaseSync } from 'node:sqlite';
import { v4 as uuidv4 } from 'uuid';
import { getDatabase } from '../database/connection';
import { WorkflowExecutor } from '../engine/executor';
import { WorkflowRepository } from '../database/repositories/workflow-repository';
import { DataItem, Workflow } from '../types/workflow';

export interface WebhookRegistration {
  id: string;
  workflowId: string;
  nodeId: string;
  path: string;
  method: string;
}

export class WebhookManager {
  private db: DatabaseSync;
  private executor: WorkflowExecutor;
  private workflowRepo: WorkflowRepository;

  constructor(db?: DatabaseSync) {
    this.db = db || getDatabase();
    this.executor = new WorkflowExecutor(this.db);
    this.workflowRepo = new WorkflowRepository(this.db);
  }

  registerWorkflowWebhooks(workflow: Workflow): void {
    // Remove existing registrations for this workflow
    this.unregisterWorkflowWebhooks(workflow.id);

    if (!workflow.active) return;

    for (const node of workflow.nodes) {
      if (node.type === 'webhook-trigger' && !node.disabled) {
        const path = node.parameters?.path || `webhook-${node.id.slice(0, 8)}`;
        const method = (node.parameters?.httpMethod || 'POST').toUpperCase();
        const id = uuidv4();

        try {
          const stmt = this.db.prepare(`
            INSERT OR REPLACE INTO webhook_registrations (id, workflow_id, node_id, path, method, created_at)
            VALUES (?, ?, ?, ?, ?, ?)
          `);
          stmt.run(id, workflow.id, node.id, path, method, new Date().toISOString());
        } catch (err) {
          console.error(`Failed to register webhook for workflow ${workflow.id}:`, err);
        }
      }
    }
  }

  unregisterWorkflowWebhooks(workflowId: string): void {
    const stmt = this.db.prepare('DELETE FROM webhook_registrations WHERE workflow_id = ?');
    stmt.run(workflowId);
  }

  async handleWebhook(
    path: string,
    method: string,
    reqData: { body: any; headers: any; query: any; params: any }
  ): Promise<{ success: boolean; data?: any; error?: string; statusCode: number }> {
    const stmt = this.db.prepare('SELECT * FROM webhook_registrations WHERE path = ?');
    const row = stmt.get(path) as any;

    if (!row) {
      return { success: false, error: `No active webhook found at path "/webhook/${path}"`, statusCode: 404 };
    }

    if (row.method !== 'ANY' && row.method !== method.toUpperCase()) {
      return { success: false, error: `Method ${method} not allowed. Expected ${row.method}`, statusCode: 405 };
    }

    const workflow = this.workflowRepo.getById(row.workflow_id);
    if (!workflow || !workflow.active) {
      return { success: false, error: 'Workflow is not active', statusCode: 400 };
    }

    const triggerItem: DataItem = {
      json: {
        body: reqData.body,
        headers: reqData.headers,
        query: reqData.query,
        params: reqData.params,
        timestamp: new Date().toISOString()
      }
    };

    try {
      const execution = await this.executor.execute(workflow, {
        mode: 'webhook',
        startNodeId: row.node_id,
        initialData: [triggerItem]
      });

      return {
        success: execution.status === 'success',
        data: execution,
        statusCode: execution.status === 'success' ? 200 : 500,
        error: execution.errorMessage
      };
    } catch (err: any) {
      return { success: false, error: err.message, statusCode: 500 };
    }
  }

  syncAllActive(): void {
    const active = this.workflowRepo.getActiveWorkflows();
    for (const wf of active) {
      this.registerWorkflowWebhooks(wf);
    }
  }
}
