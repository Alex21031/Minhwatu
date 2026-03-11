export const MIN_ACTIVE_PLAYERS = 5;
export const MAX_ROOM_PLAYERS = 7;

export type RoomPlayerRole = "waiting" | "playing" | "spectating";

export interface RoomPlayer {
  playerId: string;
  seatIndex: number;
  joinSequence: number;
  role: RoomPlayerRole;
  originalSeatIndex: number;
}

export interface RoomState {
  roomId: string;
  players: RoomPlayer[];
}

export function sortPlayersBySeat(players: readonly RoomPlayer[]): RoomPlayer[] {
  return [...players].sort((left, right) => {
    if (left.seatIndex !== right.seatIndex) {
      return left.seatIndex - right.seatIndex;
    }

    return left.joinSequence - right.joinSequence;
  });
}

export function createRoom(roomId: string): RoomState {
  if (!roomId) {
    throw new Error("roomId is required.");
  }

  return {
    roomId,
    players: []
  };
}

export function getPlayerById(room: RoomState, playerId: string): RoomPlayer {
  const player = room.players.find((candidate) => candidate.playerId === playerId);
  if (player === undefined) {
    throw new Error(`Player ${playerId} is not in room ${room.roomId}.`);
  }

  return player;
}

export function assignNextSeat(players: readonly RoomPlayer[]): number {
  if (players.length === 0) {
    return 0;
  }

  const occupiedSeats = new Set(players.map((player) => player.seatIndex));
  const lastJoined = [...players].sort((left, right) => right.joinSequence - left.joinSequence)[0];
  if (lastJoined === undefined) {
    throw new Error("Room has no players to anchor the next seat assignment.");
  }

  for (let offset = 1; offset <= MAX_ROOM_PLAYERS; offset += 1) {
    const seatIndex = (lastJoined.seatIndex + offset) % MAX_ROOM_PLAYERS;
    if (!occupiedSeats.has(seatIndex)) {
      return seatIndex;
    }
  }

  throw new Error("Room is full.");
}

export function joinRoom(room: RoomState, playerId: string): RoomState {
  if (!playerId) {
    throw new Error("playerId is required.");
  }

  if (room.players.some((player) => player.playerId === playerId)) {
    throw new Error(`Player ${playerId} is already in the room.`);
  }

  if (room.players.length >= MAX_ROOM_PLAYERS) {
    throw new Error("Room already has the maximum number of players.");
  }

  const seatIndex = assignNextSeat(room.players);
  const joinSequence = room.players.reduce((max, player) => Math.max(max, player.joinSequence), 0) + 1;
  const nextPlayer: RoomPlayer = {
    playerId,
    seatIndex,
    joinSequence,
    role: "waiting",
    originalSeatIndex: seatIndex
  };

  return {
    ...room,
    players: [...room.players, nextPlayer]
  };
}

export function leaveRoom(room: RoomState, playerId: string): RoomState {
  return {
    ...room,
    players: room.players.filter((player) => player.playerId !== playerId)
  };
}

export function getTurnOrderFromDealer(room: RoomState, dealerId: string): RoomPlayer[] {
  const dealer = getPlayerById(room, dealerId);
  const seatMap = new Map(room.players.map((player) => [player.seatIndex, player]));
  const turnOrder: RoomPlayer[] = [];

  for (let offset = 0; offset < MAX_ROOM_PLAYERS; offset += 1) {
    const seatIndex = (dealer.seatIndex + offset) % MAX_ROOM_PLAYERS;
    const seatedPlayer = seatMap.get(seatIndex);
    if (seatedPlayer !== undefined) {
      turnOrder.push(seatedPlayer);
    }
  }

  return turnOrder;
}

export function setRoundParticipantRoles(room: RoomState, activePlayerIds: readonly string[]): RoomState {
  const activePlayers = new Set(activePlayerIds);

  return {
    ...room,
    players: room.players.map((player) => ({
      ...player,
      role: activePlayers.has(player.playerId) ? "playing" : "spectating"
    }))
  };
}

export function movePlayerToSpectator(room: RoomState, playerId: string): RoomState {
  return {
    ...room,
    players: room.players.map((player) =>
      player.playerId === playerId
        ? {
            ...player,
            role: "spectating"
          }
        : player
    )
  };
}

export function restoreSpectatorsForNextRound(room: RoomState): RoomState {
  return {
    ...room,
    players: room.players.map((player) => ({
      ...player,
      role: "waiting",
      seatIndex: player.originalSeatIndex
    }))
  };
}
