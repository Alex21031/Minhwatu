interface BindAnonymousAuthEventsArgs {
  onShowLogin: () => void;
  onShowSignup: () => void;
  onUpdateAuthField: (field: "loginUserId" | "loginPassword" | "signupUserId" | "signupName" | "signupPassword", value: string) => void;
  onSubmitLogin: () => void;
  onSubmitSignup: () => void;
}

interface BindAuthenticatedEventsArgs {
  onSelectHomeSection: (section: string) => void;
  onBackHome: () => void;
  onUpdateOnlineField: (field: "serverUrl" | "displayNameInput" | "roomIdInput", value: string) => void;
  onLogout: () => void;
  onReconnectServer: () => void;
  onCreateRoom: () => void;
  onJoinRoom: () => void;
  onLeaveRoom: () => void;
  onToggleReady: () => void;
  onAddTestBot: () => void;
  onSaveDisplayName: () => void;
  onTransferHost: (targetPlayerId: string) => void;
  onKickPlayer: (targetPlayerId: string) => void;
  onUpdateWatchRoomId: (value: string) => void;
  onWatchRoom: (roomId: string) => void;
  onStopWatchingRoom: () => void;
  onUpdateAdminBalanceUserId: (value: string) => void;
  onUpdateAdminBalanceAmount: (value: string) => void;
  onRefreshAdminOverview: () => void;
  onAdjustAdminBalance: () => void;
  onStartRoundSetup: () => void;
  onAutoResolveDealer: () => void;
  onPlayDecision: () => void;
  onGiveUpDecision: () => void;
  onDealOnlineCards: () => void;
  onPrepareOnlineNextRound: () => void;
  onSelectOnlineCard: (cardId: string) => void;
  onSelectOnlineFloorCard: (cardId: string) => void;
  onChangePlayerCount: (value: number) => void;
  onResetRoom: () => void;
  onChangeDealerInput: (playerId: string, targetField: string, value: number) => void;
  onAutoDealer: () => void;
  onResolveDealer: () => void;
  onChoosePlay: () => void;
  onChooseGiveUp: () => void;
  onChangeCutIndex: (value: number) => void;
  onDealLocalCards: () => void;
  onPrepareLocalNextRound: () => void;
}

export function bindAnonymousAuthEvents(args: BindAnonymousAuthEventsArgs): void {
  document.querySelector<HTMLButtonElement>("#auth-show-login")?.addEventListener("click", () => {
    args.onShowLogin();
  });

  document.querySelector<HTMLButtonElement>("#auth-show-signup")?.addEventListener("click", () => {
    args.onShowSignup();
  });

  document.querySelector<HTMLInputElement>("#auth-login-user-id")?.addEventListener("input", (event) => {
    args.onUpdateAuthField("loginUserId", (event.currentTarget as HTMLInputElement).value);
  });
  document.querySelector<HTMLInputElement>("#auth-login-password")?.addEventListener("input", (event) => {
    args.onUpdateAuthField("loginPassword", (event.currentTarget as HTMLInputElement).value);
  });
  document.querySelector<HTMLInputElement>("#auth-signup-user-id")?.addEventListener("input", (event) => {
    args.onUpdateAuthField("signupUserId", (event.currentTarget as HTMLInputElement).value);
  });
  document.querySelector<HTMLInputElement>("#auth-signup-name")?.addEventListener("input", (event) => {
    args.onUpdateAuthField("signupName", (event.currentTarget as HTMLInputElement).value);
  });
  document.querySelector<HTMLInputElement>("#auth-signup-password")?.addEventListener("input", (event) => {
    args.onUpdateAuthField("signupPassword", (event.currentTarget as HTMLInputElement).value);
  });
  document.querySelector<HTMLButtonElement>("#auth-login-submit")?.addEventListener("click", () => {
    args.onSubmitLogin();
  });
  document.querySelector<HTMLButtonElement>("#auth-signup-submit")?.addEventListener("click", () => {
    args.onSubmitSignup();
  });
}

