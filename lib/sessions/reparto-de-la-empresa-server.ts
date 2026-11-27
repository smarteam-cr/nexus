/**
 * lib/sessions/reparto-de-la-empresa-server.ts — LO DE HUBSPOT DE UNA EMPRESA, A SU UNIDAD (2026-11-26).
 *
 * Las copias de HubSpot (contactos, tickets, correos, notas, llamadas, negocios) traen las filas de la empresa de HubSpot
 * de cada ficha. Cuando esa ficha es una EMPRESA con unidades (lib/clients/empresa.ts), cada fila va a la unidad que dice
 * el resolver único (`unidadDeLoDeHubspot`, lib/sessions/categorize.ts, invariante 2) con el contexto de la
 * materialización (`buildCategorizeCtx`: la gente confirmada y la aprendida de los títulos). Sin unidad, la fila se queda
 * en la empresa, donde no la lee ningún agente. DECISIONS «La empresa arriba de sus unidades».
 *
 * Sin ninguna empresa en la base, no carga nada y deja todo como siempre.
 */
import { prisma } from "@/lib/db/prisma";
import { esquemaDesactualizado } from "@/lib/db/esquema";
import { buildCategorizeCtx } from "./resolve-client";
import { unidadDeLoDeHubspot, unidadesDeLaEmpresaArriba, type CategorizeContext } from "./categorize";

/** Lo que una fila de HubSpot trae para decidir su unidad: el asunto (o el nombre del negocio) y los correos de su gente. */
export interface FilaParaRepartir {
  titulo: string | null;
  correos: readonly (string | null | undefined)[];
}

export interface RepartoDeLaEmpresa {
  /** ¿`clientId` es una empresa con unidades? */
  esEmpresa(clientId: string): boolean;
  /** Las unidades de una empresa (vacío si no es una). */
  unidadesDe(clientId: string): string[];
  /** A qué ficha va la fila: la unidad, o la misma empresa si no hay una. Para una ficha que no es empresa, ella misma. */
  destino(clientId: string, fila: FilaParaRepartir): string;
  /**
   * Las fichas que cuentan como leídas en una corrida, con las unidades de cada empresa: así una fila que pasa de una
   * unidad a otra (o de la empresa a una unidad) se da de alta en la nueva y de baja en la vieja sola.
   */
  conSusUnidades<K>(fichasPor: ReadonlyMap<K, readonly string[]>): Map<K, string[]>;
  /** Si todas estas fichas son de UNA empresa con unidades (la empresa o sus unidades), esa empresa; si no, null. */
  empresaComun(ids: readonly string[]): string | null;
  /**
   * Para lo que no se mueve solo (una venta ganada, que Cobranza y las comisiones leen donde está): si ya es de una UNIDAD
   * de esta empresa, se queda; si no (nueva, o esperando en la empresa), se reparte.
   */
  destinoSinMoverLoRepartido(clientId: string, yaEra: string | null, fila: FilaParaRepartir): string;
}

/** El reparto que no reparte nada: sin empresas en la base. */
export const SIN_REPARTO: RepartoDeLaEmpresa = {
  esEmpresa: () => false,
  unidadesDe: () => [],
  destino: (clientId) => clientId,
  conSusUnidades: (m) => new Map([...m].map(([k, v]) => [k, [...v]])),
  empresaComun: () => null,
  destinoSinMoverLoRepartido: (clientId) => clientId,
};

/** PURO: el reparto con un contexto del resolver ya armado (lo prueba `reparto-de-la-empresa.test.ts`). */
export function repartoCon(ctx: CategorizeContext): RepartoDeLaEmpresa {
  const unidades = new Map<string, string[]>();
  for (const c of ctx.clients) {
    if (c.kind !== "EMPRESA") continue;
    const u = unidadesDeLaEmpresaArriba(c.id, ctx.clients);
    if (u?.length) unidades.set(c.id, u.map((x) => x.id));
  }
  if (!unidades.size) return SIN_REPARTO;
  const empresaDe = new Map<string, string>();
  for (const [e, us] of unidades) for (const id of [e, ...us]) empresaDe.set(id, e);
  const destino = (id: string, fila: FilaParaRepartir) => (unidades.has(id) ? (unidadDeLoDeHubspot(id, fila, ctx) ?? id) : id);
  return {
    esEmpresa: (id) => unidades.has(id),
    unidadesDe: (id) => [...(unidades.get(id) ?? [])],
    destino,
    empresaComun: (ids) => {
      const de = new Set(ids.map((id) => empresaDe.get(id) ?? `sin:${id}`));
      const [una] = de;
      return de.size === 1 && una && !una.startsWith("sin:") ? una : null;
    },
    destinoSinMoverLoRepartido: (id, yaEra, fila) => (unidades.has(id) && yaEra && unidades.get(id)!.includes(yaEra) ? yaEra : destino(id, fila)),
    conSusUnidades: (m) => new Map([...m].map(([k, ids]) => [k, [...new Set(ids.flatMap((id) => [id, ...(unidades.get(id) ?? [])]))]])),
  };
}

/** El reparto de esta corrida. Una consulta chica si no hay empresas; con alguna, el contexto entero del resolver. */
export async function cargarRepartoDeEmpresas(): Promise<RepartoDeLaEmpresa> {
  /* Una base sin el valor del SQL (2026-11-26-ficha-de-tipo-empresa) no tiene empresas: lo de siempre. Cualquier otro
     error se lanza: seguir sin reparto mandaría a la empresa lo de sus unidades sin dejar rastro (la copia reintenta). */
  const hay = await prisma.client.count({ where: { kind: "EMPRESA" } }).catch((e: unknown) => {
    if (esquemaDesactualizado(e) || /invalid input value for enum/i.test(String((e as { message?: unknown })?.message ?? e))) return 0;
    throw e;
  });
  if (!hay) return SIN_REPARTO;
  return repartoCon(await buildCategorizeCtx());
}
