/**
 * lib/rentabilidad/lectura/servidor.ts — LA LECTURA DE LOS NÚMEROS: correrla, guardar lo que propone y decidirlo.
 * SERVER-ONLY. SOLO DIRECCIÓN (las rutas bajo /api/cobranza/costos/lectura, guardCostosAccess; la página de Rentabilidad).
 *
 * Un agente MEDIDO (iniciativa C de docs/roadmap.md; plan en docs/rentabilidad-conectada-plan.md):
 *  · Lo dispara una persona («Leer los números») o el job `rentabilidad-lectura-mensual` una vez por mes (el día 4,
 *    después de la foto del día 3). Nunca corre cada día.
 *  · Cada corrida deja su `AgentRun` (agentSlug `rentabilidad-lectura`, sin cliente) y cada llamada a Claude su `LlmCall`
 *    (`conContextoDeIA`): el costo por corrida sale de ahí, y Uso de Nexus lo cuenta en la familia «Finanzas».
 *  · Primero el código detecta las señales (lectura/senales.ts); sin señales, no se llama al modelo.
 *  · Lo que propone queda PENDIENTE en `PropuestaDeRentabilidad` hasta que una persona lo usa o lo desestima.
 *
 * ⛔ Lo que entra al prompt pasa por `entradaDesdeLosDatos` (lectura/contexto.ts): solo agregados.
 */
import "server-only";
import { prisma } from "@/lib/db/prisma";
import { esquemaDesactualizado, modeloDisponible } from "@/lib/db/esquema";
import { anthropic } from "@/lib/anthropic";
import { conContextoDeIA } from "@/lib/ai/contexto-de-corrida";
import { CobranzaError } from "@/lib/cobranza/mutations";
import { loadReporteAnual } from "@/lib/cobranza";
import { cargarMetaYPorFacturar } from "@/lib/finanzas/meta-server";
import { cargarRentabilidadConFotos } from "@/lib/rentabilidad/queries";
import { detectarSenales, type Senal, type TipoDeSenal } from "./senales";
import {
  AGENT_SLUG_DE_LA_LECTURA,
  HERRAMIENTA_DE_LA_LECTURA,
  MAX_TOKENS_DE_LA_LECTURA,
  MODELO_DE_LA_LECTURA,
  PROMPT_DE_LA_LECTURA,
  armarMensaje,
  entradaDesdeLosDatos,
  leerPropuestas,
} from "./contexto";
import { estadoDeLaPropuesta, sePuedeDecidir, type EstadoDeLaPropuesta } from "./estado";

const SIN_SQL = "Falta aplicar el SQL de la lectura (2026-10-18-rentabilidad-conectada.sql).";

export interface PropuestaParaVer {
  id: string;
  mes: string;
  tipo: TipoDeSenal;
  clientId: string | null;
  cuenta: string | null;
  titulo: string;
  queVe: string;
  propuesta: string;
  inversionUsd: number | null;
  inversionNota: string | null;
  estado: EstadoDeLaPropuesta;
  decididaPor: string | null;
  decididaAt: string | null;
  motivo: string | null;
  creadaAt: string;
}

export interface CorridaDeLaLectura {
  id: string;
  estado: string;
  creadaAt: string;
  por: string | null;
  /** Lo que dejó: señales, propuestas nuevas, cuántas ya estaban, cuántas descartó. */
  resumen: string | null;
}

export interface LecturaDeLosNumeros {
  disponible: boolean;
  propuestas: PropuestaParaVer[];
  corridas: CorridaDeLaLectura[];
}

