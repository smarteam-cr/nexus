"use client";

/**
 * components/marketing/ICPView.tsx
 *
 * Vista del ICP — extracción props-driven del viejo app/icp/ICPSection.tsx
 * (que tenía el contenido hardcodeado). El contenido vive en la tabla IcpItem.
 * Modo dual: read-only (por default, usado donde `editable` no se pasa) y
 * editable (usado por /marketing/icp — mismo formato visual, con altas/bajas/
 * ediciones in-place vía onAdd/onEdit/onDelete). Las clases visuales se
 * conservan IDÉNTICAS al componente original (por eso los grises literales: es
 * una relocación, no diseño nuevo; el remap de html.light las cubre).
 */
import { useState } from "react";
import type { IcpSection } from "@prisma/client";

export interface IcpViewGroup {
  section: IcpSection;
  items: Array<{ id: string; label: string }>;
}

interface EditHandlers {
  editable?: boolean;
  onAdd?: (section: IcpSection, label: string) => void;
  onEdit?: (id: string, label: string) => void;
  onDelete?: (id: string) => void;
  busy?: boolean;
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

function itemsOf(groups: IcpViewGroup[], section: IcpSection): Array<{ id: string; label: string }> {
  return groups.find((g) => g.section === section)?.items ?? [];
}

// ── Íconos de edición (SVG, no emoji — se ven consistentes en claro/oscuro) ──
function IconPencil() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" />
    </svg>
  );
}
function IconTrash() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
    </svg>
  );
}
function IconCheck() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
    </svg>
  );
}
function IconX({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-2xs font-semibold uppercase tracking-widest text-gray-600 mb-2">{children}</p>
  );
}

/** Lista bullet/numerada editable — hover muestra editar/borrar, "+ Agregar" al final. */
function EditableList({
  section,
  items,
  numbered,
  accent = "text-brand-light",
  editable,
  onAdd,
  onEdit,
  onDelete,
  busy,
}: {
  section: IcpSection;
  items: Array<{ id: string; label: string }>;
  numbered: boolean;
  accent?: string;
} & EditHandlers) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState("");
  const [adding, setAdding] = useState(false);
  const [newText, setNewText] = useState("");

  const startEdit = (item: { id: string; label: string }) => {
    setEditingId(item.id);
    setEditingText(item.label);
  };
  const saveEdit = () => {
    if (editingId && editingText.trim()) onEdit?.(editingId, editingText.trim());
    setEditingId(null);
  };
  const saveAdd = () => {
    if (newText.trim()) onAdd?.(section, newText.trim());
    setNewText("");
    setAdding(false);
  };

  const Wrapper = numbered ? "ol" : "ul";

  return (
    <div>
      <Wrapper className="space-y-1.5">
        {items.map((item, i) => (
          <li key={item.id} className="group/item flex items-start gap-2 text-xs text-gray-300 leading-relaxed">
            {numbered ? (
              <span className={`flex-shrink-0 text-2xs font-bold ${accent} mt-0.5 w-3 text-right`}>{i + 1}.</span>
            ) : (
              <span className="flex-shrink-0 mt-1.5 w-1 h-1 rounded-full bg-gray-600" />
            )}
            {editingId === item.id ? (
              <span className="flex-1 flex items-center gap-1">
                <input
                  value={editingText}
                  onChange={(e) => setEditingText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") saveEdit();
                    if (e.key === "Escape") setEditingId(null);
                  }}
                  className="flex-1 min-w-0 bg-gray-800 text-white text-xs px-1.5 py-0.5 rounded border border-gray-700"
                  autoFocus
                />
                <button onClick={saveEdit} className="flex-shrink-0 p-1 rounded-md text-brand-light hover:bg-gray-800 transition-colors" title="Guardar">
                  <IconCheck />
                </button>
                <button onClick={() => setEditingId(null)} className="flex-shrink-0 p-1 rounded-md text-gray-500 hover:text-gray-300 hover:bg-gray-800 transition-colors" title="Cancelar">
                  <IconX />
                </button>
              </span>
            ) : (
              <>
                <span className="flex-1">{item.label}</span>
                {editable && (
                  <span className="flex-shrink-0 flex gap-0.5 opacity-0 group-hover/item:opacity-100 transition-opacity">
                    <button onClick={() => startEdit(item)} title="Editar" className="p-1 rounded-md text-gray-500 hover:text-white hover:bg-gray-800 transition-colors">
                      <IconPencil />
                    </button>
                    <button onClick={() => onDelete?.(item.id)} title="Borrar" className="p-1 rounded-md text-gray-500 hover:text-red-400 hover:bg-gray-800 transition-colors">
                      <IconTrash />
                    </button>
                  </span>
                )}
              </>
            )}
          </li>
        ))}
      </Wrapper>
      {editable &&
        (adding ? (
          <div className="mt-1.5 flex items-center gap-1">
            <input
              value={newText}
              onChange={(e) => setNewText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") saveAdd();
                if (e.key === "Escape") {
                  setAdding(false);
                  setNewText("");
                }
              }}
              placeholder="Nuevo ítem…"
              className="flex-1 min-w-0 bg-gray-800 text-white text-xs px-1.5 py-0.5 rounded border border-gray-700"
              autoFocus
            />
            <button onClick={saveAdd} disabled={busy} className="flex-shrink-0 text-xs text-brand-light hover:underline disabled:opacity-40">
              Agregar
            </button>
            <button
              onClick={() => {
                setAdding(false);
                setNewText("");
              }}
              className="flex-shrink-0 text-xs text-gray-500 hover:text-gray-300"
            >
              Cancelar
            </button>
          </div>
        ) : (
          <button onClick={() => setAdding(true)} className="mt-1.5 text-2xs text-brand-light hover:underline">
            + Agregar
          </button>
        ))}
    </div>
  );
}

