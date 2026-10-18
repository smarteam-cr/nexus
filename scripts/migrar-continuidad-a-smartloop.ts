/**
 * scripts/migrar-continuidad-a-smartloop.ts — qué proyectos de «Continuidad» pasarían a SmartLoop y en qué etapa del
 * ciclo (docs/smartloop-plan.md, «Para cuando lleguen los proyectos reales»).
 *
 * Los servicios recurrentes de hoy viven en el pipeline de implementación de HubSpot, etapa «Continuidad». Este script
 * los LISTA con la etapa del ciclo que les deduce Nexus (lib/servicios/migracion.ts: compara lo vendido con el
 * cronograma y los documentos) y su porqué.
 *
 * ⚠ La etapa de cada uno la confirma Customer Success. El paso a SmartLoop lo hace una persona EN HUBSPOT (mover el
 * proyecto al pipeline SmartLoop, en la etapa confirmada); el espejo de proyectos lo trae a Nexus. ⛔ Este script nunca
 * escribe en HubSpot.
 *
 * Con `--apply` (detrás del guard) abre en Nexus el ciclo 1 de cada proyecto listado que todavía no tiene ninguno, en la
 * etapa sugerida, para que el día que se mueva en HubSpot ya tenga su ciclo. Mientras el proyecto siga en el pipeline de
 * implementación ese ciclo no se ve en ningún lado (solo lo leen los proyectos de un servicio recurrente). Correrlo dos
 * veces no crea otro.
 *
 *   npx tsx scripts/migrar-continuidad-a-smartloop.ts                                   # simulacro (solo lee)
 *   npx tsx scripts/migrar-continuidad-a-smartloop.ts --cliente <clientId>              # uno
 *   $env:ALLOW_PROD_WRITE="1"; npx tsx scripts/migrar-continuidad-a-smartloop.ts --apply --firma tu@smarteamcr.com
 *
 * Con `--apply` se respalda antes `CicloDeProyecto` (pg_dump; sin pg_dump el guard frena; `SIN_RESPALDO=1` lo salta a
 * sabiendas). Deshacer: `DELETE FROM "CicloDeProyecto" WHERE "creadoPor" = 'migracion:<firma>'`.
 */
import "dotenv/config";
import "./lib/permitir-server-only";
import { imprimirDestino, resolverApply } from "./lib/guard";
import { prisma } from "@/lib/db/prisma";
import { canvasOfAny } from "@/lib/pieces/canvas-query";
import { pieceForCanvas } from "@/lib/pieces/registry";
import { pipelineByKey } from "@/lib/projects/kind";
import { ETAPA_CONTINUIDAD } from "@/lib/servicios/recurrencia";
import { etapaAlMigrar } from "@/lib/servicios/migracion";
import { ETIQUETA_DE_ETAPA } from "@/lib/servicios/ciclo";

const APPLY = resolverApply({ tablas: ["CicloDeProyecto"] });

function arg(nombre: string): string | null {
  const i = process.argv.indexOf(nombre);
  return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--") ? process.argv[i + 1] : null;
}

const DOCUMENTOS = ["diagnosis", "planning"] as const;

