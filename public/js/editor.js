class WorkflowEditor {
  constructor(canvas, apiClient) {
    this.canvas = canvas;
    this.api = apiClient;

    this.paletteEl = document.getElementById('palette-categories');
    this.paletteSearchInput = document.getElementById('palette-search');
    this.nodeDrawer = document.getElementById('node-drawer');
    this.drawerTitle = document.getElementById('drawer-node-title');
    this.drawerForm = document.getElementById('drawer-form');
    this.closeDrawerBtn = document.getElementById('close-drawer-btn');
    this.deleteNodeBtn = document.getElementById('drawer-delete-node-btn');

    this.debugPanel = document.getElementById('debug-panel');
    this.debugNodeTitle = document.getElementById('debug-node-title');
    this.debugInputData = document.getElementById('debug-input-data');
    this.debugOutputData = document.getElementById('debug-output-data');
    this.closeDebugBtn = document.getElementById('close-debug-btn');

    this.currentNode = null;
    this.nodeTypes = [];
    this.credentials = [];
    this.lastExecutionDetails = null;

    this.initEvents();
  }

  async init(nodeTypes, credentials) {
    this.nodeTypes = nodeTypes;
    this.credentials = credentials;
    this.renderPalette(nodeTypes);
  }

  initEvents() {
    this.closeDrawerBtn.addEventListener('click', () => this.closeDrawer());
    this.closeDebugBtn.addEventListener('click', () => this.closeDebug());

    this.deleteNodeBtn.addEventListener('click', () => {
      if (this.currentNode) {
        this.canvas.deleteNode(this.currentNode.id);
        this.closeDrawer();
      }
    });

    this.paletteSearchInput.addEventListener('input', (e) => {
      const q = e.target.value.toLowerCase().trim();
      const filtered = this.nodeTypes.filter(
        (nt) => nt.name.toLowerCase().includes(q) || nt.description.toLowerCase().includes(q)
      );
      this.renderPalette(filtered);
    });

    // Wire up canvas selection callback
    this.canvas.onNodeSelect = (node) => {
      if (node) {
        this.openDrawer(node);
        this.showNodeDebug(node);
      } else {
        this.closeDrawer();
      }
    };
  }

  renderPalette(nodeTypes) {
    this.paletteEl.innerHTML = '';

    const categories = {
      trigger: { title: 'Triggers', items: [] },
      core: { title: 'Core Logic', items: [] },
      ai: { title: 'Gemini AI', items: [] },
      action: { title: 'Actions & Network', items: [] },
      transform: { title: 'Data Transformation', items: [] }
    };

    for (const nt of nodeTypes) {
      const cat = categories[nt.category] || categories.core;
      cat.items.push(nt);
    }

    for (const [catKey, cat] of Object.entries(categories)) {
      if (cat.items.length === 0) continue;

      const titleEl = document.createElement('div');
      titleEl.className = 'palette-category-title';
      titleEl.textContent = cat.title;
      this.paletteEl.appendChild(titleEl);

      for (const item of cat.items) {
        const itemEl = document.createElement('div');
        itemEl.className = 'palette-item';
        itemEl.innerHTML = `
          <div class="node-icon" style="background: ${item.color || '#3b82f6'}; width: 22px; height: 22px; font-size: 11px;">⚡</div>
          <div style="overflow: hidden;">
            <div class="palette-item-name">${item.name}</div>
            <div class="palette-item-desc">${item.description}</div>
          </div>
        `;

        itemEl.addEventListener('click', () => {
          this.addNodeToCanvas(item.type);
        });

        this.paletteEl.appendChild(itemEl);
      }
    }
  }

  addNodeToCanvas(nodeType) {
    const nodeDef = this.nodeTypes.find((nt) => nt.type === nodeType);
    if (!nodeDef) return;

    // Generate unique name
    const count = this.canvas.workflow.nodes.filter((n) => n.type === nodeType).length + 1;
    const name = count === 1 ? nodeDef.name : `${nodeDef.name} ${count}`;

    // Compute center coordinates on canvas
    const containerRect = this.canvas.container.getBoundingClientRect();
    const centerScreen = {
      x: containerRect.left + containerRect.width / 2 + (Math.random() * 60 - 30),
      y: containerRect.top + containerRect.height / 2 + (Math.random() * 60 - 30)
    };
    const canvasPos = this.canvas.screenToCanvas(centerScreen.x, centerScreen.y);

    const defaultParams = {};
    for (const prop of nodeDef.properties || []) {
      if (prop.default !== undefined) {
        defaultParams[prop.name] = prop.default;
      }
    }

    const newNode = {
      id: 'node_' + Math.random().toString(36).substring(2, 10),
      name,
      type: nodeType,
      position: { x: Math.round(canvasPos.x), y: Math.round(canvasPos.y) },
      parameters: defaultParams,
      credentials: {},
      disabled: false
    };

    this.canvas.workflow.nodes.push(newNode);
    this.canvas.render();
    this.canvas.selectNode(newNode.id);
  }

  openDrawer(node) {
    this.currentNode = node;
    const nodeDef = this.nodeTypes.find((nt) => nt.type === node.type);
    this.drawerTitle.textContent = `${nodeDef?.name || node.type} Settings`;

    this.drawerForm.innerHTML = '';

    // Node Display Name Field
    const nameGroup = document.createElement('div');
    nameGroup.className = 'form-group';
    nameGroup.innerHTML = `
      <label class="form-label">Node Name</label>
      <input type="text" class="form-control" id="prop-node-name" value="${node.name}" />
    `;
    const nameInput = nameGroup.querySelector('#prop-node-name');
    nameInput.addEventListener('change', (e) => {
      const oldName = node.name;
      const newName = e.target.value.trim() || oldName;
      node.name = newName;

      // Update connections that reference old name
      for (const conn of this.canvas.workflow.connections) {
        if (conn.source === oldName) conn.source = newName;
        if (conn.target === oldName) conn.target = newName;
      }

      this.canvas.render();
    });
    this.drawerForm.appendChild(nameGroup);

    // Render properties defined in node schema
    if (nodeDef && nodeDef.properties) {
      for (const prop of nodeDef.properties) {
        const group = document.createElement('div');
        group.className = 'form-group';

        const currentValue = node.parameters?.[prop.name] !== undefined
          ? node.parameters[prop.name]
          : (prop.default !== undefined ? prop.default : '');

        let inputHtml = '';
        if (prop.type === 'options') {
          const opts = (prop.options || []).map(
            (o) => `<option value="${o.value}" ${String(o.value) === String(currentValue) ? 'selected' : ''}>${o.name}</option>`
          ).join('');
          inputHtml = `<select class="form-control" data-prop="${prop.name}">${opts}</select>`;
        } else if (prop.type === 'boolean') {
          inputHtml = `
            <select class="form-control" data-prop="${prop.name}">
              <option value="true" ${Boolean(currentValue) ? 'selected' : ''}>True (Yes)</option>
              <option value="false" ${!Boolean(currentValue) ? 'selected' : ''}>False (No)</option>
            </select>
          `;
        } else if (prop.type === 'json' || prop.type === 'code') {
          const formatted = typeof currentValue === 'object' ? JSON.stringify(currentValue, null, 2) : String(currentValue);
          inputHtml = `<textarea class="form-control" rows="5" data-prop="${prop.name}">${formatted}</textarea>`;
        } else if (prop.type === 'credential') {
          const credOpts = this.credentials.map(
            (c) => `<option value="${c.id}" ${node.credentials?.[prop.credentialType || c.type] === c.id ? 'selected' : ''}>${c.name} (${c.type})</option>`
          );
          inputHtml = `
            <select class="form-control" data-cred="true">
              <option value="">-- Select Credential --</option>
              ${credOpts.join('')}
            </select>
          `;
        } else {
          inputHtml = `<input type="${prop.type === 'number' ? 'number' : 'text'}" class="form-control" data-prop="${prop.name}" value="${currentValue}" />`;
        }

        group.innerHTML = `
          <label class="form-label">${prop.displayName}</label>
          ${inputHtml}
          ${prop.description ? `<div style="font-size: 0.72rem; color: #64748b; margin-top: 4px;">${prop.description}</div>` : ''}
        `;

        // Bind update listener
        const inputEl = group.querySelector('[data-prop]');
        if (inputEl) {
          inputEl.addEventListener('change', (e) => {
            let val = e.target.value;
            if (prop.type === 'boolean') val = val === 'true';
            if (prop.type === 'number') val = Number(val);
            if (!node.parameters) node.parameters = {};
            node.parameters[prop.name] = val;
          });
        }

        const credEl = group.querySelector('[data-cred]');
        if (credEl) {
          credEl.addEventListener('change', (e) => {
            const credId = e.target.value;
            if (!node.credentials) node.credentials = {};
            const credObj = this.credentials.find((c) => c.id === credId);
            if (credObj) {
              node.credentials[credObj.type] = credId;
            } else {
              node.credentials = {};
            }
          });
        }

        this.drawerForm.appendChild(group);
      }
    }

    this.nodeDrawer.classList.add('open');
  }

  closeDrawer() {
    this.nodeDrawer.classList.remove('open');
    this.currentNode = null;
  }

  showNodeDebug(node) {
    if (!this.lastExecutionDetails) return;

    const nodeRecord = this.lastExecutionDetails.nodes?.find(
      (nr) => nr.nodeId === node.id || nr.nodeName === node.name
    );

    this.debugNodeTitle.textContent = `Execution Data: ${node.name}`;

    if (nodeRecord) {
      this.debugInputData.textContent = nodeRecord.inputData
        ? JSON.stringify(nodeRecord.inputData, null, 2)
        : '(No input data recorded)';

      if (nodeRecord.status === 'error') {
        this.debugOutputData.textContent = `ERROR:\n${nodeRecord.error || 'Unknown error'}`;
        this.debugOutputData.style.color = '#ef4444';
      } else {
        this.debugOutputData.textContent = nodeRecord.outputData
          ? JSON.stringify(nodeRecord.outputData, null, 2)
          : '(No output data)';
        this.debugOutputData.style.color = '#cbd5e1';
      }
      this.debugPanel.classList.add('open');
    } else {
      this.debugInputData.textContent = '(This node was not reached during the last execution)';
      this.debugOutputData.textContent = '(No output)';
    }
  }

  closeDebug() {
    this.debugPanel.classList.remove('open');
  }

  setExecutionResults(details) {
    this.lastExecutionDetails = details;
    if (this.currentNode) {
      this.showNodeDebug(this.currentNode);
    }
  }
}
