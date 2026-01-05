export type Unsubscribe = () => void;

export interface Store<T> {
  get(): T;
  set(next: T): void;
  update(updater: (prev: T) => T): void;
  subscribe(listener: (state: T) => void): Unsubscribe;
}

export function createStore<T>(initial: T): Store<T> {
  let state = initial;
  const listeners = new Set<(s: T) => void>();

  function notify() {
    for (const listener of listeners) listener(state);
  }

  return {
    get: () => state,
    set: (next) => {
      state = next;
      notify();
    },
    update: (updater) => {
      state = updater(state);
      notify();
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

