# AutoFlow AI ⚡

**AutoFlow AI** is a self-hostable, high-performance workflow automation platform inspired by n8n, built with an original TypeScript architecture and first-class **Google Gemini** AI model and autonomous agent integration.

---

## 🌟 Key Features

- **Interactive Visual Canvas**: Full-featured node-based workflow canvas with draggable nodes, cubic bezier connections, port snapping, pan & zoom, and live execution status indicators.
- **Topological Execution Engine**: Deterministic DAG runner supporting linear flows, conditional branching (IF/Switch), multi-stream merges, sandboxed code execution, and data passing (`{{ $json.field }}` and `{{ $node["NodeName"].json }}`).
- **First-Class Gemini AI Integration**:
  - **Google Gemini Node**: Direct integration with Google AI Studio Generative Language API (`gemini-2.5-flash`, `gemini-1.5-pro`, `gemini-1.5-flash`), supporting custom prompts, system instructions, and structured JSON output.
  - **Autonomous AI Agent Node**: Multi-turn agent loop with native function/tool calling (safe calculations, data lookups, web fetching, and time lookups).
- **Embedded Database Architecture**: Powered by Node 24's native `node:sqlite` (`DatabaseSync`), requiring zero native C++ compiler toolchains for maximum portability across Linux, Termux (Android), macOS, and container runtimes.
- **Enterprise-Grade Credential Security**: Credentials encrypted at rest using **AES-256-GCM** with unique IVs and authentication tags. Secrets are never exposed to the frontend.
- **Webhooks & Schedulers**:
  - Dynamic webhook endpoints (`/webhook/:path`) supporting GET, POST, PUT, DELETE.
  - Integrated cron scheduler for automated periodic runs.
- **Bidirectional n8n Compatibility Adapter**: Export and import workflows seamlessly between AutoFlow AI and standard n8n JSON format.

---

## 📁 Architecture Overview

```
autoflow-ai/
├── src/
│   ├── server.ts              # Express server & API routes
│   ├── database/
│   │   ├── connection.ts      # SQLite connection (node:sqlite DatabaseSync)
│   │   ├── migrations/        # Schema migrations (workflows, executions, credentials)
│   │   └── repositories/      # Workflow data access layer
│   ├── engine/
│   │   ├── graph.ts           # DAG validation, cycle detection, topological sorter
│   │   ├── context.ts         # Data passing, expression evaluator ($json, $node)
│   │   ├── executor.ts        # Workflow execution engine with branch isolation & retries
│   │   └── adapter.ts         # Bidirectional n8n workflow converter
│   ├── nodes/
│   │   ├── base.ts            # Node definition contract
│   │   ├── registry.ts        # Node registry
│   │   ├── triggers/          # Manual, Webhook, and Schedule triggers
│   │   ├── core/              # HTTP Request, IF Condition, Set Data, Merge, Code
│   │   └── ai/                # Gemini Model client, Gemini Node, AI Agent Node
│   ├── credentials/
│   │   └── manager.ts         # AES-256-GCM credential vault
│   ├── webhooks/
│   │   └── manager.ts         # Dynamic webhook routing and execution
│   └── scheduler/
│       └── manager.ts         # Cron schedule manager
├── public/                    # Frontend Visual Workflow Editor
│   ├── index.html             # Single-page UI
│   ├── css/styles.css         # Modern dark-theme stylesheet
│   └── js/
│       ├── canvas.js          # Pan, zoom, node drag, bezier connection engine
│       ├── editor.js          # Node palette, inspector drawer, execution debug drawer
│       └── app.js             # API orchestrator and view manager
└── tests/
    ├── autoflow.test.js       # Core unit & DAG execution tests
    └── server.test.js         # HTTP API & Webhook integration tests
```

---

## 🚀 Quick Start

### 1. Installation
```bash
cd /data/data/com.termux/files/home/autoflow-ai
npm install
npm run build
```

### 2. Configure Environment (Optional)
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```
Set your Google Gemini API key:
```env
GEMINI_API_KEY=your_google_ai_studio_api_key_here
PORT=3456
```

### 3. Run Automated Tests
```bash
npm test
```
All 10 core engine and integration tests run in under 3 seconds.

### 4. Start Server
```bash
npm start
```
Open your browser and navigate to:
```
http://localhost:3456
```

---

## 🔄 n8n Compatibility

AutoFlow AI provides bidirectional compatibility with standard n8n workflows:
- Click **"Export n8n"** in the top navigation to download your workflow in n8n-compatible JSON format.
- Click **"Import"** and paste any standard n8n workflow JSON to instantly convert and load it into AutoFlow AI.
