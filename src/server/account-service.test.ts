import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { AccountService } from "./account-service.js";

test("signup creates a player account and restores it from the issued session token", () => {
  const service = new AccountService();

  const result = service.signup("alex", "Alex", "pass1234");

  assert.equal(result.user.userId, "alex");
  assert.equal(result.user.name, "Alex");
  assert.equal(result.user.balance, 0);
  assert.deepEqual(result.user.ledger, []);
  assert.equal(service.restoreSession(result.token).userId, "alex");
});

test("login rejects an invalid password and accepts the correct password", () => {
  const service = new AccountService();
  const signedUp = service.signup("alex", "Alex", "pass1234");

  assert.throws(() => service.login("alex", "wrong"), /Invalid ID or password/);

  service.logout(signedUp.token);
  const result = service.login("alex", "pass1234");
  assert.equal(result.user.userId, "alex");
});

test("login rejects duplicate active sessions for the same account", () => {
  const service = new AccountService();
  const firstSession = service.signup("alex", "Alex", "pass1234");

  assert.throws(() => service.login("alex", "pass1234"), /already logged in/i);

  service.logout(firstSession.token);
  const nextSession = service.login("alex", "pass1234");
  assert.equal(nextSession.user.userId, "alex");
});

test("expired sessions are cleaned up and no longer block a fresh login", () => {
  let currentTime = 0;
  const service = new AccountService({
    sessionTtlMs: 1_000,
    now: () => currentTime
  });
  service.signup("alex", "Alex", "pass1234");

  currentTime = 1_500;
  const cleanup = service.cleanupExpiredSessions();
  const nextSession = service.login("alex", "pass1234");

  assert.equal(cleanup.removedCount, 1);
  assert.deepEqual(cleanup.removedUserIds, ["alex"]);
  assert.equal(nextSession.user.userId, "alex");
});

test("restoring a session refreshes its age so hourly cleanup does not remove active sessions", () => {
  let currentTime = 0;
  const service = new AccountService({
    sessionTtlMs: 1_000,
    now: () => currentTime
  });
  const session = service.signup("alex", "Alex", "pass1234");

  currentTime = 600;
  assert.equal(service.restoreSession(session.token).userId, "alex");

  currentTime = 1_500;
  const cleanup = service.cleanupExpiredSessions();

  assert.equal(cleanup.removedCount, 0);
  assert.equal(service.restoreSession(session.token).userId, "alex");
});

test("admin can adjust player balances while non-admin users cannot", () => {
  const service = new AccountService();
  const player = service.signup("alex", "Alex", "pass1234");

  assert.throws(() => service.adjustBalance("alex", "alex", 500), /Admin privileges/);

  const updatedUser = service.adjustBalance("admin", "alex", 500);
  assert.equal(updatedUser.balance, 500);
  assert.equal(updatedUser.ledger[0]?.amount, 500);
  assert.match(updatedUser.ledger[0]?.reason ?? "", /Admin adjustment/);
  assert.equal(service.restoreSession(player.token).balance, 500);
});

test("round settlement is applied directly to balances when the round scores", () => {
  const service = new AccountService();
  service.signup("p1", "P1", "pass1");
  service.signup("p2", "P2", "pass2");

  const updates = service.applyRoundSettlement({
    status: "scored",
    yakOwnerIds: [],
    players: [
      {
        playerId: "p1",
        counts: { gwang: 0, yeolkkeut: 0, tti: 0, pi: 0 },
        baseCardScore: 60,
        entryFee: -50,
        yakMonths: [],
        yakAdjustments: [],
        yakNetScore: 0,
        finalScore: 10,
        amountWon: 1000
      },
      {
        playerId: "p2",
        counts: { gwang: 0, yeolkkeut: 0, tti: 0, pi: 0 },
        baseCardScore: 40,
        entryFee: -50,
        yakMonths: [],
        yakAdjustments: [],
        yakNetScore: 0,
        finalScore: -10,
        amountWon: -1000
      }
    ]
  });

  assert.deepEqual(
    updates.map((update) => [update.userId, update.balance, update.delta]),
    [
      ["p1", 1000, 1000],
      ["p2", -1000, -1000]
    ]
  );
  assert.equal(service.getUserView("p1").ledger[0]?.amount, 1000);
  assert.equal(service.getUserView("p2").ledger[0]?.amount, -1000);
});

test("account data persists across service restarts when a storage path is configured", () => {
  const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "minhwatu-account-service-"));
  const storagePath = path.join(tempDirectory, "accounts.json");

  const firstService = new AccountService({
    storagePath
  });
  firstService.signup("alex", "Alex", "pass1234");
  firstService.adjustBalance("admin", "alex", 700);

  const restartedService = new AccountService({
    storagePath
  });
  const loggedIn = restartedService.login("alex", "pass1234");

  assert.equal(loggedIn.user.balance, 700);
  assert.equal(loggedIn.user.ledger[0]?.amount, 700);
  assert.equal(restartedService.listUsers("admin").find((user) => user.userId === "alex")?.balance, 700);

  fs.rmSync(tempDirectory, { recursive: true, force: true });
});

test("purgeNonAdminAccounts removes player accounts and keeps admin", () => {
  const service = new AccountService();
  service.signup("alex", "Alex", "pass1234");
  service.signup("riley", "Riley", "pass5678");

  const result = service.purgeNonAdminAccounts();

  assert.deepEqual(result.removedUserIds.sort(), ["alex", "riley"]);
  assert.equal(service.listUsers("admin").length, 1);
  assert.equal(service.listUsers("admin")[0]?.userId, "admin");
  assert.throws(() => service.getUserView("alex"), /does not exist/);
});
