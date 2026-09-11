"use client";

/**
 * components/documentacion/ContextoDeVivos.tsx — los datos derivados, al alcance de los bloques.
 *
 * El bloque «Vivo» no guarda contenido: declara una fuente y pinta lo que el SERVIDOR calculó al
 * abrir la página (`lib/documentacion/vivos.ts`). Ese cálculo no puede viajar dentro del bloque
 * —son registros de decenas de KB y una consulta a la base—, así que baja una sola vez por
 * página y se reparte por contexto.
 *
 * ⚠ El que MONTA el provider nunca es el que lo consume (lección vieja del aplicador del chat):
 * acá lo monta `PaginaCliente` y lo leen los bloques, que están más abajo.
 */
import { createContext, useContext } from "react";
import type { DatosVivos } from "@/lib/documentacion/vivos";

const Contexto = createContext<DatosVivos | null>(null);

export function ProveedorDeVivos({
  datos,
  children,
}: {
  datos: DatosVivos | null;
  children: React.ReactNode;
}) {
  return <Contexto.Provider value={datos}>{children}</Contexto.Provider>;
}

/** `null` = la página no tiene bloques vivos (no se calculó nada) o todavía no bajaron. */
export function useVivos(): DatosVivos | null {
  return useContext(Contexto);
}
