import type { RoomState } from "../domain/room.js";
import type { AuthenticatedUserView } from "./account-service.js";
import type { RoomView } from "./protocol.js";

export function createRoomView(room: RoomState, viewer: AuthenticatedUserView): RoomView {
  const viewerIsHost = room.hostPlayerId === viewer.userId;
  const viewerCanSeePrivateIdentity = viewer.role === "admin" || viewerIsHost;

  return {
    roomId: room.roomId,
    hostPlayerId: viewerCanSeePrivateIdentity ? room.hostPlayerId : null,
    players: room.players.map((player) => ({
      playerId: viewerCanSeePrivateIdentity || player.playerId === viewer.userId ? player.playerId : null,
      displayName: player.displayName,
      seatIndex: player.seatIndex,
      role: player.role,
      isReady: player.isReady,
      isConnected: player.isConnected,
      isHost: player.playerId === room.hostPlayerId,
      isSelf: player.playerId === viewer.userId
    }))
  };
}
