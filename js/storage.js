import { state } from './state.js';
import { randomColor } from './utils.js';

const USER_KEY = 'tfm_user';
const THEME_KEY = 'tfm_theme';
const TOOLBAR_KEY = 'tfm_tb';

export function loadStoredUser() {
  let stored = null;

  try {
    stored = JSON.parse(localStorage.getItem(USER_KEY) || 'null');
  } catch {
    stored = null;
  }

  state.user = {
    id: stored?.id || crypto.randomUUID(),
    name: stored?.name || '',
    color: stored?.color || randomColor(),
    photo: stored?.photo || '',
    frame: stored?.frame || '',
    frame_scale: Number(stored?.frame_scale) || 1,
    frame_x: Number(stored?.frame_x) || 0,
    frame_y: Number(stored?.frame_y) || 0
  };

  return state.user;
}

export function saveUser(user = state.user) {
  if (!user) return;

  localStorage.setItem(
    USER_KEY,
    JSON.stringify({
      id: user.id,
      name: user.name,
      color: user.color,
      photo: user.photo,
      frame: user.frame,
      frame_scale: user.frame_scale,
      frame_x: user.frame_x,
      frame_y: user.frame_y
    })
  );
}

export function loadPreferences() {
  state.ui.theme = localStorage.getItem(THEME_KEY) || 'dark';
  state.ui.toolbarPosition = localStorage.getItem(TOOLBAR_KEY) || 'top';

  return state.ui;
}

export function saveTheme(theme) {
  state.ui.theme = theme;
  localStorage.setItem(THEME_KEY, theme);
}

export function saveToolbarPosition(position) {
  state.ui.toolbarPosition = position;
  localStorage.setItem(TOOLBAR_KEY, position);
}

export function clearStoredUser() {
  localStorage.removeItem(USER_KEY);
}
