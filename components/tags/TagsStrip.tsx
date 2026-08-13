"use client";

/**
 * components/tags/TagsStrip.tsx
 *
 * Tira de clasificación compartida (proyecto Y business case). UN solo tipo de chip para TODA la
 * clasificación —producto, alcance, tipo de implementación y modalidad—, todos del mismo catálogo
 * (`lib/tags/catalog.ts`), todos con su ✕, todos editables por el mismo camino.
 * Solo lectura si `canEdit=false` (los chips se ven, sin editar).
 *
 * ── 2026-08-12: por qué ya no hay un chip especial ───────────────────────────
 * Hasta hoy "Implementación" se pintaba con un `<button>` con desplegable propio, alimentado por
 * una COLUMNA propia de la base y editado por un endpoint propio. El síntoma que lo destapó:
 * era el único chip sin ✕ y no se podía quitar. La causa no era la ✕ — era que un dato de la
 * misma naturaleza (cómo se clasifica el proyecto) viajaba por un sistema paralelo.
 *
 * Ahora es un tag más. Lo único que la tira agrega es el aviso de que FALTA responder un eje
 * obligatorio, y ese aviso también sale del catálogo (`faltanEjesRequeridos` + `EJES_EXCLUYENTES`),
 * no de un `if` con el nombre del eje escrito acá.
 */
import { useEffect, useRef, useState } from "react";
import {
  seccionesDelCatalogo,
  labelForTag,
  tagDef,
  ordenDeTag,
  sanitizeTags,
  conTag,
  faltanEjesRequeridos,
  EJES_EXCLUYENTES,
  type TagGroup,
} from "@/lib/tags/catalog";

const CHIP = "inline-flex items-center gap-1 text-[11px] font-semibold rounded-full px-2.5 py-1 border";

/** Un color por grupo — la misma tabla que decide las secciones del selector. */
const GROUP_CLS: Record<TagGroup, string> = {
  product: "text-sky-300 bg-sky-900/30 border-sky-700/40",
  scope: "text-violet-300 bg-violet-900/30 border-violet-700/40",
  modalidad: "text-teal-300 bg-teal-900/30 border-teal-700/40",
  tipo_implementacion: "text-brand bg-brand/10 border-brand/30",
};

export default function TagsStrip({
  tags,
  canEdit = false,
  onSetTags,
}: {
  tags: string[];
  canEdit?: boolean;
  onSetTags: (slugs: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const selected = sanitizeTags(tags);
  const remove = (slug: string) => onSetTags(selected.filter((s) => s !== slug));
  /* `conTag` y no un `[...selected, slug]`: elegir un tag de un eje excluyente SACA al hermano.
     Sin eso, hacer clic en "Re-implementación" teniendo "Implementación" mandaría los dos,
     `sanitizeTags` conservaría el primero, y el clic no haría nada visible ni daría error. */
  const add = (slug: string) => {
    onSetTags(conTag(selected, slug));
    setOpen(false);
  };

  // Para pintar: por grupo del catálogo. El array guardado NO se reordena (su orden es semántico).
  const enOrden = [...selected].sort((a, b) => ordenDeTag(a) - ordenDeTag(b));
  const secciones = seccionesDelCatalogo()
    .map((s) => ({ ...s, tags: s.tags.filter((t) => !selected.includes(t.slug)) }))
    .filter((s) => s.tags.length > 0);
  const faltan = faltanEjesRequeridos(selected);

  return (
    <div ref={ref} className="relative flex flex-wrap items-center gap-1.5">
      {enOrden.map((slug) => {
        const def = tagDef(slug);
        return (
          <span key={slug} className={`${CHIP} ${def ? GROUP_CLS[def.group] : GROUP_CLS.product}`}>
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

      {/* ── Lo que falta responder ── No es un tag: es el hueco. Punteado y ámbar para que se lea
             como pendiente y no como una clasificación más. Abre el mismo selector. */}
      {faltan.map((eje) => (
        <button
          key={eje}
          type="button"
          disabled={!canEdit}
          onClick={() => canEdit && setOpen((o) => !o)}
          className={`${CHIP} border-dashed text-warn-ink bg-warn-surface border-warn-line ${
            canEdit ? "cursor-pointer hover:opacity-90" : "cursor-default"
          }`}
          title="Decide contenido del cronograma — conviene responderlo"
        >
          {EJES_EXCLUYENTES[eje]?.avisoFalta ?? "Falta un dato"}
        </button>
      ))}

      {/* ── Agregar tag (selector del catálogo) ── */}
      {canEdit && secciones.length > 0 && (
        <div className="relative">
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            className={`${CHIP} text-fg-muted bg-surface-muted border-line border-dashed hover:text-fg-secondary hover:bg-surface-hover`}
          >
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" /></svg>
            tag
          </button>
          {open && (
            <div className="absolute left-0 top-full mt-1 z-50 w-56 rounded-lg border border-line bg-surface shadow-xl py-1 max-h-64 overflow-y-auto">
              {secciones.map((s, i) => (
                <div key={s.group}>
                  <p
                    className={`px-3 pt-2 pb-1 text-[10px] font-bold uppercase tracking-wider text-fg-muted ${
                      i > 0 ? "border-t border-line mt-1" : "pt-1.5"
                    }`}
                  >
                    {s.label}
                  </p>
                  {s.tags.map((t) => (
                    <button
                      key={t.slug}
                      type="button"
                      onClick={() => add(t.slug)}
                      className="w-full text-left px-3 py-1.5 text-xs text-fg-secondary hover:bg-surface-hover"
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
