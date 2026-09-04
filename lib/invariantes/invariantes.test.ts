/**
 * lib/invariantes/invariantes.test.ts — cada invariante solo-base, contra una base FALSA (B-07).
 *
 * La base falsa devuelve lo que se le carga por modelo y ANOTA cada consulta: así se prueba (1) qué
 * decide cada invariante sobre filas concretas y (2) qué le pregunta a Postgres — el `where` es la
 * mitad del invariante (INV10 sin `status: "active"` marcaría 18 fantasmas para siempre).
 *
 * Y dos guardas estructurales: el script `check-invariants.ts` CONSUME todos los del registro (no
 * conserva una copia inline de ninguno), y ninguno de estos módulos escribe en la base.
 */
import { describe, expect, it } from "vitest";
import { pipelineByKey } from "@/lib/projects/kind";
import fs from "node:fs";
import path from "node:path";
import type { PrismaClient } from "@prisma/client";
import {
  INVARIANTES_SOLO_BASE,
  correrInvariantesSoloBase,
  INV1, INV3, INV5, INV8, INV8c, INV10, INV11, INV14, INV18, INV20, INV21, INV22, INV23, INV24, INV25, INV26, INV27, INV28,
  type Invariante,
} from "./index";
import { InvariantesVioladosError, JOB_INVARIANTES, correrJobDeInvariantes, mensajeDeViolaciones } from "./job";
import { invariantesOkDesde, leerInvariantesOk } from "./salud";

type Fila = Record<string, unknown>;
type Llamada = { modelo: string; metodo: string; args: Record<string, unknown> };

/** Por modelo: filas (para findMany/findUnique) o un número (para count). Ignora el `where`: lo que se afirma es la DECISIÓN sobre las filas y la FORMA de la consulta. */
function baseFalsa(tablas: Record<string, Fila[] | number>, llamadas: Llamada[] = []): PrismaClient {
  const filasDe = (modelo: string): Fila[] => {
    const t = tablas[modelo];
    return Array.isArray(t) ? t : [];
  };
  const delegado = (modelo: string) => ({
    async findMany(args: Record<string, unknown>) {
      llamadas.push({ modelo, metodo: "findMany", args });
      return filasDe(modelo);
    },
    async count(args: Record<string, unknown>) {
      llamadas.push({ modelo, metodo: "count", args });
      const t = tablas[modelo];
      return typeof t === "number" ? t : filasDe(modelo).length;
    },
    async findUnique(args: { where: { id: string } }) {
      llamadas.push({ modelo, metodo: "findUnique", args });
      return filasDe(modelo).find((r) => r.id === args.where.id) ?? null;
    },
  });
  return new Proxy({}, { get: (_, modelo) => (typeof modelo === "string" ? delegado(modelo) : undefined) }) as unknown as PrismaClient;
}

const AHORA = new Date("2026-09-04T12:00:00Z");
const hace = (dias: number) => new Date(AHORA.getTime() - dias * 86_400_000);
const where = (llamadas: Llamada[], modelo: string, metodo = "findMany") =>
  (llamadas.find((l) => l.modelo === modelo && l.metodo === metodo)?.args.where ?? {}) as Record<string, unknown>;

