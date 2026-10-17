const { test, describe, before, after } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const fs = require('node:fs');

// Load compiled modules from dist
const { getDatabase, closeDatabase } = require('../dist/database/connection');
const { runMigrations } = require('../dist/database/migrations');
const { CredentialsManager } = require('../dist/credentials/manager');
const { WorkflowGraph } = require('../dist/engine/graph');
const { ExecutionContext } = require('../dist/engine/context');
const { WorkflowExecutor } = require('../dist/engine/executor');
const { WorkflowAdapter } = require('../dist/engine/adapter');
const { WorkflowRepository } = require('../dist/database/repositories/workflow-repository');

describe('AutoFlow AI Core Test Suite', () => {
  let db;
  let testDbPath;

  before(() => {
    testDbPath = path.join(__dirname, 'test-autoflow.sqlite');
    if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
    db = getDatabase(testDbPath);
    runMigrations(db);
  });

  after(() => {
    closeDatabase();
    if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
  });

  test('1. Credentials Manager: Encrypts and Decrypts at rest', () => {
    const credMgr = new CredentialsManager(db);
    const created = credMgr.create('Test Gemini Key', 'gemini_api_key', {
      apiKey: 'AIzaSySecretTestKey123'
    });

    assert.ok(created.id, 'Credential ID should be generated');
    assert.strictEqual(created.name, 'Test Gemini Key');

    // Verify safe retrieval (secret is not exposed in list)
    const list = credMgr.list();
    const found = list.find((c) => c.id === created.id);
    assert.ok(found);
    assert.strictEqual(found.data, undefined, 'Secret should be hidden in list');

    // Verify decrypted retrieval
    const retrieved = credMgr.get(created.id, true);
    assert.ok(retrieved && retrieved.data);
    assert.strictEqual(retrieved.data.apiKey, 'AIzaSySecretTestKey123');
  });

  test('2. Workflow Graph: Validates DAG and detects cycles', () => {
    // Valid linear workflow
    const validWf = {
      id: 'wf-1',
      name: 'Linear Workflow',
      nodes: [
        { id: 'n1', name: 'Start', type: 'manual-trigger', position: { x: 0, y: 0 }, parameters: {} },
        { id: 'n2', name: 'HTTP', type: 'http-request', position: { x: 100, y: 0 }, parameters: {} },
        { id: 'n3', name: 'Condition', type: 'if-condition', position: { x: 200, y: 0 }, parameters: {} }
      ],
      connections: [
        { source: 'Start', sourceOutput: 0, target: 'HTTP', targetInput: 0 },
        { source: 'HTTP', sourceOutput: 0, target: 'Condition', targetInput: 0 }
      ],
      settings: {},
      active: false,
      createdAt: '',
      updatedAt: ''
    };

    const graph = new WorkflowGraph(validWf);
    const res = graph.validate();
    assert.strictEqual(res.valid, true);
    assert.deepStrictEqual(res.executionOrder, ['n1', 'n2', 'n3']);

    // Cyclic workflow
    const cyclicWf = {
      ...validWf,
      connections: [
        { source: 'Start', sourceOutput: 0, target: 'HTTP', targetInput: 0 },
        { source: 'HTTP', sourceOutput: 0, target: 'Condition', targetInput: 0 },
        { source: 'Condition', sourceOutput: 0, target: 'Start', targetInput: 0 } // cycle!
      ]
    };

    const cyclicGraph = new WorkflowGraph(cyclicWf);
    const cycleRes = cyclicGraph.validate();
    assert.strictEqual(cycleRes.valid, false);
    assert.ok(cycleRes.errors[0].includes('contains a cycle'));
  });

  test('3. Execution Context: Evaluates complex expressions', () => {
    const context = new ExecutionContext();
    const items = [
      { json: { user: 'Alice', score: 95, tags: ['ai', 'agent'] } }
    ];

    const expr1 = '{{ $json.user }}';
    assert.strictEqual(context.evaluateExpression(expr1, items, 0, context), 'Alice');

    const expr2 = '{{ $json.score > 90 ? "Pass" : "Fail" }}';
    assert.strictEqual(context.evaluateExpression(expr2, items, 0, context), 'Pass');

    const expr3 = 'User {{ $json.user }} has score {{ $json.score }}';
    assert.strictEqual(context.evaluateExpression(expr3, items, 0, context), 'User Alice has score 95');
  });

  test('4. Workflow Adapter: Bidirectional n8n compatibility', () => {
    const n8nWorkflow = {
      name: 'Sample n8n Export',
      nodes: [
        { id: 'n8n_1', name: 'Start', type: 'n8n-nodes-base.manualTrigger', position: [100, 200], parameters: {} },
        { id: 'n8n_2', name: 'Fetch', type: 'n8n-nodes-base.httpRequest', position: [300, 200], parameters: { url: 'https://example.com' } }
      ],
      connections: {
        Start: {
          main: [
            [{ node: 'Fetch', type: 'main', index: 0 }]
          ]
        }
      }
    };

    // Convert from n8n format
    const autoFlowWf = WorkflowAdapter.fromN8n(n8nWorkflow);
    assert.strictEqual(autoFlowWf.name, 'Sample n8n Export');
    assert.strictEqual(autoFlowWf.nodes.length, 2);
    assert.strictEqual(autoFlowWf.nodes[0].type, 'manual-trigger');
    assert.strictEqual(autoFlowWf.nodes[1].type, 'http-request');
    assert.strictEqual(autoFlowWf.connections.length, 1);
    assert.strictEqual(autoFlowWf.connections[0].source, 'Start');
    assert.strictEqual(autoFlowWf.connections[0].target, 'Fetch');

    // Convert back to n8n format
    const convertedBack = WorkflowAdapter.toN8n(autoFlowWf);
    assert.ok(convertedBack.connections.Start);
    assert.strictEqual(convertedBack.connections.Start.main[0][0].node, 'Fetch');
  });

  test('5. Execution Engine: Real execution with data passing and branching', async () => {
    const executor = new WorkflowExecutor(db);

    const workflow = {
      id: 'wf-exec-test',
      name: 'Data Passing and Branching Test',
      nodes: [
        {
          id: 'n_start',
          name: 'Start',
          type: 'manual-trigger',
          position: { x: 0, y: 0 },
          parameters: {}
        },
        {
          id: 'n_set',
          name: 'Set Test Data',
          type: 'set-data',
          position: { x: 200, y: 0 },
          parameters: {
            mode: 'replace',
            jsonData: '{\n  "value": 42,\n  "status": "APPROVED"\n}'
          }
        },
        {
          id: 'n_if',
          name: 'Condition Check',
          type: 'if-condition',
          position: { x: 400, y: 0 },
          parameters: {
            value1: '{{ $json.status }}',
            operation: 'equals',
            value2: 'APPROVED'
          }
        },
        {
          id: 'n_code_true',
          name: 'Approved Handler',
          type: 'code',
          position: { x: 600, y: -50 },
          parameters: {
            mode: 'runOnceForAllItems',
            jsCode: 'return [{ json: { outcome: "SUCCESS_APPROVED", original: $input.first().json } }];'
          }
        },
        {
          id: 'n_code_false',
          name: 'Rejected Handler',
          type: 'code',
          position: { x: 600, y: 100 },
          parameters: {
            mode: 'runOnceForAllItems',
            jsCode: 'return [{ json: { outcome: "REJECTED" } }];'
          }
        }
      ],
      connections: [
        { source: 'Start', sourceOutput: 0, target: 'Set Test Data', targetInput: 0 },
        { source: 'Set Test Data', sourceOutput: 0, target: 'Condition Check', targetInput: 0 },
        { source: 'Condition Check', sourceOutput: 0, target: 'Approved Handler', targetInput: 0 }, // True branch
        { source: 'Condition Check', sourceOutput: 1, target: 'Rejected Handler', targetInput: 0 }  // False branch
      ],
      settings: {},
      active: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    const execution = await executor.execute(workflow, { mode: 'manual' });
    assert.strictEqual(execution.status, 'success', `Execution should succeed: ${execution.errorMessage}`);
    assert.ok(execution.duration >= 0);

    // Retrieve saved execution from database
    const details = executor.getExecution(execution.id);
    assert.ok(details);
    assert.strictEqual(details.nodes.length, 4, 'Should execute 4 nodes (Start, Set, IF, Approved Handler). Rejected Handler should be skipped.');

    const approvedNode = details.nodes.find((n) => n.nodeName === 'Approved Handler');
    assert.ok(approvedNode);
    assert.strictEqual(approvedNode.status, 'success');
    assert.strictEqual(approvedNode.outputData[0][0].json.outcome, 'SUCCESS_APPROVED');
    assert.strictEqual(approvedNode.outputData[0][0].json.original.value, 42);

    const rejectedNode = details.nodes.find((n) => n.nodeName === 'Rejected Handler');
    assert.strictEqual(rejectedNode, undefined, 'Rejected branch should not have executed');
  });

  test('6. Real Acceptance Test: Manual Trigger -> HTTP Request -> Condition -> Output', async () => {
    const executor = new WorkflowExecutor(db);

    const acceptanceWorkflow = {
      id: 'wf-acceptance',
      name: 'Acceptance Pipeline (HTTP Request -> Condition)',
      nodes: [
        {
          id: 'start_node',
          name: 'Manual Trigger',
          type: 'manual-trigger',
          position: { x: 50, y: 100 },
          parameters: {}
        },
        {
          id: 'http_node',
          name: 'Fetch Post',
          type: 'http-request',
          position: { x: 250, y: 100 },
          parameters: {
            url: 'https://jsonplaceholder.typicode.com/posts/1',
            method: 'GET'
          }
        },
        {
          id: 'condition_node',
          name: 'Check Response Status',
          type: 'if-condition',
          position: { x: 500, y: 100 },
          parameters: {
            value1: '{{ $json.statusCode }}',
            operation: 'equals',
            value2: '200'
          }
        },
        {
          id: 'output_node',
          name: 'Format Result',
          type: 'set-data',
          position: { x: 750, y: 100 },
          parameters: {
            mode: 'replace',
            jsonData: '{\n  "status": "PASSED",\n  "postTitle": "{{ $node[\"Fetch Post\"].json.data.title }}"\n}'
          }
        }
      ],
      connections: [
        { source: 'Manual Trigger', sourceOutput: 0, target: 'Fetch Post', targetInput: 0 },
        { source: 'Fetch Post', sourceOutput: 0, target: 'Check Response Status', targetInput: 0 },
        { source: 'Check Response Status', sourceOutput: 0, target: 'Format Result', targetInput: 0 }
      ],
      settings: {},
      active: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    const result = await executor.execute(acceptanceWorkflow, { mode: 'manual' });
    assert.strictEqual(result.status, 'success', `Execution should succeed: ${result.errorMessage}`);

    const details = executor.getExecution(result.id);
    assert.ok(details);

    const httpNode = details.nodes.find((n) => n.nodeName === 'Fetch Post');
    assert.ok(httpNode && httpNode.status === 'success');
    assert.strictEqual(httpNode.outputData[0][0].json.statusCode, 200);
    assert.ok(httpNode.outputData[0][0].json.data.title, 'Should have received real post title from external API');

    const formatNode = details.nodes.find((n) => n.nodeName === 'Format Result');
    assert.ok(formatNode && formatNode.status === 'success');
    assert.strictEqual(formatNode.outputData[0][0].json.status, 'PASSED');
    assert.ok(formatNode.outputData[0][0].json.postTitle.length > 0);
  });

  test('7. Gemini Node: Displays meaningful error when key is missing or invalid', async () => {
    const executor = new WorkflowExecutor(db);

    const geminiWorkflow = {
      id: 'wf-gemini-error-test',
      name: 'Gemini Missing Key Test',
      nodes: [
        { id: 'g_start', name: 'Start', type: 'manual-trigger', position: { x: 0, y: 0 }, parameters: {} },
        {
          id: 'g_node',
          name: 'Gemini',
          type: 'gemini',
          position: { x: 200, y: 0 },
          parameters: { prompt: 'Hello world' }
        }
      ],
      connections: [
        { source: 'Start', sourceOutput: 0, target: 'Gemini', targetInput: 0 }
      ],
      settings: {},
      active: false,
      createdAt: '',
      updatedAt: ''
    };

    // Run without configured key
    const res = await executor.execute(geminiWorkflow, { mode: 'manual' });
    assert.strictEqual(res.status, 'error');
    assert.ok(
      res.errorMessage.includes('Gemini API key is not configured'),
      `Expected missing key error, got: ${res.errorMessage}`
    );
  });
});
