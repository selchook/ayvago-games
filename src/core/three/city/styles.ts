// City generator: the city styles. A style sets the layout (size, water, ring road, diagonals,
// grid zones, curvy streets, block sizes), the district mix, how tall downtown grows, the
// colour palettes and the default look (time of day). Pure data.
import type { DistrictKind, StyleId } from './types';

export type LookId = 'day' | 'golden' | 'night' | 'overcast';

export interface StyleDef {
  id: StyleId;
  name: { en: string; tr: string };
  size: number;
  water: 'river' | 'coast' | 'both' | 'none';
  riverWidth: [number, number];
  ring: boolean;
  /** Diagonal avenues from the centre. */
  diagonals: number;
  /** Grid zones with their own angle (Voronoi cells; their borders become avenues). */
  zones: number;
  /** Degrees between the zones' grid angles. */
  angleSpread: number;
  /** Curvy local streets: amplitude in metres (0 = straight). */
  curvy: number;
  /** Bridges per river. */
  bridges: number;
  /** Block size [along, across] in metres per district. */
  spacing: Record<DistrictKind, [number, number]>;
  weights: Record<DistrictKind, number>;
  /** Downtown radius as a share of the size. */
  downtown: number;
  towerMax: number;
  /** Share of local street segments dropped (bigger blocks, T junctions). */
  drop: number;
  culdesacs: number;
  alleys: number;
  roundabouts: number;
  trees: 'leafy' | 'palm' | 'mixed' | 'conifer';
  palette: Record<DistrictKind, number[]>;
  roofs: number[];
  look: LookId;
  /** Ground colour outside the city. */
  terrain: number;
  beach: boolean;
}

const PAL_DOWNTOWN = [0x8a9bb0, 0x6f8196, 0xa9b4bf, 0x56677a, 0xc2c6c9, 0x7d8c8a, 0x9fa9b8, 0xb5a998];
const PAL_COMMERCIAL = [0xd9c7a7, 0xc48a6a, 0xe0d6c4, 0xa7b7c4, 0xcfa98c, 0xbfc9a9, 0xe3c9a0];
const PAL_RESIDENTIAL = [0xa8553f, 0x9c6b4e, 0xc9a07a, 0xb97f5c, 0xd8c3a0, 0x8f5a48, 0xbda58a];
const PAL_SUBURB = [0xf2e6d0, 0xdfe8ec, 0xf3d9b1, 0xcfe0c8, 0xf0c9c0, 0xe8e2d4, 0xb9cfe0, 0xe6d3a8];
const PAL_INDUSTRIAL = [0x8b8d8f, 0x9a8f7f, 0x6f7a80, 0xa39a8a, 0x7d6b5c, 0x8f7660];
const PAL_DOCKS = [0x5f7a8c, 0x8c5f4a, 0x7a8a6a, 0x8f8f86];

const base = {
  riverWidth: [60, 90] as [number, number],
  angleSpread: 25,
  curvy: 0,
  bridges: 4,
  spacing: {
    downtown: [96, 72], commercial: [120, 80], residential: [130, 70], suburban: [170, 75],
    industrial: [190, 140], docks: [180, 130], park: [160, 120],
  } as Record<DistrictKind, [number, number]>,
  drop: 0.08,
  culdesacs: 0.2,
  alleys: 0.5,
  roundabouts: 1,
  palette: {
    downtown: PAL_DOWNTOWN, commercial: PAL_COMMERCIAL, residential: PAL_RESIDENTIAL, suburban: PAL_SUBURB,
    industrial: PAL_INDUSTRIAL, docks: PAL_DOCKS, park: PAL_COMMERCIAL,
  } as Record<DistrictKind, number[]>,
  roofs: [0x8a3b2e, 0x5a5f66, 0x6b4a3a, 0x3f4a55, 0x9a5b3f, 0x7a7f86],
  terrain: 0x6f8f4e,
  beach: false,
};

