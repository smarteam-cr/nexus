/**
 * lib/servicios/cronograma-del-ciclo-server.ts — el CRONOGRAMA DEL CICLO abierto de un proyecto recurrente
 * (docs/smartloop-plan.md, etapa 3; ficha E). Servidor.
 *
 * Cada caso de uso del ciclo es una fase del cronograma del proyecto, con su criterio de aceptación. Lo que hace:
 *  · leer el cronograma del ciclo: cada caso con sus semanas, su avance, sus dependencias del cliente y lo que cambió
 *    desde la versión aprobada (las reglas, en lib/timeline/ciclo.ts);
 *  · «armar las fases»: un caso sin fase pasa a ser una fase que ocupa el ciclo entero (el CSE la ajusta en el Gantt);
 *  · sumar una dependencia del cliente a un caso (una tarea con responsable CLIENTE en su fase);
 *  · aplicar la propuesta cuando una dependencia del cliente se atrasó (Nexus la propone; la persona la aplica);
 *  · aprobar la versión: la foto de lo que se le presentó al cliente.
 *
 * Escribe el ciclo y sus casos (con ciclos-server.ts es el escritor de esas tablas); lo que va al cronograma lo escribe
 * lib/timeline/ciclo-server.ts dentro de la misma transacción.
 */
import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import {
  aplicarPropuestaALaFase,
  cambiosDesdeLaAprobada,
  cronogramaDelCiclo,
  fotoParaAprobar,
  leerFotoAprobada,
  notasDeLaFase,
  semanaDelCiclo,
  semanasDelCiclo,
  type CronogramaDelCiclo,
} from "@/lib/timeline/ciclo";
import {
  anotarCambioDelCiclo,
  asegurarCronograma,
  correrFasePorDependencia,
  crearDependenciaDelCliente,
  crearFaseDelCaso,
  leerFasesDelCiclo,
} from "@/lib/timeline/ciclo-server";
import { ErrorDelCiclo } from "./ciclos-server";

const dia = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

export interface CronogramaDelCicloVista {
  ciclo: { id: string; numero: number; nombre: string | null; desde: string | null; hasta: string | null };
  /** El ancla del cronograma del proyecto (null = todavía sin fechas). */
  anchor: string | null;
  cronograma: CronogramaDelCiclo;
  aprobada: { version: number; at: string | null; por: string | null; cambios: string[] } | null;
}

async function cicloAbierto(projectId: string) {
  const c = await prisma.cicloDeProyecto.findFirst({
    where: { projectId, estado: "abierto" },
    select: {
      id: true, numero: true, nombre: true, desde: true, hasta: true,
      versionAprobada: true, aprobadoAt: true, aprobadoPor: true, cronogramaAprobado: true,
      casosDeUso: {
        where: { estado: { not: "descartado" } },
        orderBy: [{ orden: "asc" }, { createdAt: "asc" }],
        select: { id: true, titulo: true, criterio: true, metrica: true, estado: true, faseId: true },
      },
    },
  });
  if (!c) throw new ErrorDelCiclo("No hay un ciclo abierto.", 409);
  return c;
}

/** El cronograma del ciclo abierto; null si el proyecto no tiene uno abierto. */
export async function cargarCronogramaDelCiclo(projectId: string, ahora = new Date()): Promise<CronogramaDelCicloVista | null> {
  const c = await cicloAbierto(projectId).catch((e) => {
    if (e instanceof ErrorDelCiclo) return null;
    throw e;
  });
  if (!c) return null;
  const faseIds = c.casosDeUso.map((x) => x.faseId).filter((x): x is string => !!x);
  const { anchor, fases } = await leerFasesDelCiclo(projectId, faseIds);
  const cronograma = cronogramaDelCiclo({ anchor, casos: c.casosDeUso, fases, ahora });
  return {
    ciclo: { id: c.id, numero: c.numero, nombre: c.nombre, desde: dia(c.desde), hasta: dia(c.hasta) },
    anchor,
    cronograma,
    aprobada:
      c.versionAprobada > 0
        ? {
            version: c.versionAprobada,
            at: c.aprobadoAt?.toISOString() ?? null,
            por: c.aprobadoPor,
            cambios: cambiosDesdeLaAprobada(leerFotoAprobada(c.cronogramaAprobado), cronograma),
          }
        : null,
  };
}

/**
 * «Armar las fases»: cada caso del ciclo sin fase pasa a ser una fase que ocupa el ciclo entero. Pide las fechas del
 * ciclo.
 *
 * Sin ancla en el cronograma, NO la pone sola (docs/KNOWN-ERRORS.md: `anchorStartDate` se escribe solo con un clic que
 * lo diga): responde 409 con el código `SIN_ARRANQUE` y la fecha propuesta (el inicio del ciclo). La pantalla pregunta
 * «El cronograma arranca el …. ¿Lo confirmas?» y reintenta con `fijarArranque: true`; solo ahí se escribe.
 */
