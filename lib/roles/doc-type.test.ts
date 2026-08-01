/**
 * lib/roles/doc-type.test.ts — que cada tipo de documento use SU plantilla, y los dos
 * lugares donde compartir tabla podía salir caro.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { contentKeysForDocType, sectionDefsForDocType, escalaForDocType } from "./doc-type";
import { ROLE_CONTENT_KEYS } from "@/components/landing/configs/roles.defs";
import { PROPUESTA_CONTENT_KEYS } from "@/components/landing/configs/propuesta.defs";

const RAIZ = process.cwd();

describe("plantilla por tipo de documento", () => {
  it("cada tipo trae SUS keys (no las del otro)", () => {
    expect(contentKeysForDocType("PERFIL")).toEqual(ROLE_CONTENT_KEYS);
    expect(contentKeysForDocType("PROPUESTA")).toEqual(PROPUESTA_CONTENT_KEYS);
    expect(contentKeysForDocType("PERFIL")).not.toEqual(contentKeysForDocType("PROPUESTA"));
  });

  it("las defs también salen del tipo, y empiezan por el hero", () => {
    for (const t of ["PERFIL", "PROPUESTA"] as const) {
      const defs = sectionDefsForDocType(t);
      expect(defs.length).toBeGreaterThan(1);
      expect(defs[0].key).toBe("hero");
    }
  });

  it("solo la propuesta se lee 20% más grande", () => {
    expect(escalaForDocType("PROPUESTA")).toBe("stl-escala-120");
    expect(escalaForDocType("PERFIL")).toBeUndefined();
  });
});

describe("compartir tabla no puede salir caro", () => {
  it("el seed de roles filtra por docType (o pisaría una propuesta homónima)", () => {
    // `seed-roles.ts` busca por TÍTULO y su update reemplaza `content` ENTERO. La propuesta
    // del CSL se llama casi igual que el rol: sin este filtro, un `--apply` la destruye.
    // (Archivado el 2026-08-01 — sigue siendo corrible, el guard viaja con él.)
    const src = fs.readFileSync(path.join(RAIZ, "scripts", "archive", "seed-roles.ts"), "utf8");
    const m = src.match(/findFirst\(\{[\s\S]{0,200}?\}\)/);
    expect(m, "no se encontró el findFirst del seed").toBeTruthy();
    expect(m![0]).toContain("docType");
  });

  it("el loader de impresión corta lo que no sea PERFIL", () => {
    // El adaptador arma el PDF con la plantilla de roles: una propuesta saldría sin la
    // oferta económica y sin "Cómo es Smarteam", en silencio.
    const src = fs.readFileSync(path.join(RAIZ, "lib", "print", "load-doc.ts"), "utf8");
    expect(src).toContain('role.docType !== "PERFIL"');
  });
});
