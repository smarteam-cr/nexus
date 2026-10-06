/**
 * lib/canvas/restaurar-bloque.test.ts — DESHACER UN DESCARTE DEVUELVE LA SUGERENCIA, NO LA ACEPTA.
 *
 * Correr: `npx vitest run --project unit lib/canvas/restaurar-bloque.test.ts`.
 *
 * U4 de la auditoría del deshacer (2026-10-05): descartar una sugerencia del agente y deshacer la
 * recreaba con el POST de «agregar bloque» → volvía como «Manual», CONFIRMADA, al final y con id
 * nuevo. O sea: deshacer el descarte la ACEPTABA. Ahora vuelve como estaba (modo `restaurar`).
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { cuerpoParaRestaurar, datosDelBloqueRestaurado } from "./restaurar-bloque";
import { restaurarBloqueSchema } from "./restaurar-bloque-schema";

const RAIZ = path.join(__dirname, "..", "..");
const leer = (rel: string) => fs.readFileSync(path.join(RAIZ, rel), "utf8");
const sinComentarios = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\\])\/\/[^\n]*/g, "$1");

/** Una sugerencia del agente, pendiente, tercera en su sección — como la ve el navegador. */
const SUGERENCIA = {
  id: "cmb1sugerencia0001",
  blockType: "TEXT",
  content: "Lo que propuso el agente",
  data: null,
  previousContent: null,
  previousData: null,
  order: 2,
  colSpan: 4,
  colStart: null,
  rowSpan: 4,
  source: "AGENT",
  status: "DRAFT",
  agentRunId: "cmb1corrida0000001",
  createdAt: "2026-10-01T12:00:00.000Z",
};

describe("U4 · el bloque vuelve como estaba", () => {
  it("⛔ una sugerencia descartada vuelve PENDIENTE, del AGENTE, en su orden y con su id", () => {
    /* La edición que la pone en rojo: fijar `source: "HUMAN"` o `status: "CONFIRMED"` en
       `datosDelBloqueRestaurado`, o dejar que el orden lo decida «el último + 1». */
    const cuerpo = cuerpoParaRestaurar(SUGERENCIA);
    expect(cuerpo.restaurar, "sin foto completa no hay restauración").toBeDefined();
    const parsed = restaurarBloqueSchema.parse(cuerpo.restaurar);
    const fila = datosDelBloqueRestaurado({
      restaurar: parsed,
      idLibre: true,
      corridaExiste: true,
      ahora: Date.parse("2026-10-05T00:00:00Z"),
    });
    expect(fila.source).toBe("AGENT");
    expect(fila.status).toBe("DRAFT");
    expect(fila.order).toBe(2);
    expect(fila.id).toBe(SUGERENCIA.id);
    expect(fila.agentRunId).toBe(SUGERENCIA.agentRunId);
    expect(fila.createdAt?.toISOString()).toBe(SUGERENCIA.createdAt);
    expect(cuerpo.content).toBe(SUGERENCIA.content);
  });

  it("si el id ya lo tiene otra fila, nace con uno nuevo; si la corrida no existe, sin corrida", () => {
    const parsed = restaurarBloqueSchema.parse(cuerpoParaRestaurar(SUGERENCIA).restaurar);
    const fila = datosDelBloqueRestaurado({ restaurar: parsed, idLibre: false, corridaExiste: false });
    expect(fila.id).toBeUndefined();
    expect(fila.agentRunId).toBeNull();
    expect(fila.status, "lo demás sigue igual").toBe("DRAFT");
  });

  it("una fecha del futuro no se acepta (la pone la base)", () => {
    const parsed = restaurarBloqueSchema.parse({ ...cuerpoParaRestaurar(SUGERENCIA).restaurar, createdAt: "2099-01-01T00:00:00Z" });
    expect(datosDelBloqueRestaurado({ restaurar: parsed, idLibre: true, corridaExiste: true }).createdAt).toBeUndefined();
  });

  it("sin la foto completa, cae al cuerpo de siempre (recuperar el texto antes que nada)", () => {
    expect(cuerpoParaRestaurar({ blockType: "TEXT", content: "x", data: null }).restaurar).toBeUndefined();
  });

  it("el esquema es acotado: un campo desconocido o un id raro es inválido", () => {
    const base = cuerpoParaRestaurar(SUGERENCIA).restaurar!;
    expect(restaurarBloqueSchema.safeParse({ ...base, sectionId: "otra" }).success).toBe(false);
    expect(restaurarBloqueSchema.safeParse({ ...base, id: "a b;c" }).success).toBe(false);
    expect(restaurarBloqueSchema.safeParse({ ...base, source: "SISTEMA" }).success).toBe(false);
    /* ⛔ No `cuid()`: hay UUID en la base. */
    expect(restaurarBloqueSchema.safeParse({ ...base, id: "3f2504e0-4f89-11d3-9a0c-0305e82c3301" }).success).toBe(true);
  });

  it("el cableado: las dos rutas aceptan `restaurar` y los dos deshacer lo mandan", () => {
    for (const ruta of [
      "app/api/projects/[projectId]/canvas-sections/[sectionId]/blocks/route.ts",
      "app/api/business-cases/[id]/canvas-sections/[sectionId]/blocks/route.ts",
    ]) {
      const src = sinComentarios(leer(ruta));
      expect(src, `${ruta}: no restaura`).toContain("datosDelBloqueRestaurado(");
      expect(src, `${ruta}: el estado tiene que salir de la foto, no ser CONFIRMED fijo`).toContain("status: r.status");
      expect(src, `${ruta}: el origen tiene que salir de la foto`).toContain("source: r.source");
    }
    const hook = sinComentarios(leer("components/canvas/useCanvasSections.ts"));
    expect(hook, "el hook dejó de mandar la foto completa").toContain("JSON.stringify(cuerpoParaRestaurar(block))");
    expect(hook, "el deshacer del borrado tiene que llevar la foto entera").toContain("const block: BloqueBorrado = { ...snap }");
    const grilla = sinComentarios(leer("components/canvas/SectionBlockList.tsx"));
    expect(grilla, "la grilla dejó de restaurar como estaba").toContain('escribir(sectionId, "POST", cuerpoParaRestaurar(foto))');
  });
});
