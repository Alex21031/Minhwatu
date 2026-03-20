interface CreateAudioManagerArgs {
  storage: Storage;
  document: Document;
  storageKey: string;
  src: string;
  volume?: number;
}

export interface AudioManager {
  isMusicEnabled: () => boolean;
  toggleMusic: () => boolean;
  getMusicLabel: () => string;
}

export function createAudioManager(args: CreateAudioManagerArgs): AudioManager {
  let musicEnabled = loadStoredFlag(args.storage, args.storageKey);
  const audio = new Audio(args.src);
  audio.loop = true;
  audio.preload = "auto";
  audio.volume = args.volume ?? 0.34;

  const tryPlay = (): void => {
    if (!musicEnabled) {
      return;
    }

    void audio.play().catch(() => {
      // Autoplay can be blocked until a user gesture unlocks media playback.
    });
  };

  const syncPlayback = (): void => {
    if (musicEnabled) {
      tryPlay();
      return;
    }

    audio.pause();
  };

  const unlockPlayback = (): void => {
    tryPlay();
  };

  args.document.addEventListener("pointerdown", unlockPlayback, { passive: true });
  args.document.addEventListener("keydown", unlockPlayback);
  syncPlayback();

  return {
    isMusicEnabled: () => musicEnabled,
    toggleMusic: () => {
      musicEnabled = !musicEnabled;
      args.storage.setItem(args.storageKey, JSON.stringify(musicEnabled));
      syncPlayback();
      return musicEnabled;
    },
    getMusicLabel: () => (musicEnabled ? "Music On" : "Music Off")
  };
}

function loadStoredFlag(storage: Storage, key: string): boolean {
  try {
    const rawValue = storage.getItem(key);
    if (rawValue === null) {
      return false;
    }

    return JSON.parse(rawValue) === true;
  } catch {
    return false;
  }
}
