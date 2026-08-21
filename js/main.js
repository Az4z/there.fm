import { state } from './state.js';
import {
  $,
  normalizeName,
  normalizeRoomCode,
  randomColor,
  toast
} from './utils.js';
import {
  loadStoredUser,
  loadPreferences,
  saveUser
} from './storage.js';
import {
  showLanding,
  showRoom
} from './router.js';
import {
  joinRoom,
  leaveRoom,
  onRoomMessage
} from './supabase-room.js';

let removeRoomListener = null;

function generateRoomCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';

  for (let index = 0; index < 6; index++) {
    code += alphabet[
      Math.floor(Math.random() * alphabet.length)
    ];
  }

  return code;
}

function updateConnectionStatus(status) {
  const element = $('connectionStatus');

  if (!element) return;

  const normalized = String(status || '').toUpperCase();

  element.classList.toggle(
    'online',
    normalized === 'SUBSCRIBED'
  );

  element.classList.toggle(
    'offline',
    normalized !== 'SUBSCRIBED'
  );

  if (normalized === 'SUBSCRIBED') {
    element.textContent = 'Online';
  } else if (normalized === 'TIMED_OUT') {
    element.textContent = 'Tempo esgotado';
  } else if (normalized === 'CHANNEL_ERROR') {
    element.textContent = 'Erro';
  } else if (normalized === 'CLOSED') {
    element.textContent = 'Fechado';
  } else {
    element.textContent = 'Conectando...';
  }
}

async function enterRoom(code) {
  if (!state.user?.name) {
    toast('Digite seu nome', 'error');
    return;
  }

  try {
    const status = $('landingStatus');

    if (status) {
      status.textContent = 'Conectando à sala...';
    }

    showRoom(code);
    updateConnectionStatus('JOINING');

    await joinRoom(code);

    if (status) {
      status.textContent = '';
    }

    updateConnectionStatus('SUBSCRIBED');

    window.dispatchEvent(
      new CustomEvent('room:entered', {
        detail: {
          code: state.room.code
        }
      })
    );

    toast(`Você entrou na sala ${state.room.code}`, 'success');
  } catch (error) {
    console.error('Erro ao entrar na sala:', error);

    await leaveRoom();
    showLanding();
    updateConnectionStatus('CLOSED');

    if ($('landingStatus')) {
      $('landingStatus').textContent =
        'Não foi possível conectar. Verifique o Supabase.';
    }

    toast('Não foi possível entrar na sala', 'error');
  }
}

async function exitRoom() {
  await leaveRoom();

  window.dispatchEvent(
    new CustomEvent('room:left')
  );

  showLanding();
  updateConnectionStatus('CLOSED');
}

function bindLandingEvents() {
  $('joinRoomBtn')?.addEventListener('click', () => {
    const box = $('joinRoomBox');

    if (!box) return;

    box.hidden = !box.hidden;

    if (!box.hidden) {
      $('roomCodeInput')?.focus();
    }
  });

  $('createRoomBtn')?.addEventListener('click', () => {
    const name = normalizeName(
      $('nameInput')?.value || ''
    );

    if (!name) {
      toast('Digite seu nome', 'error');
      $('nameInput')?.focus();
      return;
    }

    state.user.name = name;
    saveUser();

    enterRoom(generateRoomCode());
  });

  $('confirmJoinBtn')?.addEventListener('click', () => {
    const name = normalizeName(
      $('nameInput')?.value || ''
    );

    const code = normalizeRoomCode(
      $('roomCodeInput')?.value || ''
    );

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
    saveUser();

    enterRoom(code);
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

function bindRoomEvents() {
  $('leaveRoomBtn')?.addEventListener('click', () => {
    if (window.confirm('Sair da sala?')) {
      exitRoom();
    }
  });

  $('copyCodeBtn')?.addEventListener('click', async () => {
    const code = state.room?.code;

    if (!code) {
      toast('Você não está em uma sala', 'error');
      return;
    }

    try {
      await navigator.clipboard.writeText(code);
      toast('Código copiado', 'success');
    } catch {
      toast(`Código da sala: ${code}`, 'info');
    }
  });

  $('participantsBtn')?.addEventListener('click', () => {
    $('participantsPanel')?.classList.toggle('on');
  });

  $('closeParticipantsBtn')?.addEventListener('click', () => {
    $('participantsPanel')?.classList.remove('on');
  });

  $('themeBtn')?.addEventListener('click', () => {
    window.dispatchEvent(
      new CustomEvent('theme:toggle')
    );
  });
}

function bindModalEvents() {
  document.querySelectorAll('[data-close-modal]').forEach(button => {
    button.addEventListener('click', () => {
      const modal = $(button.dataset.closeModal);

      if (modal) {
        modal.hidden = true;
      }
    });
  });

  document.querySelectorAll('.modal-backdrop').forEach(modal => {
    modal.addEventListener('click', event => {
      if (event.target === modal) {
        modal.hidden = true;
      }
    });
  });
}

function bindGlobalEvents() {
  window.addEventListener('room:status', event => {
    updateConnectionStatus(
      event.detail?.status
    );
  });

  window.addEventListener('room:create', event => {
    enterRoom(event.detail.code);
  });

  window.addEventListener('room:join', event => {
    enterRoom(event.detail.code);
  });

  window.addEventListener('beforeunload', () => {
    leaveRoom();
  });
}

function initialize() {
  loadPreferences();
  loadStoredUser();

  if (!state.user.color) {
    state.user.color = randomColor();
  }

  if (state.user.name && $('nameInput')) {
    $('nameInput').value = state.user.name;
  }

  showLanding();
  updateConnectionStatus('CLOSED');

  bindLandingEvents();
  bindRoomEvents();
  bindModalEvents();
  bindGlobalEvents();

  removeRoomListener = onRoomMessage(message => {
    window.dispatchEvent(
      new CustomEvent('room:message', {
        detail: message
      })
    );
  });

  window.dispatchEvent(
    new CustomEvent('app:ready', {
      detail: { state }
    })
  );
}

initialize();
