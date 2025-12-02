/**
 * Session Store - Global state for TV session management
 * Uses a simple pub/sub pattern for React components
 */

import { TVDevice, ConnectionStatus } from '../domain/models';
import { TVSession } from '../domain/remote-interfaces';

/**
 * React hook for session state
 */
import { useState, useEffect } from 'react';

/** Debug logger */
const DEBUG_TAG = '[SessionStore]';
const debug = {
  log: (...args: unknown[]) => console.log(DEBUG_TAG, ...args),
  warn: (...args: unknown[]) => console.warn(DEBUG_TAG, ...args),
  error: (...args: unknown[]) => console.error(DEBUG_TAG, ...args),
};

/** Session state shape */
export interface SessionState {
  device: TVDevice | null;
  session: TVSession | null;
  status: ConnectionStatus;
}

/** Listener callback type */
type Listener = (state: SessionState) => void;

/** Global session state */
let state: SessionState = {
  device: null,
  session: null,
  status: ConnectionStatus.Disconnected,
};

/** Subscribers */
const listeners = new Set<Listener>();

/**
 * Get current session state
 */
export function getSessionState(): SessionState {
  return state;
}

/**
 * Subscribe to session state changes
 */
export function subscribeSession(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Notify all subscribers of state change
 */
function notifyListeners(): void {
  const currentState = state;
  listeners.forEach((listener) => {
    try {
      listener(currentState);
    } catch (err) {
      debug.error('Listener error:', err);
    }
  });
}

/**
 * Set connected session
 */
export function setSession(device: TVDevice, session: TVSession): void {
  debug.log(`Setting session for device: ${device.name}`);
  debug.log(`  Session ID: ${session.sessionId}`);

  state = {
    device,
    session,
    status: ConnectionStatus.Connected,
  };

  notifyListeners();
}

/**
 * Clear session (disconnect)
 */
export async function clearSession(): Promise<void> {
  debug.log('Clearing session...');

  if (state.session) {
    try {
      await state.session.disconnect();
      debug.log('Session disconnected');
    } catch (err) {
      debug.error('Error disconnecting session:', err);
    }
  }

  state = {
    device: null,
    session: null,
    status: ConnectionStatus.Disconnected,
  };

  notifyListeners();
}

/**
 * Update connection status
 */
export function setConnectionStatus(status: ConnectionStatus): void {
  debug.log(`Status changed: ${state.status} -> ${status}`);
  state = { ...state, status };
  notifyListeners();
}

export function useSession(): SessionState {
  const [sessionState, setSessionState] = useState<SessionState>(getSessionState);

  useEffect(() => {
    const unsubscribe = subscribeSession((newState) => {
      setSessionState(newState);
    });
    return unsubscribe;
  }, []);

  return sessionState;
}
