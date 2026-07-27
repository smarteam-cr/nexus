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
import { Editable, InlineCheck, RemoveBtn, AddBtn, replaceAt, removeAt, appendItem } from "@/components/landing/inline";
import { SortableItems } from "@/components/landing/sortable";
import type { SectionProps } from "@/components/landing/types";
import {
  contarHechas,
  contarMarcasDelPlan,
  normalizarPreguntas,
  type ExploracionPregunta,
  type PreguntaGuardada,
} from "@/lib/canvas/exploracion-preguntas";
import { isSi } from "@/lib/ui/si-no";

export interface ExploracionSesion {
  orden?: string;
  titulo?: string;
  objetivo?: string;
  participantes?: string;
  /** `string` = formato viejo (una pregunta suelta). Ver lib/canvas/exploracion-preguntas. */
  preguntas?: PreguntaGuardada[];
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
  const marcas = contarMarcasDelPlan(sesiones);
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

      {/* Las marcas viven en la data de la sección, así que REGENERAR el plan las borra
          junto con las preguntas que las tenían. Es lo correcto —una marca sobre una
          pregunta que ya no existe no significa nada— pero se avisa antes en vez de
          sorprender después. El CTA de regenerar vive en el header del canvas. */}
      {marcas > 0 && (
        <p
          className="stl-card-detail"
          style={{ marginTop: 14, color: "var(--text-muted)", fontSize: 13 }}
        >
          Tenés {marcas === 1 ? "1 pregunta marcada" : `${marcas} preguntas marcadas`} como
          preguntadas. Regenerar la exploración reescribe el plan y las borra.
        </p>
      )}

      <SortableItems
        items={sesiones}
        disabled={!editable}
        onReorder={(next) => set({ sesiones: next })}
        container={(nodes) => <div className="stl-stack">{nodes}</div>}
      >
        {(s, i, handle) => {
          // Levanta el formato viejo (`string[]`) al vuelo. La migración se persiste sola
          // la primera vez que se edita algo de esta sesión — sin script de datos.
          const preguntas = normalizarPreguntas(s.preguntas);
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
                  <span className="eyebrow">Qué se necesita confirmar</span>
                  <Editable
                    as="p"
                    className="stl-card-detail"
                    editable={editable}
                    value={s.objetivo ?? ""}
                    placeholder="Qué supuesto tiene que quedar confirmado al terminar…"
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
                <div style={{ marginTop: 14 }}>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
                    <span className="eyebrow">Qué preguntar</span>
                    {/* El contador es el motivo de que la casilla exista: entrar a la sesión
                        siguiente y ver de un vistazo qué quedó sin preguntar. */}
                    {preguntas.length > 0 &&
                      (() => {
                        const { hechas, total } = contarHechas(preguntas);
                        return (
                          <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
                            {hechas === 0
                              ? `${total} preguntas`
                              : hechas === total
                                ? `las ${total} preguntadas`
                                : `${hechas} de ${total} preguntadas`}
                          </span>
                        );
                      })()}
                  </div>

                  <div style={{ margin: "8px 0 0", display: "grid", gap: 8 }}>
                    {preguntas.map((p, qi) => {
                      const hecha = isSi(p.hecha);
                      const setPregunta = (patch: Partial<ExploracionPregunta>) =>
                        setSesion(i, { preguntas: replaceAt(preguntas, qi, { ...p, ...patch }) });
                      return (
                        <div key={qi} className={`stl-q-row${hecha ? " is-done" : ""}`}>
                          <span className="stl-q-check">
                            <InlineCheck
                              value={p.hecha ?? "no"}
                              editable={editable}
                              ariaLabel={hecha ? "Marcar como no preguntada" : "Marcar como preguntada"}
                              onCommit={(v) => setPregunta({ hecha: v })}
                            />
                          </span>

                          <div className="stl-q-body">
                            <Editable
                              as="p"
                              className="stl-card-detail"
                              editable={editable}
                              value={p.q}
                              placeholder="Pregunta literal, abierta, pidiendo un ejemplo real…"
                              onCommit={(v) => setPregunta({ q: v })}
                            />
                            {(editable || p.repregunta) && (
                              <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
                                <span aria-hidden="true" className="stl-q-followup-mark">
                                  ↳
                                </span>
                                <Editable
                                  as="p"
                                  className="stl-card-detail stl-q-followup"
                                  editable={editable}
                                  value={p.repregunta ?? ""}
                                  placeholder="Si contesta en general o se va por las ramas, repreguntá…"
                                  onCommit={(v) => setPregunta({ repregunta: v })}
                                />
                              </div>
                            )}
                          </div>

                          {/* Botón propio y NO `RemoveBtn`: el × del motor es `position:
                              absolute` y se revela con `.stl-item:hover .stl-remove`, un
                              selector DESCENDENTE. Dentro de la tarjeta de la sesión eso
                              haría aparecer los 8-10 × de golpe al pasar por cualquier
                              parte, y encima del texto de cada pregunta. Acá va en el
                              flujo del flex y se revela solo con su propia fila. */}
                          {editable && (
                            <button
                              type="button"
                              className="stl-q-remove"
                              aria-label="Eliminar pregunta"
                              title="Eliminar pregunta"
                              onClick={() => setSesion(i, { preguntas: removeAt(preguntas, qi) })}
                            >
                              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
                                <path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" />
                              </svg>
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {editable && (
                    <AddBtn
                      label="Agregar pregunta"
                      onClick={() => setSesion(i, { preguntas: appendItem(preguntas, { q: "" }) })}
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
