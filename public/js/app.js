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

    this.initUI();
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
      this.executeCurrentWorkflow();
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
          model: 'gemini-2.5-flash',
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
      this.editor.setExecutionResults(details);

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
}

// Start application when DOM is ready
window.addEventListener('DOMContentLoaded', () => {
  window.app = new AutoFlowApp();
});