describe("sesiones: INV1 e INV21", () => {
  it("INV1 · un link cuya sesión es de OTRO cliente (y no fue asignada a mano) viola; el resto no", async () => {
    const cruza = { project: { clientId: "c1" }, session: { id: "s1", title: "Kickoff Acme", resolvedClientId: "c2", manualClientId: null } };
    const manual = { project: { clientId: "c1" }, session: { id: "s2", title: "Interna", resolvedClientId: "c2", manualClientId: "c1" } };
    const propio = { project: { clientId: "c1" }, session: { id: "s3", title: "Semanal", resolvedClientId: "c1", manualClientId: null } };
    const sinDuenio = { project: { clientId: "c1" }, session: { id: "s4", title: "Huérfana", resolvedClientId: null, manualClientId: null } };
    expect((await INV1.correr(baseFalsa({ sessionProject: [manual, propio, sinDuenio] }), AHORA)).ok).toBe(true);
    const r = await INV1.correr(baseFalsa({ sessionProject: [cruza, propio] }), AHORA);
    expect(r.ok).toBe(false);
    expect(r.lineas[0]).toContain("1 SessionProject cruzan cliente");
    expect(r.lineas.join("\n")).toContain('"Kickoff Acme" (s1)');
  });

  it("INV21 · un proyecto sellado sin reuniones viola SOLO si su cliente sí tiene sesiones pasadas", async () => {
    const proyecto = { id: "p1", name: "Onboarding", clientId: "c1", _count: { sessions: 0 } };
    const llamadas: Llamada[] = [];
    const r = await INV21.correr(baseFalsa({ project: [proyecto], firefliesSession: 3 }, llamadas), AHORA);
    expect(r.ok).toBe(false);
    expect(r.lineas[0]).toContain("Onboarding (3 sesión/es del cliente)");
    const w = where(llamadas, "firefliesSession", "count");
    expect(w.OR, "cuenta las del cliente por dueño manual o resuelto").toEqual([
      { manualClientId: "c1" },
      { manualClientId: null, resolvedClientId: "c1" },
    ]);
    expect(w.date, "las futuras no cuentan: la agenda vive en la misma tabla").toEqual({ lte: AHORA });
    expect((await INV21.correr(baseFalsa({ project: [proyecto], firefliesSession: 0 }), AHORA)).ok).toBe(true);
    expect((await INV21.correr(baseFalsa({ project: [{ ...proyecto, _count: { sessions: 2 } }], firefliesSession: 9 }), AHORA)).ok).toBe(true);
  });
});

