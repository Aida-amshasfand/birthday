import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { findSession, insertSession, removeSession, rotateSessionCsrf } from './db.mjs';

const scrypt = promisify(scryptCallback);
const SESSION_COOKIE = 'birthday_editor_session';
const SESSION_SECONDS = 14 * 24 * 60 * 60;
const DUMMY_SALT = Buffer.alloc(16, 7);
const DUMMY_HASH = Buffer.alloc(64, 9);

export function hashHex(value) {
  return createHash('sha256').update(value).digest('hex');
}

export async function hashPassword(password) {
  const salt = randomBytes(16);
  const hash = await scrypt(password, salt, 64, {
    N: 16_384,
    r: 8,
    p: 1,
    maxmem: 64 * 1024 * 1024,
  });
  return { salt, hash: Buffer.from(hash) };
}

export async function verifyPassword(password, salt, expectedHash) {
  const safeSalt = salt ? Buffer.from(salt) : DUMMY_SALT;
  const safeHash = expectedHash ? Buffer.from(expectedHash) : DUMMY_HASH;
  const validSalt = safeSalt.length === 16;
  const validHash = safeHash.length === 64;
  const actual = Buffer.from(await scrypt(password, validSalt ? safeSalt : DUMMY_SALT, 64, {
    N: 16_384,
    r: 8,
    p: 1,
    maxmem: 64 * 1024 * 1024,
  }));
  const match = timingSafeEqual(actual, validHash ? safeHash : DUMMY_HASH);
  return match && validSalt && validHash;
}

export async function createEditorSession(database, editorId) {
  const rawToken = randomBytes(32).toString('base64url');
  const csrfToken = randomBytes(32).toString('base64url');
  const tokenHash = hashHex(rawToken);
  await insertSession(database, { tokenHash, csrfHash: hashHex(csrfToken), editorId });
  return { rawToken, tokenHash, csrfToken };
}

function getCookieValue(request, name) {
  const header = request.headers.get('cookie');
  if (!header) return null;
  for (const pair of header.split(';')) {
    const [rawName, ...rest] = pair.trim().split('=');
    if (rawName === name) return rest.join('=') || '';
  }
  return null;
}

export async function resolveEditorSession(request, database) {
  const rawToken = getCookieValue(request, SESSION_COOKIE);
  if (!rawToken || rawToken.length > 128) return null;
  const tokenHash = hashHex(rawToken);
  const session = await findSession(database, tokenHash);
  if (!session) return null;
  return {
    tokenHash,
    editorId: session.editor_id,
    accountNumber: session.account_number,
    displayName: session.display_name,
    csrfHash: session.csrf_hash,
  };
}

export async function refreshEditorSessionCsrf(database, session) {
  const csrfToken = randomBytes(32).toString('base64url');
  await rotateSessionCsrf(database, session.tokenHash, hashHex(csrfToken));
  return csrfToken;
}

export function validCsrfToken(session, suppliedToken) {
  if (!session || typeof suppliedToken !== 'string' || suppliedToken.length > 128) return false;
  const suppliedHash = hashHex(suppliedToken);
  const expected = Buffer.from(String(session.csrfHash ?? ''), 'hex');
  const actual = Buffer.from(suppliedHash, 'hex');
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function setSessionCookie(rawToken) {
  return `${SESSION_COOKIE}=${rawToken}; Path=/; HttpOnly; Secure; SameSite=None; Max-Age=${SESSION_SECONDS}`;
}

export function clearSessionCookie() {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=None; Max-Age=0`;
}

export async function endEditorSession(database, session) {
  if (session?.tokenHash) await removeSession(database, session.tokenHash);
}

export function equalSecret(left, right) {
  if (typeof left !== 'string' || typeof right !== 'string') return false;
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}