/** Industrias — pills en vez de lista, con "×" en hover y una pill "+ Agregar". */
function EditableIndustries({
  section,
  items,
  editable,
  onAdd,
  onDelete,
}: {
  section: IcpSection;
  items: Array<{ id: string; label: string }>;
} & EditHandlers) {
  const [adding, setAdding] = useState(false);
  const [newText, setNewText] = useState("");

  const commit = () => {
    if (newText.trim()) onAdd?.(section, newText.trim());
    setNewText("");
    setAdding(false);
  };

  return (
    <div className="flex flex-wrap gap-1.5 items-center">
      {items.map((item) => (
        <span
          key={item.id}
          className="group/pill inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-brand/10 text-brand-light border border-brand/20"
        >
          {item.label}
          {editable && (
            <button
              onClick={() => onDelete?.(item.id)}
              title="Borrar"
              className="opacity-0 group-hover/pill:opacity-100 transition-opacity text-brand-light/70 hover:text-red-400"
            >
              <IconX className="w-3 h-3" />
            </button>
          )}
        </span>
      ))}
      {editable &&
        (adding ? (
          <input
            value={newText}
            onChange={(e) => setNewText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") commit();
              if (e.key === "Escape") {
                setAdding(false);
                setNewText("");
              }
            }}
            onBlur={commit}
            placeholder="Nueva industria…"
            className="px-2 py-0.5 text-xs bg-gray-800 text-white rounded-full border border-gray-700 w-32"
            autoFocus
          />
        ) : (
          <button
            onClick={() => setAdding(true)}
            className="px-2 py-0.5 rounded-full text-xs border border-dashed border-gray-600 text-gray-500 hover:text-white hover:border-gray-400"
          >
            + Agregar
          </button>
        ))}
    </div>
  );
}

