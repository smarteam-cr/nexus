"use client";

/**
 * ComoLlego — «Cómo llegó» el prospecto y la primera sesión que abre la puerta (K2 del roadmap, 2026-10-27). Solo la
 * preventa.
 *
 * Nexus PROPONE cómo llegó desde HubSpot (lib/exploraciones/como-llego.ts › llegadaPropuesta) y una persona lo
 * CONFIRMA: sin confirmar no se guarda ni cambia la guía. Con «En frío» o «Referido» y todavía sin hablar con el cliente,
 * la primera sesión es para abrir la puerta: `AbrirLaPuerta` lo dice arriba de la Preparación, con cómo presentar a
 * Smarteam (el position statement armado para este prospecto, K3; si todavía no se armó, el de la base o, mientras no
 * esté escrito, la propuesta de valor; nunca inventado).
 */
import { useState } from "react";
import { Button, Input, Select } from "@/components/ui";
import { cn } from "@/lib/cn";
import {
  abreLaPuerta,
  llegadaPropuesta,
  MAX_REFERIDO_POR,
  NOMBRE_DE_LA_VIA,
  PREGUNTAS_DE_ABRIR_LA_PUERTA,
  TRAMOS_DE_ABRIR_LA_PUERTA,
  VIAS_DE_LLEGADA,
  esViaDeLlegada,
  type ContactoParaLaLlegada,
  type ViaDeLlegada,
} from "@/lib/exploraciones/como-llego";
import { useLienzo } from "./contexto";
import { BotonTexto } from "./FranjaDeSugerencias";
import { PositionStatementDelProspecto } from "./PositionStatementDelProspecto";

export interface PresentacionDeSmarteam {
  texto: string | null;
  de: "positionStatement" | "propuestaDeValor" | null;
}

/** El bloque «Cómo llegó», en Identificación. `contactos` null = HubSpot todavía no respondió. */
export function ComoLlego({ contactos }: { contactos: readonly ContactoParaLaLlegada[] | null }) {
  const { exp, puedeEditar, cambiar, guardando } = useLienzo();
  const confirmado = exp.estado.contenido.comoLlego;
  const propuesta = contactos ? llegadaPropuesta({ contactos, conTest: exp.leido.tests.length > 0 }) : null;
  const [editando, setEditando] = useState(false);
  const [via, setVia] = useState<ViaDeLlegada | "">(confirmado?.via ?? "");
  const [referidoPor, setReferidoPor] = useState(confirmado?.referidoPor ?? "");
  const elegida: ViaDeLlegada | "" = via || propuesta?.via || "";

  const confirmar = async () => {
    if (!elegida) return;
    const ok = await cambiar([
      { op: "comoLlego", valor: { via: elegida, ...(elegida === "referido" && referidoPor.trim() ? { referidoPor: referidoPor.trim() } : {}), en: new Date().toISOString() } },
    ]);
    if (ok) setEditando(false);
  };

  const mostrarEditor = puedeEditar && (!confirmado || editando);
  return (
    <section data-recorrido="preventa.preparacion.como-llego" className="space-y-3 rounded-xl border border-line bg-surface p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-fg">Cómo llegó</h3>
          <p className="text-xs text-fg-muted">Lo propone Nexus desde HubSpot; lo confirmas tú. Con «En frío» o «Referido», la primera sesión es para abrir la puerta.</p>
        </div>
        {confirmado && !editando && puedeEditar && (
          <BotonTexto
            onClick={() => {
              setVia(confirmado.via);
              setReferidoPor(confirmado.referidoPor ?? "");
              setEditando(true);
            }}
          >
            Cambiar
          </BotonTexto>
        )}
      </div>
      {confirmado && !editando ? (
        <p className="text-sm text-fg">
          <span className="font-medium">{NOMBRE_DE_LA_VIA[confirmado.via]}</span>
          {confirmado.via === "referido" && confirmado.referidoPor ? <span className="text-fg-secondary"> · lo refirió {confirmado.referidoPor}</span> : null}
        </p>
      ) : (
        <>
          {propuesta ? (
            <p className="text-[13px] text-fg-secondary">
              Nexus propone <span className="font-medium text-fg">{NOMBRE_DE_LA_VIA[propuesta.via].toLowerCase()}</span>: {propuesta.porque}
            </p>
          ) : (
            contactos && <p className="text-[13px] text-fg-muted">HubSpot no dice cómo llegó: elígelo tú.</p>
          )}
          {mostrarEditor && (
            <div className="flex flex-wrap items-center gap-2">
              <Select
                value={elegida}
                onChange={(e) => setVia(esViaDeLlegada(e.target.value) ? e.target.value : "")}
                aria-label="Cómo llegó el prospecto"
                className="w-auto"
              >
                <option value="">Cómo llegó…</option>
                {VIAS_DE_LLEGADA.map((v) => (
                  <option key={v} value={v}>
                    {NOMBRE_DE_LA_VIA[v]}
                  </option>
                ))}
              </Select>
              {elegida === "referido" && (
                <Input
                  value={referidoPor}
                  onChange={(e) => setReferidoPor(e.target.value)}
                  maxLength={MAX_REFERIDO_POR}
                  placeholder="¿Quién lo refirió?"
                  aria-label="Quién lo refirió"
                  className="w-56"
                />
              )}
              <Button variant="primary" size="sm" disabled={!elegida || guardando} onClick={() => void confirmar()}>
                Confirmar
              </Button>
              {editando && <BotonTexto onClick={() => setEditando(false)}>Cancelar</BotonTexto>}
            </div>
          )}
        </>
      )}
    </section>
  );
}

