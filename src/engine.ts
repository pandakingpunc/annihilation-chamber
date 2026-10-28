import { PARTICLES, MEV_TO_J, type ParticleKind } from "./physics";

export const CHAMBER_R = 5.85;
/** Pion iz uzunluğu (nokta sayısı) — kabarcık odası görünümü için */
export const PION_TRAIL = 110;

export interface Particle {
  anti: boolean;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  ax: number;
  ay: number;
  az: number;
  alive: boolean;
}

export interface Photon {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  /** doğduğu nokta — dalga paketi çizimi için */
  ox: number;
  oy: number;
  oz: number;
  age: number;
  life: number;
  /** aynı olaydan çıkan foton çiftinin kimliği (PET tepki çizgisi için); −1 = eşsiz */
  pair: number;
  hit: boolean;
  phase: number;
}

export interface Pion {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  charge: number;
  age: number;
  life: number;
  alive: boolean;
  /** halka tampon: son PION_TRAIL konum (xyz) */
  trail: Float32Array;
  head: number;
  len: number;
}

/** Anihilasyon noktası: flaş + şok dalgası + ışık */
export interface Burst {
  x: number;
  y: number;
  z: number;
  age: number;
  life: number;
  heavy: boolean;
}

export interface Spark {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  age: number;
  life: number;
  warm: number;
}

/** Odanın duvarındaki dedektör isabeti */
export interface Hit {
  x: number;
  y: number;
  z: number;
  age: number;
  life: number;
  pair: number;
  kind: "gamma" | "pion";
}

export interface EventLog {
  id: number;
  t: number;
  kind: ParticleKind;
  piPlus: number;
  piMinus: number;
  pi0: number;
}

export interface Telemetry {
  t: number;
  matter: number;
  anti: number;
  pairs: number;
  energyMeV: number;
  energyJ: number;
  photons: number;
  pions: number;
  hits: number;
  finished: boolean;
  wallAlpha: number;
  log: EventLog[];
}

