'use strict';

const COLS = 10;
const ROWS = 20;
const BLOCK = 30;

const COLORS = [
  null,
  '#4dd0e1', // I - cyan
  '#ffd54f', // O - yellow
  '#ba68c8', // T - purple
  '#81c784', // S - green
  '#e57373', // Z - red
  '#7986cb', // J - indigo
  '#ffb74d', // L - orange
];

const PIECES = [
  null,
  [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]], // I
  [[2,2],[2,2]],                               // O
  [[0,3,0],[3,3,3],[0,0,0]],                  // T
  [[0,4,4],[4,4,0],[0,0,0]],                  // S
  [[5,5,0],[0,5,5],[0,0,0]],                  // Z
  [[6,0,0],[6,6,6],[0,0,0]],                  // J
  [[0,0,7],[7,7,7],[0,0,0]],                  // L
];

// Paleta suave usada por el skin "pastel" (mismos índices que COLORS)
const PASTEL_COLORS = [
  null,
  '#a8dadc', // I
  '#fff3b0', // O
  '#d8bbff', // T
  '#b8e6b8', // S
  '#ffb3ba', // Z
  '#b3c6ff', // J
  '#ffd8a8', // L
];

const LINE_SCORES = [0, 100, 300, 500, 800];

const SKIN_STORAGE_KEY = 'tetris-skin';
const SKINS = ['retro', 'neon', 'pastel', 'pixel'];

const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const nextCanvas = document.getElementById('next-canvas');
const nextCtx = nextCanvas.getContext('2d');
const scoreEl = document.getElementById('score');
const linesEl = document.getElementById('lines');
const levelEl = document.getElementById('level');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayScore = document.getElementById('overlay-score');
const restartBtn = document.getElementById('restart-btn');
const skinSelect = document.getElementById('skin-select');

let board, current, next, score, lines, level, lastTime, dropAccum, dropInterval, animId;
let paused = false;
let gameOver = false;
let currentSkin = 'retro';

function setSkin(skin) {
  currentSkin = SKINS.includes(skin) ? skin : 'retro';
  document.body.dataset.skin = currentSkin;
  if (skinSelect) skinSelect.value = currentSkin;
  localStorage.setItem(SKIN_STORAGE_KEY, currentSkin);
  // El loop redibuja cada frame; si está pausado o hay game over, forzamos un redraw inmediato.
  if (paused || gameOver) draw();
}

function createBoard() {
  return Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
}

function randomPiece() {
  const type = Math.floor(Math.random() * 7) + 1;
  const shape = PIECES[type].map(row => [...row]);
  return { type, shape, x: Math.floor(COLS / 2) - Math.floor(shape[0].length / 2), y: 0 };
}

function collide(shape, ox, oy) {
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (!shape[r][c]) continue;
      const nx = ox + c;
      const ny = oy + r;
      if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
      if (ny >= 0 && board[ny][nx]) return true;
    }
  }
  return false;
}

function rotateCW(shape) {
  const rows = shape.length, cols = shape[0].length;
  const result = Array.from({ length: cols }, () => new Array(rows).fill(0));
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      result[c][rows - 1 - r] = shape[r][c];
  return result;
}

function tryRotate() {
  const rotated = rotateCW(current.shape);
  const kicks = [0, -1, 1, -2, 2];
  for (const kick of kicks) {
    if (!collide(rotated, current.x + kick, current.y)) {
      current.shape = rotated;
      current.x += kick;
      return;
    }
  }
}

function merge() {
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        board[current.y + r][current.x + c] = current.shape[r][c];
}

function clearLines() {
  let cleared = 0;
  for (let r = ROWS - 1; r >= 0; r--) {
    if (board[r].every(v => v !== 0)) {
      board.splice(r, 1);
      board.unshift(new Array(COLS).fill(0));
      cleared++;
      r++;
    }
  }
  if (cleared) {
    lines += cleared;
    score += (LINE_SCORES[cleared] || 0) * level;
    level = Math.floor(lines / 10) + 1;
    dropInterval = Math.max(100, 1000 - (level - 1) * 90);
    updateHUD();
  }
}

function ghostY() {
  let gy = current.y;
  while (!collide(current.shape, current.x, gy + 1)) gy++;
  return gy;
}

