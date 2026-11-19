// Unit test of the gamepad mapping (src/core/gamepad-map.ts): deadzone, hysteresis, press and
// release edges, the stick on the arrows, contexts, overrides, key repeat and no stuck keys.
// Usage: npx tsx scripts/gamepad-unit.ts   (part of npm run test:gamepad)
import {
  PadMapper, analogAxes, keyInfo, mergePads, PAD_INDEX, REPEAT_DELAY, REPEAT_EVERY,
  type KeyEdge, type PadButton, type PadSnapshot,
} from '../src/core/gamepad-map';

let failed = 0, passed = 0;
function check(name: string, ok: boolean, detail?: unknown): void {
  if (ok) passed++;
  else {
    failed++;
    console.log(`FAIL  ${name}${detail === undefined ? '' : '  ' + JSON.stringify(detail)}`);
  }
}
const fmt = (e: KeyEdge[]) => e.map((x) => `${x.type === 'keydown' ? '+' : '-'}${x.code}${x.repeat ? '*' : ''}`).join(' ');

function pad(o: { buttons?: Partial<Record<PadButton, number>>; lx?: number; ly?: number; rx?: number; ry?: number } = {}): PadSnapshot {
  const buttons = new Array(17).fill(0);
  for (const [b, v] of Object.entries(o.buttons ?? {})) buttons[PAD_INDEX[b as PadButton]] = v;
  return { buttons, axes: [o.lx ?? 0, o.ly ?? 0, o.rx ?? 0, o.ry ?? 0] };
}

// keys: Phaser reads keyCode, games read code and key
check('keyInfo Space', JSON.stringify(keyInfo('Space')) === JSON.stringify({ key: ' ', keyCode: 32 }));
check('keyInfo KeyJ', JSON.stringify(keyInfo('KeyJ')) === JSON.stringify({ key: 'j', keyCode: 74 }));
check('keyInfo Digit3', JSON.stringify(keyInfo('Digit3')) === JSON.stringify({ key: '3', keyCode: 51 }));
check('keyInfo Escape', keyInfo('Escape').keyCode === 27 && keyInfo('ArrowLeft').keyCode === 37 && keyInfo('Enter').keyCode === 13);

// press and release edges, once each
{
  const m = new PadMapper();
  let t = 0;
  check('idle: no edges', fmt(m.update(pad(), 'play', t)) === '');
  check('A down -> +Space', fmt(m.update(pad({ buttons: { a: 1 } }), 'play', (t += 16))) === '+Space');
  check('A held -> nothing', fmt(m.update(pad({ buttons: { a: 1 } }), 'play', (t += 16))) === '');
  check('A up -> -Space', fmt(m.update(pad(), 'play', (t += 16))) === '-Space');
  const all = pad({ buttons: { b: 1, x: 1, y: 1, lb: 1, rb: 1, lt: 1, rt: 1, back: 1, start: 1, ls: 1, rs: 1 } });
  check('play mapping', fmt(m.update(all, 'play', (t += 16))) === '+KeyX +KeyJ +KeyK +KeyQ +KeyE +KeyL +KeyZ +KeyM +Escape +KeyC +KeyB', fmt(m.update(pad(), 'play', t)));
}
{
  const m = new PadMapper();
  check('menu: A -> Enter, B -> Escape, Start -> Enter', fmt(m.update(pad({ buttons: { a: 1, b: 1 } }), 'menu', 0)) === '+Enter +Escape');
  m.update(pad(), 'menu', 16);
  check('menu: Start -> Enter', fmt(m.update(pad({ buttons: { start: 1 } }), 'menu', 32)) === '+Enter');
  m.update(pad(), 'menu', 48);
  check('pause: Start -> Escape, A -> Enter', fmt(m.update(pad({ buttons: { start: 1, a: 1 } }), 'pause', 64)) === '+Enter +Escape');
}

// a context change between press and release still releases the key that went down
{
  const m = new PadMapper();
  check('ctx: A in play', fmt(m.update(pad({ buttons: { a: 1 } }), 'play', 0)) === '+Space');
  check('ctx: held across the change', fmt(m.update(pad({ buttons: { a: 1 } }), 'menu', 16)) === '');
  check('ctx: released as Space', fmt(m.update(pad(), 'menu', 32)) === '-Space');
}

// triggers and button hysteresis
{
  const m = new PadMapper();
  check('trigger 0.4: not yet', fmt(m.update(pad({ buttons: { rt: 0.4 } }), 'play', 0)) === '');
  check('trigger 0.6: down', fmt(m.update(pad({ buttons: { rt: 0.6 } }), 'play', 16)) === '+KeyZ');
  check('trigger 0.3: still down (hysteresis)', fmt(m.update(pad({ buttons: { rt: 0.3 } }), 'play', 32)) === '');
  check('trigger 0.2: up', fmt(m.update(pad({ buttons: { rt: 0.2 } }), 'play', 48)) === '-KeyZ');
}