function gauss(): number {
  let u = 0;
  let v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function randDir(): [number, number, number] {
  const th = Math.random() * Math.PI * 2;
  const ph = Math.acos(2 * Math.random() - 1);
  return [Math.sin(ph) * Math.cos(th), Math.sin(ph) * Math.sin(th), Math.cos(ph)];
}

function chargeOf(kind: ParticleKind, anti: boolean): number {
  // e⁻ = −1, e⁺ = +1, p = +1, p̄ = −1
  if (kind === "electron") return anti ? 1 : -1;
  return anti ? -1 : 1;
}

export class Engine {
  kind: ParticleKind;
  particles: Particle[] = [];
  photons: Photon[] = [];
  pions: Pion[] = [];
  bursts: Burst[] = [];
  sparks: Spark[] = [];
  hits: Hit[] = [];
  log: EventLog[] = [];
  pairs = 0;
  hitCount = 0;
  t = 0;
  wall = true;
  wallAlpha = 1;
  annihilate = false;
  finished = false;
  finishTimer = 0;
  mass: number;
  radius: number;
  kCoulomb: number;
  B: number;
  /** kullanıcı denetimli manyetik alan çarpanı (0–2) */
  bScale = 1;
  restMeV: number;
  cSim = 8.2;
  private nextPair = 0;

  constructor(kind: ParticleKind, nM: number, nA: number) {
    this.kind = kind;
    const proton = kind === "proton";
    this.mass = proton ? 16 : 1;
    this.radius = proton ? 0.155 : 0.092;
    this.kCoulomb = proton ? 32 : 14;
    this.B = proton ? 1.15 : 0.72;
    this.restMeV = PARTICLES[kind].restEnergyMeV;
    const vth = proton ? 0.55 : 1.05;
    this.particles = [...this.spawn(nM, false, vth), ...this.spawn(nA, true, vth)];
  }

  private spawn(n: number, anti: boolean, vth: number): Particle[] {
    const out: Particle[] = [];
    const R = CHAMBER_R * 0.76;
    let guard = 0;
    while (out.length < n && guard < n * 80) {
      guard++;
      const x = (Math.random() * 2 - 1) * R;
      const y = (Math.random() * 2 - 1) * R;
      const z = (Math.random() * 2 - 1) * R;
      if (x * x + y * y + z * z > R * R) continue;
      if (!anti && x > -0.55) continue;
      if (anti && x < 0.55) continue;
      out.push({
        anti,
        x,
        y,
        z,
        vx: gauss() * vth * 0.38,
        vy: gauss() * vth * 0.38,
        vz: gauss() * vth * 0.38,
        ax: 0,
        ay: 0,
        az: 0,
        alive: true,
      });
    }
    while (out.length < n) {
      const side = anti ? 1 : -1;
      out.push({
        anti,
        x: side * (1.4 + Math.random() * 2.8),
        y: (Math.random() * 2 - 1) * 2.6,
        z: (Math.random() * 2 - 1) * 2.6,
        vx: gauss() * vth * 0.3,
        vy: gauss() * vth * 0.3,
        vz: gauss() * vth * 0.3,
        ax: 0,
        ay: 0,
        az: 0,
        alive: true,
      });
    }
    return out;
  }

  start() {
    this.annihilate = true;
    this.wall = false;
  }

  private forces() {
    const ps = this.particles;
    for (const p of ps) {
      p.ax = 0;
      p.ay = 0;
      p.az = 0;
    }
    const n = ps.length;
    const k = this.kCoulomb;
    const eps2 = 0.14 * 0.14;
    const m = this.mass;
    const kind = this.kind;

    for (let i = 0; i < n; i++) {
      const a = ps[i];
      if (!a.alive) continue;
      const qa = chargeOf(kind, a.anti);
      for (let j = i + 1; j < n; j++) {
        const b = ps[j];
        if (!b.alive) continue;
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const dz = a.z - b.z;
        const d2 = dx * dx + dy * dy + dz * dz + eps2;
        const inv = 1 / Math.sqrt(d2);
        const inv3 = inv * inv * inv;
        const qb = chargeOf(kind, b.anti);
        // F_a = k qa qb (r_a − r_b) / r³
        const s = k * qa * qb * inv3;
        const fx = s * dx;
        const fy = s * dy;
        const fz = s * dz;
        a.ax += fx / m;
        a.ay += fy / m;
        a.az += fz / m;
        b.ax -= fx / m;
        b.ay -= fy / m;
        b.az -= fz / m;
      }
    }

    const B = this.B * this.bScale;
    if (B !== 0) {
      for (const p of ps) {
        if (!p.alive) continue;
        const q = chargeOf(kind, p.anti);
        const coef = (q * B) / m;
        // B = (0, B, 0) → v × B = (−vz B, 0, vx B)
        p.ax += coef * -p.vz;
        p.az += coef * p.vx;
      }
    }
  }

  private confine(p: { x: number; y: number; z: number; vx: number; vy: number; vz: number }, rad: number) {
    const R = CHAMBER_R - rad;
    const r2 = p.x * p.x + p.y * p.y + p.z * p.z;
    if (r2 > R * R) {
      const r = Math.sqrt(r2);
      const nx = p.x / r;
      const ny = p.y / r;
      const nz = p.z / r;
      const vn = p.vx * nx + p.vy * ny + p.vz * nz;
      if (vn > 0) {
        p.vx -= 1.72 * vn * nx;
        p.vy -= 1.72 * vn * ny;
        p.vz -= 1.72 * vn * nz;
      }
      const s = (R / r) * 0.998;
      p.x *= s;
      p.y *= s;
      p.z *= s;
    }
  }

  private pushPhoton(x: number, y: number, z: number, vx: number, vy: number, vz: number, pair: number) {
    this.photons.push({ x, y, z, vx, vy, vz, ox: x, oy: y, oz: z, age: 0, life: 2.2, pair, hit: false, phase: Math.random() * 6.28 });
  }

  /** Arka arkaya iki foton: durgun çerçevede zıt yönlü, CM hızıyla hafif kaydırılmış */
  private photonPair(x: number, y: number, z: number, vcx: number, vcy: number, vcz: number) {
    const [ux, uy, uz] = randDir();
    const c = this.cSim;
    const pair = this.nextPair++;
    this.pushPhoton(x, y, z, ux * c + vcx, uy * c + vcy, uz * c + vcz, pair);
    this.pushPhoton(x, y, z, -ux * c + vcx, -uy * c + vcy, -uz * c + vcz, pair);
  }

  private spawnSparks(x: number, y: number, z: number, n: number, speed: number) {
    for (let i = 0; i < n; i++) {
      const [ux, uy, uz] = randDir();
      const sp = speed * (0.35 + Math.random() * 0.9);
      this.sparks.push({
        x,
        y,
        z,
        vx: ux * sp,
        vy: uy * sp,
        vz: uz * sp,
        age: 0,
        life: 0.35 + Math.random() * 0.55,
        warm: Math.random(),
      });
    }
  }

  private emitProducts(x: number, y: number, z: number, a: Particle, b: Particle) {
    const vcx = (a.vx + b.vx) * 0.5 * 0.18;
    const vcy = (a.vy + b.vy) * 0.5 * 0.18;
    const vcz = (a.vz + b.vz) * 0.5 * 0.18;
    const entry: EventLog = { id: this.pairs, t: this.t, kind: this.kind, piPlus: 0, piMinus: 0, pi0: 0 };

    if (this.kind === "electron") {
      this.photonPair(x, y, z, vcx, vcy, vcz);
      this.spawnSparks(x, y, z, 14, 2.6);
    } else {
      // Yük korunumu: π⁺π⁻ çiftleri + π⁰'lar (net yük 0). Tipik çokluk ≈ 3–6.
      const chargedPairs = Math.random() < 0.6 ? 1 : 2;
      const neutral = 1 + (Math.random() < 0.55 ? 1 : 0);
      const charges: number[] = [];
      for (let i = 0; i < chargedPairs; i++) charges.push(1, -1);
      for (let i = 0; i < neutral; i++) charges.push(0);

      const vels = charges.map(() => {
        const [ux, uy, uz] = randDir();
        const sp = 1.8 + Math.random() * 2.2;
        return [ux * sp, uy * sp, uz * sp];
      });
      // Momentum korunumu: CM çerçevesinde toplam momentum sıfır
      const mx = vels.reduce((s, v) => s + v[0], 0) / vels.length;
      const my = vels.reduce((s, v) => s + v[1], 0) / vels.length;
      const mz = vels.reduce((s, v) => s + v[2], 0) / vels.length;
      charges.forEach((q, i) => {
        const trail = new Float32Array(PION_TRAIL * 3);
        this.pions.push({
          x,
          y,
          z,
          vx: vels[i][0] - mx + vcx,
          vy: vels[i][1] - my + vcy,
          vz: vels[i][2] - mz + vcz,
          charge: q,
          age: 0,
          // π⁰ neredeyse anında (τ ≈ 8.5×10⁻¹⁷ s) iki fotona bozunur; π± odadan çıkar
          life: q === 0 ? 0.06 + Math.random() * 0.08 : 3,
          alive: true,
          trail,
          head: 0,
          len: 0,
        });
        if (q > 0) entry.piPlus++;
        else if (q < 0) entry.piMinus++;
        else entry.pi0++;
      });
      this.spawnSparks(x, y, z, 30, 3.4);
    }

    this.bursts.push({ x, y, z, age: 0, life: this.kind === "proton" ? 0.9 : 0.65, heavy: this.kind === "proton" });
    this.log.push(entry);
    if (this.log.length > 8) this.log.shift();
  }

  private annihilatePairs() {
    const ps = this.particles;
    const n = ps.length;
    const r2 = (this.radius * 3.15) ** 2;
    for (let i = 0; i < n; i++) {
      const a = ps[i];
      if (!a.alive) continue;
      for (let j = i + 1; j < n; j++) {
        const b = ps[j];
        if (!b.alive || a.anti === b.anti) continue;
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const dz = a.z - b.z;
        if (dx * dx + dy * dy + dz * dz < r2) {
          a.alive = false;
          b.alive = false;
          this.pairs++;
          this.emitProducts((a.x + b.x) * 0.5, (a.y + b.y) * 0.5, (a.z + b.z) * 0.5, a, b);
          break;
        }
      }
    }
  }

  private addHit(x: number, y: number, z: number, pair: number, kind: Hit["kind"]) {
    const r = Math.hypot(x, y, z) || 1;
    const s = CHAMBER_R / r;
    this.hits.push({ x: x * s, y: y * s, z: z * s, age: 0, life: kind === "gamma" ? 2.6 : 1.8, pair, kind });
    this.hitCount++;
  }

  step(dt: number) {
    if (dt <= 0) return;
    const cap = Math.min(dt, 0.066);
    const sub = cap > 0.034 ? 6 : 3;
    const h = cap / sub;

    for (let s = 0; s < sub; s++) {
      this.forces();
      for (const p of this.particles) {
        if (!p.alive) continue;
        if (this.wall) {
          if (p.anti && p.x < 0.42) p.ax += 55 * (0.42 - p.x);
          if (!p.anti && p.x > -0.42) p.ax -= 55 * (p.x + 0.42);
        }
        p.vx += p.ax * h;
        p.vy += p.ay * h;
        p.vz += p.az * h;
        const damp = 1 - 0.045 * h;
        p.vx *= damp;
        p.vy *= damp;
        p.vz *= damp;
        p.x += p.vx * h;
        p.y += p.vy * h;
        p.z += p.vz * h;
        this.confine(p, this.radius);
      }
      if (this.annihilate) this.annihilatePairs();
    }

    if (!this.wall) this.wallAlpha = Math.max(0, this.wallAlpha - cap * 1.7);

    // Fotonlar: ışık hızıyla düz çizgi; duvarı geçtikleri an dedektör isabeti
    const R2 = CHAMBER_R * CHAMBER_R;
    for (const g of this.photons) {
      g.age += cap;
      g.x += g.vx * cap;
      g.y += g.vy * cap;
      g.z += g.vz * cap;
      if (!g.hit && g.x * g.x + g.y * g.y + g.z * g.z >= R2) {
        g.hit = true;
        this.addHit(g.x, g.y, g.z, g.pair, "gamma");
        g.life = Math.min(g.life, g.age + 0.22);
      }
    }
    this.photons = this.photons.filter((g) => g.age < g.life);

    // Pionlar: yüklüler B alanında sarmal çizer (Lorentz), π⁰ → γγ
    const Bp = this.B * this.bScale * 0.9;
    for (const pi of this.pions) {
      if (!pi.alive) continue;
      pi.age += cap;
      if (pi.charge !== 0 && Bp !== 0) {
        const nsub = 4;
        const hh = cap / nsub;
        for (let k = 0; k < nsub; k++) {
          const coef = pi.charge * Bp;
          const ax = coef * -pi.vz;
          const az = coef * pi.vx;
          pi.vx += ax * hh;
          pi.vz += az * hh;
          pi.x += pi.vx * hh;
          pi.y += pi.vy * hh;
          pi.z += pi.vz * hh;
        }
      } else {
        pi.x += pi.vx * cap;
        pi.y += pi.vy * cap;
        pi.z += pi.vz * cap;
      }
      const o = pi.head * 3;
      pi.trail[o] = pi.x;
      pi.trail[o + 1] = pi.y;
      pi.trail[o + 2] = pi.z;
      pi.head = (pi.head + 1) % PION_TRAIL;
      pi.len = Math.min(PION_TRAIL, pi.len + 1);

      if (pi.charge === 0 && pi.age >= pi.life) {
        pi.alive = false;
        this.photonPair(pi.x, pi.y, pi.z, pi.vx * 0.25, pi.vy * 0.25, pi.vz * 0.25);
      } else if (pi.x * pi.x + pi.y * pi.y + pi.z * pi.z >= R2) {
        pi.alive = false;
        this.addHit(pi.x, pi.y, pi.z, -1, "pion");
      } else if (pi.age >= pi.life) {
        pi.alive = false;
      }
    }
    this.pions = this.pions.filter((p) => p.alive);

    for (const sp of this.sparks) {
      sp.age += cap;
      const drag = Math.exp(-3.2 * cap);
      sp.vx *= drag;
      sp.vy *= drag;
      sp.vz *= drag;
      sp.x += sp.vx * cap;
      sp.y += sp.vy * cap;
      sp.z += sp.vz * cap;
    }
    this.sparks = this.sparks.filter((s) => s.age < s.life);

    for (const b of this.bursts) b.age += cap;
    this.bursts = this.bursts.filter((b) => b.age < b.life);
    for (const hit of this.hits) hit.age += cap;
    this.hits = this.hits.filter((hit) => hit.age < hit.life);

    this.t += cap;

    let mCount = 0;
    let aCount = 0;
    for (const p of this.particles) {
      if (!p.alive) continue;
      if (p.anti) aCount++;
      else mCount++;
    }
    if (this.annihilate && (mCount === 0 || aCount === 0)) {
      this.finishTimer += cap;
      if (this.finishTimer > 1.6 && this.photons.length === 0 && this.pions.length === 0) this.finished = true;
    }
  }

  telemetry(): Telemetry {
    let m = 0;
    let a = 0;
    for (const p of this.particles) {
      if (!p.alive) continue;
      if (p.anti) a++;
      else m++;
    }
    const energyMeV = this.pairs * 2 * this.restMeV;
    return {
      t: this.t,
      matter: m,
      anti: a,
      pairs: this.pairs,
      energyMeV,
      energyJ: energyMeV * MEV_TO_J,
      photons: this.photons.length,
      pions: this.pions.length,
      hits: this.hitCount,
      finished: this.finished,
      wallAlpha: this.wallAlpha,
      log: this.log,
    };
  }
}
