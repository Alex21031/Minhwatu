import { test, expect, type Browser, type BrowserContext, type Page } from "@playwright/test";

const WAIT_TIMEOUT_MS = 20_000;

interface OnlinePlayerHandle {
  context: BrowserContext;
  page: Page;
  playerId: string;
}

test.describe("online multiplayer flow", () => {
  test("five players can connect, ready up, start setup, and reach synchronized play", async ({
    browser
  }) => {
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

      await waitForStartSetupEnabled(players[0].page, 5);
      await players[0].page.locator("#online-start-round-setup").click();

      for (const player of players) {
        await expect(player.page.getByText("Setup phase: selecting_initial_dealer")).toBeVisible({
          timeout: WAIT_TIMEOUT_MS
        });
      }

      await players[0].page.locator("#online-auto-resolve-dealer").click();
      await expect(players[0].page.locator("#online-deal-cards")).toBeEnabled({
        timeout: WAIT_TIMEOUT_MS
      });
      await players[0].page.locator("#online-deal-cards").click();

      for (const player of players) {
        await expect(player.page.getByText("Play phase: awaiting_hand_play")).toBeVisible({
          timeout: WAIT_TIMEOUT_MS
        });
        await expect(player.page.getByText("Setup phase: idle")).toBeVisible({
          timeout: WAIT_TIMEOUT_MS
        });
      }

      await expect(players[0].page.getByText(/Cards dealt\./)).toBeVisible({
        timeout: WAIT_TIMEOUT_MS
      });
    } finally {
      await closePlayers(players);
    }
  });

  test("late join attempts are rejected once a synchronized room is already in play", async ({
    browser
  }) => {
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

      await waitForStartSetupEnabled(players[0].page, 5);
      await players[0].page.locator("#online-start-round-setup").click();
      await expect(players[0].page.locator("#online-auto-resolve-dealer")).toBeEnabled({
        timeout: WAIT_TIMEOUT_MS
      });
      await players[0].page.locator("#online-auto-resolve-dealer").click();
      await expect(players[0].page.locator("#online-deal-cards")).toBeEnabled({
        timeout: WAIT_TIMEOUT_MS
      });
      await players[0].page.locator("#online-deal-cards").click();
      await expect(players[0].page.getByText("Play phase: awaiting_hand_play")).toBeVisible({
        timeout: WAIT_TIMEOUT_MS
      });

      await connectPlayer(players[5].page, players[5].playerId);
      await players[5].page.locator("#online-room-id").fill(roomId);
      await players[5].page.locator("#online-join-room").click();

      await expect(
        players[5].page
          .locator(".panel-copy")
          .filter({
            hasText:
              "Server error: This room is in an active round. New players can join after the room returns to idle."
          })
      ).toBeVisible({
        timeout: WAIT_TIMEOUT_MS
      });
      await expect(players[5].page.getByText("No synchronized room snapshot yet.")).toBeVisible();
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
  await connectPlayer(player.page, player.playerId);
  await player.page.locator("#online-room-id").fill(roomId);

  if (mode === "create") {
    await player.page.locator("#online-create-room").click();
  } else {
    await player.page.locator("#online-join-room").click();
  }

  await expect(player.page.getByRole("heading", { name: "Synced Room" })).toBeVisible({
    timeout: WAIT_TIMEOUT_MS
  });
  await expect(player.page.getByText(`Setup phase: idle`)).toBeVisible({
    timeout: WAIT_TIMEOUT_MS
  });
}

async function connectPlayer(page: Page, playerId: string): Promise<void> {
  await page.goto("/");
  await page.locator("#online-player-id").fill(playerId);
  await page.locator("#online-connect").click();
  await expect(page.getByText(`Status: connected as ${playerId}`)).toBeVisible({
    timeout: WAIT_TIMEOUT_MS
  });
}

async function readyPlayer(page: Page): Promise<void> {
  const readyButton = page.locator("#online-toggle-ready");
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

async function waitForStartSetupEnabled(page: Page, expectedPlayers: number): Promise<void> {
  await expect(page.locator(".hand-panel")).toHaveCount(expectedPlayers, {
    timeout: WAIT_TIMEOUT_MS
  });

  for (let attempt = 0; attempt < 10; attempt += 1) {
    if (await page.locator("#online-start-round-setup").isEnabled()) {
      return;
    }

    await page.locator("#online-refresh-room").click();
    await page.waitForTimeout(500);
  }

  await expect(page.locator("#online-start-round-setup")).toBeEnabled({
    timeout: WAIT_TIMEOUT_MS
  });
}

function createUniqueId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