// stick: deadzone, hysteresis, sectors
{
  const m = new PadMapper();
  check('stick 0.3: in the deadzone', fmt(m.update(pad({ lx: 0.3 }), 'play', 0)) === '');
  check('stick 0.4: right', fmt(m.update(pad({ lx: 0.4 }), 'play', 16)) === '+ArrowRight');
  check('stick 0.28: still right', fmt(m.update(pad({ lx: 0.28 }), 'play', 32)) === '');
  check('stick 0.2: released', fmt(m.update(pad({ lx: 0.2 }), 'play', 48)) === '-ArrowRight');
  check('stick 0.3 again: stays off', fmt(m.update(pad({ lx: 0.3 }), 'play', 64)) === '');
  m.update(pad(), 'play', 80);
  check('stick mostly right with a little up: right only', fmt(m.update(pad({ lx: 0.9, ly: -0.3 }), 'play', 96)) === '+ArrowRight');
  check('stick to the diagonal: adds up', fmt(m.update(pad({ lx: 0.7, ly: -0.7 }), 'play', 112)) === '+ArrowUp');
  check('stick back toward right: up holds (hysteresis)', fmt(m.update(pad({ lx: 0.9, ly: -0.35 }), 'play', 128)) === '');
  check('stick right: up lets go', fmt(m.update(pad({ lx: 0.95, ly: -0.2 }), 'play', 144)) === '-ArrowUp');
  check('stick left in one frame: right up, left down', fmt(m.update(pad({ lx: -1 }), 'play', 160)) === '-ArrowRight +ArrowLeft');
  check('stick down', fmt(m.update(pad({ ly: 1 }), 'play', 176)) === '-ArrowLeft +ArrowDown');
  m.update(pad(), 'play', 192);
}

// D-pad and stick share the arrows: one keydown, the key goes up when both are off
{
  const m = new PadMapper();
  check('dpad left', fmt(m.update(pad({ buttons: { left: 1 } }), 'play', 0)) === '+ArrowLeft');
  check('dpad + stick left: no second press', fmt(m.update(pad({ buttons: { left: 1 }, lx: -1 }), 'play', 16)) === '');
  check('dpad off, stick on: still down', fmt(m.update(pad({ lx: -1 }), 'play', 32)) === '');
  check('both off: up', fmt(m.update(pad(), 'play', 48)) === '-ArrowLeft');
}

// a held direction repeats like a keyboard key; buttons do not
{
  const m = new PadMapper();
  let reps = 0;
  m.update(pad({ buttons: { up: 1, a: 1 } }), 'menu', 0);
  for (let t = 16; t <= REPEAT_DELAY + REPEAT_EVERY * 3 + 8; t += 16) {
    const e = m.update(pad({ buttons: { up: 1, a: 1 } }), 'menu', t);
    reps += e.filter((x) => x.repeat).length;
    if (e.some((x) => x.repeat && x.code !== 'ArrowUp')) check('repeat: only the direction', false, fmt(e));
  }
  check('repeat: 4 repeats in delay + 3 intervals', reps === 4, reps);
  check('repeat stops on release', fmt(m.update(pad({ buttons: { a: 1 } }), 'menu', 2000)) === '-ArrowUp');
  check('no repeat after release', fmt(m.update(pad({ buttons: { a: 1 } }), 'menu', 3000)) === '');
}

// overrides: play only, remap or turn off, shared keys counted
{
  const m = new PadMapper({ a: 'KeyW', b: null, rt: 'KeyW' });
  check('override: A -> W', fmt(m.update(pad({ buttons: { a: 1 } }), 'play', 0)) === '+KeyW');
  check('override: RT on the same key, no second press', fmt(m.update(pad({ buttons: { a: 1, rt: 1 } }), 'play', 16)) === '');
  check('override: A up, RT holds W', fmt(m.update(pad({ buttons: { rt: 1 } }), 'play', 32)) === '');
  check('override: RT up, W up', fmt(m.update(pad(), 'play', 48)) === '-KeyW');
  check('override: B off', fmt(m.update(pad({ buttons: { b: 1 } }), 'play', 64)) === '');
  m.update(pad(), 'play', 80);
  check('override: menus keep the core keys', fmt(m.update(pad({ buttons: { a: 1, b: 1 } }), 'menu', 96)) === '+Enter +Escape');
}

// no stuck keys: release everything; held controls stay quiet until they come up
{
  const m = new PadMapper();
  m.update(pad({ buttons: { a: 1, x: 1 }, lx: 1 }), 'play', 0);
  check('releaseAll: every key up', fmt(m.releaseAll()) === '-Space -KeyJ -ArrowRight', m.heldKeys());
  check('releaseAll: nothing held', m.heldKeys().length === 0);
  check('latched: still held, no new press', fmt(m.update(pad({ buttons: { a: 1, x: 1 }, lx: 1 }), 'play', 16)) === '');
  check('latched: X let go, A still held', fmt(m.update(pad({ buttons: { a: 1 }, lx: 1 }), 'play', 32)) === '');
  check('latched: X again presses', fmt(m.update(pad({ buttons: { a: 1, x: 1 }, lx: 1 }), 'play', 48)) === '+KeyJ');
  check('disconnect (null) releases', fmt(m.update(null, 'play', 64)) === '-KeyJ');
  check('after disconnect: a held button presses at once', fmt(m.update(pad({ buttons: { a: 1 } }), 'play', 80)) === '+Space');
}

// analog API
{
  const a0 = analogAxes(pad({ lx: 0.1, ly: 0.1 }));
  check('analog: deadzone', a0.lx === 0 && a0.ly === 0, a0);
  const a1 = analogAxes(pad({ lx: 1 }));
  check('analog: full tilt reaches 1', Math.abs(a1.lx - 1) < 1e-9 && a1.ly === 0, a1);
  const a2 = analogAxes(pad({ rx: 0.5, buttons: { lt: 0.5, rt: 0.02 } }));
  check('analog: rescaled past the deadzone', a2.rx > 0.4 && a2.rx < 0.5 && a2.lt === 0.5 && a2.rt === 0, a2);
  const merged = mergePads([pad({ lx: 0.2, buttons: { a: 1 } }), pad({ lx: -0.8 })]);
  check('merge: strongest axis and button win', merged.axes[0] === -0.8 && merged.buttons[0] === 1, merged);
  check('analog: no pad', JSON.stringify(analogAxes(null)) === JSON.stringify({ lx: 0, ly: 0, rx: 0, ry: 0, lt: 0, rt: 0 }));
}

console.log(`gamepad mapping: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
