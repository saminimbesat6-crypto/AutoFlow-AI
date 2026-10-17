import { DatabaseSync } from 'node:sqlite';

export function runMigrations(db: DatabaseSync): void {
  // Create schema_migrations table if not exists
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL
    );
  `);

  const stmt = db.prepare('SELECT version FROM schema_migrations WHERE version = ?');
  const check = stmt.get(1);

  if (!check) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS workflows (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        nodes TEXT NOT NULL,
        connections TEXT NOT NULL,
        settings TEXT NOT NULL,
        active INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS executions (
        id TEXT PRIMARY KEY,
        workflow_id TEXT NOT NULL,
        workflow_name TEXT NOT NULL,
        mode TEXT NOT NULL,
        status TEXT NOT NULL,
        started_at TEXT NOT NULL,
        finished_at TEXT,
        duration INTEGER,
        error_message TEXT,
        data TEXT,
        FOREIGN KEY (workflow_id) REFERENCES workflows(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS execution_nodes (
        id TEXT PRIMARY KEY,
        execution_id TEXT NOT NULL,
        node_id TEXT NOT NULL,
        node_name TEXT NOT NULL,
        node_type TEXT NOT NULL,
        status TEXT NOT NULL,
        input_data TEXT,
        output_data TEXT,
        error TEXT,
        started_at TEXT,
        finished_at TEXT,
        duration INTEGER,
        FOREIGN KEY (execution_id) REFERENCES executions(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS credentials (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        type TEXT NOT NULL,
        data TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS webhook_registrations (
        id TEXT PRIMARY KEY,
        workflow_id TEXT NOT NULL,
        node_id TEXT NOT NULL,
        path TEXT NOT NULL UNIQUE,
        method TEXT NOT NULL DEFAULT 'POST',
        created_at TEXT NOT NULL,
        FOREIGN KEY (workflow_id) REFERENCES workflows(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_executions_workflow_id ON executions(workflow_id);
      CREATE INDEX IF NOT EXISTS idx_executions_status ON executions(status);
      CREATE INDEX IF NOT EXISTS idx_execution_nodes_execution_id ON execution_nodes(execution_id);
      CREATE INDEX IF NOT EXISTS idx_webhooks_path ON webhook_registrations(path);
    `);

    const insertStmt = db.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)');
    insertStmt.run(1, new Date().toISOString());
  }
}
