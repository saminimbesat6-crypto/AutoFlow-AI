// AutoFlow AI Main Application Orchestrator

class AutoFlowApp {
  constructor() {
    this.canvasWrapper = document.getElementById('canvas-wrapper');
    this.svgEl = document.getElementById('connections-svg');
    this.canvas = new WorkflowCanvas(this.canvasWrapper, this.svgEl);
    this.editor = new WorkflowEditor(this.canvas, this);

    this.currentWorkflow = null;
    this.nodeTypes = [];
    this.credentials = [];
    this.aiChatHistory = [];
    this.lastExecutionDetails = null;

    this.initUI();
    this.initAiCopilot();
    this.initFullscreenViewer();
    this.loadInitialData();
  }

  // --- API Client Helpers ---
  async api(endpoint, options = {}) {
    try {
      const res = await fetch(endpoint, {
        headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
        ...options
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      return data;
    } catch (err) {
      console.error(`API Error on ${endpoint}:`, err);
      this.toast(`Error: ${err.message}`, 'error');
      throw err;
    }
  }

  // --- Toast Notifications ---
  toast(msg, type = 'info') {
    const container = document.getElementById('toast-container');
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.textContent = msg;
    container.appendChild(el);
    setTimeout(() => {
      el.style.opacity = '0';
      setTimeout(() => el.remove(), 300);
    }, 4000);
  }

  // --- Initialization ---
  async loadInitialData() {
    try {
      // 1. Fetch available node types
      const typesRes = await this.api('/api/node-types');
      this.nodeTypes = typesRes.data || [];
      this.canvas.setNodeTypes(this.nodeTypes);

      // 2. Fetch credentials
      const credsRes = await this.api('/api/credentials');
      this.credentials = credsRes.data || [];

      await this.editor.init(this.nodeTypes, this.credentials);

      // 3. Load or create initial workflow
      const wfRes = await this.api('/api/workflows');
      if (wfRes.data && wfRes.data.length > 0) {
        this.openWorkflow(wfRes.data[0]);
      } else {
        this.createNewWorkflow('Sample Gemini AI Workflow');
      }

      this.loadWorkflowsList();
      await this.checkAiStatus();
    } catch (err) {
      console.error('App init error:', err);
    }
  }

  initUI() {
    // Navigation Tabs
    document.querySelectorAll('.nav-tab').forEach((tab) => {
      tab.addEventListener('click', () => {
        const viewId = tab.dataset.view;
        this.switchView(viewId);
      });
    });

    // Workflow Title Edit
    const titleInput = document.getElementById('workflow-title-input');
    titleInput.addEventListener('change', (e) => {
      if (this.currentWorkflow) {
        this.currentWorkflow.name = e.target.value.trim() || 'Untitled Workflow';
      }
    });

    // Save Workflow Button
    document.getElementById('save-workflow-btn').addEventListener('click', () => {
      this.saveCurrentWorkflow();
    });

    // Execute Workflow Button
    document.getElementById('execute-workflow-btn').addEventListener('click', () => {
      this.executeCurrentWorkflowStream();
    });

    // Active Toggle Button
    const activeToggle = document.getElementById('workflow-active-toggle');
    activeToggle.addEventListener('click', async () => {
      if (!this.currentWorkflow) return;
      try {
        const res = await this.api(`/api/workflows/${this.currentWorkflow.id}/activate`, { method: 'POST' });
        this.currentWorkflow.active = res.data.active;
        this.updateActiveToggleUI();
        this.toast(`Workflow is now ${this.currentWorkflow.active ? 'ACTIVE' : 'INACTIVE'}`, 'info');
      } catch (err) {}
    });

    // Import / Export Buttons
    document.getElementById('import-workflow-btn').addEventListener('click', () => {
      document.getElementById('import-modal').classList.add('open');
    });

    document.getElementById('export-autoflow-btn').addEventListener('click', () => {
      if (!this.currentWorkflow) return;
      window.open(`/api/workflows/${this.currentWorkflow.id}/export?format=autoflow`, '_blank');
    });

    document.getElementById('export-n8n-btn').addEventListener('click', () => {
      if (!this.currentWorkflow) return;
      window.open(`/api/workflows/${this.currentWorkflow.id}/export?format=n8n`, '_blank');
    });

    // Import Modal Actions
    document.getElementById('cancel-import-btn').addEventListener('click', () => {
      document.getElementById('import-modal').classList.remove('open');
    });

    document.getElementById('confirm-import-btn').addEventListener('click', async () => {
      const jsonText = document.getElementById('import-json-textarea').value.trim();
      if (!jsonText) return;

      try {
        const parsed = JSON.parse(jsonText);
        const res = await this.api('/api/workflows/import', {
          method: 'POST',
          body: JSON.stringify(parsed)
        });
        document.getElementById('import-modal').classList.remove('open');
        this.toast('Workflow imported successfully!', 'success');
        this.openWorkflow(res.data);
      } catch (err) {
        this.toast(`Import failed: ${err.message}`, 'error');
      }
    });

    // New Workflow Button (Dashboard)
    document.getElementById('new-workflow-btn').addEventListener('click', () => {
      this.createNewWorkflow();
    });

    // New Credential Button (Credentials View)
    document.getElementById('new-credential-btn').addEventListener('click', () => {
      document.getElementById('credential-modal').classList.add('open');
    });

    document.getElementById('cancel-cred-btn').addEventListener('click', () => {
      document.getElementById('credential-modal').classList.remove('open');
    });

    document.getElementById('save-cred-btn').addEventListener('click', async () => {
      const name = document.getElementById('cred-name').value.trim();
      const type = document.getElementById('cred-type').value;
      const keyOrToken = document.getElementById('cred-secret').value.trim();

      if (!name || !keyOrToken) {
        this.toast('Please fill in credential name and value', 'error');
        return;
      }

      let payloadData = {};
      if (type === 'gemini_api_key') payloadData = { apiKey: keyOrToken };
      else if (type === 'bearer_token') payloadData = { token: keyOrToken };
      else if (type === 'basic_auth') {
        const user = document.getElementById('cred-user')?.value || 'admin';
        payloadData = { user, password: keyOrToken };
      }

      try {
        await this.api('/api/credentials', {
          method: 'POST',
          body: JSON.stringify({ name, type, data: payloadData })
        });
        document.getElementById('credential-modal').classList.remove('open');
        this.toast('Credential saved securely!', 'success');
        this.loadCredentialsList();
      } catch (err) {}
    });
  }

  switchView(viewName) {
    document.querySelectorAll('.nav-tab').forEach((t) => {
      t.classList.toggle('active', t.dataset.view === viewName);
    });

    document.querySelectorAll('.view-container').forEach((vc) => {
      vc.classList.toggle('active', vc.id === `view-${viewName}`);
    });

    if (viewName === 'workflows') this.loadWorkflowsList();
    if (viewName === 'executions') this.loadExecutionsList();
    if (viewName === 'credentials') this.loadCredentialsList();
  }

  // --- Workflow Management ---
  openWorkflow(workflow) {
    this.currentWorkflow = workflow;
    document.getElementById('workflow-title-input').value = workflow.name;
    this.updateActiveToggleUI();
    this.canvas.loadWorkflow(this.currentWorkflow);
    this.switchView('editor');
  }

  async createNewWorkflow(defaultName = 'New Workflow') {
    const templateNodes = [
      {
        id: 'node_start',
        name: 'Manual Trigger',
        type: 'manual-trigger',
        position: { x: 120, y: 180 },
        parameters: {}
      },
      {
        id: 'node_http',
        name: 'Fetch Data',
        type: 'http-request',
        position: { x: 420, y: 180 },
        parameters: {
          url: 'https://jsonplaceholder.typicode.com/posts/1',
          method: 'GET'
        }
      },
      {
        id: 'node_gemini',
        name: 'Gemini AI Analyze',
        type: 'gemini',
        position: { x: 720, y: 180 },
        parameters: {
          model: 'gemini-3.8-flash',
          prompt: 'Summarize this data into 2 bullet points:\nTitle: {{ $json.data.title }}\nBody: {{ $json.data.body }}'
        }
      },
      {
        id: 'node_if',
        name: 'Check Output',
        type: 'if-condition',
        position: { x: 1020, y: 180 },
        parameters: {
          value1: '{{ $json.text }}',
          operation: 'isNotEmpty'
        }
      }
    ];

    const templateConnections = [
      { source: 'Manual Trigger', sourceOutput: 0, target: 'Fetch Data', targetInput: 0 },
      { source: 'Fetch Data', sourceOutput: 0, target: 'Gemini AI Analyze', targetInput: 0 },
      { source: 'Gemini AI Analyze', sourceOutput: 0, target: 'Check Output', targetInput: 0 }
    ];

    try {
      const res = await this.api('/api/workflows', {
        method: 'POST',
        body: JSON.stringify({
          name: defaultName,
          nodes: templateNodes,
          connections: templateConnections,
          active: false
        })
      });
      this.toast('New workflow created with Gemini template!', 'success');
      this.openWorkflow(res.data);
    } catch (err) {}
  }

  async saveCurrentWorkflow() {
    if (!this.currentWorkflow) return;
    try {
      const res = await this.api(`/api/workflows/${this.currentWorkflow.id}`, {
        method: 'PUT',
        body: JSON.stringify(this.currentWorkflow)
      });
      this.currentWorkflow = res.data;
      this.toast('Workflow saved successfully', 'success');
    } catch (err) {}
  }

  async executeCurrentWorkflow() {
    if (!this.currentWorkflow) return;

    // Auto-save changes first
    await this.saveCurrentWorkflow();

    this.toast('Running workflow execution...', 'info');
    this.canvas.clearExecutionStatuses();

    // Mark all nodes as running
    for (const node of this.currentWorkflow.nodes) {
      this.canvas.setNodeExecutionStatus(node.id, 'running');
    }

    try {
      const res = await this.api(`/api/workflows/${this.currentWorkflow.id}/execute`, {
        method: 'POST',
        body: JSON.stringify({})
      });

      const details = res.data;
      this.lastExecutionDetails = details;
      this.editor.setExecutionResults(details);
      this.updateFullscreenOutputIfOpen();

      // Update node badges based on actual execution results
      if (details && details.nodes) {
        for (const nr of details.nodes) {
          this.canvas.setNodeExecutionStatus(nr.nodeId, nr.status, nr.duration);
        }
      }

      if (details.execution.status === 'success') {
        this.toast(`Workflow completed in ${details.execution.duration}ms!`, 'success');
      } else {
        this.toast(`Execution error: ${details.execution.errorMessage}`, 'error');
      }
    } catch (err) {
      this.toast(`Execution failed: ${err.message}`, 'error');
      for (const node of this.currentWorkflow.nodes) {
        this.canvas.setNodeExecutionStatus(node.id, 'error');
      }
    }
  }

  updateActiveToggleUI() {
    const btn = document.getElementById('workflow-active-toggle');
    if (!btn || !this.currentWorkflow) return;

    if (this.currentWorkflow.active) {
      btn.textContent = 'Active (Live)';
      btn.className = 'btn btn-success btn-sm';
    } else {
      btn.textContent = 'Inactive';
      btn.className = 'btn btn-secondary btn-sm';
    }
  }

  // --- Dashboard Views ---
  async loadWorkflowsList() {
    const tbody = document.getElementById('workflows-table-body');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="5" style="text-align: center;">Loading...</td></tr>';

    try {
      const res = await this.api('/api/workflows');
      const workflows = res.data || [];
      tbody.innerHTML = '';

      if (workflows.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: #64748b;">No workflows found. Click "New Workflow" to create one.</td></tr>';
        return;
      }

      for (const wf of workflows) {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td><strong>${wf.name}</strong></td>
          <td><span class="badge ${wf.active ? 'badge-active' : 'badge-inactive'}">${wf.active ? 'Active' : 'Inactive'}</span></td>
          <td>${wf.nodes?.length || 0} nodes</td>
          <td>${new Date(wf.updatedAt).toLocaleString()}</td>
          <td>
            <button class="btn btn-secondary btn-sm open-wf-btn">Open Editor</button>
            <button class="btn btn-danger btn-sm del-wf-btn" style="margin-left: 6px;">Delete</button>
          </td>
        `;

        tr.querySelector('.open-wf-btn').addEventListener('click', () => this.openWorkflow(wf));
        tr.querySelector('.del-wf-btn').addEventListener('click', async () => {
          if (confirm(`Delete workflow "${wf.name}"?`)) {
            await this.api(`/api/workflows/${wf.id}`, { method: 'DELETE' });
            this.loadWorkflowsList();
          }
        });

        tbody.appendChild(tr);
      }
    } catch (err) {}
  }

  async loadExecutionsList() {
    const tbody = document.getElementById('executions-table-body');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="6" style="text-align: center;">Loading...</td></tr>';

    try {
      const res = await this.api('/api/executions?limit=30');
      const executions = res.data || [];
      tbody.innerHTML = '';

      if (executions.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: #64748b;">No executions recorded yet. Run a workflow to view history.</td></tr>';
        return;
      }

      for (const ex of executions) {
        const tr = document.createElement('tr');
        const badgeClass = ex.status === 'success' ? 'badge-success' : ex.status === 'error' ? 'badge-error' : 'badge-running';

        tr.innerHTML = `
          <td><strong>${ex.workflowName}</strong></td>
          <td><span class="badge ${badgeClass}">${ex.status}</span></td>
          <td><span style="text-transform: capitalize;">${ex.mode}</span></td>
          <td>${ex.duration !== undefined ? `${ex.duration}ms` : '-'}</td>
          <td>${new Date(ex.startedAt).toLocaleString()}</td>
          <td><button class="btn btn-secondary btn-sm view-exec-btn">View Nodes</button></td>
        `;

        tr.querySelector('.view-exec-btn').addEventListener('click', async () => {
          const detailRes = await this.api(`/api/executions/${ex.id}`);
          alert(`Execution Details:\n${JSON.stringify(detailRes.data, null, 2)}`);
        });

        tbody.appendChild(tr);
      }
    } catch (err) {}
  }

  async loadCredentialsList() {
    const tbody = document.getElementById('credentials-table-body');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="4" style="text-align: center;">Loading...</td></tr>';

    try {
      const res = await this.api('/api/credentials');
      this.credentials = res.data || [];
      tbody.innerHTML = '';

      if (this.credentials.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: #64748b;">No credentials saved. Add one to use with Gemini or HTTP nodes.</td></tr>';
        return;
      }

      for (const cred of this.credentials) {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td><strong>${cred.name}</strong></td>
          <td><code>${cred.type}</code></td>
          <td>${new Date(cred.createdAt).toLocaleDateString()}</td>
          <td>
            <button class="btn btn-danger btn-sm del-cred-btn">Delete</button>
          </td>
        `;

        tr.querySelector('.del-cred-btn').addEventListener('click', async () => {
          if (confirm(`Delete credential "${cred.name}"?`)) {
            await this.api(`/api/credentials/${cred.id}`, { method: 'DELETE' });
            this.loadCredentialsList();
          }
        });

        tbody.appendChild(tr);
      }
    } catch (err) {}
  }

  // --- Gemini AI Copilot Implementation ---
  initAiCopilot() {
    const toggleBtn = document.getElementById('ai-assistant-toggle-btn');
    const canvasBtn = document.getElementById('canvas-ai-copilot-btn');
    const floatingBtn = document.getElementById('floating-ai-copilot-bubble');
    const drawer = document.getElementById('ai-copilot-drawer');
    const closeBtn = document.getElementById('close-ai-drawer-btn');
    const clearBtn = document.getElementById('clear-ai-chat-btn');
    const sendBtn = document.getElementById('ai-chat-send-btn');
    const input = document.getElementById('ai-chat-input');
    const saveKeyBtn = document.getElementById('ai-save-key-btn');

    if (!drawer) return;

    // Load persisted chat history from localStorage
    this.loadPersistedAiChat();

    // Check if drawer was previously open across refreshes
    const wasOpen = localStorage.getItem('autoflow_ai_copilot_open') === 'true';
    if (wasOpen) {
      drawer.classList.add('open');
    }

    const openDrawer = () => {
      this.switchView('editor');
      drawer.classList.add('open');
      localStorage.setItem('autoflow_ai_copilot_open', 'true');
      input?.focus();
    };

    const closeDrawer = () => {
      drawer.classList.remove('open');
      localStorage.setItem('autoflow_ai_copilot_open', 'false');
    };

    toggleBtn?.addEventListener('click', () => {
      if (drawer.classList.contains('open')) {
        closeDrawer();
      } else {
        openDrawer();
      }
    });

    canvasBtn?.addEventListener('click', () => {
      openDrawer();
    });

    floatingBtn?.addEventListener('click', () => {
      openDrawer();
    });

    closeBtn?.addEventListener('click', () => {
      closeDrawer();
    });

    clearBtn?.addEventListener('click', () => {
      if (confirm('Clear AI Copilot conversation history?')) {
        this.clearAiChat();
      }
    });

    // Quick API Key Save
    saveKeyBtn?.addEventListener('click', async () => {
      await this.saveQuickGeminiKey();
    });

    // Send button click
    sendBtn?.addEventListener('click', () => {
      const text = input.value.trim();
      if (text) {
        input.value = '';
        this.sendAiPrompt(text);
      }
    });

    // Enter to send (Shift+Enter for newline)
    input?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        const text = input.value.trim();
        if (text) {
          input.value = '';
          this.sendAiPrompt(text);
        }
      }
    });

