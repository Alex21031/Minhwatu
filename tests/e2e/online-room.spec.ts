import { test, expect, type Browser, type BrowserContext, type Locator, type Page } from "@playwright/test";

const WAIT_TIMEOUT_MS = 20_000;

interface OnlinePlayerHandle {
  context: BrowserContext;
  page: Page;
  playerId: string;
}

test.describe("online multiplayer flow", () => {
  test("five players can sign up, ready up, and reach synchronized play", async ({ browser }) => {
    test.slow();

    const roomId = createUniqueId("alpha");
    const players = await openPlayers(browser, 5);

    try {
      await connectAndEnterRoom(players[0], roomId, "create");

      for (const player of players.slice(1)) {
        await connectAndEnterRoom(player, roomId, "join");
      }

      for (const player of players) {
        await readyPlayer(player.page);
      }

      await expect(players[0].page.locator("#online-start-round-setup")).toBeEnabled({
        timeout: WAIT_TIMEOUT_MS
      });
      await players[0].page.locator("#online-start-round-setup").click();

      for (const player of players) {
        await expect(stagePhaseText(player.page)).toHaveText("selecting_initial_dealer", {
          timeout: WAIT_TIMEOUT_MS
        });
      }

      await players[0].page.locator("#online-auto-resolve-dealer").click();
      await expect(players[0].page.locator("#online-deal-cards")).toBeVisible({
        timeout: WAIT_TIMEOUT_MS
      });
      await players[0].page.locator("#online-deal-cards").click();

      for (const player of players) {
        await expect(player.page.getByRole("heading", { name: "Synced Play" })).toBeVisible({
          timeout: WAIT_TIMEOUT_MS
        });
        await expect(player.page.getByText("Draw Pile").first()).toBeVisible({
          timeout: WAIT_TIMEOUT_MS
        });
      }
    } finally {
      await closePlayers(players);
    }
  });

  test("six-player synchronized setup can resolve a give-up decision and continue into play", async ({ browser }) => {
    test.slow();

    const roomId = createUniqueId("giveup");
    const players = await openPlayers(browser, 6);

    try {
      await connectAndEnterRoom(players[0], roomId, "create");

      for (const player of players.slice(1)) {
        await connectAndEnterRoom(player, roomId, "join");
      }

      for (const player of players) {
        await readyPlayer(player.page);
      }

      await expect(players[0].page.locator("#online-start-round-setup")).toBeEnabled({
        timeout: WAIT_TIMEOUT_MS
      });
      await players[0].page.locator("#online-start-round-setup").click();
      await players[0].page.locator("#online-auto-resolve-dealer").click();

      for (const player of players) {
        await expect(stagePhaseText(player.page)).toHaveText("waiting_for_giveups", {
          timeout: WAIT_TIMEOUT_MS
        });
      }

      const chooser = await findPlayerWithVisibleAction(players, "#online-giveup-decision");
      await chooser.page.locator("#online-giveup-decision").click();

      for (const player of players) {
        await expect(stagePhaseText(player.page)).toHaveText("ready_to_play", {
          timeout: WAIT_TIMEOUT_MS
        });
        await expect(player.page.locator("#online-deal-cards")).toBeVisible({
          timeout: WAIT_TIMEOUT_MS
        });
      }

      await players[0].page.locator("#online-deal-cards").click();

      for (const player of players) {
        await expect(player.page.getByRole("heading", { name: "Synced Play" })).toBeVisible({
          timeout: WAIT_TIMEOUT_MS
        });
      }
    } finally {
      await closePlayers(players);
    }
  });

  test("late join attempts are rejected once a synchronized room is already in play", async ({ browser }) => {
    test.slow();

    const roomId = createUniqueId("locked");
    const players = await openPlayers(browser, 6);

    try {
      await connectAndEnterRoom(players[0], roomId, "create");

      for (const player of players.slice(1, 5)) {
        await connectAndEnterRoom(player, roomId, "join");
      }

      for (const player of players.slice(0, 5)) {
        await readyPlayer(player.page);
      }

      await expect(players[0].page.locator("#online-start-round-setup")).toBeEnabled({
        timeout: WAIT_TIMEOUT_MS
      });
      await players[0].page.locator("#online-start-round-setup").click();
      await players[0].page.locator("#online-auto-resolve-dealer").click();
      await expect(players[0].page.locator("#online-deal-cards")).toBeVisible({
        timeout: WAIT_TIMEOUT_MS
      });
      await players[0].page.locator("#online-deal-cards").click();
      await expect(players[0].page.getByRole("heading", { name: "Synced Play" })).toBeVisible({
        timeout: WAIT_TIMEOUT_MS
      });

      await signupAndOpenMatch(players[5].page, players[5].playerId);
      await players[5].page.locator("#online-room-id").fill(roomId);
      await players[5].page.locator("#online-join-room").click();

      await expect(players[5].page.getByText("This room is in an active round. New players can join after the room returns to idle.")).toBeVisible({
        timeout: WAIT_TIMEOUT_MS
      });
    } finally {
      await closePlayers(players);
    }
  });
});

