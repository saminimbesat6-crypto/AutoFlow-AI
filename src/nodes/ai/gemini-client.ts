export interface GeminiMessagePart {
  text?: string;
  functionCall?: {
    name: string;
    args: Record<string, any>;
  };
  functionResponse?: {
    name: string;
    response: Record<string, any>;
  };
}

export interface GeminiContent {
  role: 'user' | 'model' | 'function';
  parts: GeminiMessagePart[];
}

export interface GeminiToolDeclaration {
  name: string;
  description: string;
  parameters: {
    type: 'OBJECT';
    properties: Record<string, {
      type: string;
      description?: string;
      enum?: string[];
    }>;
    required?: string[];
  };
}

export interface GeminiRequestOptions {
  apiKey: string;
  model?: string;
  systemInstruction?: string;
  contents: GeminiContent[];
  tools?: Array<{ functionDeclarations: GeminiToolDeclaration[] }>;
  temperature?: number;
  maxOutputTokens?: number;
  responseMimeType?: string;
  timeoutMs?: number;
}

export interface GeminiResponse {
  text: string;
  json?: any;
  toolCalls?: Array<{
    name: string;
    args: Record<string, any>;
  }>;
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
  raw?: any;
}

export class GeminiClient {
  private static DEFAULT_MODEL = 'gemini-3.8-flash';

  static async generateContent(options: GeminiRequestOptions): Promise<GeminiResponse> {
    let model = options.model || this.DEFAULT_MODEL;
    if (model === 'gemini-2.5-flash') {
      model = 'gemini-3.8-flash';
    }

    const apiKey = options.apiKey;

    if (!apiKey) {
      throw new Error('Gemini API key is required. Please configure it in node credentials or GEMINI_API_KEY environment variable.');
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    const body: Record<string, any> = {
      contents: options.contents
    };

    if (options.systemInstruction) {
      body.systemInstruction = {
        parts: [{ text: options.systemInstruction }]
      };
    }

    const generationConfig: Record<string, any> = {};
    if (options.temperature !== undefined) generationConfig.temperature = options.temperature;
    if (options.maxOutputTokens !== undefined) generationConfig.maxOutputTokens = options.maxOutputTokens;
    if (options.responseMimeType) generationConfig.responseMimeType = options.responseMimeType;

    if (Object.keys(generationConfig).length > 0) {
      body.generationConfig = generationConfig;
    }

    if (options.tools && options.tools.length > 0) {
      body.tools = options.tools;
    }

    const timeoutMs = options.timeoutMs || Number(process.env.GEMINI_TIMEOUT_MS) || 120000;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    let res: Response;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal
      });
    } catch (err: any) {
      clearTimeout(timeout);
      if (err.name === 'AbortError') {
        throw new Error(`Gemini request timed out after ${timeoutMs}ms. Please try a simpler prompt or check your network.`);
      }
      throw new Error(`Network error calling Gemini API: ${err.message}`);
    } finally {
      clearTimeout(timeout);
    }

    if (!res.ok) {
      const errorText = await res.text();
      let errorJson: any;
      try {
        errorJson = JSON.parse(errorText);
      } catch {}

      const message = errorJson?.error?.message || errorText || `HTTP ${res.status}`;
      throw new Error(`Gemini API error (${res.status}): ${message}`);
    }

    const data = await res.json() as any;
    const candidate = data.candidates?.[0];
    const parts = candidate?.content?.parts || [];

    let text = '';
    const toolCalls: Array<{ name: string; args: Record<string, any> }> = [];

    for (const part of parts) {
      if (part.text) {
        text += part.text;
      }
      if (part.functionCall) {
        toolCalls.push({
          name: part.functionCall.name,
          args: part.functionCall.args || {}
        });
      }
    }

    let parsedJson: any = undefined;
    if (options.responseMimeType === 'application/json' && text) {
      try {
        parsedJson = JSON.parse(text);
      } catch {
        // Strip code fence if present
        const match = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
        if (match) {
          try { parsedJson = JSON.parse(match[1]); } catch {}
        }
      }
    }

    return {
      text,
      json: parsedJson,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      usage: {
        promptTokens: data.usageMetadata?.promptTokenCount,
        completionTokens: data.usageMetadata?.candidatesTokenCount,
        totalTokens: data.usageMetadata?.totalTokenCount
      },
      raw: data
    };
  }
}
