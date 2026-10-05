"use client";

/**
 * components/marketing/ICPView.tsx — el perfil de cliente ideal, para leerlo y editarlo en el mismo lugar.
 *
 * Rediseño del 2026-10-04 (sistema «Nexus · interfaz interna»): antes era una tarjeta oscura con grises crudos,
 * bordes de color a la izquierda y listas numeradas en violeta y celeste, más dos tarjetas «Tier 2 / Tier 3 ·
 * Próximamente» que no tenían nada. Ahora: una tarjeta blanca en tres columnas y las señales de intención en cuatro
 * columnas a la vista (antes había que abrirlas de a una). La fuerza de una señal se dice con marcas (●●●, ●●○,
 * ●○○, ✕), no con colores: el verde y el rojo significan otra cosa en la app.
 *
 * El contenido vive en IcpItem (1 fila = 1 ítem). `editable` prende las altas, ediciones y bajas en el lugar.
 */
import { useState } from "react";
import type { IcpSection } from "@prisma/client";
import { cn } from "@/lib/cn";
import { Rotulo } from "./piezas";

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

const SENALES: Array<{ section: IcpSection; marca: string; titulo: string; ayuda: string }> = [
  { section: "SIGNAL_FUERTE", marca: "●●●", titulo: "Fuertes", ayuda: "Está lista para hablar" },
  { section: "SIGNAL_MEDIA", marca: "●●○", titulo: "Medias", ayuda: "Hay interés, falta confirmar" },
  { section: "SIGNAL_DEBIL", marca: "●○○", titulo: "Débiles", ayuda: "Solo curiosidad" },
  { section: "SIGNAL_ANTI", marca: "✕", titulo: "La descartan", ayuda: "No es nuestro cliente" },
];

function itemsDe(groups: IcpViewGroup[], section: IcpSection) {
  return groups.find((g) => g.section === section)?.items ?? [];
}

