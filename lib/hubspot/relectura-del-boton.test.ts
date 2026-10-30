/**
 * lib/hubspot/relectura-del-boton.test.ts — «Traer proyectos de HubSpot» dentro del piso de 60 s (2026-10-29, SmartAgro).
 *
 * Corre el recorrido REAL de la copia (`syncProjectsForClient`) con la base y HubSpot en memoria, porque lo que hay que
 * cuidar son sus efectos: un clic relee por id lo que la ficha ya tiene y no puede apagar proyectos por un 429, ni dar de
 * baja uno fusionado sin que exista el que sigue, ni convertirse en la corrida completa. sync-gate.test.ts prueba el
 * portón; esto, lo que pasa adentro.
 */
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

interface Fila {
  id: string;
  clientId: string;
  name: string;
  status: string;
  hubspotServiceId: string;
  hubspotOwnerId: string | null;
  hubspotOwnerEmail: string | null;
  tags: string[];
}
interface EnHubspot {
  /** El id con el que contesta: otro = se fusionó en ese. */
  id?: string;
  properties: Record<string, string | null>;
}

const h = vi.hoisted(() => ({
  filas: [] as Fila[],
  hubspot: new Map<string, EnHubspot>(),
  /** HubSpot contesta 429 a toda lectura de proyectos. */
  caido: false,
  pedidos: [] as string[],
  creados: 0,
}));

const WEB = "922688687";
const WEB_ENTREGA = "1409897128";
const WEB_FINALIZADO = "1409897129";
const CS = "826270797";
const CS_DIAGNOSTICO = "1410223917";

const OWNERS: Record<string, string> = { "100": "cse@smarteam.com", "200": "propietaria@smarteam.com" };
/** El owner que no contesta (429). Uno que no está en `OWNERS` está archivado: contesta 404. */
const NO_CONTESTA = "429";

function json(cuerpo: unknown, status = 200) {
  return new Response(JSON.stringify(cuerpo), { status });
}

async function apiRequest({ method, path, body }: { method: string; path: string; body?: { inputs?: { id: string }[] } }) {
  h.pedidos.push(`${method} ${path}`);
  const dueno = path.match(/^\/crm\/v3\/owners\/(\w+)/);
  if (dueno?.[1] === NO_CONTESTA) return json({ status: "error", category: "RATE_LIMITS" }, 429);
  if (dueno) return OWNERS[dueno[1]] ? json({ email: OWNERS[dueno[1]], firstName: "P" }) : json({ status: "error" }, 404);
  if (path.startsWith("/crm/v3/pipelines/")) return json({ label: "Pipeline", results: [] });
  if (path.startsWith("/crm/v4/associations/")) return json({ results: [] });
  if (path.startsWith("/crm/v4/objects/companies/")) return json({ results: [...h.hubspot.keys()].map((id) => ({ toObjectId: Number(id) })) });
  if (h.caido) return json({ status: "error", category: "RATE_LIMITS" }, 429);
  if (path.endsWith("/batch/read")) {
    const results = (body?.inputs ?? []).flatMap(({ id }) => {
      const r = h.hubspot.get(id);
      return r ? [{ id: r.id ?? id, properties: r.properties }] : [];
    });
    return json({ status: "COMPLETE", results });
  }
  if (path.endsWith("/search")) return json({ results: [] });
  const objeto = path.match(/^\/crm\/v3\/objects\/[^/]+\/(\d+)/);
  if (objeto) {
    const r = h.hubspot.get(objeto[1]);
    return r ? json({ id: r.id ?? objeto[1], properties: r.properties }) : json({ status: "error" }, 404);
  }
  return json({}, 404);
}

function coincide(f: Fila, where: Record<string, unknown>): boolean {
  if (where.clientId && f.clientId !== where.clientId) return false;
  if (where.status && f.status !== where.status) return false;
  const s = where.hubspotServiceId as { in?: string[]; notIn?: string[]; not?: null } | undefined;
  if (s?.in && !s.in.includes(f.hubspotServiceId)) return false;
  if (s?.notIn && s.notIn.includes(f.hubspotServiceId)) return false;
  return true;
}

