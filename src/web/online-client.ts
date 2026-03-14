import type { ClientMessage, ServerMessage } from "../server/protocol.js";
import type { AppState } from "./app-state.js";

interface CreateOnlineClientArgs {
  getState: () => AppState;
  setState: (nextState: AppState) => void;
  render: () => void;
  clearPendingReconnect: () => void;
  scheduleReconnect: () => void;
  reconnectDelayMs: number;
  getCompatibilityError: (message: string) => string;
}

export function createOnlineClient(args: CreateOnlineClientArgs) {
  function isExpiredSessionMessage(message: string): boolean {
    return message === "Session is invalid or expired.";
  }

  function connectOnlineServer(): void {
    const currentState = args.getState();
    if (
      currentState.auth.status !== "authenticated" ||
      currentState.auth.user === null ||
      currentState.auth.sessionToken === null
    ) {
      args.setState({
        ...currentState,
        auth: {
          ...currentState.auth,
          error: "로그인 이후에만 가능합니다."
        }
      });
      args.render();
      return;
    }

    if (currentState.online.connectionStatus !== "disconnected") {
      return;
    }

    args.clearPendingReconnect();

    const socket = new WebSocket(currentState.online.serverUrl);
    args.setState({
      ...currentState,
      online: {
        ...currentState.online,
        socket,
        shouldReconnect: true,
        connectionStatus: "connecting",
        error: null
      },
      log: [`Connecting to ${currentState.online.serverUrl}...`, ...currentState.log].slice(0, 10)
    });

    socket.addEventListener("open", () => {
      const latestState = args.getState();
      sendSocketMessage(socket, {
        type: "identify",
        playerId: latestState.online.playerId,
        sessionToken: latestState.auth.sessionToken ?? ""
      });
    });

    socket.addEventListener("message", (event) => {
      handleOnlineServerMessage(socket, event.data.toString());
    });

    socket.addEventListener("close", () => {
      const latestState = args.getState();
      if (latestState.online.socket !== socket) {
        return;
      }

      const shouldReconnect = latestState.online.shouldReconnect;
      args.setState({
        ...latestState,
        online: {
          ...latestState.online,
          socket: null,
          connectionStatus: "disconnected",
          connectedPlayerId: null,
          syncedRoom: null,
          syncedSetupState: null,
          syncedPlayState: null,
          syncedActionLog: [],
          serverCapabilities: null,
          protocolVersion: null
        },
        log: [
          shouldReconnect
            ? `Multiplayer server connection closed. Reconnecting in ${Math.floor(args.reconnectDelayMs / 1000)}s...`
            : "Multiplayer server connection closed.",
          ...latestState.log
        ].slice(0, 10)
      });
      args.render();
      if (shouldReconnect) {
        args.scheduleReconnect();
      }
    });

    socket.addEventListener("error", () => {
      const latestState = args.getState();
      args.setState({
        ...latestState,
        online: {
          ...latestState.online,
          error: "Failed to reach multiplayer server."
        },
        log: ["Multiplayer server connection failed.", ...latestState.log].slice(0, 10)
      });
      args.render();
    });

    args.render();
  }

  function disconnectOnlineServer(logMessage: string): void {
    args.clearPendingReconnect();
    const currentState = args.getState();
    const socket = currentState.online.socket;

    args.setState({
      ...currentState,
      online: {
        ...currentState.online,
        shouldReconnect: false,
        socket: null,
        connectionStatus: "disconnected",
        connectedPlayerId: null,
        syncedRoom: null,
        syncedSetupState: null,
        syncedPlayState: null,
        syncedActionLog: [],
        serverCapabilities: null,
        protocolVersion: null
      },
      log: [logMessage, ...currentState.log].slice(0, 10)
    });

    if (socket !== null) {
      socket.close();
    }

    args.render();
  }

  function reconnectOnlineServer(): void {
    const currentState = args.getState();
    if (currentState.auth.status !== "authenticated" || currentState.auth.user === null) {
      return;
    }

    if (currentState.online.connectionStatus === "disconnected") {
      connectOnlineServer();
      return;
    }

    args.clearPendingReconnect();
    const socket = currentState.online.socket;

    args.setState({
      ...currentState,
      online: {
        ...currentState.online,
        shouldReconnect: true,
        error: null
      },
      log: ["Reconnecting to multiplayer server...", ...currentState.log].slice(0, 10)
    });

    if (socket !== null) {
      socket.close();
    }

    args.render();
  }

  function sendOnlineRoomAction(type: "create_room" | "join_room"): void {
    const currentState = args.getState();
    const roomId = currentState.online.roomIdInput.trim();
    if (roomId === "") {
      args.setState({
        ...currentState,
        online: {
          ...currentState.online,
          error: "roomId is required."
        }
      });
      args.render();
      return;
    }

    sendOnlineMessage({
      type,
      roomId
    });
  }

  function sendOnlineMessage(message: ClientMessage): void {
    const currentState = args.getState();
    const socket = currentState.online.socket;
    if (socket === null || socket.readyState !== WebSocket.OPEN) {
      args.setState({
        ...currentState,
        online: {
          ...currentState.online,
          error: "Connect to the multiplayer server first."
        }
      });
      args.render();
      return;
    }

    sendSocketMessage(socket, message);
  }

  function handleOnlineServerMessage(socket: WebSocket, rawMessage: string): void {
    const currentState = args.getState();
    if (currentState.online.socket !== socket) {
      return;
    }

    let message: ServerMessage;

    try {
      message = JSON.parse(rawMessage) as ServerMessage;
    } catch {
      args.setState({
        ...currentState,
        online: {
          ...currentState.online,
          error: "Received invalid server payload."
        },
        log: ["Received invalid multiplayer payload.", ...currentState.log].slice(0, 10)
      });
      args.render();
      return;
    }

    const latestState = args.getState();
    switch (message.type) {
      case "connected":
        args.setState({
          ...latestState,
          auth: {
            ...latestState.auth,
            user: message.viewer
          },
          online: {
            ...latestState.online,
            connectionStatus: "connected",
            connectedPlayerId: message.playerId,
            serverCapabilities: message.capabilities ?? null,
            protocolVersion: message.protocolVersion ?? null,
            error: null
          },
          log: [`Connected to multiplayer server as ${message.playerId}.`, ...latestState.log].slice(0, 10)
        });
        break;
      case "room_snapshot":
        {
          const connectedPlayer = message.room.players.find((player) => player.isSelf) ?? null;
          args.setState({
            ...latestState,
            auth: {
              ...latestState.auth,
              user: message.viewer
            },
            online: {
              ...latestState.online,
              syncedRoom: message.room,
              syncedSetupState: message.setupState,
              syncedPlayState: message.playState,
              syncedActionLog: message.actionLog,
              roundHistory: message.roundHistory,
              displayNameInput: connectedPlayer?.displayName ?? latestState.online.displayNameInput,
              roomIdInput: message.room.roomId,
              error: null
            }
          });
        }
        break;
      case "left_room":
        args.setState({
          ...latestState,
          online: {
            ...latestState.online,
            syncedRoom: null,
            syncedSetupState: null,
            syncedPlayState: null,
            syncedActionLog: [],
            roundHistory: [],
            error: null
          },
          log: [`Left room ${message.roomId ?? "(none)"}.`, ...latestState.log].slice(0, 10)
        });
        break;
      case "error":
        {
          const compatibilityError = args.getCompatibilityError(message.message);
          const sessionExpired = isExpiredSessionMessage(message.message);
          if (sessionExpired) {
            if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
              socket.close();
            }

            args.setState({
              ...latestState,
              auth: {
                ...latestState.auth,
                status: "anonymous",
                sessionToken: null,
                user: null,
                error: "Session expired. Please sign in again.",
                busy: false
              },
              online: {
                ...latestState.online,
                socket: null,
                shouldReconnect: false,
                connectionStatus: "disconnected",
                connectedPlayerId: null,
                syncedRoom: null,
                syncedSetupState: null,
                syncedPlayState: null,
                syncedActionLog: [],
                serverCapabilities: null,
                protocolVersion: null,
                error: null
              },
              log: ["Session expired. Signed out locally.", ...latestState.log].slice(0, 10)
            });
            break;
          }

          args.setState({
            ...latestState,
            online: {
              ...latestState.online,
              error: compatibilityError
            },
            log: [`Server error: ${compatibilityError}`, ...latestState.log].slice(0, 10)
          });
        }
        break;
      default:
        throw new Error(`Unhandled client-side branch: ${JSON.stringify(message)}`);
    }

    args.render();
  }

  return {
    connectOnlineServer,
    disconnectOnlineServer,
    reconnectOnlineServer,
    sendOnlineRoomAction,
    sendOnlineMessage,
    handleOnlineServerMessage
  };
}

function sendSocketMessage(socket: WebSocket, message: ClientMessage): void {
  socket.send(JSON.stringify(message));
}