export const STYLES: Record<StyleId, StyleDef> = {
  metropolis: {
    ...base,
    id: 'metropolis',
    name: { en: 'Neon Metropolis', tr: 'Neon Metropol' },
    size: 2000,
    water: 'river',
    riverWidth: [70, 100],
    ring: true,
    diagonals: 2,
    zones: 3,
    bridges: 5,
    weights: { downtown: 1.6, commercial: 1.2, residential: 1.2, suburban: 0.5, industrial: 0.8, docks: 0.8, park: 1 },
    downtown: 0.2,
    towerMax: 230,
    alleys: 0.7,
    trees: 'leafy',
    look: 'night',
  },
  coast: {
    ...base,
    id: 'coast',
    name: { en: 'Sunny Coast Town', tr: 'Güneşli Sahil Kasabası' },
    size: 1400,
    water: 'coast',
    ring: false,
    diagonals: 1,
    zones: 2,
    angleSpread: 18,
    curvy: 10,
    bridges: 2,
    weights: { downtown: 0.6, commercial: 1.3, residential: 1.1, suburban: 1.2, industrial: 0.25, docks: 1, park: 1.2 },
    downtown: 0.14,
    towerMax: 60,
    trees: 'palm',
    palette: {
      ...base.palette,
      downtown: [0xf4efe6, 0xe9dccb, 0xd6e4ea, 0xf1e1c6, 0xcfd9d6],
      commercial: [0xf6e7cf, 0xf2d0b8, 0xd9ecf0, 0xfbf3e4, 0xe8c9a6, 0xc9e3d6],
      residential: [0xf3e9dc, 0xeed7c0, 0xdbe9ef, 0xf5ddd2, 0xe9e3c8],
      suburban: [0xfaf3e6, 0xf2dcc6, 0xdcecf2, 0xf7e1d9, 0xe5efdc, 0xf6e9c4],
    },
    roofs: [0xb4583a, 0xc0683f, 0xa5492f, 0x9e5a3c, 0xc77b4a],
    look: 'day',
    terrain: 0x9aa45e,
    beach: true,
  },
  industrial: {
    ...base,
    id: 'industrial',
    name: { en: 'Old Industrial', tr: 'Eski Sanayi Şehri' },
    size: 1600,
    water: 'river',
    riverWidth: [80, 110],
    ring: false,
    diagonals: 1,
    zones: 3,
    angleSpread: 12,
    bridges: 4,
    weights: { downtown: 0.7, commercial: 0.8, residential: 1.4, suburban: 0.3, industrial: 2.2, docks: 1.6, park: 0.6 },
    downtown: 0.12,
    towerMax: 70,
    drop: 0.12,
    culdesacs: 0.05,
    alleys: 0.8,
    roundabouts: 0,
    trees: 'mixed',
    palette: {
      ...base.palette,
      downtown: [0x9c5a44, 0x8a6a55, 0xb08a6a, 0x7a5a4a, 0xa89a88],
      commercial: [0xa0553f, 0xb7774f, 0x8a5a44, 0xc4a27e, 0x9a7a62],
      residential: [0x99493a, 0x8a4d3c, 0xa8623f, 0x7f4a3a, 0xb08060],
    },
    look: 'golden',
    terrain: 0x7d8656,
  },
  suburbia: {
    ...base,
    id: 'suburbia',
    name: { en: 'Suburbia', tr: 'Banliyö' },
    size: 1500,
    water: 'none',
    ring: false,
    diagonals: 1,
    zones: 3,
    angleSpread: 35,
    curvy: 22,
    bridges: 2,
    weights: { downtown: 0.35, commercial: 0.9, residential: 0.6, suburban: 2.6, industrial: 0.25, docks: 0, park: 1.4 },
    downtown: 0.1,
    towerMax: 45,
    drop: 0.12,
    culdesacs: 0.7,
    alleys: 0.2,
    trees: 'leafy',
    look: 'day',
    terrain: 0x6f9a4a,
  },
  harbor: {
    ...base,
    id: 'harbor',
    name: { en: 'Harbor City', tr: 'Liman Şehri' },
    size: 1800,
    water: 'both',
    riverWidth: [60, 80],
    ring: true,
    diagonals: 1,
    zones: 3,
    bridges: 3,
    weights: { downtown: 1.3, commercial: 1.1, residential: 1.2, suburban: 0.7, industrial: 0.9, docks: 1.8, park: 1 },
    downtown: 0.17,
    towerMax: 170,
    trees: 'mixed',
    look: 'golden',
    terrain: 0x7a8f56,
  },
};

export const STYLE_IDS = Object.keys(STYLES) as StyleId[];
