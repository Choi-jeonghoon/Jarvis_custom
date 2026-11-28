import { useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import {
  AdditiveBlending,
  BufferGeometry,
  CanvasTexture,
  Color,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  NoToneMapping,
  PlaneGeometry,
  ShaderMaterial,
  SpriteMaterial,
  Vector2,
  Vector3,
} from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

/*
 * A holographic AI core, built in layers from the inside out:
 *
 *   core      white-hot center, gyroscope rings, fast inner sparks
 *   panels    translucent rectangular "circuit blocks" inside the sphere
 *   ribbons   multi-strand bands wrapped around the core, carrying a ripple
 *   shell     glowing arc fragments + short "chips" on the sphere surface,
 *             denser on the left, with flares breaking out of the left edge
 *   sparks    points orbiting the sphere (energy in transit)
 *
 * Every line carries a traveling glint so energy visibly flows, and a bloom
 * pass turns the thin geometry into light.
 */

export type OrbStatus = 'idle' | 'listening' | 'thinking' | 'speaking';

/**
 * Per-state behaviour.
 * spin   speed of rotation and energy flow
 * glow   overall intensity
 * pulse  fast flutter (voice)
 * breath slow inhale/exhale amplitude
 * tint   multiplies the gold palette (1,1,1 = gold)
 * bloom  bloom strength
 */
const STATE: Record<
  OrbStatus,
  { spin: number; glow: number; pulse: number; breath: number; tint: [number, number, number]; bloom: number }
> = {
  idle: { spin: 1, glow: 0.85, pulse: 0, breath: 0.012, tint: [1, 1, 1], bloom: 0.7 },
  listening: { spin: 1.25, glow: 1, pulse: 0.01, breath: 0.01, tint: [1, 1.1, 1.28], bloom: 0.8 },
  thinking: { spin: 2.1, glow: 0.95, pulse: 0, breath: 0.05, tint: [1, 0.55, 0.26], bloom: 0.85 },
  speaking: { spin: 1.5, glow: 1.1, pulse: 0.026, breath: 0.01, tint: [1.05, 1, 0.85], bloom: 0.95 },
};
const BREATH_HZ = 0.25;
const R = 2; // shell radius

// Palette (three converts these sRGB hex values to linear for lighting math).
const GOLD = new Color('#ffa928');
const AMBER = new Color('#ff8414');
const FLARE = new Color('#ffd27a');
const HOT = new Color('#fff0cf');
const EMBER = new Color('#c2560e');

// ── helpers ────────────────────────────────────────────────────────────────

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function onSphere(r: number, theta: number, phi: number): Vector3 {
  return new Vector3(r * Math.sin(phi) * Math.cos(theta), r * Math.cos(phi), r * Math.sin(phi) * Math.sin(theta));
}

function pickTone(rand: () => number): Color {
  const t = rand();
  return t < 0.05 ? HOT : t < 0.17 ? FLARE : t < 0.62 ? GOLD : t < 0.88 ? AMBER : EMBER;
}

/** Density bias toward the viewer's left (x < 0), like the reference. */
function leftBias(x: number, r: number) {
  const u = x / r; // -1 … 1
  return 0.45 + 0.55 * Math.min(1, Math.max(0, (0.35 - u) / 1.2));
}

/** Accumulates line segments with per-vertex color, progress and seed. */
class LineBuilder {
  pos: number[] = [];
  col: number[] = [];
  prog: number[] = [];
  seed: number[] = [];
  /** Adds a polyline as segments; progress runs 0 → 1 along it. */
  poly(points: Vector3[], color: Color, brightness: number, seed: number) {
    const n = points.length - 1;
    for (let i = 0; i < n; i++) {
      const a = points[i];
      const b = points[i + 1];
      this.pos.push(a.x, a.y, a.z, b.x, b.y, b.z);
      for (let k = 0; k < 2; k++) {
        this.col.push(color.r * brightness, color.g * brightness, color.b * brightness);
        this.seed.push(seed);
      }
      this.prog.push(i / n, (i + 1) / n);
    }
  }
  geometry() {
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(this.pos, 3));
    g.setAttribute('aColor', new Float32BufferAttribute(this.col, 3));
    g.setAttribute('aProg', new Float32BufferAttribute(this.prog, 1));
    g.setAttribute('aSeed', new Float32BufferAttribute(this.seed, 1));
    return g;
  }
}

// ── shaders ────────────────────────────────────────────────────────────────

