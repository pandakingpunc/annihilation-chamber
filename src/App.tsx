import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Simulation, { type Phase } from "./Simulation";
import type { EventLog, Telemetry } from "./engine";
import { PARTICLES, COMPARISONS, compute, fmt, sci, scaleUp, C, type Lang, type ParticleKind } from "./physics";
import { useI18n } from "./i18n";

const EMPTY: Telemetry = {
  t: 0,
  matter: 0,
  anti: 0,
  pairs: 0,
  energyMeV: 0,
  energyJ: 0,
  photons: 0,
  pions: 0,
  hits: 0,
  finished: false,
  wallAlpha: 1,
  log: [],
};

const SPEEDS = [0.25, 0.5, 1, 2];

export default function App() {
  const { t, lang, setLang } = useI18n();
  const [kind, setKind] = useState<ParticleKind>("electron");
  const [matter, setMatter] = useState(36);
  const [antimatter, setAntimatter] = useState(24);
  const [phase, setPhase] = useState<Phase>("idle");
  const [runId, setRunId] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [paused, setPaused] = useState(false);
  const [bScale, setBScale] = useState(1);
  const [autoRotate, setAutoRotate] = useState(true);
  const [showResults, setShowResults] = useState(true);
  const [tel, setTel] = useState<Telemetry>(EMPTY);
  const [history, setHistory] = useState<Telemetry[]>([]);
  const histRef = useRef<Telemetry[]>([]);

  const spec = PARTICLES[kind];
  const names = t.names[kind];
  const result = useMemo(() => compute(kind, matter, antimatter), [kind, matter, antimatter]);
  const lastUi = useRef(0);

  const start = () => {
    if (phase !== "idle" || result.pairs === 0) return;
    histRef.current = [];
    setHistory([]);
    setPaused(false);
    setShowResults(true);
    setPhase("running");
  };
  const reset = () => {
    setPhase("idle");
    setPaused(false);
    setRunId((n) => n + 1);
    histRef.current = [];
    setHistory([]);
    setTel({ ...EMPTY, matter, anti: antimatter });
  };
  const runAgain = () => {
    histRef.current = [];
    setHistory([]);
    setPaused(false);
    setShowResults(true);
    setRunId((n) => n + 1);
    setPhase("running");
  };

  const onStats = (tl: Telemetry) => {
    const now = performance.now();
    if (now - lastUi.current > 70) {
      lastUi.current = now;
      setTel({ ...tl, log: [...tl.log] });
    }
    if (phase === "running") {
      const h = histRef.current;
      if (h.length === 0 || tl.t - h[h.length - 1].t > 0.05) {
        h.push({ ...tl, log: [] });
        if (h.length > 400) h.shift();
      }
    }
  };

  useEffect(() => {
    if (phase !== "done") return;
    setHistory([...histRef.current]);
  }, [phase]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === "INPUT") return;
      if (e.code === "Space") {
        e.preventDefault();
        if (phase === "idle") start();
        else if (phase === "running") setPaused((p) => !p);
      }
      if (e.key === "r" || e.key === "R") reset();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const status = phase === "running" && paused ? t.status.paused : t.status[phase];
  const effSpeed = phase === "running" && paused ? 0 : speed;
  const locked = phase !== "idle";

  return (
    <div className="flex min-h-screen flex-col bg-[#04060c] font-sans text-slate-100 md:h-screen md:overflow-hidden">
      <header className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-2.5 md:px-5">
        <div className="min-w-0">
          <div className="truncate text-[10px] uppercase tracking-[0.28em] text-cyan-400/80">{t.kicker}</div>
          <h1 className="truncate text-base font-semibold tracking-tight md:text-lg">{t.title}</h1>
        </div>
        <div className="flex shrink-0 items-center gap-3 text-[11px] text-slate-400 md:gap-5">
          <span className="hidden font-mono lg:inline">c = 299 792 458 m/s</span>
          <span className="hidden font-mono lg:inline">E = mc²</span>
          <span className="hidden rounded border border-white/10 px-2 py-0.5 font-mono text-slate-300 sm:inline">{status}</span>
          <LangSwitch lang={lang} setLang={setLang} />
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col-reverse md:flex-row">
        <aside className="shrink-0 border-t border-white/10 bg-black/40 p-4 md:w-[300px] md:overflow-y-auto md:border-r md:border-t-0">
          <Section title={t.channel}>
            <div className="grid grid-cols-2 gap-2">
              {(Object.keys(PARTICLES) as ParticleKind[]).map((k) => {
                const s = PARTICLES[k];
                const on = kind === k;
                return (
                  <button
                    key={k}
                    disabled={locked}
                    onClick={() => setKind(k)}
                    className={`rounded-lg border px-2.5 py-2 text-left text-xs leading-tight disabled:opacity-40 ${
                      on ? "border-cyan-400/70 bg-cyan-400/10" : "border-white/10 hover:bg-white/5"
                    }`}
                  >
                    <div className="font-semibold">
                      {s.matterSymbol} / {s.antimatterSymbol}
                    </div>
                    <div className="mt-0.5 text-[10px] text-slate-400">
                      {t.names[k].matter} / {t.names[k].anti}
                    </div>
                    <div className="text-[10px] text-slate-500">
                      {s.restEnergyMeV < 1 ? s.restEnergyMeV.toFixed(4) : s.restEnergyMeV.toFixed(3)} MeV
                    </div>
                  </button>
                );
              })}
            </div>
            <p className="mt-2 font-mono text-[10px] leading-relaxed text-slate-500">
              m = {sci(spec.massKg, lang, 4)} kg
              <br />
              {spec.productShort}
            </p>
          </Section>

          <Section title={t.injection}>
            <Counter
              label={`${t.matter}  ${spec.matterSymbol}`}
              hint={t.matterHint}
              value={matter}
              color="#3ecbff"
              disabled={locked}
              set={setMatter}
            />
            <div className="h-3" />
            <Counter
              label={`${t.antimatter}  ${spec.antimatterSymbol}`}
              hint={t.antiHint}
              value={antimatter}
              color="#ff4d7a"
              disabled={locked}
              set={setAntimatter}
            />
            <div className="mt-3 flex flex-wrap gap-1.5">
              {[
                [1, 1],
                [12, 12],
                [36, 24],
                [20, 40],
                [80, 80],
              ].map(([a, b]) => (
                <button
                  key={`${a}-${b}`}
                  disabled={locked}
                  onClick={() => {
                    setMatter(a);
                    setAntimatter(b);
                  }}
                  className="rounded border border-white/10 px-2 py-0.5 font-mono text-[10px] text-slate-400 hover:bg-white/5 disabled:opacity-40"
                >
                  {a}:{b}
                </button>
              ))}
            </div>
          </Section>

          <Section title={t.fieldTime}>
            <div className="mb-1 flex items-baseline justify-between text-xs">
              <span className="text-slate-300">{t.bField}</span>
              <span className="font-mono text-violet-300">{bScale === 0 ? t.bOff : `${bScale.toFixed(2)}×`}</span>
            </div>
            <input
              type="range"
              min={0}
              max={2}
              step={0.05}
              value={bScale}
              onChange={(e) => setBScale(+e.target.value)}
              className="w-full"
              style={{ accentColor: "#a78bfa" }}
            />
            <div className="mt-1 text-[10px] text-slate-500">{t.bHint}</div>

            <div className="mb-1 mt-3 flex items-baseline justify-between text-xs">
              <span className="text-slate-300">{t.speed}</span>
              {speed < 1 && <span className="font-mono text-[10px] text-amber-300">{t.slowmo}</span>}
            </div>
            <div className="flex gap-1">
              {SPEEDS.map((s) => (
                <button
                  key={s}
                  onClick={() => setSpeed(s)}
                  className={`flex-1 rounded border py-1 font-mono text-[11px] ${
                    speed === s ? "border-amber-300/60 bg-amber-300/10 text-amber-200" : "border-white/10 text-slate-400 hover:bg-white/5"
                  }`}
                >
                  {s}×
                </button>
              ))}
            </div>
            <label className="mt-3 flex cursor-pointer items-center gap-2 text-[11px] text-slate-400">
              <input type="checkbox" checked={autoRotate} onChange={(e) => setAutoRotate(e.target.checked)} style={{ accentColor: "#22d3ee" }} />
              {t.autoRotate}
            </label>
          </Section>

          <Section title={t.expected}>
            <div className="grid grid-cols-2 gap-2 font-mono text-xs">
              <KV k={t.pairs} v={String(result.pairs)} />
              <KV
                k={t.leftover}
                v={
                  result.leftoverMatter
                    ? t.leftoverMatter(result.leftoverMatter)
                    : result.leftoverAntimatter
                      ? t.leftoverAnti(result.leftoverAntimatter)
                      : t.none
                }
              />
              <KV k={t.ePerPair} v={`${fmt(result.perPairMeV, lang, 4)} MeV`} />
              <KV k="Σ E" v={`${sci(result.energyJ, lang)} J`} />
            </div>
          </Section>

          <div className="mt-4 flex gap-2">
            {phase === "running" ? (
              <button
                onClick={() => setPaused((p) => !p)}
                className="flex-1 rounded-lg border border-amber-300/50 bg-amber-300/10 py-2.5 text-sm font-bold text-amber-200 hover:bg-amber-300/20"
              >
                {paused ? `▶ ${t.resume}` : `❚❚ ${t.pause}`}
              </button>
            ) : (
              <button
                onClick={phase === "done" ? runAgain : start}
                disabled={phase === "idle" && result.pairs === 0}
                className="flex-1 rounded-lg bg-gradient-to-r from-cyan-400 to-fuchsia-500 py-2.5 text-sm font-bold text-slate-950 shadow-[0_8px_30px_-8px_rgba(217,70,239,0.6)] disabled:opacity-35"
              >
                {phase === "done" ? t.runAgain : t.start}
              </button>
            )}
            <button onClick={reset} className="rounded-lg border border-white/15 px-3 text-sm hover:bg-white/5">
              {t.reset}
            </button>
          </div>
          <p className="mt-2 text-[10px] leading-relaxed text-slate-500">{t.explain}</p>
          <p className="mt-2 font-mono text-[10px] text-slate-600">{t.keys}</p>
        </aside>

        <main className="relative h-[68vh] min-w-0 flex-1 md:h-auto">
          <Simulation
            kind={kind}
            matter={matter}
            antimatter={antimatter}
            phase={phase}
            runId={runId}
            speed={effSpeed}
            bScale={bScale}
            autoRotate={autoRotate}
            onStats={onStats}
            onDone={() => setPhase("done")}
          />

          <div className="pointer-events-none absolute left-3 top-3 space-y-1 font-mono text-[11px] text-cyan-100/90 md:left-4 md:top-4">
            <Legend color="#3ecbff">
              {names.matter} {spec.matterSymbol} · {tel.matter}
            </Legend>
            <Legend color="#ff4d7a">
              {names.anti} {spec.antimatterSymbol} · {tel.anti}
            </Legend>
            <Legend color="#fcd34d">
              {t.photons} · {tel.photons}
            </Legend>
            {kind === "proton" && (
              <Legend color="#34d399">
                {t.pions} · {tel.pions}
              </Legend>
            )}
            <Legend color="#fbbf24" ring>
              {t.hits} · {tel.hits}
            </Legend>
          </div>

          <div className="pointer-events-none absolute right-3 top-3 w-[min(320px,55%)] text-right font-mono text-[11px] text-slate-300 md:right-4 md:top-4">
            <div>
              t = {tel.t.toFixed(2)} s <span className="text-slate-500">({t.simTime})</span>
              {speed !== 1 && <span className="text-amber-300"> · {speed}×</span>}
            </div>
            <div>
              {t.pairsLabel} = {tel.pairs}
            </div>
            <div>E = {sci(tel.energyJ, lang)} J</div>
            <div className="hidden text-slate-500 sm:block">{t.drag}</div>
            {tel.log.length > 0 && <EventFeed log={tel.log} />}
          </div>

          {phase === "running" && (
            <div className="pointer-events-none absolute bottom-[100px] left-3 max-w-md rounded-lg border border-amber-300/20 bg-black/55 px-3 py-2 text-[11px] leading-relaxed text-amber-100/90 backdrop-blur-sm md:left-4">
              {kind === "electron" ? t.petNote : t.petNoteProton}
            </div>
          )}

          <div className="absolute bottom-0 left-0 right-0 border-t border-white/10 bg-black/55 backdrop-blur-sm">
            <Scope history={phase === "running" ? histRef.current : history} live={tel} />
          </div>

          {phase === "done" &&
            (showResults ? (
              <Results kind={kind} result={result} tel={tel} onClose={() => setShowResults(false)} onAgain={runAgain} />
            ) : (
              <button
                onClick={() => setShowResults(true)}
                className="absolute bottom-[104px] left-1/2 -translate-x-1/2 rounded-full border border-amber-300/50 bg-black/70 px-4 py-1.5 text-xs font-semibold text-amber-200 backdrop-blur hover:bg-amber-300/10"
              >
                {t.showResults} ↑
              </button>
            ))}
        </main>
      </div>
    </div>
  );
}

