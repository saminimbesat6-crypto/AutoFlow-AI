import { BaseNode } from '../base';
import { DataItem, NodeOutput, PortDefinition, PropertyDefinition } from '../../types/workflow';
import { NodeExecutionContext } from '../../engine/context';

export class WebhookTriggerNode extends BaseNode {
  type = 'webhook-trigger';
  name = 'Webhook';
  description = 'Triggers workflow via incoming HTTP request';
  category = 'trigger' as const;
  icon = 'globe';
  color = '#22c55e';

  inputs: PortDefinition[] = [];
  outputs: PortDefinition[] = [
    { name: 'main', type: 'main', label: 'Output' }
  ];

  properties: PropertyDefinition[] = [
    {
      name: 'path',
      displayName: 'Webhook Path',
      type: 'string',
      default: 'my-webhook',
      required: true,
      description: 'The endpoint path, e.g. /webhook/my-webhook'
    },
    {
      name: 'httpMethod',
      displayName: 'HTTP Method',
      type: 'options',
      default: 'POST',
      options: [
        { name: 'GET', value: 'GET' },
        { name: 'POST', value: 'POST' },
        { name: 'PUT', value: 'PUT' },
        { name: 'DELETE', value: 'DELETE' }
      ]
    },
    {
      name: 'responseMode',
      displayName: 'Response Mode',
      type: 'options',
      default: 'onReceived',
      options: [
        { name: 'Immediately (200 OK)', value: 'onReceived' },
        { name: 'When Workflow Finishes', value: 'lastNode' }
      ]
    }
  ];

  async execute(context: NodeExecutionContext): Promise<NodeOutput> {
    if (context.inputData && context.inputData.length > 0) {
      return [context.inputData];
    }

    const payload: DataItem = {
      json: {
        timestamp: new Date().toISOString(),
        headers: {},
        params: {},
        query: {},
        body: {}
      }
    };
    return [[payload]];
  }
}
