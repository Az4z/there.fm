import { state } from './state.js';
import {
  $,
  clamp,
  toast
} from './utils.js';
import {
  createAvatarElement,
  getAvatarPosition,
  getAvatarWrap,
  initializeLocalAvatar,
  refreshAvatarElement,
  setAvatarPosition,
  showAvatarBubble,
  broadcastJoin,
  broadcastMyPresence
} from './avatars.js';
import {
  onRoomMessage,
  sendRoomMessage
} from './supabase-room.js';

let unsubscribe = null;
let localPointer = null;

function getCanvasBounds() {
  const canvas = $('cw');

  return {
    width: canvas?.clientWidth || window.innerWidth,
    height: canvas?.clientHeight || window.innerHeight
  };
}

function upsertParticipantListItem(uid, user, status = 'Online') {
  const list = $('partsList');

  if (!list || !user) return;

  let row = list.querySelector(
    `.participant-row[data-uid="${CSS.escape(uid)}"]`
  );

  if (!row) {
    row = document.createElement('div');
    row.className = 'participant-row';
    row.dataset.uid = uid;

    row.addEventListener('click', () => {
      window.dispatchEvent(
        new CustomEvent('profile:open', {
          detail: { uid }
        })
      );
    });

    list.appendChild(row);
  }

  row.replaceChildren();

  const avatar = document.createElement('div');
  avatar.className = 'participant-avatar';

  const photo = user.photo;

  if (photo) {
    const image = document.createElement('img');
    image.src = photo;
    image.alt = '';
    image.referrerPolicy = 'no-referrer';

    image.addEventListener('error', () => {
      image.remove();
      avatar.textContent = (user.name || 'U').charAt(0).toUpperCase();
    });

    avatar.appendChild(image);
  } else {
    avatar.textContent = (user.name || 'U').charAt(0).toUpperCase();
  }

  const info = document.createElement('div');

  const name = document.createElement('div');
  name.className = 'participant-name';
  name.textContent = user.name || 'User';

  const statusText = document.createElement('div');
  statusText.className = 'participant-status';
  statusText.textContent = status;

  info.append(name, statusText);
  row.append(avatar, info);
}

function removeParticipantListItem(uid) {
  $('partsList')
    ?.querySelector(
      `.participant-row[data-uid="${CSS.escape(uid)}"]`
    )
    ?.remove();
}

function renderPeer(uid, user, x, y) {
  const items = $('items');

  if (!items || !user || uid === state.user?.id) return;

  let wrap = getAvatarWrap(uid);

  if (!wrap) {
    wrap = createAvatarElement(user);
    wrap.style.left = `${Number(x) || 100}px`;
    wrap.style.top = `${Number(y) || 100}px`;
    items.appendChild(wrap);
  } else {
    const updated = refreshAvatarElement(wrap, user);
    wrap = updated || wrap;
  }

  state.peers.set(uid, {
    ...user,
    id: uid,
    x: Number(x) || 100,
    y: Number(y) || 100,
    lastSeen: Date.now()
  });

  upsertParticipantListItem(uid, user, 'Online');
}

function removePeer(uid) {
  state.peers.delete(uid);

  getAvatarWrap(uid)?.remove();
  removeParticipantListItem(uid);

  window.dispatchEvent(
    new CustomEvent('peer:removed', {
      detail: { uid }
    })
  );
}

function handlePeerMessage(message) {
  if (!message || message.uid === state.user?.id) return;

  const uid = message.uid;
  const user = {
    ...(message.user || {}),
    id: uid
  };

  switch (message.type) {
    case 'JOIN': {
      renderPeer(uid, user, message.x, message.y);

      broadcastMyPresence();

      sendRoomMessage({
        type: 'ROOM_STATE',
        target: uid,
        user: state.user,
        x: getAvatarPosition(state.user.id).x,
        y: getAvatarPosition(state.user.id).y
      });

      break;
    }

    case 'ROOM_STATE': {
      if (message.target !== state.user?.id) break;

      renderPeer(uid, user, message.x, message.y);
      break;
    }

    case 'HEARTBEAT': {
      renderPeer(uid, user, message.x, message.y);
      break;
    }

    case 'MOVE_AV': {
      const peer = state.peers.get(uid);

      if (peer) {
        peer.x = Number(message.x) || peer.x;
        peer.y = Number(message.y) || peer.y;
        peer.lastSeen = Date.now();
      }

      setAvatarPosition(uid, message.x, message.y);
      break;
    }

    case 'LEAVE': {
      removePeer(uid);
      break;
    }

    case 'CHAT': {
      showAvatarBubble(uid, message.text || '');
      break;
    }

    case 'GIF_CHAT': {
      showAvatarBubble(uid, message.url || '', true);
      break;
    }

    default:
      break;
  }
}