function LangSwitch({ lang, setLang }: { lang: Lang; setLang: (l: Lang) => void }) {
  return (
    <div className="flex overflow-hidden rounded-md border border-white/15 font-mono text-[11px]" role="group" aria-label="Language">
      {(["en", "tr"] as Lang[]).map((l) => (
        <button
          key={l}
          onClick={() => setLang(l)}
          aria-pressed={lang === l}
          className={`px-2 py-0.5 ${lang === l ? "bg-cyan-400/20 text-cyan-200" : "text-slate-400 hover:bg-white/5"}`}
        >
          {l.toUpperCase()}
        </button>
      ))}
    </div>
  );
}

function Legend({ color, ring, children }: { color: string; ring?: boolean; children: ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <i
        className="inline-block h-2 w-2 rounded-full"
        style={ring ? { border: `1.5px solid ${color}`, boxShadow: `0 0 6px ${color}` } : { background: color, boxShadow: `0 0 6px ${color}` }}
      />
      {children}
    </div>
  );
}

function EventFeed({ log }: { log: EventLog[] }) {
  const { t } = useI18n();
  const items = log.slice(-5).reverse();
  return (
    <div className="mt-3 rounded-lg border border-white/10 bg-black/50 px-2.5 py-2 text-left backdrop-blur-sm">
      <div className="mb-1 text-[9px] uppercase tracking-[0.2em] text-slate-500">{t.eventsTitle}</div>
      {items.map((e, i) => (
        <div key={e.id} className="flex gap-2 truncate text-[10.5px]" style={{ opacity: 1 - i * 0.16 }}>
          <span className="w-12 shrink-0 text-slate-500">{e.t.toFixed(2)}s</span>
          <span className="truncate text-amber-100">
            {e.kind === "electron"
              ? t.logElectron
              : `p + p̄ → ${[...Array(e.piPlus).fill("π⁺"), ...Array(e.piMinus).fill("π⁻"), ...Array(e.pi0).fill("π⁰")].join(" ")}`}
          </span>
        </div>
      ))}
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mb-4">
      <div className="mb-2 text-[10px] uppercase tracking-[0.2em] text-slate-500">{title}</div>
      {children}
    </section>
  );
}

