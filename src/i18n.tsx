import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { ComparisonId, Lang, ParticleKind } from "./physics";

const en = {
  htmlTitle: "Annihilation Chamber — matter vs antimatter",
  kicker: "Vacuum chamber · N-body Coulomb + B field",
  title: "Matter–antimatter annihilation simulator",
  status: { idle: "READY", running: "RUNNING", paused: "PAUSED", done: "COMPLETE" },

  channel: "Channel",
  names: {
    electron: { matter: "Electron", anti: "Positron" },
    proton: { matter: "Proton", anti: "Antiproton" },
  } as Record<ParticleKind, { matter: string; anti: string }>,
  product: {
    electron:
      "In the rest frame: two gamma photons of 511 keV each, emitted 180° apart (momentum conservation). If the pair's centre of mass is moving, the lab angle deviates slightly from 180°.",
    proton:
      "Typically 3–6 pions (π⁺, π⁻, π⁰). Each π⁰ decays almost instantly into two gamma rays (τ ≈ 8.5×10⁻¹⁷ s); charged pions curl in the magnetic field and leave the chamber. Total rest energy ≈ 1.876 GeV.",
  } as Record<ParticleKind, string>,

  injection: "Injection",
  matter: "Matter",
  antimatter: "Antimatter",
  matterHint: "q = −e for e⁻, +e for p",
  antiHint: "opposite charge · Coulomb attraction",

  fieldTime: "Field & time",
  bField: "Magnetic field B",
  bHint: "Lorentz force F = q(v × B) curls the tracks",
  bOff: "off",
  speed: "Time scale",
  slowmo: "slow-mo",
  pause: "Pause",
  resume: "Resume",
  autoRotate: "Auto-rotate camera",

  expected: "Expected annihilation",
  pairs: "pairs",
  leftover: "leftover",
  leftoverMatter: (n: number) => `${n} matter`,
  leftoverAnti: (n: number) => `${n} anti`,
  none: "none",
  ePerPair: "E / pair",

  start: "Remove the separator",
  running: "Annihilating…",
  reset: "Reset",
  explain:
    "Matter and antimatter start in opposite hemispheres, held apart by a separator. Once it is removed, opposite charges attract (Coulomb) while the magnetic field bends their paths. When a pair gets close enough it annihilates; the larger side is left over.",
  keys: "Space: start / pause · R: reset · drag: orbit camera",

  photons: "γ photons",
  pions: "π pions",
  hits: "detector hits",
  pairsLabel: "pairs",
  simTime: "sim",
  drag: "drag: orbit · scroll: zoom",
  scopeIdle: "oscilloscope · E(t) and N(t) are plotted once the separator is removed",
  scopeMatter: "N matter",
  scopeAnti: "N antimatter",
  scopeE: "E released (MeV)",
  eventsTitle: "Event log",
  petNote: "PET principle: the two 511 keV photons hit opposite sides of the detector — the line between the hits passes through the annihilation point.",
  petNoteProton: "Pion tracks spiral in the magnetic field like in a bubble chamber; π⁰ → γγ decays add gamma hits on the wall.",

  results: "Results",
  resultsSub: "rest-mass energy released",
  showResults: "Show results",
  close: "Close",
  runAgain: "Run again",
  rPairs: "Annihilated pairs",
  rPairsSub: (n: number, sim: number) => `${n} particles · simulated ${sim}`,
  rLeft: "Leftover",
  rLeftMatter: (n: number, sym: string) => `${n} ${sym} matter`,
  rLeftAnti: (n: number, sym: string) => `${n} ${sym} antimatter`,
  rLeftNone: "None — perfectly symmetric",
  rLeftWhy: "Like charges repel, so the excess stays in the chamber.",
  rMass: "Mass converted Δm",
  rEnergy: "E = Δm c²",
  derivation: "Step by step",
  perPair: (mev: string, j: string) => `Per pair: ${mev} MeV = ${j} J.`,
  conservation: "Conservation checks",
  consEnergy: "Energy — all rest mass becomes photon / pion energy",
  consMomentum: "Momentum — products fly out back-to-back in the CM frame",
  consCharge: "Electric charge — net charge before and after is zero",
  consLepton: "Lepton number — e⁻ (+1) + e⁺ (−1) = 0 → photons (0)",
  consBaryon: "Baryon number — p (+1) + p̄ (−1) = 0 → pions (0)",
  equivalent: "What is this energy equal to?",
  cmp: {
    tnt: "TNT equivalent",
    aa: "AA battery (~2.5 Wh)",
    kwh: "1 kWh of electricity",
    calorie: "1 calorie (1 g water, +1 °C)",
    led: "1 W LED",
    mosquito: "Flying mosquito KE (~0.3 µJ)",
    photon550: "Green photons (550 nm)",
  } as Record<ComparisonId, string>,
  cmpUnit: {
    tnt: "g TNT",
    led: "s of light",
    photon550: "photons",
  } as Partial<Record<ComparisonId, string>>,
  times: "×",
  scaleTitle: "Scale it up",
  scaleSub: "What if it were grams instead of particles? (m of antimatter + m of matter)",
  scaleMass: "Antimatter mass",
  scaleEnergy: "Energy",
  scaleKt: "kilotons of TNT",
  scaleHiroshima: "Hiroshima bombs (~15 kt)",
  scaleHome: "years of a home (4,000 kWh/yr)",
  scaleWorld: "of world energy use",
  seconds: "s",
  scaleNote:
    "All the antimatter ever produced by humanity amounts to only nanograms — and it costs far more energy to make than it releases.",
  modelNote:
    "Dynamics (Coulomb, B, speeds) are scaled for education so single particles are visible in a macroscopic chamber. The energy accounting uses real SI values. 1 g + 1 g of antimatter ≈ 1.80×10¹⁴ J ≈ 43 kt TNT.",
  logElectron: "e⁻ + e⁺ → γ + γ  (2 × 511 keV)",
};

