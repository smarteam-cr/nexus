import { requireConsultantSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import AgentsClient from "./AgentsClient";

// Página DINÁMICA (cada page llama a un `require…User` y el layout lee la cookie del tema): un
// `export const revalidate` acá nunca cacheó nada — se retiró en C-15 (2026-09-04).

export default async function AgentsPage() {
  try {
    await requireConsultantSession();
  } catch {
    redirect("/");
  }

  const agents = await prisma.agent.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      description: true,
      status: true,
      scope: true,
      agentType: true,
      agentGroup: true,
      outputType: true,
      associatedStages: true,
      createdAt: true,
      _count: { select: { runs: true } },
    },
  });

  /**
   * CUÁNDO corrió cada uno por última vez, lo que corre AHORA y lo último que se rompió.
   *
   * ── POR QUÉ ESTOS TRES Y NO LA COLUMNA «ESTADO» ──────────────────────────────
   * Medido en producción el 2026-10-05: los 34 agentes están en `ACTIVE`. Una columna cuyo
   * valor es el mismo en las 34 filas ocupa ancho y no contesta nada — y lo que sí se pregunta
   * («¿esto sigue andando?», «¿se rompió algo?») no estaba en ninguna parte de la pantalla: el
   * último error vivía dentro del historial de UNA corrida, a dos clics.
   *
   * Tres consultas agregadas, no una por agente: el `groupBy` da la última fecha de los 34 de
   * una vez, y las otras dos son un conteo y un `findFirst` por índice.
   */
  const [ultimaPorAgente, corriendo, ultimoError] = await Promise.all([
    prisma.agentRun.groupBy({ by: ["agentId"], _max: { createdAt: true } }),
    prisma.agentRun.count({ where: { status: "RUNNING" } }),
    prisma.agentRun.findFirst({
      where: { status: "ERROR" },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true, agentId: true, agent: { select: { name: true } } },
    }),
  ]);

  const ultimaCorrida = Object.fromEntries(
    ultimaPorAgente
      .filter((r) => r._max.createdAt)
      .map((r) => [r.agentId, r._max.createdAt!.toISOString()]),
  );

  return (
    <AgentsClient
      agents={agents}
      ultimaCorrida={ultimaCorrida}
      corriendo={corriendo}
      ultimoError={
        ultimoError
          ? {
              agentId: ultimoError.agentId,
              nombre: ultimoError.agent?.name ?? "un agente",
              cuando: ultimoError.createdAt.toISOString(),
            }
          : null
      }
    />
  );
}