vi.mock("@/lib/hubspot/client", () => ({
  getSystemHubspotClient: async () => ({ apiRequest }),
  getHubspotClient: async () => ({ apiRequest }),
}));
vi.mock("@/lib/cuentas/pase-server", () => ({ fotoParaElPase: async () => null, pasarSiCambioElEncargado: async () => null }));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    client: {
      findUnique: async () => ({ id: "c1", name: "SmartAgro", company: null, hubspotCompanyId: "58804639346", ignoredHubspotServiceIds: [] }),
    },
    hubspotAccount: { findFirst: async () => null },
    project: {
      findUnique: async ({ where }: { where: { hubspotServiceId: string } }) => h.filas.find((f) => f.hubspotServiceId === where.hubspotServiceId) ?? null,
      findFirst: async () => null,
      findMany: async ({ where }: { where: Record<string, unknown> }) => h.filas.filter((f) => coincide(f, where)),
      // Como Prisma: un `undefined` en `data` no toca la columna.
      update: async ({ where, data }: { where: { id: string }; data: Partial<Fila> }) =>
        Object.assign(h.filas.find((f) => f.id === where.id)!, Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined))),
    },
    $transaction: async () => {
      h.creados++;
    },
  },
}));

const propiedades = (nombre: string, pipeline: string, etapa: string) => ({
  hs_name: nombre,
  hs_status: "on_track",
  hs_pipeline: pipeline,
  hs_pipeline_stage: etapa,
  hubspot_owner_id: "100",
  cse_encargado: "100",
});

let ahora = 1_000_000_000_000;

/** La ficha se copió sola al abrirse; pasan 24 s y alguien toca el botón. */
async function abrirLaFicha() {
  vi.resetModules();
  const { syncProjectsForClient } = await import("./sync-projects");
  await syncProjectsForClient("c1");
  ahora += 24_000;
  h.pedidos = [];
  return () => syncProjectsForClient("c1", { force: true, releerSiHayPiso: true });
}

const fila = (id: string) => h.filas.find((f) => f.id === id)!;

