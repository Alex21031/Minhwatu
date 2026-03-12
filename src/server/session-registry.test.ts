import test from "node:test";
import assert from "node:assert/strict";

import { PlayerSessionRegistry } from "./session-registry.js";

test("identify replaces the previous socket for the same player without starting a disconnect", () => {
  const registry = new PlayerSessionRegistry<object>({
    disconnectGraceMs: 10_000
  });
  const firstSocket = {};
  const secondSocket = {};

  registry.register(firstSocket);
  registry.register(secondSocket);
  registry.identify(firstSocket, "p1");

  const result = registry.identify(secondSocket, "p1");

  assert.equal(result.replacedSocket, firstSocket);
  assert.equal(result.resumedPendingSession, false);
  assert.equal(registry.getPlayerId(firstSocket), null);
  assert.equal(registry.getActiveSocket("p1"), secondSocket);

  const unregisterResult = registry.unregister(firstSocket);
  assert.deepEqual(unregisterResult, {
    playerId: null,
    shouldStartGracePeriod: false
  });
});

test("a pending disconnect is cleared when the same player reconnects before expiry", () => {
  const scheduled: Array<() => void> = [];
  const cancelled: unknown[] = [];
  const registry = new PlayerSessionRegistry<object>({
    disconnectGraceMs: 10_000,
    scheduleTimeout: (callback) => {
      scheduled.push(callback);
      return callback;
    },
    cancelTimeout: (handle) => {
      cancelled.push(handle);
    }
  });
  const firstSocket = {};
  const secondSocket = {};

  registry.register(firstSocket);
  registry.identify(firstSocket, "p1");

  const unregisterResult = registry.unregister(firstSocket);
  assert.deepEqual(unregisterResult, {
    playerId: "p1",
    shouldStartGracePeriod: true
  });

  registry.scheduleDisconnect("p1", () => {
    throw new Error("Disconnect callback should not run after reconnection.");
  });
  assert.equal(scheduled.length, 1);

  registry.register(secondSocket);
  const identifyResult = registry.identify(secondSocket, "p1");

  assert.equal(identifyResult.replacedSocket, null);
  assert.equal(identifyResult.resumedPendingSession, true);
  assert.equal(cancelled.length, 1);
  assert.equal(registry.getActiveSocket("p1"), secondSocket);
});

test("scheduled disconnect expires only when no new active socket exists", () => {
  const scheduled: Array<() => void> = [];
  const expiredPlayers: string[] = [];
  const registry = new PlayerSessionRegistry<object>({
    disconnectGraceMs: 10_000,
    scheduleTimeout: (callback) => {
      scheduled.push(callback);
      return callback;
    }
  });
  const socket = {};

  registry.register(socket);
  registry.identify(socket, "p1");

  const unregisterResult = registry.unregister(socket);
  assert.equal(unregisterResult.playerId, "p1");
  assert.equal(unregisterResult.shouldStartGracePeriod, true);

  registry.scheduleDisconnect("p1", (playerId) => {
    expiredPlayers.push(playerId);
  });

  const expire = scheduled[0];
  if (expire === undefined) {
    throw new Error("Expected a scheduled disconnect callback.");
  }

  expire();

  assert.deepEqual(expiredPlayers, ["p1"]);
  assert.equal(registry.getActiveSocket("p1"), null);
});
