import { state } from './state.js';
import {
  $,
  normalizeName,
  normalizeRoomCode,
  randomColor,
  setView,
  toast
} from './utils.js';

function createLocalUser() {
  const saved = JSON.parse(localStorage.getItem('tfm_user') || 'null');

  const user = {
    id: saved?.id || crypto.randomUUID(),
    name: saved?.name || '',
    color: saved?.color || randomColor(),
    photo: saved?.photo || '',
    frame: saved?.frame || '',
    frame_scale: saved?.frame_scale || 1,
    frame_x: saved?.frame_x || 0,
    frame_y: saved?.frame_y || 0
  };

  state.user = user;
  return user;
}

function saveLocalUser() {
  if (!state.user) return;

  localStorage.setItem(
    'tfm_user',
    JSON.stringify(state.user)
  );
}

function generateRoomCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';

  for (let i = 0; i < 6; i++) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)];
  }

  return code;
}

function bindLandingEvents() {
  $('joinRoomBtn')?.addEventListener('click', () => {
    $('joinRoomBox').hidden = !$('joinRoomBox').hidden;
    $('roomCodeInput')?.focus();
  });

  $('createRoomBtn')?.addEventListener('click', () => {
    const name = normalizeName($('nameInput')?.value || '');

    if (!name) {
      toast('Digite seu nome', 'error');
      $('nameInput')?.focus();
      return;
    }

    state.user.name = name;
    saveLocalUser();

    const code = generateRoomCode();
    window.dispatchEvent(
      new CustomEvent('room:create', { detail: { code } })
    );
  });

  $('confirmJoinBtn')?.addEventListener('click', () => {
    const name = normalizeName($('nameInput')?.value || '');
    const code = normalizeRoomCode($('roomCodeInput')?.value || '');

    if (!name) {
      toast('Digite seu nome', 'error');
      $('nameInput')?.focus();
      return;
    }

    if (code.length < 4) {
      toast('Digite um código válido', 'error');
      $('roomCodeInput')?.focus();
      return;
    }

    state.user.name = name;
    saveLocalUser();

    window.dispatchEvent(
      new CustomEvent('room:join', { detail: { code } })
    );
  });
}

function bindGlobalEvents() {
  document.querySelectorAll('[data-close-modal]').forEach(button => {
    button.addEventListener('click', () => {
      const id = button.dataset.closeModal;
      $(id).hidden = true;
    });
  });

  document.querySelectorAll('.modal-backdrop').forEach(backdrop => {
    backdrop.addEventListener('click', event => {
      if (event.target === backdrop) {
        backdrop.hidden = true;
      }
    });
  });

  $('nameInput')?.addEventListener('keydown', event => {
    if (event.key === 'Enter') {
      $('createRoomBtn')?.click();
    }
  });

  $('roomCodeInput')?.addEventListener('keydown', event => {
    if (event.key === 'Enter') {
      $('confirmJoinBtn')?.click();
    }
  });
}

function initialize() {
  createLocalUser();

  if (state.user.name) {
    $('nameInput').value = state.user.name;
  }

  setView('landingView', true);
  setView('roomView', false);

  bindLandingEvents();
  bindGlobalEvents();

  window.dispatchEvent(
    new CustomEvent('app:ready', { detail: { state } })
  );
}

initialize();
