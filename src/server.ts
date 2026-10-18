import * as path from 'node:path';
import dotenv from 'dotenv';
dotenv.config();

import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';

import { getDatabase, closeDatabase } from './database/connection';
import { runMigrations } from './database/migrations';
import { WorkflowRepository } from './database/repositories/workflow-repository';
import { WorkflowExecutor } from './engine/executor';
import { WebhookManager } from './webhooks/manager';
import { SchedulerManager } from './scheduler/manager';
import { CredentialsManager } from './credentials/manager';

import { createWorkflowRouter } from './api/routes/workflow-routes';
import { createExecutionRouter } from './api/routes/execution-routes';
import { createCredentialRouter } from './api/routes/credential-routes';
import { createNodeTypeRouter } from './api/routes/node-type-routes';
import { createAiAssistantRouter } from './api/routes/ai-assistant-routes';

export function createApp() {
  const app = express();

  // Basic Middleware
  app.use(cors());
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // Initialize DB & Services
  const db = getDatabase();
  runMigrations(db);

  const workflowRepo = new WorkflowRepository(db);
  const executor = new WorkflowExecutor(db);
  const webhookManager = new WebhookManager(db);
  const schedulerManager = new SchedulerManager(db);
  const credentialsManager = new CredentialsManager(db);

  // Sync active webhooks & schedules
  webhookManager.syncAllActive();
  schedulerManager.syncAllActive();

  // Health check
  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      service: 'AutoFlow AI',
      version: '1.0.0',
      timestamp: new Date().toISOString()
    });
  });

  // Mount API Routers
  app.use('/api/workflows', createWorkflowRouter(workflowRepo, executor, webhookManager, schedulerManager));
  app.use('/api/executions', createExecutionRouter(db, executor));
  app.use('/api/credentials', createCredentialRouter(credentialsManager));
  app.use('/api/node-types', createNodeTypeRouter());
  app.use('/api/ai/assistant', createAiAssistantRouter(credentialsManager));

  // Webhook Receiver Endpoint (supports all HTTP methods)
  app.all('/webhook/:path(*)', async (req: Request, res: Response) => {
    const webhookPath = String(req.params.path || '');
    const result = await webhookManager.handleWebhook(webhookPath, req.method, {
      body: req.body,
      headers: req.headers,
      query: req.query,
      params: req.params
    });

    res.status(result.statusCode).json(result);
  });

  // Serve static UI assets
  const publicDir = path.join(__dirname, '..', 'public');
  app.use(express.static(publicDir));

  // SPA fallback
  app.get('*', (req: Request, res: Response, next: NextFunction) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/webhook')) {
      return next();
    }
    res.sendFile(path.join(publicDir, 'index.html'));
  });

  // Error handling middleware
  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    console.error('[Server Error]', err);
    res.status(500).json({
      success: false,
      error: err.message || 'Internal Server Error'
    });
  });

  return { app, db, workflowRepo, executor, webhookManager, schedulerManager, credentialsManager };
}

// Start server if run directly
if (require.main === module) {
  const port = process.env.PORT || 3456;
  const { app } = createApp();

  const server = app.listen(port, () => {
    console.log(`\n========================================================`);
    console.log(`🚀 AutoFlow AI Server running at http://localhost:${port}`);
    console.log(`📡 Webhook ingress listening at http://localhost:${port}/webhook/:path`);
    console.log(`⚡ Gemini AI integration ready`);
    console.log(`========================================================\n`);
  });

  const cleanup = () => {
    console.log('Shutting down AutoFlow AI server...');
    server.close(() => {
      closeDatabase();
      process.exit(0);
    });
  };

  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);
}
