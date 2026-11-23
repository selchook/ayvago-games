// Procedural 3D city generator for the Ayvago 3D runtime. Opt-in: import from '@core/three'
// (or '@core/three/city' in a plain three.js page); nothing in @core imports it.
//
//   const plan = generateCity({ seed: 42, style: 'metropolis' });   // pure data, deterministic
//   const q = cityQuery(plan);                                        // roadAt, nearestLane, lotAt …
//   const view = new CityView(plan, world.scene, { look: 'night' });  // chunked streaming
//   world.onFrame = (dt) => view.update(player.position, world.camera, dt);
//
// docs/city-generator.md explains the plan data, streaming, looks and budgets.
export * from './data';
export { CityView, LOOK_HOURS, type CityViewOptions, type CityViewStats, type ChunkEvent } from './view';
export { CityKit, KitLayer, CITY_KIT_ASSET } from './kitview';
export { daylightAt, makeDaylight, phaseAt, SUNRISE, SUNSET, type DayPhase, type Daylight } from './daylight';
export { CityBuilder } from './build';
