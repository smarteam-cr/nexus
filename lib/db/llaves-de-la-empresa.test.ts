/**
 * lib/db/llaves-de-la-empresa.test.ts — INV48 dice qué llave falta o borra lo que no debe, y la lista coincide con el SQL
 * y con el esquema.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { LLAVES_DE_LA_EMPRESA, problemasDeLasLlaves } from "./llaves-de-la-empresa";

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
