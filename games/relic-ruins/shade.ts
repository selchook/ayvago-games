// Relic Ruins: the light and the dark, in the shaders. Every lit material of a level gets two
// additions (onBeforeCompile; the uniforms are shared, one update per frame):
//   - the darkness: beyond the hero's light radius (it shrinks with the torch) and away from every
//     lit brazier, sconce and candle the ruin falls to a dim floor brightness, with a soft edge, so
//     the torch is read at a glance; point lights add the warm colour inside;
//   - the cutaway (walls, wall tops, arches and doors only): fragments between the hero and the
//     camera, above a low stub, are dithered away in a soft-edged tube, so the walled maze never
//     hides the hero.
import { THREE } from '@core/three';

/** Up to this many light pools besides the hero (braziers, sconces, candles, a flare). */
export const POOLS = 8;

export interface DarkUniforms {
  uRRHero: { value: THREE.Vector3 };
  uRRRad: { value: number };
  uRRFloor: { value: number };
  uRRPools: { value: THREE.Vector4[] };
  uRRCam: { value: THREE.Vector3 };
  uRRCut: { value: number };
}

export function darkUniforms(): DarkUniforms {
  return {
    uRRHero: { value: new THREE.Vector3() },
    uRRRad: { value: 8 },
    uRRFloor: { value: 0.2 },
    uRRPools: { value: Array.from({ length: POOLS }, () => new THREE.Vector4(0, 0, 0, 0)) },
    uRRCam: { value: new THREE.Vector3(0, 10, 10) },
    uRRCut: { value: 1.9 },
  };
}

const VERT_HEAD = 'varying vec3 vRRW;\n';
const VERT_BODY = `
  {
    vec4 rrw = vec4( transformed, 1.0 );
    #ifdef USE_INSTANCING
      rrw = instanceMatrix * rrw;
    #endif
    vRRW = ( modelMatrix * rrw ).xyz;
  }
`;
const FRAG_HEAD = `
varying vec3 vRRW;
uniform vec3 uRRHero;
uniform float uRRRad;
uniform float uRRFloor;
uniform vec4 uRRPools[${POOLS}];
uniform vec3 uRRCam;
uniform float uRRCut;
float rrBayer( vec2 p ) {
  ivec2 q = ivec2( mod( p, 4.0 ) );
  int i = q.x + q.y * 4;
  float b[16] = float[16]( 0.0, 8.0, 2.0, 10.0, 12.0, 4.0, 14.0, 6.0, 3.0, 11.0, 1.0, 9.0, 15.0, 7.0, 13.0, 5.0 );
  return ( b[i] + 0.5 ) / 16.0;
}
`;
const FRAG_CUT = `
  #ifdef RR_CUT
  {
    vec3 rrDir = normalize( uRRCam - uRRHero );
    vec3 rrP = vRRW - uRRHero;
    float rrT = dot( rrP, rrDir );
    if ( rrT > 0.3 && vRRW.y > 0.3 ) {
      float rrD = length( rrP - rrDir * rrT );
      float rrK = smoothstep( uRRCut, uRRCut * 0.5, rrD ) * smoothstep( 0.3, 1.3, rrT );
      if ( rrK > rrBayer( gl_FragCoord.xy ) ) discard;
    }
  }
  #endif
`;
const FRAG_DARK = `
  {
    float rrVis = smoothstep( uRRRad, uRRRad * 0.5, length( vRRW.xz - uRRHero.xz ) );
    for ( int i = 0; i < ${POOLS}; i++ ) {
      vec4 L = uRRPools[ i ];
      if ( L.w > 0.0 ) rrVis = max( rrVis, smoothstep( L.z, L.z * 0.4, length( vRRW.xz - L.xy ) ) * L.w );
    }
    gl_FragColor.rgb *= mix( uRRFloor, 1.0, rrVis );
  }
`;

/** Adds the darkness (and the cutaway with `cut`) to a material; it shares `u`. */
export function darken<M extends THREE.Material>(mat: M, u: DarkUniforms, cut = false): M {
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = VERT_HEAD + sh.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\n' + VERT_BODY);
    sh.fragmentShader = (cut ? '#define RR_CUT\n' : '') + FRAG_HEAD + sh.fragmentShader
      .replace('void main() {', 'void main() {\n' + FRAG_CUT)
      .replace('#include <dithering_fragment>', FRAG_DARK + '\n#include <dithering_fragment>');
  };
  mat.customProgramCacheKey = () => (cut ? 'rr-dark-cut' : 'rr-dark');
  return mat;
}
