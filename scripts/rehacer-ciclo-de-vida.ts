/**
 * scripts/rehacer-ciclo-de-vida.ts — rehace SOLO la sección «Etapas del ciclo de vida» de UNA planificación con la regla
 * del 2026-11-12: siempre las 7 etapas de HubSpot (lib/planificacion/secciones.ts, `normalizarCicloDeVida`).
 *
 * Para qué: la «Planificación de martketing (test)» de Cemaco · Costa Rica salió con etapas inventadas («Contacto en
 * base», «Contacto depurado», «Cliente activo»…). Elías pidió rehacer solo esa sección, sin tocar el resto del documento.
 * Se corre DESPUÉS del deploy: con el código viejo, la próxima regeneración volvería a inventar etapas.
 *
 * Cómo:
 *   1. Lee la sección (la primera tarjeta, como el editor).
 *   2. Le pide al agente que la rehaga con la guía nueva de la sección y su contenido actual (no lee reuniones: lo que ya
 *      dice cada etapa es lo que se acomoda). Con `--sin-ia`, se salta este paso.
 *   3. Pasa el resultado por `normalizarCicloDeVida`: quedan las 7, en su orden, y lo que no calce va a la condición de
 *      entrada. Los estados del lead que ya tenía se quedan.
 *   4. Con `--apply`: guarda una versión del documento («Antes de rehacer el ciclo de vida», se restaura desde «Versiones
 *      anteriores») y reemplaza el contenido de esa tarjeta. Nada más del documento se toca.
 *
 * Simulacro por defecto: lee de producción, llama al agente y muestra el antes y el después, sin escribir. Deja la
 * propuesta en un archivo (lo dice al final), porque cada corrida le pregunta de nuevo al agente y saldría otro texto.
 * Para aplicar EXACTAMENTE lo que se revisó:
 *   ALLOW_PROD_WRITE=1 npx tsx scripts/rehacer-ciclo-de-vida.ts --canvas cmwdql1x402fb07pr2xl65ryb --apply --propuesta <archivo>
 * Si alguien editó la sección después del simulacro, la propuesta ya no calza y no se aplica (hay que volver a simularlo).
 * Sin `--propuesta`, `--apply` genera de nuevo y escribe lo que salga.
 */
import "dotenv/config";
import "./lib/permitir-server-only";
import type { Prisma } from "@prisma/client";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const TABLAS = ["CanvasBlock"];
const KEY = "ciclo_vida_crm";

function argumento(nombre: string): string | null {
  const i = process.argv.indexOf(nombre);
  return i >= 0 ? (process.argv[i + 1] ?? null) : null;
}

/** La huella del contenido actual: la propuesta guardada solo se aplica sobre lo mismo que se leyó. */
const huella = (data: unknown) => createHash("sha256").update(JSON.stringify(data ?? null)).digest("hex").slice(0, 16);

type Etapa = { etapa?: string; entraCuando?: string; laMueve?: string; origen?: string; cambio?: string };
type Estado = { estado?: string; significa?: string };

function mostrar(titulo: string, data: unknown) {
  const d = (data ?? {}) as { intro?: string; etapas?: Etapa[]; estadosLead?: Estado[] };
  console.log(`\n── ${titulo} ──`);
  if (d.intro) console.log(`intro: ${d.intro}`);
  for (const e of d.etapas ?? []) {
    console.log(`  · ${e.etapa ?? "(sin nombre)"}${e.cambio ? ` [${e.cambio}]` : ""}${e.origen ? ` (${e.origen})` : ""}`);
    if (e.entraCuando) console.log(`      entra cuando: ${e.entraCuando}`);
    if (e.laMueve) console.log(`      la mueve: ${e.laMueve}`);
  }
  if (d.estadosLead?.length) console.log(`  estados del lead: ${d.estadosLead.map((s) => s.estado).join(" · ")}`);
}

