import { DatabaseSync } from 'node:sqlite';
import { v4 as uuidv4 } from 'uuid';
import { getDatabase } from '../connection';
import { Workflow } from '../../types/workflow';

export class WorkflowRepository {
  private db: DatabaseSync;

  constructor(db?: DatabaseSync) {
    this.db = db || getDatabase();
  }

  create(workflow: Omit<Workflow, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }): Workflow {
    const id = workflow.id || uuidv4();
    const now = new Date().toISOString();

    const stmt = this.db.prepare(`
      INSERT INTO workflows (id, name, description, nodes, connections, settings, active, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      id,
      workflow.name,
      workflow.description || null,
      JSON.stringify(workflow.nodes || []),
      JSON.stringify(workflow.connections || []),
      JSON.stringify(workflow.settings || {}),
      workflow.active ? 1 : 0,
      now,
      now
    );

    return {
      id,
      name: workflow.name,
      description: workflow.description,
      nodes: workflow.nodes || [],
      connections: workflow.connections || [],
      settings: workflow.settings || {},
      active: !!workflow.active,
      createdAt: now,
      updatedAt: now
    };
  }

  update(id: string, updates: Partial<Workflow>): Workflow | null {
    const existing = this.getById(id);
    if (!existing) return null;

    const now = new Date().toISOString();
    const name = updates.name !== undefined ? updates.name : existing.name;
    const description = updates.description !== undefined ? updates.description : existing.description;
    const nodes = updates.nodes !== undefined ? JSON.stringify(updates.nodes) : JSON.stringify(existing.nodes);
    const connections = updates.connections !== undefined ? JSON.stringify(updates.connections) : JSON.stringify(existing.connections);
    const settings = updates.settings !== undefined ? JSON.stringify(updates.settings) : JSON.stringify(existing.settings);
    const active = updates.active !== undefined ? (updates.active ? 1 : 0) : (existing.active ? 1 : 0);

    const stmt = this.db.prepare(`
      UPDATE workflows
      SET name = ?, description = ?, nodes = ?, connections = ?, settings = ?, active = ?, updated_at = ?
      WHERE id = ?
    `);

    stmt.run(name, description || null, nodes, connections, settings, active, now, id);
    return this.getById(id);
  }

  getById(id: string): Workflow | null {
    const stmt = this.db.prepare('SELECT * FROM workflows WHERE id = ?');
    const row = stmt.get(id) as any;
    if (!row) return null;

    return {
      id: row.id,
      name: row.name,
      description: row.description || undefined,
      nodes: JSON.parse(row.nodes),
      connections: JSON.parse(row.connections),
      settings: JSON.parse(row.settings),
      active: Boolean(row.active),
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  list(): Workflow[] {
    const stmt = this.db.prepare('SELECT * FROM workflows ORDER BY updated_at DESC');
    const rows = stmt.all() as any[];
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description || undefined,
      nodes: JSON.parse(row.nodes),
      connections: JSON.parse(row.connections),
      settings: JSON.parse(row.settings),
      active: Boolean(row.active),
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }));
  }

  delete(id: string): boolean {
    const stmt = this.db.prepare('DELETE FROM workflows WHERE id = ?');
    stmt.run(id);
    return true;
  }

  getActiveWorkflows(): Workflow[] {
    const stmt = this.db.prepare('SELECT * FROM workflows WHERE active = 1');
    const rows = stmt.all() as any[];
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description || undefined,
      nodes: JSON.parse(row.nodes),
      connections: JSON.parse(row.connections),
      settings: JSON.parse(row.settings),
      active: true,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }));
  }
}
