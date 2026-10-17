const { test, describe, before, after } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const fs = require('node:fs');

const { createApp } = require('../dist/server');
const { closeDatabase } = require('../dist/database/connection');

describe('AutoFlow AI HTTP API Integration Tests', () => {
  let server;
  let baseUrl;
  let testDbFile;

  before(async () => {
    testDbFile = path.join(__dirname, 'test-server.sqlite');
    if (fs.existsSync(testDbFile)) fs.unlinkSync(testDbFile);
    process.env.DATABASE_PATH = testDbFile;

    const { app } = createApp();
    await new Promise((resolve) => {
      server = app.listen(0, () => {
        const port = server.address().port;
        baseUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    });
  });

  after(async () => {
    if (server) await new Promise((r) => server.close(r));
    closeDatabase();
    if (fs.existsSync(testDbFile)) fs.unlinkSync(testDbFile);
  });

  test('GET /api/health returns system status', async () => {
    const res = await fetch(`${baseUrl}/api/health`);
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.strictEqual(body.status, 'ok');
    assert.strictEqual(body.service, 'AutoFlow AI');
  });

  test('GET /api/node-types returns registered palette', async () => {
    const res = await fetch(`${baseUrl}/api/node-types`);
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.strictEqual(body.success, true);
    assert.ok(body.data.length >= 7);

    const types = body.data.map((n) => n.type);
    assert.ok(types.includes('manual-trigger'));
    assert.ok(types.includes('webhook-trigger'));
    assert.ok(types.includes('http-request'));
    assert.ok(types.includes('if-condition'));
    assert.ok(types.includes('set-data'));
    assert.ok(types.includes('gemini'));
    assert.ok(types.includes('ai-agent'));
  });

  test('Full Workflow Lifecycle via API: Create, Execute, Export, Webhook', async () => {
    // 1. Create Workflow
    const createRes = await fetch(`${baseUrl}/api/workflows`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'API Webhook Test Workflow',
        nodes: [
          {
            id: 'wh_node',
            name: 'Webhook Trigger',
            type: 'webhook-trigger',
            position: { x: 50, y: 50 },
            parameters: {
              path: 'order-processed',
              httpMethod: 'POST'
            }
          },
          {
            id: 'set_node',
            name: 'Extract Details',
            type: 'set-data',
            position: { x: 300, y: 50 },
            parameters: {
              mode: 'replace',
              jsonData: '{\n  "orderId": "{{ $json.body.orderId }}",\n  "status": "CONFIRMED"\n}'
            }
          }
        ],
        connections: [
          { source: 'Webhook Trigger', sourceOutput: 0, target: 'Extract Details', targetInput: 0 }
        ],
        active: true
      })
    });

    assert.strictEqual(createRes.status, 201);
    const createdWf = (await createRes.json()).data;
    assert.ok(createdWf.id);

    // 2. Trigger via Webhook Endpoint
    const webhookRes = await fetch(`${baseUrl}/webhook/order-processed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderId: 'ORD-98765', customer: 'John Doe' })
    });

    assert.strictEqual(webhookRes.status, 200);
    const webhookData = await webhookRes.json();
    assert.strictEqual(webhookData.success, true);
    assert.strictEqual(webhookData.data.status, 'success');

    // 3. Verify Execution History
    const execsRes = await fetch(`${baseUrl}/api/executions?workflowId=${createdWf.id}`);
    assert.strictEqual(execsRes.status, 200);
    const execs = (await execsRes.json()).data;
    assert.ok(execs.length >= 1);
    assert.strictEqual(execs[0].mode, 'webhook');
    assert.strictEqual(execs[0].status, 'success');

    // 4. Export as n8n JSON
    const exportRes = await fetch(`${baseUrl}/api/workflows/${createdWf.id}/export?format=n8n`);
    assert.strictEqual(exportRes.status, 200);
    const n8nJson = await exportRes.json();
    assert.strictEqual(n8nJson.name, 'API Webhook Test Workflow');
    assert.ok(n8nJson.connections['Webhook Trigger']);
  });
});
