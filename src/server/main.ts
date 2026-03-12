import http from "node:http";

import { WebSocketServer, type WebSocket } from "ws";

import { MultiplayerTableService } from "./table-service.js";
import type { ClientMessage, RoomSnapshotPayload, ServerMessage } from "./protocol.js";
import { PlayerSessionRegistry } from "./session-registry.js";
import { createPlayStateView, createRoundSetupStateView } from "./views.js";

const port = Number.parseInt(process.env.PORT ?? "8080", 10);
const protocolVersion = 2;
const tableService = new MultiplayerTableService();
const sessionRegistry = new PlayerSessionRegistry<WebSocket>();

const httpServer = http.createServer((request, response) => {
  if (request.url === "/health") {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ status: "ok" }));
    return;
  }

  response.writeHead(404, { "content-type": "application/json" });
  response.end(JSON.stringify({ message: "Not found" }));
});

const webSocketServer = new WebSocketServer({ server: httpServer });

webSocketServer.on("connection", (socket) => {
  sessionRegistry.register(socket);

  socket.on("message", (rawMessage) => {
    handleClientMessage(socket, rawMessage.toString());
  });

  socket.on("close", () => {
    handleDisconnect(socket);
  });
});

httpServer.listen(port, () => {
  console.log(`Minhwatu multiplayer server listening on http://localhost:${port}`);
});

function handleClientMessage(socket: WebSocket, rawMessage: string): void {
  let message: ClientMessage;

  try {
    message = JSON.parse(rawMessage) as ClientMessage;
  } catch {
    sendMessage(socket, {
      type: "error",
      message: "Invalid JSON payload."
    });
    return;
  }

  try {
    switch (message.type) {
      case "identify":
        identifyPlayer(socket, message.playerId);
        return;
      case "create_room":
        withPlayer(socket, (playerId) => {
          const previousRoomId = tableService.getSnapshotForPlayer(playerId)?.room.roomId ?? null;
          const snapshot = tableService.createRoom(playerId, message.roomId);
          if (previousRoomId !== null && previousRoomId !== snapshot.room.roomId) {
            broadcastRoomSnapshot(previousRoomId);
          }
          broadcastRoomSnapshot(snapshot.room.roomId);
        });
        return;
      case "join_room":
        withPlayer(socket, (playerId) => {
          const previousRoomId = tableService.getSnapshotForPlayer(playerId)?.room.roomId ?? null;
          const snapshot = tableService.joinExistingRoom(playerId, message.roomId);
          if (previousRoomId !== null && previousRoomId !== snapshot.room.roomId) {
            broadcastRoomSnapshot(previousRoomId);
          }
          broadcastRoomSnapshot(snapshot.room.roomId);
        });
        return;
      case "leave_room":
        withPlayer(socket, (playerId) => {
          const result = tableService.leaveCurrentRoom(playerId);
          sendMessage(socket, {
            type: "left_room",
            roomId: result.roomId
          });
          if (result.roomId !== null && result.snapshot !== null) {
            broadcastRoomSnapshot(result.roomId);
          }
        });
        return;
      case "request_room_snapshot":
        withPlayer(socket, (playerId) => {
          const snapshot = tableService.getSnapshotForPlayer(playerId);
          if (snapshot === null) {
            throw new Error("Player is not currently in a room.");
          }

          sendMessage(socket, {
            type: "room_snapshot",
            ...createRoomSnapshotPayload(snapshot, playerId)
          });
        });
        return;
      case "set_ready":
        withPlayer(socket, (playerId) => {
          const snapshot = tableService.setPlayerReady(playerId, message.isReady);
          broadcastRoomSnapshot(snapshot.room.roomId);
        });
        return;
      case "set_display_name":
        withPlayer(socket, (playerId) => {
          const snapshot = tableService.setPlayerDisplayName(playerId, message.displayName);
          broadcastRoomSnapshot(snapshot.room.roomId);
        });
        return;
      case "transfer_host":
        withPlayer(socket, (playerId) => {
          const snapshot = tableService.transferHost(playerId, message.targetPlayerId);
          broadcastRoomSnapshot(snapshot.room.roomId);
        });
        return;
      case "kick_player":
        withPlayer(socket, (playerId) => {
          const snapshot = tableService.kickPlayer(playerId, message.targetPlayerId);
          const kickedSocket = sessionRegistry.getActiveSocket(message.targetPlayerId);
          if (kickedSocket !== null) {
            sendMessage(kickedSocket, {
              type: "left_room",
              roomId: snapshot.room.roomId
            });
          }
          broadcastRoomSnapshot(snapshot.room.roomId);
        });
        return;
      case "start_round_setup":
        withPlayer(socket, (playerId) => {
          const snapshot = tableService.startRoundSetup(playerId);
          broadcastRoomSnapshot(snapshot.room.roomId);
        });
        return;
      case "auto_resolve_dealer":
        withPlayer(socket, (playerId) => {
          const snapshot = tableService.autoResolveDealer(playerId);
          broadcastRoomSnapshot(snapshot.room.roomId);
        });
        return;
      case "declare_give_up":
        withPlayer(socket, (playerId) => {
          const snapshot = tableService.declareGiveUp(playerId, message.giveUp);
          broadcastRoomSnapshot(snapshot.room.roomId);
        });
        return;
      case "deal_cards":
        withPlayer(socket, (playerId) => {
          const snapshot = tableService.dealCards(playerId);
          broadcastRoomSnapshot(snapshot.room.roomId);
        });
        return;
      case "select_hand_card":
        withPlayer(socket, (playerId) => {
          const snapshot = tableService.selectHandCard(playerId, message.cardId);
          broadcastRoomSnapshot(snapshot.room.roomId);
        });
        return;
      case "resolve_hand_choice":
        withPlayer(socket, (playerId) => {
          const snapshot = tableService.resolveHandChoice(playerId, message.floorCardId);
          broadcastRoomSnapshot(snapshot.room.roomId);
        });
        return;
      case "flip_draw_card":
        withPlayer(socket, (playerId) => {
          const snapshot = tableService.flipDrawCard(playerId);
          broadcastRoomSnapshot(snapshot.room.roomId);
        });
        return;
      case "resolve_draw_choice":
        withPlayer(socket, (playerId) => {
          const snapshot = tableService.resolveDrawChoice(playerId, message.floorCardId);
          broadcastRoomSnapshot(snapshot.room.roomId);
        });
        return;
      case "prepare_next_round":
        withPlayer(socket, (playerId) => {
          const snapshot = tableService.prepareNextRound(playerId);
          broadcastRoomSnapshot(snapshot.room.roomId);
        });
        return;
      default:
        assertNever(message);
    }
  } catch (error) {
    sendMessage(socket, {
      type: "error",
      message: error instanceof Error ? error.message : "Unknown server error."
    });
  }
}

