import { BaseNode } from '../base';
import { NodeOutput, PortDefinition, PropertyDefinition } from '../../types/workflow';
import { NodeExecutionContext } from '../../engine/context';

export class DelayNode extends BaseNode {
  type = 'delay';
  name = 'Wait / Delay';
  description = 'Pauses workflow execution for a specified duration';
  category = 'core' as const;
  icon = 'clock';
  color = '#f59e0b'; // amber

  inputs: PortDefinition[] = [
    { name: 'main', type: 'main', label: 'Input' }
  ];
  outputs: PortDefinition[] = [
    { name: 'main', type: 'main', label: 'Output' }
  ];

  properties: PropertyDefinition[] = [
    {
      name: 'amount',
      displayName: 'Wait Amount',
      type: 'number',
      default: 2,
      required: true,
      description: 'The number of units to wait'
    },
    {
      name: 'unit',
      displayName: 'Unit',
      type: 'options',
      default: 'seconds',
      options: [
        { name: 'Milliseconds', value: 'milliseconds' },
        { name: 'Seconds', value: 'seconds' },
        { name: 'Minutes', value: 'minutes' }
      ]
    }
  ];

  async execute(context: NodeExecutionContext): Promise<NodeOutput> {
    const amount = Number(context.getNodeParameter('amount', 0, 2));
    const unit = String(context.getNodeParameter('unit', 0, 'seconds'));

    let ms = amount * 1000;
    if (unit === 'milliseconds') ms = amount;
    else if (unit === 'minutes') ms = amount * 60 * 1000;

    // Cap delay at 30 seconds for safety in synchronous workflows
    const safeMs = Math.min(Math.max(ms, 0), 30000);

    if (safeMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, safeMs));
    }

    return [context.inputData || []];
  }
}
