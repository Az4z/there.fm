export const state = {
  user: null,

  room: null,
  channel: null,
  connection: 'offline',

  peers: new Map(),
  cards: new Map(),

  youtubePlayers: new Map(),
  musicPlayers: new Map(),

  selectedCard: null,

  drawing: {
    enabled: false,
    active: false,
    eraser: false,
    color: '#eae6de',
    size: 8,
    opacity: 1,
    strokes: [],
    revision: 0
  },

  ui: {
    theme: localStorage.getItem('tfm_theme') || 'dark',
    toolbarPosition: localStorage.getItem('tfm_tb') || 'top'
  }
};
