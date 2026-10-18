import { BaseNode } from '../base';
import { DataItem, NodeOutput, PortDefinition, PropertyDefinition } from '../../types/workflow';
import { NodeExecutionContext } from '../../engine/context';
import { GeminiClient } from './gemini-client';

export class GeminiNode extends BaseNode {
  type = 'gemini';
  name = 'Google Gemini';
  description = 'Generates text, answers questions, and extracts structured data with Google Gemini models';
  category = 'ai' as const;
  icon = 'sparkles';
  color = '#8b5cf6'; // purple

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
        { name: 'Gemini 3.8 Flash (Latest, Fastest & Multimodal)', value: 'gemini-3.8-flash' },
        { name: 'Gemini 3.8 Pro (Latest Deep Reasoning)', value: 'gemini-3.8-pro' },
        { name: 'Gemini 1.5 Flash (Standard Fast)', value: 'gemini-1.5-flash' },
        { name: 'Gemini 1.5 Pro (Standard Reasoning)', value: 'gemini-1.5-pro' }
      ]
    },
    {
      name: 'prompt',
      displayName: 'Prompt',
      type: 'string',
      default: 'Analyze the following data and summarize key insights:\n{{ JSON.stringify($json) }}',
      required: true,
      description: 'The prompt text to send to Gemini. Supports expressions like {{ $json.field }}'
    },
    {
      name: 'systemInstruction',
      displayName: 'System Instruction',
      type: 'string',
      default: 'You are an intelligent workflow automation assistant.',
      description: 'Optional system prompt to guide Gemini behavior'
    },
    {
      name: 'jsonOutput',
      displayName: 'Require JSON Output',
      type: 'boolean',
      default: false,
      description: 'Enforces structured JSON format in model response'
    },
    {
      name: 'temperature',
      displayName: 'Temperature',
      type: 'number',
      default: 0.7,
      description: 'Sampling temperature (0.0 = deterministic, 1.0 = creative)'
    },
    {
      name: 'maxTokens',
      displayName: 'Max Output Tokens',
      type: 'number',
      default: 2048
    }
  ];

  async execute(context: NodeExecutionContext): Promise<NodeOutput> {
    const items = context.inputData && context.inputData.length > 0
      ? context.inputData
      : [{ json: {} }];

    // Get API Key: Check credential first, then fall back to process.env.GEMINI_API_KEY
    const cred = context.getCredentials<{ apiKey?: string }>('gemini_api_key');
    const apiKey = cred?.apiKey || process.env.GEMINI_API_KEY;

    if (!apiKey) {
      throw new Error(
        'Gemini API key is not configured! Please add a "gemini_api_key" credential or set GEMINI_API_KEY in your .env file.'
      );
    }

    const results: DataItem[] = [];

    for (let i = 0; i < items.length; i++) {
      const model = context.getNodeParameter('model', i, 'gemini-3.8-flash');
      const prompt = context.getNodeParameter('prompt', i, '');
      const systemInstruction = context.getNodeParameter('systemInstruction', i, '');
      const jsonOutput = context.getNodeParameter('jsonOutput', i, false);
      const temperature = Number(context.getNodeParameter('temperature', i, 0.7));
      const maxTokens = Number(context.getNodeParameter('maxTokens', i, 2048));

      if (!prompt) {
        throw new Error('Gemini node requires a non-empty prompt.');
      }

      const response = await GeminiClient.generateContent({
        apiKey,
        model,
        systemInstruction: systemInstruction || undefined,
        contents: [
          {
            role: 'user',
            parts: [{ text: prompt }]
          }
        ],
        temperature,
        maxOutputTokens: maxTokens,
        responseMimeType: jsonOutput ? 'application/json' : undefined
      });

      results.push({
        json: {
          text: response.text,
          json: response.json || null,
          usage: response.usage || {},
          model,
          promptUsed: prompt
        },
        pairedItem: i
      });
    }

    return [results];
  }
}
