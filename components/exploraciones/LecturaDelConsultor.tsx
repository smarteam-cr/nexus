"use client";

/**
 * LecturaDelConsultor — «Tu lectura del cliente», el paso opcional antes de generar los casos de uso (2026-11-09, pedido
 * de Marco y Elías; lib/casos-de-uso/lectura-del-consultor.ts).
 *
 * Nexus pregunta «¿Qué casos de uso crees que necesita el cliente?», sugiere ejemplos de un clic sacados de lo que sabe
 * del cliente (sus planes y lo que sugiere la escala) y deja dictar. Al generar, el agente ordena lo que dijo por
 * departamento y avisa lo que se le pasó y sí aparece en las reuniones, con la cita. Reemplaza a las «Instrucciones
 * adicionales» de este paso y se guarda en la misma nota: lo escrito antes aparece aquí.
 *
 * Controlado: el texto lo tiene el paso (PasoCasosDeUso), que lo guarda antes de generar si quedó sin guardar.
 */
import { useEffect, useRef, useState } from "react";
import { Alert, BotonDeDictado, Button, Field, Textarea, useToast } from "@/components/ui";
import { cn } from "@/lib/cn";
import {
  avisoDeLaLectura,
  huellaDeLaLectura,
  PREGUNTA_DE_LA_LECTURA,
  sumarEjemplo,
  type LecturaDelConsultor as LaLectura,
} from "@/lib/casos-de-uso/lectura-del-consultor";

