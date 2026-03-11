import test from "node:test";
import assert from "node:assert/strict";

import {
  assignNextSeat,
  createRoom,
  joinRoom,
  leaveRoom,
  movePlayerToSpectator,
  restoreSpectatorsForNextRound
} from "./room.js";

test("joinRoom seats each new player to the right of the most recently seated player", () => {
  let room = createRoom("room-1");
  room = joinRoom(room, "p1");
  room = joinRoom(room, "p2");
  room = joinRoom(room, "p3");
  room = joinRoom(room, "p4");

  assert.deepEqual(
    room.players.map((player) => [player.playerId, player.seatIndex]),
    [
      ["p1", 0],
      ["p2", 1],
      ["p3", 2],
      ["p4", 3]
    ]
  );
});

test("assignNextSeat reuses the first open seat to the right of the latest join", () => {
  let room = createRoom("room-2");
  room = joinRoom(room, "p1");
  room = joinRoom(room, "p2");
  room = joinRoom(room, "p3");
  room = joinRoom(room, "p4");
  room = leaveRoom(room, "p2");

  assert.equal(assignNextSeat(room.players), 4);
});

test("spectating players return to their original seat for the next round", () => {
  let room = createRoom("room-3");
  room = joinRoom(room, "p1");
  room = joinRoom(room, "p2");
  room = movePlayerToSpectator(room, "p2");
  room = restoreSpectatorsForNextRound(room);

  const restored = room.players.find((player) => player.playerId === "p2");
  assert.ok(restored);
  assert.equal(restored.role, "waiting");
  assert.equal(restored.seatIndex, 1);
});
