export const state = {
  user: null,
  room: null,
  channel: null,
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
    strokes: []
  },
  ui: {
    theme: 'dark',
    toolbarPosition: 'top'
  }
};