describe("proyectos: INV8, INV8c, INV10, INV11, INV14", () => {
  const cliente = { name: "Acme" };

  it("INV8 · hermano de sí mismo, de otro cliente o BORRADO viola; el hermano sano no", async () => {
    const mayor = { id: "cs", name: "Implementación", clientId: "c1", hermanoCsProjectId: null, client: cliente };
    const sano = { id: "dev", name: "Conector", clientId: "c1", hermanoCsProjectId: "cs", client: cliente };
    expect((await INV8.correr(baseFalsa({ project: [mayor, sano] }), AHORA)).ok).toBe(true);
    const ajeno = { id: "x", name: "Ajeno", clientId: "c2", hermanoCsProjectId: "cs", client: { name: "Otro" } };
    const siMismo = { id: "yo", name: "Yo", clientId: "c1", hermanoCsProjectId: "yo", client: cliente };
    const colgado = { id: "z", name: "Colgado", clientId: "c1", hermanoCsProjectId: "no-existe", client: cliente };
    const r = await INV8.correr(baseFalsa({ project: [mayor, ajeno, siMismo, colgado] }), AHORA);
    expect(r.ok).toBe(false);
    expect(r.lineas[0]).toContain("3 hermano(s) mal resuelto(s)");
    expect(r.lineas.join("\n")).toContain("hermano de OTRO cliente");
    expect(r.lineas.join("\n")).toContain("apunta a un proyecto BORRADO");
    expect(r.lineas.join("\n")).toContain('"Yo"');
  });

  it("INV8c · un vínculo declarado hace más de 7 días cuyo hermano SÍ está en Nexus viola; uno reciente no", async () => {
    const fila = (updatedAt: Date) => ({
      id: "dev", name: "Conector", clientId: "c1", hermanoCsProjectId: null, hubspotRelatedProjectIds: ["hs-9"],
      updatedAt, client: cliente, hubspotServiceId: "hs-9", hubspotPipelineId: "826270797",
    });
    expect((await INV8c.correr(baseFalsa({ project: [fila(hace(8))] }), AHORA)).ok).toBe(false);
    expect((await INV8c.correr(baseFalsa({ project: [fila(hace(2))] }), AHORA)).ok).toBe(true);
    // El hermano mayor tiene que ser de Customer Success: otro pipeline no cuenta como presente.
    expect((await INV8c.correr(baseFalsa({ project: [{ ...fila(hace(8)), hubspotPipelineId: "otro" }] }), AHORA)).ok).toBe(true);
  });

  it("INV10 · pregunta SOLO por activos sincronizados sin pipeline con más de un día, y los lista", async () => {
    const llamadas: Llamada[] = [];
    const r = await INV10.correr(baseFalsa({ project: [{ name: "Fantasma", status: "active", client: cliente }] }, llamadas), AHORA);
    expect(r.ok).toBe(false);
    expect(r.lineas.join("\n")).toContain('Acme · "Fantasma" (active)');
    expect(r.lineas.join("\n")).toContain("backfill-project-pipeline.ts --apply");
    const w = where(llamadas, "project");
    expect(w.status, "un inactivo no entra a ningún alcance: no es asunto de INV10").toBe("active");
    expect(w.hubspotPipelineId).toBeNull();
    expect(w.hubspotServiceId).toEqual({ not: null });
    expect(w.updatedAt, "el día de gracia entre aplicar el SQL y correr el backfill").toEqual({ lt: hace(1) });
    expect((await INV10.correr(baseFalsa({ project: [] }), AHORA)).ok).toBe(true);
  });

  it("INV11 · una etapa que la tabla no declara viola; y desde D-05 un pipeline que la tabla no conoce TAMBIÉN", async () => {
    /* ⚠ INVERTIDO el 2026-09-04 (D-05). Hasta entonces este test afirmaba «un pipeline que la
       tabla no conoce no es asunto suyo»: era la fila que clasificaba A CIEGAS (cae a legacy y se
       comporta como Customer Success) sin que ningún invariante lo dijera. El remedio NO es
       inventar la fila: lo decide Elías con el panel de HubSpot, y por eso el mensaje lo dice. */
    const cs = pipelineByKey("customer-success");
    const huerfana = { name: "Cuenta", hubspotPipelineId: cs.hubspotPipelineId, hubspotPipelineStageId: "etapa-inventada", hubspotPipelineStageLabel: "Nueva", client: cliente };
    const r = await INV11.correr(baseFalsa({ project: [huerfana] }), AHORA);
    expect(r.ok).toBe(false);
    expect(r.lineas.join("\n")).toContain(`etapa etapa-inventada ("Nueva") del pipeline ${cs.hubspotPipelineId}`);

    const desconocido = { ...huerfana, hubspotPipelineId: "pipeline-desconocido" };
    const llamadas: Llamada[] = [];
    const d = await INV11.correr(baseFalsa({ project: [desconocido] }, llamadas), AHORA);
    expect(d.ok, "un pipeline que la tabla no conoce clasifica a ciegas: es un rojo").toBe(false);
    expect(d.lineas.join("\n")).toContain('"Cuenta" → pipeline pipeline-desconocido');
    expect(d.lineas.join("\n"), "el remedio es una decisión de Elías, no una fila inventada").toContain("NO inventar la fila");
    /* Sin exigir etapa: un activo de pipeline desconocido con la etapa vacía también viola. */
    expect(where(llamadas, "project").hubspotPipelineStageId, "la consulta no puede filtrar por etapa").toBeUndefined();
    expect((await INV11.correr(baseFalsa({ project: [{ ...desconocido, hubspotPipelineStageId: null }] }), AHORA)).ok).toBe(false);

    const sano = { ...huerfana, hubspotPipelineStageId: cs.initialStageId };
    expect((await INV11.correr(baseFalsa({ project: [sano] }), AHORA)).ok).toBe(true);
  });

  it("INV14 · un alta a medio hacer desde hace más de 12 h viola, con su remedio si falta el pipeline sellado", async () => {
    const llamadas: Llamada[] = [];
    const trabada = {
      id: "p1", name: "Nuevo", altaEstado: "pendiente_espejo", altaError: null, altaIntentos: 3,
      altaIniciadaAt: hace(3), altaPipelineElegido: null, hubspotPipelineId: "826270797", client: cliente,
    };
    const r = await INV14.correr(baseFalsa({ project: [trabada] }, llamadas), AHORA);
    expect(r.ok).toBe(false);
    expect(r.lineas.join("\n")).toContain("Acme / Nuevo: pendiente_espejo hace 3 d, 3 intento(s)");
    expect(r.lineas.join("\n")).toContain("(sin motivo escrito)");
    expect(r.lineas.join("\n")).toContain("sellar-pipeline-del-alta.ts --apply");
    const w = where(llamadas, "project");
    expect(w.altaIniciadaAt, "el umbral es de horas: un alta viva a la mañana siguiente está trabada").toEqual({
      lt: new Date(AHORA.getTime() - 12 * 3600_000),
    });
    const enCurso = (w.altaEstado as { in: string[] }).in;
    expect(enCurso, "«listo» es un estado que se PERSISTE: no es «en curso»").not.toContain("listo");
    expect(enCurso.length).toBeGreaterThan(0);
    expect((await INV14.correr(baseFalsa({ project: [] }), AHORA)).ok).toBe(true);
  });
});

