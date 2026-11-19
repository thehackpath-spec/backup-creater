import { createHash } from "node:crypto";

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { "content-type": "application/json", "cache-control": "no-store" }
});

const hashStats = (stats) => createHash("sha256")
  .update([stats.user_id, stats.donated, stats.raised, stats.purse, stats.pending].join(":"))
  .digest("hex");

const normalizeStats = (body) => {
  const stats = {
    user_id: Number(body.user_id),
    donated: Number(body.donated),
    raised: Number(body.raised),
    purse: Number(body.purse),
    pending: Number(body.pending)
  };
  if (!Number.isSafeInteger(stats.user_id) || stats.user_id <= 0 || Object.values(stats).some(value => !Number.isSafeInteger(value) || value < 0)) return null;
  return stats;
};

export default {
  async fetch(request, env) {
    if (request.method !== "POST" || new URL(request.url).pathname !== "/api/player-stats") {
      return json({ error: "not_found" }, 404);
    }
    if (request.headers.get("authorization") !== `Bearer ${env.BACKUP_TOKEN}`) {
      return json({ error: "unauthorized" }, 401);
    }
    let body;
    try { body = await request.json(); } catch { return json({ error: "invalid_json" }, 400); }
    const input = Array.isArray(body.items) ? body.items : [body];
    if (input.length < 1 || input.length > 500) return json({ error: "invalid_batch_size" }, 400);
    const statsList = input.map(normalizeStats);
    if (statsList.some(stats => stats === null)) return json({ error: "invalid_stats" }, 400);
    const now = Math.floor(Date.now() / 1000);
    const ids = statsList.map(stats => stats.user_id);
    const placeholders = ids.map(() => "?").join(",");
    const existingRows = await env.DB.prepare(`SELECT * FROM player_data WHERE user_id IN (${placeholders})`).bind(...ids).all();
    const existingById = new Map((existingRows.results || []).map(row => [row.user_id, row]));
    const statements = [];
    const results = [];
    for (const stats of statsList) {
      const existing = existingById.get(stats.user_id);
      const dataHash = hashStats(stats);
      if (existing?.data_hash === dataHash) {
        results.push({ user_id: stats.user_id, changed: false, revision: existing.revision });
        continue;
      }
      const revision = (existing?.revision ?? 0) + 1;
      const versionId = crypto.randomUUID();
      statements.push(
        env.DB.prepare(`INSERT INTO player_data (user_id, donated, raised, purse, pending, revision, updated_at, data_hash)
          VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
          ON CONFLICT(user_id) DO UPDATE SET donated=excluded.donated, raised=excluded.raised,
          purse=excluded.purse, pending=excluded.pending, revision=excluded.revision,
          updated_at=excluded.updated_at, data_hash=excluded.data_hash`)
          .bind(stats.user_id, stats.donated, stats.raised, stats.purse, stats.pending, revision, now, dataHash),
        env.DB.prepare(`INSERT INTO player_versions (version_id, user_id, donated, raised, purse, pending, revision, created_at)
          VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`)
          .bind(versionId, stats.user_id, stats.donated, stats.raised, stats.purse, stats.pending, revision, now)
      );
      results.push({ user_id: stats.user_id, changed: true, revision, version_id: versionId });
    }
    if (statements.length > 0) await env.DB.batch(statements);
    return json({ received: statsList.length, changed: results.filter(result => result.changed).length, results });
  }
};