async function openPlayers(browser: Browser, count: number): Promise<OnlinePlayerHandle[]> {
  const players: OnlinePlayerHandle[] = [];

  for (let index = 0; index < count; index += 1) {
    const context = await browser.newContext();
    const page = await context.newPage();
    players.push({
      context,
      page,
      playerId: createUniqueId(`player${index + 1}`)
    });
  }

  return players;
}

async function closePlayers(players: readonly OnlinePlayerHandle[]): Promise<void> {
  await Promise.all(players.map((player) => player.context.close()));
}

async function connectAndEnterRoom(
  player: OnlinePlayerHandle,
  roomId: string,
  mode: "create" | "join"
): Promise<void> {
  await signupAndOpenMatch(player.page, player.playerId);
  await waitForMatchConnection(player.page);
  await player.page.locator("#online-room-id").fill(roomId);

  if (mode === "create") {
    await player.page.locator("#online-create-room").click();
  } else {
    await player.page.locator("#online-join-room").click();
  }

  await expect(stagePhaseText(player.page)).toHaveText("idle", {
    timeout: WAIT_TIMEOUT_MS
  });
  await expect(player.page.getByText(`Server-authoritative room ${roomId}`).first()).toBeVisible({
    timeout: WAIT_TIMEOUT_MS
  });
}

async function signupAndOpenMatch(page: Page, playerId: string): Promise<void> {
  await page.goto("/");
  await page.locator("#auth-show-signup").click();
  await page.locator("#auth-signup-user-id").fill(playerId);
  await page.locator("#auth-signup-name").fill(playerId.toUpperCase());
  await page.locator("#auth-signup-password").fill("pass1234");
  await page.locator("#auth-signup-submit").click();
  await page.locator("[data-home-menu-section='match']").click();
}

async function waitForMatchConnection(page: Page): Promise<void> {
  await expect(page.locator("#online-create-room")).toBeEnabled({
    timeout: WAIT_TIMEOUT_MS
  });
  await expect(page.locator(".command-hero-pills")).toContainText("connected", {
    timeout: WAIT_TIMEOUT_MS
  });
}

async function readyPlayer(page: Page): Promise<void> {
  const readyButton = page.locator("#online-toggle-ready");
  await expect(readyButton).toBeVisible({
    timeout: WAIT_TIMEOUT_MS
  });
  await expect(readyButton).toBeEnabled({
    timeout: WAIT_TIMEOUT_MS
  });

  if ((await readyButton.textContent())?.includes("Set Not Ready")) {
    return;
  }

  await readyButton.click();
  await expect(readyButton).toHaveText("Set Not Ready", {
    timeout: WAIT_TIMEOUT_MS
  });
}

async function findPlayerWithVisibleAction(
  players: readonly OnlinePlayerHandle[],
  selector: string
): Promise<OnlinePlayerHandle> {
  const deadline = Date.now() + WAIT_TIMEOUT_MS;

  while (Date.now() < deadline) {
    for (const player of players) {
      if (await player.page.locator(selector).isVisible().catch(() => false)) {
        return player;
      }
    }

    await players[0]?.page.waitForTimeout(250);
  }

  throw new Error(`No player exposed action ${selector} before timeout.`);
}

function stagePhaseText(page: Page): Locator {
  return page.locator(".online-stage-zone .zone-header span").first();
}

function createUniqueId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