function IconoLapiz() {
  return (
    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" />
    </svg>
  );
}
function IconoBasura() {
  return (
    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 7h12M9 7V5a1 1 0 011-1h4a1 1 0 011 1v2m2 0v12a2 2 0 01-2 2H8a2 2 0 01-2-2V7" />
    </svg>
  );
}
function IconoX({ className = "h-3 w-3" }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden="true">
      <path d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

const ENTRADA = "min-w-0 flex-1 rounded-md border border-line bg-surface px-2 py-1 text-[13px] text-fg focus:border-brand focus:outline-none";

/** Una lista de ítems (con número o con viñeta). Pasar el mouse muestra editar y borrar; abajo, «+ Agregar». */
function Lista({
  section,
  items,
  numerada,
  editable,
  onAdd,
  onEdit,
  onDelete,
  busy,
}: { section: IcpSection; items: Array<{ id: string; label: string }>; numerada: boolean } & EditHandlers) {
  const [editando, setEditando] = useState<string | null>(null);
  const [texto, setTexto] = useState("");
  const [agregando, setAgregando] = useState(false);
  const [nuevo, setNuevo] = useState("");

  const guardar = () => {
    if (editando && texto.trim()) onEdit?.(editando, texto.trim());
    setEditando(null);
  };
  const agregar = () => {
    if (nuevo.trim()) onAdd?.(section, nuevo.trim());
    setNuevo("");
    setAgregando(false);
  };
  const Envoltura = numerada ? "ol" : "ul";

  return (
    <div className="flex flex-col gap-1.5">
      <Envoltura className="flex flex-col gap-1">
        {items.map((it, i) => (
          <li key={it.id} className="group/item -mx-1 flex items-start gap-2 rounded-md px-1 py-0.5 text-[13px] leading-[19px] text-fg-secondary hover:bg-surface-hover">
            <span className="w-4 flex-shrink-0 text-right text-xs tabular-nums text-fg-muted">{numerada ? `${i + 1}.` : "•"}</span>
            {editando === it.id ? (
              <span className="flex flex-1 items-center gap-1.5">
                <input
                  value={texto}
                  onChange={(e) => setTexto(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") guardar();
                    if (e.key === "Escape") setEditando(null);
                  }}
                  aria-label="Editar el ítem"
                  className={ENTRADA}
                  autoFocus
                />
                <button type="button" onClick={guardar} className="text-xs font-semibold text-brand hover:text-brand-light">
                  Guardar
                </button>
                <button type="button" onClick={() => setEditando(null)} className="text-xs text-fg-muted hover:text-fg">
                  Cancelar
                </button>
              </span>
            ) : (
              <>
                <span className="flex-1">{it.label}</span>
                {editable && (
                  <span className="flex flex-shrink-0 gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover/item:opacity-100">
                    <button
                      type="button"
                      aria-label={`Editar «${it.label}»`}
                      onClick={() => {
                        setEditando(it.id);
                        setTexto(it.label);
                      }}
                      className="rounded-md p-0.5 text-fg-muted hover:text-fg"
                    >
                      <IconoLapiz />
                    </button>
                    <button type="button" aria-label={`Borrar «${it.label}»`} onClick={() => onDelete?.(it.id)} className="rounded-md p-0.5 text-fg-muted hover:text-danger-ink">
                      <IconoBasura />
                    </button>
                  </span>
                )}
              </>
            )}
          </li>
        ))}
      </Envoltura>
      {editable &&
        (agregando ? (
          <span className="flex items-center gap-1.5">
            <input
              value={nuevo}
              onChange={(e) => setNuevo(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") agregar();
                if (e.key === "Escape") {
                  setAgregando(false);
                  setNuevo("");
                }
              }}
              placeholder="Nuevo ítem…"
              aria-label="Nuevo ítem"
              className={ENTRADA}
              autoFocus
            />
            <button type="button" onClick={agregar} disabled={busy} className="text-xs font-semibold text-brand hover:text-brand-light disabled:opacity-50">
              Agregar
            </button>
            <button
              type="button"
              onClick={() => {
                setAgregando(false);
                setNuevo("");
              }}
              className="text-xs text-fg-muted hover:text-fg"
            >
              Cancelar
            </button>
          </span>
        ) : (
          <button type="button" onClick={() => setAgregando(true)} className="self-start text-xs font-semibold text-brand hover:text-brand-light">
            + Agregar
          </button>
        ))}
    </div>
  );
}

/** Industrias: chips blancos, con «×» al pasar el mouse y un chip punteado para agregar. */
function Industrias({ section, items, editable, onAdd, onDelete }: { section: IcpSection; items: Array<{ id: string; label: string }> } & EditHandlers) {
  const [agregando, setAgregando] = useState(false);
  const [nuevo, setNuevo] = useState("");
  const agregar = () => {
    if (nuevo.trim()) onAdd?.(section, nuevo.trim());
    setNuevo("");
    setAgregando(false);
  };
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {items.map((it) => (
        <span key={it.id} className="group/chip inline-flex items-center gap-1 rounded-full border border-line bg-surface px-2.5 py-[3px] text-xs font-medium text-fg-secondary">
          {it.label}
          {editable && (
            <button
              type="button"
              aria-label={`Borrar «${it.label}»`}
              onClick={() => onDelete?.(it.id)}
              className="text-fg-muted opacity-0 transition-opacity hover:text-danger-ink focus:opacity-100 group-hover/chip:opacity-100"
            >
              <IconoX />
            </button>
          )}
        </span>
      ))}
      {editable &&
        (agregando ? (
          <input
            value={nuevo}
            onChange={(e) => setNuevo(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") agregar();
              if (e.key === "Escape") {
                setAgregando(false);
                setNuevo("");
              }
            }}
            onBlur={agregar}
            placeholder="Nueva industria…"
            aria-label="Nueva industria"
            className="w-36 rounded-full border border-line bg-surface px-2.5 py-[3px] text-xs text-fg focus:border-brand focus:outline-none"
            autoFocus
          />
        ) : (
          <button
            type="button"
            onClick={() => setAgregando(true)}
            className="rounded-full border border-dashed border-line px-2.5 py-[3px] text-xs text-fg-muted hover:text-fg"
          >
            + Agregar
          </button>
        ))}
    </div>
  );
}

