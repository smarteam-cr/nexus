/**
 * lib/servicios/traductor-server.ts — CARGA una propuesta traducida (lib/servicios/traductor.ts) en un proyecto
 * recurrente (docs/smartloop-plan.md, etapa 5; ficha E). Servidor. Lo usa scripts/cargar-propuesta-en-ciclo.ts.
 *
 * Solo carga en un proyecto SIN historia: sin casos de uso ni ciclos cerrados. El único ciclo que acepta encontrar es
 * el primero vacío que se abre solo al entrar al proyecto: ese pasa a ser el del primer tramo. Correrlo dos veces no
 * duplica: la segunda vez el proyecto ya tiene historia y lo dice.
 *
 * Todo va en UNA transacción: o queda la propuesta entera, o no queda nada.
 */
import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { resolvePipeline } from "@/lib/projects/kind";
import { anotarCambioDelCiclo, asegurarCronograma, crearDependenciaDelCliente, crearFaseDelCaso } from "@/lib/timeline/ciclo-server";
import { notasDeLaFase } from "@/lib/timeline/ciclo";
import { armarCierre } from "./cierre";
import { ErrorDelCiclo } from "./ciclos-server";
import { traducirPropuesta, type PlanTraducido, type Propuesta } from "./traductor";

export interface ProyectoParaTraducir {
  id: string;
  nombre: string;
  clientId: string;
  esPrueba: boolean;
  enHubspot: boolean;
  /** El ancla del cronograma, si ya tiene. */
  ancla: string | null;
  /** El ciclo vacío que se abrió solo y se reusa para el primer tramo. */
  cicloVacio: { id: string; numero: number } | null;
}

/** Revisa que el proyecto pueda recibir la propuesta. Lanza ErrorDelCiclo con el motivo si no. */
export async function proyectoParaTraducir(projectId: string): Promise<ProyectoParaTraducir> {
  const p = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      id: true, name: true, clientId: true, esPrueba: true, hubspotPipelineId: true, hubspotServiceId: true,
      timeline: { select: { anchorStartDate: true } },
    },
  });
  if (!p) throw new ErrorDelCiclo("El proyecto no existe.", 404);
  if (!resolvePipeline(p.hubspotPipelineId)?.servicioRecurrente) throw new ErrorDelCiclo("El proyecto no es de un servicio recurrente.", 409);
  const [ciclos, casos] = await Promise.all([
    prisma.cicloDeProyecto.findMany({ where: { projectId }, select: { id: true, numero: true, estado: true, creadoPor: true } }),
    prisma.casoDeUso.count({ where: { projectId } }),
  ]);
  if (ciclos.some((c) => c.creadoPor?.startsWith("traductor:"))) throw new ErrorDelCiclo("Esta propuesta (u otra) ya se cargó en el proyecto.", 409);
  if (casos > 0 || ciclos.some((c) => c.estado !== "abierto") || ciclos.length > 1) {
    throw new ErrorDelCiclo("El proyecto ya tiene ciclos o casos de uso: el traductor solo carga en un proyecto sin historia.", 409);
  }
  const vacio = ciclos[0] ?? null;
  return {
    id: p.id,
    nombre: p.name,
    clientId: p.clientId,
    esPrueba: p.esPrueba,
    enHubspot: !!p.hubspotServiceId,
    ancla: p.timeline?.anchorStartDate ? p.timeline.anchorStartDate.toISOString().slice(0, 10) : null,
    cicloVacio: vacio ? { id: vacio.id, numero: vacio.numero } : null,
  };
}

export function planParaElProyecto(propuesta: Propuesta, proyecto: ProyectoParaTraducir, hoy: string): PlanTraducido {
  return traducirPropuesta(propuesta, { hoy, anclaDelCronograma: proyecto.ancla });
}

const fecha = (s: string) => new Date(`${s}T00:00:00.000Z`);

export interface ResultadoDeLaCarga {
  ciclos: Array<{ numero: number; estado: "cerrado" | "abierto"; casos: number; fases: number; dependencias: number }>;
  plan: number;
}

