/**
 * Database connection pool and schema/seed lifecycle manager.
 * Uses PostgreSQL (pg) when DATABASE_URL is configured (e.g., Render/Neon)
 * and falls back to Node's built-in node:sqlite when DATABASE_URL is unset
 * locally, exposing the same pool.query(sql, params) interface to routes.
 */

const fs = require("node:fs");
const path = require("node:path");

const SCHEMA_PATH = path.join(__dirname, "schema.sql");
const SEED_PATH = path.join(__dirname, "seed.sql");

const SQLITE_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL CHECK (length(trim(title)) BETWEEN 3 AND 80),
  category TEXT NOT NULL CHECK (length(trim(category)) BETWEEN 2 AND 40),
  description TEXT NOT NULL CHECK (length(trim(description)) BETWEEN 5 AND 300),
  status TEXT NOT NULL CHECK (status IN ('Pending', 'In progress', 'Completed'))
);
CREATE TABLE IF NOT EXISTS app_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`;

const POSTGRES_META_SQL = `
CREATE TABLE IF NOT EXISTS app_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`;

function buildPostgresSslConfig(connectionString) {
  const sslSetting = String(process.env.DATABASE_SSL || "").trim().toLowerCase();
  if (sslSetting === "false") {
    return false;
  }
  if (sslSetting === "true") {
    return { rejectUnauthorized: false };
  }

  const isLocalConnection =
    connectionString.includes("localhost") ||
    connectionString.includes("127.0.0.1");
  const explicitlyDisabled = connectionString.includes("sslmode=disable");

  if (isLocalConnection || explicitlyDisabled) {
    return false;
  }
  return { rejectUnauthorized: false };
}

function createPostgresBackend(connectionString) {
  const { Pool } = require("pg");
  const pgPool = new Pool({
    connectionString,
    ssl: buildPostgresSslConfig(connectionString),
  });

  pgPool.on("error", (error) => {
    console.error("Unexpected PostgreSQL pool error:", error);
  });

  return {
    mode: "postgresql",

    async query(sql, params = []) {
      const result = await pgPool.query(sql, params);
      return {
        rows: result.rows,
        rowCount: result.rowCount,
      };
    },

    async initDatabase() {
      const schemaSql = fs.readFileSync(SCHEMA_PATH, "utf8");
      await pgPool.query(schemaSql);
      await pgPool.query(POSTGRES_META_SQL);

      const metaResult = await pgPool.query(
        "SELECT value FROM app_meta WHERE key = $1",
        ["seeded"]
      );
      if (metaResult.rowCount > 0) {
        return;
      }

      const countResult = await pgPool.query(
        "SELECT COUNT(*)::int AS count FROM records"
      );
      if (countResult.rows[0].count === 0) {
        const seedSql = fs.readFileSync(SEED_PATH, "utf8");
        await pgPool.query(seedSql);
      }

      await pgPool.query(
        "INSERT INTO app_meta (key, value) VALUES ($1, $2) ON CONFLICT (key) DO NOTHING",
        ["seeded", "true"]
      );
    },

    async healthCheck() {
      await pgPool.query("SELECT 1");
    },

    async close() {
      await pgPool.end();
    },
  };
}

function translatePgPlaceholders(sql) {
  return sql.replace(/\$(\d+)/g, "?$1");
}

function createSqliteBackend() {
  const { DatabaseSync } = require("node:sqlite");
  const configuredPath = String(process.env.SQLITE_PATH || "").trim();
  const dbPath =
    configuredPath || path.join(__dirname, "data", "records.sqlite");

  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const sqliteDb = new DatabaseSync(dbPath);
  sqliteDb.exec("PRAGMA journal_mode = WAL;");

  return {
    mode: "sqlite",

    async query(sql, params = []) {
      const translatedSql = translatePgPlaceholders(sql);
      const statement = sqliteDb.prepare(translatedSql);
      const returnsRows =
        /^\s*(SELECT|WITH)\b/i.test(translatedSql) ||
        /\bRETURNING\b/i.test(translatedSql);

      if (returnsRows) {
        const rows = statement.all(...params).map((row) => ({ ...row }));
        return {
          rows,
          rowCount: rows.length,
        };
      }

      const info = statement.run(...params);
      return {
        rows: [],
        rowCount: Number(info.changes || 0),
      };
    },

    async initDatabase() {
      sqliteDb.exec(SQLITE_SCHEMA_SQL);

      const metaRow = sqliteDb
        .prepare("SELECT value FROM app_meta WHERE key = ?1")
        .get("seeded");
      if (metaRow) {
        return;
      }

      const countRow = sqliteDb
        .prepare("SELECT COUNT(*) AS count FROM records")
        .get();
      if (Number(countRow.count) === 0) {
        const seedSql = fs.readFileSync(SEED_PATH, "utf8");
        sqliteDb.exec(seedSql);
      }

      sqliteDb
        .prepare("INSERT OR IGNORE INTO app_meta (key, value) VALUES (?1, ?2)")
        .run("seeded", "true");
    },

    async healthCheck() {
      sqliteDb.prepare("SELECT 1").get();
    },

    async close() {
      sqliteDb.close();
    },
  };
}

function createDatabaseBackend() {
  const databaseUrl = String(process.env.DATABASE_URL || "").trim();
  if (databaseUrl) {
    return createPostgresBackend(databaseUrl);
  }
  return createSqliteBackend();
}

const backend = createDatabaseBackend();

const pool = {
  query(sql, params = []) {
    return backend.query(sql, params);
  },

  initDatabase() {
    return backend.initDatabase();
  },

  healthCheck() {
    return backend.healthCheck();
  },

  getStorageMode() {
    return backend.mode;
  },

  close() {
    return backend.close();
  },
};

module.exports = pool;
