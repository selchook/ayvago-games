import Phaser from 'phaser';

/**
 * Each browser key event reaches a scene's keyboard plugin once.
 *
 * Phaser keeps key events in the keyboard manager's queue until the end of the game step. A
 * scene's KeyboardPlugin replays that whole queue on every one of its updates, so when a step
 * holds several events (fast typing, Shift + letter, a slow frame) a `keydown` listener sees
 * the same event two to five times: typed letters doubled in the word games. Every plugin here
 * remembers the events it has dispatched and skips them.
 */
let installed = false;

export function installKeyboardOnce(): void {
  if (installed) return;
  installed = true;
  type Plugin = { manager: { queue: KeyboardEvent[] } | null; __seen?: WeakSet<KeyboardEvent> };
  const proto = Phaser.Input.Keyboard.KeyboardPlugin.prototype as unknown as Plugin & { update: () => void };
  const original = proto.update;
  proto.update = function (this: Plugin) {
    const manager = this.manager;
    const queue = manager?.queue;
    if (!manager || !queue || queue.length === 0) return original.call(this);
    const seen = (this.__seen ??= new WeakSet<KeyboardEvent>());
    const fresh = queue.filter((e) => !seen.has(e));
    fresh.forEach((e) => seen.add(e));
    if (fresh.length === queue.length) return original.call(this);
    manager.queue = fresh;
    try {
      return original.call(this);
    } finally {
      manager.queue = queue;
    }
  };
}
