import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { Engine, CHAMBER_R, PION_TRAIL, type Telemetry } from "./engine";
import type { ParticleKind } from "./physics";

export type Phase = "idle" | "running" | "done";

interface Props {
  kind: ParticleKind;
  matter: number;
  antimatter: number;
  phase: Phase;
  runId: number;
  speed: number;
  bScale: number;
  autoRotate: boolean;
  onStats: (t: Telemetry) => void;
  onDone: () => void;
}

const MATTER = 0x3ecbff;
const ANTI = 0xff4d7a;
const MAX_P = 220;
const MAX_PI = 160;
const MAX_G = 400;
const MAX_B = 64;
const MAX_SPARK = 2400;
const MAX_HIT = 400;
const MAX_LIGHT = 4;
const TRAIL = 48;
/** dalga paketi başına segment */
const WAVE_SEG = 18;
const WAVE_LEN = 1.25;

function radialTex(stops: [number, string][]): THREE.Texture {
  const c = document.createElement("canvas");
  c.width = 128;
  c.height = 128;
  const g = c.getContext("2d")!;
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  for (const [o, col] of stops) grd.addColorStop(o, col);
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.needsUpdate = true;
  return t;
}

const glowTex = () =>
  radialTex([
    [0, "rgba(255,255,255,1)"],
    [0.22, "rgba(255,255,255,0.55)"],
    [0.5, "rgba(255,255,255,0.12)"],
    [1, "rgba(255,255,255,0)"],
  ]);

const ringTex = () =>
  radialTex([
    [0, "rgba(255,255,255,0)"],
    [0.62, "rgba(255,255,255,0)"],
    [0.8, "rgba(255,255,255,0.9)"],
    [0.86, "rgba(255,255,255,0.35)"],
    [1, "rgba(255,255,255,0)"],
  ]);

function latLong(r: number, color: number, opacity: number): THREE.Group {
  const g = new THREE.Group();
  const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity });
  for (let i = 0; i < 6; i++) {
    const geo = new THREE.BufferGeometry().setFromPoints(
      new THREE.Path().absarc(0, 0, r, 0, Math.PI * 2, false).getPoints(96).map((p) => new THREE.Vector3(p.x, p.y, 0)),
    );
    const line = new THREE.Line(geo, mat);
    line.rotation.y = (i * Math.PI) / 6;
    g.add(line);
  }
  for (let i = 1; i < 4; i++) {
    const a = (i * Math.PI) / 4;
    const rr = r * Math.sin(a);
    const y = r * Math.cos(a);
    const pts = new THREE.Path().absarc(0, 0, rr, 0, Math.PI * 2, false).getPoints(96);
    const geo = new THREE.BufferGeometry().setFromPoints(pts.map((p) => new THREE.Vector3(p.x, y, p.y)));
    g.add(new THREE.Line(geo, mat));
    if (i !== 2) {
      const geo2 = new THREE.BufferGeometry().setFromPoints(pts.map((p) => new THREE.Vector3(p.x, -y, p.y)));
      g.add(new THREE.Line(geo2, mat));
    }
  }
  return g;
}

/** Dinamik çizgi tamponu (LineSegments) */
function segBuffer(maxSeg: number, opacity = 1) {
  const pos = new Float32Array(maxSeg * 6);
  const col = new Float32Array(maxSeg * 6);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
  const lines = new THREE.LineSegments(
    geo,
    new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false }),
  );
  lines.frustumCulled = false;
  return { lines, pos, col, max: maxSeg };
}
type SegBuffer = ReturnType<typeof segBuffer>;

function commit(b: SegBuffer, n: number) {
  b.lines.geometry.setDrawRange(0, n * 2);
  b.lines.geometry.attributes.position.needsUpdate = true;
  b.lines.geometry.attributes.color.needsUpdate = true;
}

/** Billboard sprite havuzu (eklemeli; saydamlık renk çarpanıyla) */
function spritePool(tex: THREE.Texture, max: number) {
  const mesh = new THREE.InstancedMesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }),
    max,
  );
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3);
  mesh.frustumCulled = false;
  mesh.count = 0;
  return mesh;
}