function hardDrop() {
  const gy = ghostY();
  score += (gy - current.y) * 2;
  current.y = gy;
  lockPiece();
}

function softDrop() {
  if (!collide(current.shape, current.x, current.y + 1)) {
    current.y++;
    score += 1;
    updateHUD();
  } else {
    lockPiece();
  }
}

function lockPiece() {
  merge();
  clearLines();
  spawn();
}

function spawn() {
  current = next;
  next = randomPiece();
  if (collide(current.shape, current.x, current.y)) {
    endGame();
  }
  drawNext();
}

function updateHUD() {
  scoreEl.textContent = score.toLocaleString();
  linesEl.textContent = lines;
  levelEl.textContent = level;
}

function drawRetroBlock(context, px, py, size, color) {
  context.fillStyle = color;
  context.fillRect(px + 1, py + 1, size - 2, size - 2);
  // highlight
  context.fillStyle = 'rgba(255,255,255,0.12)';
  context.fillRect(px + 1, py + 1, size - 2, 4);
}

function drawNeonBlock(context, px, py, size, color) {
  context.save();
  context.shadowBlur = size * 0.5;
  context.shadowColor = color;
  context.fillStyle = color;
  context.fillRect(px + 2, py + 2, size - 4, size - 4);
  context.restore();
  context.fillStyle = 'rgba(255,255,255,0.25)';
  context.fillRect(px + 2, py + 2, size - 4, 3);
}

// Se comprueba una única vez (no cambia en tiempo de ejecución) en vez de en cada bloque dibujado.
const SUPPORTS_ROUND_RECT = typeof ctx.roundRect === 'function';

function drawPastelBlock(context, px, py, size, color) {
  const radius = size * 0.2;
  const rx = px + 1;
  const ry = py + 1;
  const w = size - 2;
  const h = size - 2;
  context.fillStyle = color;
  context.beginPath();
  if (SUPPORTS_ROUND_RECT) {
    context.roundRect(rx, ry, w, h, radius);
  } else {
    context.moveTo(rx + radius, ry);
    context.arcTo(rx + w, ry, rx + w, ry + h, radius);
    context.arcTo(rx + w, ry + h, rx, ry + h, radius);
    context.arcTo(rx, ry + h, rx, ry, radius);
    context.arcTo(rx, ry, rx + w, ry, radius);
    context.closePath();
  }
  context.fill();
  context.fillStyle = 'rgba(255,255,255,0.35)';
  context.beginPath();
  context.arc(rx + w * 0.3, ry + h * 0.3, size * 0.14, 0, Math.PI * 2);
  context.fill();
}

// El paso del patrón solo depende de `size` (constante por canvas); se cachea por tamaño
// para no recalcularlo en cada bloque de cada frame.
const pixelStepCache = new Map();
function getPixelStep(size) {
  if (!pixelStepCache.has(size)) {
    pixelStepCache.set(size, Math.max(4, Math.floor(size / 6)));
  }
  return pixelStepCache.get(size);
}

function drawPixelBlock(context, px, py, size, color) {
  context.fillStyle = color;
  context.fillRect(px + 1, py + 1, size - 2, size - 2);
  const step = getPixelStep(size);
  context.fillStyle = 'rgba(0,0,0,0.15)';
  for (let gx = px + 1; gx < px + size - 1; gx += step) {
    for (let gy = py + 1; gy < py + size - 1; gy += step) {
      const cellIndex = Math.floor((gx - px) / step) + Math.floor((gy - py) / step);
      if (cellIndex % 2 === 0) {
        const w = Math.min(step - 1, px + size - 1 - gx);
        const h = Math.min(step - 1, py + size - 1 - gy);
        if (w > 0 && h > 0) context.fillRect(gx, gy, w, h);
      }
    }
  }
  context.strokeStyle = 'rgba(0,0,0,0.4)';
  context.lineWidth = 1;
  context.strokeRect(px + 1, py + 1, size - 2, size - 2);
}

// Tabla de despliegue: cada skin declara su función de dibujo y su paleta de colores.
// Añadir un skin nuevo es puramente aditivo (no toca el if/else de drawBlock).
const SKIN_RENDERERS = {
  retro: { draw: drawRetroBlock, colors: COLORS },
  neon: { draw: drawNeonBlock, colors: COLORS },
  pastel: { draw: drawPastelBlock, colors: PASTEL_COLORS },
  pixel: { draw: drawPixelBlock, colors: COLORS },
};

