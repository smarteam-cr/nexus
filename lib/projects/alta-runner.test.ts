import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * lib/projects/alta-runner.test.ts — REINTENTAR NO PUEDE DUPLICAR.
 *
 * ── LA FALLA QUE ATACA, Y QUE YA PASÓ UNA VEZ ────────────────────────────────
 * Un alta cruza dos sistemas. Entre "HubSpot recibió el pedido" y "Nexus guardó el id" hay red:
 * ahí se muere el proceso, caduca un timeout o entra un deploy. Si el reintento vuelve a crear,
 * quedan dos proyectos iguales en el CRM — el incidente que obligó a escribir
 * `scripts/cleanup-handoff-dup-projects.ts`.
 *
 * Y hay una segunda familia de fallas, más silenciosa: dar el alta por TERMINADA antes de que
 * HubSpot confirmara qué es el proyecto. Un `listo` prematuro deja el proyecto en la fila por
 * defecto —facturable, con los documentos de otro tipo— sin que nada avise.
 *
 * Por eso este archivo simula los dos sistemas: es la única forma de provocar el fallo en el
 * medio, que es exactamente donde vive el bug.
 */

// ── La base de mentira ───────────────────────────────────────────────────────

interface FilaProyecto {
  id: string;
  name: string;
  clientId: string;
  hubspotServiceId: string | null;
  hubspotDealId: string | null;
  hubspotPipelineId: string | null;
  hermanoCsProjectId: string | null;
  altaEstado: string | null;
  altaPipelineElegido: string | null;
  altaInternoDeclarado: boolean | null;
  altaHermanoHsId: string | null;
  altaIniciadaAt: Date | null;
  altaReclasificadoAt: Date | null;
  altaIntentos: number;
  altaError: string | null;
  canvases: Array<{ id: string }>;
  handoff: { id: string } | null;
  client: { hubspotCompanyId: string | null; ignoredHubspotServiceIds: string[] };
}

const db = { proyectos: new Map<string, FilaProyecto>(), handoffs: [] as unknown[] };

function aplicar(fila: FilaProyecto, data: Record<string, unknown>) {
  for (const [k, v] of Object.entries(data)) {
    if (v && typeof v === "object" && "increment" in (v as object)) {
      (fila as unknown as Record<string, number>)[k] =
        ((fila as unknown as Record<string, number>)[k] ?? 0) + (v as { increment: number }).increment;
    } else {
      (fila as unknown as Record<string, unknown>)[k] = v;
    }
  }
}

const fakePrisma = {
  project: {
    findUnique: async ({ where }: { where: { id: string } }) => db.proyectos.get(where.id) ?? null,
    findMany: async ({ where }: { where: { hubspotServiceId: { in: string[] } } }) =>
      [...db.proyectos.values()].filter(
        (p) => p.hubspotServiceId && where.hubspotServiceId.in.includes(p.hubspotServiceId),
      ),
    update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
      const f = db.proyectos.get(where.id);
      if (!f) throw new Error("no existe");
      aplicar(f, data);
      return f;
    },
  },
  handoff: { create: async ({ data }: { data: unknown }) => { db.handoffs.push(data); return data; } },
  $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(fakePrisma),
};

vi.mock("@/lib/db/prisma", () => ({ prisma: fakePrisma }));

// ── HubSpot de mentira ───────────────────────────────────────────────────────

/** Ids que la BÚSQUEDA de "¿un intento anterior ya lo creó?" va a devolver. */
let busquedaDevuelve: string[] = [];
let busquedaFalla = false;
const crearLlamadas: unknown[] = [];
let proximoIdCreado = "hs-nuevo";

vi.mock("@/lib/hubspot/client", () => ({
  getSystemHubspotClient: async () => ({
    apiRequest: async () => ({
      ok: !busquedaFalla,
      status: busquedaFalla ? 500 : 200,
      json: async () => ({ results: busquedaDevuelve.map((id) => ({ id })) }),
      text: async () => "",
    }),
  }),
}));

