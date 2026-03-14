export type HomeMenuSection = "home" | "match" | "spectate" | "settings";

export function getHomeSectionMeta(section: HomeMenuSection): {
  title: string;
  description: string;
  eyebrow: string;
  tag: string;
  toneClass: string;
} {
  switch (section) {
    case "spectate":
      return {
        title: "관전",
        description: "현재 방의 진행 상태와 관전자 시야 규칙을 빠르게 확인합니다.",
        eyebrow: "Watch Mode",
        tag: "Observer Feed",
        toneClass: "tone-spectate"
      };
    case "settings":
      return {
        title: "설정",
        description: "서버 주소, 플레이어 식별자, 자동 재연결 상태를 정리합니다.",
        eyebrow: "System",
        tag: "Session Control",
        toneClass: "tone-settings"
      };
    case "match":
      return {
        title: "대전",
        description: "서버에 연결하고 방을 만들거나 입장한 뒤 준비를 맞춰 대전을 시작합니다.",
        eyebrow: "Versus",
        tag: "Multiplayer Room",
        toneClass: "tone-match"
      };
    case "home":
    default:
      return {
        title: "민화투 온라인",
        description: "원하는 모드를 선택해 시작합니다.",
        eyebrow: "Home",
        tag: "Launcher",
        toneClass: "tone-home"
      };
  }
}

export function getHeroEyebrowText(hasActiveRoom: boolean): string {
  return hasActiveRoom ? "Online Multiplayer" : "Authenticated Lobby";
}

export function getHeroTitleText(hasActiveRoom: boolean): string {
  return hasActiveRoom ? "Minhwatu Online Table" : "Minhwatu Lobby";
}

export function getHeroLedeText(roomId: string | null): string {
  if (roomId !== null) {
    return `Server-authoritative room ${roomId} is active. The synchronized board is primary and the command deck now sits in the center flow for faster match control.`;
  }

  return "로그인 이후에만 로비와 게임으로 들어갈 수 있습니다. 연결, 방 입장, 준비, 시작 흐름은 중앙 워크스페이스에서 이어집니다.";
}

export function getSecondaryStatLabelText(hasActiveRoom: boolean): string {
  return hasActiveRoom ? "Room" : "Balance";
}

export function getSecondaryStatValueText(args: {
  hasActiveRoom: boolean;
  roomId: string | null;
  balanceLabel: string;
}): string {
  if (args.hasActiveRoom) {
    return args.roomId ?? "offline";
  }

  return args.balanceLabel;
}
