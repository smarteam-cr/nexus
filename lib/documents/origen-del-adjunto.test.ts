/**
 * lib/documents/origen-del-adjunto.test.ts — los archivos del «Contexto adicional» quedan en los
 * documentos de la empresa con su origen, y el contexto general de los agentes no los lee dos veces.
 * Correr: `npx vitest run lib/documents/origen-del-adjunto.test.ts --project unit`.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { DOCUMENTOS_CON_CONTEXTO } from "@/lib/contexto/documento";
import { dondeSeSubio, esOrigenDelAdjunto, SIN_ORIGEN_DE_CONTEXTO } from "./origen-del-adjunto";

const RAIZ = process.cwd();
const leer = (rel: string) => fs.readFileSync(path.join(RAIZ, rel), "utf8");

describe("el origen de un adjunto", () => {
  it("vale la preventa, la propuesta, el handoff, el cronograma, la exploración y cada documento con contexto", () => {
    for (const o of ["preventa", "propuesta", "handoff", "cronograma", "exploracion", ...DOCUMENTOS_CON_CONTEXTO.map((d) => d.pieza)]) {
      expect(esOrigenDelAdjunto(o), o).toBe(true);
    }
    expect(esOrigenDelAdjunto("otra-cosa")).toBe(false);
    expect(esOrigenDelAdjunto(42)).toBe(false);
  });

  it("dice dónde se subió, y nada si se subió en Documentos", () => {
    expect(dondeSeSubio("cronograma")).toBe("Subido en el contexto del cronograma");
    expect(dondeSeSubio("diagnosis")).toBe("Subido en el contexto del diagnóstico");
    expect(dondeSeSubio("preventa")).toBe("Subido en el contexto de la preventa");
    expect(dondeSeSubio(null)).toBeNull();
  });
});

describe("⛔ un adjunto del contexto entra por su pieza, no por el contexto general", () => {
  it("/analyze lee solo lo subido en Documentos", () => {
    expect(SIN_ORIGEN_DE_CONTEXTO).toEqual({ origen: null });
    expect(leer("app/api/clients/[id]/analyze/route.ts")).toContain("SIN_ORIGEN_DE_CONTEXTO");
  });

  it("toda puerta que sube un archivo en un «Contexto adicional» lo deja en los documentos de la empresa", () => {
    for (const rel of [
      "app/api/sales/exploraciones/[id]/documentos/route.ts",
      "app/api/business-cases/[id]/transcript/route.ts",
      "app/api/projects/[projectId]/documents/upload/route.ts",
    ]) {
      expect(leer(rel), rel).toContain("guardarEnLosDocumentosDeLaEmpresa");
    }
    // La preventa ya no borra el archivo después de leerlo.
    expect(leer("app/api/sales/exploraciones/[id]/documentos/route.ts")).not.toContain("borrarSubido");
  });

  it("Documentos lista la empresa entera, no solo el proyecto", () => {
    const src = leer("app/api/projects/[projectId]/documents/route.ts");
    expect(src).toMatch(/clientDocument\.findMany\(\{\s*where:\s*\{\s*clientId\s*\}/);
  });
});
