import type { RoomState } from "../domain/room.js";
import type {
  PlayStateView,
  RoundSetupStateView,
  VisibleCard
} from "./views.js";

export type { PlayStateView, RoundSetupStateView, VisibleCard } from "./views.js";

export interface ServerCapabilities {
  setReady: boolean;
  setDisplayName: boolean;
  transferHost: boolean;
  kickPlayer: boolean;
}

export interface RoomSnapshotPayload {
  room: RoomState;
  setupState: RoundSetupStateView | null;
  playState: PlayStateView | null;
  actionLog: string[];
}

export type ClientMessage =
  | {
      type: "identify";
      playerId: string;
    }
  | {
      type: "create_room";
      roomId: string;
    }
  | {
      type: "join_room";
      roomId: string;
    }
  | {
      type: "leave_room";
    }
  | {
      type: "request_room_snapshot";
    }
  | {
      type: "set_ready";
      isReady: boolean;
    }
  | {
      type: "set_display_name";
      displayName: string;
    }
  | {
      type: "transfer_host";
      targetPlayerId: string;
    }
  | {
      type: "kick_player";
      targetPlayerId: string;
    }
  | {
      type: "start_round_setup";
    }
  | {
      type: "auto_resolve_dealer";
    }
  | {
      type: "declare_give_up";
      giveUp: boolean;
    }
  | {
      type: "deal_cards";
    }
  | {
      type: "select_hand_card";
      cardId: string;
    }
  | {
      type: "resolve_hand_choice";
      floorCardId: string | null;
    }
  | {
      type: "flip_draw_card";
    }
  | {
      type: "resolve_draw_choice";
      floorCardId: string | null;
    }
  | {
      type: "prepare_next_round";
    };

export type ServerMessage =
  | {
      type: "connected";
      playerId: string;
      protocolVersion: number;
      capabilities: ServerCapabilities;
    }
  | ({
      type: "room_snapshot";
    } & RoomSnapshotPayload)
  | {
      type: "left_room";
      roomId: string | null;
    }
  | {
      type: "error";
      message: string;
    };
