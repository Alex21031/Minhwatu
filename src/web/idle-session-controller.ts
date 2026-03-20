type ActivityEventName = "pointerdown" | "keydown" | "mousemove" | "touchstart" | "scroll";

interface ActivityEventTargetLike {
  addEventListener: (type: ActivityEventName, listener: () => void, options?: AddEventListenerOptions | boolean) => void;
  removeEventListener: (type: ActivityEventName, listener: () => void, options?: EventListenerOptions | boolean) => void;
}

interface CreateIdleSessionControllerArgs {
  target: ActivityEventTargetLike;
  idleTimeoutMs: number;
  onIdle: () => void;
  setTimeoutFn?: (handler: () => void, timeoutMs: number) => ReturnType<typeof setTimeout>;
  clearTimeoutFn?: (timeoutId: ReturnType<typeof setTimeout>) => void;
}

const ACTIVITY_EVENTS: readonly ActivityEventName[] = [
  "pointerdown",
  "keydown",
  "mousemove",
  "touchstart",
  "scroll"
];

export function createIdleSessionController(args: CreateIdleSessionControllerArgs) {
  const setTimeoutFn = args.setTimeoutFn ?? setTimeout;
  const clearTimeoutFn = args.clearTimeoutFn ?? clearTimeout;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  let active = false;

  const handleActivity = (): void => {
    if (!active) {
      return;
    }

    schedule();
  };

  function schedule(): void {
    if (timeoutId !== null) {
      clearTimeoutFn(timeoutId);
    }

    timeoutId = setTimeoutFn(() => {
      stop();
      args.onIdle();
    }, args.idleTimeoutMs);
  }

  function start(): void {
    if (active) {
      schedule();
      return;
    }

    active = true;
    for (const eventName of ACTIVITY_EVENTS) {
      args.target.addEventListener(eventName, handleActivity, { passive: true });
    }
    schedule();
  }

  function stop(): void {
    if (!active) {
      return;
    }

    active = false;
    if (timeoutId !== null) {
      clearTimeoutFn(timeoutId);
      timeoutId = null;
    }

    for (const eventName of ACTIVITY_EVENTS) {
      args.target.removeEventListener(eventName, handleActivity, { passive: true });
    }
  }

  return {
    start,
    stop,
    isActive: () => active
  };
}
