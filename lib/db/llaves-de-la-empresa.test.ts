/**
 * lib/db/llaves-de-la-empresa.test.ts — INV48 dice qué llave falta, y la lista coincide con el SQL y con el esquema.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { LLAVES_DE_LA_EMPRESA, llavesQueFaltan } from "./llaves-de-la-empresa";

describe("llavesQueFaltan", () => {
  it("con todas, no falta ninguna", () => {
    expect(llavesQueFaltan({ llavesForaneas: [...LLAVES_DE_LA_EMPRESA.llavesForaneas], indices: [] })).toEqual([]);
  });

  it("dice cuál falta", () => {
    expect(llavesQueFaltan({ llavesForaneas: ["FirefliesSession_resolvedClientId_fkey"], indices: [] })).toEqual([
      "FirefliesSession_manualClientId_fkey",
    ]);
  });

  it("el SQL crea exactamente esas llaves, y el esquema las declara con su onDelete", () => {
    const raiz = resolve(__dirname, "../..");
    const sql = readFileSync(resolve(raiz, "scripts/sql/2026-10-24-llaves-de-la-empresa.sql"), "utf8");
    for (const n of LLAVES_DE_LA_EMPRESA.llavesForaneas) expect(sql).toContain(`'${n}'`);
    const esquema = readFileSync(resolve(raiz, "prisma/schema.prisma"), "utf8");
    expect(esquema).toMatch(/resolvedClient\s+Client\?\s+@relation\("ReunionesResueltas", fields: \[resolvedClientId\], references: \[id\], onDelete: Restrict\)/);
    expect(esquema).toMatch(/manualClient\s+Client\?\s+@relation\("ReunionesAsignadasAMano", fields: \[manualClientId\], references: \[id\], onDelete: SetNull\)/);
  });
});
