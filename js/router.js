import { state } from './state.js';
import { $, setView } from './utils.js';

export function showLanding() {
  setView('landingView', true);
  setView('roomView', false);

  document.body.classList.remove('in-room');

  const input = $('roomCodeInput');
  const box = $('joinRoomBox');

  if (box) box.hidden = true;
  if (input) input.value = '';
}

export function showRoom(code) {
  setView('landingView', false);
  setView('roomView', true);

  document.body.classList.add('in-room');

  if ($('rcode')) {
    $('rcode').textContent = code;
  }

  state.room = {
    ...(state.room || {}),
    code
  };
}

export function isInRoom() {
  return Boolean(state.room?.code);
}
