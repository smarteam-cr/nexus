"use client";

/**
 * components/documentacion/comentarios/ZonaDeComentarios.tsx — el contenedor de la página sobre el
 * que se ubican los comentarios.
 *
 * Es el `.nx-doc` de siempre, con `relative`: los números del margen, el botón de la selección y los
 * globos se posicionan adentro de él. Registra el elemento en el contexto, y monta la capa y el
 * panel de la página.
 */
import type { ReactNode } from "react";
import { useComentarios } from "./ContextoDeComentarios";
import CapaDeComentarios from "./CapaDeComentarios";
import PanelDeComentarios from "./PanelDeComentarios";

export default function ZonaDeComentarios({ children }: { children: ReactNode }) {
  const { registrarContenedor } = useComentarios();
  return (
    <div ref={registrarContenedor} className="nx-doc relative">
      {children}
      <CapaDeComentarios />
      <PanelDeComentarios />
    </div>
  );
}
