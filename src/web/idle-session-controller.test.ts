import test from "node:test";
import assert from "node:assert/strict";

import { createIdleSessionController } from "./idle-session-controller.js";

type ActivityEventName = "pointerdown" | "keydown" | "mousemove" | "touchstart" | "scroll";

class FakeEventTarget {
  private readonly listeners = new Map<ActivityEventName, Set<() => void>>();

  addEventListener(type: ActivityEventName, listener: () => void): void {
    const set = this.listeners.get(type) ?? new Set<() => void>();
    set.add(listener);
    this.listeners.set(type, set);
  }

  removeEventListener(type: ActivityEventName, listener: () => void): void {
    this.listeners.get(type)?.delete(listener);
  }

  dispatch(type: ActivityEventName): void {
    for (const listener of this.listeners.get(type) ?? []) {
      listener();
    }
  }
}

test("idle session controller fires onIdle after the timeout", () => {
  const target = new FakeEventTarget();
  const timeouts = new Map<number, () => void>();
  let nextId = 1;
  let idleCalls = 0;

  const controller = createIdleSessionController({
    target,
    idleTimeoutMs: 1000,
    onIdle: () => {
      idleCalls += 1;
    },
    setTimeoutFn: (handler) => {
      const id = nextId++;
      timeouts.set(id, handler);
      return id as ReturnType<typeof setTimeout>;
    },
    clearTimeoutFn: (timeoutId) => {
      timeouts.delete(timeoutId as unknown as number);
    }
  });

  controller.start();
  assert.equal(controller.isActive(), true);
  assert.equal(timeouts.size, 1);

  const handler = timeouts.values().next().value;
  handler();

  assert.equal(idleCalls, 1);
  assert.equal(controller.isActive(), false);
});

test("idle session controller resets the timeout when activity happens", () => {
  const target = new FakeEventTarget();
  const timeouts = new Map<number, () => void>();
  let nextId = 1;

  const controller = createIdleSessionController({
    target,
    idleTimeoutMs: 1000,
    onIdle: () => undefined,
    setTimeoutFn: (handler) => {
      const id = nextId++;
      timeouts.set(id, handler);
      return id as ReturnType<typeof setTimeout>;
    },
    clearTimeoutFn: (timeoutId) => {
      timeouts.delete(timeoutId as unknown as number);
    }
  });

  controller.start();
  const firstTimerId = [...timeouts.keys()][0];

  target.dispatch("mousemove");

  const nextTimerIds = [...timeouts.keys()];
  assert.equal(timeouts.size, 1);
  assert.notEqual(nextTimerIds[0], firstTimerId);
});
