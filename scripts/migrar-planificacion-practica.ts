/**
 * scripts/migrar-planificacion-practica.ts — pasa a la Planificación lo que ya había en Ejecución
 * (2026-10-02).
 *
 * La Planificación pasó a ser lo que va a quedar configurado en HubSpot, y tres secciones de Ejecución
 * se mudaron a ella:
 *   · «Arquitectura de propiedades» → «Propiedades por objeto» (con el tipo de campo de HubSpot)
 *   · «Pipelines y objetos»         → «Tus pipelines» (el texto de las etapas queda como nota)
 *   · «Procesos de marketing»       → «Automatizaciones»
 *
 * Hasta acá ninguna mudanza de sección había copiado contenido: la sección nacía vacía en el destino.
 * Este script lo copia, para que una persona no tenga que regenerar ni reescribir lo que ya estaba.
 *
 * Reglas:
 *   · Solo copia si la sección de destino está VACÍA: nunca pisa lo que la Planificación ya tiene.
 *   · Si el proyecto no tiene Planificación, la crea (con sus secciones).
 *   · Antes de escribir guarda una versión de la Planificación («Versiones anteriores»).
 *   · En Ejecución, las tres secciones se OCULTAN, no se borran (lib/canvas/retirar-secciones.ts).
 *   · Correrlo dos veces no cambia nada la segunda.
 *
 * Simulacro por defecto (solo lee). Para escribir:
 *   ALLOW_PROD_WRITE=1 npx tsx scripts/migrar-planificacion-practica.ts --apply
 */
import "dotenv/config";
import { Prisma } from "@prisma/client";
import { describirDestino, resolverApply } from "./lib/guard";
import { prisma } from "@/lib/db/prisma";
import { canvasOf } from "@/lib/pieces/canvas-query";
import { PLANIFICACION_CANVAS, planificacionSectionSequence } from "@/lib/canvas/canvas-defs";
import { createOnDemandCanvas, reconcileOnDemandCanvasSections } from "@/lib/canvas/default-canvases";
import { guardarVersionDelDocumento } from "@/lib/canvas/versiones";
import { ocultarSeccionesRetiradas } from "@/lib/canvas/retirar-secciones";
import { desdeTablaDeIntegracion, type AutorDeFila } from "@/lib/planificacion/propiedades";
import { adoptarPipelines, adoptarAutomatizaciones } from "@/lib/planificacion/secciones";

const TABLAS = ["CanvasBlock", "CanvasSection", "ProjectCanvas"];

type Fuente = "AGENT" | "HUMAN" | "MODIFIED";

interface Mudanza {
  desde: string;
  hacia: string;
  /** El contenido convertido, o null si no hay nada que pasar. */
  convertir: (data: Record<string, unknown>, fuente: Fuente) => Record<string, unknown> | null;
}

const lista = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const texto = (v: unknown): string => (typeof v === "string" ? v : "");

const MUDANZAS: Mudanza[] = [
  {
    desde: "arquitectura_propiedades",
    hacia: "propiedades",
    convertir: (d, fuente) => {
      // Lo que tocó una persona en Ejecución llega como suyo: regenerar la Planificación no lo pisa.
      const autor: AutorDeFila = fuente === "AGENT" ? "ia" : "persona";
      const filas = desdeTablaDeIntegracion(lista(d.filas) as never[], autor);
      return filas.length ? { intro: texto(d.intro), filas } : null;
    },
  },
  {
    desde: "pipelines",
    hacia: "pipelines",
    convertir: (d) => {
      const r = adoptarPipelines(d);
      return r.pipelines.length ? { intro: r.intro ?? "", pipelines: r.pipelines } : null;
    },
  },
  {
    desde: "procesos_marketing",
    hacia: "automatizaciones",
    convertir: (d) => {
      const r = adoptarAutomatizaciones(d);
      return r.items.length ? { intro: r.intro ?? "", items: r.items } : null;
    },
  },
];

const RETIRADAS = MUDANZAS.map((m) => m.desde);

/** Lo mismo que `ensurePlanificacionCanvas` del runner (que no se puede importar acá: arrastra
 *  módulos `server-only`). Crea la Planificación si falta y le suma las secciones nuevas. */
async function asegurarPlanificacion(projectId: string, existente: string | null): Promise<string> {
  const id = existente ?? (await createOnDemandCanvas(projectId, PLANIFICACION_CANVAS));
  await reconcileOnDemandCanvasSections(id, PLANIFICACION_CANVAS, planificacionSectionSequence);
  return id;
}

/** ¿La sección de destino ya tiene algo escrito? */
function tieneContenido(data: unknown): boolean {
  if (!data || typeof data !== "object") return false;
  return Object.values(data as Record<string, unknown>).some((v) =>
    Array.isArray(v) ? v.length > 0 : typeof v === "string" ? v.trim().length > 0 : false,
  );
}

