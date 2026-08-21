import { state } from './state.js';
import {
  $,
  safeImageUrl
} from './utils.js';
import { sendRoomMessage } from './supabase-room.js';

function darkenColor(color, amount = 28) {
  const value = String(color || '#c45c5c')
    .replace('#', '')
    .padEnd(6, '0')
    .slice(0, 6);

  const number = parseInt(value, 16);

  if (Number.isNaN(number)) {
    return '#783d3d';
  }

  const r = Math.max(0, (number >> 16) - amount);
  const g = Math.max(0, ((number >> 8) & 255) - amount);
  const b = Math.max(0, (number & 255) - amount);

  return `rgb(${r}, ${g}, ${b})`;
}

function getInitial(user) {
  return String(user?.name || 'U')
    .trim()
    .charAt(0)
    .toUpperCase() || 'U';
}

function createFrameElement(user) {
  const frameUrl = safeImageUrl(user?.frame);

  if (!frameUrl) {
    return null;
  }

  const frame = document.createElement('img');
  frame.className = 'frame-overlay';
  frame.src = frameUrl;
  frame.alt = '';
  frame.draggable = false;
  frame.referrerPolicy = 'no-referrer';

  const x = 50 + Number(user?.frame_x || 0);
  const y = 50 + Number(user?.frame_y || 0);
  const scale = (Number(user?.frame_scale) || 1) * 1.45;

  frame.style.left = `${x}%`;
  frame.style.top = `${y}%`;
  frame.style.width = '100%';
  frame.style.height = '100%';
  frame.style.transform = `translate(-50%, -50%) scale(${scale})`;

  frame.addEventListener('error', () => {
    frame.remove();
  });

  return frame;
}

export function createAvatarElement(user, options = {}) {
  const wrap = document.createElement('div');
  wrap.className = 'av-wrap';

  if (options.self) {
    wrap.classList.add('peer-self');
  }

  wrap.dataset.uid = user.id;

  const avatar = document.createElement('div');
  avatar.className = 'av';

  const fill = document.createElement('div');
  fill.className = 'av-fill';

  const photoUrl = safeImageUrl(user.photo);

  if (photoUrl) {
    const image = document.createElement('img');
    image.src = photoUrl;
    image.alt = '';
    image.draggable = false;
    image.referrerPolicy = 'no-referrer';

    image.addEventListener('error', () => {
      image.remove();
      fill.textContent = getInitial(user);
    });

    fill.appendChild(image);
  } else {
    fill.textContent = getInitial(user);
  }

  const color = user.color || '#c45c5c';

  fill.style.background =
    `linear-gradient(135deg, ${color}, ${darkenColor(color)})`;

  avatar.appendChild(fill);

  const frame = createFrameElement(user);

  if (frame) {
    avatar.appendChild(frame);
  }

  const name = document.createElement('div');
  name.className = 'av-name';
  name.textContent = user.name || 'User';

  wrap.append(avatar, name);

  return wrap;
}

export function refreshAvatarElement(wrap, user) {
  if (!wrap) return;

  const parent = wrap.parentElement;
  const left = wrap.style.left;
  const top = wrap.style.top;

  const replacement = createAvatarElement(user, {
    self: user.id === state.user?.id
  });

  replacement.style.left = left;
  replacement.style.top = top;

  parent?.replaceChild(replacement, wrap);

  return replacement;
}

export function getAvatarWrap(uid) {
  return document.querySelector(
    `.av-wrap[data-uid="${CSS.escape(uid)}"]`
  );
}

export function getAvatarPosition(uid) {
  const wrap = getAvatarWrap(uid);

  if (!wrap) {
    return { x: 100, y: 100 };
  }

  return {
    x: parseFloat(wrap.style.left) || 0,
    y: parseFloat(wrap.style.top) || 0
  };
}

export function setAvatarPosition(uid, x, y) {
  const wrap = getAvatarWrap(uid);

  if (!wrap) return;

  wrap.style.left = `${Math.round(x)}px`;
  wrap.style.top = `${Math.round(y)}px`;
}

export function showAvatarBubble(uid, content, isGif = false) {
  const wrap = getAvatarWrap(uid);

  if (!wrap) return;

  const existing = wrap.querySelector('.av-bubble');
  existing?.remove();

  const bubble = document.createElement('div');
  bubble.className = 'av-bubble';

  if (isGif) {
    bubble.classList.add('gif-bubble');

    const image = document.createElement('img');
    image.src = safeImageUrl(content);
    image.alt = '';
    image.referrerPolicy = 'no-referrer';

    image.addEventListener('error', () => {
      bubble.remove();
    });

    bubble.appendChild(image);
  } else {
    bubble.textContent = content;
  }

  wrap.appendChild(bubble);

  const duration = isGif ? 10000 : 8000;

  setTimeout(() => {
    if (!bubble.isConnected) return;

    bubble.classList.add('fading');

    setTimeout(() => {
      bubble.remove();
    }, 500);
  }, duration);
}

function createLocalAvatar() {
  const items = $('items');

  if (!items || !state.user) return;

  items.querySelector(
    `.av-wrap[data-uid="${CSS.escape(state.user.id)}"]`
  )?.remove();

  const avatar = createAvatarElement(state.user, { self: true });

  const x = 100 + Math.random() * 180;
  const y = 90 + Math.random() * 150;

  avatar.style.left = `${Math.round(x)}px`;
  avatar.style.top = `${Math.round(y)}px`;

  items.appendChild(avatar);

  return avatar;
}

export async function broadcastMyPresence() {
  if (!state.user || !state.room) return;

  const position = getAvatarPosition(state.user.id);

  await sendRoomMessage({
    type: 'HEARTBEAT',
    user: state.user,
    x: position.x,
    y: position.y
  });
}

export async function broadcastJoin() {
  if (!state.user || !state.room) return;

  const position = getAvatarPosition(state.user.id);

  await sendRoomMessage({
    type: 'JOIN',
    user: state.user,
    x: position.x,
    y: position.y
  });
}

export function initializeLocalAvatar() {
  return createLocalAvatar();
    }
