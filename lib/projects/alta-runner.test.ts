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
  /** Lo lee el RECLAMO de la fila: junto con `altaError` en null significa «corriendo ahora». */
  altaUltimoIntentoAt: Date | null;
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
    /* Para `tieneOTuvoImplementacionHubSpot` (nota por defecto del handoff). Ninguno de los
       fixtures de este archivo declara otro proyecto en la misma empresa, así que siempre 0 —
       lo que importa acá es que el doble responda, no que ejercite el caso "sí hay". Ese caso
       lo cubre `lib/handoff/duenio.test.ts`, que prueba la función pura sin tocar la base. */
    count: async () => 0,
    update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
      const f = db.proyectos.get(where.id);
      if (!f) throw new Error("no existe");
      aplicar(f, data);
      return f;
    },
    /**
     * El RECLAMO de la fila. Se implementa de verdad y no como stub porque su condición es lo
     * único que impide que dos corridas simultáneas creen dos records en HubSpot: un doble que
     * dijera «siempre count: 1» probaría exactamente lo contrario de lo que hay que probar.
     */
    updateMany: async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
      const f = db.proyectos.get(where.id as string);
      if (!f) return { count: 0 };
      if ("altaEstado" in where && f.altaEstado !== where.altaEstado) return { count: 0 };
      const or = where.OR as Array<Record<string, unknown>> | undefined;
      if (or) {
        /* ⚠ El doble EVALÚA el operador recibido y REVIENTA con uno que no modela. La versión
           anterior asumía `not: null` y `lt` sin mirarlos, así que cambiar la condición del
           reclamo por su opuesta —`{ equals: null }`, `{ gt }`— dejaba el test en verde con el
           mutex apagado. Un doble que confirma lo que uno ya cree no prueba nada. */
        const cumple = or.some((c) => {
          if ("altaError" in c) {
            const cond = c.altaError as { not?: null } | null;
            if (cond === null) return f.altaError === null || f.altaError === undefined;
            if (cond && "not" in cond && cond.not === null) {
              return f.altaError !== null && f.altaError !== undefined;
            }
            throw new Error("operador no modelado en altaError: " + JSON.stringify(cond));
          }
          if ("altaUltimoIntentoAt" in c) {
            const cond = c.altaUltimoIntentoAt as { lt?: Date; gt?: Date } | null;
            const val = f.altaUltimoIntentoAt as Date | null | undefined;
            if (cond === null) return val === null || val === undefined;
            if (cond.lt) return !!(val && val.getTime() < cond.lt.getTime());
            if (cond.gt) return !!(val && val.getTime() > cond.gt.getTime());
            throw new Error("operador no modelado en altaUltimoIntentoAt: " + JSON.stringify(cond));
          }
          throw new Error("rama del OR no modelada: " + JSON.stringify(c));
        });
        if (!cumple) return { count: 0 };
      }
      aplicar(f, data);
      return { count: 1 };
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
    altaUltimoIntentoAt: null,
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

describe("dos corridas a la vez no crean dos records", () => {
  /**
   * El cartel del alta trabada se monta DOS VECES en la misma pantalla —rail del cliente y
   * widget del proyecto—, cada uno con su botón. Sin el reclamo de la fila, dos clics seguidos
   * entran los dos por la rama que CREA en HubSpot y quedan dos records gemelos del mismo
   * proyecto, que después hay que unir a mano allá.
   */
  it("la segunda corrida se va sin tocar HubSpot", async () => {
    sembrar({ altaEstado: "pendiente_crm" });
    const [a, b] = await Promise.all([avanzarAlta("p1"), avanzarAlta("p1")]);
    expect(crearLlamadas.length, "se crearon DOS records para el mismo proyecto").toBe(1);
    const perdedor = [a, b].find((r) => r.error?.includes("intento corriendo"));
    expect(perdedor, "las dos corridas creyeron que ganaron").toBeTruthy();
  });

  it("pero un reintento después de un fallo VISIBLE entra al toque", async () => {
    /* El reclamo lee «error en null + intento reciente» como «está corriendo». Una corrida que
       terminó mal dejó su motivo escrito, así que no bloquea al siguiente intento: si lo
       hiciera, el botón «Reintentar» quedaría inútil justo cuando más se lo necesita. */
    sembrar({ altaEstado: "pendiente_espejo", altaError: "lo que sea", altaUltimoIntentoAt: new Date() });
    const r = await avanzarAlta("p1");
    expect(r.error, "el reintento chocó contra el reclamo de su propia corrida anterior").not.toContain(
      "intento corriendo",
    );
  });
});

