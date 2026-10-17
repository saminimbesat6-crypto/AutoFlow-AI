import { BaseNode } from '../base';
import { DataItem, NodeOutput, PortDefinition, PropertyDefinition } from '../../types/workflow';
import { NodeExecutionContext } from '../../engine/context';

export class HttpRequestNode extends BaseNode {
  type = 'http-request';
  name = 'HTTP Request';
  description = 'Sends HTTP requests to external APIs and services';
  category = 'action' as const;
  icon = 'send';
  color = '#f97316'; // orange

  inputs: PortDefinition[] = [
    { name: 'main', type: 'main', label: 'Input' }
  ];
  outputs: PortDefinition[] = [
    { name: 'main', type: 'main', label: 'Output' }
  ];

  properties: PropertyDefinition[] = [
    {
      name: 'method',
      displayName: 'Method',
      type: 'options',
      default: 'GET',
      options: [
        { name: 'GET', value: 'GET' },
        { name: 'POST', value: 'POST' },
        { name: 'PUT', value: 'PUT' },
        { name: 'DELETE', value: 'DELETE' },
        { name: 'PATCH', value: 'PATCH' }
      ]
    },
    {
      name: 'url',
      displayName: 'URL',
      type: 'string',
      default: 'https://jsonplaceholder.typicode.com/posts/1',
      required: true,
      description: 'The URL to send request to. Can use expressions like {{ $json.url }}'
    },
    {
      name: 'authentication',
      displayName: 'Authentication',
      type: 'options',
      default: 'none',
      options: [
        { name: 'None', value: 'none' },
        { name: 'Bearer Token', value: 'bearerToken' },
        { name: 'Basic Auth', value: 'basicAuth' },
        { name: 'Header Auth', value: 'headerAuth' }
      ]
    },
    {
      name: 'credentialId',
      displayName: 'Credential',
      type: 'credential',
      description: 'Select saved credential'
    },
    {
      name: 'sendBody',
      displayName: 'Send Body',
      type: 'boolean',
      default: false
    },
    {
      name: 'bodyContentType',
      displayName: 'Body Content Type',
      type: 'options',
      default: 'json',
      options: [
        { name: 'JSON', value: 'json' },
        { name: 'Raw Text', value: 'raw' }
      ]
    },
    {
      name: 'body',
      displayName: 'Body',
      type: 'json',
      default: '{\n  "key": "value"\n}'
    },
    {
      name: 'headers',
      displayName: 'Custom Headers',
      type: 'json',
      default: '{}'
    },
    {
      name: 'timeout',
      displayName: 'Timeout (ms)',
      type: 'number',
      default: 30000
    }
  ];

  async execute(context: NodeExecutionContext): Promise<NodeOutput> {
    const items = context.inputData && context.inputData.length > 0
      ? context.inputData
      : [{ json: {} }];

    const results: DataItem[] = [];

    for (let i = 0; i < items.length; i++) {
      const method = context.getNodeParameter('method', i, 'GET').toUpperCase();
      const rawUrl = context.getNodeParameter('url', i, '');
      const sendBody = context.getNodeParameter('sendBody', i, false);
      const bodyContentType = context.getNodeParameter('bodyContentType', i, 'json');
      const timeoutMs = context.getNodeParameter('timeout', i, 30000);
      const authType = context.getNodeParameter('authentication', i, 'none');

      if (!rawUrl) {
        throw new Error('HTTP Request node requires a URL.');
      }

      const headers: Record<string, string> = {};

      // Parse custom headers
      const rawHeaders = context.getNodeParameter('headers', i, '{}');
      try {
        const parsed = typeof rawHeaders === 'string' ? JSON.parse(rawHeaders) : rawHeaders;
        Object.assign(headers, parsed);
      } catch {}

      // Handle Authentication
      if (authType === 'bearerToken') {
        const cred = context.getCredentials<{ token?: string }>('bearer_token');
        if (cred?.token) headers['Authorization'] = `Bearer ${cred.token}`;
      } else if (authType === 'basicAuth') {
        const cred = context.getCredentials<{ user?: string; password?: string }>('basic_auth');
        if (cred?.user) {
          const authString = Buffer.from(`${cred.user}:${cred.password || ''}`).toString('base64');
          headers['Authorization'] = `Basic ${authString}`;
        }
      } else if (authType === 'headerAuth') {
        const cred = context.getCredentials<{ name?: string; value?: string }>('http_header_auth');
        if (cred?.name && cred?.value) headers[cred.name] = cred.value;
      }

      let requestBody: any = undefined;
      if (sendBody && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
        const rawBody = context.getNodeParameter('body', i, '');
        if (bodyContentType === 'json') {
          headers['Content-Type'] = headers['Content-Type'] || 'application/json';
          requestBody = typeof rawBody === 'string' ? rawBody : JSON.stringify(rawBody);
        } else {
          requestBody = String(rawBody);
        }
      }

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const response = await fetch(rawUrl, {
          method,
          headers,
          body: requestBody,
          signal: controller.signal
        });

        clearTimeout(timer);

        const responseHeaders: Record<string, string> = {};
        response.headers.forEach((v, k) => { responseHeaders[k] = v; });

        let responseData: any;
        const text = await response.text();
        try {
          responseData = JSON.parse(text);
        } catch {
          responseData = text;
        }

        results.push({
          json: {
            data: responseData,
            statusCode: response.status,
            statusText: response.statusText,
            headers: responseHeaders,
            url: rawUrl
          },
          pairedItem: i
        });
      } catch (err: any) {
        clearTimeout(timer);
        if (err.name === 'AbortError') {
          throw new Error(`HTTP request to ${rawUrl} timed out after ${timeoutMs}ms`);
        }
        throw new Error(`HTTP request failed: ${err.message}`);
      }
    }

    return [results];
  }
}
