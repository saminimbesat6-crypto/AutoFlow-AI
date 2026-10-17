import { BaseNode } from '../base';
import { DataItem, NodeOutput, PortDefinition, PropertyDefinition } from '../../types/workflow';
import { NodeExecutionContext } from '../../engine/context';

export class IfConditionNode extends BaseNode {
  type = 'if-condition';
  name = 'IF';
  description = 'Routes data based on whether logical conditions are met';
  category = 'core' as const;
  icon = 'git-branch';
  color = '#3b82f6'; // blue

  inputs: PortDefinition[] = [
    { name: 'main', type: 'main', label: 'Input' }
  ];
  outputs: PortDefinition[] = [
    { name: 'true', type: 'main', label: 'True' },
    { name: 'false', type: 'main', label: 'False' }
  ];

  properties: PropertyDefinition[] = [
    {
      name: 'value1',
      displayName: 'Value 1',
      type: 'string',
      default: '{{ $json.myVariable }}',
      required: true,
      description: 'First value or expression to compare'
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
        { name: 'Starts With', value: 'startsWith' },
        { name: 'Ends With', value: 'endsWith' },
        { name: 'Greater Than', value: 'greaterThan' },
        { name: 'Less Than', value: 'lessThan' },
        { name: 'Greater or Equal', value: 'greaterEqual' },
        { name: 'Less or Equal', value: 'lessEqual' },
        { name: 'Is Empty', value: 'isEmpty' },
        { name: 'Is Not Empty', value: 'isNotEmpty' }
      ]
    },
    {
      name: 'value2',
      displayName: 'Value 2',
      type: 'string',
      default: '',
      description: 'Second value or expression to compare'
    }
  ];

  async execute(context: NodeExecutionContext): Promise<NodeOutput> {
    const items = context.inputData || [];
    const trueItems: DataItem[] = [];
    const falseItems: DataItem[] = [];

    for (let i = 0; i < items.length; i++) {
      const v1 = context.getNodeParameter('value1', i, '');
      const op = context.getNodeParameter('operation', i, 'equals');
      const v2 = context.getNodeParameter('value2', i, '');

      const isTrue = this.checkCondition(v1, op, v2);

      if (isTrue) {
        trueItems.push({ ...items[i], pairedItem: i });
      } else {
        falseItems.push({ ...items[i], pairedItem: i });
      }
    }

    return [trueItems, falseItems];
  }

  private checkCondition(v1: any, op: string, v2: any): boolean {
    switch (op) {
      case 'equals':
        return String(v1).toLowerCase() === String(v2).toLowerCase();
      case 'notEquals':
        return String(v1).toLowerCase() !== String(v2).toLowerCase();
      case 'contains':
        return String(v1).toLowerCase().includes(String(v2).toLowerCase());
      case 'notContains':
        return !String(v1).toLowerCase().includes(String(v2).toLowerCase());
      case 'startsWith':
        return String(v1).toLowerCase().startsWith(String(v2).toLowerCase());
      case 'endsWith':
        return String(v1).toLowerCase().endsWith(String(v2).toLowerCase());
      case 'greaterThan':
        return Number(v1) > Number(v2);
      case 'lessThan':
        return Number(v1) < Number(v2);
      case 'greaterEqual':
        return Number(v1) >= Number(v2);
      case 'lessEqual':
        return Number(v1) <= Number(v2);
      case 'isEmpty':
        return v1 === undefined || v1 === null || v1 === '' || (Array.isArray(v1) && v1.length === 0);
      case 'isNotEmpty':
        return !(v1 === undefined || v1 === null || v1 === '' || (Array.isArray(v1) && v1.length === 0));
      default:
        return false;
    }
  }
}
