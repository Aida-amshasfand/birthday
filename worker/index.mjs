import { randomUUID } from 'node:crypto';
import {
  allowAttempt,
  createEditor,
  findEditorByAccountNumber,
  getSavedSettings,
  getShareToken,
  pingDatabase,
  registrationStatus,
  saveSettings,
} from './db.mjs';
import {
  clearSessionCookie,
  createEditorSession,
  endEditorSession,
  equalSecret,
  hashPassword,
  refreshEditorSessionCsrf,
  resolveEditorSession,
  setSessionCookie,
  validCsrfToken,
  verifyPassword,
} from './auth.mjs';
import { makeDefaultSettings, normalizeSettings } from './defaults.mjs';

const MAX_JSON_BYTES = 64 * 1024;
const securityHeaders = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
};

class ApiError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function fail(status, code, message) {
  throw new ApiError(status, code, message);
}

function sendJson(status, payload, extraHeaders = {}) {
  const headers = new Headers(securityHeaders);
  headers.set('Content-Type', 'application/json; charset=utf-8');
  headers.set('Cache-Control', 'no-store');
  for (const [key, value] of Object.entries(extraHeaders)) headers.set(key, value);
  return new Response(JSON.stringify(payload), { status, headers });
}

async function readJson(request, limit = MAX_JSON_BYTES) {
  const contentType = String(request.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  if (contentType !== 'application/json') fail(415, 'JSON_REQUIRED', 'Please send a valid request.');
  const announced = Number(request.headers.get('content-length') || 0);
  if (announced > limit) fail(413, 'REQUEST_TOO_LARGE', 'That request is too large.');
  const reader = request.body?.getReader();
  if (!reader) fail(400, 'INVALID_JSON', 'Please check the submitted information.');
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limit) {
      await reader.cancel();
      fail(413, 'REQUEST_TOO_LARGE', 'That request is too large.');
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    const parsed = JSON.parse(new TextDecoder().decode(bytes));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('not an object');
    return parsed;
  } catch {
    fail(400, 'INVALID_JSON', 'Please check the submitted information.');
  }
}

