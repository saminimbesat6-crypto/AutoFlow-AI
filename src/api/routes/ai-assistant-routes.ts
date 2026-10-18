import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { CredentialsManager } from '../../credentials/manager';
import { GeminiClient, GeminiContent } from '../../nodes/ai/gemini-client';
import { NodeRegistry } from '../../nodes/registry';
import { Workflow, WorkflowNode, Connection } from '../../types/workflow';

export function createAiAssistantRouter(credentialsManager: CredentialsManager): Router {
  const router = Router();
  const nodeRegistry = NodeRegistry.getInstance();

  // Check Gemini connection status
  router.get('/status', (req: Request, res: Response) => {
    try {
      const creds = credentialsManager.list();
      const hasGeminiCred = creds.some((c) => c.type === 'gemini_api_key');
      const hasEnvKey = Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'your-gemini-api-key-here');

      res.json({
        success: true,
        connected: hasGeminiCred || hasEnvKey,
        source: hasGeminiCred ? 'credential' : hasEnvKey ? 'environment' : 'none'
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Main Copilot Chat & Workflow Generator endpoint
  router.post('/chat', async (req: Request, res: Response) => {
    try {
      const { message, history, currentWorkflow, apiKey: directKey } = req.body;

      if (!message || typeof message !== 'string') {
        return res.status(400).json({ success: false, error: 'Message is required' });
      }

      // Resolve Gemini API Key
      let apiKey = directKey;
      if (!apiKey) {
        const creds = credentialsManager.list();
        const geminiCred = creds.find((c) => c.type === 'gemini_api_key');
        if (geminiCred) {
          const full = credentialsManager.get(geminiCred.id, true);
          apiKey = full?.data?.apiKey;
        }
      }
      if (!apiKey && process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'your-gemini-api-key-here') {
        apiKey = process.env.GEMINI_API_KEY;
      }

      if (!apiKey) {
        return res.status(400).json({
          success: false,
          needsApiKey: true,
          error: 'Gemini API key is not configured. Please enter your Gemini API key in the Assistant panel or save it in Credentials.'
        });
      }

      // Build compact system prompt with complete knowledge of AutoFlow AI nodes and format
      const availableNodes = nodeRegistry.list();
      const nodesCatalog = availableNodes.map((n) => ({
        type: n.type,
        name: n.name,
        description: n.description,
        params: n.properties?.map((p) => `${p.name}: ${p.type}${p.default !== undefined ? ` (default: ${JSON.stringify(p.default)})` : ''}`)
      }));

      const systemInstruction = `
You are the AutoFlow AI Copilot & Workflow Architect. You help users design, build, refine, and troubleshoot workflow automation pipelines.
You are powered by Google Gemini and build workflows natively in AutoFlow AI (an open-source workflow automation platform).

AVAILABLE NODE TYPES:
${JSON.stringify(nodesCatalog, null, 1)}

CANVAS LAYOUT RULES:
- Layout flows clearly from left to right.
- First node at x: 100, y: 160.
- Subsequent sequential nodes spaced dx = 280 (e.g. x: 380, 660, 940, 1220, ...).
- If branching via "if-condition" or "filter":
  - Output 0 (True / Kept) connects to a node positioned at (source.x + 280, source.y - 80).
  - Output 1 (False / Discarded) connects to a node positioned at (source.x + 280, source.y + 120).
- Node IDs: Unique strings e.g. "node_webhook_1", "node_gemini_2", "node_http_3".
- Connection: { "source": node.name or id, "sourceOutput": 0, "target": node.name or id, "targetInput": 0 }.
- Data expressions: Use {{ $json.field }} or {{ $node["NodeName"].json.field }}.

OUTPUT FORMAT:
You MUST respond with valid JSON adhering to this exact schema:
{
  "reply": "Concise, friendly explanation of what you built/modified, explaining the pipeline steps and data flow in markdown.",
  "action": "create" | "update" | "explain",
  "workflow": {
    "name": "Descriptive Workflow Name",
    "description": "Short explanation",
    "nodes": [
      {
        "id": "node_1",
        "name": "Node Name",
        "type": "valid-type-from-catalog",
        "position": { "x": 100, "y": 160 },
        "parameters": { ... }
      }
    ],
    "connections": [
      { "source": "Node Name", "sourceOutput": 0, "target": "Next Node Name", "targetInput": 0 }
    ]
  },
  "suggestedFollowUps": [
    "Short follow-up 1",
    "Short follow-up 2"
  ]
}

If the user simply asks a general question or doesn't want workflow changes, set "action": "explain" and you may omit the "workflow" field or keep it null.
If the user provides an existing workflow in context, modify or extend it logically unless they explicitly ask for a brand new one.
`;

      const contents: GeminiContent[] = [];

      // Add conversation history if provided
      if (Array.isArray(history)) {
        for (const item of history.slice(-6)) {
          if (item.role === 'user' || item.role === 'model') {
            contents.push({
              role: item.role,
              parts: [{ text: item.text || item.content || '' }]
            });
          }
        }
      }

      // Build user prompt with current canvas context
      let promptText = message;
      if (currentWorkflow && currentWorkflow.nodes && currentWorkflow.nodes.length > 0) {
        promptText = `[CURRENT CANVAS WORKFLOW CONTEXT]:\n${JSON.stringify({
          name: currentWorkflow.name,
          nodes: currentWorkflow.nodes.map((n: WorkflowNode) => ({
            id: n.id,
            name: n.name,
            type: n.type,
            parameters: n.parameters,
            position: n.position
          })),
          connections: currentWorkflow.connections
        })}\n\n[USER REQUEST]:\n${message}`;
      }

      contents.push({
        role: 'user',
        parts: [{ text: promptText }]
      });

      const response = await GeminiClient.generateContent({
        apiKey,
        model: 'gemini-3.8-flash',
        systemInstruction,
        contents,
        temperature: 0.3,
        responseMimeType: 'application/json',
        timeoutMs: 120000
      });

      let parsed: any;
      try {
        parsed = response.json || JSON.parse(response.text);
      } catch (e) {
        // Fallback: extract JSON from text
        const match = response.text.match(/\{[\s\S]*\}/);
        if (match) {
          parsed = JSON.parse(match[0]);
        } else {
          return res.json({
            success: true,
            data: {
              reply: response.text,
              action: 'explain',
              workflow: null
            }
          });
        }
      }

      // Ensure nodes have valid IDs and positions
      if (parsed.workflow && Array.isArray(parsed.workflow.nodes)) {
        parsed.workflow.nodes = parsed.workflow.nodes.map((n: any, idx: number) => ({
          ...n,
          id: n.id || `node_${idx + 1}_${uuidv4().slice(0, 6)}`,
          position: n.position || { x: 100 + idx * 280, y: 160 },
          parameters: n.parameters || {}
        }));
      }

      res.json({
        success: true,
        data: parsed
      });
    } catch (err: any) {
      console.error('[AI Assistant Error]', err);
      res.status(500).json({ success: false, error: err.message || 'Error processing AI Assistant request' });
    }
  });

  return router;
}
