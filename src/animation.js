const PALETTES = {
  rose: { core: '#f27f9b', light: '#ffe1e5', shadow: 'rgba(237, 105, 143, .32)', spark: '#ffe7a8', ink: '#5b263f' },
  midnight: { core: '#ab87ff', light: '#eadfff', shadow: 'rgba(160, 122, 255, .34)', spark: '#aef5e2', ink: '#35245e' },
  golden: { core: '#efad59', light: '#fff0cb', shadow: 'rgba(245, 177, 83, .34)', spark: '#ff8a86', ink: '#70402b' },
};

const hasPersian = /[\u0600-\u06ff\u0750-\u077f\u08a0-\u08ff]/u;

function heartOutline() {
  const points = [];
  for (let index = 0; index <= 720; index += 1) {
    const angle = (Math.PI * 2 * index) / 720;
    const x = 16 * Math.pow(Math.sin(angle), 3);
    const y = 13 * Math.cos(angle) - 5 * Math.cos(2 * angle) - 2 * Math.cos(3 * angle) - Math.cos(4 * angle);
    points.push({ x: 320 + x * 16.4, y: 276 - y * 16.1 });
  }
  return points;
}

function pointInside(x, y, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const a = polygon[i];
    const b = polygon[j];
    const crosses = (a.y > y) !== (b.y > y)
      && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x;
    if (crosses) inside = !inside;
  }
  return inside;
}

function phraseRows(polygon) {
  const rows = [];
  for (let y = 83; y < 487; y += 24) {
    const runs = [];
    let start = null;
    for (let x = 54; x <= 586; x += 4) {
      const inside = pointInside(x, y, polygon);
      if (inside && start === null) start = x;
      if ((!inside || x >= 586) && start !== null) {
        const end = inside && x >= 586 ? x : x - 4;
        if (end - start > 31) runs.push({ left: start, right: end });
        start = null;
      }
    }
    for (const run of runs) rows.push({ y, ...run, width: run.right - run.left });
  }
  return rows;
}

function phraseFontSize(width) {
  if (width > 350) return 17;
  if (width > 245) return 15;
  if (width > 145) return 12;
  return 10;
}

