import test from "node:test";
import assert from "node:assert/strict";

import { createDealerDraw } from "../domain/cards.js";
import type { InitialDealerRound } from "../domain/dealer.js";
import { AccountService } from "./account-service.js";
import { MultiplayerTableService } from "./table-service.js";
import {
  createPlayStateView,
  createRoundSetupStateView,
  type GiveUpStateView,
  type PlayStateView,
  type RoundSetupStateView
} from "./views.js";

function createDeterministicDealerRoundFactory(rounds: InitialDealerRound[]) {
  let index = 0;

  return () => {
    const round = rounds[index];
    index += 1;

    if (round === undefined) {
      throw new Error("No more deterministic dealer rounds are available.");
    }

    return round;
  };
}

function createSeededAccountService(playerIds: readonly string[]): AccountService {
  const accountService = new AccountService();

  for (const playerId of playerIds) {
    accountService.signup(playerId, playerId.toUpperCase(), "pass1234");
  }

  return accountService;
}

function createSixPlayerService(): MultiplayerTableService {
  const service = new MultiplayerTableService(
    undefined,
    createDeterministicDealerRoundFactory([
      {
        draws: [
          createDealerDraw("p1", 1, 20),
          createDealerDraw("p2", 2, 0),
          createDealerDraw("p3", 3, 0),
          createDealerDraw("p4", 4, 0),
          createDealerDraw("p5", 5, 0),
          createDealerDraw("p6", 6, 0)
        ]
      }
    ]),
    createSeededAccountService(["p1", "p2", "p3", "p4", "p5", "p6"])
  );

  service.createRoom("p1", "alpha");
  service.joinExistingRoom("p2", "alpha");
  service.joinExistingRoom("p3", "alpha");
  service.joinExistingRoom("p4", "alpha");
  service.joinExistingRoom("p5", "alpha");
  service.joinExistingRoom("p6", "alpha");
  service.setPlayerReady("p2", true);
  service.setPlayerReady("p3", true);
  service.setPlayerReady("p4", true);
  service.setPlayerReady("p5", true);
  service.setPlayerReady("p6", true);
  service.startRoundSetup("p1");
  service.autoResolveDealer("p1");

  return service;
}

function createSevenPlayerService(): MultiplayerTableService {
  const service = new MultiplayerTableService(
    undefined,
    createDeterministicDealerRoundFactory([
      {
        draws: [
          createDealerDraw("p1", 1, 20),
          createDealerDraw("p2", 2, 0),
          createDealerDraw("p3", 3, 0),
          createDealerDraw("p4", 4, 0),
          createDealerDraw("p5", 5, 0),
          createDealerDraw("p6", 6, 0),
          createDealerDraw("p7", 7, 0)
        ]
      }
    ]),
    createSeededAccountService(["p1", "p2", "p3", "p4", "p5", "p6", "p7"])
  );

  service.createRoom("p1", "alpha");
  service.joinExistingRoom("p2", "alpha");
  service.joinExistingRoom("p3", "alpha");
  service.joinExistingRoom("p4", "alpha");
  service.joinExistingRoom("p5", "alpha");
  service.joinExistingRoom("p6", "alpha");
  service.joinExistingRoom("p7", "alpha");
  service.setPlayerReady("p2", true);
  service.setPlayerReady("p3", true);
  service.setPlayerReady("p4", true);
  service.setPlayerReady("p5", true);
  service.setPlayerReady("p6", true);
  service.setPlayerReady("p7", true);
  service.startRoundSetup("p1");
  service.autoResolveDealer("p1");

  return service;
}

function assertSetupView(view: RoundSetupStateView | null): RoundSetupStateView {
  if (view === null) {
    throw new Error("Expected a synchronized setup view.");
  }

  return view;
}

function assertGiveUpView(view: RoundSetupStateView | null): GiveUpStateView {
  const setupView = assertSetupView(view);
  assert.equal(setupView.phase, "waiting_for_giveups");
  return setupView;
}

function assertPlayView(view: PlayStateView | null): PlayStateView {
  if (view === null) {
    throw new Error("Expected a synchronized play view.");
  }

  return view;
}

test("active give-up viewers only see their own dealt hand while hidden cards stay hidden", () => {
  const service = createSixPlayerService();
  const snapshot = service.getSnapshotForPlayer("p1");
  if (snapshot === null) {
    throw new Error("Expected a room snapshot.");
  }

  const view = assertGiveUpView(createRoundSetupStateView(snapshot.setupState, "p2"));
  assert.equal(view.viewerMode, "player");
  assert.ok((view.pendingDeal?.hands.p2 ?? []).every((cardId: string) => cardId !== "hidden"));
  assert.ok((view.pendingDeal?.hands.p1 ?? []).every((cardId: string) => cardId === "hidden"));
  assert.ok((view.pendingDeal?.hiddenFloorCards ?? []).every((cardId: string) => cardId === "hidden"));
  assert.ok((view.pendingDeal?.drawPileCards ?? []).every((cardId: string) => cardId === "hidden"));
});

test("players who already gave up switch to spectator view and can see all give-up cards", () => {
  const service = createSevenPlayerService();
  service.declareGiveUp("p1", true);
  const snapshot = service.getSnapshotForPlayer("p1");
  if (snapshot === null) {
    throw new Error("Expected a room snapshot.");
  }

  const view = assertGiveUpView(createRoundSetupStateView(snapshot.setupState, "p1"));
  assert.equal(view.viewerMode, "spectator");
  assert.ok((view.pendingDeal?.hands.p2 ?? []).every((cardId: string) => cardId !== "hidden"));
  assert.ok((view.pendingDeal?.hiddenFloorCards ?? []).every((cardId: string) => cardId !== "hidden"));
  assert.ok((view.pendingDeal?.drawPileCards ?? []).every((cardId: string) => cardId !== "hidden"));
});

test("active play viewers only see their own hand and hidden draw pile order", () => {
  const service = createSixPlayerService();
  service.declareGiveUp("p1", true);
  service.dealCards("p2");
  const snapshot = service.getSnapshotForPlayer("p2");
  if (snapshot === null) {
    throw new Error("Expected a room snapshot.");
  }

  const view = assertPlayView(createPlayStateView(snapshot.playState, "p2"));
  assert.equal(view.viewerMode, "player");
  assert.ok((view.hands.p2 ?? []).every((cardId: string) => cardId !== "hidden"));
  assert.ok((view.hands.p3 ?? []).every((cardId: string) => cardId === "hidden"));
  assert.ok(view.drawPileCards.every((cardId: string) => cardId === "hidden"));
});

test("spectator play viewers can see every hand and the remaining draw pile order", () => {
  const service = createSixPlayerService();
  service.declareGiveUp("p1", true);
  service.dealCards("p2");
  const snapshot = service.getSnapshotForPlayer("p1");
  if (snapshot === null) {
    throw new Error("Expected a room snapshot.");
  }

  const view = assertPlayView(createPlayStateView(snapshot.playState, "p1"));
  assert.equal(view.viewerMode, "spectator");
  assert.ok((view.hands.p2 ?? []).every((cardId: string) => cardId !== "hidden"));
  assert.ok(view.drawPileCards.every((cardId: string) => cardId !== "hidden"));
});
