"use client";

/**
 * LoQueSabes — «Agregar algo que sabes» (K6 del roadmap, 2026-10-27).
 *
 * Lo que alguien del equipo sabe del cliente y no quedó en ninguna reunión (lo que Marco le contó a Liz, un mensaje de
 * WhatsApp). Cada cosa se guarda como una nota de la exploración (lib/exploraciones/lo-que-sabes.ts) y entra ENTERA a la
 * guía de la próxima sesión cuando es corta. No es palabra del cliente: la guía lo toma como contexto a validar.
 *
 * Va en la Preparación de la preventa y en la página de inicio de la exploración de un proyecto.
 */
import { useState } from "react";
import { Button, Textarea } from "@/components/ui";
import { cn } from "@/lib/cn";
import { diaConAnio } from "@/lib/exploraciones/fechas";
import { MAX_NOTA_DE_SESION } from "@/lib/exploraciones/notas-de-sesion";
import { claveNuevaDeLoQueSabes, cuandoSeAgrego, LARGO_ENTERO, loQueSabeElEquipo, MAX_LO_QUE_SABES } from "@/lib/exploraciones/lo-que-sabes";
import { useLienzo } from "./contexto";
import { BotonBlanco, BotonTexto } from "./FranjaDeSugerencias";

function Editor({ inicial, onGuardar, onCancelar }: { inicial: string; onGuardar: (texto: string) => Promise<boolean>; onCancelar: () => void }) {
  const [texto, setTexto] = useState(inicial);
  const [guardando, setGuardando] = useState(false);
  const largo = texto.trim().length;
  return (
    <div className="flex flex-col gap-2">
      <Textarea
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        rows={4}
        maxLength={MAX_NOTA_DE_SESION}
        autoFocus
        aria-label="Lo que sabes del cliente"
        placeholder="Ej.: «Marco habló con el gerente por WhatsApp: el ERP lo cambian en enero y no quieren migrar dos veces.»"
      />
      <div className="flex items-center justify-between gap-2">
        <p className={cn("text-2xs", largo > LARGO_ENTERO ? "text-warn-ink" : "text-fg-muted")} aria-live="polite">
          {largo > LARGO_ENTERO
            ? `A la guía llegan los primeros ${LARGO_ENTERO.toLocaleString("es-CR")} caracteres.`
            : "Entra entera a la guía de la próxima sesión."}
        </p>
        <div className="flex items-center gap-1">
          <BotonTexto onClick={onCancelar}>Cancelar</BotonTexto>
          <BotonBlanco
            disabled={guardando || !largo || texto.trim() === inicial.trim()}
            onClick={async () => {
              setGuardando(true);
              try {
                await onGuardar(texto.trim());
              } finally {
                setGuardando(false);
              }
            }}
          >
            {guardando ? "Guardando…" : "Guardar"}
          </BotonBlanco>
        </div>
      </div>
    </div>
  );
}

export default function LoQueSabes() {
  const { exp, puedeEditar, cambiar } = useLienzo();
  const lista = loQueSabeElEquipo(exp.estado.contenido.notas);
  const [editando, setEditando] = useState<string | null>(null);
  const nueva = editando !== null && !lista.some((x) => x.clave === editando);

  const guardar = async (clave: string, texto: string) => {
    const ok = await cambiar([{ op: "nota", paso: clave, texto }]);
    if (ok) setEditando(null);
    return ok;
  };

  return (
    <section aria-labelledby="lo-que-sabes" className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 id="lo-que-sabes" className="text-sm font-semibold text-fg">
            Lo que sabes del cliente
          </h3>
          <p className="text-xs text-fg-muted">Lo que te contaron y no quedó en ninguna reunión. La guía lo tiene en cuenta y te ayuda a validarlo.</p>
        </div>
        {puedeEditar && !nueva && lista.length < MAX_LO_QUE_SABES && (
          <Button variant="secondary" size="sm" onClick={() => setEditando(claveNuevaDeLoQueSabes())}>
            Agregar algo que sabes
          </Button>
        )}
      </div>
      {nueva && editando && <Editor inicial="" onGuardar={(t) => guardar(editando, t)} onCancelar={() => setEditando(null)} />}
      {lista.length > 0 && (
        <ul className="flex flex-col gap-2">
          {lista.map(({ clave, texto }) => {
            const cuando = cuandoSeAgrego(clave);
            return (
              <li key={clave} className="rounded-lg border border-line bg-surface-muted px-3 py-2.5">
                {editando === clave ? (
                  <Editor inicial={texto} onGuardar={(t) => guardar(clave, t)} onCancelar={() => setEditando(null)} />
                ) : (
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="whitespace-pre-wrap text-[13px] leading-[19px] text-fg">{texto}</p>
                      {cuando && <p className="mt-0.5 text-2xs text-fg-muted">Agregado el {diaConAnio(cuando)}</p>}
                    </div>
                    {puedeEditar && (
                      <div className="flex flex-shrink-0 items-center gap-1">
                        <BotonTexto onClick={() => setEditando(clave)}>Editar</BotonTexto>
                        <BotonTexto onClick={() => void cambiar([{ op: "nota", paso: clave, texto: "" }])} title="Quitarlo de la exploración">
                          Quitar
                        </BotonTexto>
                      </div>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {!lista.length && !nueva && <p className="text-[13px] text-fg-muted">Todavía nada. Si alguien te contó algo del cliente, agrégalo acá.</p>}
    </section>
  );
}
