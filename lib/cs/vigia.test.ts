import { describe, it, expect, vi, beforeEach } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * lib/cs/vigia.test.ts — EL AGENTE VIGÍA, CON LAS DECISIONES DE ELÍAS DEL 2026-10-05 (D14).
 *
 *  b) Al entrar a un cliente corre solo si hace más de 48 h que no corre para ese cliente.
 *  c) A mano se rechaza si hay una corrida en curso para el cliente o si corrió hace menos de 10 min.
 *  d) El interruptor de la base (CsSettings.watchdogEnabled) frena las tres vías.
 *  e) Las reuniones sin minuta se leen por un extracto ACOTADO de su transcripción.
 *
 * La regla de (b) y (c) es `lib/cs/vigia-por-cliente.ts`, con el mundo inyectado (sin base). La de
 * (d) se prueba además en el punto donde convergen todas las vías, `runWatchdogForProject`, con una
 * base falsa: ahí es donde una vía nueva no se puede olvidar del interruptor.
 */

vi.mock("server-only", () => ({}));
const db = vi.hoisted(() => ({
  csSettings: { findUnique: vi.fn() },
  project: { findUnique: vi.fn(), findFirst: vi.fn(), findMany: vi.fn() },
  agent: { findUnique: vi.fn() },
  agentRun: { create: vi.fn(), update: vi.fn(), findMany: vi.fn(), count: vi.fn() },
  timelineEvent: { updateMany: vi.fn(), findMany: vi.fn() },
}));
vi.mock("@/lib/db/prisma", () => ({ prisma: db }));

import {
  ESPERA_TRAS_FALLO_MS,
  PISO_MANUAL_MS,
  VENTANA_AL_ENTRAR_MS,
  vigiaAMano,
  vigiaAlEntrar,
  type CorridaDelVigia,
  type DepsDelVigia,
} from "./vigia-por-cliente";
import { runWatchdogForProject, type WatchdogRunResult } from "./watchdog";
import {
  TOPE_POR_REUNION,
  TOPE_TRANSCRIPCION_CUENTA,
  extractoDeTranscripcion,
  extractosDelBloque,
} from "./transcripcion-del-vigia";

const leer = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), "utf8");

const AHORA = new Date("2026-10-05T15:00:00Z");
const MIN = 60_000;
const H = 60 * MIN;
const hace = (ms: number) => new Date(AHORA.getTime() - ms);
const corrida = (status: string, creada: Date, terminada: Date = creada): CorridaDelVigia => ({
  status,
  createdAt: creada,
  updatedAt: terminada,
});

function diferido<T>() {
  let resolver!: (v: T) => void;
  const promesa = new Promise<T>((r) => {
    resolver = r;
  });
  return { promesa, resolver };
}

/** Un mundo falso: el interruptor, los proyectos de cartera del cliente, las corridas en la base. */
function mundo(
  o: {
    encendido?: boolean;
    proyectos?: string[];
    corridas?: CorridaDelVigia[];
    correr?: (projectId: string) => Promise<WatchdogRunResult>;
  } = {},
) {
  // Declara solo el proyecto, pero `mock.calls` guarda los tres argumentos (vía y persona).
  const correr = vi.fn(async (projectId: string) =>
    o.correr ? o.correr(projectId) : ({ status: "ok", projectId } as WatchdogRunResult),
  );
  const corridasDesde = vi.fn(async (_c: string, _p: readonly string[], desde: Date) =>
    (o.corridas ?? []).filter((c) => c.createdAt.getTime() >= desde.getTime()),
  );
  const deps: DepsDelVigia = {
    encendido: vi.fn(async () => o.encendido ?? true),
    proyectosDeCartera: vi.fn(async () => o.proyectos ?? ["p1", "p2"]),
    corridasDesde,
    correr,
    ahora: () => AHORA,
    estado: { enCurso: new Set(), noAntesDe: new Map() },
  };
  return { deps, correr, corridasDesde };
}

