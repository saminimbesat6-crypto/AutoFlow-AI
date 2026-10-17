import { Router, Request, Response } from 'express';
import { WorkflowRepository } from '../../database/repositories/workflow-repository';
import { WorkflowExecutor } from '../../engine/executor';
import { WebhookManager } from '../../webhooks/manager';
import { SchedulerManager } from '../../scheduler/manager';
import { WorkflowAdapter } from '../../engine/adapter';

export function createWorkflowRouter(
  repo: WorkflowRepository,
  executor: WorkflowExecutor,
  webhookManager: WebhookManager,
  schedulerManager: SchedulerManager
): Router {
  const router = Router();

  // List all workflows
  router.get('/', (req: Request, res: Response) => {
    try {
      const workflows = repo.list();
      res.json({ success: true, data: workflows });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Create new workflow
  router.post('/', (req: Request, res: Response) => {
    try {
      const { name, description, nodes, connections, settings, active } = req.body;
      if (!name) {
        return res.status(400).json({ success: false, error: 'Workflow name is required' });
      }

      const created = repo.create({
        name,
        description,
        nodes: nodes || [],
        connections: connections || [],
        settings: settings || {},
        active: Boolean(active)
      });

      if (created.active) {
        webhookManager.registerWorkflowWebhooks(created);
        schedulerManager.registerWorkflowSchedules(created);
      }

      res.status(201).json({ success: true, data: created });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Get workflow by ID
  router.get('/:id', (req: Request, res: Response) => {
    try {
      const id = String(req.params.id);
      const workflow = repo.getById(id);
      if (!workflow) {
        return res.status(404).json({ success: false, error: 'Workflow not found' });
      }
      res.json({ success: true, data: workflow });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Update workflow
  router.put('/:id', (req: Request, res: Response) => {
    try {
      const id = String(req.params.id);
      const updated = repo.update(id, req.body);
      if (!updated) {
        return res.status(404).json({ success: false, error: 'Workflow not found' });
      }

      webhookManager.registerWorkflowWebhooks(updated);
      schedulerManager.registerWorkflowSchedules(updated);

      res.json({ success: true, data: updated });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Delete workflow
  router.delete('/:id', (req: Request, res: Response) => {
    try {
      const id = String(req.params.id);
      webhookManager.unregisterWorkflowWebhooks(id);
      schedulerManager.unregisterWorkflowSchedules(id);
      repo.delete(id);
      res.json({ success: true, message: 'Workflow deleted' });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Manually execute workflow
  router.post('/:id/execute', async (req: Request, res: Response) => {
    try {
      const id = String(req.params.id);
      const workflow = repo.getById(id);
      if (!workflow) {
        return res.status(404).json({ success: false, error: 'Workflow not found' });
      }

      const { startNodeId, initialData } = req.body;
      const execution = await executor.execute(workflow, {
        mode: 'manual',
        startNodeId,
        initialData
      });

      // Retrieve full execution record with per-node results
      const details = executor.getExecution(execution.id);
      res.json({ success: true, data: details });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Toggle active state
  router.post('/:id/activate', (req: Request, res: Response) => {
    try {
      const id = String(req.params.id);
      const workflow = repo.getById(id);
      if (!workflow) {
        return res.status(404).json({ success: false, error: 'Workflow not found' });
      }

      const updated = repo.update(id, { active: !workflow.active });
      if (updated) {
        if (updated.active) {
          webhookManager.registerWorkflowWebhooks(updated);
          schedulerManager.registerWorkflowSchedules(updated);
        } else {
          webhookManager.unregisterWorkflowWebhooks(updated.id);
          schedulerManager.unregisterWorkflowSchedules(updated.id);
        }
      }
      res.json({ success: true, data: updated });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Import workflow (AutoFlow or n8n format)
  router.post('/import', (req: Request, res: Response) => {
    try {
      const payload = req.body;
      let workflowToCreate: any;

      if (payload.nodes && payload.connections && typeof payload.connections === 'object' && !Array.isArray(payload.connections)) {
        // n8n format
        workflowToCreate = WorkflowAdapter.fromN8n(payload);
      } else {
        // AutoFlow format
        workflowToCreate = payload;
      }

      const created = repo.create({
        name: workflowToCreate.name || 'Imported Workflow',
        description: workflowToCreate.description,
        nodes: workflowToCreate.nodes || [],
        connections: workflowToCreate.connections || [],
        settings: workflowToCreate.settings || {},
        active: false
      });

      res.status(201).json({ success: true, data: created });
    } catch (err: any) {
      res.status(400).json({ success: false, error: `Import failed: ${err.message}` });
    }
  });

  // Export workflow
  router.get('/:id/export', (req: Request, res: Response) => {
    try {
      const id = String(req.params.id);
      const workflow = repo.getById(id);
      if (!workflow) {
        return res.status(404).json({ success: false, error: 'Workflow not found' });
      }

      const format = req.query.format === 'n8n' ? 'n8n' : 'autoflow';
      if (format === 'n8n') {
        const n8nJson = WorkflowAdapter.toN8n(workflow);
        res.setHeader('Content-Disposition', `attachment; filename="${workflow.name}.n8n.json"`);
        res.json(n8nJson);
      } else {
        res.setHeader('Content-Disposition', `attachment; filename="${workflow.name}.autoflow.json"`);
        res.json(workflow);
      }
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  return router;
}
