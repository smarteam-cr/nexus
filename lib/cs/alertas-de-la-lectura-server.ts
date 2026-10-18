/**
 * lib/cs/alertas-de-la-lectura-server.ts — escribe la queja de la lectura como `CsAlert` (el detector de la lectura,
 * memoria de la cuenta, etapa 6). SERVIDOR. La regla de qué es una queja vive en lib/cs/alertas-de-la-lectura.ts.
 *
 * El ciclo es el de toda alerta (lib/cs/alertas-reglas.ts): abierta, resuelta o descartada con una nota, y vuelve solo
 * con una señal nueva (`queHacerConLaRedeteccion`: otra reunión es evidencia nueva). Antes de crear busca una gemela
 * abierta (`mismaCitaVerificada`: el vigía ya levantó la misma queja, la misma frase de la misma reunión) y la actualiza.
 * Lo llama SOLO lib/seguimiento/hechos-server.ts (el escritor de los hechos). Nunca lanza.
 */
import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { CIERRE_DEL_SISTEMA, juntarEvidencia, mismaCitaVerificada, queHacerConLaRedeteccion } from "./alertas-reglas";
import { alertaDesdeHecho, retiroDeLaAlerta, type QuejaDeLaLectura, type ReunionDeLaQueja } from "./alertas-de-la-lectura";
import { esCuentaExcliente } from "./exclientes-server";


const RANGO: Record<string, number> = { LOW: 0, MEDIUM: 1, HIGH: 2 };

export type ResultadoDeLaQueja =
  | { estado: "creada" | "actualizada" | "gemela" | "suprimida"; alertaId: string }
  | { estado: "no_corresponde" }
  | { estado: "error"; error: string };


export async function levantarQuejaDeLaLectura(o: {
  hecho: QuejaDeLaLectura;
  clientId: string;
  reunion: ReunionDeLaQueja;
  /** La corrida de hechos («seguimiento-hechos»): queda como la corrida que la levantó. */
  agentRunId: string | null;
  ahora?: Date;
}): Promise<ResultadoDeLaQueja> {
  try {
    const a = alertaDesdeHecho(o.hecho, o.clientId, o.reunion);
    if (!a) return { estado: "no_corresponde" };
    // Un excliente confirmado no recibe alertas (lib/cs/exclientes.ts); el hecho queda igual en la memoria.
    if (await esCuentaExcliente(o.clientId)) return { estado: "no_corresponde" };
    const ahora = o.ahora ?? new Date();

    const existente = await prisma.csAlert.findFirst({ where: { dedupeKey: a.dedupeKey }, orderBy: { lastDetectedAt: "desc" } });
    const queHacer = queHacerConLaRedeteccion(existente, { severity: a.severity, evidence: a.evidence });
    if (existente && queHacer === "actualizar") {
      await prisma.csAlert.update({
        where: { id: existente.id },
        data: {
          occurrences: { increment: 1 },
          lastDetectedAt: ahora,
          reason: a.reason,
          severity: (RANGO[a.severity] ?? 0) > (RANGO[existente.severity] ?? 0) ? a.severity : existente.severity,
          // Una alerta puede juntar la misma queja de varias reuniones: los hechos y las reuniones se acumulan.
          evidence: juntarEvidencia(existente.evidence, a.evidence) as Prisma.InputJsonValue,
          agentRunId: o.agentRunId,
        },
      });
      return { estado: "actualizada", alertaId: existente.id };
    }
    if (existente && queHacer === "suprimir") return { estado: "suprimida", alertaId: existente.id };

    // Una sola alerta por cita: si el vigía ya levantó la misma queja (la misma frase de esta reunión) y sigue abierta,
    // se actualiza esa. Otra queja de la misma reunión es otra alerta.
    const abiertas = await prisma.csAlert.findMany({
      where: { clientId: o.clientId, category: "QUEJA", status: { in: ["OPEN", "SEEN"] } },
      orderBy: { lastDetectedAt: "desc" },
      take: 50,
      select: { id: true, clientId: true, category: true, evidence: true, severity: true },
    });
    const gemela = abiertas.find((x) => mismaCitaVerificada({ clientId: x.clientId, category: x.category, evidence: x.evidence }, { clientId: o.clientId, category: a.category, evidence: a.evidence }));
    if (gemela) {
      await prisma.csAlert.update({
        where: { id: gemela.id },
        data: {
          occurrences: { increment: 1 },
          lastDetectedAt: ahora,
          severity: (RANGO[a.severity] ?? 0) > (RANGO[gemela.severity] ?? 0) ? a.severity : gemela.severity,
          // La de la gemela se conserva (su cita, sus campos); solo se suman el hecho y la reunión.
          evidence: juntarEvidencia(gemela.evidence, { hechoIds: a.evidence.hechoIds, sessionIds: a.evidence.sessionIds }) as Prisma.InputJsonValue,
        },
      });
      return { estado: "gemela", alertaId: gemela.id };
    }

    const creada = await prisma.csAlert.create({
      data: {
        clientId: o.clientId,
        // La queja es de la CUENTA (como en el vigía, ACCOUNT_CATEGORIES): un cliente con 3 proyectos no la ve 3 veces.
        projectId: null,
        severity: a.severity,
        category: a.category,
        title: a.title,
        reason: a.reason,
        suggestedAction: a.suggestedAction,
        evidence: a.evidence as unknown as Prisma.InputJsonValue,
        dedupeKey: a.dedupeKey,
        agentRunId: o.agentRunId,
      },
      select: { id: true },
    });
    return { estado: "creada", alertaId: creada.id };
  } catch (e) {
    return { estado: "error", error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Una reunión cambió de dueño: la alerta que sostenía en el cliente anterior se cierra firmada por el sistema (con la
 * nota), o, si la sostienen otras reuniones del cliente, solo pierde esa reunión y ese hecho (`retiroDeLaAlerta`). Una
 * alerta ya cerrada o que ya no existe no se toca. Lo llama SOLO lib/seguimiento/hechos-server.ts. true = quedó
 * retirada (o no había nada que retirar); false = falló y el hecho la sigue mostrando.
 */
export async function retirarReunionDeLaAlerta(o: { alertaId: string; sessionId: string; hechoId: string; nota: string; ahora?: Date }): Promise<boolean> {
  try {
    const a = await prisma.csAlert.findUnique({ where: { id: o.alertaId }, select: { status: true, evidence: true } });
    if (!a || (a.status !== "OPEN" && a.status !== "SEEN")) return true;
    const r = retiroDeLaAlerta(a.evidence, o.sessionId, o.hechoId);
    await prisma.csAlert.updateMany({
      where: { id: o.alertaId, status: { in: ["OPEN", "SEEN"] } },
      data: r.cerrar
        ? { status: "DISMISSED", resolvedAt: o.ahora ?? new Date(), resolvedByEmail: CIERRE_DEL_SISTEMA, resolutionNote: o.nota, evidence: r.evidence as Prisma.InputJsonValue }
        : { evidence: r.evidence as Prisma.InputJsonValue },
    });
    return true;
  } catch (e) {
    console.error("[alertas-de-la-lectura] retirar la reunión de la alerta falló:", e instanceof Error ? e.message : e);
    return false;
  }
}