export function bindAuthenticatedEvents(args: BindAuthenticatedEventsArgs): void {
  document.querySelectorAll<HTMLButtonElement>(".home-menu-button").forEach((button) => {
    button.addEventListener("click", () => {
      const section = button.dataset.homeMenuSection;
      if (section === undefined) {
        return;
      }

      args.onSelectHomeSection(section);
    });
  });

  document.querySelector<HTMLButtonElement>("#home-back-button")?.addEventListener("click", () => {
    args.onBackHome();
  });

  document.querySelector<HTMLInputElement>("#settings-server-url")?.addEventListener("change", (event) => {
    args.onUpdateOnlineField("serverUrl", (event.currentTarget as HTMLInputElement).value);
  });

  document.querySelector<HTMLInputElement>("#online-server-url")?.addEventListener("change", (event) => {
    args.onUpdateOnlineField("serverUrl", (event.currentTarget as HTMLInputElement).value);
  });

  document.querySelector<HTMLInputElement>("#settings-display-name")?.addEventListener("change", (event) => {
    args.onUpdateOnlineField("displayNameInput", (event.currentTarget as HTMLInputElement).value);
  });

  document.querySelector<HTMLInputElement>("#online-room-id")?.addEventListener("change", (event) => {
    args.onUpdateOnlineField("roomIdInput", (event.currentTarget as HTMLInputElement).value);
  });

  document.querySelector<HTMLButtonElement>("#auth-logout")?.addEventListener("click", args.onLogout);
  document.querySelector<HTMLButtonElement>("#auth-logout-settings")?.addEventListener("click", args.onLogout);
  document.querySelector<HTMLButtonElement>("#settings-reconnect-server")?.addEventListener("click", args.onReconnectServer);
  document.querySelector<HTMLButtonElement>("#online-connect-server")?.addEventListener("click", args.onReconnectServer);
  document.querySelector<HTMLButtonElement>("#online-create-room")?.addEventListener("click", args.onCreateRoom);
  document.querySelector<HTMLButtonElement>("#online-join-room")?.addEventListener("click", args.onJoinRoom);
  document.querySelector<HTMLButtonElement>("#online-leave-room")?.addEventListener("click", args.onLeaveRoom);
  document.querySelector<HTMLButtonElement>("#online-leave-room-dock")?.addEventListener("click", args.onLeaveRoom);
  document.querySelector<HTMLButtonElement>("#online-toggle-ready")?.addEventListener("click", args.onToggleReady);
  document.querySelector<HTMLButtonElement>("#online-add-test-bot")?.addEventListener("click", args.onAddTestBot);
  document.querySelector<HTMLButtonElement>("#settings-set-display-name")?.addEventListener("click", args.onSaveDisplayName);

  document.querySelectorAll<HTMLButtonElement>(".online-transfer-host-button").forEach((button) => {
    button.addEventListener("click", () => {
      const targetPlayerId = button.dataset.targetPlayerId;
      if (targetPlayerId !== undefined) {
        args.onTransferHost(targetPlayerId);
      }
    });
  });

  document.querySelectorAll<HTMLButtonElement>(".online-kick-player-button").forEach((button) => {
    button.addEventListener("click", () => {
      const targetPlayerId = button.dataset.targetPlayerId;
      if (targetPlayerId !== undefined) {
        args.onKickPlayer(targetPlayerId);
      }
    });
  });

  document.querySelector<HTMLInputElement>("#admin-watch-room-id")?.addEventListener("input", (event) => {
    args.onUpdateWatchRoomId((event.currentTarget as HTMLInputElement).value);
  });
  document.querySelector<HTMLButtonElement>("#admin-watch-room")?.addEventListener("click", () => {
    const roomId = document.querySelector<HTMLInputElement>("#admin-watch-room-id")?.value ?? "";
    args.onWatchRoom(roomId);
  });
  document.querySelectorAll<HTMLButtonElement>(".admin-watch-room-quick").forEach((button) => {
    button.addEventListener("click", () => {
      const roomId = button.dataset.roomId;
      if (roomId !== undefined) {
        args.onWatchRoom(roomId);
      }
    });
  });
  document.querySelector<HTMLButtonElement>("#admin-stop-watch-room")?.addEventListener("click", args.onStopWatchingRoom);
  document.querySelector<HTMLInputElement>("#admin-balance-user-id")?.addEventListener("input", (event) => {
    args.onUpdateAdminBalanceUserId((event.currentTarget as HTMLInputElement).value);
  });
  document.querySelector<HTMLInputElement>("#admin-balance-amount")?.addEventListener("input", (event) => {
    args.onUpdateAdminBalanceAmount((event.currentTarget as HTMLInputElement).value);
  });
  document.querySelector<HTMLButtonElement>("#admin-refresh-overview")?.addEventListener("click", args.onRefreshAdminOverview);
  document.querySelector<HTMLButtonElement>("#admin-adjust-balance")?.addEventListener("click", args.onAdjustAdminBalance);

  document.querySelector<HTMLButtonElement>("#online-start-round-setup")?.addEventListener("click", args.onStartRoundSetup);
  document.querySelector<HTMLButtonElement>("#online-auto-resolve-dealer")?.addEventListener("click", args.onAutoResolveDealer);
  document.querySelector<HTMLButtonElement>("#online-play-decision")?.addEventListener("click", args.onPlayDecision);
  document.querySelector<HTMLButtonElement>("#online-giveup-decision")?.addEventListener("click", args.onGiveUpDecision);
  document.querySelector<HTMLButtonElement>("#online-deal-cards")?.addEventListener("click", args.onDealOnlineCards);
  document.querySelector<HTMLButtonElement>("#online-prepare-next-round")?.addEventListener("click", args.onPrepareOnlineNextRound);

  document.querySelectorAll<HTMLButtonElement>("[data-online-card-id]").forEach((button) => {
    button.addEventListener("click", () => {
      const cardId = button.dataset.onlineCardId;
      if (cardId !== undefined) {
        args.onSelectOnlineCard(cardId);
      }
    });
  });

  document.querySelectorAll<HTMLButtonElement>("[data-online-floor-card-id]").forEach((button) => {
    button.addEventListener("click", () => {
      const cardId = button.dataset.onlineFloorCardId;
      if (cardId !== undefined) {
        args.onSelectOnlineFloorCard(cardId);
      }
    });
  });

  document.querySelector<HTMLSelectElement>("#player-count")?.addEventListener("change", (event) => {
    args.onChangePlayerCount(Number.parseInt((event.currentTarget as HTMLSelectElement).value, 10));
  });
  document.querySelector<HTMLButtonElement>("#reset-room")?.addEventListener("click", args.onResetRoom);

  document.querySelectorAll<HTMLInputElement | HTMLSelectElement>("[data-player]").forEach((field) => {
    field.addEventListener("change", (event) => {
      const input = event.currentTarget as HTMLInputElement | HTMLSelectElement;
      const playerId = input.dataset.player;
      const targetField = input.dataset.field;
      if (playerId !== undefined && targetField !== undefined) {
        args.onChangeDealerInput(playerId, targetField, Number.parseInt(input.value, 10));
      }
    });
  });

  document.querySelector<HTMLButtonElement>("#auto-dealer")?.addEventListener("click", args.onAutoDealer);
  document.querySelector<HTMLButtonElement>("#resolve-dealer")?.addEventListener("click", args.onResolveDealer);
  document.querySelector<HTMLButtonElement>("#choose-play")?.addEventListener("click", args.onChoosePlay);
  document.querySelector<HTMLButtonElement>("#choose-giveup")?.addEventListener("click", args.onChooseGiveUp);
  document.querySelector<HTMLInputElement>("#cut-index")?.addEventListener("change", (event) => {
    args.onChangeCutIndex(Number.parseInt((event.currentTarget as HTMLInputElement).value, 10));
  });
  document.querySelector<HTMLButtonElement>("#deal-cards")?.addEventListener("click", args.onDealLocalCards);
  document.querySelector<HTMLButtonElement>("#redeal")?.addEventListener("click", args.onDealLocalCards);
  document.querySelector<HTMLButtonElement>("#prepare-next-round")?.addEventListener("click", args.onPrepareLocalNextRound);
}
