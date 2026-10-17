import { Router, Request, Response } from 'express';
import { CredentialsManager } from '../../credentials/manager';

export function createCredentialRouter(credentialsManager: CredentialsManager): Router {
  const router = Router();

  // List all credentials (safe metadata only)
  router.get('/', (_req: Request, res: Response) => {
    try {
      const list = credentialsManager.list();
      res.json({ success: true, data: list });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Create credential
  router.post('/', (req: Request, res: Response) => {
    try {
      const { name, type, data } = req.body;
      if (!name || !type || !data) {
        return res.status(400).json({ success: false, error: 'Name, type, and data are required' });
      }

      const created = credentialsManager.create(name, type, data);
      res.status(201).json({ success: true, data: created });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Update credential
  router.put('/:id', (req: Request, res: Response) => {
    try {
      const id = String(req.params.id);
      const { name, data } = req.body;
      const updated = credentialsManager.update(id, name, data);
      if (!updated) {
        return res.status(404).json({ success: false, error: 'Credential not found' });
      }
      res.json({ success: true, data: updated });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Delete credential
  router.delete('/:id', (req: Request, res: Response) => {
    try {
      const id = String(req.params.id);
      credentialsManager.delete(id);
      res.json({ success: true, message: 'Credential deleted' });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  return router;
}