/** Las propuestas (las pendientes y lo decidido de los últimos 90 días) y las últimas corridas. */
export async function cargarLecturaDeLosNumeros(ahora = new Date()): Promise<LecturaDeLosNumeros> {
  if (!modeloDisponible(prisma.propuestaDeRentabilidad)) return { disponible: false, propuestas: [], corridas: [] };
  try {
    const [filas, corridas] = await Promise.all([
      prisma.propuestaDeRentabilidad.findMany({
        where: { OR: [{ estado: "pendiente" }, { decididaAt: { gte: new Date(+ahora - 90 * 86_400_000) } }] },
        orderBy: { createdAt: "desc" },
        take: 60,
        include: { client: { select: { name: true } } },
      }),
      prisma.agentRun.findMany({
        where: { agentSlug: AGENT_SLUG_DE_LA_LECTURA },
        orderBy: { createdAt: "desc" },
        take: 6,
        select: { id: true, status: true, createdAt: true, triggeredByEmail: true, output: true },
      }),
    ]);
    return {
      disponible: true,
      propuestas: filas.map((f) => ({
        id: f.id,
        mes: f.mes,
        tipo: f.tipo as TipoDeSenal,
        clientId: f.clientId,
        cuenta: f.client?.name ?? null,
        titulo: f.titulo,
        queVe: f.queVe,
        propuesta: f.propuesta,
        inversionUsd: f.inversionUsd === null ? null : Number(f.inversionUsd),
        inversionNota: f.inversionNota,
        estado: estadoDeLaPropuesta(f, ahora),
        decididaPor: f.decididaPor,
        decididaAt: f.decididaAt?.toISOString() ?? null,
        motivo: f.motivo,
        creadaAt: f.createdAt.toISOString(),
      })),
      corridas: corridas.map((c) => ({ id: c.id, estado: c.status, creadaAt: c.createdAt.toISOString(), por: c.triggeredByEmail, resumen: resumenDeLaCorrida(c.output) })),
    };
  } catch (e) {
    if (esquemaDesactualizado(e)) return { disponible: false, propuestas: [], corridas: [] };
    throw e;
  }
}

function resumenDeLaCorrida(output: string | null): string | null {
  if (!output) return null;
  try {
    const o = JSON.parse(output) as { senales?: number; nuevas?: number; yaEstaban?: number; descartadas?: number };
    if (typeof o.senales !== "number") return output.slice(0, 200);
    if (o.senales === 0) return "Sin señales: no se llamó al modelo.";
    return `${o.senales} señales · ${o.nuevas ?? 0} propuestas nuevas${o.yaEstaban ? ` · ${o.yaEstaban} ya estaban pendientes` : ""}${o.descartadas ? ` · ${o.descartadas} descartadas por no calzar` : ""}.`;
  } catch {
    return output.slice(0, 200);
  }
}

export interface ResultadoDeLaLectura {
  agentRunId: string;
  senales: number;
  nuevas: number;
  yaEstaban: number;
  descartadas: number;
}

/**
 * Corre la lectura: arma las señales con lo agregado y, si hay, le pide al modelo qué hacer. `por` = quién la pidió
 * (null = el job mensual). Guarda solo lo nuevo: una señal con una propuesta pendiente igual no crea otra.
 */
