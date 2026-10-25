import "server-only";

/**
 * lib/canvas/diagnostico-confirmado-server.ts — junta lo que hace falta para `loConfirmadoDelDiagnostico`
 * (lib/canvas/diagnostico-confirmado.ts) de UN proyecto. SERVIDOR, solo lectura.
 *
 * Cada pieza se lee por la puerta que ya existe: la ficha (`leerFicha`), los resultados del handoff
 * (`resultadosDelProyecto`), los procesos (`contarProcesosDelCliente`), cuánto hay en la exploración del proyecto (por la
 * puerta de siempre, `cuantoHayEnLaExploracion`: solo números), las reuniones que el diagnóstico va a leer (el chokepoint,
 * por `getProjectDocumentSessions` y las que entran solas) y, en un recurrente, la exploración del ciclo (M2).
 * Una pieza que falla cuenta como vacía: el aviso nunca frena el documento.
 */
import { prisma } from "@/lib/db/prisma";
import { camposPropuestos, leerFicha } from "@/lib/clients/ficha";
import { resultadosDelProyecto } from "@/lib/handoff/resultados";
import { sinConfirmar } from "@/lib/handoff/resultados-medibles";
import { contarProcesosDelCliente } from "@/lib/canvas/read-procesos";
import { cuantoHayEnLaExploracion } from "@/lib/canvas/load-canvas-context";
import { getProjectDocumentSessions } from "@/lib/sessions/project-sources";
import { reunionesQueEntranSolasAlDiagnostico } from "@/lib/contexto/sugerencias-del-documento-server";
import { loConfirmadoDelDiagnostico, type LoConfirmado } from "./diagnostico-confirmado";
import { estadoDelCicloParaElRiel } from "@/lib/servicios/ciclos-server";

async function seguro<T>(fn: () => Promise<T>, respaldo: T): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    console.warn("[diagnostico-confirmado] una pieza no se pudo leer (cuenta como vacía):", e instanceof Error ? e.message : e);
    return respaldo;
  }
}

export async function loConfirmadoDelProyecto(projectId: string): Promise<LoConfirmado> {
  const proyecto = await prisma.project.findUnique({
    where: { id: projectId },
    select: { clientId: true, client: { select: { ficha: true } } },
  });
  const ficha = leerFicha(proyecto?.client?.ficha);
  const [resultados, procesos, exploracion, elegidas, deLaExplo, ciclo] = await Promise.all([
    seguro(() => resultadosDelProyecto(projectId), null),
    proyecto?.clientId ? seguro(() => contarProcesosDelCliente(proyecto.clientId), { total: 0, validados: 0 }) : { total: 0, validados: 0 },
    seguro(() => cuantoHayEnLaExploracion(projectId), { existe: false, confirmados: 0, propuestos: 0 }),
    seguro(() => getProjectDocumentSessions(projectId, "diagnostico").then((r) => r.sessions.map((s) => s.id)), [] as string[]),
    seguro(() => reunionesQueEntranSolasAlDiagnostico(projectId), [] as string[]),
    // M2: en un recurrente, cuántas reuniones leyó la exploración en el ciclo. null fuera de un servicio recurrente.
    seguro(() => estadoDelCicloParaElRiel(projectId), null),
  ]);
  const lista = resultados?.resultados ?? [];
  return loConfirmadoDelDiagnostico({
    ficha: { confirmada: !!ficha.confirmadaAt, camposPropuestos: camposPropuestos(ficha).length },
    resultados: { total: lista.length, confirmados: lista.filter((r) => !sinConfirmar(r)).length },
    procesos,
    exploracionDelProyecto: exploracion,
    reuniones: new Set([...elegidas, ...deLaExplo]).size,
    ciclo: ciclo?.arranque ? { numero: ciclo.numero, lecturasDeExploracion: ciclo.arranque.lecturasDeExploracion } : null,
  });
}
