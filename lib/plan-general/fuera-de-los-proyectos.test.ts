/**
 * lib/plan-general/fuera-de-los-proyectos.test.ts — un cronograma de PLAN no se cuela donde se espera uno de proyecto.
 *
 * Desde el 2026-11-26 un `ProjectTimeline` puede ser de un proyecto O de un plan general (DECISIONS «El plan general es un
 * objeto de la cuenta»). Los lectores que llegan al cronograma desde un proyecto (`project.timeline`, `where: { projectId }`,
 * `timeline: { project: … }`) no pueden ver uno de plan: una relación nula no cumple ningún filtro sobre el proyecto. El
 * riesgo son las consultas de VARIOS cronogramas, fases o tareas que se escriben directo sobre esas tablas.
 *
 * Este registro lista CADA archivo que hace una de esas consultas, con por qué un cronograma de plan no le cambia nada o
 * cómo lo contempla. Uno nuevo lo pone en rojo hasta que alguien lo decide (molde: lib/projects/scope-coverage.ts). Un
 * archivo que dejó de consultar también, para que la lista no mienta.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const RAIZ = process.cwd();
const CARPETAS = ["app", "lib", "components", "scripts"];
const CONSULTA = /\b(?:prisma|tx|db)\.(?:projectTimeline|timelinePhase|timelineTask)\.(?:findMany|findFirst|count|groupBy|aggregate|updateMany|deleteMany)\(/;

const POR_PROYECTO = "filtra por el proyecto (projectId / project) o por un cronograma ya leído desde un proyecto";
const POR_CRONOGRAMA = "trabaja dentro de UN cronograma (timelineId o phaseId) que la ruta ya leyó desde su proyecto";

const REGISTRO: Record<string, string> = {
  "app/(shell)/clients/ClientsTable.tsx": POR_PROYECTO,
  "app/api/clients/[id]/analyze/route.ts": POR_CRONOGRAMA,
  "app/api/projects/[projectId]/timeline/borrador/aplicar/route.ts": POR_CRONOGRAMA,
  "app/api/projects/[projectId]/timeline/borrador/operaciones/route.ts": POR_CRONOGRAMA,
  "app/api/projects/[projectId]/timeline/estructura/route.ts": POR_CRONOGRAMA,
  "app/api/projects/[projectId]/timeline/particularidades/[particularidadId]/convert/route.ts": POR_PROYECTO,
  "app/api/projects/[projectId]/timeline/particularidades/[particularidadId]/resolve/route.ts": POR_PROYECTO,
  "app/api/projects/[projectId]/timeline/particularidades/[particularidadId]/route.ts": POR_CRONOGRAMA,
  "app/api/projects/[projectId]/timeline/particularidades/route.ts": POR_CRONOGRAMA,
  "app/api/projects/[projectId]/timeline/phases/[phaseId]/route.ts": POR_PROYECTO,
  "app/api/projects/[projectId]/timeline/progress/apply/route.ts": POR_CRONOGRAMA,
  "app/api/projects/[projectId]/timeline/proposal/route.ts": POR_PROYECTO,
  "app/api/projects/[projectId]/timeline/route.ts": POR_PROYECTO,
  "lib/asistente/contexto.ts": POR_PROYECTO,
  "lib/auth/api-guards.ts": "guardIaDelCronograma cuenta tareas de la IA de UN cronograma (el de la ruta del proyecto)",
  "lib/auth/permissions/artifact-gate.ts": POR_PROYECTO,
  "lib/carga/queries.ts": "la carga lee cronogramas de proyectos de cartera (`project: proyectoDeCarteraWhere()`)",
  "lib/external/timeline-view.ts": "el chokepoint del cliente: dentro del cronograma que pidió (de un proyecto o del plan)",
  "lib/invariantes/cronograma.ts": "INV22 recorre TODAS las fases a propósito y nombra al plan cuando la fase es suya",
  "lib/para-ti/fuentes/cs.ts": POR_PROYECTO,
  "lib/para-ti/fuentes/proyectos.ts": POR_PROYECTO,
  "lib/plan-general/leer.ts": "el plan general: los loops de proyectos de la cuenta y el riel",
  "lib/plan-general/loops-del-handoff-server.ts": "los loops de los proyectos de una cuenta (`timeline: { project: … }`)",
  "lib/plan-general/plan.ts": "las fases propias del plan, dentro de SU cronograma",
  "lib/tiempos/disparar.ts": "«¿cuánto te tomó?»: pide `projectId` no nulo (una fase del plan no lleva la pregunta)",
  "lib/tiempos/resultados.ts": "los resultados de tiempos piden `projectId` no nulo: cuentan tareas de proyectos",
  "lib/timeline/baseline.ts": POR_CRONOGRAMA,
  "lib/timeline/borrador-del-detalle.ts": POR_CRONOGRAMA,
  "lib/timeline/borrador-del-handoff.ts": POR_PROYECTO,
  "lib/timeline/ciclo-server.ts": POR_CRONOGRAMA,
  "lib/timeline/escribir-estructura.ts": POR_CRONOGRAMA,
  "lib/timeline/escribir-tareas.ts": POR_CRONOGRAMA,
  "lib/timeline/historial-del-cronograma-server.ts": POR_CRONOGRAMA,
  "lib/timeline/project-actions-loader.ts": POR_PROYECTO,
  "lib/timeline/propuesta-para-el-chat.ts": POR_PROYECTO,
  "lib/timeline/una-tarea.ts": "las operaciones de una tarea: siempre dentro del cronograma de SU dueño (proyecto o plan)",
  // Scripts de operación.
  "scripts/backfill-timeline-anchor.ts": "pide `projectId` no nulo: un plan no tiene kickoff del que tomar el arranque",
  "scripts/fusionar-fases-cronograma.ts": POR_CRONOGRAMA,
  "scripts/inspect-handoff-timelines.ts": "solo lectura; filtra por el tipo de servicio del proyecto",
  "scripts/inspect-progress-model.ts": "solo lectura, para mirar; un cronograma de plan sale sin proyecto",
  "scripts/inspect-timeline-candidates.ts": "solo lectura; pide `projectId` no nulo",
  "scripts/kolbi-plan-general.ts": POR_PROYECTO,
  "scripts/kolbi-plan-de-la-cuenta.ts": "crea el plan de kölbi: dentro del cronograma de SU plan",
  "scripts/lib/conversion-de-viejas.ts": POR_CRONOGRAMA,
  "scripts/limpiar-piezas-basura.ts": POR_PROYECTO,
  "scripts/merge-particularidades-duplicadas.ts": "solo cronogramas con particularidades: un plan no tiene",
  "scripts/probar-asistente.ts": "solo lectura; salta los cronogramas sin proyecto",
  "scripts/propuestas-abiertas.ts": "pide `projectId` no nulo: un plan no tiene propuestas del handoff",
  "scripts/reset-all-onboarding.ts": POR_PROYECTO,
  "scripts/reset-client-onboarding.ts": POR_PROYECTO,
  "scripts/reset-clients-content.ts": POR_PROYECTO,
  "scripts/reset-handoff-kickoff-timeline-procesos.ts": POR_PROYECTO,
  "scripts/reset-one-project.ts": POR_PROYECTO,
  "scripts/sanar-semanas-fuera-de-fase.ts": "recorre TODAS las fases a propósito (INV22) y nombra al plan cuando la fase es suya",
  "scripts/verify-timeline-progress.ts": "por ids de UN cronograma de proyecto (PROJECT_ID)",
};

function archivos(dir: string, acc: string[] = []): string[] {
  const abs = path.join(RAIZ, dir);
  if (!fs.existsSync(abs)) return acc;
  for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
    const rel = `${dir}/${e.name}`;
    if (e.isDirectory()) {
      if (e.name === "node_modules" || e.name === "archive" || e.name.startsWith(".")) continue;
      archivos(rel, acc);
    } else if (/\.(ts|tsx)$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) acc.push(rel);
  }
  return acc;
}

describe("⛔ un cronograma de plan general no se cuela donde se espera uno de proyecto", () => {
  const conConsulta = CARPETAS.flatMap((c) => archivos(c)).filter((rel) => CONSULTA.test(fs.readFileSync(path.join(RAIZ, rel), "utf8")));

  it("el escaneo encuentra las consultas (no pasa en vacío)", () => {
    expect(conConsulta.length).toBeGreaterThanOrEqual(40);
  });

  it("⭐ cada archivo que consulta varios cronogramas, fases o tareas dice por qué uno de plan no le cambia nada", () => {
    const sinDecidir = conConsulta.filter((rel) => !(rel in REGISTRO));
    expect(
      sinDecidir,
      "Estos archivos consultan cronogramas, fases o tareas directo. Desde el 26 nov un cronograma puede ser de un plan " +
        "general (sin proyecto): decide si lo tiene que ver, filtra (`projectId: { not: null }` o por el proyecto) y súmalo " +
        "a REGISTRO con el motivo.",
    ).toEqual([]);
  });

  it("la lista no miente: cada archivo del registro sigue consultando", () => {
    const sobran = Object.keys(REGISTRO).filter((rel) => !conConsulta.includes(rel));
    expect(sobran, "Estos ya no consultan (o se movieron): sácalos de REGISTRO.").toEqual([]);
  });
});