function ICPCard({ groups, editable, onAdd, onEdit, onDelete, busy }: { groups: IcpViewGroup[] } & EditHandlers) {
  const [signalOpen, setSignalOpen] = useState<string | null>("strong");

  const descriptors = itemsOf(groups, "FIRMOGRAFICA_DESCRIPTOR");
  const industries = itemsOf(groups, "FIRMOGRAFICA_INDUSTRIA");
  const revenue = itemsOf(groups, "BEHAVIORAL_REVENUE");
  const channels = itemsOf(groups, "BEHAVIORAL_CANALES");
  const org = itemsOf(groups, "BEHAVIORAL_ORG");
  const decision = itemsOf(groups, "BEHAVIORAL_DECISION");
  const signals = SIGNAL_SECTIONS.map((s) => ({ ...s, items: itemsOf(groups, s.section) })).filter(
    (s) => editable || s.items.length > 0,
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
      <div className="grid grid-cols-1 lg:grid-cols-3 divide-y lg:divide-y-0 lg:divide-x divide-line">
        <div className="p-5 space-y-5">
          <div>
            <SectionTitle>Firmográfica</SectionTitle>
            <EditableList section="FIRMOGRAFICA_DESCRIPTOR" items={descriptors} numbered={false} editable={editable} onAdd={onAdd} onEdit={onEdit} onDelete={onDelete} busy={busy} />
          </div>
          <div>
            <SectionTitle>Industrias con validación real</SectionTitle>
            <EditableIndustries section="FIRMOGRAFICA_INDUSTRIA" items={industries} editable={editable} onAdd={onAdd} onDelete={onDelete} busy={busy} />
          </div>
        </div>

        <div className="p-5 space-y-5">
          <div>
            <SectionTitle>Revenue Intelligence</SectionTitle>
            <EditableList section="BEHAVIORAL_REVENUE" items={revenue} numbered editable={editable} onAdd={onAdd} onEdit={onEdit} onDelete={onDelete} busy={busy} />
          </div>
          <div>
            <SectionTitle>Canales y comportamiento</SectionTitle>
            <EditableList section="BEHAVIORAL_CANALES" items={channels} numbered accent="text-purple-400" editable={editable} onAdd={onAdd} onEdit={onEdit} onDelete={onDelete} busy={busy} />
          </div>
        </div>

        <div className="p-5 space-y-5">
          <div>
            <SectionTitle>La organización</SectionTitle>
            <EditableList section="BEHAVIORAL_ORG" items={org} numbered accent="text-sky-400" editable={editable} onAdd={onAdd} onEdit={onEdit} onDelete={onDelete} busy={busy} />
          </div>
          <div>
            <SectionTitle>Estructura de decisión</SectionTitle>
            <EditableList section="BEHAVIORAL_DECISION" items={decision} numbered accent="text-sky-400" editable={editable} onAdd={onAdd} onEdit={onEdit} onDelete={onDelete} busy={busy} />
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
                  <EditableList
                    section={group.section}
                    items={group.items}
                    numbered={false}
                    editable={editable}
                    onAdd={onAdd}
                    onEdit={onEdit}
                    onDelete={onDelete}
                    busy={busy}
                  />
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
        <p className="text-xs text-gray-600 text-center max-w-[190px]">
          Próximamente vas a poder generar y editar los criterios de este tier.
        </p>
      </div>
    </div>
  );
}

export default function ICPView({ groups, editable, onAdd, onEdit, onDelete, busy }: { groups: IcpViewGroup[] } & EditHandlers) {
  return (
    <div className="mt-8 mb-8 space-y-3">
      <div className="flex items-center gap-2 mb-1">
        <p className="text-2xs font-semibold uppercase tracking-widest text-gray-600">
          Perfiles objetivo
        </p>
        <div className="flex-1 h-px bg-gray-800" />
      </div>

      <ICPCard groups={groups} editable={editable} onAdd={onAdd} onEdit={onEdit} onDelete={onDelete} busy={busy} />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <TierCard tier="2" label="Tier 2" color="border-purple-500/15" />
        <TierCard tier="3" label="Tier 3" color="border-sky-500/15" />
      </div>
    </div>
  );
}
