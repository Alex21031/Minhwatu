import type { ClientMessage, PlayStateView } from "../server/protocol.js";

interface BindBoardClickRoutingArgs {
  document: Document;
  getOnlinePlayState: () => PlayStateView | null;
  resolveLocalFloorChoice: (floorCardId: string) => void;
  resolveLocalDiscardChoice: () => void;
  resolveLocalDrawFlip: () => void;
  resolveLocalSelectedHandCard: (cardId: string) => void;
  sendOnlineMessage: (message: ClientMessage) => void;
}

export function bindBoardClickRouting(args: BindBoardClickRoutingArgs): void {
  args.document.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }

    const floorChoiceButton = target.closest<HTMLButtonElement>(".floor-choice-button");
    if (floorChoiceButton !== null) {
      const floorCardId = floorChoiceButton.dataset.floorCardId;
      if (floorCardId !== undefined) {
        args.resolveLocalFloorChoice(floorCardId);
      }
      return;
    }

    const discardTrigger = target.closest<HTMLElement>("#discard-pending-card, [data-action='discard-to-floor']");
    if (discardTrigger !== null) {
      args.resolveLocalDiscardChoice();
      return;
    }

    const onlineDiscardTrigger = target.closest<HTMLElement>(
      "#online-discard-hand-choice, #online-discard-draw-choice, [data-online-action='discard-to-floor']"
    );
    if (onlineDiscardTrigger !== null) {
      const playState = args.getOnlinePlayState();
      if (playState?.phase === "awaiting_hand_choice") {
        args.sendOnlineMessage({
          type: "resolve_hand_choice",
          floorCardId: null
        });
        return;
      }

      if (playState?.phase === "awaiting_draw_choice") {
        args.sendOnlineMessage({
          type: "resolve_draw_choice",
          floorCardId: null
        });
        return;
      }
    }

    const onlineDrawPileTrigger = target.closest<HTMLElement>("#online-flip-draw-card, [data-online-action='flip-draw-pile']");
    if (onlineDrawPileTrigger !== null) {
      const playState = args.getOnlinePlayState();
      if (playState?.phase === "awaiting_draw_flip") {
        args.sendOnlineMessage({ type: "flip_draw_card" });
        return;
      }
    }

    const drawPileTrigger = target.closest<HTMLElement>("#flip-draw-card, [data-action='flip-draw-pile']");
    if (drawPileTrigger !== null) {
      args.resolveLocalDrawFlip();
      return;
    }

    const playButton = target.closest<HTMLButtonElement>(".play-card-button");
    if (playButton === null) {
      return;
    }

    const cardId = playButton.dataset.cardId;
    if (cardId === undefined) {
      return;
    }

    args.resolveLocalSelectedHandCard(cardId);
  });
}