function moveLocalAvatar(event) {
  if (!localPointer || event.pointerId !== localPointer.pointerId) {
    return;
  }

  const wrap = getAvatarWrap(state.user.id);

  if (!wrap) return;

  const bounds = getCanvasBounds();

  const nextX = clamp(
    event.clientX - localPointer.offsetX,
    0,
    Math.max(0, bounds.width - wrap.offsetWidth)
  );

  const nextY = clamp(
    event.clientY - localPointer.offsetY,
    0,
    Math.max(0, bounds.height - wrap.offsetHeight)
  );

  setAvatarPosition(state.user.id, nextX, nextY);

  sendRoomMessage({
    type: 'MOVE_AV',
    x: Math.round(nextX),
    y: Math.round(nextY)
  });
}

function stopMovingAvatar(event) {
  if (!localPointer) return;
  if (event && event.pointerId !== localPointer.pointerId) return;

  const wrap = getAvatarWrap(state.user.id);

  if (wrap && localPointer.pointerId != null) {
    try {
      wrap.releasePointerCapture(localPointer.pointerId);
    } catch {}
  }

  wrap?.classList.remove('dragging');

  localPointer = null;

  broadcastMyPresence();
}

function startMovingAvatar(event) {
  const wrap = event.target.closest(
    `.av-wrap[data-uid="${CSS.escape(state.user.id)}"]`
  );

  if (!wrap) return;

  if (event.button != null && event.button !== 0) return;

  const rect = wrap.getBoundingClientRect();

  localPointer = {
    pointerId: event.pointerId,
    offsetX: event.clientX - rect.left,
    offsetY: event.clientY - rect.top
  };

  wrap.classList.add('dragging');

  try {
    wrap.setPointerCapture(event.pointerId);
  } catch {}

  event.preventDefault();
}

function bindAvatarDragging() {
  const items = $('items');

  if (!items) return;

  items.addEventListener(
    'pointerdown',
    startMovingAvatar,
    { passive: false }
  );

  items.addEventListener(
    'pointermove',
    event => {
      if (!localPointer) return;

      moveLocalAvatar(event);
      event.preventDefault();
    },
    { passive: false }
  );

  items.addEventListener(
    'pointerup',
    stopMovingAvatar,
    { passive: true }
  );

  items.addEventListener(
    'pointercancel',
    stopMovingAvatar,
    { passive: true }
  );

  window.addEventListener(
    'blur',
    () => stopMovingAvatar()
  );
}

export function initializeParticipants() {
  if (unsubscribe) unsubscribe();

  unsubscribe = onRoomMessage(handlePeerMessage);

  initializeLocalAvatar();
  bindAvatarDragging();

  broadcastJoin();
}

export function cleanupParticipants() {
  if (unsubscribe) {
    unsubscribe();
    unsubscribe = null;
  }

  localPointer = null;

  for (const uid of state.peers.keys()) {
    getAvatarWrap(uid)?.remove();
  }

  state.peers.clear();

  $('partsList')?.replaceChildren();

  const local = getAvatarWrap(state.user?.id);

  if (local) {
    local.remove();
  }
}

export function getParticipants() {
  return [
    ...(state.user ? [{ ...state.user, self: true }] : []),
    ...[...state.peers.values()].map(peer => ({
      ...peer,
      self: false
    }))
  ];
}

export function removeParticipant(uid) {
  if (uid) {
    removePeer(uid);
  }
}

window.addEventListener('room:entered', initializeParticipants);
window.addEventListener('room:left', cleanupParticipants);
window.addEventListener('peer:removed', event => {
  removePeer(event.detail.uid);
});