/** Depth cue shared by every layer: the far side of the sphere is dimmer. */
const FRONT = /* glsl */ `
  vec3 center = (modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  vFront = clamp((mv.z - center.z) / 4.4 + 0.5, 0.0, 1.0);
`;

const FLOW_VERT = /* glsl */ `
  attribute vec3 aColor;
  attribute float aProg;
  attribute float aSeed;
  varying vec3 vColor;
  varying float vProg;
  varying float vSeed;
  varying float vFront;
  void main() {
    vColor = aColor; vProg = aProg; vSeed = aSeed;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    ${FRONT}
    gl_Position = projectionMatrix * mv;
  }
`;

/** Lines with a bright glint traveling along each one. */
const FLOW_FRAG = /* glsl */ `
  uniform float uTime;
  uniform float uFlick;
  uniform float uGlow;
  uniform float uBase;
  uniform float uPulse;
  uniform float uFlowRate;
  uniform vec3 uTint;
  varying vec3 vColor;
  varying float vProg;
  varying float vSeed;
  varying float vFront;
  void main() {
    float head = fract(uTime * uFlowRate * (0.35 + vSeed) + vSeed * 13.7) * 1.6 - 0.3;
    float d = vProg - head;
    float glint = exp(-d * d * 260.0) + 0.35 * exp(-d * d * 30.0) * step(d, 0.0);
    float flick = 0.72 + 0.28 * sin(uFlick * (2.0 + vSeed * 7.0) + vSeed * 61.0);
    float depth = mix(0.28, 1.0, vFront);
    vec3 c = vColor * uTint * (uBase * flick + glint * uPulse) * depth * uGlow;
    gl_FragColor = vec4(c, 1.0);
  }
`;

/** Short glowing rectangles ("chips") laid on a surface. */
const CHIP_VERT = /* glsl */ `
  attribute vec3 aColor;
  attribute float aSeed;
  varying vec3 vColor;
  varying float vSeed;
  varying float vFront;
  varying vec2 vUv;
  void main() {
    vColor = aColor; vSeed = aSeed; vUv = uv;
    vec4 mv = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
    ${FRONT}
    gl_Position = projectionMatrix * mv;
  }
`;
const CHIP_FRAG = /* glsl */ `
  uniform float uFlick;
  uniform float uGlow;
  uniform float uBase;
  uniform vec3 uTint;
  varying vec3 vColor;
  varying float vSeed;
  varying float vFront;
  varying vec2 vUv;
  float hash(float n) { return fract(sin(n) * 43758.5453); }
  void main() {
    float steady = 0.62 + 0.38 * sin(uFlick * (1.2 + vSeed * 5.0) + vSeed * 90.0);
    // Occasional data blink: a chip flares for a moment, then settles.
    float blink = step(0.965, hash(floor(uFlick * 4.0 + vSeed * 97.0) + vSeed * 13.0));
    float ends = smoothstep(0.0, 0.18, vUv.x) * smoothstep(1.0, 0.82, vUv.x);
    float depth = mix(0.22, 1.0, vFront);
    vec3 c = vColor * uTint * (steady + blink * 1.6) * ends * depth * uBase * uGlow;
    gl_FragColor = vec4(c, 1.0);
  }
`;

/** Points that orbit on tilted circles, computed on the GPU. */
const SPARK_VERT = /* glsl */ `
  attribute vec4 aOrbit;   // theta0, speed, radius, size
  attribute vec2 aAxis;    // tilt about x, tilt about z
  attribute vec3 aColor;
  uniform float uTime;
  uniform float uPixelRatio;
  varying vec3 vColor;
  varying float vFront;
  void main() {
    vColor = aColor;
    float th = aOrbit.x + uTime * aOrbit.y;
    vec3 p = vec3(cos(th) * aOrbit.z, 0.0, sin(th) * aOrbit.z);
    float cx = cos(aAxis.x), sx = sin(aAxis.x);
    p = vec3(p.x, p.y * cx - p.z * sx, p.y * sx + p.z * cx);
    float cz = cos(aAxis.y), sz = sin(aAxis.y);
    p = vec3(p.x * cz - p.y * sz, p.x * sz + p.y * cz, p.z);
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    ${FRONT}
    gl_PointSize = aOrbit.w * uPixelRatio * (40.0 / -mv.z);
    gl_Position = projectionMatrix * mv;
  }
`;
const SPARK_FRAG = /* glsl */ `
  uniform float uGlow;
  uniform vec3 uTint;
  varying vec3 vColor;
  varying float vFront;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float a = smoothstep(0.5, 0.0, d);
    gl_FragColor = vec4(vColor * uTint * a * a * mix(0.3, 1.0, vFront) * uGlow * 0.9, 1.0);
  }
`;

