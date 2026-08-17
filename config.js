'use strict';

window.THERE_CONFIG = Object.freeze({
  appName: 'there.fm',

  supabase: {
    url: '',
    anonKey: ''
  },

  limits: {
    roomCodeMin: 4,
    roomCodeMax: 24,
    messageMax: 500,
    maxCards: 100
  },

  features: {
    realtime: true,
    videoSync: true,
    collaborativeDrawing: true,
    gifSearch: true,
    musicCards: true
  }
});
