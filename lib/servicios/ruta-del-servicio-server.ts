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
import { etapaQueMuestraElCiclo } from "./ciclo";
import { guiaDeServicio } from "./index";
import { rutaDelServicio, type CicloParaLaRuta, type RutaDelServicio } from "./ruta-del-servicio";

const dia = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

/** La ruta del proyecto, o null si no es un servicio recurrente. */
export async function armarRutaDelServicio(projectId: string, ahora = new Date()): Promise<RutaDelServicio | null> {
  const p = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      hubspotPipelineId: true,
      hubspotServiceId: true,
      hubspotPipelineStageLabel: true,
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

  const etapaDeHoy = (guardada: string | null) =>
    etapaQueMuestraElCiclo({ enHubspot: !!p.hubspotServiceId, rotuloDeHubspot: p.hubspotPipelineStageLabel, etapaGuardada: guardada });

  const ciclos: CicloParaLaRuta[] = p.ciclos.map((c) => {
    const crono = cronogramaDelCiclo({ anchor, casos: c.casosDeUso, fases: fasesQueCruzan, ahora });
    const porCaso = new Map(crono.casos.map((x) => [x.casoId, x]));
    return {
      numero: c.numero,
      nombre: c.nombre,
      desde: dia(c.desde),
      hasta: dia(c.hasta),
      meta: c.meta,
      // La etapa del que sigue abierto es la de HubSpot, como en la ficha: la guardada no se mueve sola.
      etapa: c.estado === "abierto" ? etapaDeHoy(c.etapa) : c.etapa,
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

  /* Nexus ya no abre ciclos (Elías, 31 oct): un proyecto que llegó de HubSpot no tiene ninguna fila, y uno con todo cerrado no
     puede abrir otra. La ruta se sube igual, con la etapa de hoy. Esta fila no se guarda: solo va en la foto. */
  if (!ciclos.some((c) => c.estado !== "cerrado")) {
    ciclos.push({ numero: Math.max(0, ...ciclos.map((c) => c.numero)) + 1, nombre: null, desde: null, hasta: null, meta: null, etapa: etapaDeHoy(null), estado: "abierto", metaResultado: null, casos: [] });
  }

  return rutaDelServicio({ servicio: guiaDeServicio(servicio)?.nombre ?? "SmartLoop", ciclos, ahora });
}