vi.mock("@/lib/hubspot/project-record", () => ({
  hasProjectsWriteScope: async () => true,
  crearProjectRecord: async (_hs: unknown, datos: unknown) => {
    crearLlamadas.push(datos);
    return proximoIdCreado;
  },
}));

/** Lo que el espejo "materializa" al correr, y si falla. */
let espejoEscribe: Partial<FilaProyecto> = {};
let espejoErrores: string[] = [];

vi.mock("@/lib/hubspot/sync-projects", () => ({
  espejarProyectoRecienCreado: async (_clientId: string, _hsId: string) => {
    if (espejoErrores.length === 0) {
      for (const f of db.proyectos.values()) if (f.hubspotServiceId === _hsId) aplicar(f, espejoEscribe);
    }
    return { found: 1, created: 0, updated: 1, skipped: 0, errors: espejoErrores, debug: [] };
  },
}));

const canvasesCreados: string[] = [];
vi.mock("@/lib/canvas/default-canvases", () => ({
  createHandoffCanvas: async (projectId: string) => { canvasesCreados.push(projectId); return "canvas-1"; },
}));

const reclasificaciones: string[] = [];
vi.mock("@/lib/sessions/reclassify", () => ({
  reclassifyClientSessions: async (clientId: string) => { reclasificaciones.push(clientId); },
}));

const { avanzarAlta } = await import("./alta-runner");

/** Cede el turno para que corran los `void … .then()` que el motor dispara sin esperar. */
const flush = () => new Promise((r) => setTimeout(r, 0));

// ── Fixture ──────────────────────────────────────────────────────────────────

const DEV = "922785384"; // Development
const CS = "826270797"; // Customer Success

function sembrar(over: Partial<FilaProyecto> = {}): FilaProyecto {
  const fila: FilaProyecto = {
    id: "p1",
    name: "Cliente | Integración",
    clientId: "c1",
    hubspotServiceId: null,
    hubspotDealId: "deal-1",
    hubspotPipelineId: null,
    hermanoCsProjectId: null,
    altaEstado: "pendiente_crm",
    altaPipelineElegido: DEV,
    altaInternoDeclarado: false,
    altaHermanoHsId: null,
    altaIniciadaAt: new Date("2026-07-31T10:00:00Z"),
    altaReclasificadoAt: null,
    altaIntentos: 0,
    altaError: null,
    canvases: [],
    handoff: null,
    client: { hubspotCompanyId: "co-1", ignoredHubspotServiceIds: [] },
    ...over,
  };
  db.proyectos.set(fila.id, fila);
  return fila;
}

beforeEach(() => {
  db.proyectos.clear();
  db.handoffs.length = 0;
  crearLlamadas.length = 0;
  canvasesCreados.length = 0;
  reclasificaciones.length = 0;
  busquedaDevuelve = [];
  busquedaFalla = false;
  proximoIdCreado = "hs-nuevo";
  espejoEscribe = { hubspotPipelineId: DEV };
  espejoErrores = [];
});

// ── LO QUE IMPIDE DUPLICAR ───────────────────────────────────────────────────

