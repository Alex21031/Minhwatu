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
  service.signup("alex", "Alex", "pass1234");

  assert.throws(() => service.login("alex", "wrong"), /Invalid ID or password/);

  const result = service.login("alex", "pass1234");
  assert.equal(result.user.userId, "alex");
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
