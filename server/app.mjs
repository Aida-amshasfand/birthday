import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import {
  closeDatabase,
  createEditor,
  findEditorByAccountNumber,
  getSavedSettings,
  initializeDatabase,
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
const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};
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

const attempts = new Map();
function allowAttempt(request, scope, maximum, windowMs) {
  const ip = request.socket.remoteAddress || 'unknown';
  const key = `${scope}:${ip}`;
  const now = Date.now();
  const current = attempts.get(key);
  if (!current || current.until <= now) {
    attempts.set(key, { count: 1, until: now + windowMs });
    return true;
  }
  if (current.count >= maximum) return false;
  current.count += 1;
  return true;
}
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of attempts) if (value.until <= now) attempts.delete(key);
}, 10 * 60 * 1000).unref();

function sendJson(response, status, payload, extraHeaders = {}) {
  if (response.headersSent) return;
  response.writeHead(status, {
    ...securityHeaders,
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...extraHeaders,
  });
  response.end(JSON.stringify(payload));
}

function fail(status, code, message) {
  throw new ApiError(status, code, message);
}

async function collectBody(request, limit) {
  const announced = Number(request.headers['content-length'] || 0);
  if (announced > limit) fail(413, 'REQUEST_TOO_LARGE', 'That request is too large.');
  const chunks = [];
  let total = 0;
  for await (const chunk of request) {
    total += chunk.length;
    if (total > limit) fail(413, 'REQUEST_TOO_LARGE', 'That request is too large.');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks, total);
}

