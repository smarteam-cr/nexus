/**
 * lib/hubspot/fusiones.test.ts — los pares de las fusiones de HubSpot y la cadena (U9), e INV54.
 */
import { describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { paresDe, sobrevivienteFinal } from "./fusiones";
import { INV54, fusionadaEsperada } from "@/lib/invariantes/hubspot";

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
    /* Respeta el `hubspotCompanyId: { in }` del WHERE: INV54 consulta dos veces (las fichas viejas y las dueñas). */
    client: {
      findMany: async (a?: { where?: { hubspotCompanyId?: { in?: string[] } } }) =>
        ((tablas.clientes ?? []) as { hubspotCompanyId?: string }[]).filter(
          (c) => !a?.where?.hubspotCompanyId?.in || a.where.hubspotCompanyId.in.includes(c.hubspotCompanyId ?? ""),
        ),
    },
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
  it("una entidad que comparte dominio con la dueña de la sobreviviente no lo pone en rojo (el TEC)", async () => {
    const tec = { id: "tae", name: "TEC · TAE", hubspotCompanyId: "59180429929", comparteDominioConId: null };
    const ae = { id: "ae", name: "TEC · AE", hubspotCompanyId: "56463266574", comparteDominioConId: "tae" };
    const fusiones = [{ idAbsorbido: "56463266574", idSobreviviente: "59180429929" }];
    const r = await INV54.correr(base({ fusiones, clientes: [tec, ae] }), ahora);
    expect(r.ok).toBe(true);
    expect(r.lineas.join(" ")).toContain("comparten dominio");
    /* Sin la marca, o marcada con otra ficha que no es la dueña de la sobreviviente: rojo, como siempre. */
    expect((await INV54.correr(base({ fusiones, clientes: [tec, { ...ae, comparteDominioConId: null }] }), ahora)).ok).toBe(false);
    expect((await INV54.correr(base({ fusiones, clientes: [tec, { ...ae, comparteDominioConId: "otra" }] }), ahora)).ok).toBe(false);
  });
  it("fusionadaEsperada: solo si la empresa de la dueña es la sobreviviente (el criterio de INV13 y de INV54)", () => {
    expect(fusionadaEsperada("59180429929", "59180429929")).toBe(true);
    expect(fusionadaEsperada("otra", "59180429929")).toBe(false);
    expect(fusionadaEsperada(null, "59180429929")).toBe(false);
    expect(fusionadaEsperada(undefined, undefined)).toBe(false);
  });
  it("en verde sin fichas con el id viejo, sin fusiones o sin la tabla", async () => {
    expect((await INV54.correr(base({ fusiones: [{ idAbsorbido: "1", idSobreviviente: "2" }] }), ahora)).ok).toBe(true);
    expect((await INV54.correr(base({}), ahora)).ok).toBe(true);
    const sinTabla = Object.assign(new Error("The table `public.FusionDeHubspot` does not exist in the current database."), { code: "P2021" });
    expect((await INV54.correr(base({ fusiones: sinTabla }), ahora)).ok).toBe(true);
  });
});
