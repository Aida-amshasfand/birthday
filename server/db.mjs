import mysql from 'mysql2/promise';
import { randomBytes, randomInt } from 'node:crypto';

let pool;

function databasePool() {
  if (!pool) {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL_MISSING');
    pool = mysql.createPool(process.env.DATABASE_URL);
  }
  return pool;
}

export async function initializeDatabase() {
  const connection = await databasePool().getConnection();
  let shareToken;
  try {
    await connection.query(`
      CREATE TABLE IF NOT EXISTS birthday_signup_guard (
        id TINYINT UNSIGNED NOT NULL PRIMARY KEY
      ) ENGINE=InnoDB
    `);
    await connection.query('INSERT IGNORE INTO birthday_signup_guard (id) VALUES (1)');
    await connection.query(`
      CREATE TABLE IF NOT EXISTS birthday_editors (
        id CHAR(36) NOT NULL PRIMARY KEY,
        account_number CHAR(12) NOT NULL UNIQUE,
        display_name VARCHAR(48) NOT NULL,
        password_salt VARBINARY(16) NOT NULL,
        password_hash VARBINARY(64) NOT NULL,
        created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
      ) ENGINE=InnoDB
    `);
    await connection.query(`
      CREATE TABLE IF NOT EXISTS birthday_sessions (
        token_hash CHAR(64) NOT NULL PRIMARY KEY,
        editor_id CHAR(36) NOT NULL,
        csrf_hash CHAR(64) NOT NULL,
        expires_at DATETIME(6) NOT NULL,
        created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        INDEX birthday_sessions_editor_idx (editor_id),
        INDEX birthday_sessions_expiry_idx (expires_at),
        CONSTRAINT birthday_sessions_editor_fk FOREIGN KEY (editor_id)
          REFERENCES birthday_editors(id) ON DELETE CASCADE
      ) ENGINE=InnoDB
    `);
    await connection.query(`
      CREATE TABLE IF NOT EXISTS birthday_settings (
        id TINYINT UNSIGNED NOT NULL PRIMARY KEY,
        settings_json JSON NOT NULL,
        updated_by CHAR(36) NOT NULL,
        updated_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
          ON UPDATE CURRENT_TIMESTAMP(6),
        CONSTRAINT birthday_settings_editor_fk FOREIGN KEY (updated_by)
          REFERENCES birthday_editors(id)
      ) ENGINE=InnoDB
    `);
    await connection.query(`
      CREATE TABLE IF NOT EXISTS birthday_site_share (
        id TINYINT UNSIGNED NOT NULL PRIMARY KEY,
        share_token CHAR(43) NOT NULL UNIQUE,
        created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
      ) ENGINE=InnoDB
    `);
    let [shareRows] = await connection.query('SELECT share_token FROM birthday_site_share WHERE id = 1 LIMIT 1');
    if (!shareRows.length) {
      await connection.execute(
        'INSERT IGNORE INTO birthday_site_share (id, share_token) VALUES (1, ?)',
        [randomBytes(32).toString('base64url')],
      );
      [shareRows] = await connection.query('SELECT share_token FROM birthday_site_share WHERE id = 1 LIMIT 1');
    }
    shareToken = shareRows[0]?.share_token;
    await connection.query('DELETE FROM birthday_sessions WHERE expires_at <= UTC_TIMESTAMP(6)');
  } finally {
    connection.release();
  }
  if (!shareToken) throw new Error('PUBLIC_SHARE_TOKEN_UNAVAILABLE');
  return shareToken;
}

export async function pingDatabase() {
  await databasePool().query('SELECT 1');
}

export async function closeDatabase() {
  if (pool) {
    const current = pool;
    pool = undefined;
    await current.end();
  }
}

export async function registrationStatus() {
  const [rows] = await databasePool().query('SELECT COUNT(*) AS total FROM birthday_editors');
  return Number(rows[0]?.total ?? 0) < 2;
}

export async function createEditor({ id, displayName, salt, passwordHash }) {
  const connection = await databasePool().getConnection();
  try {
    await connection.beginTransaction();
    await connection.query('SELECT id FROM birthday_signup_guard WHERE id = 1 FOR UPDATE');
    const [countRows] = await connection.query('SELECT COUNT(*) AS total FROM birthday_editors');
    if (Number(countRows[0]?.total ?? 0) >= 2) {
      const error = new Error('EDITOR_LIMIT_REACHED');
      error.code = 'EDITOR_LIMIT_REACHED';
      throw error;
    }

    let accountNumber;
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const candidate = String(randomInt(100_000_000_000, 1_000_000_000_000));
      const [existing] = await connection.execute(
        'SELECT id FROM birthday_editors WHERE account_number = ? LIMIT 1',
        [candidate],
      );
      if (!existing.length) {
        accountNumber = candidate;
        break;
      }
    }
    if (!accountNumber) throw new Error('ACCOUNT_NUMBER_GENERATION_FAILED');

    await connection.execute(
      'INSERT INTO birthday_editors (id, account_number, display_name, password_salt, password_hash) VALUES (?, ?, ?, ?, ?)',
      [id, accountNumber, displayName, salt, passwordHash],
    );
    await connection.commit();
    return accountNumber;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function findEditorByAccountNumber(accountNumber) {
  const [rows] = await databasePool().execute(
    'SELECT id, account_number, display_name, password_salt, password_hash FROM birthday_editors WHERE account_number = ? LIMIT 1',
    [accountNumber],
  );
  return rows[0] ?? null;
}

export async function insertSession({ tokenHash, csrfHash, editorId }) {
  await databasePool().execute(
    `INSERT INTO birthday_sessions (token_hash, editor_id, csrf_hash, expires_at)
     VALUES (?, ?, ?, DATE_ADD(UTC_TIMESTAMP(6), INTERVAL 14 DAY))`,
    [tokenHash, editorId, csrfHash],
  );
}

export async function findSession(tokenHash) {
  const [rows] = await databasePool().execute(
    `SELECT s.editor_id, s.csrf_hash, e.account_number, e.display_name
     FROM birthday_sessions s
     INNER JOIN birthday_editors e ON e.id = s.editor_id
     WHERE s.token_hash = ? AND s.expires_at > UTC_TIMESTAMP(6)
     LIMIT 1`,
    [tokenHash],
  );
  return rows[0] ?? null;
}

export async function rotateSessionCsrf(tokenHash, csrfHash) {
  await databasePool().execute(
    'UPDATE birthday_sessions SET csrf_hash = ? WHERE token_hash = ? AND expires_at > UTC_TIMESTAMP(6)',
    [csrfHash, tokenHash],
  );
}

export async function removeSession(tokenHash) {
  await databasePool().execute('DELETE FROM birthday_sessions WHERE token_hash = ?', [tokenHash]);
}

function decodeSettings(value) {
  if (typeof value === 'string') {
    try { return JSON.parse(value); } catch { return null; }
  }
  return value ?? null;
}

export async function getSavedSettings() {
  const [rows] = await databasePool().query(
    'SELECT settings_json FROM birthday_settings WHERE id = 1 LIMIT 1',
  );
  return decodeSettings(rows[0]?.settings_json);
}

export async function saveSettings(settings, editorId) {
  await databasePool().execute(
    `INSERT INTO birthday_settings (id, settings_json, updated_by)
     VALUES (1, CAST(? AS JSON), ?)
     ON DUPLICATE KEY UPDATE settings_json = VALUES(settings_json), updated_by = VALUES(updated_by)`,
    [JSON.stringify(settings), editorId],
  );
}