function KV({ k, v }: { k: string; v: string }) {
  return (
    <div className="rounded border border-white/10 bg-white/5 px-2 py-1.5">
      <div className="text-[9px] uppercase tracking-wider text-slate-500">{k}</div>
      <div className="truncate text-slate-200">{v}</div>
    </div>
  );
}

function Counter({
  label,
  hint,
  value,
  set,
  color,
  disabled,
}: {
  label: string;
  hint: string;
  value: number;
  set: (n: number) => void;
  color: string;
  disabled: boolean;
}) {
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between">
        <span className="text-xs font-medium" style={{ color }}>
          {label}
        </span>
        <span className="font-mono text-lg" style={{ color }}>
          {value}
        </span>
      </div>
      <input
        type="range"
        min={0}
        max={80}
        value={value}
        disabled={disabled}
        onChange={(e) => set(+e.target.value)}
        className="w-full"
        style={{ accentColor: color }}
      />
      <div className="mt-1 flex gap-1">
        {[-10, -1, 1, 10].map((d) => (
          <button
            key={d}
            disabled={disabled}
            onClick={() => set(Math.max(0, Math.min(80, value + d)))}
            className="flex-1 rounded border border-white/10 py-0.5 font-mono text-[10px] hover:bg-white/5 disabled:opacity-40"
          >
            {d > 0 ? `+${d}` : d}
          </button>
        ))}
      </div>
      <div className="mt-1 text-[10px] text-slate-500">{hint}</div>
    </div>
  );
}

