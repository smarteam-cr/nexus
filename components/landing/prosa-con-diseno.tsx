"use client";

/**
 * components/landing/prosa-con-diseno.tsx — los puntos de una sección de PROSA en los diseños del diagnóstico
 * (2026-10-23).
 *
 * Elías: «hoy son secciones con cards muy amplias y se puede mejorar bastante». La grilla de tarjetas de dos columnas
 * (CardGrid) sigue siendo la de siempre del kickoff; el diagnóstico elige otra forma por la DEFINICIÓN
 * (`SectionDef.diseno`), con el mismo esquema y el mismo `sectionType` — el chat y los agentes no se enteran:
 *   · `datos`    — datos cortos en tres columnas, con el acento arriba (la foto del cliente);
 *   · `numerada` — puntos numerados en dos columnas, sin tarjeta (el desafío, sobre el fondo oscuro);
 *   · `check`    — lista con check (las fortalezas);
 *   · `enfoque`  — los principios numerados del enfoque de la solución.
 * Todo es CSS estático de landing-engine.css (§1-WEB: hex literal, sale igual en el PDF). Los puntos se arrastran y se
 * quitan como cualquier ítem del motor.
 */
import type { DisenoDeProsa } from "./types";
import { Editable, RemoveBtn, AddBtn, replaceAt, removeAt, appendItem } from "./inline";
import { SortableItems } from "./sortable";

interface Punto {
  title: string;
  detail?: string;
}

const AGREGAR: Record<Exclude<DisenoDeProsa, "tarjetas">, string> = {
  datos: "Agregar dato",
  numerada: "Agregar punto",
  check: "Agregar fortaleza",
  enfoque: "Agregar principio",
};

function Marca({ diseno, i }: { diseno: DisenoDeProsa; i: number }) {
  if (diseno === "numerada" || diseno === "enfoque") {
    return (
      <span className="stl-prosa-num" aria-hidden>
        {String(i + 1).padStart(2, "0")}
      </span>
    );
  }
  if (diseno === "check") {
    return (
      <span className="stl-prosa-tilde" aria-hidden>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.6}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 12.5l4.2 4.2L19 7" />
        </svg>
      </span>
    );
  }
  return null;
}

export function ProsaConDiseno<T extends Punto>({
  diseno,
  items,
  editable,
  onItems,
}: {
  diseno: Exclude<DisenoDeProsa, "tarjetas">;
  items: T[];
  editable?: boolean;
  onItems: (items: T[]) => void;
}) {
  return (
    <>
      <SortableItems
        items={items}
        disabled={!editable}
        onReorder={onItems}
        container={(nodes) => <div className={`stl-prosa stl-prosa-${diseno}`}>{nodes}</div>}
      >
        {(it, i, handle) => (
          <div className="stl-item stl-prosa-punto">
            {handle}
            {editable && <RemoveBtn onClick={() => onItems(removeAt(items, i))} />}
            <Marca diseno={diseno} i={i} />
            <div className="stl-prosa-texto">
              <Editable
                as="h3"
                className="stl-prosa-titulo"
                editable={editable}
                value={it.title}
                placeholder="Título corto…"
                onCommit={(v) => onItems(replaceAt(items, i, { ...it, title: v }))}
              />
              <Editable
                as="p"
                className="stl-prosa-detalle"
                editable={editable}
                value={it.detail ?? ""}
                placeholder="Una línea que lo explique…"
                onCommit={(v) => onItems(replaceAt(items, i, { ...it, detail: v }))}
              />
            </div>
          </div>
        )}
      </SortableItems>
      {editable && (
        <AddBtn label={AGREGAR[diseno]} onClick={() => onItems(appendItem(items, { title: "", detail: "" } as unknown as T))} />
      )}
    </>
  );
}
