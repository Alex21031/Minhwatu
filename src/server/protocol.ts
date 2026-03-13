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
    readyCount: number;
    connectedCount: number;
    inProgress: boolean;
  }>;
  auditLog: string[];
}

export interface PublicRoomSummary {
  roomId: string;
  hostName: string | null;
  playerCount: number;
  readyCount: number;
  connectedCount: number;
  inProgress: boolean;
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
    counts: {
      gwang: number;
      yeolkkeut: number;
      tti: number;
      pi: number;
    };
    baseCardScore: number;
    entryFee: number;
    finalScore: number;
    amountWon: number;
    yakNetScore: number;
    yakMonths: number[];
    yakAdjustments: Array<{
      month: number;
      kind: "bonus" | "penalty";
      points: number;
      sourcePlayerId: string;
    }>;
    capturedCards: string[];
  }>;
}

export interface ServerCapabilities {
  setReady: boolean;
  setDisplayName: boolean;
  transferHost: boolean;
  kickPlayer: boolean;
  bots: boolean;
  watchRoom: boolean;
  deleteRoom: boolean;
  forceStart: boolean;
  proxyPlay: boolean;
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
      type: "delete_room";
      roomId: string;
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
      type: "add_test_bot";
    }
  | {
      type: "watch_room";
      roomId: string;
    }
  | {
      type: "stop_watching_room";
    }
  | {
      type: "admin_start_round_setup";
      roomId: string;
    }
  | {
      type: "admin_auto_resolve_dealer";
      roomId: string;
    }
  | {
      type: "admin_declare_give_up";
      playerId: string;
      giveUp: boolean;
    }
  | {
      type: "admin_deal_cards";
      roomId: string;
    }
  | {
      type: "admin_select_hand_card";
      playerId: string;
      cardId: string;
    }
  | {
      type: "admin_resolve_hand_choice";
      playerId: string;
      floorCardId: string | null;
    }
  | {
      type: "admin_flip_draw_card";
      playerId: string;
    }
  | {
      type: "admin_resolve_draw_choice";
      playerId: string;
      floorCardId: string | null;
    }
  | {
      type: "admin_prepare_next_round";
      roomId: string;
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
