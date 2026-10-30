/**
 * lib/hubspot/sync-gate.test.ts — el PORTÓN de la sincronización de proyectos.
 *
 * Qué protege: `syncProjectsForClient` decide SI se corre (mutex de corrida viva + cooldown de
 * 10 min + piso duro de 60 s) y `correrSync` hace el trabajo. Esa separación nació el 2026-08-02
 * al exponer un botón "Actualizar" en la ficha del cliente: hasta entonces el único disparador
 * era el montaje de la pantalla, que nunca pasa `force`, así que el cooldown alcanzaba solo.
 *
 * Por qué un test y no confianza: los tres frenos son estado EN MEMORIA con ventanas de tiempo.
 * Una regresión acá no rompe nada visible — simplemente deja pasar N corridas concurrentes de lo
 * más caro del sistema contra un pool de 10 conexiones, y eso se descubre en producción, de noche,
 * como "Connection terminated". El modo de falla es silencioso; por eso se congela.
 *
 * Cómo corre sin DB ni HubSpot: se mockea `@/lib/db/prisma` para que la primera query de
 * `correrSync` (el `findUnique` del cliente) devuelva `null` → la corrida sale por
 * "Cliente no encontrado" sin tocar nada más. Alcanza: lo que se prueba es el portón, no el
 * trabajo. El contador de ese mock ES la medición de "¿cuántas corridas arrancaron?".
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const h = vi.hoisted(() => ({
  /** Cuántas veces ARRANCÓ el cuerpo de la corrida (no cuántas veces se llamó a la puerta). */
  corridas: 0,
  /** Si está seteada, la corrida se cuelga acá hasta que el test la libere (simula una en vuelo). */
  freno: null as null | Promise<void>,
  /** Los proyectos activos con registro en HubSpot que la ficha ya tiene (la relectura del botón). */
  activos: [] as { hubspotServiceId: string }[],
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    client: {
      findUnique: vi.fn(async () => {
        h.corridas++;
        if (h.freno) await h.freno;
        return null; // → `correrSync` corta en "Cliente no encontrado"
      }),
    },
    hubspotAccount: { findFirst: vi.fn(async () => null) },
    teamMember: { findMany: vi.fn(async () => []) },
    project: { findMany: vi.fn(async () => h.activos) },
  },
}));

/** Importa el módulo FRESCO: los Maps de cooldown y de corridas vivas son estado de módulo. */
async function cargarModulo() {
  vi.resetModules();
  return import("./sync-projects");
}

let ahora = 1_000_000_000_000;

