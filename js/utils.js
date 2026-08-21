export const $ = id => document.getElementById(id);

export const qs = (selector, root = document) =>
  root.querySelector(selector);

export const qsa = (selector, root = document) =>
  [...root.querySelectorAll(selector)];

export function uid(prefix = 'id') {
  return `${prefix}_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
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

export function safeUrl(value, protocols = ['https:']) {
  try {
    const url = new URL(value, location.href);
    return protocols.includes(url.protocol) ? url.href : '';
  } catch {
    return '';
  }
}

export function escapeHtml(value = '') {
  const div = document.createElement('div');
  div.textContent = value;
  return div.innerHTML;
}