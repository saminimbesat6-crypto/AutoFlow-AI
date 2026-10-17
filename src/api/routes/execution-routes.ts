import { Router, Request, Response } from 'express';
import { DatabaseSync } from 'node:sqlite';
import { WorkflowExecutor } from '../../engine/executor';

export function createExecutionRouter(db: DatabaseSync, executor: WorkflowExecutor): Router {
  const router = Router();

  // List executions
  router.get('/', (req: Request, res: Response) => {
    try {
      const workflowId = req.query.workflowId as string | undefined;
      const limit = parseInt(req.query.limit as string) || 50;

      let sql = 'SELECT * FROM executions';
      const params: any[] = [];

      if (workflowId) {
        sql += ' WHERE workflow_id = ?';
        params.push(workflowId);
      }

      sql += ' ORDER BY started_at DESC LIMIT ?';
      params.push(limit);

      const stmt = db.prepare(sql);
      const rows = stmt.all(...params) as any[];

      const executions = rows.map((r) => ({
        id: r.id,
        workflowId: r.workflow_id,
        workflowName: r.workflow_name,
        mode: r.mode,
        status: r.status,
        startedAt: r.started_at,
        finishedAt: r.finished_at,
        duration: r.duration,
        errorMessage: r.error_message,
        data: r.data ? JSON.parse(r.data) : undefined
      }));

      res.json({ success: true, data: executions });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Get execution by ID with all node results
  router.get('/:id', (req: Request, res: Response) => {
    try {
      const id = String(req.params.id);
      const details = executor.getExecution(id);
      if (!details) {
        return res.status(404).json({ success: false, error: 'Execution not found' });
      }
      res.json({ success: true, data: details });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  return router;
}