describe("la confirmación del tipo sigue viva", () => {
  /**
   * ── LA REGRESIÓN QUE ESTE CASO CONGELA (incidente del 2026-08-06) ────────────
   * El camino «Traer de HubSpot» nacía sin `altaPipelineElegido`, y la confirmación comparaba
   * el pipeline real contra `null`: insatisfacible para siempre. El arreglo fue SELLAR el
   * pipeline al crear, no relajar la comparación — porque relajarla es lo que uno escribe
   * primero, y deja pasar el caso que la confirmación existe para atrapar.
   */
  it("con el tipo elegido en null NO termina: el alta espera", async () => {
    sembrar({ altaEstado: "pendiente_espejo", hubspotServiceId: "hs-1", altaPipelineElegido: null });
    espejoEscribe = { hubspotPipelineId: CS };
    const r = await avanzarAlta("p1");
    expect(r.termino, "un alta sin tipo elegido se dio por buena: el proyecto cae en la fila por defecto y COBRA").toBe(false);
  });

  it("y con el tipo sellado igual al que trajo HubSpot, termina", async () => {
    sembrar({ altaEstado: "pendiente_espejo", hubspotServiceId: "hs-1", altaPipelineElegido: CS });
    espejoEscribe = { hubspotPipelineId: CS };
    const r = await avanzarAlta("p1");
    expect(r.termino).toBe(true);
  });
});

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

  /**
   * ── SE DIO VUELTA DOS VECES, Y ESTE TEST ES EL REGISTRO ────────────────────
   * (Tanda F, 2026-08-07) Este test afirmaba que un proyecto colgado de otro NO nacía con
   * documento propio. Era correcto mientras el objetivo fuera «que no existan dos documentos del
   * mismo trato»; dejó de serlo cuando se midió el precio: **el agente de handoff es también el
   * que escribe las FASES del cronograma**, así que el hermano menor se quedaba con CERO fases y
   * una pantalla sin botón.
   *
   * (Tanda G, 2026-08-08) Después este test exigía que el handoff naciera CON la nota de
   * exclusión nombrada. También dejó de ser correcto: persistir la nota la volvía perdible —
   * «Regenerar» la borraba, tres de las cinco puertas que crean un `Handoff` nunca la escribían,
   * y un handoff viejo se quedaba sin ella para siempre. Ahora la nota se RECALCULA en cada
   * generación (`exclusionDelSistema` + `componerExclusiones`), así que el `create` no la lleva
   * y eso es el arreglo, no un olvido.
   */
  it("LA guarda: un proyecto que cuelga de otro nace con SU documento, y SIN nota persistida", async () => {
    // El hermano mayor existe en la base (de él sale el nombre de la nota, ya no al crear).
    sembrar({ id: "proyecto-cs", name: "Spectrum - MKT + SALES" });
    sembrar({ altaHermanoHsId: "hs-hermano" });
    espejoEscribe = { hubspotPipelineId: DEV, hermanoCsProjectId: "proyecto-cs" };

    const r = await avanzarAlta("p1");

    expect(r.termino).toBe(true);
    expect(db.handoffs, "el hermano menor se quedó sin documento — y por lo tanto sin fases").toHaveLength(1);
    expect(canvasesCreados).toEqual(["p1"]);
    const nota = (db.handoffs[0] as { contextExclusions?: string | null }).contextExclusions;
    expect(
      nota ?? null,
      "volvió a persistir la nota al crear: «Regenerar» puede borrarla otra vez",
    ).toBeNull();
  });

  it("el alta no consulta al hermano mayor para crear el handoff", async () => {
    /* Consecuencia directa de recalcular: el alta dejó de necesitar el nombre del mayor, así que
       un puntero a un proyecto borrado no puede hacerla fallar por esa vía. */
    sembrar({ altaHermanoHsId: "hs-hermano" });
    espejoEscribe = { hubspotPipelineId: DEV, hermanoCsProjectId: "proyecto-que-no-existe" };

    const r = await avanzarAlta("p1");

    expect(r.termino).toBe(true);
    expect(db.handoffs).toHaveLength(1);
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
