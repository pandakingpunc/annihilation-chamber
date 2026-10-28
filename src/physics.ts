// CODATA 2018 / SI 2019 tanımlı sabitler
export const C = 299792458; // m/s (tam)
export const EV_TO_J = 1.602176634e-19; // J (tam)
export const MEV_TO_J = EV_TO_J * 1e6;
export const TNT_J_PER_G = 4184; // tanım
export const H_PLANCK = 6.62607015e-34; // J·s (tam)

export type ParticleKind = "electron" | "proton";
export type Lang = "en" | "tr";

export interface ParticleSpec {
  id: ParticleKind;
  matterSymbol: string;
  antimatterSymbol: string;
  massKg: number;
  restEnergyMeV: number;
  productShort: string;
}

// İsimler ve açıklamalar i18n.ts içinde; burada yalnızca dilden bağımsız fizik var.
export const PARTICLES: Record<ParticleKind, ParticleSpec> = {
  electron: {
    id: "electron",
    matterSymbol: "e⁻",
    antimatterSymbol: "e⁺",
    massKg: 9.1093837015e-31,
    restEnergyMeV: 0.51099895,
    productShort: "e⁻ + e⁺ → γ + γ",
  },
  proton: {
    id: "proton",
    matterSymbol: "p",
    antimatterSymbol: "p̄",
    massKg: 1.67262192369e-27,
    restEnergyMeV: 938.27208816,
    productShort: "p + p̄ → π⁺ π⁻ π⁰ …",
  },
};

export interface Result {
  pairs: number;
  leftoverMatter: number;
  leftoverAntimatter: number;
  energyJ: number;
  energyMeV: number;
  massConvertedKg: number;
  perPairMeV: number;
  perPairJ: number;
}

export function compute(kind: ParticleKind, matter: number, antimatter: number): Result {
  const spec = PARTICLES[kind];
  const pairs = Math.min(matter, antimatter);
  const massConvertedKg = pairs * 2 * spec.massKg;
  const energyJ = massConvertedKg * C * C;
  return {
    pairs,
    leftoverMatter: matter - pairs,
    leftoverAntimatter: antimatter - pairs,
    energyJ,
    energyMeV: energyJ / MEV_TO_J,
    massConvertedKg,
    perPairMeV: 2 * spec.restEnergyMeV,
    perPairJ: 2 * spec.massKg * C * C,
  };
}

const SUP: Record<string, string> = {
  "-": "⁻",
  "+": "⁺",
  "0": "⁰",
  "1": "¹",
  "2": "²",
  "3": "³",
  "4": "⁴",
  "5": "⁵",
  "6": "⁶",
  "7": "⁷",
  "8": "⁸",
  "9": "⁹",
};

export function sci(x: number, lang: Lang, digits = 3): string {
  if (x === 0) return "0";
  const n = x.toExponential(digits);
  const [m, e] = n.split("e");
  const exp = parseInt(e, 10);
  const mant = lang === "tr" ? m.replace(".", ",") : m;
  if (exp === 0) return mant;
  const expStr = String(exp)
    .split("")
    .map((ch) => SUP[ch] ?? ch)
    .join("");
  return `${mant}×10${expStr}`;
}

export function fmt(x: number, lang: Lang, digits = 3): string {
  if (x === 0) return "0";
  const abs = Math.abs(x);
  if (abs >= 1e6 || abs < 1e-2) return sci(x, lang, digits);
  return x.toLocaleString(lang === "tr" ? "tr-TR" : "en-US", { maximumSignificantDigits: digits + 1 });
}

/** Karşılaştırma ölçütleri — etiketleri i18n.ts'de. J: bir birimin enerjisi. */
export const COMPARISONS = [
  { id: "tnt", J: TNT_J_PER_G },
  { id: "aa", J: 2.5 * 3600 },
  { id: "kwh", J: 3.6e6 },
  { id: "calorie", J: 4.184 },
  { id: "led", J: 1 },
  { id: "mosquito", J: 3.1e-7 },
  { id: "photon550", J: (H_PLANCK * C) / 550e-9 },
] as const;
export type ComparisonId = (typeof COMPARISONS)[number]["id"];

/** "Ölçeği büyüt" hesaplayıcısı: m gram antimadde + m gram madde. */
export function scaleUp(grams: number) {
  const energyJ = 2 * (grams / 1000) * C * C;
  return {
    energyJ,
    ktTNT: energyJ / (TNT_J_PER_G * 1e9),
    hiroshima: energyJ / (15e3 * 4.184e9),
    homeYears: energyJ / (4000 * 3.6e6), // 4000 kWh/yıl kullanan bir ev
    worldSeconds: energyJ / (6.2e20 / (365.25 * 86400)), // ~620 EJ/yıl küresel birincil enerji
  };
}
