import Phaser from 'phaser';

// Small overlays inside a play scene (quick-chat panel, player card) count as "modal" while they
// are open: Esc / P then close them instead of pausing, and games skip their own key handling.
// Closing releases the count on the next tick, so every handler of the key press that closed an
// overlay still sees it open (no Enter that sends a phrase also playing a move).

const counts = new WeakMap<Phaser.Scene, number>();

export function isModalOpen(scene: Phaser.Scene): boolean {
  return (counts.get(scene) ?? 0) > 0;
}

/** Marks a modal overlay as open; call the returned function once when it closes. */
export function pushModal(scene: Phaser.Scene): () => void {
  if (!counts.get(scene)) scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => counts.delete(scene));
  counts.set(scene, (counts.get(scene) ?? 0) + 1);
  let done = false;
  return () => {
    if (done) return;
    done = true;
    setTimeout(() => counts.set(scene, Math.max(0, (counts.get(scene) ?? 1) - 1)), 0);
  };
}
