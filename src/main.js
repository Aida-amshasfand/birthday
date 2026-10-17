import { createHeartAnimation, releaseConfetti } from './animation.js';

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const isEditorPage = window.location.pathname === '/edit' || window.location.pathname === '/edit/';
const languageStorageKey = 'birthday-glow-language';
const messages = {
  en: {
    play: 'Play', pause: 'Pause', animationPlaying: 'A little love, in motion.', animationPaused: 'Paused here, ready when you are.',
    copied: 'Birthday invitation link copied.', copyFailed: 'Copy the link from your browser address bar.',
    shareRequiresAccount: 'Sign in to copy the private birthday link.', inviteOnly: 'This page opens from its private birthday link.',
    saved: 'The birthday page is saved for both of you.', signedOut: 'You are signed out.',
    passwordMismatch: 'The passwords do not match.', passwordShort: 'Choose a password with at least 12 characters.',
    saveFailed: 'The birthday page could not be saved. Please try again.',
    createAccountSuccess: 'Account created. Save your 12-digit account number before leaving this page.',
    loginFailed: 'The account number or password is not correct.', inviteInvalid: 'The private invitation code is not correct.',
    accountLimit: 'Both private editor accounts have already been created.', tryLater: 'Please wait a little before trying again.',
    setupUnavailable: 'Private account setup is not ready yet.', csrfFailed: 'Refresh the page and try again.',
    authRequired: 'Sign in to continue.', genericFailure: 'Something went wrong. Please try again.',
  },
  fa: {
    play: 'پخش', pause: 'مکث', animationPlaying: 'کمی عشق، در حرکت.', animationPaused: 'اینجا مکث کرده؛ هر وقت خواستی آماده است.',
    copied: 'پیوندِ خصوصیِ تولد کپی شد.', copyFailed: 'پیوندِ صفحه را از نوارِ نشانیِ مرورگر کپی کن.',
    shareRequiresAccount: 'برای کپیِ پیوندِ خصوصیِ تولد وارد حساب شو.', inviteOnly: 'این صفحه با پیوندِ خصوصیِ تولد باز می‌شود.',
    saved: 'صفحه‌ی تولد برای هر دوی شما ذخیره شد.', signedOut: 'از حساب خارج شدی.',
    passwordMismatch: 'گذرواژه‌ها با هم یکسان نیستند.', passwordShort: 'گذرواژه‌ای با حداقل ۱۲ نویسه انتخاب کن.',
    saveFailed: 'صفحه‌ی تولد ذخیره نشد. دوباره امتحان کن.',
    createAccountSuccess: 'حساب ساخته شد. پیش از ترکِ صفحه، شماره‌حسابِ ۱۲ رقمی را یادداشت کن.',
    loginFailed: 'شماره‌حساب یا گذرواژه درست نیست.', inviteInvalid: 'کدِ دعوتِ خصوصی درست نیست.',
    accountLimit: 'هر دو حسابِ خصوصیِ ویرایشگر ساخته شده‌اند.', tryLater: 'کمی صبر کن و دوباره امتحان کن.',
    setupUnavailable: 'ساختِ حسابِ خصوصی هنوز آماده نیست.', csrfFailed: 'صفحه را تازه‌سازی کن و دوباره امتحان کن.',
    authRequired: 'برای ادامه وارد حساب شو.', genericFailure: 'مشکلی پیش آمد. دوباره امتحان کن.',
  },
};

const serverErrors = {
  SIGN_IN_FAILED: 'loginFailed', SIGN_IN_REQUIRED: 'authRequired', INVITE_CODE_INVALID: 'inviteInvalid',
  EDITOR_LIMIT_REACHED: 'accountLimit', TRY_LATER: 'tryLater', SIGNUP_NOT_CONFIGURED: 'setupUnavailable',
  CSRF_CHECK_FAILED: 'csrfFailed',
};

const query = new URLSearchParams(window.location.search);
const state = {
  language: readLanguage(),
  shareToken: query.get('share') || '',
  editorShareToken: '',
  settings: null,
  csrfToken: '',
  account: null,
  animation: null,
  toastTimer: 0,
};

function readLanguage() {
  try { return localStorage.getItem(languageStorageKey) === 'fa' ? 'fa' : 'en'; } catch { return 'en'; }
}
function t(key) { return messages[state.language]?.[key] ?? messages.en[key] ?? key; }
function localizedError(error) { return serverErrors[error?.code] ? t(serverErrors[error.code]) : t('genericFailure'); }

function setStatus(element, message = '', isError = false) {
  if (!element) return;
  element.textContent = message;
  element.classList.toggle('is-error', Boolean(isError));
}

