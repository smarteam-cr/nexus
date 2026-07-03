"use client";

/**
 * components/marketing/ICPView.tsx
 *
 * Vista read-only del ICP — extracción props-driven del viejo app/icp/ICPSection.tsx
 * (que tenía el contenido hardcodeado). Ahora el contenido viene de la tabla IcpItem
 * (editable en /marketing/icp) y esta vista solo pinta. Las clases visuales se
 * conservan IDÉNTICAS al componente original (por eso los grises literales: es una
 * relocación, no diseño nuevo; el remap de html.light las cubre).
 */
import { useState } from "react";
import type { IcpSection } from "@prisma/client";

export interface IcpViewGroup {
  section: IcpSection;
  items: Array<{ id: string; label: string }>;
}

const SIGNAL_SECTIONS: Array<{ section: IcpSection; level: "strong" | "medium" | "weak" | "anti"; label: string }> = [
  { section: "SIGNAL_ANTI", level: "anti", label: "Anti-ICP" },
  { section: "SIGNAL_FUERTE", level: "strong", label: "Señales fuertes" },
  { section: "SIGNAL_MEDIA", level: "medium", label: "Señales medias" },
  { section: "SIGNAL_DEBIL", level: "weak", label: "Señales débiles" },
];

const SIGNAL_CONFIG: Record<string, { accent: string; dot: string; panelBorder: string; panelBg: string }> = {
  strong: { accent: "border-l-emerald-400", dot: "bg-emerald-400", panelBorder: "border-emerald-500/25", panelBg: "bg-emerald-500/5" },
  medium: { accent: "border-l-amber-400", dot: "bg-amber-400", panelBorder: "border-amber-500/25", panelBg: "bg-amber-500/5" },
  weak: { accent: "border-l-gray-400", dot: "bg-gray-400", panelBorder: "border-gray-600", panelBg: "bg-gray-800/50" },
  anti: { accent: "border-l-red-400", dot: "bg-red-400", panelBorder: "border-red-500/25", panelBg: "bg-red-500/5" },
};

function itemsOf(groups: IcpViewGroup[], section: IcpSection): string[] {
  return (groups.find((g) => g.section === section)?.items ?? []).map((i) => i.label);
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-2xs font-semibold uppercase tracking-widest text-gray-600 mb-2">{children}</p>
  );
}

function NumberedList({ items, accent = "text-brand-light" }: { items: string[]; accent?: string }) {
  return (
    <ol className="space-y-1.5">
      {items.map((item, i) => (
        <li key={i} className="flex items-start gap-2 text-xs text-gray-300 leading-relaxed">
          <span className={`flex-shrink-0 text-2xs font-bold ${accent} mt-0.5 w-3 text-right`}>{i + 1}.</span>
          {item}
        </li>
      ))}
    </ol>
  );
}

function BulletList({ items }: { items: string[] }) {
  return (
    <ul className="space-y-1.5">
      {items.map((item, i) => (
        <li key={i} className="flex items-start gap-2 text-xs text-gray-300 leading-relaxed">
          <span className="flex-shrink-0 mt-1.5 w-1 h-1 rounded-full bg-gray-600" />
          {item}
        </li>
      ))}
    </ul>
  );
}

