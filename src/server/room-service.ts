import {
  createRoom,
  joinRoom,
  leaveRoom,
  setPlayerConnected,
  setPlayerDisplayName,
  setHostPlayer,
  setPlayerReady,
  type RoomState
} from "../domain/room.js";

export class MultiplayerRoomService {
  private readonly rooms = new Map<string, RoomState>();
  private readonly playerRooms = new Map<string, string>();

  getRooms(): RoomState[] {
    return [...this.rooms.values()];
  }

  hydrateRooms(rooms: readonly RoomState[]): void {
    this.rooms.clear();
    this.playerRooms.clear();

    for (const room of rooms) {
      this.rooms.set(room.roomId, room);
      for (const player of room.players) {
        this.playerRooms.set(player.playerId, room.roomId);
      }
    }
  }

  replaceRoom(room: RoomState): RoomState {
    if (!this.rooms.has(room.roomId)) {
      throw new Error(`Room ${room.roomId} does not exist.`);
    }

    this.rooms.set(room.roomId, room);
    return room;
  }

  createRoom(playerId: string, roomId: string, displayName = playerId): RoomState {
    if (this.rooms.has(roomId)) {
      throw new Error(`Room ${roomId} already exists.`);
    }

    this.leaveCurrentRoom(playerId);

    const room = setPlayerDisplayName(joinRoom(createRoom(roomId), playerId), playerId, displayName);
    this.rooms.set(roomId, room);
    this.playerRooms.set(playerId, roomId);
    return room;
  }

  joinExistingRoom(playerId: string, roomId: string, displayName = playerId): RoomState {
    const existingRoom = this.rooms.get(roomId);
    if (existingRoom === undefined) {
      throw new Error(`Room ${roomId} does not exist.`);
    }

    this.leaveCurrentRoom(playerId);

    const room = setPlayerDisplayName(joinRoom(existingRoom, playerId), playerId, displayName);
    this.rooms.set(roomId, room);
    this.playerRooms.set(playerId, roomId);
    return room;
  }

  leaveCurrentRoom(playerId: string): { roomId: string | null; room: RoomState | null } {
    const roomId = this.playerRooms.get(playerId);
    if (roomId === undefined) {
      return {
        roomId: null,
        room: null
      };
    }

    const room = this.rooms.get(roomId);
    if (room === undefined) {
      this.playerRooms.delete(playerId);
      return {
        roomId,
        room: null
      };
    }

    const nextRoom = leaveRoom(room, playerId);
    this.playerRooms.delete(playerId);

    if (nextRoom.players.length === 0) {
      this.rooms.delete(roomId);
      return {
        roomId,
        room: null
      };
    }

    this.rooms.set(roomId, nextRoom);
    return {
      roomId,
      room: nextRoom
    };
  }

  getRoomForPlayer(playerId: string): RoomState | null {
    const roomId = this.playerRooms.get(playerId);
    if (roomId === undefined) {
      return null;
    }

    return this.rooms.get(roomId) ?? null;
  }

  getRoom(roomId: string): RoomState | null {
    return this.rooms.get(roomId) ?? null;
  }

  deleteRoom(roomId: string): RoomState | null {
    const room = this.rooms.get(roomId);
    if (room === undefined) {
      return null;
    }

    this.rooms.delete(roomId);
    for (const player of room.players) {
      this.playerRooms.delete(player.playerId);
    }

    return room;
  }

  updateReadyState(playerId: string, isReady: boolean): RoomState {
    const roomId = this.playerRooms.get(playerId);
    if (roomId === undefined) {
      throw new Error("Player is not currently in a room.");
    }

    const room = this.rooms.get(roomId);
    if (room === undefined) {
      throw new Error(`Room ${roomId} does not exist.`);
    }

    const nextRoom = setPlayerReady(room, playerId, isReady);
    this.rooms.set(roomId, nextRoom);
    return nextRoom;
  }

  updateDisplayName(playerId: string, displayName: string): RoomState {
    const roomId = this.playerRooms.get(playerId);
    if (roomId === undefined) {
      throw new Error("Player is not currently in a room.");
    }

    const room = this.rooms.get(roomId);
    if (room === undefined) {
      throw new Error(`Room ${roomId} does not exist.`);
    }

    const nextRoom = setPlayerDisplayName(room, playerId, displayName);
    this.rooms.set(roomId, nextRoom);
    return nextRoom;
  }

  transferHost(playerId: string, targetPlayerId: string): RoomState {
    const roomId = this.playerRooms.get(playerId);
    if (roomId === undefined) {
      throw new Error("Player is not currently in a room.");
    }

    const room = this.rooms.get(roomId);
    if (room === undefined) {
      throw new Error(`Room ${roomId} does not exist.`);
    }

    const nextRoom = setHostPlayer(room, targetPlayerId);
    this.rooms.set(roomId, nextRoom);
    return nextRoom;
  }

  kickPlayer(actorPlayerId: string, targetPlayerId: string): { roomId: string; room: RoomState | null } {
    const roomId = this.playerRooms.get(actorPlayerId);
    if (roomId === undefined) {
      throw new Error("Player is not currently in a room.");
    }

    const room = this.rooms.get(roomId);
    if (room === undefined) {
      throw new Error(`Room ${roomId} does not exist.`);
    }

    if (!room.players.some((player) => player.playerId === targetPlayerId)) {
      throw new Error(`Player ${targetPlayerId} is not in room ${roomId}.`);
    }

    const nextRoom = leaveRoom(room, targetPlayerId);
    this.playerRooms.delete(targetPlayerId);

    if (nextRoom.players.length === 0) {
      this.rooms.delete(roomId);
      return {
        roomId,
        room: null
      };
    }

    this.rooms.set(roomId, nextRoom);
    return {
      roomId,
      room: nextRoom
    };
  }

  updateConnectionState(playerId: string, isConnected: boolean): RoomState | null {
    const roomId = this.playerRooms.get(playerId);
    if (roomId === undefined) {
      return null;
    }

    const room = this.rooms.get(roomId);
    if (room === undefined) {
      return null;
    }

    const nextRoom = setPlayerConnected(room, playerId, isConnected);
    this.rooms.set(roomId, nextRoom);
    return nextRoom;
  }
}