async function main() {
  const APPLY = resolverApply({ tablas: TABLAS });
  console.log(`Base: ${describirDestino(process.env.DATABASE_URL)} · ${APPLY ? "APLICAR" : "SIMULACRO (no escribe)"}\n`);

  const ejecuciones = await prisma.projectCanvas.findMany({
    where: canvasOf("implementation"),
    select: {
      id: true,
      projectId: true,
      project: { select: { name: true, client: { select: { name: true } } } },
      canvasSections: {
        where: { key: { in: RETIRADAS } },
        select: {
          key: true,
          blocks: { where: { blockType: "CARD" }, orderBy: { order: "asc" }, take: 1, select: { data: true, source: true } },
        },
      },
    },
  });

  let copias = 0;
  let ocultas = 0;
  for (const ej of ejecuciones) {
    const projectId = ej.projectId;
    if (!projectId) continue;
    const nombre = `${ej.project?.client?.name ?? "?"} · ${ej.project?.name ?? ej.projectId}`;
    const porKey = new Map(ej.canvasSections.map((s) => [s.key, s.blocks[0]]));
    const aPasar = MUDANZAS.map((m) => {
      const b = porKey.get(m.desde);
      const data = b?.data && typeof b.data === "object" ? (b.data as Record<string, unknown>) : null;
      return { m, fuente: (b?.source ?? "AGENT") as Fuente, convertido: data ? m.convertir(data, (b?.source ?? "AGENT") as Fuente) : null };
    }).filter((x) => x.convertido);

    if (!ej.canvasSections.length) continue;
    console.log(`■ ${nombre}`);
    if (!aPasar.length) console.log("   (sin contenido para pasar)");

    // La Planificación del proyecto (en simulacro, solo se mira).
    const plan = await prisma.projectCanvas.findFirst({
      where: { projectId, ...canvasOf("planning") },
      select: { id: true },
    });
    const destinos = plan
      ? await prisma.canvasSection.findMany({
          where: { canvasId: plan.id, key: { in: MUDANZAS.map((m) => m.hacia) } },
          select: { id: true, key: true, blocks: { where: { blockType: "CARD" }, take: 1, select: { data: true } } },
        })
      : [];
    const destinoPorKey = new Map(destinos.map((d) => [d.key, d]));

    const plan_ = aPasar.filter(({ m }) => {
      const dest = destinoPorKey.get(m.hacia);
      if (dest && tieneContenido(dest.blocks[0]?.data)) {
        console.log(`   = ${m.desde} → ${m.hacia}: la Planificación ya tiene contenido ahí; no se pisa.`);
        return false;
      }
      return true;
    });
    for (const { m, convertido, fuente } of plan_) {
      const n = lista(convertido!.filas ?? convertido!.pipelines ?? convertido!.items).length;
      console.log(`   → ${m.desde} → ${m.hacia}: ${n} elemento(s)${fuente !== "AGENT" ? " (tocado por una persona)" : ""}${plan ? "" : " · se crea la Planificación"}`);
    }
    const presentes = ej.canvasSections.map((s) => s.key);
    console.log(`   ◌ en Ejecución se ocultan: ${presentes.join(", ")}`);

    if (!APPLY) continue;

    if (plan_.length) {
      const planId = await asegurarPlanificacion(projectId, plan?.id ?? null);
      if (plan) await guardarVersionDelDocumento(planId, { origen: "Antes de traer lo de Ejecución" });
      for (const { m, convertido, fuente } of plan_) {
        const seccion = await prisma.canvasSection.findFirst({ where: { canvasId: planId, key: m.hacia }, select: { id: true } });
        if (!seccion) {
          console.log(`   ⚠ ${m.hacia}: la Planificación no tiene esa sección; se saltea.`);
          continue;
        }
        await prisma.$transaction([
          prisma.canvasBlock.deleteMany({ where: { sectionId: seccion.id } }),
          prisma.canvasBlock.create({
            data: {
              sectionId: seccion.id,
              blockType: "CARD",
              content: null,
              data: convertido as Prisma.InputJsonValue,
              order: 0,
              source: fuente,
              status: "CONFIRMED",
            },
          }),
        ]);
        copias++;
      }
      await prisma.projectCanvas.update({ where: { id: planId }, data: { contentUpdatedAt: new Date() } });
    }
    const hechas = await ocultarSeccionesRetiradas(ej.id, presentes, RETIRADAS);
    ocultas += hechas.length;
  }

  console.log(
    APPLY
      ? `\n✓ Aplicado: ${copias} sección(es) copiadas a la Planificación, ${ocultas} oculta(s) en Ejecución.`
      : "\nSimulacro: no se escribió nada. Para aplicar: ALLOW_PROD_WRITE=1 npx tsx scripts/migrar-planificacion-practica.ts --apply",
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