describe("cobranza: INV3, INV5, INV18, INV20, INV25, INV26, INV27, INV28", () => {
  const conCliente = { cuenta: { client: { name: "Acme" } } };

  it("los cuatro espejos de «una persona firma la plata» preguntan exactamente por su pareja estado/autor", async () => {
    const casos: Array<[Invariante, string, Record<string, unknown>]> = [
      [INV3, "cobro", { estado: "COBRADO", confirmadoPor: null }],
      [INV5, "cobro", { fechaEmision: { not: null }, facturadoPor: null }],
      [INV18, "pagoPlanilla", { estado: "PAGADO", confirmadoPor: null }],
      [INV20, "comisionPartner", { estado: "COBRADO", confirmadoPor: null }],
    ];
    for (const [inv, modelo, esperado] of casos) {
      const llamadas: Llamada[] = [];
      const rojo = await inv.correr(baseFalsa({ [modelo]: 2 }, llamadas), AHORA);
      expect(rojo.ok, `INV${inv.id} con 2 filas`).toBe(false);
      expect(rojo.lineas[0]).toContain(`✗ INV${inv.id} VIOLADO: 2`);
      expect(where(llamadas, modelo, "count"), `el where de INV${inv.id}`).toEqual(esperado);
      expect((await inv.correr(baseFalsa({ [modelo]: 0 }), AHORA)).ok, `INV${inv.id} con 0`).toBe(true);
    }
  });

  it("INV25 · un cobro confirmado por «odoo»/«sync»/«cron» viola y suma la plata; sin filas, cumple", async () => {
    const r = await INV25.correr(
      baseFalsa({ cobro: [{ id: "k1", monto: "100.50", moneda: "USD", confirmadoPor: "odoo-sync", ...conCliente }, { id: "k2", monto: 49.5, moneda: "USD", confirmadoPor: "cron", ...conCliente }] }),
      AHORA,
    );
    expect(r.ok).toBe(false);
    expect(r.lineas[0]).toContain("2 cobro(s) por 150.00 los confirmó una máquina");
    expect(r.lineas[0]).toContain('confirmadoPor="odoo-sync"');
    expect((await INV25.correr(baseFalsa({ cobro: [] }), AHORA)).ok).toBe(true);
  });

  it("INV26 · una alerta viva cuyo cobro ya no existe viola; una que apunta a un cobro vivo no", async () => {
    const alerta = { id: "a1", cobroId: "k-borrado", tipo: "VENCIDO", estado: "ABIERTA", ...conCliente };
    const r = await INV26.correr(baseFalsa({ alertaCobro: [alerta], cobro: [{ id: "k-vivo" }] }), AHORA);
    expect(r.ok).toBe(false);
    expect(r.lineas[0]).toContain("VENCIDO (ABIERTA) → cobro k-borrado");
    expect((await INV26.correr(baseFalsa({ alertaCobro: [{ ...alerta, cobroId: "k-vivo" }], cobro: [{ id: "k-vivo" }] }), AHORA)).ok).toBe(true);
  });

  it("INV27 · media autoría (por sin en, o en sin por) viola", async () => {
    const r = await INV27.correr(
      baseFalsa({ cobro: [{ id: "k1", numCuota: 3, facturadoPor: "ana@smarteamcr.com", facturadoEn: null, ...conCliente }] }),
      AHORA,
    );
    expect(r.ok).toBe(false);
    expect(r.lineas[0]).toContain("Acme #3: por=ana@smarteamcr.com en=—");
    expect((await INV27.correr(baseFalsa({ cobro: [] }), AHORA)).ok).toBe(true);
  });

  it("INV28 · una liberación fuera de Odoo sin resolver pregunta por las de más de 15 días y las nombra", async () => {
    const llamadas: Llamada[] = [];
    const vieja = {
      id: "l1", clienteNombre: "Acme", monto: "250", moneda: "USD", plataforma: "MERCURY", decision: "ANULAR",
      referenciaExterna: "F-77", liberadaEn: hace(20), liberadaPor: "ana",
    };
    const r = await INV28.correr(baseFalsa({ facturaLiberada: [vieja] }, llamadas), AHORA);
    expect(r.ok).toBe(false);
    expect(r.lineas[0]).toContain("Acme: USD 250.00 — MERCURY anular F-77 · soltada 2026-08-15 por ana");
    const w = where(llamadas, "facturaLiberada");
    expect(w.plataforma, "las de ODOO las cierra el sync solo").toEqual({ not: "ODOO" });
    expect(w.resueltaEn).toBeNull();
    expect(w.liberadaEn).toEqual({ lt: hace(15) });
    expect((await INV28.correr(baseFalsa({ facturaLiberada: [] }), AHORA)).ok).toBe(true);
  });
});