export function createHeartAnimation(canvas, controls = {}) {
  const context = canvas.getContext('2d', { alpha: true });
  const polygon = heartOutline();
  const rows = phraseRows(polygon);
  const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)');
  let progress = reducedMotion?.matches ? 1 : 0;
  let playing = !reducedMotion?.matches;
  let speed = 1;
  let phrases = ['My favorite person', 'مهربانیِ تو', 'A little more magic', 'دوستت دارم'];
  let theme = 'rose';
  let lastFrame = 0;
  let animationFrame = 0;

  function resize() {
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = 640 * ratio;
    canvas.height = 540 * ratio;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    draw(performance.now());
  }

  function draw(time = performance.now()) {
    if (!context) return;
    const palette = PALETTES[theme] || PALETTES.rose;
    context.clearRect(0, 0, 640, 540);
    const pulse = playing && progress >= 1 ? 1 + Math.sin(time / 480) * 0.012 : 1;
    context.save();
    context.translate(320, 276);
    context.scale(pulse, pulse);
    context.translate(-320, -276);

    const glow = context.createRadialGradient(320, 268, 10, 320, 268, 244);
    glow.addColorStop(0, palette.shadow);
    glow.addColorStop(0.64, 'rgba(255,255,255,0)');
    context.fillStyle = glow;
    context.fillRect(68, 28, 504, 500);

    const visiblePoints = Math.max(2, Math.floor(polygon.length * progress));
    context.beginPath();
    for (let index = 0; index < visiblePoints; index += 1) {
      const point = polygon[index];
      if (index === 0) context.moveTo(point.x, point.y);
      else context.lineTo(point.x, point.y);
    }
    if (progress >= 1) context.closePath();
    context.strokeStyle = palette.core;
    context.globalAlpha = 0.82;
    context.lineWidth = 2.3;
    context.shadowColor = palette.core;
    context.shadowBlur = 14;
    context.stroke();
    context.shadowBlur = 0;
    context.globalAlpha = 1;

    for (let index = 0; index < visiblePoints; index += 9) {
      const point = polygon[index];
      const twinkle = 0.62 + Math.sin(time / 280 + index) * 0.22;
      context.beginPath();
      context.arc(point.x, point.y, index % 27 === 0 ? 2.4 : 1.35, 0, Math.PI * 2);
      context.fillStyle = index % 27 === 0 ? palette.spark : palette.light;
      context.globalAlpha = twinkle;
      context.shadowColor = palette.spark;
      context.shadowBlur = index % 27 === 0 ? 8 : 3;
      context.fill();
    }
    context.shadowBlur = 0;
    context.globalAlpha = 1;

    const words = phrases.length ? phrases : ['My favorite person', 'دوستت دارم'];
    let wordIndex = 0;
    for (const row of rows) {
      const revealAt = 0.1 + ((row.y - 83) / 440) * 0.72;
      if (progress < revealAt) continue;
      let phrase = words[wordIndex % words.length];
      if (row.width < 114 && phrase.length > 12) phrase = phrase.slice(0, 10);
      wordIndex += 1;
      const persian = hasPersian.test(phrase);
      const fontSize = phraseFontSize(row.width);
      context.font = `${row.width > 300 ? 600 : 500} ${fontSize}px ${persian ? 'Vazirmatn, Noto Sans Arabic, sans-serif' : 'DM Sans, sans-serif'}`;
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.direction = persian ? 'rtl' : 'ltr';
      context.fillStyle = palette.ink;
      context.globalAlpha = Math.min(0.94, 0.44 + progress * 0.5);
      context.fillText(phrase, (row.left + row.right) / 2, row.y, Math.max(35, row.width - 6));
    }
    context.globalAlpha = 1;
    context.restore();
  }

  function animate(time) {
    if (lastFrame === 0) lastFrame = time;
    const delta = Math.min(42, time - lastFrame);
    lastFrame = time;
    if (progress < 1) progress = Math.min(1, progress + (delta / 5100) * speed);
    draw(time);
    if (playing) animationFrame = requestAnimationFrame(animate);
  }

  function notify() {
    controls.onPlayingChange?.(playing);
  }

  function schedule() {
    if (animationFrame) cancelAnimationFrame(animationFrame);
    lastFrame = 0;
    animationFrame = requestAnimationFrame(animate);
  }

  function play() {
    if (playing) return;
    playing = true;
    notify();
    schedule();
  }

  function pause() {
    playing = false;
    if (animationFrame) cancelAnimationFrame(animationFrame);
    animationFrame = 0;
    draw();
    notify();
  }

  function restart() {
    progress = 0;
    playing = true;
    notify();
    schedule();
  }

  function setSpeed(value) {
    speed = Math.min(1.8, Math.max(0.6, Number(value) || 1));
  }

  function setPhrases(value) {
    phrases = Array.isArray(value) && value.length ? value.slice(0, 80) : phrases;
    draw();
  }

  function setTheme(value) {
    theme = value in PALETTES ? value : 'rose';
    draw();
  }

  window.addEventListener('resize', resize, { passive: true });
  resize();
  notify();
  if (playing) schedule();

  return { play, pause, restart, setSpeed, setPhrases, setTheme, get playing() { return playing; } };
}

export function releaseConfetti(container) {
  const colors = ['#f6b4c5', '#edc46e', '#d5c2ff', '#a3e7d5', '#fff0c9'];
  const fragment = document.createDocumentFragment();
  const pieces = [];
  for (let index = 0; index < 42; index += 1) {
    const piece = document.createElement('span');
    piece.className = 'confetti-piece';
    piece.style.setProperty('--confetti-x', `${Math.random() * 100}%`);
    piece.style.setProperty('--confetti-delay', `${Math.random() * 0.45}s`);
    piece.style.setProperty('--confetti-color', colors[index % colors.length]);
    piece.style.setProperty('--confetti-rotate', `${Math.random() * 300 - 150}deg`);
    fragment.append(piece);
    pieces.push(piece);
  }
  container.append(fragment);
  window.setTimeout(() => pieces.forEach((piece) => piece.remove()), 2600);
}
