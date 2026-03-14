import type { ServerCapabilities } from "../server/protocol.js";

export function onlineServerSupportsReadyToggle(capabilities: ServerCapabilities | null): boolean {
  return capabilities?.setReady === true;
}

export function onlineServerSupportsDisplayName(capabilities: ServerCapabilities | null): boolean {
  return capabilities?.setDisplayName === true;
}

export function onlineServerSupportsHostTransfer(capabilities: ServerCapabilities | null): boolean {
  return capabilities?.transferHost === true;
}

export function onlineServerSupportsKickPlayer(capabilities: ServerCapabilities | null): boolean {
  return capabilities?.kickPlayer === true;
}

export function onlineServerSupportsBots(capabilities: ServerCapabilities | null): boolean {
  return capabilities?.bots === true;
}

export function getOnlineCompatibilityError(message: string): string {
  if (message.includes("Unhandled message type") && message.includes("\"set_ready\"")) {
    return "The running server is outdated. Restart `npm run server` and reconnect.";
  }

  if (message.includes("Unhandled message type") && message.includes("\"set_display_name\"")) {
    return "The running server is outdated. Restart `npm run server` and reconnect.";
  }

  if (message.includes("Unhandled message type") && (message.includes("\"transfer_host\"") || message.includes("\"kick_player\""))) {
    return "The running server is outdated. Restart `npm run server` and reconnect.";
  }

  if (message.includes("Room is in progress. New players can join only after the current round returns to idle.")) {
    return "This room is in an active round. New players can join after the room returns to idle.";
  }

  if (message.includes("Cannot leave or switch rooms while a synchronized round is active.")) {
    return "Finish the active synchronized round before leaving or switching rooms.";
  }

  return message;
}