function Scope({ history, live }: { history: Telemetry[]; live: Telemetry }) {
  const { t } = useI18n();
  const ref = useRef<HTMLCanvasElement>(null);
  const data = history.length ? history : live.t > 0 ? [live] : [];

  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    const w = (c.width = c.clientWidth * 2);
    const h = (c.height = c.clientHeight * 2);
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "rgba(2,6,16,0.2)";
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = "rgba(148,163,184,0.12)";
    ctx.lineWidth = 1;
    for (let i = 1; i < 4; i++) {
      ctx.beginPath();
      ctx.moveTo(0, (h * i) / 4);
      ctx.lineTo(w, (h * i) / 4);
      ctx.stroke();
    }
    if (data.length < 2) {
      ctx.fillStyle = "#64748b";
      ctx.font = "20px ui-monospace, monospace";
      ctx.fillText(t.scopeIdle, 16, h / 2);
      return;
    }
    const t0 = data[0].t;
    const t1 = data[data.length - 1].t || t0 + 1;
    const maxM = Math.max(1, ...data.map((d) => Math.max(d.matter, d.anti)));
    const maxE = Math.max(1e-20, ...data.map((d) => d.energyMeV));
    const xs = (d: Telemetry) => ((d.t - t0) / (t1 - t0 || 1)) * w;
    // enerji eğrisinin altını doldur
    ctx.beginPath();
    ctx.moveTo(0, h);
    data.forEach((d) => ctx.lineTo(xs(d), h - (d.energyMeV / maxE) * (h - 8) - 4));
    ctx.lineTo(w, h);
    ctx.closePath();
    const grd = ctx.createLinearGradient(0, 0, 0, h);
    grd.addColorStop(0, "rgba(251,191,36,0.28)");
    grd.addColorStop(1, "rgba(251,191,36,0)");
    ctx.fillStyle = grd;
    ctx.fill();
    const plot = (key: (d: Telemetry) => number, max: number, color: string) => {
      ctx.beginPath();
      ctx.strokeStyle = color;
      ctx.lineWidth = 2.2;
      data.forEach((d, i) => {
        const y = h - (key(d) / max) * (h - 8) - 4;
        if (i === 0) ctx.moveTo(xs(d), y);
        else ctx.lineTo(xs(d), y);
      });
      ctx.stroke();
    };
    plot((d) => d.matter, maxM, "#3ecbff");
    plot((d) => d.anti, maxM, "#ff4d7a");
    plot((d) => d.energyMeV, maxE, "#fbbf24");
  }, [data, live.t, t]);

  return (
    <div className="flex items-stretch">
      <canvas ref={ref} className="h-[88px] w-full" />
      <div className="hidden w-48 shrink-0 flex-col justify-center gap-0.5 border-l border-white/10 px-3 py-1 font-mono text-[10px] text-slate-400 sm:flex">
        <span className="text-cyan-300">— {t.scopeMatter}</span>
        <span className="text-rose-300">— {t.scopeAnti}</span>
        <span className="text-amber-300">— {t.scopeE}</span>
      </div>
    </div>
  );
}