describe("reintentar no puede crear un segundo proyecto en HubSpot", () => {
  it("si el proyecto YA tiene su id, no crea: salta directo a traerlo", async () => {
    /* Es el candado más barato del motor y el caso más común del fallo real: el POST salió, el
       proceso murió antes de sellar el estado, y la fila quedó en `pendiente_crm` CON id. */
    sembrar({ hubspotServiceId: "hs-existente", altaEstado: "pendiente_crm" });
    const r = await avanzarAlta("p1");
    expect(crearLlamadas).toHaveLength(0);
    expect(r.termino).toBe(true);
    expect(r.hubspotServiceId).toBe("hs-existente");
  });

  it("fallo después de crear + reintento → UN SOLO record", async () => {
    // 1ª corrida: crea, pero el espejo falla → queda en pendiente_espejo con el id sellado.
    sembrar();
    espejoErrores = ["HubSpot 429"];
    const r1 = await avanzarAlta("p1");
    expect(crearLlamadas).toHaveLength(1);
    expect(r1.termino).toBe(false);
    expect(db.proyectos.get("p1")!.hubspotServiceId).toBe("hs-nuevo");

    // 2ª corrida: ya hay id → NO vuelve a crear.
    espejoErrores = [];
    const r2 = await avanzarAlta("p1");
    expect(crearLlamadas, "el reintento creó un segundo proyecto en el CRM").toHaveLength(1);
    expect(r2.termino).toBe(true);
  });

  it("adopta el record de un intento anterior en vez de crear otro", async () => {
    /* El caso que la auditoría marcó: el POST llegó pero la respuesta se perdió, así que Nexus
       no tiene el id. Sin este paso, el reintento crea un duplicado. */
    sembrar();
    busquedaDevuelve = ["hs-huerfano"];
    const r = await avanzarAlta("p1");
    expect(crearLlamadas, "creó uno nuevo teniendo uno huérfano para adoptar").toHaveLength(0);
    expect(r.adoptado).toBe(true);
    expect(db.proyectos.get("p1")!.hubspotServiceId).toBe("hs-huerfano");
  });

  it("NO adopta un record que ya reclamó otro proyecto de Nexus", async () => {
    sembrar();
    sembrar({ id: "otro", hubspotServiceId: "hs-ajeno", altaEstado: null });
    busquedaDevuelve = ["hs-ajeno"];
    await avanzarAlta("p1");
    expect(crearLlamadas, "se apropió del record de otro proyecto").toHaveLength(1);
  });

  it("un record BORRADO a propósito no se re-adopta: lo dice con palabras", async () => {
    /* Sin este caso el alta reintentaría para siempre sin explicar por qué, que es la peor
       versión de un error: el usuario ve "no funciona" y no hay ninguna pista. */
    sembrar({ client: { hubspotCompanyId: "co-1", ignoredHubspotServiceIds: ["hs-borrado"] } });
    busquedaDevuelve = ["hs-borrado"];
    const r = await avanzarAlta("p1");
    expect(crearLlamadas).toHaveLength(0);
    expect(r.error).toMatch(/supresión|unignore/i);
    expect(db.proyectos.get("p1")!.hubspotServiceId).toBeNull();
  });
});

// ── LO QUE IMPIDE UN «listo» MENTIROSO ───────────────────────────────────────

describe("solo termina cuando HubSpot confirmó qué es el proyecto", () => {
  it("si vuelve con un tipo distinto del elegido, NO termina", async () => {
    /* Un `listo` acá dejaría el proyecto en la fila por defecto: facturable y con los documentos
       de otro tipo. Y se ve normal en pantalla, así que nadie lo reporta. */
    sembrar({ altaPipelineElegido: DEV });
    espejoEscribe = { hubspotPipelineId: CS };
    const r = await avanzarAlta("p1");
    expect(r.termino).toBe(false);
    expect(db.proyectos.get("p1")!.altaEstado).toBe("pendiente_espejo");
    expect(db.handoffs, "creó el documento sobre un tipo sin confirmar").toHaveLength(0);
  });

  it("si se declaró hermano y la hermandad no se resolvió, NO termina", async () => {
    // Un desarrollo que cuelga de una implementación no se factura aparte. Sin resolver, sí.
    sembrar({ altaHermanoHsId: "hs-hermano" });
    espejoEscribe = { hubspotPipelineId: DEV, hermanoCsProjectId: null };
    const r = await avanzarAlta("p1");
    expect(r.termino).toBe(false);
    expect(r.error).toMatch(/cuelga|facturarlo aparte/i);
    expect(db.handoffs).toHaveLength(0);
  });
});