describe("⭐ al entrar a un cliente: solo si hace más de 48 h que no corre para ese cliente (D14b)", () => {
  it("no corre si el vigía corrió para algún proyecto del cliente en las últimas 48 h", async () => {
    /* La edición que lo pone en rojo: sacar la lectura de la última corrida (o contarla desde otra
       ventana): cada vez que alguien abre la ficha se paga una corrida por proyecto. */
    const { deps, correr } = mundo({ corridas: [corrida("DONE", hace(47 * H))] });
    const r = await vigiaAlEntrar("c1", deps);
    expect(r).toMatchObject({ corrio: false, motivo: "reciente" });
    expect(correr).not.toHaveBeenCalled();
  });

  it("corre para todos sus proyectos de cartera si no corrió en 48 h, como automática (sin persona)", async () => {
    const { deps, correr } = mundo({ corridas: [corrida("DONE", hace(49 * H))] });
    const r = await vigiaAlEntrar("c1", deps);
    expect(r.corrio).toBe(true);
    expect(correr.mock.calls).toEqual([
      ["p1", "entrada", null],
      ["p2", "entrada", null],
    ]);
  });

  it("el proceso lo recuerda: la carga siguiente ni mira la base", async () => {
    const { deps, corridasDesde } = mundo();
    await vigiaAlEntrar("c1", deps);
    expect(await vigiaAlEntrar("c1", deps)).toMatchObject({ corrio: false, motivo: "reciente" });
    expect(corridasDesde).toHaveBeenCalledTimes(1);
    expect(deps.estado.noAntesDe.get("c1")).toBe(AHORA.getTime() + VENTANA_AL_ENTRAR_MS);
  });

  it("nunca dos corridas a la vez para el mismo cliente", async () => {
    const espera = diferido<WatchdogRunResult>();
    let llamadas = 0;
    const { deps, correr } = mundo({
      proyectos: ["p1"],
      correr: (projectId) => (llamadas++ === 0 ? espera.promesa : Promise.resolve({ status: "ok" as const, projectId })),
    });
    const primera = vigiaAlEntrar("c1", deps);
    expect(await vigiaAlEntrar("c1", deps)).toMatchObject({ corrio: false, motivo: "en_curso" });
    espera.resolver({ status: "ok", projectId: "p1" });
    expect((await primera).corrio).toBe(true);
    expect(correr).toHaveBeenCalledTimes(1);
    // Y el candado se suelta al terminar.
    expect(deps.estado.enCurso.has("c1")).toBe(false);
  });

  it("una corrida que falló no cuenta como corrida, pero tampoco se reintenta en cada carga", async () => {
    const reciente = mundo({ corridas: [corrida("ERROR", hace(20 * MIN))] });
    expect(await vigiaAlEntrar("c1", reciente.deps)).toMatchObject({ corrio: false, motivo: "espera_tras_fallo" });
    expect(reciente.correr).not.toHaveBeenCalled();

    const vieja = mundo({ corridas: [corrida("ERROR", hace(ESPERA_TRAS_FALLO_MS + MIN))] });
    expect((await vigiaAlEntrar("c1", vieja.deps)).corrio).toBe(true);
  });

  it("si fallan todas, la próxima es en una hora, no en la carga siguiente", async () => {
    const { deps } = mundo({ correr: async (projectId) => ({ status: "error", reason: "x", projectId }) });
    await vigiaAlEntrar("c1", deps);
    expect(deps.estado.noAntesDe.get("c1")).toBe(AHORA.getTime() + ESPERA_TRAS_FALLO_MS);
  });

  it("un cliente sin proyectos de cartera no corre (ni vuelve a mirar en una hora)", async () => {
    const { deps, correr } = mundo({ proyectos: [] });
    expect(await vigiaAlEntrar("c1", deps)).toMatchObject({ corrio: false, motivo: "sin_proyectos" });
    expect(correr).not.toHaveBeenCalled();
    expect(deps.estado.noAntesDe.get("c1")).toBe(AHORA.getTime() + ESPERA_TRAS_FALLO_MS);
  });

  it("la ficha del cliente y su cuenta en Éxito del cliente lo piden al abrirse", () => {
    for (const p of ["app/(shell)/clients/[id]/WorkspaceClient.tsx", "app/(shell)/customer-success/[clientId]/page.tsx"]) {
      expect(leer(p), `${p} dejó de pedir la revisión del vigía`).toMatch(/<DisparoDelVigia clientId=\{/);
    }
    expect(leer("components/cs/DisparoDelVigia.tsx")).toContain('"/api/cs/watchdog/al-entrar"');
    expect(leer("app/api/cs/watchdog/al-entrar/route.ts")).toContain("void vigiaAlEntrar(");
  });
});

describe("⭐ a mano: se rechaza si hay una en curso o si corrió hace menos de 10 minutos (D14c)", () => {
  it("se rechaza si ya hay una en curso para el cliente en este proceso (a mano o al entrar)", async () => {
    /* La edición que lo pone en rojo: borrar el candado por cliente. Un doble clic paga dos veces.
       Solo la PRIMERA corrida queda esperando: sin candado, la segunda corre y termina, y lo que se
       pone en rojo es la aserción, no un timeout. */
    const espera = diferido<WatchdogRunResult>();
    let llamadas = 0;
    const { deps, correr } = mundo({
      proyectos: ["p1"],
      correr: (projectId) => (llamadas++ === 0 ? espera.promesa : Promise.resolve({ status: "ok" as const, projectId })),
    });
    const primera = vigiaAMano("c1", { quien: "ana@smarteamcr.com" }, deps);
    const segunda = await vigiaAMano("c1", { quien: "ana@smarteamcr.com" }, deps);
    expect(segunda).toMatchObject({ corrio: false, motivo: "en_curso" });
    expect(segunda.corrio === false && segunda.mensaje).toContain("ya está revisando este cliente");
    // La automática que llega mientras tanto tampoco entra.
    expect(await vigiaAlEntrar("c1", deps)).toMatchObject({ corrio: false, motivo: "en_curso" });
    espera.resolver({ status: "ok", projectId: "p1" });
    await primera;
    expect(correr).toHaveBeenCalledTimes(1);
  });

  it("se rechaza si otra máquina (o el barrido) la está corriendo: una corrida RUNNING fresca en la base", async () => {
    const { deps, correr } = mundo({ corridas: [corrida("RUNNING", hace(25 * MIN))] });
    expect(await vigiaAMano("c1", { quien: null }, deps)).toMatchObject({ corrio: false, motivo: "en_curso" });
    expect(correr).not.toHaveBeenCalled();
  });

  it("se rechaza si corrió hace menos de 10 minutos, y dice cuánto falta", async () => {
    /* Cuenta desde que TERMINÓ (como el auto-sync de Meet): una corrida larga no habilita otra
       apenas termina. */
    const { deps, correr } = mundo({ corridas: [corrida("DONE", hace(12 * MIN), hace(6 * MIN))] });
    const r = await vigiaAMano("c1", { quien: "ana@smarteamcr.com" }, deps);
    expect(r).toMatchObject({ corrio: false, motivo: "reciente" });
    expect(r.corrio === false && r.mensaje).toBe(
      "El agente vigía revisó este cliente hace 6 min. Cada revisión cuesta y repite el análisis: puedes volver a pedirla en 4 min.",
    );
    expect(correr).not.toHaveBeenCalled();
  });

  it("una que falló también cuenta para los 10 minutos: un script que reintenta no paga en bucle", async () => {
    const { deps, correr } = mundo({ corridas: [corrida("ERROR", hace(2 * MIN))] });
    expect(await vigiaAMano("c1", { quien: null }, deps)).toMatchObject({ corrio: false, motivo: "reciente" });
    expect(correr).not.toHaveBeenCalled();
  });

  it("pasados los 10 minutos corre, a nombre de quien la pidió", async () => {
    const { deps, correr } = mundo({ corridas: [corrida("DONE", hace(PISO_MANUAL_MS + MIN))] });
    expect((await vigiaAMano("c1", { quien: "ana@smarteamcr.com" }, deps)).corrio).toBe(true);
    expect(correr.mock.calls).toEqual([
      ["p1", "manual", "ana@smarteamcr.com"],
      ["p2", "manual", "ana@smarteamcr.com"],
    ]);
  });

  it("un proyecto puntual: solo ése, y tiene que ser de la cartera del cliente", async () => {
    const uno = mundo();
    await vigiaAMano("c1", { projectId: "p2", quien: null }, uno.deps);
    expect(uno.correr.mock.calls.map((c) => c[0])).toEqual(["p2"]);

    const ajeno = mundo();
    expect(await vigiaAMano("c1", { projectId: "otro", quien: null }, ajeno.deps)).toMatchObject({
      corrio: false,
      motivo: "no_es_de_la_cartera",
    });
    expect(ajeno.correr).not.toHaveBeenCalled();
  });
});

describe("⛔ el interruptor de la base frena las tres vías (D14d)", () => {
  beforeEach(() => {
    for (const modelo of Object.values(db)) for (const f of Object.values(modelo)) f.mockReset();
  });

  it("al entrar: apagado, no lee corridas ni corre", async () => {
    const { deps, correr, corridasDesde } = mundo({ encendido: false });
    expect(await vigiaAlEntrar("c1", deps)).toMatchObject({ corrio: false, motivo: "apagado" });
    expect(corridasDesde).not.toHaveBeenCalled();
    expect(correr).not.toHaveBeenCalled();
  });

  it("a mano: se rechaza con el motivo", async () => {
    const { deps, correr } = mundo({ encendido: false });
    const r = await vigiaAMano("c1", { quien: "ana@smarteamcr.com" }, deps);
    expect(r).toMatchObject({ corrio: false, motivo: "apagado" });
    expect(correr).not.toHaveBeenCalled();
  });

  it.each(["sweep", "debounce", "manual", "entrada"] as const)(
    "y donde convergen todas (runWatchdogForProject, vía %s): no crea la corrida",
    async (via) => {
      /* La edición que lo pone en rojo: sacar el `watchdogEnabled()` del principio de
         runForProjectInner. Hasta el 2026-10-05 la corrida manual por proyecto lo salteaba. */
      db.csSettings.findUnique.mockResolvedValue({ watchdogEnabled: false });
      const r = await runWatchdogForProject("p1", via);
      expect(r).toEqual({ status: "skipped", reason: "vigia_apagado", projectId: "p1" });
      expect(db.project.findUnique).not.toHaveBeenCalled();
      expect(db.agentRun.create).not.toHaveBeenCalled();
    },
  );

  it("encendido, la misma llamada sigue de largo (el interruptor no la tapa siempre)", async () => {
    db.csSettings.findUnique.mockResolvedValue({ watchdogEnabled: true });
    db.project.findUnique.mockResolvedValue(null);
    expect(await runWatchdogForProject("p1", "manual")).toEqual({ status: "skipped", reason: "no_project", projectId: "p1" });
    expect(db.project.findUnique).toHaveBeenCalledTimes(1);
  });

  it("el barrido a mano y el del cron también miran el interruptor antes de arrancar", () => {
    const ruta = leer("app/api/cs/watchdog/run/route.ts");
    expect(ruta.indexOf("await watchdogEnabled()")).toBeGreaterThan(-1);
    expect(ruta.indexOf("await watchdogEnabled()")).toBeLessThan(ruta.indexOf("runWatchdogSweep(new Date())"));
    expect(leer("lib/cs/watchdog.ts")).toMatch(/if \(!\(await watchdogEnabled\(\)\)\) return SIN_TURNO;/);
  });
});

describe("⭐ reuniones sin minuta: un extracto ACOTADO de la transcripción (D14e)", () => {
  const larga = (n: number, letra: string) => `${"inicio ".repeat(5)}${letra.repeat(n)}${" final".repeat(5)}`;

  it("una transcripción corta entra entera; una larga, el principio y el final dentro del tope", () => {
    expect(extractoDeTranscripcion("  Hola,\n\n  ¿cómo   están?  ", 100)).toBe("Hola, ¿cómo están?");
    const e = extractoDeTranscripcion(larga(5000, "x"), 300);
    expect(e.length).toBeLessThanOrEqual(300);
    expect(e.startsWith("inicio inicio")).toBe(true);
    expect(e.endsWith("final final")).toBe(true);
    expect(e).toContain(" […] ");
  });

  it("la minuta manda: con minuta no se lee la transcripción", () => {
    const m = extractosDelBloque([{ id: "a", tieneMinuta: true, transcript: larga(500, "x") }], 5000);
    expect(m.size).toBe(0);
  });

  it("el bloque nunca pasa su tope, ni una reunión el suyo, y la más nueva va primero", () => {
    /* La edición que lo pone en rojo: leer la transcripción entera, o sin restar lo ya usado del
       tope del bloque. Una hora de reunión son más de 40.000 caracteres, en cada corrida. */
    const reuniones = ["r1", "r2", "r3", "r4", "r5", "r6"].map((id) => ({ id, tieneMinuta: false, transcript: larga(40_000, "x") }));
    const m = extractosDelBloque(reuniones, TOPE_TRANSCRIPCION_CUENTA);
    const total = [...m.values()].reduce((s, e) => s + e.length, 0);
    expect(total).toBeLessThanOrEqual(TOPE_TRANSCRIPCION_CUENTA);
    for (const e of m.values()) expect(e.length).toBeLessThanOrEqual(TOPE_POR_REUNION);
    expect([...m.keys()]).toEqual(["r1", "r2", "r3", "r4"]);
  });

  it("sin transcripción no hay extracto (y no gasta tope)", () => {
    const m = extractosDelBloque(
      [
        { id: "vacia", tieneMinuta: false, transcript: "   " },
        { id: "nula", tieneMinuta: false, transcript: null },
        { id: "buena", tieneMinuta: false, transcript: "Se quejaron del soporte." },
      ],
      1000,
    );
    expect([...m.entries()]).toEqual([["buena", "Se quejaron del soporte."]]);
  });

  it("los dos bloques del vigía la usan, con su tope, y solo traen la transcripción de las que no tienen minuta", () => {
    const cuenta = leer("lib/cs/watchdog-cuenta.ts");
    expect(cuenta).toMatch(/extractosDelBloque\([\s\S]{0,300}TOPE_TRANSCRIPCION_CUENTA/);
    expect(cuenta).toMatch(/where: \{ id: \{ in: sinMinuta \}, transcript: \{ not: null \} \}/);
    const proyecto = leer("lib/cs/watchdog-context.ts");
    expect(proyecto).toMatch(/extractosDelBloque\([\s\S]{0,400}TOPE_TRANSCRIPCION_PROYECTO/);
    expect(proyecto).toMatch(/where: \{ id: \{ in: sinMinuta \}, transcript: \{ not: null \} \}/);
  });
});