/** ¿La Preparación muestra arriba «La primera sesión abre la puerta»? (la primera de las sesiones que esperan, o ninguna planeada). */
export function useAbreLaPuerta(): boolean {
  const { exp, marco } = useLienzo();
  const sesiones = exp.estado.contenido.sesiones;
  return sesiones.length ? sesiones.some((s) => abreLaPuerta(exp.estado, s.id, { marco: marco.clave })) : abreLaPuerta(exp.estado, null, { marco: marco.clave });
}

/** Arriba de la Preparación: la primera sesión de un prospecto en frío o referido abre la puerta. Null si no aplica. */
export function AbrirLaPuerta({ presentacion }: { presentacion: PresentacionDeSmarteam | null }) {
  const { exp } = useLienzo();
  const abre = useAbreLaPuerta();
  if (!abre) return null;
  const llego = exp.estado.contenido.comoLlego!;
  const tramo = (t: readonly [number, number]) => `${t[0]}–${t[1]} min`;
  return (
    <section data-recorrido="preventa.preparacion.abrir-la-puerta" className="space-y-3 rounded-xl border border-info-line bg-info-surface p-4">
      <div>
        <p className="text-sm font-semibold text-fg">La primera sesión abre la puerta</p>
        <p className="text-[13px] text-fg-secondary">
          Llegó {llego.via === "referido" ? `referido${llego.referidoPor ? ` por ${llego.referidoPor}` : ""}` : "en frío"}: no pidió un diagnóstico. En esta sesión no va el plan de diagnóstico.
        </p>
      </div>
      <ol className="grid gap-2 text-[13px] sm:grid-cols-3">
        <li className="rounded-lg border border-line bg-surface px-3 py-2">
          <p className="text-2xs font-semibold uppercase tracking-wide text-fg-muted">{tramo(TRAMOS_DE_ABRIR_LA_PUERTA.presentar)}</p>
          <p className="text-fg">Presenta a Smarteam.</p>
        </li>
        <li className="rounded-lg border border-line bg-surface px-3 py-2">
          <p className="text-2xs font-semibold uppercase tracking-wide text-fg-muted">{tramo(TRAMOS_DE_ABRIR_LA_PUERTA.escuchar)}</p>
          <p className="text-fg">Que el cliente cuente lo que le pasa. Escucha.</p>
        </li>
        <li className="rounded-lg border border-line bg-surface px-3 py-2">
          <p className="text-2xs font-semibold uppercase tracking-wide text-fg-muted">{tramo(TRAMOS_DE_ABRIR_LA_PUERTA.preguntar)}</p>
          <p className="text-fg">Unas {PREGUNTAS_DE_ABRIR_LA_PUERTA} preguntas y acordar la segunda sesión.</p>
        </li>
      </ol>
      {/* K3 (2026-10-28): con el position statement armado para este prospecto, la presentación es esa. */}
      {exp.estado.propuesta.posicionamiento ? (
        <PositionStatementDelProspecto />
      ) : (
        <div className="rounded-lg border border-line bg-surface px-3 py-2.5">
          <p className="text-2xs font-semibold uppercase tracking-wide text-fg-muted">
            {presentacion?.de === "positionStatement" ? "Cómo presentar a Smarteam" : "Cómo presentar a Smarteam (mientras no esté el position statement)"}
          </p>
          <p className={cn("mt-1 whitespace-pre-wrap text-[13px] leading-[19px]", presentacion?.texto ? "text-fg" : "text-fg-muted")}>
            {presentacion?.texto ??
              "Todavía no está escrito el position statement de Smarteam (Marketing › Audiencia) ni su propuesta de valor (la ficha de Smarteam). Preséntate con lo que hace Smarteam, sin prometer resultados."}
          </p>
        </div>
      )}
    </section>
  );
}
