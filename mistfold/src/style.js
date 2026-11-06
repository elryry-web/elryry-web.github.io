// The illustrated look: hand-drawn surface detail (stone courses, planks, thatch, leaf clumps, cobbles)
// and ink linework, added to the vertex-painted material. Patterns live in the object's own space so they
// stay put on things that move. Each painted part carries `style` = (kind, seed).
// A land can also wear a painting (see paint.js): wherever a surface is where it was when the painting
// was made, it shows the painting instead of its own shading.
import * as THREE from 'three';

export const TEX = { plain: 0, stone: 1, wood: 2, thatch: 3, leaf: 4, bark: 5, tile: 6, rock: 8, ground: 10 };

const COMMON = /* glsl */`
varying vec2 vStyle;
varying vec3 vOP;
varying vec3 vON;
float sty_h1(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
vec2 sty_h2(vec2 p) { return fract(sin(vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)))) * 43758.5453); }
vec3 sty_h3(vec3 p) { return fract(sin(vec3(dot(p, vec3(127.1, 311.7, 74.7)), dot(p, vec3(269.5, 183.3, 246.1)), dot(p, vec3(113.5, 271.9, 124.6)))) * 43758.5453); }
float sty_vn(vec2 p) {
  vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(sty_h1(i), sty_h1(i + vec2(1, 0)), u.x), mix(sty_h1(i + vec2(0, 1)), sty_h1(i + vec2(1, 1)), u.x), u.y);
}
// cells: x = distance to the centre, y = distance to the nearest border (roughly), z = the cell's random id
vec3 sty_vor(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  float d1 = 8.0, d2 = 8.0, id = 0.0;
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec2 g = vec2(float(x), float(y));
    vec2 r = g + sty_h2(i + g) * 0.8 + 0.1 - f;
    float d = dot(r, r);
    if (d < d1) { d2 = d1; d1 = d; id = sty_h1(i + g); } else if (d < d2) d2 = d;
  }
  d1 = sqrt(d1); d2 = sqrt(d2);
  return vec3(d1, (d2 - d1) * 0.5, id);
}
// as above in 3D; w = how far the cell's centre sits above this point (so the lower rim can be told apart)
vec4 sty_vor3(vec3 p) {
  vec3 i = floor(p), f = fract(p);
  float d1 = 8.0, d2 = 8.0, id = 0.0, up = 0.0;
  for (int z = -1; z <= 1; z++) for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec3 g = vec3(float(x), float(y), float(z));
    vec3 h = sty_h3(i + g);
    vec3 r = g + h * 0.8 + 0.1 - f;
    float d = dot(r, r);
    if (d < d1) { d2 = d1; d1 = d; id = h.x; up = r.y; } else if (d < d2) d2 = d;
  }
  d1 = sqrt(d1); d2 = sqrt(d2);
  return vec4(d1, (d2 - d1) * 0.5, id, up);
}
`;

