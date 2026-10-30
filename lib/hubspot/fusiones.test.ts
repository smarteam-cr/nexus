/**
 * lib/hubspot/fusiones.test.ts — los pares de las fusiones de HubSpot y la cadena (U9), e INV54.
 */
import { describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { paresDe, sobrevivienteFinal } from "./fusiones";
import { INV54 } from "@/lib/invariantes/hubspot";

describe("paresDe", () => {
  it("cada id de hs_merged_object_ids es un absorbido del registro que lo tiene", () => {
    expect(paresDe("empresa", [{ id: 2529283142, properties: { hs_merged_object_ids: "16982989676;2529283142" } }])).toEqual([
      { objeto: "empresa", idAbsorbido: "16982989676", idSobreviviente: "2529283142" },
    ]);
  });
  it("sin la propiedad no hay pares", () => {
    expect(paresDe("contacto", [{ id: "1", properties: {} }])).toEqual([]);
  });
});

describe("sobrevivienteFinal", () => {
  it("sigue la cadena A → B → C, y corta un ciclo", () => {
    expect(sobrevivienteFinal("A", new Map([["A", "B"], ["B", "C"]]))).toBe("C");
    expect(sobrevivienteFinal("X", new Map([["X", "Y"], ["Y", "X"]]))).toBe("X");
    expect(sobrevivienteFinal("Z", new Map())).toBe("Z");
  });
});

function base(tablas: { fusiones?: unknown[] | Error; clientes?: unknown[] }): PrismaClient {
  return {
    fusionDeHubspot: {
      findMany: async () => {
        if (tablas.fusiones instanceof Error) throw tablas.fusiones;
        return tablas.fusiones ?? [];
      },
    },
    client: { findMany: async () => tablas.clientes ?? [] },
  } as unknown as PrismaClient;
}

describe("INV54", () => {
  const ahora = new Date("2026-10-25T12:00:00Z");
  it("en rojo si una ficha guarda una empresa absorbida, con el par y el remedio", async () => {
    const r = await INV54.correr(base({ fusiones: [{ idAbsorbido: "28524677478", idSobreviviente: "59772815466" }], clientes: [{ id: "k", name: "kölbi", hubspotCompanyId: "28524677478" }] }), ahora);
    expect(r.ok).toBe(false);
    expect(r.lineas.join("\n")).toContain("kölbi (k): 28524677478 → 59772815466");
    expect(r.lineas.join("\n")).toContain("reapuntar-empresa-fusionada");
  });
  it("en verde sin fichas con el id viejo, sin fusiones o sin la tabla", async () => {
    expect((await INV54.correr(base({ fusiones: [{ idAbsorbido: "1", idSobreviviente: "2" }] }), ahora)).ok).toBe(true);
    expect((await INV54.correr(base({}), ahora)).ok).toBe(true);
    const sinTabla = Object.assign(new Error("The table `public.FusionDeHubspot` does not exist in the current database."), { code: "P2021" });
    expect((await INV54.correr(base({ fusiones: sinTabla }), ahora)).ok).toBe(true);
  });
});
