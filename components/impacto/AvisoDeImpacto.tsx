"use client";

/**
 * AvisoDeImpacto — «Esto cambia la página de La escala: <por qué>. La regenero en 10 s · Cancelar» (Elías, 21 nov).
 *
 * Genérico: lo usa cualquier entregable cuyo agente de impacto (lib/impacto/impacto.ts) diga que una nota del equipo lo
 * cambia. Cuenta 10 s (lib/impacto/cuenta-regresiva.ts) y al llegar a 0 llama `regenerar`, que rehace el entregable como
 * BORRADOR: nunca publica. Cancelar apaga la cuenta y no toca lo guardado (la nota se queda); igual se puede regenerar a
 * mano desde el aviso.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui";
import { cuentaRegresiva, relojDelNavegador, SEGUNDOS_DE_LA_CUENTA, type CuentaRegresiva } from "@/lib/impacto/cuenta-regresiva";

type Fase = { tipo: "contando"; faltan: number } | { tipo: "corriendo" } | { tipo: "listo"; texto: string } | { tipo: "cancelada" } | { tipo: "error"; texto: string };

export interface AvisoDeImpactoProps {
  /** «Esto cambia la página de La escala: …» (`textoDelAviso`). */
  aviso: string;
  /** Lo que se hace al llegar a 0: rehacer el borrador. Devuelve el texto de «listo» o lanza con el error. */
  regenerar: () => Promise<string>;
  /** Mientras corre (rehacer tarda): «Rehaciendo la página…». */
  corriendo: string;
  onCerrar: () => void;
  segundos?: number;
}

export default function AvisoDeImpacto({ aviso, regenerar, corriendo, onCerrar, segundos = SEGUNDOS_DE_LA_CUENTA }: AvisoDeImpactoProps) {
  const [fase, setFase] = useState<Fase>({ tipo: "contando", faltan: segundos });
  const cuenta = useRef<CuentaRegresiva | null>(null);
  const correr = useCallback(() => {
    setFase({ tipo: "corriendo" });
    regenerar()
      .then((texto) => setFase({ tipo: "listo", texto }))
      .catch((e: unknown) => setFase({ tipo: "error", texto: e instanceof Error ? e.message : "No se pudo rehacer." }));
  }, [regenerar]);
  // La cuenta llama siempre al `correr` de hoy (el de quien la montó puede quedar viejo).
  const correrRef = useRef(correr);
  useEffect(() => {
    correrRef.current = correr;
  }, [correr]);

  useEffect(() => {
    const c = cuentaRegresiva({
      segundos,
      reloj: relojDelNavegador,
      alTerminar: () => correrRef.current(),
      alCambiar: (faltan, estado) => {
        if (estado === "contando") setFase({ tipo: "contando", faltan });
      },
    });
    cuenta.current = c;
    // Al desmontar (otra nota, otra pantalla) la cuenta se apaga: nada corre a escondidas.
    return () => c.cancelar();
  }, [segundos]);

  const cancelar = () => {
    cuenta.current?.cancelar();
    setFase({ tipo: "cancelada" });
  };

  return (
    <div role="status" aria-live="polite" className="flex flex-col gap-2 rounded-lg border border-info-line bg-info-surface px-3 py-2.5">
      <p className="text-[13px] leading-[19px] text-fg">{aviso}</p>
      {fase.tipo === "contando" && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-fg-secondary">
            La regenero como borrador en <strong className="tabular-nums text-fg">{fase.faltan} s</strong>. No se publica: lo revisas y publicas tú.
          </span>
          <Button size="sm" variant="secondary" onClick={cancelar}>
            Cancelar
          </Button>
        </div>
      )}
      {fase.tipo === "corriendo" && <p className="text-xs text-fg-secondary">{corriendo}</p>}
      {fase.tipo === "listo" && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-fg-secondary">{fase.texto}</span>
          <Button size="sm" variant="secondary" onClick={onCerrar}>
            Entendido
          </Button>
        </div>
      )}
      {fase.tipo === "cancelada" && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-fg-secondary">Cancelado. Tu nota quedó guardada; nada más cambió.</span>
          <Button size="sm" variant="ghost" onClick={correr}>
            Regenerar ahora
          </Button>
          <Button size="sm" variant="secondary" onClick={onCerrar}>
            Cerrar
          </Button>
        </div>
      )}
      {fase.tipo === "error" && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-danger-ink">{fase.texto}</span>
          <Button size="sm" variant="secondary" onClick={onCerrar}>
            Cerrar
          </Button>
        </div>
      )}
    </div>
  );
}