async function readJson(request, limit = MAX_JSON_BYTES) {
  const contentType = String(request.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
  if (contentType !== 'application/json') fail(415, 'JSON_REQUIRED', 'Please send a valid request.');
  const body = await collectBody(request, limit);
  try {
    const parsed = JSON.parse(body.toString('utf8'));
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

async function requireEditor(request) {
  const session = await resolveEditorSession(request);
  if (!session) fail(401, 'SIGN_IN_REQUIRED', 'Sign in to continue.');
  return session;
}

function hasPublicShareAccess(request, requestUrl) {
  const headerValue = request.headers['x-birthday-share'];
  const candidate = typeof headerValue === 'string' ? headerValue : requestUrl.searchParams.get('share');
  return equalSecret(candidate, String(globalThis.__birthdayShareToken || ''));
}

function requireCsrf(request, session) {
  if (!validCsrfToken(session, String(request.headers['x-birthday-csrf'] || ''))) {
    fail(403, 'CSRF_CHECK_FAILED', 'Please refresh the page and try again.');
  }
}

async function issueEditorSession(response, editorId, accountNumber, displayName) {
  const session = await createEditorSession(editorId);
  setSessionCookie(response, session.rawToken);
  return { accountNumber, displayName, csrfToken: session.csrfToken };
}

async function handleApi(request, response, requestUrl) {
  const pathname = requestUrl.pathname;
  if (request.method === 'GET' && pathname === '/_app/health') {
    try {
      await pingDatabase();
      sendJson(response, 200, { ok: true });
    } catch {
      sendJson(response, 503, { ok: false });
    }
    return;
  }

  if (request.method === 'GET' && pathname === '/api/public/settings') {
    if (!hasPublicShareAccess(request, requestUrl)) fail(404, 'INVITATION_LINK_REQUIRED', 'Open the birthday invitation link to view this page.');
    const stored = await getSavedSettings();
    sendJson(response, 200, normalizeSettings(stored ?? makeDefaultSettings()));
    return;
  }

  if (request.method === 'GET' && pathname === '/api/editor/settings') {
    const session = await requireEditor(request);
    requireCsrf(request, session);
    const stored = await getSavedSettings();
    sendJson(response, 200, { settings: normalizeSettings(stored ?? makeDefaultSettings()) });
    return;
  }

  if (request.method === 'GET' && pathname === '/api/editor/share-link') {
    const session = await requireEditor(request);
    requireCsrf(request, session);
    sendJson(response, 200, { token: globalThis.__birthdayShareToken });
    return;
  }

  if (request.method === 'GET' && pathname === '/api/auth/registration-status') {
    sendJson(response, 200, {
      canRegister: Boolean(process.env.BIRTHDAY_SETUP_CODE) && await registrationStatus(),
    });
    return;
  }

  if (request.method === 'GET' && pathname === '/api/auth/me') {
    const session = await resolveEditorSession(request);
    if (!session) {
      sendJson(response, 200, { authenticated: false });
      return;
    }
    const csrfToken = await refreshEditorSessionCsrf(session);
    const { csrfHash, ...safeSession } = session;
    sendJson(response, 200, { authenticated: true, ...safeSession, csrfToken });
    return;
  }

  if (request.method === 'POST' && pathname === '/api/auth/register') {
    if (!allowAttempt(request, 'register', 6, 60 * 60 * 1000)) fail(429, 'TRY_LATER', 'Please wait a little before trying again.');
    if (!process.env.BIRTHDAY_SETUP_CODE) fail(503, 'SIGNUP_NOT_CONFIGURED', 'Private account setup is not ready yet.');
    const input = await readJson(request);
    const inviteCode = typeof input.inviteCode === 'string' ? input.inviteCode : '';
    const displayName = safeText(input.displayName, 48);
    const password = typeof input.password === 'string' ? input.password : '';
    if (!equalSecret(inviteCode, process.env.BIRTHDAY_SETUP_CODE)) fail(403, 'INVITE_CODE_INVALID', 'That private invitation code is not valid.');
    if (!displayName || password.length < 12 || password.length > 256) {
      fail(400, 'ACCOUNT_FIELDS_INVALID', 'Choose a display name and a password of at least 12 characters.');
    }
    const credential = await hashPassword(password);
    const editorId = randomUUID();
    let accountNumber;
    try {
      accountNumber = await createEditor({
        id: editorId,
        displayName,
        salt: credential.salt,
        passwordHash: credential.hash,
      });
    } catch (error) {
      if (error?.code === 'EDITOR_LIMIT_REACHED') fail(409, 'EDITOR_LIMIT_REACHED', 'The two private editor accounts have already been created.');
      throw error;
    }
    const sessionPayload = await issueEditorSession(response, editorId, accountNumber, displayName);
    sendJson(response, 201, { authenticated: true, ...sessionPayload }, {
      'Set-Cookie': response.getHeader('Set-Cookie'),
    });
    return;
  }

  if (request.method === 'POST' && pathname === '/api/auth/login') {
    if (!allowAttempt(request, 'login', 12, 15 * 60 * 1000)) fail(429, 'TRY_LATER', 'Too many sign-in attempts. Please wait and try again.');
    const input = await readJson(request);
    const accountNumber = typeof input.accountNumber === 'string' ? input.accountNumber.trim() : '';
    const password = typeof input.password === 'string' ? input.password : '';
    if (!/^\d{12}$/.test(accountNumber) || !password || password.length > 256) {
      fail(401, 'SIGN_IN_FAILED', 'The account number or password is not correct.');
    }
    const editor = await findEditorByAccountNumber(accountNumber);
    const valid = await verifyPassword(password, editor?.password_salt, editor?.password_hash);
    if (!editor || !valid) fail(401, 'SIGN_IN_FAILED', 'The account number or password is not correct.');
    const sessionPayload = await issueEditorSession(response, editor.id, editor.account_number, editor.display_name);
    sendJson(response, 200, { authenticated: true, ...sessionPayload }, {
      'Set-Cookie': response.getHeader('Set-Cookie'),
    });
    return;
  }

  if (request.method === 'POST' && pathname === '/api/auth/logout') {
    const session = await requireEditor(request);
    requireCsrf(request, session);
    await endEditorSession(session);
    clearSessionCookie(response);
    sendJson(response, 200, { authenticated: false }, {
      'Set-Cookie': response.getHeader('Set-Cookie'),
    });
    return;
  }

  if (request.method === 'PUT' && pathname === '/api/editor/settings') {
    const session = await requireEditor(request);
    requireCsrf(request, session);
    const input = await readJson(request);
    const settings = normalizeSettings(input.settings);
    await saveSettings(settings, session.editorId);
    sendJson(response, 200, { settings });
    return;
  }

  fail(404, 'NOT_FOUND', 'That page or request could not be found.');
}

async function serveStatic(request, response, staticRoot, pathname) {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.writeHead(405, { ...securityHeaders, Allow: 'GET, HEAD', 'Cache-Control': 'no-store' }).end();
    return;
  }
  if (pathname === '/edit/') {
    response.writeHead(308, { ...securityHeaders, Location: '/edit', 'Cache-Control': 'no-store' }).end();
    return;
  }
  let decoded;
  try { decoded = decodeURIComponent(pathname); } catch {
    response.writeHead(400, securityHeaders).end('Bad request');
    return;
  }
  const relative = decoded === '/' || decoded === '/edit' || decoded === '/index.html'
    ? 'index.html'
    : `.${decoded}`;
  const filePath = resolve(staticRoot, relative);
  if (filePath !== staticRoot && !filePath.startsWith(staticRoot + sep)) {
    response.writeHead(403, securityHeaders).end('Forbidden');
    return;
  }
  try {
    const details = await stat(filePath);
    if (!details.isFile()) throw new Error('NOT_A_FILE');
    const body = await readFile(filePath);
    const type = mimeTypes[extname(filePath).toLowerCase()] || 'application/octet-stream';
    response.writeHead(200, {
      ...securityHeaders,
      'Content-Type': type,
      'Content-Length': body.length,
      'Cache-Control': 'no-store',
    });
    response.end(request.method === 'HEAD' ? undefined : body);
  } catch {
    response.writeHead(404, { ...securityHeaders, 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
    response.end(request.method === 'HEAD' ? undefined : 'Not found');
  }
}

export async function startApplication({ staticRoot, port = Number(process.env.PORT || 3000) }) {
  globalThis.__birthdayShareToken = await initializeDatabase();

  const server = createServer(async (request, response) => {
    const requestUrl = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`);
    const pathname = requestUrl.pathname;
    try {
      if (pathname.startsWith('/api/') || pathname === '/_app/health') {
        await handleApi(request, response, requestUrl);
      } else {
        await serveStatic(request, response, staticRoot, pathname);
      }
    } catch (error) {
      if (error instanceof ApiError) {
        sendJson(response, error.status, { error: error.code, message: error.message });
        return;
      }
      console.error('Request failed:', error?.code || error?.name || 'UNKNOWN');
      if (!response.headersSent) sendJson(response, 500, { error: 'INTERNAL_ERROR', message: 'Something went wrong. Please try again.' });
      else response.destroy();
    }
  });

  server.listen(port, '0.0.0.0', () => console.log(`Birthday Glow server listening on ${port}`));
  const shutdown = async () => {
    server.close(async () => {
      await closeDatabase().catch(() => {});
      process.exit(0);
    });
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
  return server;
}
