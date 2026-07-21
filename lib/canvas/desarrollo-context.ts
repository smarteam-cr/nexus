/**
 * lib/canvas/desarrollo-context.ts
 *
 * Serializa el canvas "Desarrollo" (requerimiento técnico) a TEXTO para el prompt del agente de
 * detalle del cronograma: objetos de HubSpot + llaves de desduplicación + sistemas + conexiones +
 * triggers. Es la fuente más rica para generar las tareas técnicas POR OBJETO de la fase
 * "Desarrollo / Integración".
 *
 * NO usa `loadCanvasContext`: ese serializa `blockToText(CARD) = content`, y el canvas Desarrollo
 * guarda los CARD con `content: null` (toda la info vive en `data`). Acá se lee `data` directo,
 * mismo patrón que lib/canvas/desarrollo-generate.ts. Devuelve "" si el proyecto no tiene canvas
 * Desarrollo o no hay contenido útil (así el caller lo inyecta solo si aporta).
 */
import { prisma } from "@/lib/db/prisma";
import { DESARROLLO_CANVAS } from "@/lib/canvas/canvas-defs";

type Dict = Record<string, unknown>;
const asArr = (v: unknown): Dict[] =>
  Array.isArray(v) ? (v.filter((x) => x && typeof x === "object") as Dict[]) : [];
const s = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

export async function loadDesarrolloContext(projectId: string): Promise<string> {
  const canvas = await prisma.projectCanvas.findFirst({
    where: { projectId, name: DESARROLLO_CANVAS.name },
    select: { id: true },
  });
  if (!canvas) return "";

  const secs = await prisma.canvasSection.findMany({
    where: { canvasId: canvas.id, key: { in: ["arquitectura", "relacion_objetos", "comunicacion"] } },
    select: { key: true, blocks: { where: { blockType: "CARD" }, select: { data: true }, take: 1 } },
  });
  const dataByKey: Record<string, Dict> = {};
  for (const sec of secs) {
    const d = sec.blocks[0]?.data;
    if (d && typeof d === "object") dataByKey[sec.key] = d as Dict;
  }

  const lines: string[] = [];

  // relacion_objetos — objetos de HubSpot + su llave de dedup + asociaciones (lo más directo por objeto)
  const rel = dataByKey["relacion_objetos"];
  if (rel) {
    const objetos = asArr(rel.objetos);
    const asocs = asArr(rel.asociaciones);
    if (objetos.length || asocs.length) {
      lines.push("OBJETOS DE HUBSPOT A INTEGRAR (con su equivalencia y llave de desduplicación):");
      for (const o of objetos) {
        const nombre = s(o.nombre);
        if (!nombre) continue;
        const equivale = s(o.equivale);
        const detalle = s(o.detalle);
        lines.push(`- ${nombre}${equivale ? ` → equivale a ${equivale}` : ""}${detalle ? `. ${detalle}` : ""}`);
      }
      for (const a of asocs) {
        const desde = s(a.desde), hacia = s(a.hacia), card = s(a.cardinalidad), det = s(a.detalle);
        if (!desde && !hacia) continue;
        lines.push(`- Asociación ${desde} ↔ ${hacia}${card ? ` (${card})` : ""}${det ? `: ${det}` : ""}`);
      }
    }
  }

  // arquitectura — sistemas + conexiones (campos, llave de dedup, dirección, sync, trigger)
  const arq = dataByKey["arquitectura"];
  if (arq) {
    const sistemas = asArr(arq.sistemas);
    const conexiones = asArr(arq.conexiones);
    if (sistemas.length || conexiones.length) {
      lines.push("", "ARQUITECTURA (sistemas y conexiones):");
      for (const sis of sistemas) {
        const nombre = s(sis.nombre);
        if (!nombre) continue;
        const rol = s(sis.rol), det = s(sis.detalle);
        lines.push(`- Sistema ${nombre}${rol ? ` (${rol})` : ""}${det ? `: ${det}` : ""}`);
      }
      for (const c of conexiones) {
        const desde = s(c.desde), hacia = s(c.hacia);
        if (!desde && !hacia) continue;
        const parts = [
          s(c.titulo) && `dato: ${s(c.titulo)}`,
          s(c.dataFields) && `campos: ${s(c.dataFields)}`,
          s(c.dedupeKey) && `llave: ${s(c.dedupeKey)}`,
          s(c.direction) && `dirección: ${s(c.direction) === "bidir" ? "bidireccional" : "unidireccional"}`,
          s(c.syncType) && `sync: ${s(c.syncType)}`,
          s(c.cuando) && `cuándo: ${s(c.cuando)}`,
        ].filter(Boolean).join(" · ");
        lines.push(`- Conexión ${desde} → ${hacia}${parts ? ` — ${parts}` : ""}`);
      }
    }
  }

  // comunicacion — triggers / eventos de sincronización
  const com = dataByKey["comunicacion"];
  if (com) {
    const items = asArr(com.items);
    if (items.length) {
      lines.push("", "MOMENTOS DE SINCRONIZACIÓN (triggers):");
      for (const it of items) {
        const title = s(it.title);
        if (!title) continue;
        const detail = s(it.detail);
        lines.push(`- ${title}${detail ? `: ${detail}` : ""}`);
      }
    }
  }

  return lines.join("\n").trim();
}
