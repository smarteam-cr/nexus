/**
 * lib/uso/ia-server.ts — lo que leen las pestañas «IA por cliente», «Procesos de IA» y «Conclusiones» de «Uso de
 * Nexus». SERVIDOR, solo lectura, solo para dirección (la página corta antes de llamar).
 *
 * Lee las llamadas de `LlmCall` de la ventana por su índice de fecha, con TOPE: si se llega, la pantalla lo dice (un
 * total recortado en silencio miente). Cada llamada se ubica en su empresa, en este orden: la que guardó la llamada, la
 * de su corrida (`AgentRun.clientId`) o la dueña de la reunión que la disparó (`origen = "reunion:<id> › …"`, con
 * `duenoDeLaSesion`). Lo que no se puede ubicar va a «Sin empresa»: no se adivina.
 *
 * Lo propuesto sale de lib/lo-propuesto con UNA lectura (`itemsDeLoPropuesto`), que sirve para el cliente, el proceso y
 * el equipo.
 *
 * ⛔ Nada de costos de personas: el gasto de IA se muestra por proceso y por empresa, nunca por persona.
 */
import "server-only";
import { prisma } from "@/lib/db/prisma";
import { esquemaDesactualizado } from "@/lib/db/esquema";
import { reunionDelOrigen } from "@/lib/ai/contexto-de-corrida";
import { duenoDeLaSesion } from "@/lib/sessions/project-sources";
import { itemsDeLoPropuesto } from "@/lib/lo-propuesto/registro-server";
import type { ItemParaContar } from "@/lib/lo-propuesto/conteo";
import type { ClaveDeTipo } from "@/lib/lo-propuesto/tipos";
import { loPropuestoPorCliente, loPropuestoPorProceso } from "./agrupar";
import type { DiasDeIa } from "./vistas";
import { procesoDeLaLlamada, resumirIa, usoVacio, type ClaveDeProceso, type LlamadaDeIA, type ResumenDeIA, type UsoDeLoQuePropone } from "./ia";

const DIA_MS = 86_400_000;
/** Las llamadas que se leen como mucho. ~1.100 en 30 días el 8 oct: sobra margen para 90. */
export const TOPE_DE_LLAMADAS = 30_000;
const LOTE = 1_000;


export interface ClienteConIa {
  clientId: string;
  nombre: string;
  /** CLIENTE, PROSPECTO, ALIADO o INTERNO (el de hoy). */
  tipo: string;
  costo: number;
  llamadas: number;
  corridas: number;
  porAproximacion: number;
  sinTarifa: number;
  procesos: { clave: ClaveDeProceso; costo: number; llamadas: number }[];
  propuesto: UsoDeLoQuePropone;
}

export interface DatosDeIa {
  faltaLaTabla: boolean;
  dias: DiasDeIa;
  desde: string;
  hasta: string;
  /** Se llegó al tope de llamadas: los totales son un piso. */
  llegoAlTope: boolean;
  resumen: ResumenDeIA;
  clientes: ClienteConIa[];
  /** Empresas a las que Nexus les propuso algo y no gastaron IA en la ventana (por ejemplo, alertas de una regla). */
  soloPropuesto: number;
  corridasConError: Partial<Record<ClaveDeProceso, number>>;
  propuestoPorProceso: Partial<Record<ClaveDeProceso, UsoDeLoQuePropone>>;
  /** Lo propuesto, por tipo, crudo: lo reusan las conclusiones y «Para qué se usa». */
  itemsPorTipo: Map<ClaveDeTipo, ItemParaContar[]>;
}

async function enLotes<T, R>(ids: T[], leer: (lote: T[]) => Promise<R[]>): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < ids.length; i += LOTE) out.push(...(await leer(ids.slice(i, i + LOTE))));
  return out;
}

