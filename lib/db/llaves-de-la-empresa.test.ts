/**
 * lib/db/llaves-de-la-empresa.test.ts — INV48 dice qué llave falta o borra lo que no debe, y la lista coincide con el SQL
 * y con el esquema.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { INDICES_UNICOS_DE_LA_EMPRESA, LLAVES_DE_LA_EMPRESA, problemasDeLasLlaves, problemasDeLosIndices } from "./llaves-de-la-empresa";

describe("problemasDeLasLlaves", () => {
  it("con las dos y su comportamiento, no hay problemas", () => {
    expect(problemasDeLasLlaves(LLAVES_DE_LA_EMPRESA.map((l) => ({ ...l })))).toEqual([]);
  });

  it("dice cuál falta", () => {
    expect(problemasDeLasLlaves([{ nombre: "FirefliesSession_resolvedClientId_fkey", alBorrar: "r" }])).toEqual([
      "falta FirefliesSession_manualClientId_fkey",
    ]);
  });

  it("dice si una llave se lleva las reuniones al borrar la empresa (CASCADE en vez de RESTRICT)", () => {
    const r = problemasDeLasLlaves([
      { nombre: "FirefliesSession_resolvedClientId_fkey", alBorrar: "c" },
      { nombre: "FirefliesSession_manualClientId_fkey", alBorrar: "n" },
    ]);
    expect(r).toEqual(["FirefliesSession_resolvedClientId_fkey hace CASCADE al borrar y debe hacer RESTRICT"]);
  });

  it("el SQL crea esas llaves con su ON DELETE, y el esquema las declara igual", () => {
    const raiz = resolve(__dirname, "../..");
    const sql = readFileSync(resolve(raiz, "scripts/sql/2026-10-24-llaves-de-la-empresa.sql"), "utf8");
    const bloque = (nombre: string) => sql.slice(sql.indexOf(`ADD CONSTRAINT "${nombre}"`), sql.indexOf("END IF;", sql.indexOf(`ADD CONSTRAINT "${nombre}"`)));
    expect(bloque("FirefliesSession_resolvedClientId_fkey")).toContain("ON DELETE RESTRICT");
    expect(bloque("FirefliesSession_manualClientId_fkey")).toContain("ON DELETE SET NULL");
    const esquema = readFileSync(resolve(raiz, "prisma/schema.prisma"), "utf8");
    expect(esquema).toMatch(/resolvedClient\s+Client\?\s+@relation\("ReunionesResueltas", fields: \[resolvedClientId\], references: \[id\], onDelete: Restrict\)/);
    expect(esquema).toMatch(/manualClient\s+Client\?\s+@relation\("ReunionesAsignadasAMano", fields: \[manualClientId\], references: \[id\], onDelete: SetNull\)/);
  });
});

describe("problemasDeLosIndices (R7b)", () => {
  it("con el índice único de la empresa de HubSpot, no hay problemas", () => {
    expect(problemasDeLosIndices([{ nombre: "Client_pkey", unico: true }, { nombre: "Client_hubspotCompanyId_key", unico: true }])).toEqual([]);
  });

  it("dice si falta o si dejó de ser único", () => {
    expect(problemasDeLosIndices([{ nombre: "Client_pkey", unico: true }])).toEqual(["falta Client_hubspotCompanyId_key"]);
    expect(problemasDeLosIndices([{ nombre: "Client_hubspotCompanyId_key", unico: false }])).toEqual(["Client_hubspotCompanyId_key existe pero no es único"]);
  });

  it("el SQL lo crea único y el esquema lo declara @unique", () => {
    const raiz = resolve(__dirname, "../..");
    const sql = readFileSync(resolve(raiz, "scripts/sql/2026-10-25-datos-de-la-empresa.sql"), "utf8");
    for (const nombre of INDICES_UNICOS_DE_LA_EMPRESA) expect(sql).toContain(`CREATE UNIQUE INDEX IF NOT EXISTS "${nombre}" ON "Client" ("hubspotCompanyId")`);
    const esquema = readFileSync(resolve(raiz, "prisma/schema.prisma"), "utf8");
    expect(esquema).toMatch(/\n\s+hubspotCompanyId\s+String\?\s+@unique/);
  });
});
