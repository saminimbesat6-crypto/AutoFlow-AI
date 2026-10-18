import { BaseNode } from '../base';
import { DataItem, NodeOutput, PortDefinition, PropertyDefinition } from '../../types/workflow';
import { NodeExecutionContext } from '../../engine/context';
import { GeminiClient, GeminiContent, GeminiToolDeclaration } from './gemini-client';

export class AiAgentNode extends BaseNode {
  type = 'ai-agent';
  name = 'AI Agent (Gemini)';
  description = 'Autonomous AI agent powered by Gemini with multi-turn tool calling and reasoning';
  category = 'ai' as const;
  icon = 'cpu';
  color = '#a855f7'; // vibrant purple

  inputs: PortDefinition[] = [
    { name: 'main', type: 'main', label: 'Input' }
  ];
  outputs: PortDefinition[] = [
    { name: 'main', type: 'main', label: 'Output' }
  ];

  properties: PropertyDefinition[] = [
    {
      name: 'model',
      displayName: 'Model',
      type: 'options',
      default: 'gemini-3.8-flash',
      options: [
        { name: 'Gemini 3.8 Flash (Recommended for Agents)', value: 'gemini-3.8-flash' },
        { name: 'Gemini 3.8 Pro (Complex Reasoning)', value: 'gemini-3.8-pro' },
        { name: 'Gemini 1.5 Pro (Deep Analysis)', value: 'gemini-1.5-pro' }
      ]
    },
    {
      name: 'goal',
      displayName: 'Agent Goal / Task',
      type: 'string',
      default: 'You are an autonomous research and action agent. Accomplish the following goal using your available tools:\n{{ $json.task || "Summarize the incoming data" }}',
      required: true,
      description: 'The overall goal for the agent to achieve'
    },
    {
      name: 'systemInstruction',
      displayName: 'Agent Persona & Constraints',
      type: 'string',
      default: 'You are a precise, helpful AI agent. Use your available tools when necessary to compute values, inspect workflow data, or fetch external information. Always provide a clear explanation of your actions.',
      description: 'System instructions guiding agent behavior'
    },
    {
      name: 'enabledTools',
      displayName: 'Enabled Tools',
      type: 'options',
      default: 'all',
      options: [
        { name: 'All Tools (Calculation, Data Lookup, Web Fetch, JSON Transform)', value: 'all' },
        { name: 'Safe Local Tools (Calculation, Data Lookup, JSON Transform)', value: 'localOnly' }
      ]
    },
    {
      name: 'maxTurns',
      displayName: 'Max Agent Iterations',
      type: 'number',
      default: 5,
      description: 'Maximum function-calling reasoning steps before forcing an answer'
    }
  ];

