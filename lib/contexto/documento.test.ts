/**
 * lib/contexto/documento.test.ts — EL «CONTEXTO ADICIONAL» ES DE CADA DOCUMENTO (2026-10-07).
 *
 * Pedido de Elías: «el contexto adicional debe ser para cada artefacto por separado: la misma
 * sección, pero guardarse para cada artefacto». Lo que puede romperse sin que nada avise:
 *  · un documento nuevo en la lista sin su columna en `SessionProject` (la X no se guardaría) o sin
 *    su SQL (el deploy revienta al leer vínculos);
 *  · la celda que cura el contexto no es la de generar ESE documento;
 *  · un runner deja de leer sus instrucciones, o lee las de otro documento.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { DOCUMENTOS_CON_CONTEXTO, documentoConContexto, documentoDelDestino } from "./documento";
import { COLUMNA_DEL_DESTINO, DESTINOS_SUGERIDOS, parseDestino } from "@/lib/sessions/destinos-de-contexto";
import { pieceBySlug } from "@/lib/pieces/registry";

const raiz = process.cwd();
const leer = (rel: string) => fs.readFileSync(path.join(raiz, rel), "utf8");

describe("el registro de documentos con contexto", () => {
  it("cada documento es una pieza del proyecto, y lo cura la celda de GENERARLO", () => {
    for (const d of DOCUMENTOS_CON_CONTEXTO) {
      const pieza = pieceBySlug(d.pieza);
      expect(pieza, d.pieza).not.toBeNull();
      expect(pieza!.scope, d.pieza).toBe("project");
      expect(d.seccion, d.pieza).toBe(pieza!.permissionSection);
      expect(documentoConContexto(d.pieza)).toBe(d);
    }
  });

  it("los destinos sugeridos y los documentos son los mismos, uno a uno", () => {
    expect(DOCUMENTOS_CON_CONTEXTO.map((d) => d.destino).sort()).toEqual([...DESTINOS_SUGERIDOS].sort());
    for (const destino of DESTINOS_SUGERIDOS) {
      expect(documentoDelDestino(destino)?.destino, destino).toBe(destino);
      expect(parseDestino(destino)).toBe(destino);
    }
  });

  it("cada destino guarda su afinado en una columna PROPIA que existe en el schema", () => {
    const columnas = Object.values(COLUMNA_DEL_DESTINO);
    expect(new Set(columnas).size).toBe(columnas.length);
    const schema = leer("prisma/schema.prisma");
    const modelo = schema.slice(schema.indexOf("model SessionProject {"));
    const cuerpo = modelo.slice(0, modelo.indexOf("\n}"));
    for (const c of columnas) expect(cuerpo, c).toMatch(new RegExp(`\\b${c}\\s+Boolean\\?`));
  });

  it("las cuatro columnas del 2026-10-07 tienen su SQL aditivo", () => {
    const sql = leer("scripts/sql/2026-10-07-contexto-de-cada-documento.sql");
    for (const c of ["kickoffOverride", "explorationOverride", "techRequirementsOverride", "deliveryOverride"]) {
      expect(sql, c).toContain(`ADD COLUMN IF NOT EXISTS "${c}" BOOLEAN`);
    }
    expect(sql).not.toMatch(/\bDROP\b/i);
  });

  it("el bloque dice qué hace la IA y trae un ejemplo, en tuteo", () => {
    for (const d of DOCUMENTOS_CON_CONTEXTO) {
      expect(d.laIa.trim(), d.pieza).not.toBe("");
      expect(d.ejemplo.startsWith("Ej.: "), d.pieza).toBe(true);
      // Las formas de voseo más comunes en un pedido a la IA.
      expect(`${d.laIa} ${d.ejemplo}`, d.pieza).not.toMatch(/\b(enfocate|poné|incluí|mencioná|preguntá|destacá|usá)\b/i);
    }
  });
});

describe("cada runner lee las instrucciones de SU documento", () => {
  const RUNNERS: Array<{ archivo: string; lee: string }> = [
    { archivo: "lib/canvas/diagnostico-fuentes.ts", lee: "material.instrucciones" },
    { archivo: "lib/canvas/planificacion-generate.ts", lee: "material.instrucciones" },
    { archivo: "lib/canvas/implementacion-generate.ts", lee: "material.instrucciones" },
    { archivo: "lib/canvas/entrega-generate.ts", lee: "material.instrucciones" },
    { archivo: "lib/canvas/desarrollo-generate.ts", lee: "material.instrucciones" },
    { archivo: "lib/guia-exploracion/agente.ts", lee: "instrucciones +" },
    { archivo: "app/api/clients/[id]/analyze/route.ts", lee: "materialDelKickoff.instrucciones" },
  ];

  it("cada uno carga el material de su pieza y pone las instrucciones en el mensaje", () => {
    for (const { archivo, lee } of RUNNERS) {
      const src = leer(archivo);
      expect(src, archivo).toContain(lee);
    }
    expect(leer("lib/canvas/diagnostico-fuentes.ts")).toContain('documentoConContexto("diagnosis")');
    expect(leer("lib/canvas/planificacion-generate.ts")).toContain('documentoConContexto("planning")');
    expect(leer("lib/canvas/implementacion-generate.ts")).toContain('documentoConContexto("implementation")');
    expect(leer("lib/canvas/entrega-generate.ts")).toContain('documentoConContexto("delivery")');
    expect(leer("lib/canvas/desarrollo-generate.ts")).toContain('documentoConContexto("tech-requirements")');
    expect(leer("lib/guia-exploracion/agente.ts")).toContain('documentoConContexto("exploration")');
    expect(leer("lib/guia-exploracion/agente.ts")).toContain('instruccionesDelDocumento(projectId, "exploration")');
    const analyze = leer("app/api/clients/[id]/analyze/route.ts");
    expect(analyze).toContain('documentoConContexto("kickoff")');
    expect(analyze).toContain('instruccionesDelDocumento(bodyProjectId, "handoff")');
    expect(analyze).toContain("${instruccionesDelHandoff}${cseExclusionsBlock}");
  });

  it("las instrucciones salen del canvas de la pieza (la entry `__doc`), no de otro documento", () => {
    const src = leer("lib/contexto/material-del-documento.ts");
    expect(src).toContain("leerInstrucciones(projectId, doc.pieza)");
    expect(src).toContain("canvasOf(pieza)");
    expect(src).toContain("bloqueDeInstruccionesDeDoc(");
  });

  it("guardarlas pide la celda de generar ese documento (el cronograma, la suya)", () => {
    const src = leer("app/api/projects/[projectId]/doc-brief/route.ts");
    expect(src).toContain('slug === "timeline"');
    expect(src).toContain("guardTimelineEdit(projectId)");
    expect(src).toContain('guardContextoDelDocumento(projectId, "handoff")');
    expect(src).toContain("guardContextoDelDocumento(projectId, doc.seccion)");
  });
});
