// Hex Realm: model keys (no three.js here, so the headless simulation can use them).
export const heroKey = (cls: string): string => 'hero:' + cls;
export const pirateKey = (m: string): string => 'pk:' + m;
export const hexKey = (m: string): string => 'hx:' + m;
/** 1.3: the battle scenery: Quaternius Medieval Village MegaKit pieces and Ultimate Nature Pack models (scenery.ts). */
export const villageKey = (m: string): string => 'mv:' + m;
export const natureKey = (m: string): string => 'nt:' + m;

/** A placed model (merged into a world mesh). `tint` multiplies its colours (scenery only). */
export interface Placed { key: string; x: number; y: number; z: number; rot: number; s: number; sy?: number; tilt?: number; hex?: number; tint?: number }