function Results({
  kind,
  result,
  tel,
  onClose,
  onAgain,
}: {
  kind: ParticleKind;
  result: ReturnType<typeof compute>;
  tel: Telemetry;
  onClose: () => void;
  onAgain: () => void;
}) {
  const { t, lang } = useI18n();
  const spec = PARTICLES[kind];
  const [logGrams, setLogGrams] = useState(0);
  const grams = 10 ** logGrams;
  const big = scaleUp(grams);

  const leftover =
    result.leftoverMatter > 0
      ? t.rLeftMatter(result.leftoverMatter, spec.matterSymbol)
      : result.leftoverAntimatter > 0
        ? t.rLeftAnti(result.leftoverAntimatter, spec.antimatterSymbol)
        : t.rLeftNone;

  const cMs = C.toLocaleString(lang === "tr" ? "tr-TR" : "en-US");

  return (
    <div className="absolute inset-x-0 bottom-0 top-0 z-10 overflow-y-auto bg-[#04060c]/80 backdrop-blur-md">
      <div className="mx-auto max-w-6xl px-4 py-5 md:px-6">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold tracking-tight text-cyan-100">{t.results}</h2>
            <div className="text-[11px] uppercase tracking-[0.2em] text-slate-500">{t.resultsSub}</div>
          </div>
          <div className="flex gap-2">
            <button onClick={onAgain} className="rounded-lg bg-gradient-to-r from-cyan-400 to-fuchsia-500 px-3 py-1.5 text-xs font-bold text-slate-950">
              {t.runAgain}
            </button>
            <button onClick={onClose} className="rounded-lg border border-white/15 px-3 py-1.5 text-xs text-slate-300 hover:bg-white/5">
              {t.close} ✕
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          <R k={t.rPairs} v={`${result.pairs}`} s={t.rPairsSub(result.pairs * 2, tel.pairs)} />
          <R k={t.rLeft} v={leftover} s={result.leftoverMatter || result.leftoverAntimatter ? t.rLeftWhy : undefined} />
          <R k={t.rMass} v={`${sci(result.massConvertedKg, lang, 4)} kg`} s="Δm = 2 · N · m" />
          <R k={t.rEnergy} v={`${sci(result.energyJ, lang, 4)} J`} s={`${fmt(result.energyMeV, lang, 5)} MeV`} hi />
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <Card title={t.derivation}>
            <div className="space-y-1 font-mono text-[12px] leading-relaxed text-slate-300">
              <div className="text-slate-500">{spec.productShort}</div>
              <div>
                E = N · 2 · m · c²
              </div>
              <div>
                E = {result.pairs} · 2 · {sci(spec.massKg, lang, 4)} kg · ({cMs} m/s)²
              </div>
              <div className="text-amber-200">
                E = {sci(result.energyJ, lang, 4)} J = {fmt(result.energyMeV, lang, 5)} MeV
              </div>
            </div>
            <p className="mt-2 text-[11px] leading-relaxed text-slate-400">
              {t.perPair(fmt(result.perPairMeV, lang, 4), sci(result.perPairJ, lang, 4))} {t.product[kind]}
            </p>
          </Card>

          <Card title={t.conservation}>
            <ul className="space-y-1.5 text-[12px] text-slate-300">
              {[t.consEnergy, t.consMomentum, t.consCharge, kind === "electron" ? t.consLepton : t.consBaryon].map((c) => (
                <li key={c} className="flex gap-2">
                  <span className="text-emerald-400">✓</span>
                  {c}
                </li>
              ))}
            </ul>
          </Card>

          <Card title={t.equivalent}>
            <ul className="grid gap-1.5 text-[12px]">
              {COMPARISONS.map((c) => {
                const ratio = result.energyJ / c.J;
                const unit = t.cmpUnit[c.id];
                return (
                  <li key={c.id} className="flex items-baseline justify-between gap-3 rounded bg-white/5 px-2.5 py-1.5">
                    <span className="text-slate-400">{t.cmp[c.id]}</span>
                    <b className="shrink-0 text-right font-mono text-amber-200">{unit ? `${sci(ratio, lang)} ${unit}` : `${sci(ratio, lang)} ${t.times}`}</b>
                  </li>
                );
              })}
            </ul>
          </Card>

          <Card title={t.scaleTitle}>
            <p className="mb-2 text-[11px] text-slate-400">{t.scaleSub}</p>
            <div className="mb-1 flex items-baseline justify-between text-xs">
              <span className="text-slate-300">{t.scaleMass}</span>
              <span className="font-mono text-rose-300">{formatGrams(grams, lang)}</span>
            </div>
            <input
              type="range"
              min={-9}
              max={3}
              step={0.01}
              value={logGrams}
              onChange={(e) => setLogGrams(+e.target.value)}
              className="w-full"
              style={{ accentColor: "#ff4d7a" }}
            />
            <div className="mt-1 flex gap-1">
              {[-9, -6, -3, 0, 3].map((v) => (
                <button
                  key={v}
                  onClick={() => setLogGrams(v)}
                  className="flex-1 rounded border border-white/10 py-0.5 font-mono text-[10px] text-slate-400 hover:bg-white/5"
                >
                  {formatGrams(10 ** v, lang)}
                </button>
              ))}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-1.5 font-mono text-[12px]">
              <Big v={`${sci(big.energyJ, lang)} J`} k={t.scaleEnergy} hi />
              <Big v={fmt(big.ktTNT, lang)} k={t.scaleKt} />
              <Big v={fmt(big.hiroshima, lang)} k={t.scaleHiroshima} />
              <Big v={fmt(big.homeYears, lang)} k={t.scaleHome} />
              <Big v={`${fmt(big.worldSeconds, lang)} ${t.seconds}`} k={t.scaleWorld} />
            </div>
            <p className="mt-2 text-[10.5px] leading-relaxed text-slate-500">{t.scaleNote}</p>
          </Card>
        </div>

        <p className="mt-4 text-[10.5px] leading-relaxed text-slate-600">{t.modelNote}</p>
      </div>
    </div>
  );
}

