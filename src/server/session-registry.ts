export interface SessionRegistryOptions {
  disconnectGraceMs?: number;
  scheduleTimeout?: (callback: () => void, delayMs: number) => unknown;
  cancelTimeout?: (handle: unknown) => void;
}

interface ClientSession {
  playerId: string | null;
}

export interface IdentifyResult<TSocket> {
  replacedSocket: TSocket | null;
  resumedPendingSession: boolean;
}

export interface UnregisterResult {
  playerId: string | null;
  shouldStartGracePeriod: boolean;
}

const DEFAULT_DISCONNECT_GRACE_MS = 15_000;

export class PlayerSessionRegistry<TSocket> {
  private readonly sessions = new Map<TSocket, ClientSession>();
  private readonly activeSockets = new Map<string, TSocket>();
  private readonly pendingDisconnects = new Map<string, unknown>();
  private readonly disconnectGraceMs: number;
  private readonly scheduleTimeout: (callback: () => void, delayMs: number) => unknown;
  private readonly cancelTimeout: (handle: unknown) => void;

  constructor(options: SessionRegistryOptions = {}) {
    this.disconnectGraceMs = options.disconnectGraceMs ?? DEFAULT_DISCONNECT_GRACE_MS;
    this.scheduleTimeout = options.scheduleTimeout ?? ((callback, delayMs) => setTimeout(callback, delayMs));
    this.cancelTimeout = options.cancelTimeout ?? ((handle) => clearTimeout(handle as ReturnType<typeof setTimeout>));
  }

  register(socket: TSocket): void {
    this.sessions.set(socket, { playerId: null });
  }

  identify(socket: TSocket, playerId: string): IdentifyResult<TSocket> {
    const session = this.getSession(socket);
    const resumedPendingSession = this.clearPendingDisconnect(playerId);
    const existingSocket = this.activeSockets.get(playerId) ?? null;

    if (existingSocket !== null && existingSocket !== socket) {
      const existingSession = this.sessions.get(existingSocket);
      if (existingSession !== undefined) {
        existingSession.playerId = null;
      }
    }

    session.playerId = playerId;
    this.activeSockets.set(playerId, socket);

    return {
      replacedSocket: existingSocket !== socket ? existingSocket : null,
      resumedPendingSession
    };
  }

  unregister(socket: TSocket): UnregisterResult {
    const session = this.sessions.get(socket);
    this.sessions.delete(socket);

    if (session === undefined || session.playerId === null) {
      return {
        playerId: null,
        shouldStartGracePeriod: false
      };
    }

    const playerId = session.playerId;
    if (this.activeSockets.get(playerId) === socket) {
      this.activeSockets.delete(playerId);
      return {
        playerId,
        shouldStartGracePeriod: true
      };
    }

    return {
      playerId: null,
      shouldStartGracePeriod: false
    };
  }

  scheduleDisconnect(playerId: string, onExpire: (playerId: string) => void): void {
    if (this.activeSockets.has(playerId)) {
      return;
    }

    this.clearPendingDisconnect(playerId);
    const handle = this.scheduleTimeout(() => {
      this.pendingDisconnects.delete(playerId);
      if (!this.activeSockets.has(playerId)) {
        onExpire(playerId);
      }
    }, this.disconnectGraceMs);
    this.pendingDisconnects.set(playerId, handle);
  }

  clearPendingDisconnect(playerId: string): boolean {
    const handle = this.pendingDisconnects.get(playerId);
    if (handle === undefined) {
      return false;
    }

    this.cancelTimeout(handle);
    this.pendingDisconnects.delete(playerId);
    return true;
  }

  getActiveSocket(playerId: string): TSocket | null {
    return this.activeSockets.get(playerId) ?? null;
  }

  getPlayerId(socket: TSocket): string | null {
    return this.sessions.get(socket)?.playerId ?? null;
  }

  private getSession(socket: TSocket): ClientSession {
    const session = this.sessions.get(socket);
    if (session === undefined) {
      throw new Error("Socket session was not initialized.");
    }

    return session;
  }
}