/** Ribbon strands displaced by a traveling wave — the "water ripple" band. */
const RIBBON_VERT = /* glsl */ `
  attribute float aS;       // 0..1 along the band
  attribute float aStrand;  // 0..1 across the band
  attribute vec3 aNormal;   // displacement direction
  uniform float uTime;
  uniform float uAmp;
  uniform float uFreq;
  varying float vS;
  varying float vStrand;
  varying float vWave;
  varying float vFront;
  void main() {
    vS = aS; vStrand = aStrand;
    float ph = aS * 6.2831 * uFreq - uTime * 1.6 + aStrand * 2.4;
    float w = sin(ph) + 0.45 * sin(ph * 2.3 + uTime * 0.9 + aStrand * 5.0);
    vWave = w;
    vec3 p = position + aNormal * w * uAmp * (0.35 + aStrand);
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    ${FRONT}
    gl_Position = projectionMatrix * mv;
  }
`;
const RIBBON_FRAG = /* glsl */ `
  uniform float uGlow;
  uniform float uBase;
  uniform vec3 uColor;
  uniform vec3 uTint;
  varying float vS;
  varying float vStrand;
  varying float vWave;
  varying float vFront;
  void main() {
    float ends = sin(3.14159 * vS);
    ends = ends * ends;
    float crest = smoothstep(0.6, 1.4, vWave);           // wave tops catch the light
    float edge = 1.0 - abs(vStrand - 0.5) * 1.4;        // brighter middle strands
    float depth = mix(0.3, 1.0, vFront);
    vec3 c = uColor * uTint * (0.45 + crest * 1.4) * edge * ends * depth * uBase * uGlow;
    gl_FragColor = vec4(c, 1.0);
  }
`;

// ── geometry builders ──────────────────────────────────────────────────────

/** Arc fragments on the shell; some flare outward on the left. */
function buildShell() {
  const rand = rng(7);
  const b = new LineBuilder();
  let made = 0;
  while (made < 1500) {
    const theta = rand() * Math.PI * 2;
    const phi = Math.acos(1 - 2 * rand());
    const p0 = onSphere(R, theta, phi);
    if (rand() > leftBias(p0.x, R)) continue;
    made++;
    const r = R * (1 + (rand() - 0.5) * 0.08);
    const alongParallel = rand() < 0.66;
    const length = 0.04 + rand() ** 2 * 0.6;
    const steps = Math.max(2, Math.round(length * 26));
    const pts: Vector3[] = [];
    for (let s = 0; s <= steps; s++) {
      const a = (s / steps) * length;
      pts.push(alongParallel ? onSphere(r, theta + a, phi) : onSphere(r, theta, phi + a));
    }
    b.poly(pts, pickTone(rand), 0.35 + rand() * 0.65, rand());
  }
  // Left-edge flares: short radial streaks breaking out of the silhouette.
  for (let i = 0; i < 180; i++) {
    const theta = Math.PI * (0.72 + rand() * 0.56); // around -x
    const phi = Math.PI * (0.18 + rand() * 0.64);
    const r0 = R * (0.98 + rand() * 0.06);
    const r1 = r0 + 0.08 + rand() ** 2 * 0.55;
    const drift = (rand() - 0.5) * 0.12;
    const pts = [onSphere(r0, theta, phi), onSphere((r0 + r1) / 2, theta + drift / 2, phi), onSphere(r1, theta + drift, phi)];
    b.poly(pts, pickTone(rand), 0.4 + rand() * 0.6, rand());
  }
  return b.geometry();
}

/** Tangent-plane basis at a point on a sphere. */
function tangentBasis(p: Vector3) {
  const n = p.clone().normalize();
  const up = Math.abs(n.y) > 0.95 ? new Vector3(1, 0, 0) : new Vector3(0, 1, 0);
  const east = new Vector3().crossVectors(up, n).normalize();
  const north = new Vector3().crossVectors(n, east).normalize();
  return { n, east, north };
}