export async function correrLecturaDeLosNumeros(o: { por: string | null; ahora?: Date }): Promise<ResultadoDeLaLectura> {
  if (!modeloDisponible(prisma.propuestaDeRentabilidad)) throw new CobranzaError(SIN_SQL, 503);
  const ahora = o.ahora ?? new Date();
  const hoyISO = new Date(+ahora - 6 * 3_600_000).toISOString().slice(0, 10);
  const anio = Number(hoyISO.slice(0, 4));

  const run = await prisma.agentRun.create({
    data: {
      agentId: null,
      agentSlug: AGENT_SLUG_DE_LA_LECTURA,
      clientId: null,
      status: "RUNNING",
      stepLabel: "Lectura de los números",
      triggeredByEmail: o.por,
      currentPhase: "Juntando los números…",
    },
    select: { id: true },
  });

  try {
    const [rentabilidad, reporte] = await Promise.all([cargarRentabilidadConFotos("trimestre", ahora), loadReporteAnual(anio, hoyISO)]);
    const meta = await cargarMetaYPorFacturar(hoyISO, reporte);
    const entrada = entradaDesdeLosDatos({
      rentabilidad,
      meses: reporte.meses,
      piso: reporte.pisoVigente?.base ?? reporte.equilibrio.base ?? null,
      meta,
    });
    const senales = detectarSenales(entrada);
    if (senales.length === 0) {
      await terminar(run.id, { senales: 0, nuevas: 0, yaEstaban: 0, descartadas: 0 });
      return { agentRunId: run.id, senales: 0, nuevas: 0, yaEstaban: 0, descartadas: 0 };
    }

    await prisma.agentRun.update({ where: { id: run.id }, data: { currentPhase: "Leyendo las señales…" } });
    const msg = await conContextoDeIA(
      { agentSlug: AGENT_SLUG_DE_LA_LECTURA, agentRunId: run.id, triggeredByEmail: o.por, clientId: null, origen: "rentabilidad › lectura" },
      () =>
        anthropic.messages.create({
          model: MODELO_DE_LA_LECTURA,
          max_tokens: MAX_TOKENS_DE_LA_LECTURA,
          system: PROMPT_DE_LA_LECTURA,
          tools: [HERRAMIENTA_DE_LA_LECTURA],
          tool_choice: { type: "tool", name: HERRAMIENTA_DE_LA_LECTURA.name },
          messages: [{ role: "user", content: armarMensaje(entrada, senales) }],
        }),
    );
    if (msg.stop_reason === "max_tokens") throw new Error("la respuesta del modelo se cortó (max_tokens)");
    const bloque = msg.content.find((b) => b.type === "tool_use");
    const { propuestas, descartadas } = leerPropuestas(bloque && bloque.type === "tool_use" ? bloque.input : null, senales);

    const pendientes = await prisma.propuestaDeRentabilidad.findMany({
      where: { estado: "pendiente", clave: { in: propuestas.map((p) => p.clave) } },
      select: { clave: true },
    });
    const ya = new Set(pendientes.map((p) => p.clave));
    const nuevas = propuestas.filter((p) => !ya.has(p.clave));
    if (nuevas.length) {
      await prisma.propuestaDeRentabilidad.createMany({
        data: nuevas.map((p) => ({
          agentRunId: run.id,
          mes: entrada.mes,
          tipo: p.senal.tipo,
          clave: p.clave,
          clientId: p.senal.clienteId,
          titulo: p.titulo,
          queVe: p.queVe,
          propuesta: p.propuesta,
          inversionUsd: p.inversionUsd,
          inversionNota: p.inversionNota,
          senal: p.senal as unknown as object,
        })),
      });
    }
    const r = { senales: senales.length, nuevas: nuevas.length, yaEstaban: propuestas.length - nuevas.length, descartadas };
    await terminar(run.id, r);
    return { agentRunId: run.id, ...r };
  } catch (e) {
    await prisma.agentRun
      .update({ where: { id: run.id }, data: { status: "ERROR", currentPhase: null, output: e instanceof Error ? e.message.slice(0, 500) : "error" } })
      .catch(() => {});
    throw e;
  }
}

async function terminar(id: string, r: Omit<ResultadoDeLaLectura, "agentRunId">) {
  await prisma.agentRun.update({ where: { id }, data: { status: "DONE", currentPhase: null, output: JSON.stringify(r) } });
}

/** Usa o desestima una propuesta. Desestimar pide el motivo. Lo ya decidido no se vuelve a decidir (409). */
export async function decidirPropuesta(id: string, decision: "usado" | "desestimado", motivo: string | null, por: string): Promise<void> {
  if (!modeloDisponible(prisma.propuestaDeRentabilidad)) throw new CobranzaError(SIN_SQL, 503);
  if (decision === "desestimado" && !motivo?.trim()) throw new CobranzaError("Para desestimarla, di por qué.", 400);
  const p = await prisma.propuestaDeRentabilidad.findUnique({ where: { id }, select: { estado: true } });
  if (!p) throw new CobranzaError("Esa propuesta ya no existe.", 404);
  if (!sePuedeDecidir(p.estado)) throw new CobranzaError("Esa propuesta ya se decidió.", 409);
  const r = await prisma.propuestaDeRentabilidad.updateMany({
    where: { id, estado: "pendiente" },
    data: { estado: decision, decididaPor: por, decididaAt: new Date(), motivo: motivo?.trim() || null },
  });
  if (r.count === 0) throw new CobranzaError("Esa propuesta ya se decidió.", 409);
}

export type { Senal };