const SURFACE = /* glsl */`
float sInk = 0.0;
{
  float kind = floor(vStyle.x + 0.5);
  vec3 an = abs(normalize(vON));
  vec2 uv; bool top = false;
  if (an.y > an.x && an.y > an.z) { uv = vOP.xz; top = true; }
  else if (an.x > an.z) uv = vOP.zy; else uv = vOP.xy;
  float shade = 1.0;
  if (kind == 1.0) {
    // dressed stone: courses of blocks on the sides, flagstones on top
    if (top) {
      vec3 v = sty_vor(uv * 2.2);
      sInk = 1.0 - smoothstep(0.025, 0.07, v.y);
      shade = 0.84 + 0.28 * v.z;
    } else {
      float bh = 0.3, bw = 0.5;
      float row = floor(uv.y / bh);
      float u = uv.x / bw + row * 0.47 + sty_h1(vec2(row, 3.1)) * 0.4;
      float cell = floor(u);
      float fv = fract(uv.y / bh);
      float e = min(min(fract(u), 1.0 - fract(u)) * bw, min(fv, 1.0 - fv) * bh) + (sty_vn(uv * 11.0) - 0.5) * 0.025;
      sInk = (1.0 - smoothstep(0.008, 0.022, e)) * 0.85;
      shade = (0.92 + 0.26 * sty_h1(vec2(cell, row))) * (0.95 + 0.14 * smoothstep(0.4, 0.95, fv));
      sInk = max(sInk, smoothstep(0.82, 0.92, sty_vn(uv * 7.0 + cell)) * 0.35);
    }
  } else if (kind == 8.0) {
    // boulders: a few cracks and lichen speckle
    vec4 v = sty_vor3(vOP * 1.8 + vStyle.y);
    sInk = (1.0 - smoothstep(0.015, 0.05, v.y)) * step(0.35, v.z) * 0.8;
    shade = 0.86 + 0.24 * v.z;
    sInk = max(sInk, step(0.93, sty_h1(floor(vOP.xz * 22.0 + vOP.y * 9.0))) * 0.4);
  } else if (kind == 2.0) {
    // planks, with grain and the odd knot
    float pw = 0.24, pu = uv.x / pw, pc = floor(pu);
    float e = min(fract(pu), 1.0 - fract(pu)) * pw;
    float grain = sty_vn(vec2(uv.x * 20.0, uv.y * 1.6 + pc * 7.0));
    sInk = max(1.0 - smoothstep(0.007, 0.02, e), smoothstep(0.76, 0.9, grain) * 0.35);
    shade = (0.84 + 0.22 * sty_h1(vec2(pc, 1.0))) * (0.9 + 0.2 * grain);
  } else if (kind == 3.0) {
    // thatch: overlapping layers of straw strokes
    vec2 tu = vec2(vOP.x + vOP.z, vOP.y);
    float lay = tu.y / 0.26, fl = fract(lay);
    float st = sty_vn(vec2(tu.x * 28.0 + floor(lay) * 3.7, tu.y * 2.5));
    shade = mix(0.62, 1.12, smoothstep(0.0, 0.6, fl)) * (0.84 + 0.3 * st);
    sInk = max(smoothstep(0.72, 0.88, 1.0 - st) * 0.4, (1.0 - smoothstep(0.0, 0.07, fl)) * 0.55);
  } else if (kind == 6.0) {
    // roof tiles in rows, each lapping the one below
    vec2 tu = vec2(vOP.x + vOP.z, vOP.y);
    float rh = 0.2, row = floor(tu.y / rh), fv = fract(tu.y / rh);
    float u = tu.x / 0.24 + row * 0.5, cell = floor(u);
    float e = min(fract(u), 1.0 - fract(u)) * 0.24;
    shade = (0.82 + 0.28 * sty_h1(vec2(cell, row))) * mix(0.72, 1.1, smoothstep(0.0, 0.7, fv));
    sInk = max((1.0 - smoothstep(0.0, 0.1, fv)) * 0.75, (1.0 - smoothstep(0.006, 0.018, e)) * 0.5);
  } else if (kind == 5.0) {
    // bark: long ropey furrows
    float a = atan(vOP.z, vOP.x) * 0.45;
    float s = sty_vn(vec2(a * 9.0, vOP.y * 1.3 + vStyle.y));
    sInk = smoothstep(0.62, 0.8, s) * 0.75;
    shade = 0.82 + 0.3 * (1.0 - s);
  } else if (kind == 4.0) {
    // foliage: clumps of leaves, each lit on its crown and inked along its lower edge
    vec4 v = sty_vor3(vOP * 1.9 + vStyle.y);
    float under = smoothstep(-0.25, 0.3, v.w);
    // a round clump inside each cell; what's outside it reads as the shadowed gaps between clumps
    float body = 1.0 - smoothstep(0.42, 0.5, v.x);
    shade = (0.9 + 0.25 * v.z) * mix(1.22, 0.8, under) * mix(0.72, 1.0, body);
    float arc = smoothstep(0.36, 0.42, v.x) * (1.0 - smoothstep(0.46, 0.53, v.x));
    sInk = max(arc * under, (1.0 - smoothstep(0.015, 0.05, v.y)) * 0.4) * 0.75;
    diffuseColor.rgb *= mix(vec3(1.1, 1.04, 0.78), vec3(0.9, 1.0, 1.06), v.z);
  } else if (kind == 10.0) {
    vec2 w = vOP.xz;
    float dab = sty_vn(w * 1.2) * 0.6 + sty_vn(w * 3.7) * 0.4;
    shade = 0.86 + 0.26 * dab;
    if (an.y < 0.62) {
      // cliff faces: strata and cracks
      float band = fract(vOP.y * 1.6 + sty_vn(w * 0.8) * 0.8);
      sInk = (1.0 - smoothstep(0.0, 0.09, band)) * 0.7;
      vec3 v = sty_vor(vec2(w.x + w.y, vOP.y) * 1.4);
      sInk = max(sInk, (1.0 - smoothstep(0.015, 0.05, v.y)) * 0.6);
      shade *= 0.85 + 0.25 * v.z;
    } else {
      float green = smoothstep(0.0, 0.08, diffuseColor.g - diffuseColor.r);
      // grass ticks
      vec2 gp = w * 3.2, gc = floor(gp);
      vec2 gf = fract(gp) - 0.5 - (sty_h2(gc) - 0.5) * 0.5;
      float ga = sty_h1(gc + 7.0) * 1.2 - 0.6;
      float along = gf.x * sin(ga) + gf.y * cos(ga), across = gf.x * cos(ga) - gf.y * sin(ga);
      float tick = (1.0 - smoothstep(0.02, 0.045, abs(across))) * (1.0 - smoothstep(0.12, 0.2, abs(along))) * step(0.45, sty_h1(gc));
      sInk = tick * 0.3 * green;
      // paved paths: cobbles, thinning out toward the verges
      float pave = vStyle.y;
      if (pave > 0.02) {
        vec3 v = sty_vor(w * 2.1);
        float cob = smoothstep(0.3, 0.7, pave + (v.z - 0.5) * 0.5);
        vec3 stone = mix(diffuseColor.rgb, vec3(0.46, 0.4, 0.33), 0.35) * (0.78 + 0.42 * v.z) * mix(1.12, 0.88, smoothstep(0.0, 0.4, v.x));
        diffuseColor.rgb = mix(diffuseColor.rgb, stone, cob);
        sInk = mix(sInk, 1.0 - smoothstep(0.02, 0.075, v.y), cob);
      }
    }
  }
  diffuseColor.rgb *= shade;
}
`;

