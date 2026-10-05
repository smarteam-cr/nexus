"use client";

/**
 * components/clients/MarcoDelDocumento.tsx — el marco de un documento del motor de landings dentro de
 * la ficha (rediseño del 2026-10-04, sistema «Nexus · interfaz interna»).
 *
 * Una franja gris dice qué es lo de abajo —«así lo ve el cliente» o «interno»— y el documento va
 * adentro de una tarjeta con las esquinas recortadas. Reemplaza al margen negativo que lo montaba a
 * sangre: el documento ya no se confunde con la pantalla que lo rodea, y la diferencia entre lo que
 * se publica y lo que es solo del equipo se lee antes de editar.
 *
 * ⚠ `overflow-clip` y NO `overflow-hidden`: recortan las esquinas igual, pero `hidden` crea un
 * contenedor de scroll y las barras `sticky` de adentro (la de publicar del Kickoff, los avisos de
 * error, las barras de Entrega e Implementación) dejarían de quedarse arriba al scrollear la ficha.
 *
 * ⚠ SIN padding adentro, a propósito: las bandas del motor (el hero y el cierre llevan fondo propio)
 * tienen que llegar a los bordes de la tarjeta. Con padding quedarían recortadas con calles a los
 * lados, que es el defecto que el margen negativo vino a resolver. Guarda:
 * lib/ui/full-bleed-workspaces.test.ts.
 */
import type { ReactNode } from "react";
import { ROTULO_DEL_SISTEMA } from "@/components/ui/sistema";

export function MarcoDelDocumento({
  loVeElCliente,
  children,
}: {
  /** La pieza se publica al cliente (`PieceDefinition.clientFacing`). */
  loVeElCliente: boolean;
  children: ReactNode;
}) {
  return (
    <section aria-label="El documento" className="overflow-clip rounded-xl border border-line bg-surface">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-line bg-surface-muted px-4 py-2">
        <span className={ROTULO_DEL_SISTEMA}>
          {loVeElCliente ? "El documento · así lo ve el cliente" : "El documento · interno, el cliente no lo ve"}
        </span>
        <span className="text-xs text-fg-muted">Se edita en el lugar</span>
      </div>
      {children}
    </section>
  );
}