beforeEach(() => {
  ahora = 1_000_000_000_000;
  vi.spyOn(Date, "now").mockImplementation(() => ahora);
  vi.spyOn(console, "log").mockImplementation(() => {});
  h.caido = false;
  h.creados = 0;
  h.pedidos = [];
  h.filas = [
    { id: "p-web", clientId: "c1", name: "SmartAgro", status: "active", hubspotServiceId: "576854924316", hubspotOwnerId: null, hubspotOwnerEmail: null, tags: [] },
    { id: "p-impl", clientId: "c1", name: "Agro Smart - 1 SHP", status: "active", hubspotServiceId: "595998424735", hubspotOwnerId: "100", hubspotOwnerEmail: "cse@smarteam.com", tags: [] },
  ];
  h.hubspot = new Map<string, EnHubspot>([
    ["576854924316", { properties: propiedades("SmartAgro", WEB, WEB_ENTREGA) }],
    ["595998424735", { properties: propiedades("Agro Smart - 1 SHP", CS, CS_DIAGNOSTICO) }],
  ]);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("el botón dentro del piso de 60 s", () => {
  it("SmartAgro: el finalizado se va, el nombre nuevo llega y manda el propietario, sin la corrida completa", async () => {
    const tocarElBoton = await abrirLaFicha();
    h.hubspot.get("576854924316")!.properties.hs_pipeline_stage = WEB_FINALIZADO;
    Object.assign(h.hubspot.get("595998424735")!.properties, { hs_name: "SmartAgro - Implementación", hubspot_owner_id: "200" });

    const r = await tocarElBoton();

    expect(r.releidos).toBe(2);
    expect(r.omitido).toBeUndefined();
    expect(r.errors).toEqual([]);
    expect(fila("p-web").status).toBe("inactive");
    expect(fila("p-impl").name).toBe("SmartAgro - Implementación");
    expect(fila("p-impl").hubspotOwnerEmail).toBe("propietaria@smarteam.com");
    expect(h.pedidos.filter((p) => p.includes("/companies/")), "la relectura no descubre: es la corrida completa").toEqual([]);
  });

  it("HubSpot da 429: no apaga ningún proyecto y lo dice", async () => {
    const tocarElBoton = await abrirLaFicha();
    h.caido = true;

    const r = await tocarElBoton();

    expect(h.filas.map((f) => f.status)).toEqual(["active", "active"]);
    expect(r.errors.length).toBeGreaterThan(0);
  });

  it("un proyecto borrado en HubSpot se da de baja, y solo ese", async () => {
    const tocarElBoton = await abrirLaFicha();
    h.hubspot.delete("576854924316");

    await tocarElBoton();

    expect(fila("p-web").status).toBe("inactive");
    expect(fila("p-impl").status).toBe("active");
  });

  it("una ficha con un solo proyecto, borrado en HubSpot: se da de baja, sin error", async () => {
    h.filas = h.filas.filter((f) => f.id === "p-web");
    h.hubspot.delete("595998424735");
    const tocarElBoton = await abrirLaFicha();
    h.hubspot.delete("576854924316");

    const r = await tocarElBoton();

    expect(fila("p-web").status).toBe("inactive");
    expect(r.errors).toEqual([]);
  });

  it("un proyecto fusionado NO se da de baja ni se crea el que sigue: es de la corrida completa", async () => {
    const tocarElBoton = await abrirLaFicha();
    h.hubspot.get("595998424735")!.id = "999";

    const r = await tocarElBoton();

    expect(fila("p-impl").status).toBe("active");
    expect(h.creados).toBe(0);
    expect(h.filas).toHaveLength(2);
    expect(r.debug?.some((d) => d.includes("queda para la corrida completa"))).toBe(true);
  });
});

describe("quién queda como encargado cuando HubSpot duda", () => {
  it("propietario archivado con «CSE Encargado» vivo: se guarda el CSE entero (id y correo)", async () => {
    const tocarElBoton = await abrirLaFicha();
    h.hubspot.get("595998424735")!.properties.hubspot_owner_id = "archivado";

    await tocarElBoton();

    expect(fila("p-impl")).toMatchObject({ hubspotOwnerId: "100", hubspotOwnerEmail: "cse@smarteam.com" });
  });

  it("HubSpot no contesta por el propietario y no hay respaldo: el proyecto se queda como estaba", async () => {
    const tocarElBoton = await abrirLaFicha();
    Object.assign(h.hubspot.get("595998424735")!.properties, { hubspot_owner_id: NO_CONTESTA, cse_encargado: NO_CONTESTA });

    await tocarElBoton();

    expect(fila("p-impl")).toMatchObject({ status: "active", hubspotOwnerId: "100", hubspotOwnerEmail: "cse@smarteam.com" });
  });

  it("cambio real de propietario que no contesta: no se escribe a medias, y la copia siguiente trae id y correo juntos", async () => {
    const tocarElBoton = await abrirLaFicha();
    h.hubspot.get("595998424735")!.properties.hubspot_owner_id = NO_CONTESTA;
    await tocarElBoton();
    expect(fila("p-impl")).toMatchObject({ hubspotOwnerId: "100", hubspotOwnerEmail: "cse@smarteam.com" });

    h.hubspot.get("595998424735")!.properties.hubspot_owner_id = "200";
    await tocarElBoton();
    expect(fila("p-impl")).toMatchObject({ hubspotOwnerId: "200", hubspotOwnerEmail: "propietaria@smarteam.com" });
  });
});

describe("el botón con otra corrida en curso", () => {
  it("suma lo que esa corrida creó y actualizó, y relee después de ella", async () => {
    const tocarElBoton = await abrirLaFicha();
    ahora += 61_000;
    h.hubspot.set("700", { properties: propiedades("Proyecto nuevo", CS, CS_DIAGNOSTICO) });
    const { syncProjectsForClient } = await import("./sync-projects");

    const enCurso = syncProjectsForClient("c1", { force: true });
    await Promise.resolve();
    const r = await tocarElBoton();
    const completa = await enCurso;

    expect(completa.created).toBe(1);
    expect(r.created).toBe(1);
    expect(r.updated).toBe(completa.updated + 2); // los dos que ya estaban, releídos
    expect(r.releidos).toBe(2);
  });
});
