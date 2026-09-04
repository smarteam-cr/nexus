/**
 * lib/hubspot/preseleccion-traible.ts — la empresa que la persona VENÍA a traer, primera.
 *
 * C-18 (2026-09-04): desde /sessions, una empresa de HubSpot que todavía no es cliente llega al
 * índice de clientes con `?traer=<companyId>`. El modal «Traer de HubSpot» la pone al frente de
 * la lista y, si no está entre las traíbles, lo DICE: el universo solo ofrece empresas con un
 * proyecto que falta traer, así que «no está» tiene dos motivos honestos (ya es cliente bajo
 * otra ficha, o no tiene proyecto en HubSpot) y ninguno es «se perdió».
 *
 * Puro y sin imports de valor a propósito: lo consume un componente de cliente. Un import de
 * valor desde `empresas-con-proyecto.ts` arrastraría Prisma y el cliente de HubSpot al bundle
 * del navegador.
 */
import type { EmpresaTraible } from "./empresas-con-proyecto";

export interface Preseleccion<T> {
  /** Las mismas empresas, con la elegida primera. Nunca se pierde ni se duplica ninguna. */
  lista: T[];
  /** Si la empresa pedida estaba entre las traíbles. `false` también cuando no se pidió ninguna. */
  encontrada: boolean;
}

export function conLaPreseleccionadaPrimero<T extends Pick<EmpresaTraible, "companyId">>(
  traibles: readonly T[],
  companyId: string | null,
): Preseleccion<T> {
  if (!companyId) return { lista: [...traibles], encontrada: false };
  const elegida = traibles.filter((e) => e.companyId === companyId);
  const resto = traibles.filter((e) => e.companyId !== companyId);
  return { lista: [...elegida, ...resto], encontrada: elegida.length > 0 };
}
