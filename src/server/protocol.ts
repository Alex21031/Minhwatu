import type { RoomPlayerRole } from "../domain/room.js";
import type {
  PlayStateView,
  RoundSetupStateView,
  VisibleCard
} from "./views.js";
import type { AuthenticatedUserView } from "./account-service.js";

export type { PlayStateView, RoundSetupStateView, VisibleCard } from "./views.js";
export type { AuthenticatedUserView } from "./account-service.js";

export interface RoomPlayerView {
  playerId: string | null;
  displayName: string;
  seatIndex: number;
  role: RoomPlayerRole;
  isReady: boolean;
  isConnected: boolean;
  isHost: boolean;
  isSelf: boolean;
}

export interface RoomView {
  roomId: string;
  hostPlayerId: string | null;
  players: RoomPlayerView[];
}

export interface AdminOverview {
  users: AuthenticatedUserView[];
  activeRooms: Array<{
    roomId: string;
    hostName: string | null;
    playerCount: number;
    inProgress: boolean;
  }>;
  auditLog: string[];
}

export interface RoundHistoryEntry {
  id: string;
  roomId: string;
  completedAt: string;
  status: "scored" | "reset";
  nextDealerId: string | null;
  summaryText: string;
  players: Array<{
    playerId: string;
    finalScore: number;
    amountWon: number;
    yakNetScore: number;
  }>;
}

export interface ServerCapabilities {
  setReady: boolean;
  setDisplayName: boolean;
  transferHost: boolean;
  kickPlayer: boolean;
  watchRoom: boolean;
  auth: boolean;
  admin: boolean;
}

export interface RoomSnapshotPayload {
  viewer: AuthenticatedUserView;
  room: RoomView;
  setupState: RoundSetupStateView | null;
  playState: PlayStateView | null;
  actionLog: string[];
  roundHistory: RoundHistoryEntry[];
}

export type ClientMessage =
  | {
      type: "identify";
      playerId: string;
      sessionToken: string;
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
    }
  | {
      type: "watch_room";
      roomId: string;
    }
  | {
      type: "stop_watching_room";
    };

export type ServerMessage =
  | {
      type: "connected";
      playerId: string;
      viewer: AuthenticatedUserView;
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