function ICPCard({ groups }: { groups: IcpViewGroup[] }) {
  const [signalOpen, setSignalOpen] = useState<string | null>("strong");

  const descriptors = itemsOf(groups, "FIRMOGRAFICA_DESCRIPTOR");
  const industries = itemsOf(groups, "FIRMOGRAFICA_INDUSTRIA");
  const revenue = itemsOf(groups, "BEHAVIORAL_REVENUE");
  const channels = itemsOf(groups, "BEHAVIORAL_CANALES");
  const org = itemsOf(groups, "BEHAVIORAL_ORG");
  const decision = itemsOf(groups, "BEHAVIORAL_DECISION");
  const signals = SIGNAL_SECTIONS.map((s) => ({ ...s, items: itemsOf(groups, s.section) })).filter(
    (s) => s.items.length > 0,
  );

  return (
    <div className="rounded-2xl border border-brand/20 bg-gray-900 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-brand/10 border border-brand/20 flex items-center justify-center">
            <svg className="w-4 h-4 text-brand-light" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white">Perfil de Cliente Ideal</h3>
            <p className="text-xs text-gray-500">ICP · Empresa mediana–grande en LATAM</p>
          </div>
        </div>
        <span className="px-2.5 py-1 rounded-full text-2xs font-bold bg-brand text-white tracking-wider">
          ICP
        </span>
      </div>

      {/* Body: 3 columnas en desktop */}
      <div className="grid grid-cols-1 lg:grid-cols-3 divide-y lg:divide-y-0 lg:divide-x divide-gray-800">
        <div className="p-5 space-y-5">
          <div>
            <SectionTitle>Firmográfica</SectionTitle>
            <BulletList items={descriptors} />
          </div>
          <div>
            <SectionTitle>Industrias con validación real</SectionTitle>
            <div className="flex flex-wrap gap-1.5">
              {industries.map((ind) => (
                <span key={ind} className="px-2 py-0.5 rounded-full text-xs bg-brand/10 text-brand-light border border-brand/20">
                  {ind}
                </span>
              ))}
            </div>
          </div>
        </div>

        <div className="p-5 space-y-5">
          <div>
            <SectionTitle>Revenue Intelligence</SectionTitle>
            <NumberedList items={revenue} />
          </div>
          <div>
            <SectionTitle>Canales y comportamiento</SectionTitle>
            <NumberedList items={channels} accent="text-purple-400" />
          </div>
        </div>

        <div className="p-5 space-y-5">
          <div>
            <SectionTitle>La organización</SectionTitle>
            <NumberedList items={org} accent="text-sky-400" />
          </div>
          <div>
            <SectionTitle>Estructura de decisión</SectionTitle>
            <NumberedList items={decision} accent="text-sky-400" />
          </div>
        </div>
      </div>

      {/* Footer: Señales de intención */}
      {signals.length > 0 && (
        <div className="border-t border-gray-800 px-5 py-4">
          <p className="text-2xs font-semibold uppercase tracking-widest text-gray-600 mb-3">
            Señales de intención
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-2">
            {signals.map((group) => {
              const cfg = SIGNAL_CONFIG[group.level];
              const open = signalOpen === group.level;
              return (
                <button
                  key={group.level}
                  onClick={() => setSignalOpen(open ? null : group.level)}
                  className={`rounded-xl border-l-2 border px-3 py-2.5 flex items-center justify-between gap-2 transition-all ${
                    open
                      ? `bg-gray-800/60 border-gray-700 ${cfg.accent}`
                      : "bg-white/5 border-white/10 border-l-white/10 hover:bg-gray-800/60 hover:border-gray-700"
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${cfg.dot}`} />
                    <span className="text-xs font-medium text-white truncate">{group.label}</span>
                  </div>
                  <svg
                    className={`w-3 h-3 flex-shrink-0 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`}
                    fill="none" viewBox="0 0 24 24" stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
              );
            })}
          </div>
          {signalOpen &&
            (() => {
              const group = signals.find((g) => g.level === signalOpen);
              if (!group) return null;
              const cfg = SIGNAL_CONFIG[group.level];
              return (
                <div className={`rounded-xl border px-4 py-3 ${cfg.panelBorder} ${cfg.panelBg}`}>
                  <BulletList items={group.items} />
                </div>
              );
            })()}
        </div>
      )}
    </div>
  );
}

function TierCard({ tier, label, color }: { tier: string; label: string; color: string }) {
  return (
    <div className={`rounded-2xl border ${color} bg-gray-900 overflow-hidden`}>
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
        <div className="flex items-center gap-3">
          <div
            className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold ${
              tier === "2"
                ? "bg-purple-500/10 text-purple-400 border border-purple-500/20"
                : "bg-sky-500/10 text-sky-400 border border-sky-500/20"
            }`}
          >
            {tier}
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white">{label}</h3>
            <p className="text-xs text-gray-500">Próximamente</p>
          </div>
        </div>
        <span
          className={`px-2.5 py-1 rounded-full text-2xs font-bold tracking-wider ${
            tier === "2" ? "bg-purple-500/20 text-purple-400" : "bg-sky-500/20 text-sky-400"
          }`}
        >
          TIER {tier}
        </span>
      </div>
      <div className="p-5 flex flex-col items-center justify-center gap-2 min-h-[140px]">
        <div
          className={`w-10 h-10 rounded-xl flex items-center justify-center ${
            tier === "2" ? "bg-purple-500/5 border border-purple-500/10" : "bg-sky-500/5 border border-sky-500/10"
          }`}
        >
          <svg
            className={`w-5 h-5 ${tier === "2" ? "text-purple-500/40" : "text-sky-500/40"}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
          </svg>
        </div>
        <p className="text-xs text-gray-600 text-center max-w-[180px]">
          Los criterios para este tier se definirán próximamente.
        </p>
      </div>
    </div>
  );
}

export default function ICPView({ groups }: { groups: IcpViewGroup[] }) {
  return (
    <div className="mt-8 mb-8 space-y-3">
      <div className="flex items-center gap-2 mb-1">
        <p className="text-2xs font-semibold uppercase tracking-widest text-gray-600">
          Perfiles objetivo
        </p>
        <div className="flex-1 h-px bg-gray-800" />
      </div>

      <ICPCard groups={groups} />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <TierCard tier="2" label="Tier 2" color="border-purple-500/15" />
        <TierCard tier="3" label="Tier 3" color="border-sky-500/15" />
      </div>
    </div>
  );
}
