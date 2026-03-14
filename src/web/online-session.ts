export interface PersistedOnlineSession {
  serverUrl: string;
  playerId: string;
  displayNameInput: string;
  roomIdInput: string;
  shouldReconnect: boolean;
}

export interface PersistedAuthSession {
  sessionToken: string;
}

export function loadPersistedAuthSession(
  storage: Pick<Storage, "getItem">,
  key: string
): PersistedAuthSession | null {
  try {
    const rawValue = storage.getItem(key);
    if (rawValue === null) {
      return null;
    }

    const parsed = JSON.parse(rawValue) as Partial<PersistedAuthSession>;
    if (typeof parsed.sessionToken !== "string") {
      return null;
    }

    return {
      sessionToken: parsed.sessionToken
    };
  } catch {
    return null;
  }
}

export function loadPersistedOnlineSession(
  storage: Pick<Storage, "getItem">,
  key: string
): PersistedOnlineSession | null {
  try {
    const rawValue = storage.getItem(key);
    if (rawValue === null) {
      return null;
    }

    const parsed = JSON.parse(rawValue) as Partial<PersistedOnlineSession>;
    if (
      typeof parsed.serverUrl !== "string" ||
      typeof parsed.playerId !== "string" ||
      typeof parsed.displayNameInput !== "string" ||
      typeof parsed.roomIdInput !== "string" ||
      typeof parsed.shouldReconnect !== "boolean"
    ) {
      return null;
    }

    return {
      serverUrl: parsed.serverUrl,
      playerId: parsed.playerId,
      displayNameInput: parsed.displayNameInput,
      roomIdInput: parsed.roomIdInput,
      shouldReconnect: parsed.shouldReconnect
    };
  } catch {
    return null;
  }
}

export function persistAuthSession(
  storage: Pick<Storage, "setItem" | "removeItem">,
  key: string,
  sessionToken: string | null
): void {
  if (sessionToken === null) {
    storage.removeItem(key);
    return;
  }

  storage.setItem(
    key,
    JSON.stringify({
      sessionToken
    } satisfies PersistedAuthSession)
  );
}

export function persistOnlineSession(
  storage: Pick<Storage, "setItem">,
  key: string,
  session: PersistedOnlineSession
): void {
  storage.setItem(key, JSON.stringify(session));
}

export function getDefaultServerUrl(location: Pick<Location, "protocol" | "hostname" | "port">): string {
  const protocol = location.protocol === "https:" ? "wss" : "ws";
  const hostname = location.hostname === "" ? "localhost" : location.hostname;
  const isLocalHost = hostname === "localhost" || hostname === "127.0.0.1";
  const portSegment = isLocalHost ? ":8080" : location.port === "" ? "" : `:${location.port}`;
  return `${protocol}://${hostname}${portSegment}/ws`;
}
