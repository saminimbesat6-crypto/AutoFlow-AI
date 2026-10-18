import { BaseNode } from '../base';
import { DataItem, NodeOutput, PortDefinition, PropertyDefinition } from '../../types/workflow';
import { NodeExecutionContext } from '../../engine/context';

export class WebhookResponseNode extends BaseNode {
  type = 'webhook-response';
  name = 'Respond to Webhook';
  description = 'Sends a customized HTTP response back to the caller of a Webhook Trigger';
  category = 'core' as const;
  icon = 'send';
  color = '#ec4899'; // pink

  inputs: PortDefinition[] = [
    { name: 'main', type: 'main', label: 'Input' }
  ];
  outputs: PortDefinition[] = [
    { name: 'main', type: 'main', label: 'Output' }
  ];

  properties: PropertyDefinition[] = [
    {
      name: 'statusCode',
      displayName: 'HTTP Status Code',
      type: 'number',
      default: 200,
      required: true
    },
    {
      name: 'responseMode',
      displayName: 'Response Mode',
      type: 'options',
      default: 'json',
      options: [
        { name: 'Custom JSON', value: 'json' },
        { name: 'Text', value: 'text' },
        { name: 'First Item JSON', value: 'firstItem' }
      ]
    },
    {
      name: 'responseData',
      displayName: 'Response Data',
      type: 'json',
      default: '{\n  "status": "success",\n  "message": "Processed successfully",\n  "data": {{ JSON.stringify($json) }}\n}',
      description: 'The JSON or text payload to return in the HTTP response body'
    }
  ];

  async execute(context: NodeExecutionContext): Promise<NodeOutput> {
    const items = context.inputData || [{ json: {} }];
    const statusCode = Number(context.getNodeParameter('statusCode', 0, 200));
    const responseMode = context.getNodeParameter('responseMode', 0, 'json');
    const responseData = context.getNodeParameter('responseData', 0, {});

    const results: DataItem[] = items.map((item, idx) => ({
      json: {
        ...item.json,
        _webhookResponse: {
          statusCode,
          mode: responseMode,
          body: responseMode === 'firstItem' ? item.json : responseData
        }
      },
      pairedItem: idx
    }));

    return [results];
  }
}
