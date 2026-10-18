import { BaseNode } from '../base';
import { DataItem, NodeOutput, PortDefinition, PropertyDefinition } from '../../types/workflow';
import { NodeExecutionContext } from '../../engine/context';

export class FilterNode extends BaseNode {
  type = 'filter';
  name = 'Filter';
  description = 'Removes items that do not meet specified criteria';
  category = 'core' as const;
  icon = 'filter';
  color = '#06b6d4'; // cyan

  inputs: PortDefinition[] = [
    { name: 'main', type: 'main', label: 'Input' }
  ];
  outputs: PortDefinition[] = [
    { name: 'main', type: 'main', label: 'Kept' },
    { name: 'discarded', type: 'main', label: 'Discarded' }
  ];

  properties: PropertyDefinition[] = [
    {
      name: 'value1',
      displayName: 'Value 1',
      type: 'string',
      default: '{{ $json.status }}',
      required: true,
      description: 'First value or expression to evaluate'
    },
    {
      name: 'operation',
      displayName: 'Operation',
      type: 'options',
      default: 'equals',
      options: [
        { name: 'Equal', value: 'equals' },
        { name: 'Not Equal', value: 'notEquals' },
        { name: 'Contains', value: 'contains' },
        { name: 'Not Contains', value: 'notContains' },
        { name: 'Greater Than', value: 'greaterThan' },
        { name: 'Less Than', value: 'lessThan' },
        { name: 'Is Empty', value: 'isEmpty' },
        { name: 'Is Not Empty', value: 'isNotEmpty' }
      ]
    },
    {
      name: 'value2',
      displayName: 'Value 2',
      type: 'string',
      default: 'active',
      description: 'Second value to compare against'
    }
  ];

  async execute(context: NodeExecutionContext): Promise<NodeOutput> {
    const items = context.inputData || [];
    const kept: DataItem[] = [];
    const discarded: DataItem[] = [];

    for (let i = 0; i < items.length; i++) {
      const v1 = context.getNodeParameter('value1', i, '');
      const op = context.getNodeParameter('operation', i, 'equals');
      const v2 = context.getNodeParameter('value2', i, '');

      let match = false;
      switch (op) {
        case 'equals':
          match = String(v1).toLowerCase() === String(v2).toLowerCase();
          break;
        case 'notEquals':
          match = String(v1).toLowerCase() !== String(v2).toLowerCase();
          break;
        case 'contains':
          match = String(v1).toLowerCase().includes(String(v2).toLowerCase());
          break;
        case 'notContains':
          match = !String(v1).toLowerCase().includes(String(v2).toLowerCase());
          break;
        case 'greaterThan':
          match = Number(v1) > Number(v2);
          break;
        case 'lessThan':
          match = Number(v1) < Number(v2);
          break;
        case 'isEmpty':
          match = v1 === undefined || v1 === null || v1 === '' || (Array.isArray(v1) && v1.length === 0);
          break;
        case 'isNotEmpty':
          match = !(v1 === undefined || v1 === null || v1 === '' || (Array.isArray(v1) && v1.length === 0));
          break;
      }

      if (match) {
        kept.push({ ...items[i], pairedItem: i });
      } else {
        discarded.push({ ...items[i], pairedItem: i });
      }
    }

    return [kept, discarded];
  }
}
