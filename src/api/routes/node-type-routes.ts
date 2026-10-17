import { Router, Request, Response } from 'express';
import { NodeRegistry } from '../../nodes/registry';

export function createNodeTypeRouter(): Router {
  const router = Router();
  const registry = NodeRegistry.getInstance();

  router.get('/', (_req: Request, res: Response) => {
    try {
      const nodeTypes = registry.list();
      res.json({ success: true, data: nodeTypes });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  return router;
}
