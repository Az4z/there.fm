import { CONFIG } from './config.js';
import { state } from './state.js';

let supabaseClient = null;

export function getSupabase() {
  if (!supabaseClient) {
    supabaseClient = window.supabase.createClient(
      CONFIG.supabaseUrl,
      CONFIG.supabaseAnonKey
    );
  }

  return supabaseClient;
}

export async function joinRoom(code, onMessage, onStatus) {
  await leaveRoom();

  const channel = getSupabase().channel(
    `${CONFIG.roomPrefix}${code}`,
    {
      config: {
        broadcast: {
          self: false,
          ack: true
        }
      }
    }
  );

  channel.on(
    'broadcast',
    { event: 'msg' },
    ({ payload }) => {
      if (payload) onMessage(payload);
    }
  );

  channel.subscribe(status => {
    onStatus?.(status);
  });

  state.channel = channel;
  state.room = { code };

  return channel;
}

export async function sendRoomMessage(message) {
  if (!state.channel || !state.room) return false;

  const result = await state.channel.send({
    type: 'broadcast',
    event: 'msg',
    payload: {
      ...message,
      room: state.room.code,
      uid: state.user?.id || null,
      sentAt: Date.now()
    }
  });

  return !result?.error;
}

export async function leaveRoom() {
  if (!state.channel) return;

  try {
    await state.channel.send({
      type: 'broadcast',
      event: 'msg',
      payload: {
        type: 'LEAVE',
        uid: state.user?.id || null,
        room: state.room?.code || null,
        sentAt: Date.now()
      }
    });
  } catch {}

  try {
    await getSupabase().removeChannel(state.channel);
  } catch {}

  state.channel = null;
  state.room = null;
}