function safeText(value, maxLength) {
  return String(value ?? '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .trim()
    .slice(0, maxLength);
}

async function requireEditor(request, database) {
  const session = await resolveEditorSession(request, database);
  if (!session) fail(401, 'SIGN_IN_REQUIRED', 'Sign in to continue.');
  return session;
}

function requireCsrf(request, session) {
  if (!validCsrfToken(session, String(request.headers.get('x-birthday-csrf') || ''))) {
    fail(403, 'CSRF_CHECK_FAILED', 'Please refresh the page and try again.');
  }
}

function hasPublicShareAccess(request, requestUrl, shareToken) {
  const headerValue = request.headers.get('x-birthday-share');
  const candidate = headerValue || requestUrl.searchParams.get('share');
  return equalSecret(candidate, shareToken);
}

async function issueEditorSession(database, editorId, accountNumber, displayName) {
  const session = await createEditorSession(database, editorId);
  return {
    accountNumber,
    displayName,
    csrfToken: session.csrfToken,
    cookie: setSessionCookie(session.rawToken),
  };
}

async function handleApi(request, env, requestUrl) {
  const { DB: database } = env;
  const pathname = requestUrl.pathname;
  if (request.method === 'GET' && pathname === '/_app/health') {
    try {
      await pingDatabase(database);
      return sendJson(200, { ok: true });
    } catch {
      return sendJson(503, { ok: false });
    }
  }

  if (request.method === 'GET' && pathname === '/api/public/settings') {
    const shareToken = await getShareToken(database);
    if (!hasPublicShareAccess(request, requestUrl, shareToken)) {
      fail(404, 'INVITATION_LINK_REQUIRED', 'Open the birthday invitation link to view this page.');
    }
    const stored = await getSavedSettings(database);
    return sendJson(200, normalizeSettings(stored ?? makeDefaultSettings()));
  }

  if (request.method === 'GET' && pathname === '/api/editor/settings') {
    const session = await requireEditor(request, database);
    requireCsrf(request, session);
    const stored = await getSavedSettings(database);
    return sendJson(200, { settings: normalizeSettings(stored ?? makeDefaultSettings()) });
  }

  if (request.method === 'GET' && pathname === '/api/editor/share-link') {
    const session = await requireEditor(request, database);
    requireCsrf(request, session);
    return sendJson(200, { token: await getShareToken(database) });
  }

  if (request.method === 'GET' && pathname === '/api/auth/registration-status') {
    return sendJson(200, {
      canRegister: Boolean(env.BIRTHDAY_SETUP_CODE) && await registrationStatus(database),
    });
  }

  if (request.method === 'GET' && pathname === '/api/auth/me') {
    const session = await resolveEditorSession(request, database);
    if (!session) return sendJson(200, { authenticated: false });
    const csrfToken = await refreshEditorSessionCsrf(database, session);
    const { csrfHash, ...safeSession } = session;
    return sendJson(200, { authenticated: true, ...safeSession, csrfToken });
  }

  if (request.method === 'POST' && pathname === '/api/auth/register') {
    if (!await allowAttempt(database, request, 'register', 6, 60 * 60 * 1000)) {
      fail(429, 'TRY_LATER', 'Please wait a little before trying again.');
    }
    if (!env.BIRTHDAY_SETUP_CODE) fail(503, 'SIGNUP_NOT_CONFIGURED', 'Private account setup is not ready yet.');
    const input = await readJson(request);
    const inviteCode = typeof input.inviteCode === 'string' ? input.inviteCode : '';
    const displayName = safeText(input.displayName, 48);
    const password = typeof input.password === 'string' ? input.password : '';
    if (!equalSecret(inviteCode, env.BIRTHDAY_SETUP_CODE)) fail(403, 'INVITE_CODE_INVALID', 'That private invitation code is not valid.');
    if (!displayName || password.length < 12 || password.length > 256) {
      fail(400, 'ACCOUNT_FIELDS_INVALID', 'Choose a display name and a password of at least 12 characters.');
    }
    const credential = await hashPassword(password);
    const editorId = randomUUID();
    let accountNumber;
    try {
      accountNumber = await createEditor(database, {
        id: editorId,
        displayName,
        salt: credential.salt,
        passwordHash: credential.hash,
      });
    } catch (error) {
      if (error?.code === 'EDITOR_LIMIT_REACHED') {
        fail(409, 'EDITOR_LIMIT_REACHED', 'The two private editor accounts have already been created.');
      }
      throw error;
    }
    const session = await issueEditorSession(database, editorId, accountNumber, displayName);
    return sendJson(201, {
      authenticated: true,
      accountNumber: session.accountNumber,
      displayName: session.displayName,
      csrfToken: session.csrfToken,
    }, { 'Set-Cookie': session.cookie });
  }

  if (request.method === 'POST' && pathname === '/api/auth/login') {
    if (!await allowAttempt(database, request, 'login', 12, 15 * 60 * 1000)) {
      fail(429, 'TRY_LATER', 'Too many sign-in attempts. Please wait and try again.');
    }
    const input = await readJson(request);
    const accountNumber = typeof input.accountNumber === 'string' ? input.accountNumber.trim() : '';
    const password = typeof input.password === 'string' ? input.password : '';
    if (!/^\d{12}$/.test(accountNumber) || !password || password.length > 256) {
      fail(401, 'SIGN_IN_FAILED', 'The account number or password is not correct.');
    }
    const editor = await findEditorByAccountNumber(database, accountNumber);
    const valid = await verifyPassword(password, editor?.password_salt, editor?.password_hash);
    if (!editor || !valid) fail(401, 'SIGN_IN_FAILED', 'The account number or password is not correct.');
    const session = await issueEditorSession(database, editor.id, editor.account_number, editor.display_name);
    return sendJson(200, {
      authenticated: true,
      accountNumber: session.accountNumber,
      displayName: session.displayName,
      csrfToken: session.csrfToken,
    }, { 'Set-Cookie': session.cookie });
  }

  if (request.method === 'POST' && pathname === '/api/auth/logout') {
    const session = await requireEditor(request, database);
    requireCsrf(request, session);
    await endEditorSession(database, session);
    return sendJson(200, { authenticated: false }, { 'Set-Cookie': clearSessionCookie() });
  }

  if (request.method === 'PUT' && pathname === '/api/editor/settings') {
    const session = await requireEditor(request, database);
    requireCsrf(request, session);
    const input = await readJson(request);
    const settings = normalizeSettings(input.settings);
    await saveSettings(database, settings, session.editorId);
    return sendJson(200, { settings });
  }

  fail(404, 'NOT_FOUND', 'That page or request could not be found.');
}

export default {
  async fetch(request, env) {
    const requestUrl = new URL(request.url);
    const pathname = requestUrl.pathname;
    if (pathname.startsWith('/api/') || pathname === '/_app/health') {
      try {
        return await handleApi(request, env, requestUrl);
      } catch (error) {
        if (error instanceof ApiError) return sendJson(error.status, { error: error.code, message: error.message });
        console.error('Request failed:', error?.code || error?.name || 'UNKNOWN');
        return sendJson(500, { error: 'INTERNAL_ERROR', message: 'Something went wrong. Please try again.' });
      }
    }
    return env.ASSETS.fetch(request);
  },
};