async function main() {
  imprimirDestino();
  const firma = arg("--firma")?.trim().toLowerCase() ?? null;
  if (APPLY && (!firma || !firma.includes("@"))) {
    console.error("Con --apply hace falta --firma <tu correo>: queda en «creadoPor» de cada ciclo.");
    process.exit(1);
  }
  if (!ETAPA_CONTINUIDAD) {
    console.error("El pipeline de implementación no declara la etapa «Continuidad» (lib/projects/kind.ts).");
    process.exit(1);
  }
  const cliente = arg("--cliente");
  const cs = pipelineByKey("customer-success");
  const smartloop = pipelineByKey("smartloop");

  const proyectos = await prisma.project.findMany({
    where: {
      hubspotPipelineId: cs.hubspotPipelineId,
      hubspotPipelineStageId: ETAPA_CONTINUIDAD,
      esPrueba: false,
      status: { not: "completed" },
      ...(cliente ? { clientId: cliente } : {}),
    },
    orderBy: [{ client: { name: "asc" } }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      clientId: true,
      hubspotServiceId: true,
      hubspotOwnerEmail: true,
      client: { select: { name: true, projects: { where: { hubspotPipelineId: smartloop.hubspotPipelineId, esPrueba: false }, select: { id: true, name: true } } } },
      timeline: { select: { phases: { orderBy: { order: "asc" }, select: { name: true, status: true } } } },
      handoff: { select: { id: true } },
      ciclos: { select: { numero: true, etapa: true, estado: true } },
      canvases: {
        where: canvasOfAny(DOCUMENTOS),
        select: { slug: true, name: true, canvasSections: { select: { _count: { select: { blocks: true } } } } },
      },
    },
  });

  if (!proyectos.length) {
    console.log("No hay proyectos abiertos en «Continuidad»: nada que migrar.");
    return;
  }

  console.log(`\n${proyectos.length} proyecto(s) en «Continuidad» (pipeline de implementación):\n`);
  const porEtapa = new Map<string, number>();
  const aAbrir: { projectId: string; etapa: string }[] = [];
  for (const p of proyectos) {
    const documentos = new Set<string>();
    for (const c of p.canvases) {
      const slug = pieceForCanvas(c)?.slug;
      if (slug && c.canvasSections.some((s) => s._count.blocks > 0)) documentos.add(slug);
    }
    const abierto = p.ciclos.find((c) => c.estado === "abierto") ?? null;
    const r = etapaAlMigrar({
      cicloAbierto: abierto ? { etapa: abierto.etapa } : null,
      fases: p.timeline?.phases ?? [],
      documentos,
      tieneHandoff: !!p.handoff,
    });
    porEtapa.set(r.etapa, (porEtapa.get(r.etapa) ?? 0) + 1);
    const yaEnSmartloop = p.client.projects.length ? ` · ⚠ la cuenta ya tiene SmartLoop («${p.client.projects[0].name}»)` : "";
    console.log(`· ${p.client.name} — «${p.name}»${p.hubspotServiceId ? "" : " · sin registro en HubSpot"}${yaEnSmartloop}`);
    console.log(`    CSE: ${p.hubspotOwnerEmail ?? "sin encargado"}`);
    console.log(`    Etapa sugerida: ${ETIQUETA_DE_ETAPA[r.etapa]} (${r.confianza === "alta" ? "ya en Nexus" : "a confirmar con Customer Success"})`);
    console.log(`    Por qué: ${r.razon}`);
    if (!p.ciclos.length) aAbrir.push({ projectId: p.id, etapa: r.etapa });
  }

  console.log("\nResumen por etapa sugerida:");
  for (const [etapa, n] of porEtapa) console.log(`  ${ETIQUETA_DE_ETAPA[etapa as keyof typeof ETIQUETA_DE_ETAPA] ?? etapa}: ${n}`);
  console.log(`\nSin ciclo en Nexus: ${aAbrir.length} (con --apply se les abre el ciclo 1 en la etapa sugerida).`);
  console.log("\n⚠ La etapa de cada uno la confirma Customer Success. El paso a SmartLoop se hace en HubSpot, a mano:");
  console.log("  mover el proyecto al pipeline «SmartLoop», en la etapa confirmada. Este script no escribe en HubSpot.\n");

  if (!APPLY) {
    console.log("Simulacro: no se escribió nada. Para abrir los ciclos: --apply --firma <tu correo> (con ALLOW_PROD_WRITE=1).");
    return;
  }

  let abiertos = 0;
  for (const a of aAbrir) {
    // Releer: entre el listado y la escritura alguien pudo abrir el ciclo desde la ficha.
    const ya = await prisma.cicloDeProyecto.count({ where: { projectId: a.projectId } });
    if (ya) continue;
    await prisma.cicloDeProyecto.create({ data: { projectId: a.projectId, numero: 1, etapa: a.etapa, estado: "abierto", creadoPor: `migracion:${firma}` } });
    abiertos++;
  }
  console.log(`✓ ${abiertos} ciclo(s) abierto(s). Correrlo de nuevo no crea otros.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
