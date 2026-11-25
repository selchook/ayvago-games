// Dungeon Rescue: light, shadow and the alarm, in the shaders. Every lit material of a level gets
// these additions (onBeforeCompile; the uniforms are shared, one update per frame):
//   - the dark: away from every lit torch, campfire and the Chief's lantern the dungeon falls to a dim
//     floor brightness with a soft edge, so the shadows a knight can hide in read at a glance (they
//     are the same cells where the guards' eyes reach less far);
//   - the alarm: a red pulse over everything while the bell rings;
//   - the cutaway (walls, columns, banners, doors only): fragments between the knight and the camera,
//     above a low stub, are dithered away in a soft-edged tube, so the walls never hide him.
import { THREE } from '@core/three';

/** Up to this many light pools (torches nearest the knight, campfires, the lantern). */
export const POOLS = 12;

export interface ShadeUniforms {
  uDRHero: { value: THREE.Vector3 };
  uDRFloor: { value: number };
  uDRPools: { value: THREE.Vector4[] };
  uDRCam: { value: THREE.Vector3 };
  uDRCut: { value: number };
  uDRAlarm: { value: number };
}

export function shadeUniforms(): ShadeUniforms {
  return {
    uDRHero: { value: new THREE.Vector3() },
    uDRFloor: { value: 0.35 },
    uDRPools: { value: Array.from({ length: POOLS }, () => new THREE.Vector4(0, 0, 0, 0)) },
    uDRCam: { value: new THREE.Vector3(0, 10, 10) },
    uDRCut: { value: 2.1 },
    uDRAlarm: { value: 0 },
  };
}

const VERT_HEAD = 'varying vec3 vDRW;\n';
const VERT_BODY = `
  {
    vec4 drw = vec4( transformed, 1.0 );
    #ifdef USE_INSTANCING
      drw = instanceMatrix * drw;
    #endif
    vDRW = ( modelMatrix * drw ).xyz;
  }
`;
const FRAG_HEAD = `
varying vec3 vDRW;
uniform vec3 uDRHero;
uniform float uDRFloor;
uniform vec4 uDRPools[${POOLS}];
uniform vec3 uDRCam;
uniform float uDRCut;
uniform float uDRAlarm;
float drBayer( vec2 p ) {
  ivec2 q = ivec2( mod( p, 4.0 ) );
  int i = q.x + q.y * 4;
  float b[16] = float[16]( 0.0, 8.0, 2.0, 10.0, 12.0, 4.0, 14.0, 6.0, 3.0, 11.0, 1.0, 9.0, 15.0, 7.0, 13.0, 5.0 );
  return ( b[i] + 0.5 ) / 16.0;
}
`;
const FRAG_CUT = `
  #ifdef DR_CUT
  {
    vec3 drDir = normalize( uDRCam - uDRHero );
    vec3 drP = vDRW - uDRHero;
    float drT = dot( drP, drDir );
    if ( drT > 0.3 && vDRW.y > 0.35 ) {
      float drD = length( drP - drDir * drT );
      float drK = smoothstep( uDRCut, uDRCut * 0.45, drD ) * smoothstep( 0.3, 1.4, drT );
      if ( drK > drBayer( gl_FragCoord.xy ) ) discard;
    }
  }
  #endif
`;
const FRAG_DARK = `
  {
    float drVis = 0.0;
    for ( int i = 0; i < ${POOLS}; i++ ) {
      vec4 L = uDRPools[ i ];
      if ( L.w > 0.0 ) drVis = max( drVis, smoothstep( L.z, L.z * 0.35, length( vDRW.xz - L.xy ) ) * L.w );
    }
    // the knight always sees a little round himself
    drVis = max( drVis, smoothstep( 3.2, 0.8, length( vDRW.xz - uDRHero.xz ) ) * 0.55 );
    gl_FragColor.rgb *= mix( uDRFloor, 1.0, drVis );
    gl_FragColor.rgb = mix( gl_FragColor.rgb, gl_FragColor.rgb * vec3( 1.35, 0.42, 0.38 ) + vec3( 0.05, 0.0, 0.0 ), uDRAlarm );
  }
`;

/** Adds the dark and the alarm (and the cutaway with `cut`) to a material; it shares `u`. */
export function shade<M extends THREE.Material>(mat: M, u: ShadeUniforms, cut = false): M {
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = VERT_HEAD + sh.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\n' + VERT_BODY);
    sh.fragmentShader = (cut ? '#define DR_CUT\n' : '') + FRAG_HEAD + sh.fragmentShader
      .replace('void main() {', 'void main() {\n' + FRAG_CUT)
      .replace('#include <dithering_fragment>', FRAG_DARK + '\n#include <dithering_fragment>');
  };
  mat.customProgramCacheKey = () => (cut ? 'dr-shade-cut' : 'dr-shade');
  return mat;
}
