import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/hubspot/client", () => ({ getSystemHubspotClient: vi.fn() }));

import type { Client as HsClient } from "@hubspot/api-client";
import { sincronizarFichaConHubspot } from "./ficha-hubspot";
import { valoresVacios } from "./ficha";

type Llamada = { method: string; path: string; body?: Record<string, unknown> };

function hubspotFalso(respuestas: Array<{ ok: boolean; status?: number; json?: unknown; text?: string }>) {
  const llamadas: Llamada[] = [];
  const hs = {
    apiRequest: vi.fn(async (req: Llamada) => {
      llamadas.push(req);
      const r = respuestas.shift() ?? { ok: true, json: {} };
      return {
        ok: r.ok,
        status: r.status ?? (r.ok ? 200 : 400),
        json: async () => r.json ?? {},
        text: async () => r.text ?? JSON.stringify(r.json ?? {}),
      };
    }),
  } as unknown as HsClient;
  return { hs, llamadas };
}

const base = {
  valores: { ...valoresVacios(), dolorPrincipal: "- pierde leads", aperturaAsesoria: "media", motivacionCompra: "precio" },
  aEscribir: ["dolorPrincipal", "aperturaAsesoria", "motivacionCompra"] as const,
  conNota: true,
  cambios: ["dolorPrincipal"] as const,
  primeraVez: false,
  autor: "Ana",
  fuentes: [],
};

describe("sincronizarFichaConHubspot", () => {
  it("sin empresa vinculada no llama a HubSpot", async () => {
    const { hs, llamadas } = hubspotFalso([]);
    const r = await sincronizarFichaConHubspot({ ...base, hubspotCompanyId: null, hubspot: hs });
    expect(r.estado).toBe("sin_empresa");
    expect(llamadas).toHaveLength(0);
  });

  it("escribe las propiedades en la empresa y deja la nota asociada a ella", async () => {
    const { hs, llamadas } = hubspotFalso([{ ok: true }, { ok: true, json: { id: "nota-1" } }]);
    const r = await sincronizarFichaConHubspot({ ...base, hubspotCompanyId: "123", hubspot: hs });
    expect(r).toEqual({ estado: "sincronizada", notaId: "nota-1" });
    expect(llamadas[0]).toMatchObject({ method: "PATCH", path: "/crm/v3/objects/companies/123" });
    // La motivación NO es propiedad: va solo en la nota.
    expect(llamadas[0].body).toEqual({
      properties: { nexus_dolor_principal: "<ul><li>pierde leads</li></ul>", nexus_apertura_asesoria: "media" },
    });
    expect(llamadas[1]).toMatchObject({ method: "POST", path: "/crm/v3/objects/notes" });
    const nota = llamadas[1].body as { properties: { hs_note_body: string }; associations: unknown };
    expect(nota.properties.hs_note_body).toContain("precio");
    expect(nota.associations).toEqual([
      { to: { id: "123" }, types: [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: 190 }] },
    ]);
  });

  it("si las propiedades no existen todavía, lo dice en palabras y no crea la nota", async () => {
    const { hs, llamadas } = hubspotFalso([
      { ok: false, status: 400, json: { message: 'Property "nexus_dolor_principal" does not exist' } },
    ]);
    const r = await sincronizarFichaConHubspot({ ...base, hubspotCompanyId: "123", hubspot: hs });
    expect(r.estado).toBe("fallo");
    expect(r.error).toBe("Las propiedades de la ficha todavía no existen en HubSpot.");
    expect(llamadas).toHaveLength(1);
  });

  it("propiedades bien y nota mal = parcial", async () => {
    const { hs } = hubspotFalso([{ ok: true }, { ok: false, status: 403, json: { message: "missing scope" } }]);
    const r = await sincronizarFichaConHubspot({ ...base, hubspotCompanyId: "123", hubspot: hs });
    expect(r.estado).toBe("parcial");
    expect(r.error).toContain("missing scope");
  });

  it("sin nota pedida (reintento sin cambios) no duplica la nota", async () => {
    const { hs, llamadas } = hubspotFalso([{ ok: true }]);
    const r = await sincronizarFichaConHubspot({ ...base, conNota: false, hubspotCompanyId: "123", hubspot: hs });
    expect(r.estado).toBe("sincronizada");
    expect(llamadas.map((l) => l.method)).toEqual(["PATCH"]);
  });
});
