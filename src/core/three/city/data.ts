// The city generator's pure-data half: layout, queries, traffic, minimap. No three.js, so it
// runs headless (Node tests, bots, workers). index.ts re-exports all of it plus CityView.
export { generateCity, planHash, planStats, terrainOf, PLAN_VERSION } from './layout';
export { kitLayout, kitDoors, KIT_PIECES, KIT_FLOOR, KIT_BAY, type KitLayout, type KitPiece } from './kit';
export { walkAreas, doors, parkingSpots, vehicleLanes, spawnAt, type WalkArea, type WalkKind } from './world';
export { TERRAIN, type Terrain, type TerrainParams } from './terrain';
export { cityQuery, CityQuery, type RoadHit, type LaneHit, type Surface } from './query';
export { signalState } from './traffic';
export { minimapRaster, minimapVector, drawMinimap, rasterImage, MAP, MAP_COLOURS, type MinimapRaster, type MinimapVector } from './minimap';
export { STYLES, STYLE_IDS, type StyleDef, type LookId } from './styles';
export { LOOKS, LOOK_IDS, type Look } from './look';
export * from './types';