export default function LecturaDelConsultor({
  texto,
  guardado,
  onCambiar,
  onGuardar,
  ejemplos,
  lectura,
  nombreDeArea,
  soloLectura,
  tope,
}: {
  /** Lo que está en la caja ahora. */
  texto: string;
  /** Lo guardado (para saber si hay cambios sin guardar y si la lectura del agente quedó vieja). */
  guardado: string;
  onCambiar: (texto: string) => void;
  onGuardar: () => Promise<boolean>;
  /** Los ejemplos de un clic. */
  ejemplos: readonly string[];
  /** Lo que dejó el agente en la última vuelta (o null). */
  lectura: LaLectura | null;
  nombreDeArea: (id: string | null) => string;
  soloLectura: boolean;
  tope: number;
}) {
  const toast = useToast();
  const [abierta, setAbierta] = useState(() => !!guardado.trim() || !!lectura);
  const [guardando, setGuardando] = useState(false);
  const sinGuardar = texto.trim() !== guardado.trim();
  const aviso = avisoDeLaLectura(texto);
  // La lectura del agente es de este texto: si el consultor lo cambió después, se dice que es de antes.
  const deEsteTexto = !!lectura && lectura.huella === huellaDeLaLectura(guardado);

  const guardar = async () => {
    setGuardando(true);
    try {
      await onGuardar();
    } finally {
      setGuardando(false);
    }
  };
  /* Lo último que quedó en la caja, al momento: dos frases dictadas que llegan antes de volver a dibujar se suman las dos
     (revisión del 2026-11-09: la segunda pisaba a la primera). */
  const ultimo = useRef(texto);
  useEffect(() => {
    ultimo.current = texto;
  }, [texto]);
  const dictado = (frase: string) => {
    const base = ultimo.current.replace(/\s+$/, "");
    const nuevo = `${base}${base ? (/[.!?]$/.test(base) ? " " : ". ") : ""}${frase.charAt(0).toUpperCase()}${frase.slice(1)}`.slice(0, tope);
    ultimo.current = nuevo;
    onCambiar(nuevo);
  };

  return (
    <section className="rounded-xl border border-line bg-surface" data-recorrido="preventa.casos.lectura">
      <button
        type="button"
        onClick={() => setAbierta((v) => !v)}
        aria-expanded={abierta}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
      >
        <span className="min-w-0">
          <span className="block text-sm font-semibold text-fg">
            Tu lectura del cliente <span className="font-normal text-fg-muted">· opcional</span>
          </span>
          <span className="block text-xs text-fg-muted">{PREGUNTA_DE_LA_LECTURA} Nexus parte de ahí y te dice si se te pasó algo de las reuniones.</span>
        </span>
        <span className="flex flex-none items-center gap-2">
          {sinGuardar ? (
            <span className="rounded-full border border-warn-line bg-warn-surface px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-warn-ink">sin guardar</span>
          ) : guardado.trim() ? (
            <span className="rounded-full border border-success-line bg-success-surface px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-success-ink">guardada</span>
          ) : null}
          <svg className={cn("h-3.5 w-3.5 text-fg-muted transition-transform", abierta && "rotate-90")} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </span>
      </button>

      {abierta && (
        <div className="space-y-3 border-t border-line px-4 py-3">
          {soloLectura ? (
            <p className="whitespace-pre-wrap text-sm text-fg-secondary">{guardado.trim() || "El consultor no escribió su lectura."}</p>
          ) : (
            <>
              <Field label={PREGUNTA_DE_LA_LECTURA} hint={aviso ?? "Uno por renglón, como lo dirías en voz alta: qué área, qué cambia y para qué."}>
                <div className="relative">
                  <Textarea
                    className="pr-11"
                    value={texto}
                    onChange={(e) => onCambiar(e.target.value.slice(0, tope))}
                    onBlur={() => {
                      if (sinGuardar) void guardar();
                    }}
                    rows={4}
                    maxLength={tope}
                    placeholder={"Ej.:\n- Ventas: estandarizar el proceso comercial y la cotización\n- Soporte: un centro de ayuda con WhatsApp conectado"}
                  />
                  {/* El micrófono en la esquina del cuadro (10 nov): se escribe, y dictar queda a mano. */}
                  <BotonDeDictado
                    variante="icono"
                    className="absolute bottom-2 right-2"
                    onTexto={dictado}
                    onError={(m) => toast.error(m)}
                    disabled={guardando}
                  />
                </div>
              </Field>
              {ejemplos.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-xs text-fg-muted">Con lo que sabe Nexus del cliente, por ejemplo (un clic lo suma):</p>
                  <div className="flex flex-wrap gap-1.5">
                    {ejemplos.map((e) => (
                      <button
                        key={e}
                        type="button"
                        onClick={() => onCambiar(sumarEjemplo(texto, e).slice(0, tope))}
                        className="rounded-full border border-line bg-surface-muted px-2.5 py-1 text-xs text-fg-secondary transition-colors hover:border-brand/40 hover:text-fg"
                      >
                        + {e}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div className="flex justify-end">
                <Button size="sm" variant="primary" onClick={() => void guardar()} disabled={guardando || !sinGuardar}>
                  {guardando ? "Guardando…" : "Guardar"}
                </Button>
              </div>
            </>
          )}

          {lectura && (lectura.porArea.length > 0 || lectura.seLePaso.length > 0) && (
            <div className="space-y-2 rounded-lg bg-surface-muted px-3 py-2.5">
              <p className="text-xs font-semibold text-fg">
                Lo que dijiste, por departamento
                {!deEsteTexto && <span className="font-normal text-fg-muted"> · de tu lectura anterior: «Revisar» la vuelve a leer</span>}
              </p>
              {lectura.porArea.map((a) => (
                <div key={a.areaId ?? "-"} className="text-xs">
                  <p className="font-medium text-fg-secondary">{nombreDeArea(a.areaId)}</p>
                  <ul className="ml-4 list-disc text-fg-secondary">
                    {a.casos.map((c) => (
                      <li key={c}>{c}</li>
                    ))}
                  </ul>
                </div>
              ))}
              {lectura.seLePaso.length > 0 ? (
                <Alert variant="warning" title={lectura.seLePaso.length === 1 ? "Se te pasó algo que sí aparece en las reuniones" : `Se te pasaron ${lectura.seLePaso.length} cosas que sí aparecen en las reuniones`}>
                  <ul className="space-y-1.5">
                    {lectura.seLePaso.map((s) => (
                      <li key={s.que}>
                        <span className="font-medium">{s.que}</span>
                        {s.areaId && <span className="text-fg-muted"> · {nombreDeArea(s.areaId)}</span>}
                        <span className="block text-fg-secondary">«{s.cita}»</span>
                        <span className="block text-[11px] text-fg-muted">{s.reunion}</span>
                      </li>
                    ))}
                  </ul>
                </Alert>
              ) : (
                <p className="text-xs text-fg-muted">No se te pasó nada importante de lo que el cliente dijo en las reuniones.</p>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