export default function ICPView({ groups, editable, onAdd, onEdit, onDelete, busy }: { groups: IcpViewGroup[] } & EditHandlers) {
  const h = { editable, onAdd, onEdit, onDelete, busy };
  const columnas: Array<Array<{ titulo: string; nodo: React.ReactNode }>> = [
    [
      { titulo: "Firmográfica", nodo: <Lista section="FIRMOGRAFICA_DESCRIPTOR" items={itemsDe(groups, "FIRMOGRAFICA_DESCRIPTOR")} numerada={false} {...h} /> },
      { titulo: "Industrias con validación real", nodo: <Industrias section="FIRMOGRAFICA_INDUSTRIA" items={itemsDe(groups, "FIRMOGRAFICA_INDUSTRIA")} {...h} /> },
    ],
    [
      { titulo: "Revenue Intelligence", nodo: <Lista section="BEHAVIORAL_REVENUE" items={itemsDe(groups, "BEHAVIORAL_REVENUE")} numerada {...h} /> },
      { titulo: "Canales y comportamiento", nodo: <Lista section="BEHAVIORAL_CANALES" items={itemsDe(groups, "BEHAVIORAL_CANALES")} numerada {...h} /> },
    ],
    [
      { titulo: "La organización", nodo: <Lista section="BEHAVIORAL_ORG" items={itemsDe(groups, "BEHAVIORAL_ORG")} numerada {...h} /> },
      { titulo: "Estructura de decisión", nodo: <Lista section="BEHAVIORAL_DECISION" items={itemsDe(groups, "BEHAVIORAL_DECISION")} numerada {...h} /> },
    ],
  ];
  const senales = SENALES.map((s) => ({ ...s, items: itemsDe(groups, s.section) })).filter((s) => editable || s.items.length > 0);

  return (
    <div className="space-y-6">
      <section aria-label="Perfil de cliente ideal" className="rounded-xl border border-line bg-surface">
        <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1 border-b border-line px-5 py-3.5">
          <h2 className="text-[15px] font-semibold leading-5 text-fg">Perfil de cliente ideal</h2>
          <span className="text-[13px] text-fg-muted">Empresa mediana o grande en Latinoamérica</span>
          {editable && <span className="ml-auto text-xs text-fg-muted">Pasa el mouse sobre un ítem para editarlo o borrarlo</span>}
        </div>
        <div className="grid lg:grid-cols-3">
          {columnas.map((col, i) => (
            <div key={i} className={cn("flex min-w-0 flex-col gap-5 p-5", i > 0 && "border-t border-line lg:border-l lg:border-t-0")}>
              {col.map((b) => (
                <div key={b.titulo} className="flex flex-col gap-2">
                  <Rotulo>{b.titulo}</Rotulo>
                  {b.nodo}
                </div>
              ))}
            </div>
          ))}
        </div>
      </section>

      {senales.length > 0 && (
        <section aria-label="Señales de intención" className="space-y-2.5">
          <div className="flex flex-wrap items-baseline gap-x-2.5">
            <h2 className="text-sm font-semibold text-fg">Señales de intención</h2>
            <span className="text-xs text-fg-muted">qué dice que una empresa está lista para hablar, y qué la descarta</span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {senales.map((s) => (
              <div key={s.section} className="flex flex-col gap-2.5 rounded-xl border border-line bg-surface p-4">
                <div className="flex flex-col gap-0.5">
                  <span className="flex items-center gap-2">
                    <span aria-hidden="true" className="text-xs tracking-[1px] text-fg-secondary">
                      {s.marca}
                    </span>
                    <span className="text-sm font-semibold text-fg">{s.titulo}</span>
                    <span className="text-xs tabular-nums text-fg-muted">{s.items.length}</span>
                  </span>
                  <span className="text-xs text-fg-muted">{s.ayuda}</span>
                </div>
                <Lista section={s.section} items={s.items} numerada={false} {...h} />
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
