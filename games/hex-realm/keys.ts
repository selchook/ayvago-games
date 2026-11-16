// Hex Realm: model keys (no three.js here, so the headless simulation can use them).
export const heroKey = (cls: string): string => 'hero:' + cls;
export const pirateKey = (m: string): string => 'pk:' + m;
export const retroKey = (m: string): string => 'rf:' + m;
export const hexKey = (m: string): string => 'hx:' + m;

/** A placed model (merged into a world mesh). */
export interface Placed { key: string; x: number; y: number; z: number; rot: number; s: number; sy?: number; tilt?: number; hex?: number }