/** Escribe el plan traducido. `por` firma todo (el creadoPor de los ciclos lleva la marca del traductor). */
export async function cargarPlanTraducido(proyecto: ProyectoParaTraducir, plan: PlanTraducido, por: string): Promise<ResultadoDeLaCarga> {
  const marca = `traductor:${por}`;
  return prisma.$transaction(
    async (tx) => {
      // Releer dentro de la transacción: otra corrida pudo cargar a la vez.
      const ya = await tx.cicloDeProyecto.count({ where: { projectId: proyecto.id, creadoPor: { startsWith: "traductor:" } } });
      if (ya > 0) throw new ErrorDelCiclo("Esta propuesta (u otra) ya se cargó en el proyecto.", 409);
      const { timelineId } = await asegurarCronograma(tx, proyecto.id, plan.ancla);
      const resultado: ResultadoDeLaCarga = { ciclos: [], plan: 0 };
      let orden = 0;
      let reusado = false;

      for (const [i, c] of plan.ciclos.entries()) {
        const datos = {
          nombre: c.nombre,
          desde: fecha(c.desde),
          hasta: fecha(c.hasta),
          meta: c.meta,
          etapa: c.estado === "cerrado" ? "aprendizaje" : (proyecto.enHubspot ? "diagnostico" : (c.etapa ?? "planificacion")),
          estado: c.estado,
          creadoPor: marca,
          ...(c.estado === "cerrado" ? { cerradoAt: fecha(c.hasta), cerradoPor: marca } : {}),
        };
        let cicloId: string;
        let numero: number;
        if (i === 0 && proyecto.cicloVacio && !reusado) {
          reusado = true;
          await tx.cicloDeProyecto.update({ where: { id: proyecto.cicloVacio.id }, data: datos });
          cicloId = proyecto.cicloVacio.id;
          numero = proyecto.cicloVacio.numero;
        } else {
          numero = (proyecto.cicloVacio?.numero ?? 0) + i + (proyecto.cicloVacio ? 0 : 1);
          const creado = await tx.cicloDeProyecto.create({ data: { projectId: proyecto.id, numero, ...datos }, select: { id: true } });
          cicloId = creado.id;
        }

        let fases = 0;
        let dependencias = 0;
        const casosCerrados: Array<{ id: string; titulo: string; criterio: string | null; criterioMedido: string | null; decisionAlCerrar: string }> = [];
        for (const [k, caso] of c.casos.entries()) {
          const decision = c.estado === "cerrado" ? c.decisiones[k] : null;
          // En un tramo cerrado, lo que no se hizo «pasa»: entra al ciclo abierto (el traductor ya lo puso ahí).
          if (decision === "pasa") {
            casosCerrados.push({ id: `importado-${i}-${k}`, titulo: caso.titulo, criterio: caso.criterio, criterioMedido: null, decisionAlCerrar: "pasa" });
            continue;
          }
          const faseId = await crearFaseDelCaso(
            tx,
            timelineId,
            { nombre: caso.titulo, notas: notasDeLaFase(caso), startWeek: caso.startWeek, durationWeeks: caso.durationWeeks, estado: caso.estadoDeLaFase },
            por,
          );
          fases++;
          for (const d of caso.dependencias) {
            await crearDependenciaDelCliente(tx, faseId, { titulo: d.titulo, weekIndex: d.weekIndex, hecha: d.hecha }, por);
            dependencias++;
          }
          const fila = await tx.casoDeUso.create({
            data: {
              clientId: proyecto.clientId,
              projectId: proyecto.id,
              cicloId,
              faseId,
              titulo: caso.titulo,
              resultado: caso.resultado,
              mueve: caso.mueve as unknown as Prisma.InputJsonValue,
              porque: caso.porque,
              criterio: caso.criterio,
              metrica: caso.metrica,
              origen: "propuesta",
              estado: decision === "cumplido" ? "cumplido" : "en_ciclo",
              decisionAlCerrar: decision,
              orden: orden++,
              creadoPor: marca,
            },
            select: { id: true },
          });
          if (decision) casosCerrados.push({ id: fila.id, titulo: caso.titulo, criterio: caso.criterio, criterioMedido: null, decisionAlCerrar: decision });
        }
        if (c.estado === "cerrado") {
          const cierre = armarCierre(
            { meta: c.meta, metaResultado: null, metaEvaluada: null, siguienteCiclo: null, casos: casosCerrados },
            [],
            "importado",
          );
          await tx.cicloDeProyecto.update({ where: { id: cicloId }, data: { cierre: cierre as unknown as Prisma.InputJsonValue } });
        }
        resultado.ciclos.push({ numero, estado: c.estado, casos: c.casos.length, fases, dependencias });
      }

      for (const caso of plan.plan) {
        await tx.casoDeUso.create({
          data: {
            clientId: proyecto.clientId,
            projectId: proyecto.id,
            titulo: caso.titulo,
            resultado: caso.resultado,
            mueve: caso.mueve as unknown as Prisma.InputJsonValue,
            porque: caso.porque,
            criterio: caso.criterio,
            metrica: caso.metrica,
            origen: "propuesta",
            estado: "en_plan",
            orden: orden++,
            creadoPor: marca,
          },
        });
        resultado.plan++;
      }
      await anotarCambioDelCiclo(tx, timelineId, `Se cargó la propuesta «${plan.propuesta}»: los casos de uso de cada tramo son fases del cronograma.`, { propuesta: plan.propuesta, ...resultado }, por);
      return resultado;
    },
    { timeout: 60_000 },
  );
}
