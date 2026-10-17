import { randomBytes, randomInt } from 'node:crypto';

function requireDb(database) {
  if (!database) throw new Error('D1_BINDING_MISSING');
  return database;
}

export async function getShareToken(database) {
  const db = requireDb(database);
  let row = await db.prepare('SELECT share_token FROM birthday_site_share WHERE id = 1').first();
  if (row?.share_token) return row.share_token;
  const candidate = randomBytes(32).toString('base64url');
  await db.prepare('INSERT OR IGNORE INTO birthday_site_share (id, share_token) VALUES (1, ?)').bind(candidate).run();
  row = await db.prepare('SELECT share_token FROM birthday_site_share WHERE id = 1').first();
  if (!row?.share_token) throw new Error('PUBLIC_SHARE_TOKEN_UNAVAILABLE');
  return row.share_token;
}

export async function pingDatabase(database) {
  await requireDb(database).prepare('SELECT 1 AS ok').first();
}

export async function registrationStatus(database) {
  const row = await requireDb(database).prepare('SELECT COUNT(*) AS total FROM birthday_editors').first();
  return Number(row?.total ?? 0) < 2;
}

export async function createEditor(database, { id, displayName, salt, passwordHash }) {
  const db = requireDb(database);
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const accountNumber = String(randomInt(100_000_000_000, 1_000_000_000_000));
    const existing = await db.prepare('SELECT id FROM birthday_editors WHERE account_number = ? LIMIT 1').bind(accountNumber).first();
    if (existing) continue;
    const result = await db.prepare(
      `INSERT INTO birthday_editors (id, account_number, display_name, password_salt, password_hash)
       SELECT ?, ?, ?, ?, ? WHERE (SELECT COUNT(*) FROM birthday_editors) < 2`,
    ).bind(id, accountNumber, displayName, salt, passwordHash).run();
    if (Number(result.meta?.changes ?? 0) === 1) return accountNumber;
    const count = await db.prepare('SELECT COUNT(*) AS total FROM birthday_editors').first();
    if (Number(count?.total ?? 0) >= 2) {
      const error = new Error('EDITOR_LIMIT_REACHED');
      error.code = 'EDITOR_LIMIT_REACHED';
      throw error;
    }
  }
  throw new Error('ACCOUNT_NUMBER_GENERATION_FAILED');
}

export async function findEditorByAccountNumber(database, accountNumber) {
  const row = await requireDb(database).prepare(
    `SELECT id, account_number, display_name, password_salt, password_hash
     FROM birthday_editors WHERE account_number = ? LIMIT 1`,
  ).bind(accountNumber).first();
  if (!row) return null;
  return {
    ...row,
    password_salt: Buffer.from(row.password_salt),
    password_hash: Buffer.from(row.password_hash),
  };
}

export async function insertSession(database, { tokenHash, csrfHash, editorId }) {
  await requireDb(database).prepare(
    `INSERT INTO birthday_sessions (token_hash, editor_id, csrf_hash, expires_at_ms)
     VALUES (?, ?, ?, ?)`,
  ).bind(tokenHash, editorId, csrfHash, Date.now() + (14 * 24 * 60 * 60 * 1000)).run();
}

export async function findSession(database, tokenHash) {
  return requireDb(database).prepare(
    `SELECT s.editor_id, s.csrf_hash, e.account_number, e.display_name
     FROM birthday_sessions s
     INNER JOIN birthday_editors e ON e.id = s.editor_id
     WHERE s.token_hash = ? AND s.expires_at_ms > ? LIMIT 1`,
  ).bind(tokenHash, Date.now()).first();
}

export async function rotateSessionCsrf(database, tokenHash, csrfHash) {
  await requireDb(database).prepare(
    'UPDATE birthday_sessions SET csrf_hash = ? WHERE token_hash = ? AND expires_at_ms > ?',
  ).bind(csrfHash, tokenHash, Date.now()).run();
}

export async function removeSession(database, tokenHash) {
  await requireDb(database).prepare('DELETE FROM birthday_sessions WHERE token_hash = ?').bind(tokenHash).run();
}

export async function getSavedSettings(database) {
  const row = await requireDb(database).prepare('SELECT settings_json FROM birthday_settings WHERE id = 1 LIMIT 1').first();
  if (!row?.settings_json) return null;
  try { return JSON.parse(row.settings_json); } catch { return null; }
}

export async function saveSettings(database, settings, editorId) {
  await requireDb(database).prepare(
    `INSERT INTO birthday_settings (id, settings_json, updated_by)
     VALUES (1, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       settings_json = excluded.settings_json,
       updated_by = excluded.updated_by,
       updated_at = CURRENT_TIMESTAMP`,
  ).bind(JSON.stringify(settings), editorId).run();
}

export async function allowAttempt(database, request, scope, maximum, windowMs) {
  const db = requireDb(database);
  const now = Date.now();
  const ip = request.headers.get('CF-Connecting-IP') || 'local';
  await db.prepare('DELETE FROM birthday_auth_attempts WHERE window_start_ms < ?').bind(now - 86_400_000).run();
  const row = await db.prepare(
    `INSERT INTO birthday_auth_attempts (scope, client_ip, window_start_ms, attempts)
     VALUES (?, ?, ?, 1)
     ON CONFLICT(scope, client_ip) DO UPDATE SET
       attempts = CASE WHEN birthday_auth_attempts.window_start_ms + ? <= ? THEN 1 ELSE birthday_auth_attempts.attempts + 1 END,
       window_start_ms = CASE WHEN birthday_auth_attempts.window_start_ms + ? <= ? THEN ? ELSE birthday_auth_attempts.window_start_ms END
     RETURNING attempts`,
  ).bind(scope, ip, now, windowMs, now, windowMs, now, now).first();
  return Number(row?.attempts ?? maximum + 1) <= maximum;
}