function formatGrams(g: number, lang: Lang): string {
  const units: [number, string][] = [
    [1e3, "kg"],
    [1, "g"],
    [1e-3, "mg"],
    [1e-6, "µg"],
    [1e-9, "ng"],
  ];
  for (const [f, u] of units) {
    if (g >= f * 0.9999) return `${fmt(g / f, lang, 2)} ${u}`;
  }
  return `${sci(g, lang)} g`;
}

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
      <div className="mb-2 text-[10px] uppercase tracking-[0.2em] text-slate-500">{title}</div>
      {children}
    </section>
  );
}

function Big({ k, v, hi }: { k: string; v: string; hi?: boolean }) {
  return (
    <div className={`rounded border px-2 py-1.5 ${hi ? "border-amber-400/40 bg-amber-400/10" : "border-white/10 bg-white/5"}`}>
      <div className={hi ? "text-amber-200" : "text-slate-100"}>{v}</div>
      <div className="truncate font-sans text-[10px] text-slate-500">{k}</div>
    </div>
  );
}

function R({ k, v, s, hi }: { k: string; v: string; s?: string; hi?: boolean }) {
  return (
    <div className={`rounded-lg border p-2.5 ${hi ? "border-amber-400/40 bg-amber-400/10" : "border-white/10 bg-white/5"}`}>
      <div className="text-[9px] uppercase tracking-wider text-slate-500">{k}</div>
      <div className={`font-mono text-sm ${hi ? "text-amber-200" : ""}`}>{v}</div>
      {s && <div className="mt-0.5 text-[10px] text-slate-500">{s}</div>}
    </div>
  );
}
