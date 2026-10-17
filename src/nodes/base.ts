import { DataItem, NodeOutput, PortDefinition, PropertyDefinition, WorkflowNode } from '../types/workflow';
import { NodeExecutionContext } from '../engine/context';

export type NodeCategory = 'trigger' | 'core' | 'action' | 'ai' | 'transform';

export interface INodeDefinition {
  type: string;
  name: string;
  description: string;
  category: NodeCategory;
  icon: string;
  color: string;
  inputs: PortDefinition[];
  outputs: PortDefinition[];
  properties: PropertyDefinition[];
  execute(context: NodeExecutionContext): Promise<NodeOutput>;
}

export abstract class BaseNode implements INodeDefinition {
  abstract type: string;
  abstract name: string;
  abstract description: string;
  abstract category: NodeCategory;
  abstract icon: string;
  abstract color: string;
  abstract inputs: PortDefinition[];
  abstract outputs: PortDefinition[];
  abstract properties: PropertyDefinition[];

  abstract execute(context: NodeExecutionContext): Promise<NodeOutput>;
}