describe("cronograma y Odoo: INV22, INV23, INV24", () => {
  it("INV22 · una tarea en una semana que su fase no tiene viola, contando tareas y fases", async () => {
    const fase = (semanas: number, tareas: number[]) => ({
      name: "Setup", durationWeeks: semanas, timeline: { project: { name: "Acme" } }, tasks: tareas.map((weekIndex) => ({ weekIndex })),
    });
    const r = await INV22.correr(baseFalsa({ timelinePhase: [fase(1, [0, 1, 5]), fase(3, [0, 2])] }), AHORA);
    expect(r.ok).toBe(false);
    expect(r.lineas[0]).toContain("2 tarea(s) en 1 fase(s)");
    expect(r.lineas[0]).toContain("Acme · «Setup» (1 sem): 2 tarea(s)");
    expect((await INV22.correr(baseFalsa({ timelinePhase: [fase(3, [0, 2])] }), AHORA)).ok).toBe(true);
  });

  it("INV23 · una moneda ajena al ERP o un neto mayor que el total viola; un céntimo de float no", async () => {
    const f = (numero: string, moneda: string, neto: number, total: number) => ({ numero, moneda, montoNeto: neto, montoTotal: total, montoImpuesto: total - neto });
    expect((await INV23.correr(baseFalsa({ facturaOdoo: [f("F-1", "USD", 100, 113), f("F-2", "CRC", 100.005, 100)] }), AHORA)).ok).toBe(true);
    const r = await INV23.correr(baseFalsa({ facturaOdoo: [f("F-3", "EUR", 1, 1), f("F-4", "USD", 113, 100)] }), AHORA);
    expect(r.ok).toBe(false);
    expect(r.lineas[0]).toContain("F-3: moneda «EUR» que el espejo no conoce");
    expect(r.lineas[0]).toContain("F-4: neto 113.00 mayor que el total 100.00");
  });

  it("INV24 · una corrida abierta hace más de 6 h o fallida sin error viola; una fallida CON error no", async () => {
    const c = (iniciadaEn: Date, terminadaEn: Date | null, ok: boolean, error: string | null) => ({ id: "x", iniciadaEn, terminadaEn, ok, error, disparadaPor: "cron" });
    const muerta = c(new Date(AHORA.getTime() - 7 * 3_600_000), null, false, null);
    const muda = c(hace(1), hace(1), false, "  ");
    const honesta = c(hace(2), hace(2), false, "timeout hablando con Odoo");
    const enCurso = c(new Date(AHORA.getTime() - 3_600_000), null, false, null);
    const r = await INV24.correr(baseFalsa({ syncOdooCorrida: [muerta, muda, honesta, enCurso] }), AHORA);
    expect(r.ok).toBe(false);
    expect(r.lineas[0]).toContain("2 corrida(s) del sync de Odoo no dejaron rastro");
    expect(r.lineas[0]).toContain("abierta hace más de 6 h");
    expect(r.lineas[0]).toContain("falló y no guardó el error");
    expect((await INV24.correr(baseFalsa({ syncOdooCorrida: [honesta, enCurso] }), AHORA)).ok).toBe(true);
  });
});

const RAIZ = process.cwd();
const soloCodigo = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").split(/\r?\n/).filter((l) => !l.trimStart().startsWith("//")).join("\n");
const soloCodigoDe = (rel: string) => soloCodigo(fs.readFileSync(path.join(RAIZ, rel), "utf8"));

