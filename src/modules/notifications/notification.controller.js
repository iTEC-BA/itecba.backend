// src/modules/notifications/notification.controller.js
// ─────────────────────────────────────────────────────
// Reemplaza los endpoints de push que estaban en forum.routes.js
// y añade el envío a segmentos específicos de usuarios.
import webpush from "web-push";
import { turso } from "../../config/turso.js";

// ── Inicialización de VAPID (se llama desde index.js) ──────────
export function initWebPush() {
  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    webpush.setVapidDetails(
      process.env.VAPID_EMAIL || "mailto:admin@itecba.com",
      process.env.VAPID_PUBLIC_KEY,
      process.env.VAPID_PRIVATE_KEY,
    );
    console.log("🟢 Web Push (VAPID) configurado");
  } else {
    console.warn("🟡 VAPID keys no configuradas — push desactivado");
  }
}

// ── GET /api/notifications/vapid-key ───────────────────────────
export const getVapidKey = (_req, res) => {
  res.json({ key: process.env.VAPID_PUBLIC_KEY || "" });
};

// ── POST /api/notifications/subscribe ──────────────────────────
// Guarda la suscripción asociada al uid del usuario autenticado.
export const subscribePush = async (req, res, next) => {
  try {
    const subscription = req.body;
    const userHash = req.user?.uid ?? "anonymous";
    const now = new Date().toISOString();

    await turso.execute({
      sql: `INSERT INTO push_subscriptions (user_hash, subscription, updated_at)
            VALUES (?1, ?2, ?3)
            ON CONFLICT(user_hash)
            DO UPDATE SET subscription = excluded.subscription, updated_at = ?3`,
      args: [userHash, JSON.stringify(subscription), now],
    });

    res.status(200).json({ ok: true });
  } catch (err) {
    next(err);
  }
};

// ── DELETE /api/notifications/unsubscribe ──────────────────────
export const unsubscribePush = async (req, res, next) => {
  try {
    const { endpoint } = req.body;
    await turso.execute({
      sql: `DELETE FROM push_subscriptions WHERE subscription LIKE ?1`,
      args: [`%${endpoint}%`],
    });
    res.status(200).json({ ok: true });
  } catch (err) {
    next(err);
  }
};

// ── Helper: enviar push a TODOS los suscriptores ───────────────
export async function broadcastPush(payload) {
  const { rows } = await turso.execute(
    "SELECT subscription FROM push_subscriptions",
  );
  const results = await Promise.allSettled(
    rows.map(async (row) => {
      const sub = JSON.parse(row.subscription);
      await webpush.sendNotification(sub, JSON.stringify(payload));
    }),
  );
  const failed = results.filter((r) => r.status === "rejected").length;
  if (failed > 0)
    console.warn(`⚠️ ${failed} push fallaron (suscripciones expiradas).`);
}

// ── Helper: enviar push a un usuario específico (por uid) ───────
export async function pushToUser(uid, payload) {
  const { rows } = await turso.execute({
    sql: `SELECT subscription FROM push_subscriptions WHERE user_hash = ?1`,
    args: [uid],
  });
  if (rows.length === 0) return;
  try {
    await webpush.sendNotification(
      JSON.parse(rows[0].subscription),
      JSON.stringify(payload),
    );
  } catch (e) {
    console.warn(`⚠️ Push a user ${uid} falló:`, e.message);
  }
}
