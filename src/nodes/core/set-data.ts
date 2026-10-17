import { BaseNode } from '../base';
import { DataItem, NodeOutput, PortDefinition, PropertyDefinition } from '../../types/workflow';
import { NodeExecutionContext } from '../../engine/context';

export class SetDataNode extends BaseNode {
  type = 'set-data';
  name = 'Edit Fields (Set)';
  description = 'Creates, updates, or transforms fields on workflow data items';
  category = 'transform' as const;
  icon = 'edit';
  color = '#8b5cf6'; // purple

  inputs: PortDefinition[] = [
    { name: 'main', type: 'main', label: 'Input' }
  ];
  outputs: PortDefinition[] = [
    { name: 'main', type: 'main', label: 'Output' }
  ];

  properties: PropertyDefinition[] = [
    {
      name: 'mode',
      displayName: 'Mode',
      type: 'options',
      default: 'rawJson',
      options: [
        { name: 'JSON Expression', value: 'rawJson' },
        { name: 'Keep Only Set', value: 'replace' }
      ]
    },
    {
      name: 'jsonData',
      displayName: 'JSON Object',
      type: 'json',
      default: '{\n  "outputField": "sample value",\n  "inputReference": "{{ $json.someField }}"\n}',
      description: 'JSON object defining fields to set'
    }
  ];

  async execute(context: NodeExecutionContext): Promise<NodeOutput> {
    const items = context.inputData && context.inputData.length > 0
      ? context.inputData
      : [{ json: {} }];

    const results: DataItem[] = [];

    for (let i = 0; i < items.length; i++) {
      const mode = context.getNodeParameter('mode', i, 'rawJson');
      const rawJson = context.getNodeParameter('jsonData', i, '{}');

      let parsed: Record<string, any> = {};
      try {
        parsed = typeof rawJson === 'string' ? JSON.parse(rawJson) : rawJson;
      } catch (err: any) {
        throw new Error(`Invalid JSON in Set node: ${err.message}`);
      }

      const newJson = mode === 'replace'
        ? { ...parsed }
        : { ...items[i].json, ...parsed };

      results.push({
        json: newJson,
        binary: items[i].binary,
        pairedItem: i
      });
    }

    return [results];
  }
}
