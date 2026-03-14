import test from "node:test";
import assert from "node:assert/strict";

import { MultiplayerRoomService } from "./room-service.js";

test("createRoom creates a room and seats the creator", () => {
  const service = new MultiplayerRoomService();

  const room = service.createRoom("p1", "alpha");

  assert.equal(room.roomId, "alpha");
  assert.equal(room.hostPlayerId, "p1");
  assert.deepEqual(room.players.map((player) => player.playerId), ["p1"]);
  assert.equal(room.players[0]?.seatIndex, 0);
  assert.equal(room.players[0]?.isReady, true);
  assert.equal(room.players[0]?.isConnected, true);
});

test("joinExistingRoom adds another player and preserves seating rules", () => {
  const service = new MultiplayerRoomService();
  service.createRoom("p1", "alpha");

  const room = service.joinExistingRoom("p2", "alpha");

  assert.deepEqual(room.players.map((player) => player.playerId).sort(), ["p1", "p2"]);
  assert.equal(room.players.find((player) => player.playerId === "p2")?.seatIndex, 1);
  assert.equal(room.players.find((player) => player.playerId === "p2")?.isReady, false);
  assert.equal(room.players.find((player) => player.playerId === "p2")?.isConnected, true);
});

test("joining a new room automatically leaves the previous room", () => {
  const service = new MultiplayerRoomService();
  service.createRoom("p1", "alpha");
  service.createRoom("p2", "beta");

  const room = service.joinExistingRoom("p1", "beta");

  assert.equal(service.getRoom("alpha"), null);
  assert.equal(service.getRoomForPlayer("p1")?.roomId, "beta");
  assert.deepEqual(room.players.map((player) => player.playerId).sort(), ["p1", "p2"]);
});

test("leaveCurrentRoom removes empty rooms", () => {
  const service = new MultiplayerRoomService();
  service.createRoom("p1", "alpha");

  const result = service.leaveCurrentRoom("p1");

  assert.equal(result.roomId, "alpha");
  assert.equal(result.room, null);
  assert.equal(service.getRoom("alpha"), null);
  assert.equal(service.getRoomForPlayer("p1"), null);
});

test("leaveCurrentRoom reassigns the host when the current host leaves", () => {
  const service = new MultiplayerRoomService();
  service.createRoom("p1", "alpha");
  service.joinExistingRoom("p2", "alpha");
  service.joinExistingRoom("p3", "alpha");

  const result = service.leaveCurrentRoom("p1");

  assert.equal(result.room?.hostPlayerId, "p2");
});

test("updateReadyState toggles only the target player's ready flag", () => {
  const service = new MultiplayerRoomService();
  service.createRoom("p1", "alpha");
  service.joinExistingRoom("p2", "alpha");

  const room = service.updateReadyState("p2", true);

  assert.equal(room.players.find((player) => player.playerId === "p1")?.isReady, true);
  assert.equal(room.players.find((player) => player.playerId === "p2")?.isReady, true);
});

test("updateDisplayName changes only the target player's visible name", () => {
  const service = new MultiplayerRoomService();
  service.createRoom("p1", "alpha");
  service.joinExistingRoom("p2", "alpha");

  const room = service.updateDisplayName("p2", "Alex");

  assert.equal(room.players.find((player) => player.playerId === "p1")?.displayName, "p1");
  assert.equal(room.players.find((player) => player.playerId === "p2")?.displayName, "Alex");
});

test("transferHost delegates room ownership to another seated player", () => {
  const service = new MultiplayerRoomService();
  service.createRoom("p1", "alpha");
  service.joinExistingRoom("p2", "alpha");

  const room = service.transferHost("p1", "p2");

  assert.equal(room.hostPlayerId, "p2");
});

test("kickPlayer removes the target player from the room", () => {
  const service = new MultiplayerRoomService();
  service.createRoom("p1", "alpha");
  service.joinExistingRoom("p2", "alpha");
  service.joinExistingRoom("p3", "alpha");

  const result = service.kickPlayer("p1", "p2");

  assert.equal(result.roomId, "alpha");
  assert.deepEqual(result.room?.players.map((player) => player.playerId).sort(), ["p1", "p3"]);
  assert.equal(service.getRoomForPlayer("p2"), null);
});

test("updateConnectionState toggles only the target player's connected flag", () => {
  const service = new MultiplayerRoomService();
  service.createRoom("p1", "alpha");
  service.joinExistingRoom("p2", "alpha");

  const room = service.updateConnectionState("p2", false);

  assert.equal(room?.players.find((player) => player.playerId === "p1")?.isConnected, true);
  assert.equal(room?.players.find((player) => player.playerId === "p2")?.isConnected, false);
});

test("deleteRoom removes the room and clears all player mappings", () => {
  const service = new MultiplayerRoomService();
  service.createRoom("p1", "alpha");
  service.joinExistingRoom("p2", "alpha");

  const deletedRoom = service.deleteRoom("alpha");

  assert.equal(deletedRoom?.roomId, "alpha");
  assert.equal(service.getRoom("alpha"), null);
  assert.equal(service.getRoomForPlayer("p1"), null);
  assert.equal(service.getRoomForPlayer("p2"), null);
});