// After lighting: ink is laid on top, a little heavier where the surface is in shadow.
const INK_OUT = /* glsl */`
{
  float lum = dot(outgoingLight, vec3(0.3, 0.59, 0.11));
  float k = clamp(sInk, 0.0, 1.0) * mix(1.0, 0.6, smoothstep(0.15, 0.7, lum));
  outgoingLight = mix(outgoingLight, vec3(0.032, 0.018, 0.012), k * 0.85);
}
#include <opaque_fragment>`;

// ----- the land's painting -----
// paintVP is the painting camera's view-projection; paintDepth holds what it saw, so anything that wasn't
// there when it was painted (people, monsters, a house built since) keeps its own look.
export const PAINT = {
  paintOn: { value: 0 },
  paintMap: { value: null },
  paintDepth: { value: null },
  paintVP: { value: new THREE.Matrix4() },
  paintTexel: { value: new THREE.Vector2(1, 1) },
  paintTol: { value: 0.003 },
  paintTint: { value: new THREE.Color(1, 1, 1) },
};
const PAINT_FRAG = /* glsl */`
uniform float paintOn;
uniform sampler2D paintMap;
uniform sampler2D paintDepth;
uniform mat4 paintVP;
uniform vec2 paintTexel;
uniform float paintTol;
uniform vec3 paintTint;
varying vec3 vWP;
`;
const PAINT_TEST = /* glsl */`
float sPaint = 0.0; vec3 sPaintCol = vec3(0.0);
if (paintOn > 0.5) {
  vec4 pc = paintVP * vec4(vWP, 1.0);
  vec2 puv = pc.xy * 0.5 + 0.5;
  if (puv.x > 0.0 && puv.y > 0.0 && puv.x < 1.0 && puv.y < 1.0) {
    float fd = pc.z * 0.5 + 0.5, best = 1.0;
    // the nearest few texels, so edges don't fray
    for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) best = min(best, abs(texture2D(paintDepth, puv + vec2(float(i), float(j)) * paintTexel).r - fd));
    if (best < paintTol) { sPaint = 1.0; sPaintCol = texture2D(paintMap, puv).rgb * paintTint; }
  }
}
`;
// painted pixels go out with alpha 0, which tells the post pass to leave them alone
const PAINT_OUT = /* glsl */`
if (sPaint > 0.5) gl_FragColor = vec4(sPaintCol, 0.0);`;

// Teach a Lambert material to wear the painting. `surface` runs after the test, `out` replaces the output.
export function addPaint(sh, { surface = '', out = '#include <opaque_fragment>' } = {}) {
  Object.assign(sh.uniforms, PAINT);
  sh.vertexShader = 'varying vec3 vWP;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
    #ifdef USE_INSTANCING
      vWP = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;
    #else
      vWP = (modelMatrix * vec4(transformed, 1.0)).xyz;
    #endif`);
  sh.fragmentShader = PAINT_FRAG + sh.fragmentShader
    .replace('#include <color_fragment>', '#include <color_fragment>\n' + PAINT_TEST + surface)
    .replace('#include <opaque_fragment>', out + PAINT_OUT);
}

export function stylize(mat) {
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = 'attribute vec2 style;\n' + COMMON + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvStyle = style; vOP = position; vON = normal;');
    sh.fragmentShader = COMMON + sh.fragmentShader;
    addPaint(sh, { surface: SURFACE, out: INK_OUT });
  };
  mat.customProgramCacheKey = () => 'mistfold-style';
  return mat;
}
