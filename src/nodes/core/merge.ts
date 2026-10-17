import { BaseNode } from '../base';
import { DataItem, NodeOutput, PortDefinition, PropertyDefinition } from '../../types/workflow';
import { NodeExecutionContext } from '../../engine/context';

export class MergeNode extends BaseNode {
  type = 'merge';
  name = 'Merge';
  description = 'Combines data streams from multiple input nodes';
  category = 'core' as const;
  icon = 'git-merge';
  color = '#3b82f6';

  inputs: PortDefinition[] = [
    { name: 'input1', type: 'main', label: 'Input 1' },
    { name: 'input2', type: 'main', label: 'Input 2' }
  ];
  outputs: PortDefinition[] = [
    { name: 'main', type: 'main', label: 'Output' }
  ];

  properties: PropertyDefinition[] = [
    {
      name: 'mode',
      displayName: 'Mode',
      type: 'options',
      default: 'append',
      options: [
        { name: 'Append (Concatenate)', value: 'append' },
        { name: 'Merge by Position (Index)', value: 'mergeByIndex' },
        { name: 'Pass Through', value: 'passThrough' }
      ]
    }
  ];

  async execute(context: NodeExecutionContext): Promise<NodeOutput> {
    const mode = context.getNodeParameter('mode', 0, 'append');
    const inputItems = context.inputData || [];

    // In a multi-input scenario, context.inputData will contain all incoming items.
    if (mode === 'append' || mode === 'passThrough') {
      return [inputItems];
    }

    if (mode === 'mergeByIndex') {
      // Group items by paired index or take sequential pairs
      const mid = Math.ceil(inputItems.length / 2);
      const listA = inputItems.slice(0, mid);
      const listB = inputItems.slice(mid);

      const merged: DataItem[] = [];
      const maxLen = Math.max(listA.length, listB.length);

      for (let i = 0; i < maxLen; i++) {
        merged.push({
          json: {
            ...(listA[i]?.json || {}),
            ...(listB[i]?.json || {})
          },
          pairedItem: i
        });
      }
      return [merged];
    }

    return [inputItems];
  }
}
