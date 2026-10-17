import cron, { ScheduledTask } from 'node-cron';
import { DatabaseSync } from 'node:sqlite';
import { getDatabase } from '../database/connection';
import { WorkflowRepository } from '../database/repositories/workflow-repository';
import { WorkflowExecutor } from '../engine/executor';
import { Workflow } from '../types/workflow';

export class SchedulerManager {
  private db: DatabaseSync;
  private workflowRepo: WorkflowRepository;
  private executor: WorkflowExecutor;
  private activeJobs: Map<string, ScheduledTask[]> = new Map(); // workflowId -> jobs

  constructor(db?: DatabaseSync) {
    this.db = db || getDatabase();
    this.workflowRepo = new WorkflowRepository(this.db);
    this.executor = new WorkflowExecutor(this.db);
  }

  registerWorkflowSchedules(workflow: Workflow): void {
    this.unregisterWorkflowSchedules(workflow.id);

    if (!workflow.active) return;

    const jobs: ScheduledTask[] = [];

    for (const node of workflow.nodes) {
      if (node.type === 'schedule-trigger' && !node.disabled) {
        let cronExpr = node.parameters?.rule || '0 * * * *';
        if (cronExpr === 'custom') {
          cronExpr = node.parameters?.customCron || '0 * * * *';
        }

        if (cron.validate(cronExpr)) {
          const task = cron.schedule(cronExpr, async () => {
            console.log(`[Scheduler] Triggering workflow "${workflow.name}" (${workflow.id}) via cron: ${cronExpr}`);
            try {
              await this.executor.execute(workflow, {
                mode: 'schedule',
                startNodeId: node.id
              });
            } catch (err) {
              console.error(`[Scheduler] Execution error in workflow ${workflow.id}:`, err);
            }
          });
          jobs.push(task);
        } else {
          console.warn(`[Scheduler] Invalid cron expression "${cronExpr}" for node ${node.id}`);
        }
      }
    }

    if (jobs.length > 0) {
      this.activeJobs.set(workflow.id, jobs);
    }
  }

  unregisterWorkflowSchedules(workflowId: string): void {
    const existing = this.activeJobs.get(workflowId);
    if (existing) {
      for (const job of existing) {
        job.stop();
      }
      this.activeJobs.delete(workflowId);
    }
  }

  syncAllActive(): void {
    // Clear all existing
    for (const [id, jobs] of this.activeJobs.entries()) {
      for (const job of jobs) job.stop();
    }
    this.activeJobs.clear();

    const active = this.workflowRepo.getActiveWorkflows();
    for (const wf of active) {
      this.registerWorkflowSchedules(wf);
    }
  }
}
