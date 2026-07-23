"use client";

/**
 * components/canvas/exploracion-sections/ExploracionSections.tsx
 *
 * El ÚNICO componente propio del canvas "Exploración": el PLAN DE SESIONES. Todo el
 * resto del canvas reusa renderers ya existentes del motor (`pain` para las listas de
 * tarjetas, `web_diagnosis` para los supuestos, el hero de Desarrollo, el CTA del
 * kickoff) — ver `configs/exploracion.ts`.
 *
 * Por qué este sí necesita componente: su unidad no es una tarjeta título+detalle sino
 * una SESIÓN — orden, objetivo, a quién invitar y una lista de preguntas literales.
 * Ningún renderer del motor expresa esa anidación (lista dentro de ítem).
 *
 * Decisión de interacción: las SESIONES se arrastran (SortableItems, como cualquier
 * lista del motor), pero las PREGUNTAS de adentro NO — un dnd-kit anidado pelea con el
 * de afuera y el valor de reordenar preguntas es marginal frente al riesgo. Se agregan,
 * editan y borran en su lugar.
 *
 * Render bajo `.stl` + `.stl-internal` (paleta interna gris/blanco): este documento es
 * INTERNO y no debe parecerse a lo que ve el cliente.
 */
import { type FC } from "react";
import { Editable, RemoveBtn, AddBtn, replaceAt, removeAt, appendItem } from "@/components/landing/inline";
import { SortableItems } from "@/components/landing/sortable";
import type { SectionProps } from "@/components/landing/types";

export interface ExploracionSesion {
  orden?: string;
  titulo?: string;
  objetivo?: string;
  participantes?: string;
  preguntas?: string[];
}
export interface ExploracionSesionesData {
  intro?: string;
  sesiones?: ExploracionSesion[];
}

export const ExploracionSesionesSection: FC<SectionProps<ExploracionSesionesData>> = ({
  data,
  editable,
  onChange,
}) => {
  const sesiones = data.sesiones ?? [];
  const set = (next: Partial<ExploracionSesionesData>) => onChange?.({ ...data, ...next });
  const setSesion = (i: number, patch: Partial<ExploracionSesion>) =>
    set({ sesiones: replaceAt(sesiones, i, { ...sesiones[i], ...patch }) });

  return (
    <>
      {(editable || data.intro) && (
        <Editable
          as="p"
          className="stl-lead"
          editable={editable}
          value={data.intro ?? ""}
          placeholder="Una frase de encuadre del plan (opcional)…"
          onCommit={(v) => set({ intro: v })}
        />
      )}

      <SortableItems
        items={sesiones}
        disabled={!editable}
        onReorder={(next) => set({ sesiones: next })}
        container={(nodes) => <div className="stl-stack">{nodes}</div>}
      >
        {(s, i, handle) => {
          const preguntas = s.preguntas ?? [];
          // El número que se muestra es la POSICIÓN real en la lista: si el CSE
          // reordena las sesiones, el orden mostrado sigue al arrastre en vez de
          // quedarse con el `orden` que escribió la IA (que quedaría mintiendo).
          const numero = String(i + 1);
          return (
            <div className="stl-item stl-card">
              {handle}
              {editable && <RemoveBtn onClick={() => set({ sesiones: removeAt(sesiones, i) })} />}

              <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
                <span
                  aria-hidden="true"
                  style={{
                    flexShrink: 0,
                    minWidth: 26,
                    height: 26,
                    borderRadius: 999,
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: "var(--bg-soft)",
                    border: "1px solid var(--border)",
                    color: "var(--text-2)",
                    fontSize: 13,
                    fontWeight: 700,
                  }}
                >
                  {numero}
                </span>
                <Editable
                  as="h3"
                  className="stl-card-title"
                  editable={editable}
                  value={s.titulo ?? ""}
                  placeholder="De qué va la sesión (3-6 palabras)…"
                  onCommit={(v) => setSesion(i, { titulo: v })}
                />
              </div>

              {(editable || s.objetivo) && (
                <div style={{ marginTop: 8 }}>
                  <span className="eyebrow">Qué queda cerrado</span>
                  <Editable
                    as="p"
                    className="stl-card-detail"
                    editable={editable}
                    value={s.objetivo ?? ""}
                    placeholder="Qué supuesto queda confirmado al terminar…"
                    onCommit={(v) => setSesion(i, { objetivo: v })}
                  />
                </div>
              )}

              {(editable || s.participantes) && (
                <div style={{ marginTop: 8 }}>
                  <span className="eyebrow">Con quién</span>
                  <Editable
                    as="p"
                    className="stl-card-detail"
                    editable={editable}
                    value={s.participantes ?? ""}
                    placeholder="A quién del cliente hay que tener en la sala y por qué…"
                    onCommit={(v) => setSesion(i, { participantes: v })}
                  />
                </div>
              )}

              {(editable || preguntas.length > 0) && (
                <div style={{ marginTop: 12 }}>
                  <span className="eyebrow">Qué preguntar</span>
                  <ul style={{ listStyle: "none", margin: "6px 0 0", padding: 0, display: "grid", gap: 6 }}>
                    {preguntas.map((q, qi) => (
                      <li
                        key={qi}
                        style={{ display: "flex", alignItems: "flex-start", gap: 8, position: "relative" }}
                      >
                        <span aria-hidden="true" style={{ color: "var(--text-muted)", lineHeight: 1.6 }}>
                          &ndash;
                        </span>
                        <Editable
                          as="p"
                          className="stl-card-detail"
                          editable={editable}
                          value={q}
                          placeholder="Pregunta literal, abierta, pidiendo un ejemplo real…"
                          onCommit={(v) => setSesion(i, { preguntas: replaceAt(preguntas, qi, v) })}
                        />
                        {editable && (
                          <button
                            type="button"
                            aria-label="Eliminar pregunta"
                            title="Eliminar pregunta"
                            onClick={() => setSesion(i, { preguntas: removeAt(preguntas, qi) })}
                            style={{
                              flexShrink: 0,
                              width: 24,
                              height: 24,
                              borderRadius: 6,
                              border: "1px solid var(--border)",
                              background: "transparent",
                              color: "var(--text-muted)",
                              cursor: "pointer",
                              lineHeight: 1,
                            }}
                          >
                            ×
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                  {editable && (
                    <AddBtn
                      label="Agregar pregunta"
                      onClick={() => setSesion(i, { preguntas: appendItem(preguntas, "") })}
                    />
                  )}
                </div>
              )}
            </div>
          );
        }}
      </SortableItems>

      {editable && (
        <AddBtn
          label="Agregar sesión"
          onClick={() =>
            set({
              sesiones: appendItem(sesiones, {
                orden: String(sesiones.length + 1),
                titulo: "",
                objetivo: "",
                participantes: "",
                preguntas: [],
              }),
            })
          }
        />
      )}
    </>
  );
};
