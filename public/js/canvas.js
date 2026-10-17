class WorkflowCanvas {
  constructor(containerEl, svgEl) {
    this.container = containerEl;
    this.svg = svgEl;
    this.plane = containerEl.querySelector('.canvas-plane');

    this.panX = 100;
    this.panY = 80;
    this.scale = 1.0;
    this.isPanning = false;
    this.startX = 0;
    this.startY = 0;

    this.workflow = null;
    this.nodeTypes = new Map();
    this.selectedNodeId = null;
    this.selectedConnectionIndex = null;

    this.draggingNode = null;
    this.dragOffsetX = 0;
    this.dragOffsetY = 0;

    // Connecting state
    this.isConnecting = false;
    this.connectSourceNode = null;
    this.connectSourceOutput = 0;
    this.tempConnectionPath = null;

    // Callbacks
    this.onNodeSelect = null;
    this.onNodeChange = null;
    this.onConnectionCreate = null;
    this.onConnectionDelete = null;

    this.initEvents();
    this.updateTransform();
  }

  setNodeTypes(types) {
    this.nodeTypes.clear();
    for (const t of types) {
      this.nodeTypes.set(t.type, t);
    }
  }

  loadWorkflow(workflow) {
    this.workflow = workflow;
    this.selectedNodeId = null;
    this.selectedConnectionIndex = null;
    this.render();
  }

  initEvents() {
    // Canvas Panning via Middle click or Space+Drag or background Drag
    this.container.addEventListener('mousedown', (e) => {
      if (e.target === this.container || e.target === this.svg || e.target.classList.contains('canvas-plane')) {
        this.isPanning = true;
        this.startX = e.clientX - this.panX;
        this.startY = e.clientY - this.panY;
        this.container.classList.add('panning');
        this.deselectAll();
      }
    });

    window.addEventListener('mousemove', (e) => {
      if (this.isPanning) {
        this.panX = e.clientX - this.startX;
        this.panY = e.clientY - this.startY;
        this.updateTransform();
      } else if (this.draggingNode) {
        const mouseCanvas = this.screenToCanvas(e.clientX, e.clientY);
        const node = this.workflow.nodes.find((n) => n.id === this.draggingNode.id);
        if (node) {
          node.position.x = Math.round(mouseCanvas.x - this.dragOffsetX);
          node.position.y = Math.round(mouseCanvas.y - this.dragOffsetY);
          this.updateNodePosition(node);
          this.renderConnections();
        }
      } else if (this.isConnecting && this.tempConnectionPath) {
        const mouseCanvas = this.screenToCanvas(e.clientX, e.clientY);
        const sourcePos = this.getSourcePortPosition(this.connectSourceNode, this.connectSourceOutput);
        this.updateTempConnection(sourcePos.x, sourcePos.y, mouseCanvas.x, mouseCanvas.y);
      }
    });

    window.addEventListener('mouseup', () => {
      if (this.isPanning) {
        this.isPanning = false;
        this.container.classList.remove('panning');
      }
      if (this.draggingNode) {
        this.draggingNode = null;
        if (this.onNodeChange) this.onNodeChange();
      }
      if (this.isConnecting) {
        this.cancelConnecting();
      }
    });

    // Zooming via Wheel
    this.container.addEventListener('wheel', (e) => {
      e.preventDefault();
      const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
      const newScale = Math.min(Math.max(this.scale * zoomFactor, 0.3), 2.5);

      const rect = this.container.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      this.panX = mouseX - (mouseX - this.panX) * (newScale / this.scale);
      this.panY = mouseY - (mouseY - this.panY) * (newScale / this.scale);
      this.scale = newScale;

      this.updateTransform();
    }, { passive: false });

    // Keyboard delete
    window.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (this.selectedNodeId) {
          this.deleteNode(this.selectedNodeId);
        } else if (this.selectedConnectionIndex !== null) {
          this.deleteConnection(this.selectedConnectionIndex);
        }
      }
    });
  }

  screenToCanvas(screenX, screenY) {
    const rect = this.container.getBoundingClientRect();
    return {
      x: (screenX - rect.left - this.panX) / this.scale,
      y: (screenY - rect.top - this.panY) / this.scale
    };
  }

  updateTransform() {
    this.plane.style.transform = `translate(${this.panX}px, ${this.panY}px) scale(${this.scale})`;
  }

  render() {
    if (!this.workflow) return;

    // Clear existing nodes in DOM plane
    const existingNodes = this.plane.querySelectorAll('.canvas-node');
    existingNodes.forEach((n) => n.remove());

    // Render Nodes
    for (const node of this.workflow.nodes) {
      this.renderNode(node);
    }

    // Render Connections
    this.renderConnections();
  }

  renderNode(node) {
    const nodeDef = this.nodeTypes.get(node.type) || {
      name: node.name,
      category: 'core',
      color: '#3b82f6',
      icon: 'box',
      inputs: [{ name: 'main', type: 'main' }],
      outputs: [{ name: 'main', type: 'main' }]
    };

    const nodeEl = document.createElement('div');
    nodeEl.className = 'canvas-node';
    nodeEl.id = `node-${node.id}`;
    if (this.selectedNodeId === node.id) nodeEl.classList.add('selected');

    nodeEl.style.left = `${node.position.x}px`;
    nodeEl.style.top = `${node.position.y}px`;

    // Header color bar
    const categoryColor = nodeDef.color || '#3b82f6';

    nodeEl.innerHTML = `
      <div class="node-header" style="border-top: 3px solid ${categoryColor}">
        <div class="node-title-group">
          <div class="node-icon" style="background: ${categoryColor}">⚡</div>
          <div class="node-name" title="${node.name}">${node.name}</div>
        </div>
      </div>
      <div class="node-type-label">${nodeDef.name}</div>
      <div class="node-status-badge"></div>
      <div class="node-ports-container"></div>
    `;

    // Input and Output Ports
    const portsContainer = nodeEl.querySelector('.node-ports-container');
    const inputs = nodeDef.inputs || [];
    const outputs = nodeDef.outputs || [];

    // Render input ports (left)
    inputs.forEach((inp, idx) => {
      const port = document.createElement('div');
      port.className = 'node-port input';
      port.title = inp.name || 'Input';
      port.dataset.nodeId = node.id;
      port.dataset.portIndex = idx;
      port.dataset.portType = 'input';
      port.style.top = `${idx * 24 - 40}px`;

      port.addEventListener('mouseup', (e) => {
        e.stopPropagation();
        if (this.isConnecting && this.connectSourceNode) {
          this.completeConnection(this.connectSourceNode, this.connectSourceOutput, node, idx);
        }
      });

      portsContainer.appendChild(port);
    });

    // Render output ports (right)
    outputs.forEach((out, idx) => {
      const port = document.createElement('div');
      port.className = 'node-port output';
      port.title = out.label || out.name || 'Output';
      port.dataset.nodeId = node.id;
      port.dataset.portIndex = idx;
      port.dataset.portType = 'output';
      port.style.top = `${idx * 24 - 40}px`;

      port.addEventListener('mousedown', (e) => {
        e.stopPropagation();
        this.startConnecting(node, idx);
      });

      portsContainer.appendChild(port);
    });

    // Node drag and select events
    nodeEl.addEventListener('mousedown', (e) => {
      if (e.target.classList.contains('node-port')) return;
      e.stopPropagation();

      this.selectNode(node.id);

      this.draggingNode = node;
      const mouseCanvas = this.screenToCanvas(e.clientX, e.clientY);
      this.dragOffsetX = mouseCanvas.x - node.position.x;
      this.dragOffsetY = mouseCanvas.y - node.position.y;
    });

    this.plane.appendChild(nodeEl);
  }

  updateNodePosition(node) {
    const el = document.getElementById(`node-${node.id}`);
    if (el) {
      el.style.left = `${node.position.x}px`;
      el.style.top = `${node.position.y}px`;
    }
  }

  renderConnections() {
    this.svg.innerHTML = '';

    if (!this.workflow || !this.workflow.connections) return;

    this.workflow.connections.forEach((conn, index) => {
      const sourceNode = this.workflow.nodes.find((n) => n.name === conn.source || n.id === conn.source);
      const targetNode = this.workflow.nodes.find((n) => n.name === conn.target || n.id === conn.target);

      if (sourceNode && targetNode) {
        const sourcePos = this.getSourcePortPosition(sourceNode, conn.sourceOutput || 0);
        const targetPos = this.getTargetPortPosition(targetNode, conn.targetInput || 0);

        const pathEl = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        pathEl.setAttribute('d', this.calculateBezierPath(sourcePos.x, sourcePos.y, targetPos.x, targetPos.y));
        pathEl.setAttribute('class', 'connection-path');
        if (this.selectedConnectionIndex === index) {
          pathEl.style.stroke = '#ef4444';
          pathEl.style.strokeWidth = '4px';
        }

        pathEl.addEventListener('click', (e) => {
          e.stopPropagation();
          this.selectConnection(index);
        });

        this.svg.appendChild(pathEl);
      }
    });
  }

  getSourcePortPosition(node, outputIndex) {
    const x = node.position.x + 220; // right edge of node
    const y = node.position.y + 35 + (outputIndex * 24);
    return { x, y };
  }

  getTargetPortPosition(node, inputIndex) {
    const x = node.position.x; // left edge of node
    const y = node.position.y + 35 + (inputIndex * 24);
    return { x, y };
  }

  calculateBezierPath(x1, y1, x2, y2) {
    const dx = Math.max(Math.abs(x2 - x1) * 0.5, 40);
    return `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
  }

  startConnecting(node, outputIndex) {
    this.isConnecting = true;
    this.connectSourceNode = node;
    this.connectSourceOutput = outputIndex;

    const sourcePos = this.getSourcePortPosition(node, outputIndex);
    this.tempConnectionPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    this.tempConnectionPath.setAttribute('class', 'connection-path active-flow');
    this.tempConnectionPath.setAttribute('d', this.calculateBezierPath(sourcePos.x, sourcePos.y, sourcePos.x, sourcePos.y));
    this.svg.appendChild(this.tempConnectionPath);
  }

  updateTempConnection(x1, y1, x2, y2) {
    if (this.tempConnectionPath) {
      this.tempConnectionPath.setAttribute('d', this.calculateBezierPath(x1, y1, x2, y2));
    }
  }

  cancelConnecting() {
    this.isConnecting = false;
    this.connectSourceNode = null;
    if (this.tempConnectionPath) {
      this.tempConnectionPath.remove();
      this.tempConnectionPath = null;
    }
  }

  completeConnection(sourceNode, sourceOutput, targetNode, targetInput) {
    this.cancelConnecting();

    if (sourceNode.id === targetNode.id) return; // Prevent self-loop

    // Check if connection already exists
    const exists = this.workflow.connections.some(
      (c) =>
        (c.source === sourceNode.name || c.source === sourceNode.id) &&
        (c.target === targetNode.name || c.target === targetNode.id) &&
        c.sourceOutput === sourceOutput &&
        c.targetInput === targetInput
    );

    if (!exists) {
      this.workflow.connections.push({
        source: sourceNode.name,
        sourceOutput,
        target: targetNode.name,
        targetInput
      });

      this.renderConnections();
      if (this.onConnectionCreate) this.onConnectionCreate();
    }
  }

  selectNode(nodeId) {
    this.selectedNodeId = nodeId;
    this.selectedConnectionIndex = null;

    document.querySelectorAll('.canvas-node').forEach((el) => {
      el.classList.toggle('selected', el.id === `node-${nodeId}`);
    });

    this.renderConnections();

    if (this.onNodeSelect) {
      const node = this.workflow.nodes.find((n) => n.id === nodeId);
      this.onNodeSelect(node);
    }
  }

  selectConnection(index) {
    this.selectedConnectionIndex = index;
    this.selectedNodeId = null;
    document.querySelectorAll('.canvas-node').forEach((el) => el.classList.remove('selected'));
    this.renderConnections();

    if (this.onNodeSelect) this.onNodeSelect(null);
  }

  deselectAll() {
    this.selectedNodeId = null;
    this.selectedConnectionIndex = null;
    document.querySelectorAll('.canvas-node').forEach((el) => el.classList.remove('selected'));
    this.renderConnections();
    if (this.onNodeSelect) this.onNodeSelect(null);
  }

  deleteNode(nodeId) {
    const nodeIndex = this.workflow.nodes.findIndex((n) => n.id === nodeId);
    if (nodeIndex === -1) return;

    const node = this.workflow.nodes[nodeIndex];
    // Remove node
    this.workflow.nodes.splice(nodeIndex, 1);

    // Remove any connections attached to this node
    this.workflow.connections = this.workflow.connections.filter(
      (c) => c.source !== node.name && c.source !== node.id && c.target !== node.name && c.target !== node.id
    );

    this.selectedNodeId = null;
    this.render();
    if (this.onNodeChange) this.onNodeChange();
    if (this.onNodeSelect) this.onNodeSelect(null);
  }

  deleteConnection(index) {
    if (index >= 0 && index < this.workflow.connections.length) {
      this.workflow.connections.splice(index, 1);
      this.selectedConnectionIndex = null;
      this.renderConnections();
      if (this.onConnectionDelete) this.onConnectionDelete();
    }
  }

  setNodeExecutionStatus(nodeId, status, duration = null) {
    const nodeEl = document.getElementById(`node-${nodeId}`);
    if (!nodeEl) return;

    const badge = nodeEl.querySelector('.node-status-badge');
    if (!badge) return;

    badge.className = `node-status-badge ${status}`;
    if (status === 'running') {
      badge.textContent = 'Running...';
    } else if (status === 'success') {
      badge.textContent = duration ? `✓ Done (${duration}ms)` : '✓ Success';
    } else if (status === 'error') {
      badge.textContent = '✗ Error';
    } else {
      badge.className = 'node-status-badge';
      badge.textContent = '';
    }
  }

  clearExecutionStatuses() {
    document.querySelectorAll('.node-status-badge').forEach((badge) => {
      badge.className = 'node-status-badge';
      badge.textContent = '';
    });
  }
}
