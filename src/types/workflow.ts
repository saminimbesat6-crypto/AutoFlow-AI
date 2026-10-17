export type PortType = 'main' | 'ai' | 'tool';

export interface PortDefinition {
  name: string;
  type: PortType;
  label?: string;
}

export interface PropertyDefinition {
  name: string;
  displayName: string;
  type: 'string' | 'number' | 'boolean' | 'options' | 'json' | 'code' | 'credential' | 'collection';
  default?: any;
  description?: string;
  placeholder?: string;
  options?: Array<{ name: string; value: any; description?: string }>;
  credentialType?: string;
  required?: boolean;
}

export interface NodePosition {
  x: number;
  y: number;
}

export interface WorkflowNode {
  id: string;
  name: string;
  type: string;
  position: NodePosition;
  parameters: Record<string, any>;
  credentials?: Record<string, string>; // credentialType -> credentialId
  disabled?: boolean;
  notes?: string;
  continueOnFail?: boolean;
  retryOnFail?: boolean;
  maxTries?: number;
  waitBetweenTries?: number;
}

export interface Connection {
  source: string;       // source node name or ID
  sourceOutput: number; // output index (0, 1, ...)
  target: string;       // target node name or ID
  targetInput: number;  // input index
  type?: PortType;      // defaults to 'main'
}

export interface WorkflowSettings {
  executionTimeout?: number; // seconds
  saveExecutionProgress?: boolean;
  saveManualExecutions?: boolean;
  timezone?: string;
  errorWorkflow?: string;
}

export interface Workflow {
  id: string;
  name: string;
  description?: string;
  nodes: WorkflowNode[];
  connections: Connection[];
  settings: WorkflowSettings;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface DataItem {
  json: Record<string, any>;
  binary?: Record<string, {
    data: string; // base64
    mimeType: string;
    fileName?: string;
    fileSize?: number;
  }>;
  pairedItem?: number;
}

export type NodeOutput = DataItem[][]; // array of outputs (for branching: output[0] = true branch, output[1] = false branch)

export type ExecutionMode = 'manual' | 'webhook' | 'schedule' | 'test';
export type ExecutionStatus = 'pending' | 'running' | 'success' | 'error' | 'cancelled';

export interface ExecutionRecord {
  id: string;
  workflowId: string;
  workflowName: string;
  mode: ExecutionMode;
  status: ExecutionStatus;
  startedAt: string;
  finishedAt?: string;
  duration?: number;
  errorMessage?: string;
  data?: Record<string, any>;
}

export interface NodeExecutionRecord {
  id: string;
  executionId: string;
  nodeId: string;
  nodeName: string;
  nodeType: string;
  status: 'waiting' | 'running' | 'success' | 'error';
  inputData?: DataItem[];
  outputData?: NodeOutput;
  error?: string;
  startedAt?: string;
  finishedAt?: string;
  duration?: number;
}