describe("el registro y el consumidor", () => {

  it("el registro tiene los 18 solo-base, con ids únicos y en el orden del gate", () => {
    expect(INVARIANTES_SOLO_BASE.map((i) => i.id)).toEqual([
      "1", "3", "5", "8", "8c", "10", "11", "14", "18", "20", "21", "22", "23", "24", "25", "26", "27", "28",
    ]);
    expect(new Set(INVARIANTES_SOLO_BASE.map((i) => i.id)).size).toBe(INVARIANTES_SOLO_BASE.length);
  });

  it("correrInvariantesSoloBase: una excepción es «no verificable», no «cumplido»", async () => {
    const explota: Invariante = { id: "99", nombre: "explota", correr: async () => { throw new Error("ECONNRESET"); } };
    const r = await correrInvariantesSoloBase(baseFalsa({ cobro: 0 }), AHORA, [INV3, explota]);
    expect(r.ok).toBe(false);
    expect(r.resultados.map((x) => x.ok)).toEqual([true, false]);
    expect(r.resultados[1].lineas[0]).toContain("⚠ INV99 no verificable: Error: ECONNRESET");
    expect((await correrInvariantesSoloBase(baseFalsa({ cobro: 0 }), AHORA, [INV3, INV5])).ok).toBe(true);
  });

  it("scripts/check-invariants.ts CONSUME cada uno del registro y no conserva copias inline", () => {
    /* La edición que lo pone en rojo: borrar `violations += await reportar(INV22, prisma)` del
       script «porque ya lo corre el job» — el gate manual dejaría de mirarlo sin avisar. */
    const src = soloCodigo(fs.readFileSync(path.join(RAIZ, "scripts/check-invariants.ts"), "utf8"));
    expect(src).toContain('from "@/lib/invariantes"');
    for (const inv of INVARIANTES_SOLO_BASE) {
      const veces = src.split(`reportar(INV${inv.id}, prisma)`).length - 1;
      expect(veces, `el script tiene que consumir INV${inv.id} exactamente una vez`).toBe(1);
    }
    // Las copias inline que se fueron: si vuelve una, hay dos versiones del mismo invariante.
    expect(src).not.toContain('estado: "COBRADO", confirmadoPor: null');
    expect(src).not.toContain("weekIndex >= f.durationWeeks");
    expect(src).not.toContain("hermanosDeSiMismo");
  });

  it("ningún módulo de lib/invariantes escribe en la base: son lecturas", () => {
    const dir = path.join(RAIZ, "lib/invariantes");
    const modulos = fs.readdirSync(dir).filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"));
    expect(modulos.length).toBeGreaterThan(5);
    for (const f of modulos) {
      const src = soloCodigo(fs.readFileSync(path.join(dir, f), "utf8"));
      expect(src, `${f} escribe`).not.toMatch(/\.(create|createMany|update|updateMany|upsert|delete|deleteMany)\(|\$executeRaw|\$queryRaw/);
    }
  });
});

describe("el job invariants-daily (B-08)", () => {
  /**
   * El job existe para que un invariante violado deje de depender de que alguien corra el gate a
   * mano. En rojo LANZA: es lo que hace que el scheduler lo anote en `lastResult` (semáforo rojo)
   * y lo mande a Sentry — devolver «ok» con un log sería el silencio que B-02 vino a matar.
   */
  it("con todo en verde devuelve el resumen; con algo en rojo LANZA con los ids y el mensaje acotado", async () => {
    /* La edición que lo pone en rojo: cambiar el throw por un console.error «para no ensuciar Sentry». */
    await expect(correrJobDeInvariantes(baseFalsa({}), AHORA)).resolves.toBe("18 invariantes solo-base en verde");
    const promesa = correrJobDeInvariantes(baseFalsa({ cobro: 2 }), AHORA); // INV3 e INV5 cuentan cobros
    await expect(promesa).rejects.toBeInstanceOf(InvariantesVioladosError);
    const e = (await promesa.catch((x: unknown) => x)) as InvariantesVioladosError;
    expect(e.violados).toEqual(["3", "5"]);
    expect(e.name, "el scheduler escribe `${name}: ${message}` en lastResult").toBe("InvariantesViolados");
    expect(e.message).toContain("2 invariante(s) en rojo: INV3, INV5");
    expect(e.message).toContain("✗ INV3 VIOLADO: 2 Cobro(s)");
  });

  it("el mensaje se acota al tope, con la primera línea de cada uno", () => {
    const corrida = {
      ok: false,
      resultados: [
        { id: "1", nombre: "a", ok: true, lineas: ["✓ INV1: bien."] },
        { id: "22", nombre: "b", ok: false, lineas: ["✗ INV22 VIOLADO: 3 tarea(s)\n    · detalle largo"] },
      ],
    };
    expect(mensajeDeViolaciones(corrida)).toBe("1 invariante(s) en rojo: INV22 — ✗ INV22 VIOLADO: 3 tarea(s)");
    const largo = mensajeDeViolaciones({ ...corrida, resultados: [{ id: "9", nombre: "c", ok: false, lineas: ["x".repeat(2000)] }] }, 100);
    expect(largo.length).toBe(100);
    expect(largo.endsWith("…")).toBe(true);
  });

  it("está registrado en lib/jobs/defs.ts: clave, claim del día y allJobs()", () => {
    /* La edición que lo pone en rojo: sacarlo de allJobs() «mientras se calibra» — el semáforo lo
       mostraría gris para siempre y nadie sabría que dejó de correr. */
    const defs = soloCodigoDe("lib/jobs/defs.ts");
    expect(defs).toContain(`key: "${JOB_INVARIANTES}"`);
    expect(defs).toContain(`claimDateKey("${JOB_INVARIANTES}"`);
    expect(defs).toContain("correrJobDeInvariantes(prisma, now)");
    const allJobs = defs.slice(defs.indexOf("export function allJobs()"));
    expect(allJobs, "tiene que estar en la lista que corre el tick").toContain("invariantsDaily");
  });
});

describe("/api/health expone UN booleano de invariantes, y nada más (B-09)", () => {
  /**
   * El health es público. De los invariantes cruza `invariantesOk` —true/false/null— y ningún
   * detalle; y NUNCA participa del `ok`: un invariante violado es un dato mal escrito, no un
   * contenedor caído. Si tumbara el healthcheck, Docker reiniciaría la app en bucle.
   */
  const estado = (resultado: { ok: true; at: string } | { ok: false; error: string; at: string } | null) => ({
    key: JOB_INVARIANTES, lastRunAt: null, lastRunDateKey: null, resultado,
  });

  it("true si la última corrida dio verde, false si dio rojo, null si el job nunca corrió", () => {
    /* La edición que lo pone en rojo: devolver false cuando no hay corrida — en un deploy recién
       hecho diría «invariantes rotos» sin haber mirado nada. */
    expect(invariantesOkDesde(estado({ ok: true, at: "2026-09-04T13:00:00Z" }))).toBe(true);
    expect(invariantesOkDesde(estado({ ok: false, error: "InvariantesViolados: 1 invariante(s) en rojo: INV3", at: "x" }))).toBe(false);
    expect(invariantesOkDesde(estado(null))).toBeNull();
    expect(invariantesOkDesde(undefined)).toBeNull();
  });

  it("leerInvariantesOk pregunta por el job y nunca lanza: si la lectura falla, null", async () => {
    const pedidas: string[][] = [];
    const ok = await leerInvariantesOk(async (keys) => {
      pedidas.push(keys);
      return [estado({ ok: true, at: "x" })];
    });
    expect(ok).toBe(true);
    expect(pedidas).toEqual([[JOB_INVARIANTES]]);
    await expect(leerInvariantesOk(async () => { throw new Error("db caída"); })).resolves.toBeNull();
  });

  it("la ruta lo expone como campo suelto, sin detalle, y el `ok` del health no depende de él", () => {
    /* Las ediciones que lo ponen en rojo: exponer `lineas`/`error` de la corrida en el JSON
       (es público), o hacer `ok = ok && invariantesOk` (tumbaría el healthcheck del compose). */
    const src = soloCodigoDe("app/api/health/route.ts");
    expect(src).toContain('from "@/lib/invariantes/salud"');
    expect(src).toContain("invariantesOk,");
    expect(src, "el health sigue decidiendo el 503 solo por db y cliente Prisma").toContain("status: ok ? 200 : 503");
    expect((src.match(/ok = false/g) ?? []).length, "solo los dos checks de infraestructura apagan el ok").toBe(2);
    expect(src).not.toMatch(/invariantesOk\s*(&&|\|\||\?)/);
    expect(src).not.toMatch(/\.(lineas|error|resultados)\b/);
  });
});
