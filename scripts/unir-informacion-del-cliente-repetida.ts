/**
 * scripts/unir-informacion-del-cliente-repetida.ts — une los contenedores «Información del cliente» repetidos (R4, etapa
 * previa; 2026-10-25).
 *
 * «Información del cliente» es un proyecto falso (`serviceType = "__strategy__"`) que se retira con R4. Antes, tres
 * empresas tienen más de uno (medido el 24 oct, solo lectura: Ministerio de Economía 5, AMC 2 y Librería Internacional 2):
 * nacieron el mismo día con las mismas copias de sus documentos (Información del cliente vacía, Kickoff con 4 bloques,
 * Exploración con 1), y la búsqueda de cada pantalla toma uno distinto según el orden de la base. En Librería, el segundo
 * tiene los 4 documentos subidos.
 *
 * Por empresa, queda el MÁS VIEJO (el mismo que toma la búsqueda, lib/canvas/strategy-project.ts), y de los demás:
 *   - los documentos subidos, las corridas, los eventos y las notas de contexto se mudan al que queda (sin únicos que
 *     choquen);
 *   - cada documento (canvas) cuya pieza no está en el que queda se muda; si está y el repetido tiene MÁS bloques, no se
 *     decide solo: se informa y ese contenedor no se borra;
 *   - si después no le queda nada que no sea una copia igual o vacía, se borra (con sus copias).
 * Cualquier otra cosa colgando de un repetido (reuniones vinculadas, tareas, exploraciones, la línea de tiempo…) lo deja
 * en pie, para mirarlo a mano.
 *
 * SIMULACRO por defecto. Con `--apply`, el guard respalda las tablas (pg_dump) antes de escribir.
 * Uso (PowerShell):
 *   npx tsx scripts/unir-informacion-del-cliente-repetida.ts
 *   $env:ALLOW_PROD_WRITE="1"; npx tsx scripts/unir-informacion-del-cliente-repetida.ts --apply; Remove-Item Env:ALLOW_PROD_WRITE
 */
import "dotenv/config";
import { createHash } from "node:crypto";
import { resolverApply } from "./lib/guard";
import { prisma } from "@/lib/db/prisma";
import { SENTINEL_SERVICE_TYPE } from "@/lib/projects/kind";

// Todo lo que se muda o se borra en cascada con un repetido entra al respaldo (las versiones, los hitos y las tarjetas de
// sus documentos también).
const APPLY = resolverApply({
  tablas: ["Project", "ProjectCanvas", "CanvasSection", "CanvasBlock", "VersionDeDocumento", "HitoDeDocumento", "ClientContextCard", "ClientDocument", "AgentRun", "TimelineEvent", "NotaDeContexto", "LlmCall"],
});

/** Lo que se muda sin chocar con un único. */
const SE_MUDAN = ["documents", "agentRuns", "timelineEvents", "notasDeContexto"] as const;
/** Lo que, si está, deja al repetido en pie para mirarlo a mano. */
const DEJAN_EN_PIE = [
  "stageNotes",
  "contextCards",
  "actionItems",
  "pedidosFueraDeAlcance",
  "sessions",
  "cuestionarios",
  "personasDeCuestionario",
  "ciclos",
  "casosDeUso",
  "hilosDeChat",
  "handoffSources",
  "timelineSources",
  "exploraciones",
  "versionesDeLaEscala",
  "csAlerts",
  "serviciosCobranza",
  "stageGates",
  "devEstimates",
  "preguntasDeTiempo",
  "tareas",
  "proyectosDeTareas",
  "vinculosDeTareas",
  "hechosDeReuniones",
  "presentaciones",
  "notasDeLaCuenta",
] as const;
const UNO_A_UNO = ["brief", "participantSnapshot", "externalAccess", "guiaDeExploracion", "timeline", "recomendacionDeRecurrencia", "handoff"] as const;

type Conteo = Record<(typeof SE_MUDAN)[number] | (typeof DEJAN_EN_PIE)[number], number>;

interface Pieza {
  id: string;
  bloques: number;
  extras: number;
  /** De lo que dicen sus bloques y de lo publicado al cliente. */
  huella: string;
  /** Las huellas de sus versiones guardadas. */
  versiones: Set<string>;
}

/**
 * Por pieza: su documento, cuántos bloques tiene, cuánto más guarda (versiones, hitos y tarjetas), la huella de lo que
 * dicen sus bloques y de lo publicado (dos copias con la misma cantidad de bloques pueden decir cosas distintas), y las
 * huellas de sus versiones.
 */
async function bloquesPorPieza(projectId: string): Promise<Map<string, Pieza>> {
  const canvases = await prisma.projectCanvas.findMany({
    where: { projectId },
    select: { id: true, slug: true, name: true, publishedSnapshot: true, versiones: { select: { huella: true } }, _count: { select: { versiones: true, hitos: true, cards: true } } },
  });
  const out = new Map<string, Pieza>();
  for (const c of canvases) {
    const filas = await prisma.canvasBlock.findMany({
      where: { section: { canvasId: c.id } },
      orderBy: [{ section: { key: "asc" } }, { order: "asc" }],
      select: { content: true, data: true, blockType: true, section: { select: { key: true } } },
    });
    const huella = createHash("sha256")
      .update(JSON.stringify([filas.map((b) => [b.section.key, b.blockType, b.content, b.data]), c.publishedSnapshot ?? null]))
      .digest("hex");
    // Dos documentos sin pieza con el mismo nombre en el mismo contenedor no se pisan en el mapa: el segundo va con su id,
    // no calza con ninguno del que queda, y se muda (nunca se borra sin aparecer en el informe).
    const base = c.slug ?? `nombre:${c.name}`;
    out.set(out.has(base) ? `${base}#${c.id}` : base, {
      id: c.id,
      bloques: filas.length,
      extras: c._count.versiones + c._count.hitos + c._count.cards,
      huella,
      versiones: new Set(c.versiones.map((v) => v.huella)),
    });
  }
  return out;
}