function identifyPlayer(socket: WebSocket, playerId: string): void {
  if (playerId.trim() === "") {
    throw new Error("playerId is required.");
  }

  const identifyResult = sessionRegistry.identify(socket, playerId);
  if (identifyResult.replacedSocket !== null) {
    identifyResult.replacedSocket.close(4000, "Session replaced by a newer connection.");
  }

  sendMessage(socket, {
    type: "connected",
    playerId,
    protocolVersion,
    capabilities: {
      setReady: true,
      setDisplayName: true,
      transferHost: true,
      kickPlayer: true
    }
  });

  const connectionSnapshot = tableService.setPlayerConnected(playerId, true);
  if (connectionSnapshot !== null) {
    broadcastRoomSnapshot(connectionSnapshot.room.roomId);
    return;
  }

  const snapshot = tableService.getSnapshotForPlayer(playerId);
  if (snapshot !== null) {
    sendMessage(socket, {
      type: "room_snapshot",
      ...createRoomSnapshotPayload(snapshot, playerId)
    });
  }
}

function handleDisconnect(socket: WebSocket): void {
  const result = sessionRegistry.unregister(socket);
  if (result.playerId === null || !result.shouldStartGracePeriod) {
    return;
  }

  const offlineSnapshot = tableService.setPlayerConnected(result.playerId, false);
  if (offlineSnapshot !== null) {
    broadcastRoomSnapshot(offlineSnapshot.room.roomId);
  }

  sessionRegistry.scheduleDisconnect(result.playerId, (playerId) => {
    const leaveResult = tableService.leaveCurrentRoom(playerId, {
      allowActiveRoundReset: true
    });
    if (leaveResult.roomId !== null && leaveResult.snapshot !== null) {
      broadcastRoomSnapshot(leaveResult.roomId);
    }
  });
}

function withPlayer(socket: WebSocket, handler: (playerId: string) => void): void {
  const playerId = sessionRegistry.getPlayerId(socket);
  if (playerId === null) {
    throw new Error("Identify first before sending room actions.");
  }

  handler(playerId);
}

function broadcastRoomSnapshot(roomId: string): void {
  const snapshot = tableService.getSnapshotForRoom(roomId);
  if (snapshot === null) {
    return;
  }

  for (const player of snapshot.room.players) {
    const socket = sessionRegistry.getActiveSocket(player.playerId);
    if (socket === null) {
      continue;
    }

    sendMessage(socket, {
      type: "room_snapshot",
      ...createRoomSnapshotPayload(snapshot, player.playerId)
    });
  }
}

function createRoomSnapshotPayload(
  snapshot: NonNullable<ReturnType<MultiplayerTableService["getSnapshotForRoom"]>>,
  viewerId: string
): RoomSnapshotPayload {
  return {
    room: snapshot.room,
    setupState: createRoundSetupStateView(snapshot.setupState, viewerId),
    playState: createPlayStateView(snapshot.playState, viewerId),
    actionLog: snapshot.actionLog
  };
}

function sendMessage(socket: WebSocket, message: ServerMessage): void {
  socket.send(JSON.stringify(message));
}

function assertNever(value: never): never {
  throw new Error(`Unhandled message type: ${JSON.stringify(value)}`);
}