/** Short glowing chips on the shell (and outside it on the left). */
function buildChips(count: number, seed: number, inner: boolean) {
  const rand = rng(seed);
  const geo = new PlaneGeometry(1, 1);
  const mesh = new InstancedMesh(geo, undefined, count);
  const colors = new Float32Array(count * 3);
  const seeds = new Float32Array(count);
  const m = new Matrix4();
  const scale = new Matrix4();
  let i = 0;
  while (i < count) {
    const theta = rand() * Math.PI * 2;
    const phi = Math.acos(1 - 2 * rand());
    const r = inner ? 0.9 + rand() * 0.75 : R * (0.97 + rand() * 0.08 + (rand() < 0.06 ? rand() * 0.25 : 0));
    const p = onSphere(r, theta, phi);
    if (!inner && rand() > leftBias(p.x, r)) continue;
    const { n, east, north } = tangentBasis(p);
    m.makeBasis(east, north, n).setPosition(p);
    const len = 0.04 + rand() ** 1.8 * (inner ? 0.2 : 0.3);
    const thick = 0.01 + rand() ** 1.5 * (inner ? 0.02 : 0.034);
    scale.makeScale(len, thick, 1);
    mesh.setMatrixAt(i, m.clone().multiply(scale));
    const c = pickTone(rand);
    const k = 0.5 + rand() * 0.6;
    colors.set([c.r * k, c.g * k, c.b * k], i * 3);
    seeds[i] = rand();
    i++;
  }
  geo.setAttribute('aColor', new InstancedBufferAttribute(colors, 3));
  geo.setAttribute('aSeed', new InstancedBufferAttribute(seeds, 1));
  mesh.frustumCulled = false;
  return mesh;
}

/** Rectangular panels with ladder rungs, facing outward inside the sphere. */
function buildPanels() {
  const rand = rng(23);
  const b = new LineBuilder();
  for (let i = 0; i < 70; i++) {
    const theta = rand() * Math.PI * 2;
    const phi = Math.PI * (0.2 + rand() * 0.6);
    const r = 0.85 + rand() * 0.8;
    const c = onSphere(r, theta, phi);
    const { east, north } = tangentBasis(c);
    const w = 0.08 + rand() * 0.32;
    const h = 0.12 + rand() * 0.45;
    const at = (x: number, y: number) => c.clone().addScaledVector(east, x).addScaledVector(north, y);
    const color = rand() < 0.3 ? FLARE : GOLD;
    const bright = 0.25 + rand() * 0.35;
    const seed = rand();
    // Outline (progress runs around it so glints circulate).
    b.poly([at(-w / 2, -h / 2), at(w / 2, -h / 2), at(w / 2, h / 2), at(-w / 2, h / 2), at(-w / 2, -h / 2)], color, bright, seed);
    // Rungs.
    const rungs = Math.floor(rand() * 7);
    for (let k = 1; k <= rungs; k++) {
      const y = -h / 2 + (k / (rungs + 1)) * h;
      b.poly([at(-w / 2, y), at(w / 2, y)], color, bright * 0.8, seed);
    }
    // Occasional vertical divider.
    if (rand() < 0.4) b.poly([at(0, -h / 2), at(0, h / 2)], color, bright * 0.7, seed);
  }
  return b.geometry();
}

/** Gyroscope rings at the core. */
function buildCoreRings() {
  const rand = rng(31);
  return [0.3, 0.42, 0.56, 0.72].map((radius, i) => {
    const b = new LineBuilder();
    const sweep = Math.PI * (1.45 + rand() * 0.45);
    for (let strand = 0; strand < 2; strand++) {
      const rr = radius + strand * 0.012;
      const pts: Vector3[] = [];
      for (let s = 0; s <= 96; s++) {
        const a = (s / 96) * sweep;
        pts.push(new Vector3(Math.cos(a) * rr, Math.sin(a) * rr, 0));
      }
      b.poly(pts, i === 0 ? HOT : FLARE, strand ? 0.6 : 1, rand());
    }
    return b.geometry();
  });
}

