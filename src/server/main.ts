import http from "node:http";
import path from "node:path";

import { WebSocketServer, type WebSocket } from "ws";

import { AccountService } from "./account-service.js";
import { MultiplayerTableService } from "./table-service.js";
import type { ClientMessage, RoomSnapshotPayload, ServerMessage } from "./protocol.js";
import { createRoomView } from "./room-view.js";
import { PlayerSessionRegistry } from "./session-registry.js";
import { createPlayStateView, createRoundSetupStateView } from "./views.js";

const port = Number.parseInt(process.env.PORT ?? "8080", 10);
const protocolVersion = 3;
const accountStorePath = process.env.ACCOUNT_STORE_PATH ?? path.resolve(process.cwd(), "data", "accounts.json");
const tableStorePath = process.env.TABLE_STORE_PATH ?? path.resolve(process.cwd(), "data", "table-state.json");
const accountService = new AccountService({
  storagePath: accountStorePath
});
const tableService = new MultiplayerTableService(undefined, undefined, accountService, {
  storagePath: tableStorePath
});
const sessionRegistry = new PlayerSessionRegistry<WebSocket>();
const watchedRoomByPlayerId = new Map<string, string>();

const httpServer = http.createServer((request, response) => {
  if (request.url?.startsWith("/api/auth/session")) {
    handleSessionRequest(request, response);
    return;
  }

  if (request.url === "/api/auth/signup" && request.method === "POST") {
    handleSignupRequest(request, response);
    return;
  }

  if (request.url === "/api/auth/login" && request.method === "POST") {
    handleLoginRequest(request, response);
    return;
  }

  if (request.url === "/api/auth/logout" && request.method === "POST") {
    handleLogoutRequest(request, response);
    return;
  }

  if (request.url?.startsWith("/api/admin/overview")) {
    handleAdminOverviewRequest(request, response);
    return;
  }

  if (request.url === "/api/admin/adjust-balance" && request.method === "POST") {
    handleAdminAdjustBalanceRequest(request, response);
    return;
  }

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

async function handleSignupRequest(request: http.IncomingMessage, response: http.ServerResponse): Promise<void> {
  try {
    const body = await readJsonBody(request);
    const result = accountService.signup(
      requireBodyString(body, "userId"),
      requireBodyString(body, "name"),
      requireBodyString(body, "password")
    );
    sendJson(response, 200, result);
  } catch (error) {
    sendJson(response, 400, {
      message: error instanceof Error ? error.message : "Signup failed."
    });
  }
}

async function handleLoginRequest(request: http.IncomingMessage, response: http.ServerResponse): Promise<void> {
  try {
    const body = await readJsonBody(request);
    const result = accountService.login(
      requireBodyString(body, "userId"),
      requireBodyString(body, "password")
    );
    sendJson(response, 200, result);
  } catch (error) {
    sendJson(response, 400, {
      message: error instanceof Error ? error.message : "Login failed."
    });
  }
}

async function handleLogoutRequest(request: http.IncomingMessage, response: http.ServerResponse): Promise<void> {
  try {
    const body = await readJsonBody(request);
    accountService.logout(requireBodyString(body, "token"));
    sendJson(response, 200, { ok: true });
  } catch (error) {
    sendJson(response, 400, {
      message: error instanceof Error ? error.message : "Logout failed."
    });
  }
}

function handleSessionRequest(request: http.IncomingMessage, response: http.ServerResponse): void {
  try {
    const url = new URL(request.url ?? "", `http://localhost:${port}`);
    const token = url.searchParams.get("token");
    if (token === null) {
      throw new Error("token is required.");
    }

    sendJson(response, 200, {
      user: accountService.restoreSession(token)
    });
  } catch (error) {
    sendJson(response, 401, {
      message: error instanceof Error ? error.message : "Session restore failed."
    });
  }
}

function handleAdminOverviewRequest(request: http.IncomingMessage, response: http.ServerResponse): void {
  try {
    const url = new URL(request.url ?? "", `http://localhost:${port}`);
    const token = url.searchParams.get("token");
    if (token === null) {
      throw new Error("token is required.");
    }

    const viewer = accountService.restoreSession(token);
    sendJson(response, 200, {
      viewer,
      overview: tableService.getAdminOverview(viewer.userId)
    });
  } catch (error) {
    sendJson(response, 403, {
      message: error instanceof Error ? error.message : "Admin overview failed."
    });
  }
}

async function handleAdminAdjustBalanceRequest(request: http.IncomingMessage, response: http.ServerResponse): Promise<void> {
  try {
    const body = await readJsonBody(request);
    const viewer = accountService.restoreSession(requireBodyString(body, "token"));
    const user = tableService.adminAdjustBalance(
      viewer.userId,
      requireBodyString(body, "targetUserId"),
      Number(requireBodyString(body, "amount"))
    );
    sendJson(response, 200, {
      viewer: accountService.getUserView(viewer.userId),
      user,
      overview: tableService.getAdminOverview(viewer.userId)
    });
  } catch (error) {
    sendJson(response, 403, {
      message: error instanceof Error ? error.message : "Balance adjustment failed."
    });
  }
}

async function readJsonBody(request: http.IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Uint8Array[] = [];

  for await (const chunk of request) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }

  const bodyText = Buffer.concat(chunks).toString("utf8");
  return JSON.parse(bodyText) as Record<string, unknown>;
}

function sendJson(response: http.ServerResponse, statusCode: number, payload: unknown): void {
  response.writeHead(statusCode, { "content-type": "application/json" });
  response.end(JSON.stringify(payload));
}

function requireBodyString(body: Record<string, unknown>, field: string): string {
  const value = body[field];
  if (typeof value !== "string") {
    throw new Error(`${field} is required.`);
  }

  return value;
}

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
        identifyPlayer(socket, message.playerId, message.sessionToken);
        return;
      case "create_room":
        withPlayer(socket, (playerId) => {
          watchedRoomByPlayerId.delete(playerId);
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
          watchedRoomByPlayerId.delete(playerId);
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
          watchedRoomByPlayerId.delete(playerId);
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
      case "watch_room":
        withPlayer(socket, (playerId) => {
          const viewer = tableService.getViewerAccount(playerId);
          if (viewer.role !== "admin") {
            throw new Error("Only admins can watch rooms without joining.");
          }

          watchedRoomByPlayerId.set(playerId, message.roomId);
          broadcastRoomSnapshot(message.roomId);
        });
        return;
      case "stop_watching_room":
        withPlayer(socket, (playerId) => {
          watchedRoomByPlayerId.delete(playerId);
          sendMessage(socket, {
            type: "left_room",
            roomId: null
          });
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

function identifyPlayer(socket: WebSocket, playerId: string, sessionToken: string): void {
  if (playerId.trim() === "") {
    throw new Error("playerId is required.");
  }

  const viewer = accountService.authenticateSocket(playerId, sessionToken);
  const identifyResult = sessionRegistry.identify(socket, playerId);
  if (identifyResult.replacedSocket !== null) {
    identifyResult.replacedSocket.close(4000, "Session replaced by a newer connection.");
  }

  sendMessage(socket, {
    type: "connected",
    playerId,
    viewer,
    protocolVersion,
    capabilities: {
      setReady: true,
      setDisplayName: true,
      transferHost: true,
      kickPlayer: true,
      watchRoom: true,
      auth: true,
      admin: viewer.role === "admin"
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
    return;
  }

  const watchedRoomId = watchedRoomByPlayerId.get(playerId);
  if (watchedRoomId !== undefined) {
    broadcastRoomSnapshot(watchedRoomId);
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
    watchedRoomByPlayerId.delete(playerId);
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
  const room = tableService.getSnapshotForRoom(roomId, "admin")?.room;
  if (room === null || room === undefined) {
    return;
  }

  for (const player of room.players) {
    const socket = sessionRegistry.getActiveSocket(player.playerId);
    if (socket === null) {
      continue;
    }

    const snapshot = tableService.getSnapshotForRoom(roomId, player.playerId);
    if (snapshot === null) {
      continue;
    }

    sendMessage(socket, {
      type: "room_snapshot",
      ...createRoomSnapshotPayload(snapshot, player.playerId, false)
    });
  }

  for (const [watcherId, watchedRoomId] of watchedRoomByPlayerId.entries()) {
    if (watchedRoomId !== roomId) {
      continue;
    }

    const socket = sessionRegistry.getActiveSocket(watcherId);
    if (socket === null) {
      continue;
    }

    const snapshot = tableService.getSnapshotForRoom(roomId, watcherId);
    if (snapshot === null) {
      continue;
    }

    sendMessage(socket, {
      type: "room_snapshot",
      ...createRoomSnapshotPayload(snapshot, watcherId, true)
    });
  }
}

function createRoomSnapshotPayload(
  snapshot: NonNullable<ReturnType<MultiplayerTableService["getSnapshotForRoom"]>>,
  viewerId: string,
  forceSpectator = false
): RoomSnapshotPayload {
  return {
    viewer: snapshot.viewer,
    room: createRoomView(snapshot.room, snapshot.viewer),
    setupState: createRoundSetupStateView(snapshot.setupState, viewerId, forceSpectator ? "spectator" : undefined),
    playState: createPlayStateView(snapshot.playState, viewerId, forceSpectator ? "spectator" : undefined),
    actionLog: snapshot.actionLog,
    roundHistory: snapshot.roundHistory
  };
}

function sendMessage(socket: WebSocket, message: ServerMessage): void {
  socket.send(JSON.stringify(message));
}

function assertNever(value: never): never {
  throw new Error(`Unhandled message type: ${JSON.stringify(value)}`);
}