export async function armarFasesDelCiclo(projectId: string, por: string, opciones: { fijarArranque?: boolean } = {}): Promise<{ creadas: number }> {
  const c = await cicloAbierto(projectId);
  const desde = dia(c.desde);
  const hasta = dia(c.hasta);
  if (!desde || !hasta) throw new ErrorDelCiclo("Pon las fechas del ciclo (en la tarjeta de la etapa) antes de armar su cronograma.", 409);
  const sinFase = c.casosDeUso.filter((x) => !x.faseId);
  if (sinFase.length === 0) return { creadas: 0 };
  return prisma.$transaction(async (tx) => {
    const { timelineId, anchor } = await asegurarCronograma(tx, projectId, opciones.fijarArranque ? desde : null);
    if (!anchor) {
      // La transacción se deshace: ni el cronograma vacío que se haya creado queda.
      throw new ErrorDelCiclo(`El cronograma todavía no tiene fecha de arranque: confirma que arranca el ${desde}.`, 409, {
        codigo: "SIN_ARRANQUE",
        fecha: desde,
      });
    }
    const inicio = semanaDelCiclo(anchor ?? desde, desde);
    const semanas = semanasDelCiclo(desde, hasta) ?? 2;
    let creadas = 0;
    for (const caso of sinFase) {
      // Releer: otra pestaña pudo armarla a la vez.
      const ahora = await tx.casoDeUso.findUnique({ where: { id: caso.id }, select: { faseId: true } });
      if (ahora?.faseId) continue;
      const faseId = await crearFaseDelCaso(tx, timelineId, { nombre: caso.titulo, notas: notasDeLaFase(caso), startWeek: inicio, durationWeeks: semanas }, por);
      await tx.casoDeUso.update({ where: { id: caso.id }, data: { faseId } });
      creadas++;
    }
    if (creadas) {
      await anotarCambioDelCiclo(tx, timelineId, `Se armó el cronograma del ciclo ${c.numero}: ${creadas} ${creadas === 1 ? "caso de uso pasó" : "casos de uso pasaron"} a ser fases.`, { ciclo: c.numero, creadas }, por);
    }
    return { creadas };
  });
}

/** Un caso de uso del ciclo abierto de este proyecto, con su fase (404 si es de otro, 409 si todavía no tiene fase). */
async function casoConFase(projectId: string, casoId: string) {
  const c = await cicloAbierto(projectId);
  const caso = c.casosDeUso.find((x) => x.id === casoId);
  if (!caso) throw new ErrorDelCiclo("Ese caso de uso no es del ciclo abierto de este proyecto.", 404);
  if (!caso.faseId) throw new ErrorDelCiclo("Ese caso de uso todavía no es una fase: arma el cronograma del ciclo primero.", 409);
  return { ciclo: c, caso, faseId: caso.faseId };
}

/** Suma una dependencia del cliente al caso de uso: una tarea con responsable CLIENTE en su fase. */
export async function agregarDependencia(projectId: string, casoId: string, datos: { titulo: string; semana?: number }, por: string) {
  const { ciclo, caso, faseId } = await casoConFase(projectId, casoId);
  return prisma.$transaction(async (tx) => {
    const id = await crearDependenciaDelCliente(tx, faseId, { titulo: datos.titulo, weekIndex: (datos.semana ?? 1) - 1 }, por);
    const fase = await tx.timelinePhase.findUnique({ where: { id: faseId }, select: { timelineId: true } });
    if (fase) await anotarCambioDelCiclo(tx, fase.timelineId, `Ciclo ${ciclo.numero}: «${caso.titulo}» suma la dependencia del cliente «${datos.titulo}».`, { caso: casoId, dependencia: id }, por);
    return { id };
  });
}

/** Aplica la propuesta por una dependencia del cliente atrasada. La vuelve a calcular: no confía en la pantalla. */
export async function aplicarPropuestaDeDependencia(projectId: string, casoId: string, por: string, ahora = new Date()) {
  const { ciclo, caso, faseId } = await casoConFase(projectId, casoId);
  const { anchor, fases } = await leerFasesDelCiclo(projectId, [faseId]);
  const vista = cronogramaDelCiclo({ anchor, casos: [caso], fases, ahora }).casos[0];
  const fase = fases[0];
  if (!vista?.propuesta || !fase) throw new ErrorDelCiclo("Ya no hay nada atrasado que correr en ese caso de uso.", 409);
  const cambio = aplicarPropuestaALaFase(fase, vista.propuesta);
  await prisma.$transaction(async (tx) => {
    await correrFasePorDependencia(tx, faseId, cambio);
    const t = await tx.timelinePhase.findUnique({ where: { id: faseId }, select: { timelineId: true } });
    if (t) {
      await anotarCambioDelCiclo(
        tx,
        t.timelineId,
        `Ciclo ${ciclo.numero}: ${vista.propuesta!.texto}`,
        { caso: casoId, semanas: vista.propuesta!.semanas, dependencias: vista.propuesta!.dependencias },
        por,
      );
    }
  });
  return { semanas: vista.propuesta.semanas };
}

/** Aprueba la versión del cronograma del ciclo: guarda la foto de lo que se le presentó al cliente. */
export async function aprobarCronogramaDelCiclo(projectId: string, por: string, ahora = new Date()) {
  const vista = await cargarCronogramaDelCiclo(projectId, ahora);
  if (!vista) throw new ErrorDelCiclo("No hay un ciclo abierto.", 409);
  if (vista.cronograma.casos.length === 0) throw new ErrorDelCiclo("El ciclo no tiene casos de uso: no hay cronograma que aprobar.", 409);
  if (vista.cronograma.sinFase > 0) throw new ErrorDelCiclo("Hay casos de uso sin fase: arma el cronograma del ciclo antes de aprobarlo.", 409);
  const r = await prisma.cicloDeProyecto.update({
    where: { id: vista.ciclo.id },
    data: {
      cronogramaAprobado: fotoParaAprobar(vista.cronograma) as unknown as Prisma.InputJsonValue,
      versionAprobada: { increment: 1 },
      aprobadoAt: ahora,
      aprobadoPor: por,
    },
    select: { versionAprobada: true },
  });
  return { version: r.versionAprobada };
}
