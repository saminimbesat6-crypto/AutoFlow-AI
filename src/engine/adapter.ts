import { v4 as uuidv4 } from 'uuid';
import { Connection, Workflow, WorkflowNode } from '../types/workflow';

// Mapping between n8n node type names and AutoFlow node types
const N8N_TO_AUTOFLOW_MAP: Record<string, string> = {
  'n8n-nodes-base.manualTrigger': 'manual-trigger',
  'n8n-nodes-base.webhook': 'webhook-trigger',
  'n8n-nodes-base.scheduleTrigger': 'schedule-trigger',
  'n8n-nodes-base.cron': 'schedule-trigger',
  'n8n-nodes-base.httpRequest': 'http-request',
  'n8n-nodes-base.if': 'if-condition',
  'n8n-nodes-base.switch': 'if-condition',
  'n8n-nodes-base.set': 'set-data',
  'n8n-nodes-base.merge': 'merge',
  'n8n-nodes-base.code': 'code',
  'n8n-nodes-base.function': 'code',
  '@n8n/n8n-nodes-langchain.agent': 'ai-agent',
  '@n8n/n8n-nodes-langchain.openAi': 'gemini'
};

const AUTOFLOW_TO_N8N_MAP: Record<string, string> = {
  'manual-trigger': 'n8n-nodes-base.manualTrigger',
  'webhook-trigger': 'n8n-nodes-base.webhook',
  'schedule-trigger': 'n8n-nodes-base.scheduleTrigger',
  'http-request': 'n8n-nodes-base.httpRequest',
  'if-condition': 'n8n-nodes-base.if',
  'set-data': 'n8n-nodes-base.set',
  'merge': 'n8n-nodes-base.merge',
  'code': 'n8n-nodes-base.code',
  'gemini': 'n8n-nodes-base.httpRequest',
  'ai-agent': '@n8n/n8n-nodes-langchain.agent'
};

export class WorkflowAdapter {
  static fromN8n(n8nJson: Record<string, any>): Workflow {
    const rawNodes = n8nJson.nodes || [];
    const rawConnections = n8nJson.connections || {};

    const nodes: WorkflowNode[] = rawNodes.map((n: any) => {
      const mappedType = N8N_TO_AUTOFLOW_MAP[n.type] || n.type;
      let pos = { x: 100, y: 100 };
      if (Array.isArray(n.position) && n.position.length >= 2) {
        pos = { x: n.position[0], y: n.position[1] };
      } else if (n.position && typeof n.position === 'object') {
        pos = { x: n.position.x || 100, y: n.position.y || 100 };
      }

      return {
        id: n.id || uuidv4(),
        name: n.name || 'Node',
        type: mappedType,
        position: pos,
        parameters: n.parameters || {},
        credentials: n.credentials || {},
        disabled: Boolean(n.disabled),
        notes: n.notes || '',
        continueOnFail: Boolean(n.continueOnFail),
        retryOnFail: Boolean(n.retryOnFail),
        maxTries: n.maxTries,
        waitBetweenTries: n.waitBetweenTries
      };
    });

    // Unwind n8n connections structure
    const connections: Connection[] = [];
    for (const [sourceName, connMap] of Object.entries(rawConnections as Record<string, any>)) {
      if (!connMap || typeof connMap !== 'object') continue;

      for (const [connType, outputs] of Object.entries(connMap)) {
        if (!Array.isArray(outputs)) continue;

        outputs.forEach((destinations, outputIdx) => {
          if (!Array.isArray(destinations)) return;

          for (const dest of destinations) {
            if (dest && dest.node) {
              connections.push({
                source: sourceName,
                sourceOutput: outputIdx,
                target: dest.node,
                targetInput: dest.index || 0,
                type: connType === 'main' ? 'main' : 'main'
              });
            }
          }
        });
      }
    }

    return {
      id: n8nJson.id || uuidv4(),
      name: n8nJson.name || 'Imported Workflow',
      description: n8nJson.description || 'Imported from n8n JSON',
      nodes,
      connections,
      settings: n8nJson.settings || {},
      active: Boolean(n8nJson.active),
      createdAt: n8nJson.createdAt || new Date().toISOString(),
      updatedAt: n8nJson.updatedAt || new Date().toISOString()
    };
  }

  static toN8n(workflow: Workflow): Record<string, any> {
    const nodes = workflow.nodes.map((node) => ({
      id: node.id,
      name: node.name,
      type: AUTOFLOW_TO_N8N_MAP[node.type] || node.type,
      typeVersion: 1,
      position: [node.position.x, node.position.y],
      parameters: node.parameters,
      credentials: node.credentials,
      disabled: node.disabled,
      notes: node.notes,
      continueOnFail: node.continueOnFail,
      retryOnFail: node.retryOnFail,
      maxTries: node.maxTries,
      waitBetweenTries: node.waitBetweenTries
    }));

    // Convert connections list to n8n format
    const connections: Record<string, any> = {};

    for (const conn of workflow.connections) {
      if (!connections[conn.source]) {
        connections[conn.source] = { main: [] };
      }

      const mainOutputs = connections[conn.source].main;
      while (mainOutputs.length <= conn.sourceOutput) {
        mainOutputs.push([]);
      }

      mainOutputs[conn.sourceOutput].push({
        node: conn.target,
        type: 'main',
        index: conn.targetInput
      });
    }

    return {
      name: workflow.name,
      nodes,
      connections,
      settings: workflow.settings,
      active: workflow.active,
      meta: {
        templateCredsSetupCompleted: true,
        instanceId: 'autoflow-ai-export'
      }
    };
  }
}
