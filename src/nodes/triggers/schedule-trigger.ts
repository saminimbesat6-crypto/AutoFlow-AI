import { BaseNode } from '../base';
import { DataItem, NodeOutput, PortDefinition, PropertyDefinition } from '../../types/workflow';
import { NodeExecutionContext } from '../../engine/context';

export class ScheduleTriggerNode extends BaseNode {
  type = 'schedule-trigger';
  name = 'Schedule';
  description = 'Triggers workflow periodically based on cron interval';
  category = 'trigger' as const;
  icon = 'clock';
  color = '#22c55e';

  inputs: PortDefinition[] = [];
  outputs: PortDefinition[] = [
    { name: 'main', type: 'main', label: 'Output' }
  ];

  properties: PropertyDefinition[] = [
    {
      name: 'rule',
      displayName: 'Trigger Interval',
      type: 'options',
      default: 'everyHour',
      options: [
        { name: 'Every Minute', value: '* * * * *' },
        { name: 'Every 5 Minutes', value: '*/5 * * * *' },
        { name: 'Every 15 Minutes', value: '*/15 * * * *' },
        { name: 'Every Hour', value: '0 * * * *' },
        { name: 'Every Day at Midnight', value: '0 0 * * *' },
        { name: 'Custom Cron', value: 'custom' }
      ]
    },
    {
      name: 'customCron',
      displayName: 'Custom Cron Expression',
      type: 'string',
      default: '0 9 * * 1-5',
      description: '5-part cron syntax (minute hour day-of-month month day-of-week)'
    }
  ];

  async execute(context: NodeExecutionContext): Promise<NodeOutput> {
    const item: DataItem = {
      json: {
        timestamp: new Date().toISOString(),
        triggeredBy: 'schedule'
      }
    };
    return [[item]];
  }
}