export type Dict = typeof en;

const tr: Dict = {
  htmlTitle: "Anihilasyon odası — madde / antimadde",
  kicker: "Vakum odası · N-cisim Coulomb + B alanı",
  title: "Madde–antimadde anihilasyon simülasyonu",
  status: { idle: "HAZIR", running: "KOŞUYOR", paused: "DURAKLATILDI", done: "BİTTİ" },

  channel: "Kanal",
  names: {
    electron: { matter: "Elektron", anti: "Pozitron" },
    proton: { matter: "Proton", anti: "Antiproton" },
  },
  product: {
    electron:
      "Durgun çerçevede iki gama fotonu, her biri 511 keV, 180° zıt yönde (momentum korunumu). Çiftin kütle merkezi hareket ediyorsa laboratuvar açısı 180°'den biraz sapar.",
    proton:
      "Tipik olarak 3–6 pion (π⁺, π⁻, π⁰). Her π⁰ neredeyse anında iki gama ışınına bozunur (τ ≈ 8,5×10⁻¹⁷ s); yüklü pionlar manyetik alanda kıvrılıp odadan çıkar. Toplam durgun enerji ≈ 1,876 GeV.",
  },

  injection: "Enjeksiyon",
  matter: "Madde",
  antimatter: "Antimadde",
  matterHint: "q = e⁻ için −e, p için +e",
  antiHint: "zıt yük · Coulomb çekimi",

  fieldTime: "Alan ve zaman",
  bField: "Manyetik alan B",
  bHint: "Lorentz kuvveti F = q(v × B) izleri kıvırır",
  bOff: "kapalı",
  speed: "Zaman ölçeği",
  slowmo: "ağır çekim",
  pause: "Duraklat",
  resume: "Devam",
  autoRotate: "Kamerayı otomatik döndür",

  expected: "Beklenen yok oluş",
  pairs: "çift",
  leftover: "artan",
  leftoverMatter: (n) => `${n} madde`,
  leftoverAnti: (n) => `${n} anti`,
  none: "yok",
  ePerPair: "E / çift",

  start: "Ayırıcıyı kaldır",
  running: "Anihilasyon…",
  reset: "Sıfırla",
  explain:
    "Madde ve antimadde zıt yarımkürelerde, bir ayırıcıyla ayrı tutulur. Ayırıcı kalkınca zıt yükler birbirini çeker (Coulomb), manyetik alan da yörüngelerini büker. Bir çift yeterince yaklaşınca yok olur; fazla olan taraf kalır.",
  keys: "Boşluk: başlat / duraklat · R: sıfırla · sürükle: kamerayı döndür",

  photons: "γ foton",
  pions: "π pion",
  hits: "dedektör isabeti",
  pairsLabel: "çift",
  simTime: "sim",
  drag: "sürükle: döndür · tekerlek: yakınlaştır",
  scopeIdle: "osiloskop · ayırıcı kaldırılınca E(t) ve N(t) çizilir",
  scopeMatter: "N madde",
  scopeAnti: "N antimadde",
  scopeE: "açığa çıkan E (MeV)",
  eventsTitle: "Olay kaydı",
  petNote: "PET ilkesi: 511 keV'lik iki foton dedektörün zıt taraflarına çarpar — iki isabeti birleştiren çizgi anihilasyon noktasından geçer.",
  petNoteProton: "Pion izleri, kabarcık odasındaki gibi manyetik alanda sarmal çizer; π⁰ → γγ bozunumları duvarda gama isabetleri bırakır.",

  results: "Sonuç",
  resultsSub: "açığa çıkan durgun kütle enerjisi",
  showResults: "Sonucu göster",
  close: "Kapat",
  runAgain: "Tekrar çalıştır",
  rPairs: "Yok olan çift",
  rPairsSub: (n, sim) => `${n} parçacık · simülasyonda ${sim}`,
  rLeft: "Arta kalan",
  rLeftMatter: (n, sym) => `${n} ${sym} madde`,
  rLeftAnti: (n, sym) => `${n} ${sym} antimadde`,
  rLeftNone: "Yok — tam simetrik yok oluş",
  rLeftWhy: "Aynı yükler birbirini iter; fazlalık odada kalır.",
  rMass: "Dönüşen kütle Δm",
  rEnergy: "E = Δm c²",
  derivation: "Adım adım",
  perPair: (mev, j) => `Çift başına: ${mev} MeV = ${j} J.`,
  conservation: "Korunum kontrolleri",
  consEnergy: "Enerji — tüm durgun kütle foton / pion enerjisine dönüşür",
  consMomentum: "Momentum — ürünler CM çerçevesinde zıt yönlere fırlar",
  consCharge: "Elektrik yükü — önce ve sonra net yük sıfır",
  consLepton: "Lepton sayısı — e⁻ (+1) + e⁺ (−1) = 0 → fotonlar (0)",
  consBaryon: "Baryon sayısı — p (+1) + p̄ (−1) = 0 → pionlar (0)",
  equivalent: "Bu enerji neye denk?",
  cmp: {
    tnt: "TNT eşdeğeri",
    aa: "AA pil (~2,5 Wh)",
    kwh: "1 kWh elektrik",
    calorie: "1 kalori (1 g su, +1 °C)",
    led: "1 W LED",
    mosquito: "Uçan sivrisinek KE (~0,3 µJ)",
    photon550: "Yeşil foton (550 nm)",
  },
  cmpUnit: {
    tnt: "g TNT",
    led: "s ışık",
    photon550: "foton",
  },
  times: "×",
  scaleTitle: "Ölçeği büyüt",
  scaleSub: "Parçacık yerine gram olsaydı? (m antimadde + m madde)",
  scaleMass: "Antimadde kütlesi",
  scaleEnergy: "Enerji",
  scaleKt: "kiloton TNT",
  scaleHiroshima: "Hiroşima bombası (~15 kt)",
  scaleHome: "yıl bir evin tüketimi (4.000 kWh/yıl)",
  scaleWorld: "dünya enerji tüketimi",
  seconds: "sn",
  scaleNote:
    "İnsanlığın bugüne kadar ürettiği tüm antimadde yalnızca nanogramlar düzeyinde — ve üretmek, açığa çıkardığından çok daha fazla enerji harcıyor.",
  modelNote:
    "Dinamik (Coulomb, B, hızlar) eğitim amaçlı ölçeklendirilmiştir; tek tek parçacıklar makroskopik odada görünsün diye. Enerji hesabı gerçek SI değerleriyle yapılır. 1 g + 1 g antimadde ≈ 1,80×10¹⁴ J ≈ 43 kt TNT.",
  logElectron: "e⁻ + e⁺ → γ + γ  (2 × 511 keV)",
};

const DICTS: Record<Lang, Dict> = { en, tr };
const STORE_KEY = "annihilation.lang";

function initialLang(): Lang {
  try {
    const v = localStorage.getItem(STORE_KEY);
    if (v === "en" || v === "tr") return v;
  } catch {
    /* depolama yoksa varsayılan */
  }
  return "en";
}

interface I18n {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: Dict;
}

const Ctx = createContext<I18n>({ lang: "en", setLang: () => {}, t: en });

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(initialLang);
  const setLang = (l: Lang) => {
    setLangState(l);
    try {
      localStorage.setItem(STORE_KEY, l);
    } catch {
      /* yok say */
    }
  };
  useEffect(() => {
    document.documentElement.lang = lang;
    document.title = DICTS[lang].htmlTitle;
  }, [lang]);
  return <Ctx.Provider value={{ lang, setLang, t: DICTS[lang] }}>{children}</Ctx.Provider>;
}

export const useI18n = () => useContext(Ctx);