beforeEach(() => {
  h.corridas = 0;
  h.freno = null;
  h.activos = [];
  ahora = 1_000_000_000_000;
  vi.spyOn(Date, "now").mockImplementation(() => ahora);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("syncProjectsForClient — el portón", () => {
  it("A1 · deja pasar la primera corrida", async () => {
    const { syncProjectsForClient } = await cargarModulo();
    const r = await syncProjectsForClient("c1");
    expect(h.corridas).toBe(1);
    expect(r.omitido).toBeUndefined();
    expect(r.errors).toContain("Cliente no encontrado");
  });

  it("A2 · el segundo llamador SIMULTÁNEO se engancha a la corrida viva, no arranca otra", async () => {
    const { syncProjectsForClient } = await cargarModulo();
    let liberar!: () => void;
    h.freno = new Promise<void>((res) => { liberar = res; });

    const a = syncProjectsForClient("c1", { force: true });
    // Cede el microtask para que A llegue a registrar su promesa antes de que entre B.
    await Promise.resolve();
    const b = syncProjectsForClient("c1", { force: true });

    liberar();
    const [ra, rb] = await Promise.all([a, b]);

    expect(h.corridas).toBe(1); // ← lo que evita el doble click = dos corridas completas
    expect(ra.omitido).toBeUndefined();
    expect(rb.omitido).toBe("en_vuelo");
    // B recibe los conteos REALES de la corrida de A, no ceros inventados.
    expect(rb.errors).toEqual(ra.errors);
  });

  it("A2b · SIN force, con una corrida viva, NO se engancha: corta por cooldown", async () => {
    /* Regresión cazada en la revisión adversarial del 2026-08-02. El primer borrador consultaba
       el mutex ANTES del cooldown, así que la sync automática del montaje —que nadie está
       esperando— se enganchaba y sostenía su request HTTP los minutos que durara la corrida,
       para recibir el MISMO snapshot que el cooldown devuelve gratis. Con varias personas
       abriendo la misma ficha, eso acumula requests colgados justo bajo la presión que estos
       frenos vinieron a bajar. */
    const { syncProjectsForClient } = await cargarModulo();
    let liberar!: () => void;
    h.freno = new Promise<void>((res) => { liberar = res; });

    const viva = syncProjectsForClient("c1", { force: true });
    await Promise.resolve();

    // Resuelve YA, sin esperar a que se libere la corrida viva: eso es lo que se prueba.
    const deFondo = await syncProjectsForClient("c1");
    expect(deFondo.omitido).toBe("cooldown");
    expect(h.corridas).toBe(1);

    liberar();
    await viva;
  });

  it("A2c · una corrida COLGADA no traba al cliente para siempre (techo del mutex)", async () => {
    /* Sin techo, la única salida del Map es que la promesa settle. `correrSync` habla con HubSpot
       decenas de veces con un cliente sin timeout: una llamada que nunca resuelve dejaba la
       entrada viva para siempre y TODA llamada posterior de ese cliente se enganchaba a una
       promesa muerta. El mutex, puesto para que el sistema no se ahogue, ahogaba la ficha. */
    const { syncProjectsForClient } = await cargarModulo();
    // Freno que NUNCA se libera: simula la llamada colgada.
    h.freno = new Promise<void>(() => {});
    void syncProjectsForClient("c1", { force: true });
    await Promise.resolve();

    h.freno = null;
    ahora += 5 * 60_000 + 1; // pasado el techo de 5 min
    const r = await syncProjectsForClient("c1", { force: true });
    expect(r.omitido).toBeUndefined();
    expect(h.corridas).toBe(2);
  });

  it("A3 · dos clientes distintos NO se bloquean entre sí (el mutex es por cliente)", async () => {
    const { syncProjectsForClient } = await cargarModulo();
    let liberar!: () => void;
    h.freno = new Promise<void>((res) => { liberar = res; });

    const a = syncProjectsForClient("c1");
    await Promise.resolve();
    const b = syncProjectsForClient("c2");

    liberar();
    const [, rb] = await Promise.all([a, b]);

    expect(h.corridas).toBe(2);
    expect(rb.omitido).toBeUndefined();
  });

  it("A4 · el mutex se libera al terminar: la corrida siguiente vuelve a pasar", async () => {
    const { syncProjectsForClient } = await cargarModulo();
    await syncProjectsForClient("c1");
    ahora += 61_000; // pasado el piso
    await syncProjectsForClient("c1", { force: true });
    expect(h.corridas).toBe(2);
  });

  it("A5 · el mutex se libera aunque la corrida FALLE (finally, no then)", async () => {
    const { syncProjectsForClient } = await cargarModulo();
    h.freno = Promise.reject(new Error("boom"));
    await expect(syncProjectsForClient("c1")).rejects.toThrow("boom");

    h.freno = null;
    ahora += 61_000;
    // Si el Map hubiera quedado con la promesa muerta, ésta se engancharía y devolvería en_vuelo.
    const r = await syncProjectsForClient("c1", { force: true });
    expect(r.omitido).toBeUndefined();
    expect(h.corridas).toBe(2);
  });
});

describe("syncProjectsForClient — cooldown y piso", () => {
  it("B1 · sin force, dentro de los 10 min: omitido=cooldown y NO arranca", async () => {
    const { syncProjectsForClient } = await cargarModulo();
    await syncProjectsForClient("c1");
    ahora += 5 * 60_000;
    const r = await syncProjectsForClient("c1");
    expect(h.corridas).toBe(1);
    expect(r.omitido).toBe("cooldown");
  });

  it("B2 · sin force, pasados los 10 min: vuelve a correr", async () => {
    const { syncProjectsForClient } = await cargarModulo();
    await syncProjectsForClient("c1");
    ahora += 10 * 60_000 + 1;
    const r = await syncProjectsForClient("c1");
    expect(h.corridas).toBe(2);
    expect(r.omitido).toBeUndefined();
  });

  it("B2b · el piso se mide desde que TERMINÓ la corrida, no desde que arrancó", async () => {
    /* Cazado en la revisión adversarial. El piso miraba `lastSyncByClient`, que se reclama al
       ARRANCAR: una corrida de 3 minutos dejaba el piso vencido en el instante en que terminaba
       —justo el caso caro, que es el que el piso quería espaciar—. Acá la corrida "dura" 90 s. */
    const { syncProjectsForClient } = await cargarModulo();
    let liberar!: () => void;
    h.freno = new Promise<void>((res) => { liberar = res; });
    const larga = syncProjectsForClient("c1", { force: true });
    await Promise.resolve();
    ahora += 90_000; // la corrida tardó 90 s
    liberar();
    await larga;

    // Justo al terminar: el arranque quedó a 90 s (piso vencido), pero el FIN fue recién.
    const r = await syncProjectsForClient("c1", { force: true });
    expect(r.omitido).toBe("piso");
    expect(h.corridas).toBe(1);
  });

  it("B3 · CON force, dentro del piso de 60 s: omitido=piso — force NO lo saltea", async () => {
    const { syncProjectsForClient } = await cargarModulo();
    await syncProjectsForClient("c1");
    ahora += 30_000;
    const r = await syncProjectsForClient("c1", { force: true });
    expect(h.corridas).toBe(1);
    expect(r.omitido).toBe("piso");
  });

  it("B4 · CON force, pasado el piso pero dentro del cooldown: SÍ corre (para eso existe force)", async () => {
    const { syncProjectsForClient } = await cargarModulo();
    await syncProjectsForClient("c1");
    ahora += 61_000; // > piso, << cooldown
    const r = await syncProjectsForClient("c1", { force: true });
    expect(h.corridas).toBe(2);
    expect(r.omitido).toBeUndefined();
  });

  it("B5 · el cooldown se reclama AL ARRANCAR: una corrida que falla también hace back-off", async () => {
    const { syncProjectsForClient } = await cargarModulo();
    h.freno = Promise.reject(new Error("pool caído"));
    await expect(syncProjectsForClient("c1")).rejects.toThrow();

    h.freno = null;
    ahora += 2 * 60_000; // pasó el piso, NO el cooldown
    const r = await syncProjectsForClient("c1");
    expect(h.corridas).toBe(1); // no reintenta en cada navegación
    expect(r.omitido).toBe("cooldown");
  });
});

describe("syncProjectsForClient — el espejo dirigido pasa derecho", () => {
  it("C1 · soloRecord ignora cooldown y piso (es una lectura puntual del alta única)", async () => {
    const { syncProjectsForClient } = await cargarModulo();
    await syncProjectsForClient("c1");
    ahora += 1_000; // dentro del piso Y del cooldown
    const r = await syncProjectsForClient("c1", { force: true, soloRecord: "hs-123" });
    expect(h.corridas).toBe(2);
    expect(r.omitido).toBeUndefined();
  });

  it("C2 · soloRecord NO reclama el cooldown: no le roba la ventana a la corrida completa", async () => {
    const { syncProjectsForClient } = await cargarModulo();
    await syncProjectsForClient("c1", { force: true, soloRecord: "hs-123" });
    const r = await syncProjectsForClient("c1"); // sin force, inmediatamente después
    expect(h.corridas).toBe(2);
    expect(r.omitido).toBeUndefined();
  });

  it("C3 · soloRecord no se engancha al mutex (bloquearlo rompería el alta única)", async () => {
    const { syncProjectsForClient } = await cargarModulo();
    let liberar!: () => void;
    h.freno = new Promise<void>((res) => { liberar = res; });

    const completa = syncProjectsForClient("c1");
    await Promise.resolve();
    const dirigida = syncProjectsForClient("c1", { force: true, soloRecord: "hs-123" });

    liberar();
    const [, rd] = await Promise.all([completa, dirigida]);

    expect(h.corridas).toBe(2);
    expect(rd.omitido).toBeUndefined();
  });
});

/**
 * El botón «Traer proyectos de HubSpot» (2026-10-29, SmartAgro): la ficha se sincronizó sola al abrirse, Elías pasó un
 * proyecto a finalizado en HubSpot 24 s después, tocó el botón y el piso no dejó correr nada. Ahora, si el piso o una
 * corrida en curso frenan la completa, el botón relee por id los proyectos que ya están.
 */
describe("syncProjectsForClient — el botón relee lo que ya está", () => {
  it("D1 · dentro del piso, con releerSiHayPiso: relee por id en vez de no hacer nada", async () => {
    const { syncProjectsForClient } = await cargarModulo();
    h.activos = [{ hubspotServiceId: "hs-1" }, { hubspotServiceId: "hs-2" }];
    await syncProjectsForClient("c1");
    ahora += 24_000;
    const r = await syncProjectsForClient("c1", { force: true, releerSiHayPiso: true });
    expect(h.corridas).toBe(2);
    expect(r.omitido).toBeUndefined();
    expect(r.releidos).toBe(2);
  });

  it("D2 · sin proyectos que releer, dice lo del piso (y no corre nada)", async () => {
    const { syncProjectsForClient } = await cargarModulo();
    await syncProjectsForClient("c1");
    ahora += 24_000;
    const r = await syncProjectsForClient("c1", { force: true, releerSiHayPiso: true });
    expect(h.corridas).toBe(1);
    expect(r.omitido).toBe("piso");
  });

  it("D3 · la relectura no corre el piso ni reclama el cooldown: la corrida completa sigue pudiendo correr", async () => {
    const { syncProjectsForClient } = await cargarModulo();
    h.activos = [{ hubspotServiceId: "hs-1" }];
    await syncProjectsForClient("c1");
    ahora += 24_000;
    await syncProjectsForClient("c1", { force: true, releerSiHayPiso: true });
    ahora += 40_000; // 64 s desde que terminó la completa
    const r = await syncProjectsForClient("c1", { force: true, releerSiHayPiso: true });
    expect(r.releidos).toBeUndefined();
    expect(h.corridas).toBe(3);
  });

  it("D4 · con una corrida en curso, espera a que termine y relee (no se queda con lo que leyó antes del clic)", async () => {
    const { syncProjectsForClient } = await cargarModulo();
    h.activos = [{ hubspotServiceId: "hs-1" }];
    let liberar!: () => void;
    h.freno = new Promise<void>((res) => { liberar = res; });
    const deFondo = syncProjectsForClient("c1", { force: true });
    await Promise.resolve();
    const boton = syncProjectsForClient("c1", { force: true, releerSiHayPiso: true });
    h.freno = null;
    liberar();
    const [, rb] = await Promise.all([deFondo, boton]);
    expect(h.corridas).toBe(2);
    expect(rb.releidos).toBe(1);
  });

  it("D5 · sin releerSiHayPiso (los avisos de HubSpot, el pase) el piso sigue frenando", async () => {
    const { syncProjectsForClient } = await cargarModulo();
    h.activos = [{ hubspotServiceId: "hs-1" }];
    await syncProjectsForClient("c1");
    ahora += 24_000;
    const r = await syncProjectsForClient("c1", { force: true });
    expect(h.corridas).toBe(1);
    expect(r.omitido).toBe("piso");
  });

  it("D6 · dos relecturas a la vez comparten una: el botón no es una palanca contra el pool", async () => {
    const { syncProjectsForClient } = await cargarModulo();
    h.activos = [{ hubspotServiceId: "hs-1" }];
    await syncProjectsForClient("c1");
    ahora += 24_000;
    let liberar!: () => void;
    h.freno = new Promise<void>((res) => { liberar = res; });
    const a = syncProjectsForClient("c1", { force: true, releerSiHayPiso: true });
    const b = syncProjectsForClient("c1", { force: true, releerSiHayPiso: true });
    await new Promise((r) => setTimeout(r, 0));
    liberar();
    await Promise.all([a, b]);
    expect(h.corridas).toBe(2); // la completa del principio + UNA relectura
  });

  it("D7 · el candado se libera: la relectura siguiente vuelve a correr", async () => {
    const { syncProjectsForClient } = await cargarModulo();
    h.activos = [{ hubspotServiceId: "hs-1" }];
    await syncProjectsForClient("c1");
    ahora += 10_000;
    await syncProjectsForClient("c1", { force: true, releerSiHayPiso: true });
    ahora += 10_000;
    await syncProjectsForClient("c1", { force: true, releerSiHayPiso: true });
    expect(h.corridas).toBe(3);
  });

  it("D8 · lo que dijo la corrida en curso no se pierde: su error llega al botón", async () => {
    const { syncProjectsForClient } = await cargarModulo();
    h.activos = [{ hubspotServiceId: "hs-1" }];
    const deFondo = syncProjectsForClient("c1", { force: true });
    await Promise.resolve();
    const r = await syncProjectsForClient("c1", { force: true, releerSiHayPiso: true });
    await deFondo;
    expect(r.releidos).toBe(1);
    expect(r.errors).toEqual(["Cliente no encontrado", "Cliente no encontrado"]); // el de la corrida y el de la relectura
  });

  it("D9 · con una corrida en curso y nada que releer, el botón recibe el resultado de esa corrida", async () => {
    const { syncProjectsForClient } = await cargarModulo();
    const deFondo = syncProjectsForClient("c1", { force: true });
    await Promise.resolve();
    const r = await syncProjectsForClient("c1", { force: true, releerSiHayPiso: true });
    await deFondo;
    expect(r.omitido).toBe("en_vuelo");
    expect(r.errors).toEqual(["Cliente no encontrado"]);
  });
});
