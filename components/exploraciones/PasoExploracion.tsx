"use client";

/**
 * PasoExploracion — las sesiones con el cliente.
 *
 * Una pestaña por sesión, cada una con «Antes» (la guía para prepararla) y «Después» (leer la
 * reunión, lo que salió, lo que nadie exploró y armar la siguiente): components/exploraciones/
 * SesionesDeExploracion.tsx (pedido de Elías, 2026-10-03). La escala, las áreas en juego y los datos
 * de la medición viven en «La escala»; con quién se habla y cómo conectar, en Preparación. Al final,
 * plegado, el historial del agente.
 *
 * Arriba, «Sumar una sesión o transcripción» (Elías, 2026-10-06): una llamada de Gong, una minuta o
 * el resumen del Smartflow, a la vista y no plegado dentro de «Después». Es la puerta del flujo
 * liviano: la preventa que se abre «Con una transcripción» llega acá con `?sumar=1` y el panel abierto.
 */
import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { HistorialDelAgente } from "./PanelDelAgente";
import SesionesDeExploracion from "./SesionesDeExploracion";
import SumarAMano from "./SumarAMano";
import { useLienzo } from "./contexto";

function SumarUnaSesion() {
  const { puedeEditar, documentos } = useLienzo();
  const sumarAlAbrir = useSearchParams().get("sumar") === "1";
  const [abierto, setAbierto] = useState(sumarAlAbrir);
  if (!puedeEditar && documentos.length === 0) return null;
  return (
    <section data-recorrido="preventa.sesion.sumar" className="rounded-xl border border-line bg-surface">
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-fg">¿Una sesión que no quedó en Meet?</p>
          <p className="text-xs text-fg-muted">
            Una llamada de Gong, una minuta o el resumen del Smartflow: súmala y el agente la lee como una transcripción.
            {documentos.length > 0 ? ` Ya sumaste ${documentos.length}.` : ""}
          </p>
        </div>
        <button
          type="button"
          aria-expanded={abierto}
          onClick={() => setAbierto((x) => !x)}
          className="rounded-lg border border-line bg-surface px-3 py-1.5 text-[13px] font-medium text-fg-secondary transition-colors hover:bg-surface-hover hover:text-fg"
        >
          {abierto ? "Cerrar" : puedeEditar ? "Sumar una sesión o transcripción" : "Ver lo que se sumó"}
        </button>
      </div>
      {abierto && (
        <div className="border-t border-line p-4">
          <SumarAMano />
        </div>
      )}
    </section>
  );
}

export default function PasoExploracion() {
  return (
    <div className="space-y-8">
      <SumarUnaSesion />
      <SesionesDeExploracion />
      <HistorialDelAgente />
    </div>
  );
}