export default function Simulation({ kind, matter, antimatter, phase, runId, speed, bScale, autoRotate, onStats, onDone }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const api = useRef({ onStats, onDone, phase, speed, bScale });
  api.current = { onStats, onDone, phase, speed, bScale };

  const world = useRef<{
    engine: Engine;
    controls: OrbitControls;
    trailHist: Float32Array;
    trailHead: Int16Array;
    doneSent: boolean;
  } | null>(null);

  // Sahne yalnızca bir kez kurulur
  useEffect(() => {
    const el = host.current!;
    const w = el.clientWidth || 800;
    const h = el.clientHeight || 560;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(w, h);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    el.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x04060c);
    scene.fog = new THREE.FogExp2(0x04060c, 0.028);

    const camera = new THREE.PerspectiveCamera(42, w / h, 0.1, 120);
    camera.position.set(9.4, 6.2, 12.4);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    controls.minDistance = 6;
    controls.maxDistance = 28;
    controls.target.set(0, 0, 0);
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.55;

    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    const bloom = new UnrealBloomPass(new THREE.Vector2(w, h), 0.95, 0.6, 0.16);
    composer.addPass(bloom);
    composer.addPass(new OutputPass());

    scene.add(new THREE.AmbientLight(0x6b7cff, 0.35));
    const key = new THREE.PointLight(0x88aaff, 18, 40);
    key.position.set(6, 8, 8);
    scene.add(key);
    scene.add(new THREE.PointLight(0xff6699, 8, 30).translateX(-6).translateY(4));

    // Anihilasyon ışıkları — sayıları sabit kalsın diye hep sahnede, şiddet 0
    const flashLights: THREE.PointLight[] = [];
    for (let i = 0; i < MAX_LIGHT; i++) {
      const l = new THREE.PointLight(0xffe2b0, 0, 7, 1.6);
      scene.add(l);
      flashLights.push(l);
    }

    // yıldız alanı
    {
      const n = 900;
      const pos = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        const r = 28 + Math.random() * 40;
        const th = Math.random() * Math.PI * 2;
        const ph = Math.acos(2 * Math.random() - 1);
        pos[i * 3] = r * Math.sin(ph) * Math.cos(th);
        pos[i * 3 + 1] = r * Math.sin(ph) * Math.sin(th);
        pos[i * 3 + 2] = r * Math.cos(ph);
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      scene.add(new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xaab8ff, size: 0.06, transparent: true, opacity: 0.7 })));
    }

    scene.add(latLong(CHAMBER_R, 0x3d4c7a, 0.28));
    scene.add(latLong(CHAMBER_R * 0.995, 0x6ea2ff, 0.08));

    const shell = new THREE.Mesh(
      new THREE.SphereGeometry(CHAMBER_R, 48, 32),
      new THREE.MeshPhysicalMaterial({
        color: 0x0b1224,
        transparent: true,
        opacity: 0.07,
        roughness: 0.15,
        metalness: 0.05,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    scene.add(shell);

    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(CHAMBER_R + 0.02, 0.025, 8, 128),
      new THREE.MeshBasicMaterial({ color: 0x7dd3fc, transparent: true, opacity: 0.35 }),
    );
    ring.rotation.x = Math.PI / 2;
    scene.add(ring);
    const ring2 = ring.clone();
    ring2.rotation.x = 0;
    ring2.material = new THREE.MeshBasicMaterial({ color: 0xf472b6, transparent: true, opacity: 0.22 });
    scene.add(ring2);

    const grid = new THREE.PolarGridHelper(CHAMBER_R, 8, 16, 64, 0x1e293b, 0x1e293b);
    grid.position.y = -CHAMBER_R - 0.02;
    scene.add(grid);

    const wall = new THREE.Mesh(
      new THREE.CircleGeometry(CHAMBER_R * 0.98, 64),
      new THREE.MeshBasicMaterial({ color: 0xc4b5fd, transparent: true, opacity: 0.14, side: THREE.DoubleSide, depthWrite: false }),
    );
    wall.rotation.y = Math.PI / 2;
    scene.add(wall);

    const sphereGeo = new THREE.SphereGeometry(1, 18, 14);
    const particleMat = (c: number) =>
      new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 1.8, roughness: 0.25, metalness: 0.15 });
    const matterMesh = new THREE.InstancedMesh(sphereGeo, particleMat(MATTER), MAX_P);
    const antiMesh = new THREE.InstancedMesh(sphereGeo, particleMat(ANTI), MAX_P);
    matterMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    antiMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    scene.add(matterMesh, antiMesh);

    const tex = glowTex();
    const rTex = ringTex();
    const glowPool = (c: number) => {
      const m = new THREE.InstancedMesh(
        new THREE.PlaneGeometry(1, 1),
        new THREE.MeshBasicMaterial({ map: tex, color: c, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }),
        MAX_P,
      );
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      return m;
    };
    const glowM = glowPool(MATTER);
    const glowA = glowPool(ANTI);
    scene.add(glowM, glowA);

    const pionMesh = new THREE.InstancedMesh(
      sphereGeo,
      new THREE.MeshBasicMaterial({ color: 0xffffff }),
      MAX_PI,
    );
    pionMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    pionMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX_PI * 3), 3);
    scene.add(pionMesh);

    // foton başları
    const photonPos = new Float32Array(MAX_G * 3);
    const photonCol = new Float32Array(MAX_G * 3);
    const photonGeo = new THREE.BufferGeometry();
    photonGeo.setAttribute("position", new THREE.BufferAttribute(photonPos, 3));
    photonGeo.setAttribute("color", new THREE.BufferAttribute(photonCol, 3));
    const photonPts = new THREE.Points(
      photonGeo,
      new THREE.PointsMaterial({ size: 0.42, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, map: tex }),
    );
    photonPts.frustumCulled = false;
    scene.add(photonPts);

    // kıvılcımlar
    const sparkPos = new Float32Array(MAX_SPARK * 3);
    const sparkCol = new Float32Array(MAX_SPARK * 3);
    const sparkGeo = new THREE.BufferGeometry();
    sparkGeo.setAttribute("position", new THREE.BufferAttribute(sparkPos, 3));
    sparkGeo.setAttribute("color", new THREE.BufferAttribute(sparkCol, 3));
    const sparkPts = new THREE.Points(
      sparkGeo,
      new THREE.PointsMaterial({ size: 0.16, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, map: tex }),
    );
    sparkPts.frustumCulled = false;
    scene.add(sparkPts);

    const waves = segBuffer(MAX_G * WAVE_SEG);
    const trails = segBuffer(MAX_P * TRAIL, 0.85);
    const pionTrails = segBuffer(MAX_PI * PION_TRAIL);
    const lors = segBuffer(MAX_HIT);
    scene.add(waves.lines, trails.lines, pionTrails.lines, lors.lines);

    const flashCore = spritePool(tex, MAX_B);
    const flashHalo = spritePool(tex, MAX_B);
    const shock = spritePool(rTex, MAX_B);
    const hitGlow = spritePool(tex, MAX_HIT);
    const hitRing = spritePool(rTex, MAX_HIT);
    scene.add(flashHalo, flashCore, shock, hitGlow, hitRing);

    const trailHist = new Float32Array(MAX_P * TRAIL * 3);
    trailHist.fill(Number.NaN);
    const trailHead = new Int16Array(MAX_P);
    trailHead.fill(-1);

    const st = {
      engine: new Engine(kind, matter, antimatter),
      controls,
      trailHist,
      trailHead,
      doneSent: false,
    };
    world.current = st;

    const dummy = new THREE.Object3D();
    const tmpC = new THREE.Color();
    const dir = new THREE.Vector3();
    const view = new THREE.Vector3();
    const perp = new THREE.Vector3();
    let last = performance.now();
    let clock = 0;
    let raf = 0;

    const billboard = (mesh: THREE.InstancedMesh, i: number, x: number, y: number, z: number, s: number, r: number, g: number, b: number) => {
      dummy.position.set(x, y, z);
      dummy.quaternion.copy(camera.quaternion);
      dummy.scale.setScalar(s);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      tmpC.setRGB(r, g, b);
      mesh.setColorAt(i, tmpC);
    };
    const finish = (mesh: THREE.InstancedMesh, n: number) => {
      mesh.count = n;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    };

    const loop = (now: number) => {
      const wld = world.current;
      if (!wld) return;
      const rawDt = Math.min(0.05, (now - last) / 1000);
      last = now;
      clock += rawDt;
      controls.update();

      const eng = wld.engine;
      eng.bScale = api.current.bScale;
      if (api.current.phase !== "idle") eng.step(rawDt * api.current.speed);
      else eng.step(rawDt * 0.85);

      const tel = eng.telemetry();
      api.current.onStats(tel);
      if (tel.finished && !wld.doneSent && api.current.phase === "running") {
        wld.doneSent = true;
        api.current.onDone();
      }

      // ── madde / antimadde + izler ─────────────────────────────────────
      const r = eng.radius;
      let im = 0;
      let ia = 0;
      let tseg = 0;
      for (let pi = 0; pi < eng.particles.length; pi++) {
        const p = eng.particles[pi];
        if (!p.alive) continue;
        dummy.position.set(p.x, p.y, p.z);
        dummy.quaternion.identity();
        dummy.scale.setScalar(r);
        dummy.updateMatrix();
        if (p.anti) {
          if (ia < MAX_P) antiMesh.setMatrixAt(ia, dummy.matrix);
        } else if (im < MAX_P) {
          matterMesh.setMatrixAt(im, dummy.matrix);
        }
        dummy.scale.setScalar(r * 5.2);
        dummy.quaternion.copy(camera.quaternion);
        dummy.updateMatrix();
        if (p.anti) {
          if (ia < MAX_P) glowA.setMatrixAt(ia, dummy.matrix);
          ia++;
        } else if (im < MAX_P) {
          glowM.setMatrixAt(im, dummy.matrix);
          im++;
        }

        if (pi < MAX_P) {
          let hd = wld.trailHead[pi];
          hd = hd < 0 ? 0 : (hd + 1) % TRAIL;
          wld.trailHead[pi] = hd;
          const base = pi * TRAIL * 3;
          wld.trailHist[base + hd * 3] = p.x;
          wld.trailHist[base + hd * 3 + 1] = p.y;
          wld.trailHist[base + hd * 3 + 2] = p.z;
          const cr = p.anti ? 1 : 0.24;
          const cg = p.anti ? 0.3 : 0.8;
          const cb = p.anti ? 0.48 : 1;
          for (let k = 1; k < TRAIL; k++) {
            if (tseg >= trails.max) break;
            const i0 = (hd - k + TRAIL) % TRAIL;
            const i1 = (hd - k + 1 + TRAIL) % TRAIL;
            const x0 = wld.trailHist[base + i0 * 3];
            const x1 = wld.trailHist[base + i1 * 3];
            if (!Number.isFinite(x0) || !Number.isFinite(x1)) continue;
            const fade = 1 - k / TRAIL;
            const a = tseg * 6;
            trails.pos[a] = x0;
            trails.pos[a + 1] = wld.trailHist[base + i0 * 3 + 1];
            trails.pos[a + 2] = wld.trailHist[base + i0 * 3 + 2];
            trails.pos[a + 3] = x1;
            trails.pos[a + 4] = wld.trailHist[base + i1 * 3 + 1];
            trails.pos[a + 5] = wld.trailHist[base + i1 * 3 + 2];
            trails.col[a] = cr * fade;
            trails.col[a + 1] = cg * fade;
            trails.col[a + 2] = cb * fade;
            trails.col[a + 3] = cr * fade * 0.4;
            trails.col[a + 4] = cg * fade * 0.4;
            trails.col[a + 5] = cb * fade * 0.4;
            tseg++;
          }
        }
      }
      commit(trails, tseg);
      matterMesh.count = im;
      antiMesh.count = ia;
      glowM.count = im;
      glowA.count = ia;
      matterMesh.instanceMatrix.needsUpdate = true;
      antiMesh.instanceMatrix.needsUpdate = true;
      glowM.instanceMatrix.needsUpdate = true;
      glowA.instanceMatrix.needsUpdate = true;

      // ── pionlar: kabarcık odası izleri ────────────────────────────────
      let ip = 0;
      let pseg = 0;
      for (const pi of eng.pions) {
        if (ip >= MAX_PI) break;
        dummy.position.set(pi.x, pi.y, pi.z);
        dummy.scale.setScalar(pi.charge === 0 ? 0.07 : 0.085);
        dummy.quaternion.identity();
        dummy.updateMatrix();
        pionMesh.setMatrixAt(ip, dummy.matrix);
        const [cr, cg, cb] = pi.charge > 0 ? [1, 0.45, 0.6] : pi.charge < 0 ? [0.25, 0.95, 0.65] : [1, 0.78, 0.25];
        tmpC.setRGB(cr * 2.2, cg * 2.2, cb * 2.2);
        pionMesh.setColorAt(ip, tmpC);
        ip++;
        for (let k = 1; k < pi.len; k++) {
          if (pseg >= pionTrails.max) break;
          const i0 = ((pi.head - k - 1 + PION_TRAIL * 2) % PION_TRAIL) * 3;
          const i1 = ((pi.head - k + PION_TRAIL * 2) % PION_TRAIL) * 3;
          const fade = (1 - k / PION_TRAIL) * 1.3;
          const a = pseg * 6;
          pionTrails.pos.set([pi.trail[i0], pi.trail[i0 + 1], pi.trail[i0 + 2], pi.trail[i1], pi.trail[i1 + 1], pi.trail[i1 + 2]], a);
          pionTrails.col.set([cr * fade * 0.5, cg * fade * 0.5, cb * fade * 0.5, cr * fade, cg * fade, cb * fade], a);
          pseg++;
        }
      }
      finish(pionMesh, ip);
      commit(pionTrails, pseg);

      // ── gama fotonları: dalga paketi ─────────────────────────────────
      const nG = Math.min(eng.photons.length, MAX_G);
      let wseg = 0;
      for (let i = 0; i < nG; i++) {
        const g = eng.photons[i];
        const fadeLife = g.hit ? Math.max(0, 1 - (g.age - (g.life - 0.22)) / 0.22) : 1;
        photonPos[i * 3] = g.x;
        photonPos[i * 3 + 1] = g.y;
        photonPos[i * 3 + 2] = g.z;
        photonCol[i * 3] = 1 * fadeLife;
        photonCol[i * 3 + 1] = 0.9 * fadeLife;
        photonCol[i * 3 + 2] = 0.55 * fadeLife;

        dir.set(g.x - g.ox, g.y - g.oy, g.z - g.oz);
        const travelled = dir.length();
        if (travelled < 1e-4) continue;
        dir.divideScalar(travelled);
        view.set(camera.position.x - g.x, camera.position.y - g.y, camera.position.z - g.z).normalize();
        perp.crossVectors(dir, view).normalize();
        const L = Math.min(WAVE_LEN, travelled);
        const amp = 0.075;
        for (let s = 0; s < WAVE_SEG; s++) {
          if (wseg >= waves.max) break;
          const u0 = s / WAVE_SEG;
          const u1 = (s + 1) / WAVE_SEG;
          const d0 = L * u0;
          const d1 = L * u1;
          // uç kısımlarda sönümlenen sinüs → dalga paketi
          const env0 = Math.sin(Math.PI * u0);
          const env1 = Math.sin(Math.PI * u1);
          const w0 = amp * env0 * Math.sin(d0 * 22 - clock * 30 + g.phase);
          const w1 = amp * env1 * Math.sin(d1 * 22 - clock * 30 + g.phase);
          const a = wseg * 6;
          waves.pos[a] = g.x - dir.x * d0 + perp.x * w0;
          waves.pos[a + 1] = g.y - dir.y * d0 + perp.y * w0;
          waves.pos[a + 2] = g.z - dir.z * d0 + perp.z * w0;
          waves.pos[a + 3] = g.x - dir.x * d1 + perp.x * w1;
          waves.pos[a + 4] = g.y - dir.y * d1 + perp.y * w1;
          waves.pos[a + 5] = g.z - dir.z * d1 + perp.z * w1;
          const f0 = (1 - u0) * fadeLife;
          const f1 = (1 - u1) * fadeLife;
          waves.col.set([1 * f0, 0.88 * f0, 0.45 * f0, 1 * f1, 0.7 * f1, 0.2 * f1], a);
          wseg++;
        }
      }
      photonGeo.setDrawRange(0, nG);
      photonGeo.attributes.position.needsUpdate = true;
      photonGeo.attributes.color.needsUpdate = true;
      commit(waves, wseg);

      // ── kıvılcımlar ──────────────────────────────────────────────────
      const nS = Math.min(eng.sparks.length, MAX_SPARK);
      for (let i = 0; i < nS; i++) {
        const s = eng.sparks[i];
        const f = 1 - s.age / s.life;
        sparkPos[i * 3] = s.x;
        sparkPos[i * 3 + 1] = s.y;
        sparkPos[i * 3 + 2] = s.z;
        sparkCol[i * 3] = f;
        sparkCol[i * 3 + 1] = f * (0.55 + 0.4 * s.warm);
        sparkCol[i * 3 + 2] = f * (0.85 - 0.7 * s.warm);
      }
      sparkGeo.setDrawRange(0, nS);
      sparkGeo.attributes.position.needsUpdate = true;
      sparkGeo.attributes.color.needsUpdate = true;

      // ── anihilasyon flaşı + şok dalgası + ışık ───────────────────────
      const nB = Math.min(eng.bursts.length, MAX_B);
      for (let i = 0; i < nB; i++) {
        const b = eng.bursts[i];
        const k = b.age / b.life;
        const big = b.heavy ? 1.5 : 1;
        // çekirdek: hızlı parlayıp sönen beyaz-sıcak nokta
        const core = Math.exp(-k * 7);
        billboard(flashCore, i, b.x, b.y, b.z, (0.5 + 1.1 * Math.sqrt(k)) * big, core * 1.6, core * 1.45, core * 1.15);
        // hale: sıcak turuncudan mora kayan geniş parıltı
        const halo = (1 - k) * (1 - k);
        billboard(flashHalo, i, b.x, b.y, b.z, (1.2 + 2.2 * k) * big, halo * 0.9, halo * 0.45, halo * 0.55);
        // şok halkası
        const sk = Math.min(1, k * 1.25);
        const sf = 1 - sk;
        billboard(shock, i, b.x, b.y, b.z, (0.3 + 3.6 * sk) * big, sf * 0.55, sf * 0.8, sf * 1);
      }
      finish(flashCore, nB);
      finish(flashHalo, nB);
      finish(shock, nB);

      for (let i = 0; i < MAX_LIGHT; i++) {
        const b = eng.bursts[eng.bursts.length - 1 - i];
        const l = flashLights[i];
        if (!b) {
          l.intensity = 0;
          continue;
        }
        l.position.set(b.x, b.y, b.z);
        l.intensity = 26 * Math.exp(-(b.age / b.life) * 5) * (b.heavy ? 1.6 : 1);
      }

      // ── dedektör isabetleri + PET tepki çizgileri ────────────────────
      const nH = Math.min(eng.hits.length, MAX_HIT);
      const partner = new Map<number, number>();
      let lseg = 0;
      for (let i = 0; i < nH; i++) {
        const hit = eng.hits[i];
        const f = 1 - hit.age / hit.life;
        const pop = Math.exp(-hit.age * 6);
        const gamma = hit.kind === "gamma";
        const [cr, cg, cb] = gamma ? [1, 0.82, 0.35] : [0.85, 0.5, 1];
        billboard(hitGlow, i, hit.x, hit.y, hit.z, 0.32 + 0.5 * pop, cr * (f + pop), cg * (f + pop), cb * (f + pop));
        billboard(hitRing, i, hit.x, hit.y, hit.z, 0.2 + 0.9 * (1 - pop), cr * pop, cg * pop, cb * pop);
        if (gamma && hit.pair >= 0) {
          const j = partner.get(hit.pair);
          if (j === undefined) partner.set(hit.pair, i);
          else if (lseg < lors.max) {
            const o = eng.hits[j];
            const lf = Math.min(f, 1 - o.age / o.life) * 0.55;
            lors.pos.set([o.x, o.y, o.z, hit.x, hit.y, hit.z], lseg * 6);
            lors.col.set([lf, lf * 0.8, lf * 0.35, lf, lf * 0.8, lf * 0.35], lseg * 6);
            lseg++;
          }
        }
      }
      finish(hitGlow, nH);
      finish(hitRing, nH);
      commit(lors, lseg);

      const wa = tel.wallAlpha;
      (wall.material as THREE.MeshBasicMaterial).opacity = wa * 0.16;
      wall.visible = wa > 0.01;

      composer.render();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    const onResize = () => {
      const ww = el.clientWidth || 800;
      const hh = el.clientHeight || 560;
      camera.aspect = ww / hh;
      camera.updateProjectionMatrix();
      renderer.setSize(ww, hh);
      composer.setSize(ww, hh);
    };
    const ro = new ResizeObserver(onResize);
    ro.observe(el);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      controls.dispose();
      composer.dispose();
      renderer.dispose();
      el.innerHTML = "";
      world.current = null;
    };
    // sahne yalnızca mount anında kurulur
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Kurulum değişince motoru yeniden yarat
  useEffect(() => {
    const wld = world.current;
    if (!wld) return;
    wld.engine = new Engine(kind, matter, antimatter);
    wld.doneSent = false;
    wld.trailHead.fill(-1);
    wld.trailHist.fill(Number.NaN);
    if (phase === "running") wld.engine.start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, matter, antimatter, runId]);

  useEffect(() => {
    const wld = world.current;
    if (!wld) return;
    if (phase === "running") wld.engine.start();
  }, [phase]);

  useEffect(() => {
    if (world.current) world.current.controls.autoRotate = autoRotate;
  }, [autoRotate]);

  return <div ref={host} className="sim-host h-full w-full overflow-hidden rounded-none" />;
}