  async execute(context: NodeExecutionContext): Promise<NodeOutput> {
    const items = context.inputData && context.inputData.length > 0
      ? context.inputData
      : [{ json: {} }];

    const cred = context.getCredentials<{ apiKey?: string }>('gemini_api_key');
    const apiKey = cred?.apiKey || process.env.GEMINI_API_KEY;

    if (!apiKey) {
      throw new Error('Gemini API key is required for AI Agent node.');
    }

    const results: DataItem[] = [];

    for (let i = 0; i < items.length; i++) {
      const model = context.getNodeParameter('model', i, 'gemini-3.8-flash');
      const goal = context.getNodeParameter('goal', i, '');
      const systemInstruction = context.getNodeParameter('systemInstruction', i, '');
      const enabledToolsMode = context.getNodeParameter('enabledTools', i, 'all');
      const maxTurns = Number(context.getNodeParameter('maxTurns', i, 5));

      // Define permitted tools
      const toolDeclarations: GeminiToolDeclaration[] = [
        {
          name: 'calculate',
          description: 'Evaluates a mathematical expression (e.g. "15 * 4 + 10").',
          parameters: {
            type: 'OBJECT',
            properties: {
              expression: { type: 'STRING', description: 'The math expression to calculate' }
            },
            required: ['expression']
          }
        },
        {
          name: 'lookup_workflow_data',
          description: 'Looks up output data produced by another node in the workflow.',
          parameters: {
            type: 'OBJECT',
            properties: {
              nodeName: { type: 'STRING', description: 'Name of the workflow node to inspect' }
            },
            required: ['nodeName']
          }
        },
        {
          name: 'get_current_time',
          description: 'Returns the current timestamp in ISO format and localized time.',
          parameters: {
            type: 'OBJECT',
            properties: {}
          }
        }
      ];

      if (enabledToolsMode === 'all') {
        toolDeclarations.push({
          name: 'fetch_safe_url',
          description: 'Fetches content from an approved HTTP/HTTPS URL (GET only).',
          parameters: {
            type: 'OBJECT',
            properties: {
              url: { type: 'STRING', description: 'The URL to fetch' }
            },
            required: ['url']
          }
        });
      }

      const toolsConfig = [{ functionDeclarations: toolDeclarations }];

      const contents: GeminiContent[] = [
        {
          role: 'user',
          parts: [{ text: goal }]
        }
      ];

      const executionTrace: Array<{
        step: number;
        tool: string;
        args: Record<string, any>;
        result: any;
      }> = [];

      let turn = 0;
      let finalAnswer = '';

      while (turn < maxTurns) {
        turn++;

        const response = await GeminiClient.generateContent({
          apiKey,
          model,
          systemInstruction,
          contents,
          tools: toolsConfig,
          temperature: 0.2
        });

        if (response.toolCalls && response.toolCalls.length > 0) {
          // Model wants to call one or more tools
          for (const call of response.toolCalls) {
            let toolResult: any;

            try {
              if (call.name === 'calculate') {
                const expr = String(call.args.expression || '');
                // Sanitize math expression (only digits, operators, parens)
                if (/^[0-9+\-*/().\s%]+$/.test(expr)) {
                  toolResult = { result: Function(`'use strict'; return (${expr})`)() };
                } else {
                  toolResult = { error: 'Invalid mathematical expression' };
                }
              } else if (call.name === 'lookup_workflow_data') {
                const nodeData = context.getAllNodeData(String(call.args.nodeName || ''));
                toolResult = { data: nodeData || 'No data found for node' };
              } else if (call.name === 'get_current_time') {
                toolResult = {
                  iso: new Date().toISOString(),
                  timestamp: Date.now()
                };
              } else if (call.name === 'fetch_safe_url') {
                const fetchUrl = String(call.args.url || '');
                const res = await fetch(fetchUrl, { method: 'GET', signal: AbortSignal.timeout(10000) });
                const text = await res.text();
                toolResult = {
                  status: res.status,
                  preview: text.slice(0, 2000)
                };
              } else {
                toolResult = { error: `Unknown tool: ${call.name}` };
              }
            } catch (err: any) {
              toolResult = { error: err.message };
            }

            executionTrace.push({
              step: turn,
              tool: call.name,
              args: call.args,
              result: toolResult
            });

            // Add model's tool call to conversation history
            contents.push({
              role: 'model',
              parts: [{ functionCall: { name: call.name, args: call.args } }]
            });

            // Add tool response to conversation history
            contents.push({
              role: 'function',
              parts: [{
                functionResponse: {
                  name: call.name,
                  response: toolResult
                }
              }]
            });
          }
        } else {
          // Model finished reasoning and provided final answer
          finalAnswer = response.text;
          break;
        }
      }

      if (!finalAnswer && executionTrace.length > 0) {
        // Final turn: ask model to summarize results into final answer
        contents.push({
          role: 'user',
          parts: [{ text: 'Please provide your final answer and summary based on the tool execution results.' }]
        });
        const finalResp = await GeminiClient.generateContent({
          apiKey,
          model,
          systemInstruction,
          contents,
          temperature: 0.3
        });
        finalAnswer = finalResp.text;
      }

      results.push({
        json: {
          answer: finalAnswer,
          trace: executionTrace,
          totalSteps: turn,
          model
        },
        pairedItem: i
      });
    }

    return [results];
  }
}