function showToast(message) {
  const toast = $('#toast');
  if (!toast) return;
  toast.textContent = message;
  toast.hidden = false;
  window.clearTimeout(state.toastTimer);
  state.toastTimer = window.setTimeout(() => { toast.hidden = true; }, 3100);
}

async function api(path, options = {}) {
  const headers = new Headers(options.headers || {});
  const method = String(options.method || 'GET').toUpperCase();
  if (typeof options.body === 'string' && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  if (state.csrfToken) headers.set('X-Birthday-CSRF', state.csrfToken);
  if (state.shareToken) headers.set('X-Birthday-Share', state.shareToken);
  const response = await fetch(path, {
    ...options,
    method,
    headers,
    credentials: 'same-origin',
    cache: 'no-store',
  });
  let payload = {};
  try { payload = await response.json(); } catch { /* Return a localized safe error below. */ }
  if (!response.ok) {
    const error = new Error(payload.message || t('genericFailure'));
    error.code = payload.error || 'REQUEST_FAILED';
    error.status = response.status;
    throw error;
  }
  return payload;
}

function applyLanguage() {
  document.body.dataset.language = state.language;
  document.documentElement.lang = state.language;
  document.documentElement.dir = state.language === 'fa' ? 'rtl' : 'ltr';
  $$('[data-en][data-fa]').forEach((element) => { element.textContent = element.dataset[state.language]; });
  $$('[data-placeholder-en][data-placeholder-fa]').forEach((element) => {
    element.placeholder = element.dataset[state.language === 'fa' ? 'placeholderFa' : 'placeholderEn'];
  });
  $$('[data-aria-en][data-aria-fa]').forEach((element) => {
    element.setAttribute('aria-label', element.dataset[state.language === 'fa' ? 'ariaFa' : 'ariaEn']);
  });
  $$('[data-language-button]').forEach((button) => {
    const active = button.dataset.languageButton === state.language;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  const canvas = $('#heartCanvas');
  if (canvas) canvas.setAttribute('aria-label', state.language === 'fa'
    ? 'قلبی متحرک از واژه‌های عاشقانه‌ی فارسی و انگلیسی.'
    : 'An animated heart made from loving English and Persian phrases.');
  if ($('#playToggle')) updatePlayButton();
  if (state.settings && !isEditorPage) renderPublicSettings();
}

function setLanguage(language) {
  state.language = language === 'fa' ? 'fa' : 'en';
  try { localStorage.setItem(languageStorageKey, state.language); } catch { /* Storage may be disabled in a preview iframe. */ }
  applyLanguage();
}

function renderPublicSettings() {
  if (!state.settings) return;
  const language = state.language;
  const settings = state.settings;
  const setText = (selector, value) => { const element = $(selector); if (element) element.textContent = value || ''; };
  setText('#heroEyebrow', settings.eyebrow?.[language]);
  setText('#heroTitle span', settings.title?.[language]);
  setText('#heroSubtitle', settings.subtitle?.[language]);
  setText('#birthdayDate', settings.birthdayDate?.[language] || '');
  setText('#letterText', settings.letter?.[language]);
  setText('#revealText', settings.reveal?.[language]);
  document.body.dataset.theme = settings.theme || 'rose';
  document.title = language === 'fa'
    ? `برای ${settings.recipient?.fa || ''} · تولد`
    : `For ${settings.recipient?.en || ''}, always · Birthday Glow`;
  const phrases = [...(settings.phrases?.en || []), ...(settings.phrases?.fa || [])];
  state.animation?.setPhrases(phrases);
  state.animation?.setTheme(settings.theme || 'rose');
}

function updatePlayButton(playing = state.animation?.playing) {
  const button = $('#playToggle');
  const icon = $('#playIcon');
  if (!button) return;
  const active = Boolean(playing);
  const label = active ? t('pause') : t('play');
  const labelSpan = $('span', button);
  if (labelSpan) labelSpan.textContent = label;
  button.setAttribute('aria-label', label);
  button.title = label;
  if (icon) {
    icon.replaceChildren();
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    if (active) {
      path.setAttribute('d', 'M7 5.5v9M13 5.5v9');
      path.setAttribute('stroke', 'currentColor');
      path.setAttribute('stroke-width', '2.3');
      path.setAttribute('stroke-linecap', 'round');
    } else {
      path.setAttribute('d', 'm7 4.8 8.2 5.2L7 15.2z');
      path.setAttribute('fill', 'currentColor');
    }
    icon.append(path);
  }
  const note = $('#motionNote');
  if (note) note.textContent = active ? t('animationPlaying') : t('animationPaused');
}

function invitationUrl(token) {
  const link = new URL('/', window.location.origin);
  link.searchParams.set('share', token);
  return link;
}

async function copyPublicLink() {
  let token = state.shareToken;
  if (isEditorPage) {
    try {
      token = state.editorShareToken || (await api('/api/editor/share-link')).token;
      state.editorShareToken = token;
    } catch (error) {
      showToast(localizedError(error) || t('shareRequiresAccount'));
      return;
    }
  }
  if (!token) {
    showToast(t('shareRequiresAccount'));
    return;
  }
  const link = invitationUrl(token).toString();
  try {
    await navigator.clipboard.writeText(link);
    showToast(t('copied'));
  } catch {
    showToast(t('copyFailed'));
  }
}

function initializePublicAnimation() {
  const canvas = $('#heartCanvas');
  if (!canvas) return;
  state.animation = createHeartAnimation(canvas, { onPlayingChange: updatePlayButton });
  if (state.settings) renderPublicSettings();
  $('#playToggle')?.addEventListener('click', () => state.animation?.playing ? state.animation.pause() : state.animation?.play());
  $('#restartAnimation')?.addEventListener('click', () => state.animation?.restart());
  $('#speedRange')?.addEventListener('input', (event) => {
    const speed = Number(event.currentTarget.value);
    state.animation?.setSpeed(speed);
    const label = $('#speedValue');
    if (label) label.textContent = `${speed.toFixed(1).replace('.0', '')}×`;
  });
  $('#revealButton')?.addEventListener('click', (event) => {
    const button = event.currentTarget;
    const card = $('#revealCard');
    const open = button.getAttribute('aria-expanded') !== 'true';
    button.setAttribute('aria-expanded', String(open));
    card.hidden = !open;
    const label = $('span', button);
    if (label) label.textContent = state.language === 'fa'
      ? (open ? 'نامه را ببند' : 'نامه‌ی کوچکت را باز کن')
      : (open ? 'Close your little note' : 'Open your little note');
    if (open) releaseConfetti($('#heartStage'));
  });
}

function selectAuthTab(name) {
  const loginActive = name === 'login';
  $('#loginTab').classList.toggle('is-active', loginActive);
  $('#loginTab').setAttribute('aria-selected', String(loginActive));
  $('#signupTab').classList.toggle('is-active', !loginActive);
  $('#signupTab').setAttribute('aria-selected', String(!loginActive));
  $('#loginForm').hidden = !loginActive;
  $('#signupForm').hidden = loginActive;
  setStatus($('#authStatus'), '');
}

function showAuth() {
  $('#authCard').hidden = false;
  $('#editorDashboard').hidden = true;
  selectAuthTab('login');
}

function setEditorFields(settings) {
  if (!settings) return;
  const fieldMap = {
    recipientEn: settings.recipient?.en,
    recipientFa: settings.recipient?.fa,
    titleEn: settings.title?.en,
    titleFa: settings.title?.fa,
    subtitleEn: settings.subtitle?.en,
    subtitleFa: settings.subtitle?.fa,
    letterEn: settings.letter?.en,
    letterFa: settings.letter?.fa,
    revealEn: settings.reveal?.en,
    revealFa: settings.reveal?.fa,
    phrasesEn: (settings.phrases?.en || []).join('\n'),
    phrasesFa: (settings.phrases?.fa || []).join('\n'),
  };
  Object.entries(fieldMap).forEach(([id, content]) => {
    const input = document.getElementById(id);
    if (input) input.value = content || '';
  });
  const theme = settings.theme || 'rose';
  const radio = $(`input[name="theme"][value="${CSS.escape(theme)}"]`);
  if (radio) radio.checked = true;
}

function collectEditorSettings() {
  const lines = (id) => document.getElementById(id).value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).slice(0, 40);
  return {
    recipient: { en: $('#recipientEn').value, fa: $('#recipientFa').value },
    title: { en: $('#titleEn').value, fa: $('#titleFa').value },
    subtitle: { en: $('#subtitleEn').value, fa: $('#subtitleFa').value },
    letter: { en: $('#letterEn').value, fa: $('#letterFa').value },
    reveal: { en: $('#revealEn').value, fa: $('#revealFa').value },
    phrases: { en: lines('phrasesEn'), fa: lines('phrasesFa') },
    theme: $('input[name="theme"]:checked')?.value || 'rose',
  };
}

async function showDashboard(account) {
  state.account = account;
  state.csrfToken = account.csrfToken || state.csrfToken;
  $('#authCard').hidden = true;
  $('#editorDashboard').hidden = false;
  $('#editorName').textContent = account.displayName || '';
  $('#editorAccountNumber').textContent = account.accountNumber || '';
  try {
    const result = await api('/api/editor/settings');
    state.settings = result.settings;
    setEditorFields(state.settings);
  } catch {
    setStatus($('#settingsStatus'), t('genericFailure'), true);
  }
  try {
    state.editorShareToken = (await api('/api/editor/share-link')).token;
    $('#previewLink').href = `${invitationUrl(state.editorShareToken).pathname}${invitationUrl(state.editorShareToken).search}`;
  } catch {
    state.editorShareToken = '';
  }
  setStatus($('#authStatus'), '');
}

async function initializePublic() {
  $('#publicView').hidden = true;
  $('#accessDenied').hidden = false;
  if (!state.shareToken) {
    $('#sharePublicLink').hidden = true;
    return;
  }
  try {
    state.settings = await api('/api/public/settings');
    $('#accessDenied').hidden = true;
    $('#publicView').hidden = false;
    applyLanguage();
    renderPublicSettings();
    initializePublicAnimation();
  } catch {
    $('#publicView').hidden = true;
    $('#accessDenied').hidden = false;
    $('#sharePublicLink').hidden = true;
  }
}

async function initializeEditor() {
  $('#accessDenied').hidden = true;
  $('#publicView').hidden = true;
  $('#editorView').hidden = false;
  applyLanguage();
  try {
    const session = await api('/api/auth/me');
    if (session.authenticated) await showDashboard(session);
    else showAuth();
  } catch {
    showAuth();
  }
  try {
    const registration = await api('/api/auth/registration-status');
    $('#signupTab').hidden = !registration.canRegister;
  } catch {
    $('#signupTab').hidden = true;
  }
  $('#loginTab').addEventListener('click', () => selectAuthTab('login'));
  $('#signupTab').addEventListener('click', () => selectAuthTab('signup'));
  $('#loginForm').addEventListener('submit', signIn);
  $('#signupForm').addEventListener('submit', createAccount);
  $('#logoutButton').addEventListener('click', signOut);
  $('#saveSettingsButton').addEventListener('click', saveEditorSettings);
  $('#copyEditorLink').addEventListener('click', copyPublicLink);
}

async function signIn(event) {
  event.preventDefault();
  const status = $('#authStatus');
  setStatus(status, '');
  const button = $('button[type="submit"]', event.currentTarget);
  button.disabled = true;
  try {
    const session = await api('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ accountNumber: $('#loginAccount').value.trim(), password: $('#loginPassword').value }),
    });
    $('#loginPassword').value = '';
    await showDashboard(session);
  } catch (error) {
    setStatus(status, localizedError(error), true);
  } finally {
    button.disabled = false;
  }
}

async function createAccount(event) {
  event.preventDefault();
  const status = $('#authStatus');
  setStatus(status, '');
  const password = $('#signupPassword').value;
  if (password.length < 12) { setStatus(status, t('passwordShort'), true); return; }
  if (password !== $('#signupPasswordAgain').value) { setStatus(status, t('passwordMismatch'), true); return; }
  const button = $('button[type="submit"]', event.currentTarget);
  button.disabled = true;
  try {
    const session = await api('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ inviteCode: $('#inviteCode').value, displayName: $('#displayName').value.trim(), password }),
    });
    $('#signupPassword').value = '';
    $('#signupPasswordAgain').value = '';
    $('#inviteCode').value = '';
    await showDashboard(session);
    setStatus($('#settingsStatus'), t('createAccountSuccess'));
    const registration = await api('/api/auth/registration-status');
    $('#signupTab').hidden = !registration.canRegister;
  } catch (error) {
    setStatus(status, localizedError(error), true);
  } finally {
    button.disabled = false;
  }
}

async function signOut() {
  try { await api('/api/auth/logout', { method: 'POST', body: '{}' }); } catch { /* The server still rejects expired sessions. */ }
  state.csrfToken = '';
  state.account = null;
  state.settings = null;
  state.editorShareToken = '';
  showAuth();
  showToast(t('signedOut'));
}

async function saveEditorSettings() {
  const button = $('#saveSettingsButton');
  const status = $('#settingsStatus');
  button.disabled = true;
  setStatus(status, '');
  try {
    const result = await api('/api/editor/settings', { method: 'PUT', body: JSON.stringify({ settings: collectEditorSettings() }) });
    state.settings = result.settings;
    document.body.dataset.theme = state.settings.theme;
    setEditorFields(state.settings);
    setStatus(status, t('saved'));
  } catch (error) {
    setStatus(status, error?.code === 'REQUEST_FAILED' ? t('saveFailed') : localizedError(error), true);
  } finally {
    button.disabled = false;
  }
}

$$('[data-language-button]').forEach((button) => button.addEventListener('click', () => setLanguage(button.dataset.languageButton)));
$('#sharePublicLink')?.addEventListener('click', copyPublicLink);
applyLanguage();
if (isEditorPage) initializeEditor();
else initializePublic();
