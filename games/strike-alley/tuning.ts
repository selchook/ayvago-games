// Normal and Easy side by side. Easy shows the ball's whole path, widens the pocket (the last
// metres steer a ball that is heading close to it into it) and gentles the hook. Normal is the
// skill game; the physics are the same in both.
// The oil wears as the game goes on (lane transition): `oilWear` metres shorter each frame, so
// the ball hooks a little earlier and the line that struck in frame 1 needs moving later on.
export const TUNING = {
  normal: { hook: 1, pocketAssist: 0, preview: false, aimSens: 1, oilWear: 0.2 },
  easy: { hook: 0.65, pocketAssist: 0.13, preview: true, aimSens: 0.8, oilWear: 0.08 },
};
export type Tuning = (typeof TUNING)['normal'];
