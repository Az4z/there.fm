export const $ = id => document.getElementById(id);

export const qs = (selector, root = document) =>
  root.querySelector(selector);

export const qsa = (selector, root = document) =>
  [...root.querySelectorAll(selector)];

export function makeId(prefix = 'id') {
  const random = crypto.randomUUID
    ? crypto.randomUUID().slice(0, 8)
    : Math.random().toString(36).slice(2, 10);

  return `${prefix}_${Date.now()}_${random}`;
}

export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function formatTime(seconds = 0) {
  const total = Math.max(0, Math.floor(Number(seconds) || 0));
  const minutes = Math.floor(total / 60);
  const secs = String(total % 60).padStart(2, '0');

  return `${minutes}:${secs}`;
}

export function normalizeRoomCode(value = '') {
  return value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 12);
}

export function normalizeName(value = '') {
  return value.trim().replace(/s+/g, ' ').slice(0, 40);
}

export function safeUrl(value, protocols = ['https:']) {
  try {
    const url = new URL(value, location.href);

    if (!protocols.includes(url.protocol)) {
      return '';
    }

    return url.href;
  } catch {
    return '';
  }
}

export function safeImageUrl(value) {
  return safeUrl(value, ['https:', 'http:']);
}

export function randomColor() {
  const colors = [
    '#c45c5c',
    '#bd7d52',
    '#b49b51',
    '#6eaa78',
    '#5a9eaa',
    '#6d78b7',
    '#9a6aad',
    '#b66d92'
  ];

  return colors[Math.floor(Math.random() * colors.length)];
}

export function toast(message, type = 'info') {
  const region = $('toastRegion');
  if (!region) return;

  const item = document.createElement('div');
  item.className = `toast toast-${type}`;
  item.textContent = message;

  region.appendChild(item);

  setTimeout(() => {
    item.remove();
  }, 3500);
}

export function openModal(id) {
  const modal = $(id);
  if (modal) modal.hidden = false;
}

export function closeModal(id) {
  const modal = $(id);
  if (modal) modal.hidden = true;
}

export function setView(id, visible) {
  const element = $(id);
  if (element) element.hidden = !visible;
}

export function isRoomReady() {
  return Boolean(state.room && state.channel);
}
