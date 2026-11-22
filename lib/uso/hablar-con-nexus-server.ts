/**
 * lib/uso/hablar-con-nexus-server.ts — lee las corridas de «Hablar con Nexus» y su gasto para «Uso de Nexus» (22 nov).
 * SERVIDOR. Solo lo llama la página de dirección (SUPER_ADMIN).
 */
import "server-only";
import { prisma } from "@/lib/db/prisma";
import { esquemaDesactualizado } from "@/lib/db/esquema";
import { estadoDelTope, ORIGENES_DE_NEXUS, type EstadoDelTope } from "@/lib/ai/tope-de-nexus";
import { gastoDelMesDeNexus } from "@/lib/ai/tope-de-nexus-server";
import { BOTON_ERA_UNA_PREGUNTA, BOTON_GUARDARLO_COMO_NOTA, MODO_DE_LA_RESPUESTA, MODO_DEL_CHAT } from "@/lib/chat-de-nexus/conversacion-server";
import { contarHablarConNexus, type ConteoDeHablarConNexus } from "./hablar-con-nexus";

/** Cuántas corridas lee como mucho (60 vueltas y 20 preguntas por persona al día: de sobra para 30 días). */
const TOPE_DE_CORRIDAS = 20_000;

export interface UsoDeHablarConNexus {
  dias: number;
  conteo: ConteoDeHablarConNexus;
  /** Lo que gastó Nexus conversando en los `dias` (la conversación y el agente de impacto). */
  gastoUsd: number;
  /** El tope del mes en curso; null si no se pudo leer el gasto (la pantalla no muestra un cero que no es). */
  mes: EstadoDelTope | null;
}

export async function usoDeHablarConNexus(dias: number, ahora = new Date()): Promise<UsoDeHablarConNexus | null> {
  const desde = new Date(ahora.getTime() - dias * 86_400_000);
  try {
    const [corridas, gasto, delMes] = await Promise.all([
      prisma.agentRun.findMany({
        where: { createdAt: { gte: desde }, OR: [MODO_DEL_CHAT, MODO_DE_LA_RESPUESTA].map((m) => ({ filters: { path: ["modo"], equals: m } })) },
        select: { filters: true, triggeredByEmail: true, output: true },
        orderBy: { createdAt: "desc" },
        take: TOPE_DE_CORRIDAS,
      }),
      prisma.llmCall.aggregate({ _sum: { costUsd: true }, where: { at: { gte: desde }, OR: ORIGENES_DE_NEXUS.map((o) => ({ origen: { startsWith: o } })) } }),
      gastoDelMesDeNexus(ahora),
    ]);
    const filas = corridas.map((r) => {
      const f = (r.filters ?? {}) as { modo?: unknown; boton?: unknown };
      return { modo: typeof f.modo === "string" ? f.modo : "", boton: typeof f.boton === "string" ? f.boton : null, email: r.triggeredByEmail, output: r.output };
    });
    return {
      dias,
      conteo: contarHablarConNexus(filas, { modoDelChat: MODO_DEL_CHAT, modoDeLaRespuesta: MODO_DE_LA_RESPUESTA, botonPregunta: BOTON_ERA_UNA_PREGUNTA, botonNota: BOTON_GUARDARLO_COMO_NOTA }),
      gastoUsd: Number(gasto._sum.costUsd ?? 0),
      mes: delMes === null ? null : estadoDelTope(delMes),
    };
  } catch (e) {
    if (esquemaDesactualizado(e)) return null;
    throw e;
  }
}