async function main() {
  const grupos = await prisma.project.groupBy({ by: ["clientId"], where: { serviceType: SENTINEL_SERVICE_TYPE }, _count: { _all: true }, having: { clientId: { _count: { gt: 1 } } } });
  console.log(`${grupos.length} empresas con «Información del cliente» repetida.`);
  let borrados = 0;
  let quedanEnPie = 0;
  for (const g of grupos) {
    const proyectos = await prisma.project.findMany({
      where: { clientId: g.clientId, serviceType: SENTINEL_SERVICE_TYPE },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: {
        id: true,
        createdAt: true,
        client: { select: { name: true } },
        _count: { select: Object.fromEntries([...SE_MUDAN, ...DEJAN_EN_PIE].map((k) => [k, true])) as Record<keyof Conteo, true> },
        ...Object.fromEntries(UNO_A_UNO.map((k) => [k, { select: { id: true } }])),
      },
    });
    const [queda, ...repetidos] = proyectos;
    console.log(`\n${queda.client.name}: queda ${queda.id} (${queda.createdAt.toISOString().slice(0, 10)}); ${repetidos.length} repetido(s).`);
    const piezasDelQueQueda = await bloquesPorPieza(queda.id);

    for (const r of repetidos) {
      const conteo = r._count as unknown as Conteo;
      const unoAUno = UNO_A_UNO.filter((k) => (r as unknown as Record<string, unknown>)[k]);
      const enPie = [...DEJAN_EN_PIE.filter((k) => conteo[k] > 0).map((k) => `${k}: ${conteo[k]}`), ...unoAUno];
      const piezas = await bloquesPorPieza(r.id);
      const mudar: string[] = [];
      const iguales: string[] = [];
      const choques: string[] = [];
      for (const [pieza, x] of piezas) {
        const ahi = piezasDelQueQueda.get(pieza);
        if (!ahi) mudar.push(pieza);
        else if (x.bloques > ahi.bloques) choques.push(`${pieza} (${x.bloques} bloques contra ${ahi.bloques})`);
        else if (x.extras > ahi.extras) choques.push(`${pieza} (${x.extras} versiones, hitos o tarjetas contra ${ahi.extras})`);
        else if (x.huella !== ahi.huella && (x.bloques > 0 || x.extras > 0)) choques.push(`${pieza} (sus bloques o lo publicado dicen otra cosa que los del que queda)`);
        else if ([...x.versiones].some((h) => !ahi.versiones.has(h))) choques.push(`${pieza} (tiene una versión guardada que el que queda no tiene)`);
        else iguales.push(pieza);
      }
      const mudanzas = SE_MUDAN.filter((k) => conteo[k] > 0).map((k) => `${k}: ${conteo[k]}`);
      const sePuedeBorrar = enPie.length === 0 && choques.length === 0;
      console.log(`  · ${r.id}: se mudan ${mudanzas.join(", ") || "nada"}; piezas que se mudan: ${mudar.join(", ") || "ninguna"}; copias iguales o vacías: ${iguales.join(", ") || "ninguna"}`);
      if (choques.length) console.log(`    ⚠ tiene más contenido que el que queda en: ${choques.join(", ")}. Se mira a mano: este no se borra.`);
      if (enPie.length) console.log(`    ⚠ le cuelga ${enPie.join(", ")}. Se mira a mano: este no se borra.`);
      console.log(`    → ${sePuedeBorrar ? "se borra después de mudar" : "queda en pie"}`);
      if (sePuedeBorrar) borrados++;
      else quedanEnPie++;
      // Lo que se muda pasa a ser del que queda también en el simulacro: así el informe de un tercer repetido es fiel.
      for (const pieza of mudar) piezasDelQueQueda.set(pieza, piezas.get(pieza)!);
      if (!APPLY) continue;

      await prisma.$transaction(async (tx) => {
        await tx.clientDocument.updateMany({ where: { projectId: r.id }, data: { projectId: queda.id } });
        await tx.agentRun.updateMany({ where: { projectId: r.id }, data: { projectId: queda.id } });
        await tx.timelineEvent.updateMany({ where: { projectId: r.id }, data: { projectId: queda.id } });
        await tx.notaDeContexto.updateMany({ where: { projectId: r.id }, data: { projectId: queda.id } });
        // El gasto de IA guarda el proyecto sin llave: se muda para que no quede apuntando a uno borrado.
        await tx.llmCall.updateMany({ where: { projectId: r.id }, data: { projectId: queda.id } });
        for (const pieza of mudar) await tx.projectCanvas.update({ where: { id: piezas.get(pieza)!.id }, data: { projectId: queda.id } });
        if (sePuedeBorrar) await tx.project.delete({ where: { id: r.id } });
      });
    }
  }
  console.log(`\n${APPLY ? "APLICADO" : "SIMULACRO"}: ${borrados} contenedores repetidos ${APPLY ? "borrados" : "se borrarían"} · ${quedanEnPie} quedan en pie para mirar a mano.`);
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
