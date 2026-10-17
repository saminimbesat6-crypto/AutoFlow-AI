import { BaseNode } from '../base';
import { DataItem, NodeOutput, PortDefinition, PropertyDefinition } from '../../types/workflow';
import { NodeExecutionContext } from '../../engine/context';

export class ManualTriggerNode extends BaseNode {
  type = 'manual-trigger';
  name = 'Manual Trigger';
  description = 'Starts the workflow manually from the editor or API';
  category = 'trigger' as const;
  icon = 'play';
  color = '#22c55e'; // green

  inputs: PortDefinition[] = [];
  outputs: PortDefinition[] = [
    { name: 'main', type: 'main', label: 'Output' }
  ];

  properties: PropertyDefinition[] = [];

  async execute(context: NodeExecutionContext): Promise<NodeOutput> {
    // If input data is already provided (e.g. from manual run dialog), pass it through
    if (context.inputData && context.inputData.length > 0) {
      return [context.inputData];
    }

    // Default trigger payload
    const initialItem: DataItem = {
      json: {
        timestamp: new Date().toISOString(),
        triggeredBy: 'manual',
        mode: 'manual'
      }
    };
    return [[initialItem]];
  }
}