// ── LA TRANSICIÓN A LISTO ────────────────────────────────────────────────────

describe("al terminar", () => {
  it("camino feliz: queda listo, con su documento y la reclasificación sellada", async () => {
    sembrar();
    const r = await avanzarAlta("p1");
    expect(r.termino).toBe(true);
    const f = db.proyectos.get("p1")!;
    expect(f.altaEstado).toBe("listo");
    expect(f.altaError).toBeNull();
    expect(db.handoffs).toHaveLength(1);
    expect(canvasesCreados).toEqual(["p1"]);
    expect(f.altaReclasificadoAt).not.toBeNull();
  });

  it("un proyecto que cuelga de otro NO nace con documento propio", async () => {
    /* El motivo por el que el documento nace ACÁ y no en el alta: en el instante del alta el
       tipo y el hermano valen null, así que la regla diría SIEMPRE "propio" y todo hermano
       tendría un documento que contradice al de su hermana. */
    sembrar({ altaHermanoHsId: "hs-hermano" });
    espejoEscribe = { hubspotPipelineId: DEV, hermanoCsProjectId: "proyecto-cs" };
    const r = await avanzarAlta("p1");
    expect(r.termino).toBe(true);
    expect(db.handoffs, "el hermano nació con un documento que contradice al de su hermana").toHaveLength(0);
    expect(canvasesCreados).toHaveLength(0);
  });

  it("la reclasificación se paga UNA vez aunque se reintente", async () => {
    /* ~US$1 por corrida. Sin el sello, cada reintento suma un dólar.
       El `flush` es necesario y dice algo del diseño: la reclasificación se dispara SIN esperarla
       —no puede bloquear un alta que ya terminó, ni hacerla fallar—, así que el test tiene que
       ceder el turno para verla. Si algún día se volviera bloqueante, este await sobra y el test
       igual pasa: no esconde nada. */
    sembrar();
    await avanzarAlta("p1");
    await flush();
    expect(reclasificaciones).toHaveLength(1);

    // Volver a llamar sobre un alta ya terminada no hace nada.
    await avanzarAlta("p1");
    await flush();
    expect(reclasificaciones).toHaveLength(1);
    expect(crearLlamadas).toHaveLength(1);
  });

  it("no vuelve a crear el canvas del handoff si ya estaba", async () => {
    sembrar({ canvases: [{ id: "ya" }] });
    await avanzarAlta("p1");
    expect(canvasesCreados).toHaveLength(0);
    expect(db.handoffs).toHaveLength(1);
  });
});

// ── PRECONDICIONES ───────────────────────────────────────────────────────────

describe("lo que se rechaza antes de tocar HubSpot", () => {
  it("un alta que no está en curso no hace nada", async () => {
    sembrar({ altaEstado: "listo" });
    const r = await avanzarAlta("p1");
    expect(crearLlamadas).toHaveLength(0);
    expect(r.termino).toBe(true);
  });

  it("sin empresa en HubSpot no se crea nada, y lo explica", async () => {
    sembrar({ client: { hubspotCompanyId: null, ignoredHubspotServiceIds: [] } });
    const r = await avanzarAlta("p1");
    expect(crearLlamadas).toHaveLength(0);
    expect(r.error).toMatch(/empresa/i);
  });

  it("un tipo elegido que la tabla no declara se rechaza", async () => {
    sembrar({ altaPipelineElegido: "pipeline-inventado" });
    const r = await avanzarAlta("p1");
    expect(crearLlamadas).toHaveLength(0);
    expect(r.error).toMatch(/no está declarado/i);
  });

  it("cada intento queda contado, para que el cartel pueda mostrarlo", async () => {
    sembrar();
    espejoErrores = ["boom"];
    await avanzarAlta("p1");
    await avanzarAlta("p1");
    expect(db.proyectos.get("p1")!.altaIntentos).toBe(2);
    expect(db.proyectos.get("p1")!.altaError).toBe("boom");
  });
});