/** A band of wavy strands around a circle of `radius`. */
function buildRibbon(radius: number, sweep: number, strands: number, width: number) {
  const pos: number[] = [];
  const s: number[] = [];
  const st: number[] = [];
  const nrm: number[] = [];
  const steps = 220;
  for (let k = 0; k < strands; k++) {
    const u = strands === 1 ? 0.5 : k / (strands - 1);
    const rr = radius + (u - 0.5) * width;
    for (let i = 0; i < steps; i++) {
      for (const j of [i, i + 1]) {
        const t = j / steps;
        const a = t * sweep;
        const x = Math.cos(a);
        const y = Math.sin(a);
        // A little axial spread as well, so the band has depth.
        pos.push(x * rr, y * rr, (u - 0.5) * width * 0.6);
        s.push(t);
        st.push(u);
        nrm.push(x, y, 0.35);
      }
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('aS', new Float32BufferAttribute(s, 1));
  g.setAttribute('aStrand', new Float32BufferAttribute(st, 1));
  g.setAttribute('aNormal', new Float32BufferAttribute(nrm, 3));
  return g;
}

/** Orbiting sparks. */
function buildSparks(count: number, seed: number, rMin: number, rMax: number, speed: number, size: number) {
  const rand = rng(seed);
  const orbit = new Float32Array(count * 4);
  const axis = new Float32Array(count * 2);
  const color = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    orbit.set([rand() * Math.PI * 2, (0.4 + rand()) * speed * (rand() < 0.5 ? -1 : 1), rMin + rand() * (rMax - rMin), size * (0.5 + rand())], i * 4);
    axis.set([(rand() - 0.5) * Math.PI, (rand() - 0.5) * Math.PI], i * 2);
    const c = rand() < 0.4 ? HOT : rand() < 0.7 ? FLARE : GOLD;
    color.set([c.r, c.g, c.b], i * 3);
  }
  const g = new BufferGeometry();
  // Position is computed in the shader; three still needs the attribute.
  g.setAttribute('position', new Float32BufferAttribute(new Float32Array(count * 3), 3));
  g.setAttribute('aOrbit', new Float32BufferAttribute(orbit, 4));
  g.setAttribute('aAxis', new Float32BufferAttribute(axis, 2));
  g.setAttribute('aColor', new Float32BufferAttribute(color, 3));
  return g;
}

function radialTexture(stops: Array<[number, string]>) {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  stops.forEach(([at, c]) => grad.addColorStop(at, c));
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  return new CanvasTexture(canvas);
}

// ── scene ──────────────────────────────────────────────────────────────────

const RIBBONS = [
  // radius, sweep, strands, width, tilt (x, y, z), spin speed, amp, freq, brightness, color
  { radius: 1.42, sweep: Math.PI * 1.5, strands: 26, width: 0.42, tilt: [0.25, 0.5, 2.3], speed: 0.14, amp: 0.045, freq: 5, base: 1.5, color: GOLD },
  { radius: 1.78, sweep: Math.PI * 1.15, strands: 14, width: 0.26, tilt: [1.15, -0.4, 0.6], speed: -0.09, amp: 0.035, freq: 7, base: 0.8, color: AMBER },
  { radius: 0.92, sweep: Math.PI * 1.7, strands: 8, width: 0.14, tilt: [-0.9, 0.3, -0.8], speed: 0.28, amp: 0.025, freq: 4, base: 0.6, color: GOLD },
] as const;

function OrbScene({ status, reducedMotion }: { status: OrbStatus; reducedMotion: boolean }) {
  const { size, gl } = useThree();
  const root = useRef<Group>(null);
  const shell = useRef<Group>(null);
  const panels = useRef<Group>(null);
  const core = useRef<Array<Group | null>>([]);
  const ribbons = useRef<Array<Group | null>>([]);
  const bloomRef = useRef<UnrealBloomPass | null>(null);

  // Live, eased state.
  const live = useRef({ spin: 1, glow: STATE.idle.glow, breath: STATE.idle.breath, bloom: STATE.idle.bloom, flow: 0, flick: 0 });
  const tint = useRef(new Color(1, 1, 1));
  const tintTarget = useMemo(() => new Color(), []);

  // Shared uniforms: one object per name, referenced by every material.
  const shared = useMemo(
    () => ({
      uTime: { value: 0 },
      uFlick: { value: 0 },
      uGlow: { value: 1 },
      uTint: { value: new Color(1, 1, 1) },
      uPixelRatio: { value: Math.min(2, typeof window !== 'undefined' ? window.devicePixelRatio : 1) },
    }),
    [],
  );

  const scene = useMemo(() => {
    const flow = (base: number, pulse: number, flowRate: number) =>
      new ShaderMaterial({
        uniforms: { ...shared, uBase: { value: base }, uPulse: { value: pulse }, uFlowRate: { value: flowRate } },
        vertexShader: FLOW_VERT,
        fragmentShader: FLOW_FRAG,
        transparent: true,
        blending: AdditiveBlending,
        depthWrite: false,
      });
    const chipMat = (base: number) =>
      new ShaderMaterial({
        uniforms: { ...shared, uBase: { value: base } },
        vertexShader: CHIP_VERT,
        fragmentShader: CHIP_FRAG,
        transparent: true,
        blending: AdditiveBlending,
        depthWrite: false,
        side: DoubleSide,
      });
    const sparkMat = new ShaderMaterial({
      uniforms: { ...shared },
      vertexShader: SPARK_VERT,
      fragmentShader: SPARK_FRAG,
      transparent: true,
      blending: AdditiveBlending,
      depthWrite: false,
    });

    const shellChips = buildChips(1900, 11, false);
    shellChips.material = chipMat(0.5);
    const innerChips = buildChips(500, 17, true);
    innerChips.material = chipMat(0.38);

    return {
      shellGeo: buildShell(),
      shellMat: flow(0.3, 1.6, 0.22),
      shellChips,
      innerChips,
      panelGeo: buildPanels(),
      panelMat: flow(0.42, 1.6, 0.35),
      ringGeos: buildCoreRings(),
      ringMat: flow(1.1, 2.4, 0.9),
      ribbonGeos: RIBBONS.map((r) => buildRibbon(r.radius, r.sweep, r.strands, r.width)),
      ribbonMats: RIBBONS.map(
        (r) =>
          new ShaderMaterial({
            uniforms: {
              ...shared,
              uAmp: { value: r.amp },
              uFreq: { value: r.freq },
              uBase: { value: r.base },
              uColor: { value: r.color.clone() },
            },
            vertexShader: RIBBON_VERT,
            fragmentShader: RIBBON_FRAG,
            transparent: true,
            blending: AdditiveBlending,
            depthWrite: false,
          }),
      ),
      outerSparkGeo: buildSparks(420, 41, 1.9, 2.5, 0.12, 0.55),
      coreSparkGeo: buildSparks(140, 43, 0.12, 0.75, 0.9, 0.7),
      sparkMat,
      hotMat: new SpriteMaterial({
        map: radialTexture([[0, 'rgba(255,250,235,1)'], [0.18, 'rgba(255,226,160,0.9)'], [0.45, 'rgba(242,179,61,0.25)'], [1, 'rgba(242,179,61,0)']]),
        transparent: true,
        blending: AdditiveBlending,
        depthWrite: false,
      }),
      haloMat: new SpriteMaterial({
        map: radialTexture([[0, 'rgba(242,179,61,0.35)'], [0.3, 'rgba(184,102,26,0.08)'], [1, 'rgba(0,0,0,0)']]),
        transparent: true,
        blending: AdditiveBlending,
        depthWrite: false,
        opacity: 0.5,
      }),
    };
  }, [shared]);

  // Bloom: render through a composer instead of R3F's default pass.
  const composer = useMemo(() => {
    const c = new EffectComposer(gl);
    return c;
  }, [gl]);
  const { scene: threeScene, camera } = useThree();
  // Framebuffers must be whole pixels: the stage height is often fractional
  // (e.g. 673.4px), and WebGL silently renders nothing into such a target.
  const width = Math.max(1, Math.floor(size.width));
  const height = Math.max(1, Math.floor(size.height));
  useEffect(() => {
    composer.passes.length = 0;
    composer.addPass(new RenderPass(threeScene, camera));
    const bloom = new UnrealBloomPass(new Vector2(width, height), STATE.idle.bloom, 0.42, 0.22);
    bloomRef.current = bloom;
    composer.addPass(bloom);
    composer.addPass(new OutputPass());
    return () => {
      bloom.dispose();
    };
  }, [composer, threeScene, camera, width, height]);
  useEffect(() => {
    composer.setPixelRatio(gl.getPixelRatio());
    composer.setSize(width, height);
  }, [composer, gl, width, height]);

  useFrame((state, delta) => {
    const target = STATE[status];
    const l = live.current;
    const k = Math.min(1, delta * 2.2);
    l.spin += (target.spin - l.spin) * k;
    l.glow += (target.glow - l.glow) * k;
    l.breath += (target.breath - l.breath) * k;
    l.bloom += (target.bloom - l.bloom) * k;
    tintTarget.setRGB(...target.tint);
    tint.current.lerp(tintTarget, Math.min(1, delta * 1.5));

    const motion = reducedMotion ? 0.15 : 1;
    const d = delta * l.spin * motion;
    l.flow += d;
    l.flick += delta * motion;
    const t = state.clock.elapsedTime;

    // Breath: eased 0 → 1 → 0 every 4 s.
    const inhale = reducedMotion ? 0.5 : (1 - Math.cos(t * Math.PI * 2 * BREATH_HZ)) / 2;
    const breathe = (inhale - 0.5) * 2 * l.breath;
    const flutter = reducedMotion ? 0 : Math.sin(t * 9) * target.pulse;

    shared.uTime.value = l.flow;
    shared.uFlick.value = l.flick;
    shared.uGlow.value = l.glow * (1 + breathe * 5);
    shared.uTint.value.copy(tint.current);
    if (bloomRef.current) bloomRef.current.strength = l.bloom * (1 + breathe * 4 + flutter * 3);
    scene.hotMat.color.copy(tint.current);
    scene.haloMat.color.copy(tint.current);
    scene.haloMat.opacity = 0.12 + l.glow * 0.06 + breathe;

    // Fit the sphere to the shorter side of the stage.
    const aspect = size.width / Math.max(1, size.height);
    const fit = Math.min(1, aspect);
    if (root.current) {
      root.current.scale.setScalar(fit * (1 + breathe + flutter));
    }
    // The shell sways rather than spins, so its heavy left side stays put.
    if (shell.current) {
      shell.current.rotation.y = Math.sin(l.flow * 0.08) * 0.32;
      shell.current.rotation.x = Math.sin(l.flow * 0.05 + 1) * 0.08;
    }
    if (panels.current) panels.current.rotation.y -= d * 0.06;
    core.current.forEach((g, i) => {
      if (!g) return;
      g.rotation.x += d * (0.7 + i * 0.35);
      g.rotation.y += d * (0.5 - i * 0.22);
      g.rotation.z += d * (0.3 + i * 0.15);
    });
    ribbons.current.forEach((g, i) => {
      if (g) g.rotation.z += d * RIBBONS[i].speed;
    });

    composer.render(delta);
  }, 1);

  return (
    <group ref={root}>
      <sprite material={scene.haloMat} scale={[9, 9, 1]} position={[0, 0, -2.6]} />

      <group ref={shell}>
        <lineSegments geometry={scene.shellGeo} material={scene.shellMat} />
        <primitive object={scene.shellChips} />
      </group>

      <group ref={panels}>
        <lineSegments geometry={scene.panelGeo} material={scene.panelMat} />
        <primitive object={scene.innerChips} />
      </group>

      {RIBBONS.map((r, i) => (
        <group key={i} rotation={r.tilt as unknown as [number, number, number]}>
          <group ref={(el) => { ribbons.current[i] = el; }}>
            <lineSegments geometry={scene.ribbonGeos[i]} material={scene.ribbonMats[i]} />
          </group>
        </group>
      ))}

      <points geometry={scene.outerSparkGeo} material={scene.sparkMat} frustumCulled={false} />

      {/* Energy core */}
      {scene.ringGeos.map((g, i) => (
        <group key={i} ref={(el) => { core.current[i] = el; }} rotation={[i * 0.9, i * 1.3, i * 0.4]}>
          <lineSegments geometry={g} material={scene.ringMat} />
        </group>
      ))}
      <points geometry={scene.coreSparkGeo} material={scene.sparkMat} frustumCulled={false} />
      <sprite material={scene.hotMat} scale={[0.9, 0.9, 1]} />
    </group>
  );
}

export function GoldOrb3D({ status }: { status: OrbStatus }) {
  const reducedMotion = useMemo(
    () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true,
    [],
  );
  return (
    <div className="gold-orb" data-state={status} aria-hidden="true">
      <Canvas
        camera={{ position: [0, 0, 7], fov: 42 }}
        dpr={[1, 1.5]}
        gl={{ antialias: false, alpha: false, powerPreference: 'high-performance' }}
        onCreated={({ gl }) => {
          gl.toneMapping = NoToneMapping;
          // Pure black: any other clear value is stored as linear in the
          // composer's target and then gamma-lifted to grey by OutputPass.
          gl.setClearColor(0x000000, 1);
        }}
      >
        <OrbScene status={status} reducedMotion={reducedMotion} />
      </Canvas>
    </div>
  );
}
