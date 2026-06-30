"use client";

/**
 * components/tags/TagsStrip.tsx
 *
 * Tira de clasificación compartida (proyecto Y business case). Pinta un chip de MODALIDAD
 * (implementación / re-implementación, selección única) + chips de PRODUCTO y ALCANCE del
 * catálogo (`lib/tags/catalog.ts`), multi-select. Agnóstico de entidad: recibe callbacks.
 * Solo lectura si `canEdit=false` (los chips se ven, sin editar).
 */
import { useEffect, useRef, useState } from "react";
import type { ImplementationType } from "@prisma/client";
import {
  productTags,
  scopeTags,
  labelForTag,
  tagDef,
  MODALITY_LABEL,
  sanitizeTags,
} from "@/lib/tags/catalog";

type Modality = ImplementationType | null;

const CHIP = "inline-flex items-center gap-1 text-[11px] font-semibold rounded-full px-2.5 py-1 border";
const PRODUCT_CLS = "text-sky-300 bg-sky-900/30 border-sky-700/40";
const SCOPE_CLS = "text-violet-300 bg-violet-900/30 border-violet-700/40";
const MODALITY_CLS: Record<"IMPLEMENTATION" | "REIMPLEMENTATION", string> = {
  IMPLEMENTATION: "text-brand bg-brand/10 border-brand/30",
  REIMPLEMENTATION: "text-amber-300 bg-amber-500/10 border-amber-500/30",
};

export default function TagsStrip({
  tags,
  implementationType,
  canEdit = false,
  onSetTags,
  onSetModality,
}: {
  tags: string[];
  implementationType: Modality;
  canEdit?: boolean;
  onSetTags: (slugs: string[]) => void;
  onSetModality: (type: Modality) => void;
}) {
  const [open, setOpen] = useState<"modality" | "add" | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(null);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const selected = sanitizeTags(tags);
  const remove = (slug: string) => onSetTags(selected.filter((s) => s !== slug));
  const add = (slug: string) => {
    if (!selected.includes(slug)) onSetTags([...selected, slug]);
    setOpen(null);
  };
  const available = [...productTags(), ...scopeTags()].filter((t) => !selected.includes(t.slug));

  return (
    <div ref={ref} className="relative flex flex-wrap items-center gap-1.5">
      {/* ── Modalidad (impl / re-impl) — chip de selección única ── */}
      <div className="relative">
        <button
          type="button"
          disabled={!canEdit}
          onClick={() => canEdit && setOpen((o) => (o === "modality" ? null : "modality"))}
          className={`${CHIP} ${
            implementationType ? MODALITY_CLS[implementationType] : "text-fg-muted bg-surface-muted border-line"
          } ${canEdit ? "cursor-pointer hover:opacity-90" : "cursor-default"}`}
          title="Tipo de implementación"
        >
          {implementationType ? MODALITY_LABEL[implementationType] : "Sin definir"}
        </button>
        {open === "modality" && (
          <div className="absolute left-0 top-full mt-1 z-50 w-48 rounded-lg border border-line bg-surface shadow-xl py-1">
            {(["IMPLEMENTATION", "REIMPLEMENTATION"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => { onSetModality(m); setOpen(null); }}
                className={`w-full text-left px-3 py-1.5 text-xs hover:bg-surface-hover ${
                  implementationType === m ? "text-fg font-semibold" : "text-fg-secondary"
                }`}
              >
                {MODALITY_LABEL[m]}
              </button>
            ))}
            <button
              type="button"
              onClick={() => { onSetModality(null); setOpen(null); }}
              className="w-full text-left px-3 py-1.5 text-xs text-fg-muted hover:bg-surface-hover border-t border-line"
            >
              Sin definir
            </button>
          </div>
        )}
      </div>

      {/* ── Tags de producto / alcance ── */}
      {selected.map((slug) => {
        const def = tagDef(slug);
        const cls = def?.group === "scope" ? SCOPE_CLS : PRODUCT_CLS;
        return (
          <span key={slug} className={`${CHIP} ${cls}`}>
            {labelForTag(slug)}
            {canEdit && (
              <button
                type="button"
                onClick={() => remove(slug)}
                title="Quitar"
                className="opacity-70 hover:opacity-100"
              >
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            )}
          </span>
        );
      })}

      {/* ── Agregar tag (picker del catálogo) ── */}
      {canEdit && available.length > 0 && (
        <div className="relative">
          <button
            type="button"
            onClick={() => setOpen((o) => (o === "add" ? null : "add"))}
            className={`${CHIP} text-fg-muted bg-surface-muted border-line border-dashed hover:text-fg-secondary hover:bg-surface-hover`}
          >
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" /></svg>
            tag
          </button>
          {open === "add" && (
            <div className="absolute left-0 top-full mt-1 z-50 w-56 rounded-lg border border-line bg-surface shadow-xl py-1 max-h-64 overflow-y-auto">
              <p className="px-3 pt-1.5 pb-1 text-[10px] font-bold uppercase tracking-wider text-fg-muted">Productos</p>
              {productTags().filter((t) => !selected.includes(t.slug)).map((t) => (
                <button key={t.slug} type="button" onClick={() => add(t.slug)} className="w-full text-left px-3 py-1.5 text-xs text-fg-secondary hover:bg-surface-hover">{t.label}</button>
              ))}
              <p className="px-3 pt-2 pb-1 text-[10px] font-bold uppercase tracking-wider text-fg-muted border-t border-line mt-1">Alcance</p>
              {scopeTags().filter((t) => !selected.includes(t.slug)).map((t) => (
                <button key={t.slug} type="button" onClick={() => add(t.slug)} className="w-full text-left px-3 py-1.5 text-xs text-fg-secondary hover:bg-surface-hover">{t.label}</button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