function drawBlock(context, x, y, colorIndex, size, alpha) {
  if (!colorIndex) return;
  const px = x * size;
  const py = y * size;
  context.globalAlpha = alpha ?? 1;
  const renderer = SKIN_RENDERERS[currentSkin] || SKIN_RENDERERS.retro;
  renderer.draw(context, px, py, size, renderer.colors[colorIndex]);
  context.globalAlpha = 1;
}

function drawGrid() {
  ctx.strokeStyle = '#22222e';
  ctx.lineWidth = 0.5;
  for (let c = 1; c < COLS; c++) {
    ctx.beginPath();
    ctx.moveTo(c * BLOCK, 0);
    ctx.lineTo(c * BLOCK, ROWS * BLOCK);
    ctx.stroke();
  }
  for (let r = 1; r < ROWS; r++) {
    ctx.beginPath();
    ctx.moveTo(0, r * BLOCK);
    ctx.lineTo(COLS * BLOCK, r * BLOCK);
    ctx.stroke();
  }
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawGrid();

  // board
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      drawBlock(ctx, c, r, board[r][c], BLOCK);

  // ghost
  const gy = ghostY();
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        drawBlock(ctx, current.x + c, gy + r, current.shape[r][c], BLOCK, 0.2);

  // current piece
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      drawBlock(ctx, current.x + c, current.y + r, current.shape[r][c], BLOCK);
}

function drawNext() {
  const NB = 30;
  nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
  const shape = next.shape;
  const offX = Math.floor((4 - shape[0].length) / 2);
  const offY = Math.floor((4 - shape.length) / 2);
  for (let r = 0; r < shape.length; r++)
    for (let c = 0; c < shape[r].length; c++)
      drawBlock(nextCtx, offX + c, offY + r, shape[r][c], NB);
}

function endGame() {
  gameOver = true;
  cancelAnimationFrame(animId);
  overlayTitle.textContent = 'GAME OVER';
  overlayScore.textContent = `Puntuación: ${score.toLocaleString()}`;
  overlay.classList.remove('hidden');
}

function togglePause() {
  if (gameOver) return;
  paused = !paused;
  if (!paused) {
    lastTime = performance.now();
    loop(lastTime);
  } else {
    cancelAnimationFrame(animId);
    overlayTitle.textContent = 'PAUSA';
    overlayScore.textContent = '';
    overlay.classList.remove('hidden');
  }
}

function loop(ts) {
  const dt = ts - lastTime;
  lastTime = ts;
  dropAccum += dt;
  if (dropAccum >= dropInterval) {
    dropAccum = 0;
    if (!collide(current.shape, current.x, current.y + 1)) {
      current.y++;
    } else {
      lockPiece();
    }
  }
  draw();
  animId = requestAnimationFrame(loop);
}

function init() {
  board = createBoard();
  score = 0;
  lines = 0;
  level = 1;
  paused = false;
  gameOver = false;
  dropInterval = 1000;
  dropAccum = 0;
  lastTime = performance.now();
  next = randomPiece();
  spawn();
  updateHUD();
  overlay.classList.add('hidden');
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

document.addEventListener('keydown', e => {
  if (e.code === 'KeyP') { togglePause(); return; }
  if (paused || gameOver) return;
  switch (e.code) {
    case 'ArrowLeft':
      if (!collide(current.shape, current.x - 1, current.y)) current.x--;
      break;
    case 'ArrowRight':
      if (!collide(current.shape, current.x + 1, current.y)) current.x++;
      break;
    case 'ArrowDown':
      softDrop();
      break;
    case 'ArrowUp':
    case 'KeyX':
      tryRotate();
      break;
    case 'Space':
      e.preventDefault();
      hardDrop();
      break;
  }
  updateHUD();
});

restartBtn.addEventListener('click', init);

if (skinSelect) {
  skinSelect.addEventListener('change', () => setSkin(skinSelect.value));
}

const savedSkin = localStorage.getItem(SKIN_STORAGE_KEY);
setSkin(SKINS.includes(savedSkin) ? savedSkin : 'retro');

init();