export async function datosDeIa(dias: DiasDeIa, ahora = new Date()): Promise<DatosDeIa> {
  const desde = new Date(ahora.getTime() - dias * DIA_MS);
  const ventana = { desde, hasta: ahora };
  const base = {
    dias,
    desde: desde.toISOString(),
    hasta: ahora.toISOString(),
  };

  let filas: Omit<LlamadaDeIA, "ubicada">[] | null = null;
  try {
    filas = await prisma.llmCall.findMany({
      where: { at: { gte: desde, lt: ahora } },
      orderBy: { at: "desc" },
      take: TOPE_DE_LLAMADAS,
      select: { at: true, costUsd: true, ok: true, agentSlug: true, agentRunId: true, origen: true, triggeredByEmail: true, clientId: true },
    });
  } catch (e) {
    if (!esquemaDesactualizado(e)) throw e;
  }

  const itemsPorTipo = await itemsDeLoPropuesto({ ...ventana, ahora });
  const propuestoPorCliente = loPropuestoPorCliente(itemsPorTipo, ventana);
  const propuestoPorProceso = Object.fromEntries(loPropuestoPorProceso(itemsPorTipo, ventana)) as Partial<Record<ClaveDeProceso, UsoDeLoQuePropone>>;

  if (!filas) {
    return {
      ...base,
      faltaLaTabla: true,
      llegoAlTope: false,
      resumen: resumirIa([]),
      clientes: [],
      soloPropuesto: propuestoPorCliente.size,
      corridasConError: {},
      propuestoPorProceso,
      itemsPorTipo,
    };
  }

  // Las corridas: de qué empresa son y si terminaron en error.
  const idsDeCorridas = [...new Set(filas.map((f) => f.agentRunId).filter((x): x is string => !!x))];
  const corridas = await enLotes(idsDeCorridas, (lote) =>
    prisma.agentRun.findMany({ where: { id: { in: lote } }, select: { id: true, clientId: true, status: true } }),
  );
  const corridaPorId = new Map(corridas.map((c) => [c.id, c]));

  // Las reuniones de las llamadas que no traen empresa ni corrida.
  const idsDeReuniones = [
    ...new Set(filas.filter((f) => !f.clientId && !f.agentRunId).map((f) => reunionDelOrigen(f.origen)).filter((x): x is string => !!x)),
  ];
  const reuniones = await enLotes(idsDeReuniones, (lote) =>
    prisma.firefliesSession.findMany({ where: { id: { in: lote } }, select: { id: true, resolvedClientId: true, manualClientId: true } }),
  );
  const duenoDeReunion = new Map(reuniones.map((r) => [r.id, duenoDeLaSesion(r)]));

  const llamadas: LlamadaDeIA[] = filas.map((f) => {
    if (f.clientId) return { ...f, ubicada: "llamada" };
    const deLaCorrida = f.agentRunId ? corridaPorId.get(f.agentRunId)?.clientId : null;
    if (deLaCorrida) return { ...f, clientId: deLaCorrida, ubicada: "corrida" };
    const reunion = reunionDelOrigen(f.origen);
    const deLaReunion = reunion ? duenoDeReunion.get(reunion) : null;
    if (deLaReunion) return { ...f, clientId: deLaReunion, ubicada: "reunion" };
    return { ...f, clientId: null, ubicada: null };
  });

  const resumen = resumirIa(llamadas);

  const corridasConError: Partial<Record<ClaveDeProceso, number>> = {};
  const vistas = new Set<string>();
  for (const f of llamadas) {
    if (!f.agentRunId || vistas.has(f.agentRunId)) continue;
    vistas.add(f.agentRunId);
    if (corridaPorId.get(f.agentRunId)?.status !== "ERROR") continue;
    const clave = procesoDeLaLlamada(f);
    corridasConError[clave] = (corridasConError[clave] ?? 0) + 1;
  }

  const idsDeClientes = [...new Set([...resumen.porCliente.map((c) => c.clientId), ...propuestoPorCliente.keys()])];
  const empresas = await enLotes(idsDeClientes, (lote) =>
    prisma.client.findMany({ where: { id: { in: lote } }, select: { id: true, name: true, kind: true } }),
  );
  const empresaPorId = new Map(empresas.map((e) => [e.id, e]));

  const clientes: ClienteConIa[] = resumen.porCliente.map((c) => ({
    clientId: c.clientId,
    nombre: empresaPorId.get(c.clientId)?.name ?? "Empresa borrada",
    tipo: empresaPorId.get(c.clientId)?.kind ?? "CLIENTE",
    costo: c.costo,
    llamadas: c.llamadas,
    corridas: c.corridas,
    porAproximacion: c.porAproximacion,
    sinTarifa: c.sinTarifa,
    procesos: c.procesos,
    propuesto: propuestoPorCliente.get(c.clientId) ?? usoVacio(),
  }));
  const conIa = new Set(clientes.map((c) => c.clientId));

  return {
    ...base,
    faltaLaTabla: false,
    llegoAlTope: filas.length >= TOPE_DE_LLAMADAS,
    resumen,
    clientes,
    soloPropuesto: [...propuestoPorCliente.keys()].filter((id) => !conIa.has(id) && empresaPorId.has(id)).length,
    corridasConError,
    propuestoPorProceso,
    itemsPorTipo,
  };
}
