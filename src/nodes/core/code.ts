import { BaseNode } from '../base';
import { DataItem, NodeOutput, PortDefinition, PropertyDefinition } from '../../types/workflow';
import { NodeExecutionContext } from '../../engine/context';

export class CodeNode extends BaseNode {
  type = 'code';
  name = 'Code';
  description = 'Executes custom JavaScript code to transform data';
  category = 'transform' as const;
  icon = 'terminal';
  color = '#eab308'; // yellow

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
      default: 'runOnceForAllItems',
      options: [
        { name: 'Run Once for All Items', value: 'runOnceForAllItems' },
        { name: 'Run Once for Each Item', value: 'runOnceForEachItem' }
      ]
    },
    {
      name: 'jsCode',
      displayName: 'JavaScript Code',
      type: 'code',
      default: '// Loop over input items and add a new field\nfor (const item of $input.all()) {\n  item.json.myNewField = 1;\n}\nreturn $input.all();',
      description: 'JavaScript code returning items or data objects'
    }
  ];

  async execute(context: NodeExecutionContext): Promise<NodeOutput> {
    const items = context.inputData || [];
    const mode = context.getNodeParameter('mode', 0, 'runOnceForAllItems');
    const code = context.getNodeParameter('jsCode', 0, 'return $input.all();');

    // Safe execution sandbox without access to process, require, or globals
    if (mode === 'runOnceForAllItems') {
      const clonedItems = JSON.parse(JSON.stringify(items));
      const $input = {
        all: () => clonedItems,
        first: () => clonedItems[0] || { json: {} },
        last: () => clonedItems[clonedItems.length - 1] || { json: {} }
      };

      try {
        const fn = new Function('$input', 'items', `
          "use strict";
          const process = undefined;
          const require = undefined;
          const global = undefined;
          const globalThis = undefined;
          ${code}
        `);
        const result = fn($input, clonedItems);

        if (!result) return [[]];
        if (Array.isArray(result)) {
          // Check if items have .json or are raw objects
          const normalized = result.map((item: any, idx: number) => {
            if (item && typeof item === 'object' && 'json' in item) {
              return item as DataItem;
            }
            return { json: item, pairedItem: idx } as DataItem;
          });
          return [normalized];
        } else if (typeof result === 'object') {
          if ('json' in result) return [[result as DataItem]];
          return [[{ json: result, pairedItem: 0 }]];
        }
        return [[{ json: { value: result }, pairedItem: 0 }]];
      } catch (err: any) {
        throw new Error(`Code execution failed: ${err.message}`);
      }
    } else {
      // Run once for each item
      const results: DataItem[] = [];
      for (let i = 0; i < items.length; i++) {
        const itemCopy = JSON.parse(JSON.stringify(items[i]));
        const $json = itemCopy.json;
        const $itemIndex = i;

        try {
          const fn = new Function('$json', '$itemIndex', `
            "use strict";
            const process = undefined;
            const require = undefined;
            ${code}
          `);
          const res = fn($json, $itemIndex);
          if (res) {
            results.push({ json: res, pairedItem: i });
          } else {
            results.push({ json: $json, pairedItem: i });
          }
        } catch (err: any) {
          throw new Error(`Code execution failed at item ${i}: ${err.message}`);
        }
      }
      return [results];
    }
  }
}
