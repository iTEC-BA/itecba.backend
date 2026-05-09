// src/config/turso.js — Cliente Turso (LibSQL) para el Foro Anónimo
import { createClient } from "@libsql/client";
import dotenv from "dotenv";
dotenv.config();

if (!process.env.TURSO_URL || !process.env.TURSO_AUTH_TOKEN) {
  console.warn(
    "⚠️  [TURSO] Variables TURSO_URL / TURSO_AUTH_TOKEN no definidas. " +
      "El módulo de foro no estará disponible.",
  );
}

export const turso = createClient({
  url: process.env.TURSO_URL || "file:dev-forum.db",
  authToken: process.env.TURSO_AUTH_TOKEN || undefined,
});

/**
 * Inicializa el schema del foro.
 * Primero crea las bases, luego inyecta columnas nuevas (migraciones),
 * y al final crea los índices de forma segura.
 */
export const initForumDB = async () => {
  try {
    // 1. Tablas base (solo con las columnas originales de tus primeras pruebas)
    await turso.executeMultiple(`
      CREATE TABLE IF NOT EXISTS anonymous_posts (
        id          INTEGER  PRIMARY KEY AUTOINCREMENT,
        parent_id   INTEGER  REFERENCES anonymous_posts(id) ON DELETE CASCADE,
        pseudonym   TEXT     NOT NULL,
        user_hash   TEXT     NOT NULL,
        body        TEXT     NOT NULL,
        upvotes     INTEGER  NOT NULL DEFAULT 0,
        created_at  TEXT     NOT NULL DEFAULT (datetime('now')),
        expires_at  TEXT     NOT NULL
      );

      CREATE TABLE IF NOT EXISTS post_votes (
        user_hash   TEXT    NOT NULL,
        post_id     INTEGER NOT NULL REFERENCES anonymous_posts(id) ON DELETE CASCADE,
        value       INTEGER NOT NULL CHECK(value IN (-1, 1)),
        PRIMARY KEY (user_hash, post_id)
      );

      CREATE TABLE IF NOT EXISTS post_reposts (
        user_hash   TEXT    NOT NULL,
        post_id     INTEGER NOT NULL REFERENCES anonymous_posts(id) ON DELETE CASCADE,
        created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY (user_hash, post_id)
      );

      CREATE TABLE IF NOT EXISTS push_subscriptions (
        user_hash     TEXT PRIMARY KEY,
        subscription  TEXT NOT NULL,
        updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);

    // 2. Migraciones seguras: Agregar las columnas nuevas si no existen
    const migrations = [
      `ALTER TABLE anonymous_posts ADD COLUMN root_id INTEGER REFERENCES anonymous_posts(id) ON DELETE CASCADE`,
      `ALTER TABLE anonymous_posts ADD COLUMN shares INTEGER NOT NULL DEFAULT 0`,
      `ALTER TABLE anonymous_posts ADD COLUMN reposts INTEGER NOT NULL DEFAULT 0`,
    ];

    for (const sql of migrations) {
      try {
        await turso.execute(sql);
      } catch (e) {
        // Si el error es por "duplicate column name", lo ignoramos silenciosamente porque ya existe.
        if (!e.message?.includes("duplicate column")) {
          console.warn("⚠️ [TURSO] Aviso de migración:", e.message);
        }
      }
    }

    // 3. Crear los índices SOLO cuando sabemos que las columnas definitivamente ya existen
    await turso.executeMultiple(`
      CREATE INDEX IF NOT EXISTS idx_posts_parent ON anonymous_posts(parent_id);
      CREATE INDEX IF NOT EXISTS idx_posts_root   ON anonymous_posts(root_id);
      CREATE INDEX IF NOT EXISTS idx_posts_expires ON anonymous_posts(expires_at);
    `);

    console.log("🟢 [TURSO] Schema del foro inicializado correctamente.");
  } catch (err) {
    console.error("🔴 [TURSO] Error al inicializar schema:", err.message);
  }
};
