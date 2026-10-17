/**
 * scripts/cargar-propuesta-en-ciclo.ts — CARGA una propuesta vendida (tramos, áreas, iniciativas y calendario) en un
 * proyecto recurrente: ciclos, casos de uso como fases del cronograma, dependencias del cliente y el avance real
 * (docs/smartloop-plan.md, etapa 5; ficha E). El primero: el plan de 60 días de FACO en «FACO · SmartLoop (prueba)».
 *
 * La propuesta va en un JSON con la forma de scripts/data/propuesta-smartloop.ejemplo.json (la valida
 * lib/servicios/traductor.ts › propuestaSchema). Nexus no lee el documento de la propuesta: alguien lo pasa a esa
 * forma, con el avance que declara cada iniciativa.
 *
 *   npx tsx scripts/cargar-propuesta-en-ciclo.ts --proyecto <projectId> --archivo <propuesta.json> --por <correo>          # simulacro
 *   $env:ALLOW_PROD_WRITE="1"; npx tsx scripts/cargar-propuesta-en-ciclo.ts --proyecto <id> --archivo <json> --por <correo> --apply
 *
 * `--hoy AAAA-MM-DD` cambia el día con el que se ubica el tramo en curso (por defecto, hoy en Costa Rica).
 *
 * Solo carga en un proyecto sin historia (sin casos de uso ni ciclos cerrados); correrlo dos veces no duplica. Con
 * `--apply` se respaldan antes las tablas que toca (pg_dump; sin pg_dump el guard frena; `SIN_RESPALDO=1` lo salta a
 * sabiendas). Todo va en una transacción: o queda la propuesta entera, o nada.
 *
 * Para deshacerlo (es una prueba): los ciclos, casos y fases llevan la marca `traductor:<correo>` en `creadoPor` o se
 * nombran en la línea «Se cargó la propuesta…» del historial del cronograma.
 */
import "dotenv/config";
import "./lib/permitir-server-only";
import { readFileSync } from "node:fs";
import { imprimirDestino, resolverApply } from "./lib/guard";
import { prisma } from "@/lib/db/prisma";
import { propuestaSchema } from "@/lib/servicios/traductor";
import { cargarPlanTraducido, planParaElProyecto, proyectoParaTraducir } from "@/lib/servicios/traductor-server";
import { ErrorDelCiclo } from "@/lib/servicios/ciclos-server";

const APPLY = resolverApply({ tablas: ["CicloDeProyecto", "CasoDeUso", "ProjectTimeline", "TimelinePhase", "TimelineTask", "TimelineChange"] });

function arg(nombre: string): string | null {
  const i = process.argv.indexOf(nombre);
  return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--") ? process.argv[i + 1] : null;
}

/** Hoy en Costa Rica (UTC-6, sin horario de verano). */
function hoyEnCostaRica(): string {
  return new Date(Date.now() - 6 * 3_600_000).toISOString().slice(0, 10);
}

async function main() {
  imprimirDestino();
  const proyectoId = arg("--proyecto");
  const archivo = arg("--archivo");
  const por = arg("--por");
  if (!proyectoId || !archivo || !por) {
    console.error("Faltan argumentos: --proyecto <projectId> --archivo <propuesta.json> --por <correo de quien carga>.");
    process.exit(1);
  }
  if (!por.includes("@")) {
    console.error("--por va con el correo de quien carga la propuesta.");
    process.exit(1);
  }
  const hoy = arg("--hoy") ?? hoyEnCostaRica();

  const crudo = JSON.parse(readFileSync(archivo, "utf8")) as unknown;
  const leida = propuestaSchema.safeParse(crudo);
  if (!leida.success) {
    console.error("La propuesta no tiene la forma esperada:");
    for (const i of leida.error.issues.slice(0, 10)) console.error(`  · ${i.path.join(".") || "(raíz)"}: ${i.message}`);
    process.exit(1);
  }

  const proyecto = await proyectoParaTraducir(proyectoId);
  const plan = planParaElProyecto(leida.data, proyecto, hoy);

  console.log(`${APPLY ? "APLICANDO" : "Simulacro (nada se escribe)"}\n`);
  console.log(`Proyecto:   ${proyecto.nombre} (${proyecto.id})${proyecto.esPrueba ? " · de prueba" : ""}`);
  console.log(`Propuesta:  ${plan.propuesta}`);
  console.log(`Hoy:        ${hoy}`);
  console.log(`Ancla:      ${plan.ancla}${proyecto.ancla ? " (la que ya tenía el cronograma)" : " (el inicio del primer tramo: el cronograma no tenía)"}`);
  if (proyecto.cicloVacio) console.log(`Reusa:      el ciclo ${proyecto.cicloVacio.numero}, vacío, para el primer tramo.`);
  console.log("");
  for (const c of plan.ciclos) {
    console.log(`${c.estado === "abierto" ? "▶ Ciclo abierto" : "■ Ciclo cerrado"} · ${c.nombre} · ${c.desde} al ${c.hasta}${c.etapa ? ` · etapa ${c.etapa}` : ""}`);
    if (c.meta) console.log(`    Meta: ${c.meta}`);
    c.casos.forEach((caso, k) => {
      const decision = c.estado === "cerrado" ? ` → ${c.decisiones[k]}` : "";
      const semanas = caso.durationWeeks === 1 ? `S${caso.startWeek}` : `S${caso.startWeek}–S${caso.startWeek + caso.durationWeeks - 1}`;
      console.log(`    · ${caso.titulo} · ${semanas} · ${caso.estadoDeLaFase}${decision}${caso.criterio ? "" : " · sin criterio"}`);
      for (const d of caso.dependencias) console.log(`        depende del cliente: ${d.titulo}${d.hecha ? " (hecha)" : ""}`);
    });
  }
  if (plan.plan.length) {
    console.log(`\nAl plan de la empresa (tramos que no empiezan todavía): ${plan.plan.length}`);
    for (const c of plan.plan) console.log(`    · ${c.titulo} · tramo «${c.tramo}»`);
  }
  if (plan.avisos.length) {
    console.log("\nAvisos:");
    for (const a of plan.avisos) console.log(`  ⚠ ${a}`);
  }

  if (!APPLY) {
    console.log("\nPara cargarla: el mismo comando con --apply y ALLOW_PROD_WRITE=1.");
    return;
  }
  const r = await cargarPlanTraducido(proyecto, plan, por);
  console.log("\nCargado:");
  for (const c of r.ciclos) console.log(`  Ciclo ${c.numero} (${c.estado}): ${c.casos} casos, ${c.fases} fases, ${c.dependencias} dependencias del cliente.`);
  console.log(`  Al plan: ${r.plan}.`);
  console.log("Correrlo de nuevo no cambia nada: el proyecto ya tiene la propuesta.");
}

main()
  .catch((e) => {
    console.error(e instanceof ErrorDelCiclo ? `\n⛔ ${e.message}` : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
