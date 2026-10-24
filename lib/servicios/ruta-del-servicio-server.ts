/**
 * lib/servicios/ruta-del-servicio-server.ts — arma la RUTA DEL SERVICIO de un proyecto recurrente para congelarla al
 * «Subir al cliente» (docs/smartloop-plan.md, etapa 7). SERVIDOR. La forma y lo que nunca cruza: ruta-del-servicio.ts.
 *
 * Lee todos los ciclos del proyecto (abiertos y cerrados) con sus casos de uso, y las fechas de cada caso salen de su
 * fase del cronograma del proyecto con la misma regla que el cronograma del ciclo (lib/timeline/ciclo.ts). Las tareas
 * SUSPENDED y las «por validar» no cuentan: la regla es la del cronograma que ve el cliente (`cruzaAlCliente`, D0).
 */
import "server-only";
import { prisma } from "@/lib/db/prisma";
import { cronogramaDelCiclo } from "@/lib/timeline/ciclo";
import { leerFasesDelCiclo } from "@/lib/timeline/ciclo-server";
import { resolvePipeline } from "@/lib/projects/kind";
import { cruzaAlCliente } from "@/lib/external/tarea-del-cronograma";
import { guiaDeServicio } from "./index";
import { rutaDelServicio, type CicloParaLaRuta, type RutaDelServicio } from "./ruta-del-servicio";

const dia = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

/** La ruta del proyecto, o null si no es un servicio recurrente. */
export async function armarRutaDelServicio(projectId: string, ahora = new Date()): Promise<RutaDelServicio | null> {
  const p = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      hubspotPipelineId: true,
      ciclos: {
        orderBy: { numero: "asc" },
        select: {
          numero: true,
          nombre: true,
          desde: true,
          hasta: true,
          meta: true,
          etapa: true,
          estado: true,
          metaResultado: true,
          casosDeUso: {
            orderBy: [{ orden: "asc" }, { createdAt: "asc" }],
            select: { id: true, titulo: true, resultado: true, criterio: true, metrica: true, estado: true, faseId: true },
          },
        },
      },
    },
  });
  const servicio = resolvePipeline(p?.hubspotPipelineId)?.servicioRecurrente;
  if (!p || !servicio) return null;

  const faseIds = p.ciclos.flatMap((c) => c.casosDeUso.map((x) => x.faseId)).filter((x): x is string => !!x);
  const { anchor, fases } = await leerFasesDelCiclo(projectId, faseIds);
  const fasesQueCruzan = fases.map((f) => ({ ...f, tasks: f.tasks.filter(cruzaAlCliente) }));

  const ciclos: CicloParaLaRuta[] = p.ciclos.map((c) => {
    const crono = cronogramaDelCiclo({ anchor, casos: c.casosDeUso, fases: fasesQueCruzan, ahora });
    const porCaso = new Map(crono.casos.map((x) => [x.casoId, x]));
    return {
      numero: c.numero,
      nombre: c.nombre,
      desde: dia(c.desde),
      hasta: dia(c.hasta),
      meta: c.meta,
      etapa: c.etapa,
      estado: c.estado,
      metaResultado: c.metaResultado,
      casos: c.casosDeUso.map((x) => {
        const enCrono = porCaso.get(x.id);
        return {
          titulo: x.titulo,
          resultado: x.resultado,
          estadoDelCaso: x.estado,
          estadoEnElCronograma: enCrono?.estado ?? "sin_fase",
          // Sin fase, el caso ocupa el ciclo entero (como cuando se arman las fases).
          desde: enCrono?.desde ?? dia(c.desde),
          hasta: enCrono?.hasta ?? dia(c.hasta),
          dependencias: (enCrono?.dependencias ?? []).map((d) => ({ titulo: d.titulo, vence: d.vence, hecha: d.hecha })),
        };
      }),
    };
  });

  return rutaDelServicio({ servicio: guiaDeServicio(servicio)?.nombre ?? "SmartLoop", ciclos, ahora });
}