async function main() {
  const { prisma } = await import("@/lib/db/prisma");
  const { describirDestino, resolverApply } = await import("./lib/guard");
  const { regenerateSectionDataForDef } = await import("@/lib/business-cases/canvas-agent");
  const { PLANIFICACION_DEF_BY_KEY } = await import("@/components/landing/configs/planificacion.defs");
  const { normalizarCicloDeVida, adoptarCicloDeVida } = await import("@/lib/planificacion/secciones");
  const { guardarVersionDelDocumento } = await import("@/lib/canvas/versiones");

  const canvasId = argumento("--canvas");
  if (!canvasId) {
    console.error("Falta --canvas <id del documento>. Cemaco · Costa Rica: --canvas cmwdql1x402fb07pr2xl65ryb");
    process.exit(1);
  }
  const conIa = !process.argv.includes("--sin-ia");
  const APPLY = resolverApply({ tablas: TABLAS });
  console.error(`[rehacer-ciclo-de-vida] base: ${describirDestino(process.env.DATABASE_URL)} · ${APPLY ? "ESCRIBE" : "simulacro (no escribe)"}`);

  const canvas = await prisma.projectCanvas.findUnique({
    where: { id: canvasId },
    select: { id: true, name: true, slug: true, tipoArtefacto: true, project: { select: { name: true, client: { select: { name: true } } } } },
  });
  if (!canvas) throw new Error(`No existe el documento ${canvasId}.`);
  if (canvas.slug !== "planning" && canvas.tipoArtefacto !== "planning") {
    throw new Error(`«${canvas.name}» no es una planificación (slug ${canvas.slug}, tipo ${canvas.tipoArtefacto}).`);
  }
  console.log(`Documento: «${canvas.name}» · ${canvas.project?.client?.name ?? "?"} · ${canvas.project?.name ?? "?"}`);

  const seccion = await prisma.canvasSection.findFirst({
    where: { canvasId, key: KEY },
    select: { id: true, blocks: { where: { blockType: "CARD" }, orderBy: { order: "asc" }, take: 1, select: { id: true, data: true, source: true } } },
  });
  const bloque = seccion?.blocks[0];
  if (!seccion || !bloque) throw new Error("El documento no tiene la sección del ciclo de vida con contenido: no hay nada que rehacer.");
  const actual = bloque.data;
  mostrar("Antes", adoptarCicloDeVida(actual));

  const archivo = argumento("--propuesta");
  let propuesta: unknown = actual;
  if (archivo) {
    const guardada = JSON.parse(readFileSync(archivo, "utf-8")) as { canvasId?: string; huella?: string; nueva?: unknown };
    if (guardada.canvasId !== canvasId) throw new Error(`La propuesta de ${archivo} es de otro documento (${guardada.canvasId}).`);
    if (guardada.huella !== huella(actual)) {
      throw new Error("La sección cambió desde el simulacro (alguien la editó): vuelve a correr el simulacro y revisa la propuesta nueva.");
    }
    propuesta = guardada.nueva;
  } else if (conIa) {
    console.error("[rehacer-ciclo-de-vida] pidiéndole al agente que la rehaga…");
    propuesta = await regenerateSectionDataForDef(
      PLANIFICACION_DEF_BY_KEY[KEY],
      actual,
      "Rehaz esta sección con la regla de tu guía: SIEMPRE las 7 etapas de HubSpot, con su nombre y en su orden. Las etapas " +
        "propias que trae hoy NO son etapas: acomoda lo que dice cada una como la condición para entrar a la etapa de HubSpot " +
        "que corresponde, o como un estado del lead si es un estado de trabajo. Conserva lo que ya dice cada criterio y su " +
        "origen; no inventes condiciones nuevas. Aplica la regla de los equipos para MQL y SQL.",
    );
  }
  // Sin etapas en la respuesta, se acomoda lo que ya había: el resultado igual son las 7.
  const conEtapas = Array.isArray((propuesta as { etapas?: unknown[] } | null)?.etapas) && (propuesta as { etapas: unknown[] }).etapas.length > 0;
  // Lo que ya había, con la forma de tabla y sin perder sus otras claves (un documento en prosa vieja trae `items`).
  const loDeAntes: Record<string, unknown> = { ...((actual ?? {}) as Record<string, unknown>), ...adoptarCicloDeVida(actual) };
  delete loDeAntes.items;
  const nueva = normalizarCicloDeVida(conEtapas ? propuesta : loDeAntes, actual);
  mostrar(archivo ? `Después (la propuesta de ${archivo})` : conIa ? "Después (agente + las 7 de HubSpot)" : "Después (solo las 7 de HubSpot, sin agente)", nueva);

  if (!APPLY) {
    const salida = join(tmpdir(), `rehacer-ciclo-de-vida-${canvasId}.json`);
    writeFileSync(salida, JSON.stringify({ canvasId, huella: huella(actual), nueva }, null, 2), "utf-8");
    console.log(`\nSimulacro: no se escribió nada. La propuesta quedó en ${salida}`);
    console.log(`Para aplicar exactamente esta: ALLOW_PROD_WRITE=1 npx tsx scripts/rehacer-ciclo-de-vida.ts --canvas ${canvasId} --apply --propuesta "${salida}"`);
    return;
  }
  const version = await guardarVersionDelDocumento(canvasId, { origen: "Antes de rehacer el ciclo de vida" });
  // «igual a la última» = la versión que ya existe es esta misma: está a salvo. Cualquier otro motivo, no se escribe.
  if (!version.guardada && version.motivo !== "igual a la última") {
    throw new Error(`No se pudo guardar la versión anterior (${version.motivo ?? "?"}): no se escribe nada.`);
  }
  console.log(`Versión anterior: ${version.guardada ? "guardada" : "ya estaba guardada (igual a la última)"}`);
  await prisma.$transaction([
    prisma.canvasBlock.update({ where: { id: bloque.id }, data: { data: nueva as unknown as Prisma.InputJsonValue } }),
    prisma.projectCanvas.update({ where: { id: canvasId }, data: { contentUpdatedAt: new Date() } }),
  ]);
  console.log("Listo: la sección del ciclo de vida quedó con las 7 etapas de HubSpot. El resto del documento no se tocó.");
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(async () => {
    const { prisma } = await import("@/lib/db/prisma");
    await prisma.$disconnect();
  });