    // Prompt chips click handler
    document.addEventListener('click', (e) => {
      const chip = e.target.closest('.ai-chip');
      if (chip && chip.dataset.prompt) {
        openDrawer();
        this.sendAiPrompt(chip.dataset.prompt);
      }
    });
  }

  loadPersistedAiChat() {
    try {
      const historyStr = localStorage.getItem('autoflow_ai_chat_history');
      if (historyStr) {
        this.aiChatHistory = JSON.parse(historyStr);
      }
      const itemsStr = localStorage.getItem('autoflow_ai_chat_items');
      if (itemsStr) {
        this.aiChatItems = JSON.parse(itemsStr);
        if (Array.isArray(this.aiChatItems) && this.aiChatItems.length > 0) {
          const chatBody = document.getElementById('ai-chat-body');
          if (chatBody) {
            chatBody.innerHTML = '';
            for (const item of this.aiChatItems) {
              this.renderPersistedMessage(item);
            }
          }
        }
      } else {
        this.aiChatItems = [];
      }
    } catch (e) {
      console.warn('Could not load persisted chat:', e);
    }
  }

  saveAiChatState() {
    try {
      localStorage.setItem('autoflow_ai_chat_history', JSON.stringify(this.aiChatHistory || []));
      localStorage.setItem('autoflow_ai_chat_items', JSON.stringify(this.aiChatItems || []));
    } catch (e) {}
  }

  clearAiChat() {
    this.aiChatHistory = [];
    this.aiChatItems = [];
    localStorage.removeItem('autoflow_ai_chat_history');
    localStorage.removeItem('autoflow_ai_chat_items');

    const chatBody = document.getElementById('ai-chat-body');
    if (chatBody) {
      chatBody.innerHTML = `
        <div class="ai-message assistant">
          <div class="ai-bubble">
            <p>👋 <strong>Welcome to AutoFlow AI Copilot!</strong></p>
            <p style="margin-top: 6px; font-size: 0.85rem; color: #cbd5e1;">Prompt me with any automation workflow requirement in plain English. I will generate and connect all nodes directly on your canvas.</p>
            <div class="ai-prompt-chips">
              <button class="ai-chip" data-prompt="Build a webhook pipeline that receives customer inquiries, uses Gemini to analyze sentiment and classify urgency, then routes urgent items to HTTP alert and non-urgent items to a log.">
                🚀 Webhook ➔ Gemini Sentiment ➔ Alert Routing
              </button>
              <button class="ai-chip" data-prompt="Create a daily scheduled workflow running every morning at 8am that fetches trending tech news via HTTP GET, summarizes top 3 stories using Gemini AI, and sends a webhook response.">
                ⏰ Daily 8am ➔ Fetch News ➔ Gemini Digest
              </button>
              <button class="ai-chip" data-prompt="Build an autonomous AI agent workflow that accepts research queries, uses built-in tools to calculate numbers and query workflow history, and returns a final verified summary.">
                🤖 Autonomous Multi-Turn AI Agent Loop
              </button>
              <button class="ai-chip" data-prompt="Add a 3-second delay and a cryptographic SHA256 hash node to the current workflow.">
                ⚡ Add Delay & Crypto Hash to current canvas
              </button>
            </div>
          </div>
        </div>
      `;
    }
  }

  renderPersistedMessage(item) {
    if (item.role === 'user') {
      this.appendAiMessage('user', item.contentHtml);
    } else {
      let html = `<p>${item.reply ? item.reply.replace(/\n/g, '<br/>') : 'Here is the generated workflow:'}</p>`;

      if (item.workflow && Array.isArray(item.workflow.nodes) && item.workflow.nodes.length > 0) {
        const wf = item.workflow;
        const nodeBadges = wf.nodes.map((n) => `<span class="ai-node-badge">${n.name}</span>`).join(' <span class="ai-node-arrow">➔</span> ');

        html += `
          <div class="ai-workflow-card">
            <div class="ai-card-title">⚡ Generated Pipeline: ${wf.name || 'Custom Workflow'}</div>
            <div style="font-size: 0.78rem; color: var(--text-muted);">${wf.description || 'Deterministic automation pipeline'} (${wf.nodes.length} nodes, ${wf.connections?.length || 0} connections)</div>
            <div class="ai-card-pipeline">${nodeBadges}</div>
            <div class="ai-card-actions">
              <button class="btn btn-primary btn-sm rebuild-ai-wf-btn">⚡ Real-Time Build</button>
              <button class="btn btn-secondary btn-sm apply-ai-wf-btn">Instant Apply</button>
              <button class="btn btn-secondary btn-sm run-ai-wf-btn">▶ Run Live</button>
            </div>
          </div>
        `;
      }

      if (Array.isArray(item.suggestedFollowUps) && item.suggestedFollowUps.length > 0) {
        html += '<div class="ai-prompt-chips" style="margin-top: 8px;">';
        for (const sugg of item.suggestedFollowUps) {
          html += `<button class="ai-chip" data-prompt="${sugg.replace(/"/g, '&quot;')}">💡 ${sugg}</button>`;
        }
        html += '</div>';
      }

      const msgEl = this.appendAiMessage('assistant', html);

      if (item.workflow && msgEl) {
        msgEl.querySelector('.rebuild-ai-wf-btn')?.addEventListener('click', async () => {
          await this.buildWorkflowInRealTime(item.workflow);
        });

        msgEl.querySelector('.apply-ai-wf-btn')?.addEventListener('click', async () => {
          await this.applyAiWorkflowToCanvas(item.workflow);
        });

        msgEl.querySelector('.run-ai-wf-btn')?.addEventListener('click', async () => {
          await this.applyAiWorkflowToCanvas(item.workflow);
          await this.executeCurrentWorkflowStream();
        });
      }
    }
  }

  async checkAiStatus() {
    const statusEl = document.getElementById('ai-key-status');
    const keyBanner = document.getElementById('ai-key-banner');

    try {
      const res = await this.api('/api/ai/assistant/status');
      if (res.connected) {
        if (statusEl) {
          statusEl.innerHTML = '<span class="status-indicator connected"></span> Gemini Connected';
        }
        if (keyBanner) keyBanner.style.display = 'none';
        return true;
      } else {
        if (statusEl) {
          statusEl.innerHTML = '<span class="status-indicator"></span> Gemini Key Required';
        }
        if (keyBanner) keyBanner.style.display = 'block';
        return false;
      }
    } catch {
      return false;
    }
  }

  async saveQuickGeminiKey() {
    const keyInput = document.getElementById('ai-quick-key-input');
    const key = keyInput?.value?.trim();
    if (!key) {
      this.toast('Please paste your Gemini API key (e.g. AIzaSy...)', 'error');
      return;
    }

    try {
      await this.api('/api/credentials', {
        method: 'POST',
        body: JSON.stringify({
          name: 'Google Gemini API Key (Copilot)',
          type: 'gemini_api_key',
          data: { apiKey: key }
        })
      });

      this.toast('Gemini API Key saved securely!', 'success');
      keyInput.value = '';
      await this.checkAiStatus();
      await this.loadCredentialsList();
    } catch (err) {
      this.toast(`Failed to save key: ${err.message}`, 'error');
    }
  }

  appendAiMessage(role, contentHtml) {
    const chatBody = document.getElementById('ai-chat-body');
    if (!chatBody) return null;

    const msgEl = document.createElement('div');
    msgEl.className = `ai-message ${role}`;

    const bubbleEl = document.createElement('div');
    bubbleEl.className = 'ai-bubble';
    bubbleEl.innerHTML = contentHtml;

    msgEl.appendChild(bubbleEl);
    chatBody.appendChild(msgEl);
    chatBody.scrollTop = chatBody.scrollHeight;
    return msgEl;
  }

  async sendAiPrompt(promptText) {
    const sendBtn = document.getElementById('ai-chat-send-btn');
    const sendIcon = document.getElementById('ai-send-icon');
    const sendSpinner = document.getElementById('ai-send-spinner');

    // 1. Render user bubble
    const userSafeText = promptText.replace(/</g, '&lt;').replace(/>/g, '&gt;');
    this.appendAiMessage('user', userSafeText);
    this.aiChatHistory.push({ role: 'user', content: promptText });
    this.aiChatItems = this.aiChatItems || [];
    this.aiChatItems.push({ role: 'user', contentHtml: userSafeText });
    this.saveAiChatState();

    // 2. Set button loading state
    if (sendBtn) sendBtn.disabled = true;
    if (sendIcon) sendIcon.style.display = 'none';
    if (sendSpinner) sendSpinner.style.display = 'inline-block';

    // 3. Temporary thinking bubble
    const thinkingMsg = this.appendAiMessage('assistant', '<span style="color: var(--text-muted);">⚡ Gemini is generating your workflow pipeline...</span>');

    try {
      const res = await this.api('/api/ai/assistant/chat', {
        method: 'POST',
        body: JSON.stringify({
          message: promptText,
          history: this.aiChatHistory,
          currentWorkflow: this.currentWorkflow
        })
      });

      thinkingMsg?.remove();

      const aiData = res.data;
      if (!aiData) {
        throw new Error('No data received from AI Assistant');
      }

      this.aiChatHistory.push({ role: 'model', content: aiData.reply || 'Workflow generated' });
      this.aiChatItems.push({
        role: 'assistant',
        reply: aiData.reply,
        workflow: aiData.workflow,
        suggestedFollowUps: aiData.suggestedFollowUps
      });
      this.saveAiChatState();

      // Build Assistant Response Card
      let html = `<p>${aiData.reply ? aiData.reply.replace(/\n/g, '<br/>') : 'Here is the generated workflow:'}</p>`;

      if (aiData.workflow && Array.isArray(aiData.workflow.nodes) && aiData.workflow.nodes.length > 0) {
        const wf = aiData.workflow;
        const nodeBadges = wf.nodes.map((n) => `<span class="ai-node-badge">${n.name}</span>`).join(' <span class="ai-node-arrow">➔</span> ');

        html += `
          <div class="ai-workflow-card">
            <div class="ai-card-title">⚡ Generated Pipeline: ${wf.name || 'Custom Workflow'}</div>
            <div style="font-size: 0.78rem; color: var(--text-muted);">${wf.description || 'Deterministic automation pipeline'} (${wf.nodes.length} nodes, ${wf.connections?.length || 0} connections)</div>
            <div class="ai-card-pipeline">${nodeBadges}</div>
            <div class="ai-live-builder">
              <div class="ai-live-builder-header">
                <span>🛠️ Copilot Live Canvas Builder</span>
                <span class="ai-builder-status" style="color: #38bdf8;">Constructing workflow...</span>
              </div>
              <div class="ai-live-builder-steps"></div>
            </div>
            <div class="ai-card-actions">
              <button class="btn btn-primary btn-sm rebuild-ai-wf-btn">⚡ Real-Time Build</button>
              <button class="btn btn-secondary btn-sm apply-ai-wf-btn">Instant Apply</button>
              <button class="btn btn-secondary btn-sm run-ai-wf-btn">▶ Run Live</button>
            </div>
          </div>
        `;
      }

      if (Array.isArray(aiData.suggestedFollowUps) && aiData.suggestedFollowUps.length > 0) {
        html += '<div class="ai-prompt-chips" style="margin-top: 8px;">';
        for (const sugg of aiData.suggestedFollowUps) {
          html += `<button class="ai-chip" data-prompt="${sugg.replace(/"/g, '&quot;')}">💡 ${sugg}</button>`;
        }
        html += '</div>';
      }

      const msgEl = this.appendAiMessage('assistant', html);

      // Auto-build the workflow on canvas in real-time node-by-node!
      if (aiData.workflow && msgEl) {
        const builderBox = msgEl.querySelector('.ai-live-builder');

        // Automatically trigger live real-time construction
        await this.buildWorkflowInRealTime(aiData.workflow, true, builderBox);

        // Bind interactive buttons
        msgEl.querySelector('.rebuild-ai-wf-btn')?.addEventListener('click', async () => {
          await this.buildWorkflowInRealTime(aiData.workflow, true, builderBox);
        });

        msgEl.querySelector('.apply-ai-wf-btn')?.addEventListener('click', async () => {
          await this.applyAiWorkflowToCanvas(aiData.workflow);
        });

        msgEl.querySelector('.run-ai-wf-btn')?.addEventListener('click', async () => {
          await this.applyAiWorkflowToCanvas(aiData.workflow);
          this.openFullscreenViewer();
          await this.executeCurrentWorkflowStream();
        });
      }
    } catch (err) {
      thinkingMsg?.remove();
      if (err.message && err.message.includes('Gemini API key')) {
        this.appendAiMessage('assistant', `
          <div style="color: #fca5a5;">
            ⚠️ <strong>Gemini API Key Required</strong><br/>
            Please enter your Gemini API key in the banner above or in the Credentials tab to enable workflow generation.
          </div>
        `);
        const banner = document.getElementById('ai-key-banner');
        if (banner) banner.style.display = 'block';
      } else {
        this.appendAiMessage('assistant', `<span style="color: #fca5a5;">⚠️ Error generating workflow: ${err.message}</span>`);
      }
    } finally {
      if (sendBtn) sendBtn.disabled = false;
      if (sendIcon) sendIcon.style.display = 'inline-block';
      if (sendSpinner) sendSpinner.style.display = 'none';
    }
  }

  async buildWorkflowInRealTime(aiWorkflow, autoSave = true, builderContainerEl = null) {
    if (!aiWorkflow || !Array.isArray(aiWorkflow.nodes) || aiWorkflow.nodes.length === 0) return;

    this.switchView('editor');

    let statusEl = null;
    let stepsEl = null;
    if (builderContainerEl) {
      statusEl = builderContainerEl.querySelector('.ai-builder-status');
      stepsEl = builderContainerEl.querySelector('.ai-live-builder-steps');
      if (stepsEl) stepsEl.innerHTML = '';
      if (statusEl) {
        statusEl.textContent = 'Constructing pipeline live...';
        statusEl.style.color = '#38bdf8';
      }
    }

    const finalNodes = aiWorkflow.nodes;
    const finalConnections = aiWorkflow.connections || [];

    // Reset canvas to begin incremental step-by-step assembly
    this.canvas.workflow = {
      id: this.currentWorkflow?.id || 'live_wf',
      name: aiWorkflow.name || 'AI Generated Workflow',
      description: aiWorkflow.description || '',
      nodes: [],
      connections: [],
      active: false
    };
    this.canvas.render();
    this.canvas.clearExecutionStatuses();

    // Sequentially place nodes one by one
    for (let i = 0; i < finalNodes.length; i++) {
      const node = finalNodes[i];
      const nodeDef = this.nodeTypes.find((nt) => nt.type === node.type) || {};

      // Add step item in Copilot chat console
      let stepItem = null;
      if (stepsEl) {
        stepItem = document.createElement('div');
        stepItem.className = 'ai-builder-step active';
        stepItem.innerHTML = `<span>⚡</span> <span>[Step ${i + 1}/${finalNodes.length}] Placing <strong>${node.name}</strong> (${nodeDef.name || node.type})...</span>`;
        stepsEl.appendChild(stepItem);
        stepsEl.scrollTop = stepsEl.scrollHeight;
      }

      // Add node to canvas state and render it into the plane
      this.canvas.workflow.nodes.push(node);
      this.canvas.renderNode(node);

      // Add glowing neon building style to the freshly placed node
      const nodeEl = document.getElementById(`node-${node.id}`);
      if (nodeEl) {
        nodeEl.classList.add('node-building');
        const badge = nodeEl.querySelector('.node-status-badge');
        if (badge) {
          badge.className = 'node-status-badge running';
          badge.textContent = '⚡ Building...';
        }
      }

      // Smoothly pan canvas camera to keep the newly created node centered
      this.canvas.panToNode(node.id);

      // Form and draw all connections that are now possible with currently placed nodes
      const placedNames = new Set(this.canvas.workflow.nodes.map((n) => n.name));
      const placedIds = new Set(this.canvas.workflow.nodes.map((n) => n.id));
      const currentAvailableConns = finalConnections.filter((c) =>
        (placedNames.has(c.source) || placedIds.has(c.source)) &&
        (placedNames.has(c.target) || placedIds.has(c.target))
      );

      this.canvas.workflow.connections = currentAvailableConns;
      this.canvas.renderConnections();

      // Highlight new wires with glowing pulse
      this.canvas.svg.querySelectorAll('.connection-path').forEach((p) => {
        p.classList.add('building-wire');
      });

      // Pause briefly so the user clearly witnesses the real-time node-by-node construction
      await new Promise((r) => setTimeout(r, 450));

      // Mark step completed in chat console
      if (stepItem) {
        stepItem.className = 'ai-builder-step done';
        stepItem.innerHTML = `<span>✓</span> <span>[Step ${i + 1}/${finalNodes.length}] Placed <strong>${node.name}</strong></span>`;
      }
      if (nodeEl) {
        const badge = nodeEl.querySelector('.node-status-badge');
        if (badge) {
          badge.className = 'node-status-badge success';
          badge.textContent = '✓ Placed';
        }
      }
    }

    // Connect any remaining connections
    this.canvas.workflow.connections = finalConnections;
    this.canvas.renderConnections();

    // Clean up temporary building classes
    document.querySelectorAll('.canvas-node').forEach((el) => el.classList.remove('node-building'));
    this.canvas.svg.querySelectorAll('.connection-path').forEach((p) => p.classList.remove('building-wire'));
    this.canvas.clearExecutionStatuses();

    if (statusEl) {
      statusEl.textContent = '✓ Construction Complete';
      statusEl.style.color = '#4ade80';
    }

    if (autoSave) {
      try {
        let savedWf;
        if (this.currentWorkflow && this.currentWorkflow.id && !this.currentWorkflow.id.startsWith('live_wf')) {
          const res = await this.api(`/api/workflows/${this.currentWorkflow.id}`, {
            method: 'PUT',
            body: JSON.stringify({
              name: aiWorkflow.name || this.currentWorkflow.name,
              description: aiWorkflow.description || this.currentWorkflow.description,
              nodes: finalNodes,
              connections: finalConnections,
              active: this.currentWorkflow.active || false
            })
          });
          savedWf = res.data;
        } else {
          const res = await this.api('/api/workflows', {
            method: 'POST',
            body: JSON.stringify({
              name: aiWorkflow.name || 'AI Generated Workflow',
              description: aiWorkflow.description,
              nodes: finalNodes,
              connections: finalConnections,
              active: false
            })
          });
          savedWf = res.data;
        }

        this.openWorkflow(savedWf);
        this.loadWorkflowsList();
        this.toast(`✨ Copilot constructed "${savedWf.name}" (${finalNodes.length} nodes) in real time!`, 'success');
      } catch (err) {
        this.toast(`Failed to save workflow: ${err.message}`, 'error');
      }
    }
  }

  async applyAiWorkflowToCanvas(aiWorkflow) {
    if (!aiWorkflow || !aiWorkflow.nodes) return;

    try {
      let savedWf;
      if (this.currentWorkflow && this.currentWorkflow.id) {
        // Update current workflow
        const payload = {
          name: aiWorkflow.name || this.currentWorkflow.name,
          description: aiWorkflow.description || this.currentWorkflow.description,
          nodes: aiWorkflow.nodes,
          connections: aiWorkflow.connections || [],
          active: this.currentWorkflow.active || false
        };
        const res = await this.api(`/api/workflows/${this.currentWorkflow.id}`, {
          method: 'PUT',
          body: JSON.stringify(payload)
        });
        savedWf = res.data;
      } else {
        // Create new workflow
        const res = await this.api('/api/workflows', {
          method: 'POST',
          body: JSON.stringify({
            name: aiWorkflow.name || 'AI Generated Workflow',
            description: aiWorkflow.description,
            nodes: aiWorkflow.nodes,
            connections: aiWorkflow.connections || [],
            active: false
          })
        });
        savedWf = res.data;
      }

      this.openWorkflow(savedWf);
      this.toast(`Applied "${savedWf.name}" to canvas!`, 'success');
      this.loadWorkflowsList();
    } catch (err) {
      this.toast(`Failed to apply workflow: ${err.message}`, 'error');
    }
  }

  // --- Fullscreen Workflow Chart & Output Viewer ---
  initFullscreenViewer() {
    const fsBtnHeader = document.getElementById('fullscreen-workflow-btn');
    const fsBtnCanvas = document.getElementById('canvas-fullscreen-btn');
    const fsModal = document.getElementById('fullscreen-workflow-modal');
    const closeBtn = document.getElementById('fs-close-btn');
    const runBtn = document.getElementById('fs-run-btn');
    const copyJsonBtn = document.getElementById('fs-copy-json-btn');

    if (!fsModal) return;

    fsBtnHeader?.addEventListener('click', () => this.openFullscreenViewer());
    fsBtnCanvas?.addEventListener('click', () => this.openFullscreenViewer());
    closeBtn?.addEventListener('click', () => this.closeFullscreenViewer());

    // Tab switching
    document.querySelectorAll('.fs-tab').forEach((tab) => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.fs-tab').forEach((t) => t.classList.remove('active'));
        document.querySelectorAll('.fs-panel').forEach((p) => p.classList.remove('active'));
        tab.classList.add('active');
        const panel = document.getElementById(`fs-panel-${tab.dataset.fstab}`);
        if (panel) panel.classList.add('active');
      });
    });

    runBtn?.addEventListener('click', async () => {
      await this.executeCurrentWorkflowStream();
      this.renderFullscreenOutput();
    });

    copyJsonBtn?.addEventListener('click', () => {
      if (!this.currentWorkflow) return;
      const jsonStr = JSON.stringify(this.currentWorkflow, null, 2);
      navigator.clipboard.writeText(jsonStr).then(() => {
        this.toast('Workflow JSON copied to clipboard!', 'success');
      }).catch(() => {
        this.toast('Unable to copy to clipboard', 'error');
      });
    });

    // Close on ESC
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && fsModal.classList.contains('open')) {
        this.closeFullscreenViewer();
      }
    });
  }

  openFullscreenViewer() {
    if (!this.currentWorkflow) {
      this.toast('No workflow currently open', 'error');
      return;
    }

    const fsModal = document.getElementById('fullscreen-workflow-modal');
    const titleEl = document.getElementById('fs-workflow-title');
    const metaEl = document.getElementById('fs-workflow-meta');

    if (titleEl) titleEl.textContent = this.currentWorkflow.name || 'Untitled Workflow';
    if (metaEl) {
      const nodeCount = this.currentWorkflow.nodes?.length || 0;
      const connCount = this.currentWorkflow.connections?.length || 0;
      metaEl.textContent = `${nodeCount} nodes · ${connCount} connections · ${this.currentWorkflow.active ? 'ACTIVE' : 'INACTIVE'}`;
    }

    this.renderFullscreenChart();
    this.renderFullscreenOutput();
    this.renderFullscreenJson();

    fsModal?.classList.add('open');
  }

  closeFullscreenViewer() {
    const fsModal = document.getElementById('fullscreen-workflow-modal');
    fsModal?.classList.remove('open');
  }

  updateFullscreenOutputIfOpen() {
    const fsModal = document.getElementById('fullscreen-workflow-modal');
    if (fsModal && fsModal.classList.contains('open')) {
      this.renderFullscreenOutput();
    }
  }

  renderFullscreenChart() {
    const container = document.getElementById('fs-chart-svg-container');
    if (!container || !this.currentWorkflow) return;

    container.innerHTML = '';
    const nodes = this.currentWorkflow.nodes || [];

    if (nodes.length === 0) {
      container.innerHTML = '<div style="color: var(--text-muted); padding: 40px; text-align: center;">Workflow is empty. Use the palette or AI Copilot to add nodes!</div>';
      return;
    }

    const grid = document.createElement('div');
    grid.className = 'fs-flowchart-grid';

    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      const nodeDef = this.nodeTypes.find((nt) => nt.type === node.type) || {};

      const card = document.createElement('div');
      card.className = 'fs-node-card status-waiting';
      card.id = `fs-card-${node.id}`;
      card.dataset.nodeId = node.id;
      card.dataset.nodeName = node.name;

      let paramSnippet = '';
      if (node.parameters) {
        const keys = Object.keys(node.parameters);
        if (keys.length > 0) {
          const sample = keys.slice(0, 2).map((k) => `<strong>${k}:</strong> ${String(node.parameters[k]).slice(0, 30)}`).join('<br/>');
          paramSnippet = `<div class="fs-node-card-body">${sample}</div>`;
        }
      }

      card.innerHTML = `
        <div class="fs-node-card-header">
          <div class="fs-node-card-icon" style="background: ${nodeDef.color || '#8b5cf6'};">⚡</div>
          <div style="overflow: hidden; flex: 1;">
            <div class="fs-node-card-name">${node.name}</div>
            <div class="fs-node-card-type">${nodeDef.name || node.type}</div>
          </div>
        </div>
        ${paramSnippet}
        <div class="fs-node-card-badge-row">
          <span class="fs-node-exec-badge status-waiting" id="fs-badge-${node.id}">WAITING</span>
          <span style="font-size: 0.7rem; color: #64748b;">Step ${i + 1}/${nodes.length}</span>
        </div>
      `;
      grid.appendChild(card);

      if (i < nodes.length - 1) {
        const nextNode = nodes[i + 1];
        const connector = document.createElement('div');
        connector.className = 'fs-chart-connector';
        connector.id = `fs-conn-${i}`;
        connector.dataset.source = node.name;
        connector.dataset.sourceId = node.id;
        connector.dataset.target = nextNode.name;
        connector.dataset.targetId = nextNode.id;
        connector.dataset.index = i;
        connector.innerHTML = `
          <div class="fs-connector-line"></div>
          <div class="fs-connector-arrow">➔</div>
        `;
        grid.appendChild(connector);
      }
    }

    container.appendChild(grid);
  }

  async executeCurrentWorkflowStream() {
    if (!this.currentWorkflow || !this.currentWorkflow.id) {
      this.toast('Please save or open a valid workflow first', 'error');
      return;
    }

    // Auto-save current configuration
    await this.saveCurrentWorkflow();

    const runBtn = document.getElementById('fs-run-btn');
    const mainRunBtn = document.getElementById('execute-workflow-btn');
    if (runBtn) {
      runBtn.disabled = true;
      runBtn.innerHTML = '<span class="fs-spin">⏳</span> Running...';
    }
    if (mainRunBtn) {
      mainRunBtn.disabled = true;
      mainRunBtn.innerHTML = '<span class="fs-spin">⏳</span> Executing...';
    }

    // Reset Fullscreen Flowchart cards & connectors to WAITING
    const nodes = this.currentWorkflow.nodes || [];
    nodes.forEach((n) => {
      const card = document.getElementById(`fs-card-${n.id}`);
      const badge = document.getElementById(`fs-badge-${n.id}`);
      if (card) {
        card.className = 'fs-node-card status-waiting';
      }
      if (badge) {
        badge.className = 'fs-node-exec-badge status-waiting';
        badge.textContent = 'WAITING';
      }
    });

    document.querySelectorAll('.fs-chart-connector').forEach((c) => {
      c.className = 'fs-chart-connector';
    });

    // Clear canvas execution indicators & connection flows
    this.canvas.clearExecutionStatuses();
    this.canvas.clearConnectionHighlights();

    // Reset live execution results state
    this.lastExecutionDetails = {
      execution: { status: 'running' },
      nodes: []
    };
    this.updateFullscreenOutputIfOpen();

    this.toast('Executing workflow with live real-time stepping...', 'info');

    return new Promise((resolve) => {
      const eventSource = new EventSource(`/api/workflows/${this.currentWorkflow.id}/execute-stream`);

      eventSource.onmessage = async (e) => {
        try {
          const data = JSON.parse(e.data);

          if (data.type === 'node_start') {
            const { nodeId, nodeName } = data;

            // 1. Fullscreen flowchart: Mark node as RUNNING
            const card = document.getElementById(`fs-card-${nodeId}`);
            const badge = document.getElementById(`fs-badge-${nodeId}`);
            if (card) {
              card.classList.remove('status-waiting', 'status-success', 'status-error');
              card.classList.add('status-running');
            }
            if (badge) {
              badge.className = 'fs-node-exec-badge status-running';
              badge.innerHTML = '<span class="fs-spin">⏳</span> RUNNING...';
            }

            // 2. Main Canvas: Mark node as running and center view on it
            this.canvas.setNodeExecutionStatus(nodeId, 'running');
            this.canvas.panToNode(nodeId);

          } else if (data.type === 'node_finish') {
            const { record } = data;
            const { nodeId, nodeName, status, duration } = record;

            // Append record to live execution details
            if (!this.lastExecutionDetails.nodes) this.lastExecutionDetails.nodes = [];
            this.lastExecutionDetails.nodes.push(record);
            this.updateFullscreenOutputIfOpen();

            // 1. Fullscreen flowchart node update
            const card = document.getElementById(`fs-card-${nodeId}`);
            const badge = document.getElementById(`fs-badge-${nodeId}`);

            if (card) {
              card.classList.remove('status-running');
              card.classList.add(status === 'success' ? 'status-success' : 'status-error');
            }
            if (badge) {
              badge.className = `fs-node-exec-badge ${status === 'success' ? 'status-success' : 'status-error'}`;
              badge.textContent = status === 'success' ? `✓ SUCCESS (${duration}ms)` : '✗ FAILED';
            }

            // 2. Main Canvas: Update node execution status
            this.canvas.setNodeExecutionStatus(nodeId, status, duration);

            // 3. Arrow update: IF SUCCESS, TURN ARROW VIBRANT GREEN!
            if (status === 'success') {
              // Find outgoing connector in flowchart
              const connectors = document.querySelectorAll('.fs-chart-connector');
              connectors.forEach((conn) => {
                if (conn.dataset.source === nodeName || conn.dataset.sourceId === nodeId) {
                  conn.classList.remove('status-running', 'status-error');
                  conn.classList.add('status-success');
                }
              });

              // On main canvas: turn connection wire to vibrant glowing green active flow!
              this.canvas.highlightConnection(nodeName, null, 'success');
            } else {
              // Outgoing connector turns red error
              const connectors = document.querySelectorAll('.fs-chart-connector');
              connectors.forEach((conn) => {
                if (conn.dataset.source === nodeName || conn.dataset.sourceId === nodeId) {
                  conn.classList.add('status-error');
                }
              });
            }

            // Visual pause so the real-time progression from one node to the next is clearly observable
            await new Promise((r) => setTimeout(r, 450));

          } else if (data.type === 'complete') {
            eventSource.close();
            this.lastExecutionDetails = data.execution;
            this.editor.setExecutionResults(data.execution);
            this.updateFullscreenOutputIfOpen();

            if (runBtn) {
              runBtn.disabled = false;
              runBtn.innerHTML = '▶ Run Workflow';
            }
            if (mainRunBtn) {
              mainRunBtn.disabled = false;
              mainRunBtn.innerHTML = '▶ Test Workflow';
            }

            const exec = data.execution?.execution;
            if (exec?.status === 'success') {
              this.toast(`Workflow successfully completed in ${exec.duration}ms!`, 'success');
            } else {
              this.toast(`Workflow completed with error: ${exec?.errorMessage || 'Check output tab'}`, 'error');
            }
            resolve();

          } else if (data.type === 'error') {
            eventSource.close();
            if (runBtn) {
              runBtn.disabled = false;
              runBtn.innerHTML = '▶ Run Workflow';
            }
            if (mainRunBtn) {
              mainRunBtn.disabled = false;
              mainRunBtn.innerHTML = '▶ Test Workflow';
            }
            this.toast(`Stream error: ${data.error}`, 'error');
            resolve();
          }
        } catch (err) {
          console.error('Error handling stream event:', err);
        }
      };

      eventSource.onerror = async () => {
        eventSource.close();
        if (runBtn) {
          runBtn.disabled = false;
          runBtn.innerHTML = '▶ Run Workflow';
        }
        if (mainRunBtn) {
          mainRunBtn.disabled = false;
          mainRunBtn.innerHTML = '▶ Test Workflow';
        }
        // Fallback to standard execution if stream failed to connect
        await this.executeCurrentWorkflow();
        resolve();
      };
    });
  }

  renderFullscreenOutput() {
    const sidebar = document.getElementById('fs-output-nodes-list');
    const header = document.getElementById('fs-output-selected-node-title');
    const code = document.getElementById('fs-output-code-viewer');

    if (!sidebar || !code || !this.currentWorkflow) return;

    sidebar.innerHTML = '';
    const nodes = this.currentWorkflow.nodes || [];
    const executionNodes = this.lastExecutionDetails?.nodes || [];

    if (nodes.length === 0) {
      sidebar.innerHTML = '<div style="color: #64748b; font-size: 0.8rem;">No nodes in workflow</div>';
      code.textContent = '// Empty workflow';
      return;
    }

    nodes.forEach((node, idx) => {
      const execRecord = executionNodes.find((nr) => nr.nodeId === node.id || nr.nodeName === node.name);
      const pill = document.createElement('div');
      pill.className = `fs-node-pill ${idx === 0 ? 'active' : ''}`;

      const status = execRecord ? execRecord.status : 'waiting';
      const duration = execRecord && execRecord.duration ? `${execRecord.duration}ms` : '';

      pill.innerHTML = `
        <div>
          <div style="font-weight: 600; font-size: 0.82rem;">${node.name}</div>
          <div style="font-size: 0.72rem; color: #94a3b8;">${node.type}</div>
        </div>
        <span class="fs-node-pill-status ${status}">${status} ${duration}</span>
      `;

      pill.addEventListener('click', () => {
        sidebar.querySelectorAll('.fs-node-pill').forEach((p) => p.classList.remove('active'));
        pill.classList.add('active');

        if (header) header.textContent = `Output Data: ${node.name} (${node.type})`;

        if (execRecord) {
          const displayObj = {
            status: execRecord.status,
            duration: execRecord.duration ? `${execRecord.duration}ms` : undefined,
            error: execRecord.error,
            inputData: execRecord.inputData,
            outputData: execRecord.outputData
          };
          code.textContent = JSON.stringify(displayObj, null, 2);
        } else {
          code.textContent = `// Node "${node.name}" has not executed yet.\n// Click "▶ Run Workflow" above to execute and inspect live data.`;
        }
      });

      sidebar.appendChild(pill);

      if (idx === 0) {
        if (header) header.textContent = `Output Data: ${node.name} (${node.type})`;
        if (execRecord) {
          const displayObj = {
            status: execRecord.status,
            duration: execRecord.duration ? `${execRecord.duration}ms` : undefined,
            error: execRecord.error,
            inputData: execRecord.inputData,
            outputData: execRecord.outputData
          };
          code.textContent = JSON.stringify(displayObj, null, 2);
        } else {
          code.textContent = `// Node "${node.name}" has not executed yet.\n// Click "▶ Run Workflow" above to execute and inspect live data.`;
        }
      }
    });
  }

  renderFullscreenJson() {
    const viewer = document.getElementById('fs-json-code-viewer');
    if (!viewer || !this.currentWorkflow) return;
    viewer.textContent = JSON.stringify(this.currentWorkflow, null, 2);
  }
}

// Start application when DOM is ready
window.addEventListener('DOMContentLoaded', () => {
  window.app = new AutoFlowApp();
});
