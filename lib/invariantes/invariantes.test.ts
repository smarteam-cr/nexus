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
import { describe, expect, it, vi } from "vitest";
import { pipelineByKey } from "@/lib/projects/kind";
import fs from "node:fs";
import path from "node:path";
import type { PrismaClient } from "@prisma/client";
import {
  INVARIANTES_SOLO_BASE,
  correrInvariantesSoloBase,
  INV1, INV3, INV5, INV8, INV8c, INV10, INV11, INV14, INV18, INV20, INV21, INV22, INV23, INV24, INV25, INV26, INV27, INV28, INV30,
  INV31, INV32, INV33, INV34, INV35, INV36, INV37, INV38, INV39, INV40, INV41, INV42, INV43, INV44, INV45, INV46,
  type Invariante,
} from "./index";
import { INV49, INV53 } from "./google";
import { INV59 } from "./escala";
import { INV55, INV55_BLOQUEA } from "./smartloop";
import { INV51, INV56 } from "./empresa";
import { INV58, INV58_BLOQUEA } from "./tests-diagnostico";
import { INV61 } from "./exploraciones";
import { InvariantesVioladosError, JOB_INVARIANTES, correrJobDeInvariantes, mensajeDeViolaciones } from "./job";
import { invariantesOkDesde, leerInvariantesOk } from "./salud";
import { DONDE_PUEDE_TENER_TEXTO } from "@/lib/sessions/tiene-texto";

type Fila = Record<string, unknown>;
type Llamada = { modelo: string; metodo: string; args: Record<string, unknown> };

/** Por modelo: filas (para findMany/findUnique/findFirst) o un número (para count). Ignora el `where`: lo que se afirma es la DECISIÓN sobre las filas y la FORMA de la consulta. */
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
    /** La primera fila cargada: el test la carga ya como «la más reciente que cumple el where». */
    async findFirst(args: Record<string, unknown>) {
      llamadas.push({ modelo, metodo: "findFirst", args });
      return filasDe(modelo)[0] ?? null;
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
    /** Sin filas, el máximo no existe (INV50 lo lee como «no hay copia de Partner»). Los casos con datos: el .int.test. */
    async aggregate(args: Record<string, unknown>) {
      llamadas.push({ modelo, metodo: "aggregate", args });
      return { _max: {} };
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

  it("INV37 · dos clientes con el mismo dominio (por emailDomains o por company) violan; dominios distintos no", async () => {
    const viejo = { id: "c1", name: "Club de Amantes del Vino", company: "Club de Amantes del Vino", emailDomains: ["lacav.cl"] };
    const duplicado = { id: "c2", name: "Club de Amantes del Vino", company: "lacav.cl", emailDomains: [] };
    const otro = { id: "c3", name: "Wherex", company: "wherex.com", emailDomains: ["wherex.com"] };
    const r = await INV37.correr(baseFalsa({ client: [viejo, duplicado, otro] }), AHORA);
    expect(r.ok).toBe(false);
    expect(r.lineas[0]).toContain("lacav.cl: Club de Amantes del Vino · Club de Amantes del Vino");
    expect(r.lineas[0], "un cliente con el dominio repetido en sus dos campos no se cuenta dos veces").not.toContain("wherex.com");
    expect((await INV37.correr(baseFalsa({ client: [viejo, otro] }), AHORA)).ok).toBe(true);
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

  it("INV25 · el cobro solo (sistema:odoo / sistema:mercury) cumple SOLO con su factura pagada en la copia (2026-10-18)", async () => {
    const solo = (id: string, firma: string, numero: string) => ({ id, monto: 500, moneda: "USD", estado: "COBRADO", confirmadoPor: firma, numeroFactura: numero, ...conCliente });
    const conEvidencia = await INV25.correr(
      baseFalsa({
        cobro: [solo("k1", "sistema:odoo", "FAC/2026/0010"), solo("k2", "sistema:mercury", "INV-7")],
        facturaOdoo: [{ numero: "FAC/2026/0010", paymentState: "paid" }],
        facturaMercury: [{ numero: "INV-7", estado: "Paid" }],
      }),
      AHORA,
    );
    expect(conEvidencia.ok).toBe(true);
    // La factura dejó de estar pagada en Odoo, o la firma no es una de las dos: viola.
    const sinEvidencia = await INV25.correr(
      baseFalsa({
        cobro: [solo("k1", "sistema:odoo", "FAC/2026/0010"), solo("k3", "sistema:otro", "FAC/2026/0011")],
        facturaOdoo: [{ numero: "FAC/2026/0010", paymentState: "not_paid" }],
        facturaMercury: [],
      }),
      AHORA,
    );
    expect(sinEvidencia.ok).toBe(false);
    expect(sinEvidencia.lineas[0]).toContain("2 cobro(s)");
    // Ya sacado de Cobrado: la firma vieja no confirma nada.
    const revertido = await INV25.correr(baseFalsa({ cobro: [{ ...solo("k1", "sistema:odoo", "FAC/2026/0010"), estado: "POR_COBRAR" }], facturaOdoo: [], facturaMercury: [] }), AHORA);
    expect(revertido.ok).toBe(true);
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
    const f = (numero: string, moneda: string, neto: number, total: number) => ({
      numero, moneda, moveType: "out_invoice", montoNeto: neto, montoTotal: total, montoImpuesto: total - neto, montoTotalSigned: total, montoResidual: 0,
    });
    expect((await INV23.correr(baseFalsa({ facturaOdoo: [f("F-1", "USD", 100, 113), f("F-2", "CRC", 100.005, 100)] }), AHORA)).ok).toBe(true);
    const r = await INV23.correr(baseFalsa({ facturaOdoo: [f("F-3", "EUR", 1, 1), f("F-4", "USD", 113, 100)] }), AHORA);
    expect(r.ok).toBe(false);
    expect(r.lineas[0]).toContain("F-3: moneda «EUR» que el espejo no conoce");
    expect(r.lineas[0]).toContain("F-4: neto 113.00 mayor que el total 100.00");
  });

  it("INV23 · la fila vieja, con colones en el total con signo de una factura USD, viola y nombra el SQL; la nota de crédito en negativo no", async () => {
    /* Medido el 2026-09-12: 318 facturas USD guardaban en `montoTotalSigned` el `amount_total_signed`
       de Odoo, que está en colones. INV23 no lo veía porque no pedía la columna. */
    const fila = (numero: string, moveType: string, total: number, conSigno: number, saldo = 0) => ({
      numero, moveType, moneda: "USD", montoNeto: total / 1.13, montoTotal: total, montoImpuesto: total - total / 1.13, montoTotalSigned: conSigno, montoResidual: saldo,
    });
    const llamadas: Llamada[] = [];
    const sana = await INV23.correr(
      baseFalsa(
        { facturaOdoo: [fila("FAC/2026/0332", "out_invoice", 15226.75, 15226.75, 15226.75), fila("NC-1", "out_refund", 500, -500), fila("F-5", "out_invoice", 113, 113.004)] },
        llamadas,
      ),
      AHORA,
    );
    expect(sana.ok).toBe(true);
    const select = llamadas.find((l) => l.modelo === "facturaOdoo")?.args.select;
    expect(select, "sin estas columnas el invariante no puede ver el defecto").toMatchObject({ moveType: true, montoTotalSigned: true, montoResidual: true });

    const r = await INV23.correr(
      baseFalsa({ facturaOdoo: [fila("FAC/2026/0332", "out_invoice", 15226.75, 6905331.13), fila("NC-2", "out_refund", 500, 500), fila("F-6", "out_invoice", 113, 113, 120)] }),
      AHORA,
    );
    expect(r.ok).toBe(false);
    const texto = r.lineas.join("\n");
    expect(texto).toContain("3 factura(s)");
    expect(texto).toContain("FAC/2026/0332: total con signo 6905331.13 y el documento (out_invoice, USD) dice 15226.75");
    expect(texto).toContain("NC-2: total con signo 500.00 y el documento (out_refund, USD) dice -500.00");
    expect(texto).toContain("F-6: saldo 120.00 mayor que el total 113.00");
    expect(texto).toContain("Remedio del total con signo (2)");
    expect(texto).toContain("2026-09-12-4-espejo-odoo-moneda-del-documento.sql");

    const sinColumna = await INV23.correr(baseFalsa({ facturaOdoo: [{ ...fila("F-7", "out_invoice", 113, 113), montoTotalSigned: undefined }] }), AHORA);
    expect(sinColumna.ok, "una columna que no llegó no pasa callada").toBe(false);
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

  it("INV30 · la factura con la cuenta de su vínculo cumple; sin cuenta teniendo vínculo, o con cuenta sin vínculo, viola", async () => {
    /* Medido el 2026-09-12: 170 facturas de clientes vinculados sin cuenta, y «Lo que no cuadra»
       acusando USD 237.355 de cobros sin factura que sí la tenían. */
    const amvac = { client: { name: "Amvac Latam" } };
    const f = (numero: string, odooPartnerId: number, cuentaId: string | null) => ({
      id: numero, odooMoveId: 1, numero, odooPartnerId, odooPartnerNombre: `PARTNER ${odooPartnerId}`, cuentaId, cuenta: cuentaId ? amvac : null,
    });
    const vinculos = [{ odooPartnerId: 38, cuentaId: "amvac", cuenta: amvac }];

    const sana = await INV30.correr(baseFalsa({ facturaOdoo: [f("F-1", 38, "amvac"), f("F-2", 99, null)], odooPartnerVinculo: vinculos }), AHORA);
    expect(sana.ok, "la de su vínculo, y la de un cliente sin vincular sin cuenta").toBe(true);

    const llamadas: Llamada[] = [];
    const r = await INV30.correr(
      baseFalsa({ facturaOdoo: [f("F-3", 38, null), f("F-4", 99, "amvac")], odooPartnerVinculo: vinculos }, llamadas),
      AHORA,
    );
    expect(r.ok).toBe(false);
    expect(r.lineas[0]).toContain("2 factura(s) vigentes no tienen la cuenta de su vínculo (1 sin cuenta teniendo vínculo)");
    expect(r.lineas[0]).toContain("F-3 (PARTNER 38): sin cuenta, y su vínculo dice «Amvac Latam»");
    expect(r.lineas[0]).toContain("F-4 (PARTNER 99): está en «Amvac Latam», y su cliente de Odoo no está vinculado");
    expect(r.lineas[0]).toContain("scripts/odoo-reatribuir-facturas.ts");
    expect(where(llamadas, "facturaOdoo").estadoEspejo, "una desaparecida no la mira nadie").toBe("VIGENTE");
  });
});

describe("frescura: INV31 (espejo de Odoo) e INV32 (corte de cartera)", () => {
  /* Medido el 2026-09-12: la última corrida buena del espejo era del 2-sep y el único corte de
     cartera, del 24-jul. Ningún invariante preguntaba cuándo había corrido cada cosa por última vez. */
  const haceHoras = (h: number) => new Date(AHORA.getTime() - h * 3_600_000);

  it("INV31 · a 19 h cumple; a 21 h viola con la fecha, cuánto hace y el RUNBOOK", async () => {
    /* La edición que lo pone en rojo: mirar la última corrida en vez de la última BUENA — una
       corrida fallida de anoche dejaba el espejo «al día». */
    const llamadas: Llamada[] = [];
    expect((await INV31.correr(baseFalsa({ syncOdooCorrida: [{ iniciadaEn: haceHoras(19) }] }, llamadas), AHORA)).ok).toBe(true);
    const consulta = llamadas.find((l) => l.modelo === "syncOdooCorrida" && l.metodo === "findFirst")?.args;
    expect(consulta?.where, "solo cuenta una corrida BUENA").toEqual({ ok: true });
    expect(consulta?.orderBy, "la más reciente").toEqual({ iniciadaEn: "desc" });

    const vieja = await INV31.correr(baseFalsa({ syncOdooCorrida: [{ iniciadaEn: haceHoras(21) }] }), AHORA);
    expect(vieja.ok).toBe(false);
    expect(vieja.lineas[0]).toContain("la última corrida buena del espejo de Odoo es del 2026-09-03 15:00 UTC (hace 21 h)");
    expect(vieja.lineas[0]).toContain("docs/RUNBOOK.md, «El espejo de Odoo no corre»");
  });

  it("INV31 · el caso medido: la última buena del 2-sep, mirada el 12-sep, dice diez días", async () => {
    const r = await INV31.correr(
      baseFalsa({ syncOdooCorrida: [{ iniciadaEn: new Date("2026-09-02T07:17:00Z") }] }),
      new Date("2026-09-12T13:00:00Z"),
    );
    expect(r.ok).toBe(false);
    expect(r.lineas[0]).toContain("(hace 10 días)");
  });

  it("INV31 · corridas y ninguna buena viola; ninguna corrida en toda la historia cumple", async () => {
    const nunca = await INV31.correr(baseFalsa({ syncOdooCorrida: 3 }), AHORA);
    expect(nunca.ok).toBe(false);
    expect(nunca.lineas[0]).toContain("3 corrida(s) y ninguna terminó bien");
    expect((await INV31.correr(baseFalsa({}), AHORA)).ok, "sin espejo no hay copia vieja").toBe(true);
  });

  it("INV32 · entre dos cortes hay como mucho 17 días: del 15-ago al 1-sep cumple, al 2-sep viola", async () => {
    const corte = { capturedAt: new Date("2026-08-15T13:05:00Z"), triggeredBy: "cron" }; // 7:05 en Costa Rica
    const llamadas: Llamada[] = [];
    expect((await INV32.correr(baseFalsa({ snapshotCartera: [corte] }, llamadas), new Date("2026-09-01T13:00:00Z"))).ok).toBe(true);
    expect(llamadas[0]?.args.orderBy, "el corte más reciente").toEqual({ capturedAt: "desc" });
    const r = await INV32.correr(baseFalsa({ snapshotCartera: [corte] }), new Date("2026-09-02T13:00:00Z"));
    expect(r.ok).toBe(false);
    expect(r.lineas[0]).toContain("el último corte de cartera es del 2026-08-15 (hace 18 días, por cron)");
    expect(r.lineas[0]).toContain("COBRANZA_CRON_ENABLED=1");
  });

  it("INV32 · el día del corte se cuenta en hora de Costa Rica; sin cortes cumple", async () => {
    /* 25-jul 03:49 UTC es el 24-jul a las 21:49 en Costa Rica. Contado en UTC serían 17 días al
       11-ago y cumpliría; en Costa Rica son 18. */
    const corte = { capturedAt: new Date("2026-07-25T03:49:00Z"), triggeredBy: "criterio-unico-vencido" };
    const r = await INV32.correr(baseFalsa({ snapshotCartera: [corte] }), new Date("2026-08-11T15:00:00Z"));
    expect(r.ok).toBe(false);
    expect(r.lineas[0]).toContain("es del 2026-07-24");
    expect((await INV32.correr(baseFalsa({}), AHORA)).ok).toBe(true);
  });
});

describe("cobranza: INV33 e INV34 (el número de factura, etapa 7)", () => {
  const cuenta = (name: string) => ({ client: { name } });

  it("INV33 · el mismo número en dos cuentas viola; repetido en cuotas de la MISMA cuenta no", async () => {
    const llamadas: Llamada[] = [];
    const compartida = [
      { numeroFactura: "FAC/2026/0343", cuentaId: "mccann", cuenta: cuenta("McCann") },
      { numeroFactura: "FAC/2026/0343", cuentaId: "mccann", cuenta: cuenta("McCann") },
      { numeroFactura: "FAC/2026/0206", cuentaId: "global", cuenta: cuenta("Global Supply") },
    ];
    const sana = await INV33.correr(baseFalsa({ cobro: compartida }, llamadas), AHORA);
    expect(sana.ok, "una factura que cubre varias cuotas de su cuenta es legítima").toBe(true);
    expect(sana.lineas[0]).toContain("los 2 números de factura");
    expect(where(llamadas, "cobro").numeroFactura).toEqual({ not: null });

    const r = await INV33.correr(
      baseFalsa({ cobro: [...compartida, { numeroFactura: "FAC/2026/0206", cuentaId: "publimark", cuenta: cuenta("Publimark") }] }),
      AHORA,
    );
    expect(r.ok).toBe(false);
    expect(r.lineas[0]).toContain("1 número(s) de factura están en más de una cuenta");
    expect(r.lineas[0]).toContain("FAC/2026/0206: Global Supply · Publimark");
  });

  it("INV34 · número o marca sin autor, firma sin número, o número sin factura violan; lo entero cumple", async () => {
    const base = {
      numCuota: 1,
      numeroFactura: "FAC/2026/0206",
      sinNumeroFacturaMotivo: null,
      numeroFacturaPor: "aarrieta@smarteamcr.com",
      numeroFacturaEn: hace(1),
      fechaEmision: hace(200),
      cuenta: cuenta("Global Supply"),
    };
    const conMarca = { ...base, numCuota: 2, numeroFactura: null, sinNumeroFacturaMotivo: "QuickBooks no numera" };
    const llamadas: Llamada[] = [];
    const sana = await INV34.correr(baseFalsa({ cobro: [base, conMarca] }, llamadas), AHORA);
    expect(sana.ok).toBe(true);
    expect(where(llamadas, "cobro").OR, "sin la autoría en el where no ve la firma colgando").toEqual([
      { numeroFactura: { not: null } },
      { sinNumeroFacturaMotivo: { not: null } },
      { numeroFacturaPor: { not: null } },
      { numeroFacturaEn: { not: null } },
    ]);

    const r = await INV34.correr(
      baseFalsa({
        cobro: [
          { ...base, numCuota: 3, numeroFacturaPor: null },
          { ...conMarca, numCuota: 4, numeroFacturaEn: null },
          { ...base, numCuota: 5, numeroFactura: null },
          { ...base, numCuota: 6, fechaEmision: null },
        ],
      }),
      AHORA,
    );
    expect(r.ok).toBe(false);
    const texto = r.lineas.join("\n");
    expect(texto).toContain("4 rotura(s)");
    expect(texto).toContain("Global Supply #3: FAC/2026/0206 sin autor entero (por=— en=2026-09-03)");
    expect(texto).toContain("Global Supply #4: «no tengo el número» sin autor entero");
    expect(texto).toContain("Global Supply #5: firma de número (aarrieta@smarteamcr.com) sin número ni marca");
    expect(texto).toContain("Global Supply #6: FAC/2026/0206 en un cobro sin fecha de emisión");
  });
});

describe("finanzas: INV35 (una factura no es cobro y plata que no es venta a la vez, etapa 10)", () => {
  const cobroDe = (numeroFactura: string, name: string) => ({ numeroFactura, cuenta: { client: { name } } });

  it("el mismo documento en Ingresos variables y en un cobro viola, y nombra los dos lados", async () => {
    const llamadas: Llamada[] = [];
    const r = await INV35.correr(
      baseFalsa(
        {
          ingresoVariable: [{ referenciaExterna: "INV-26", concepto: "Fondo de marketing de Insider" }],
          cobro: [cobroDe("INV-26", "Insider"), cobroDe("FAC/2026/0206", "Global Supply")],
        },
        llamadas,
      ),
      AHORA,
    );
    expect(r.ok).toBe(false);
    expect(r.lineas[0]).toContain("1 documento(s) están cargados como cobro y como plata que no es venta");
    expect(r.lineas[0]).toContain("INV-26: «Fondo de marketing de Insider» en Ingresos variables · cobro de Insider");
    // La base falsa ignora el where: que FAC/2026/0206 no aparezca prueba que el invariante vuelve a mirar.
    expect(r.lineas[0]).not.toContain("Global Supply");
    expect(where(llamadas, "ingresoVariable").referenciaExterna).toEqual({ not: null });
    expect(where(llamadas, "cobro").numeroFactura).toEqual({ in: ["INV-26"] });
  });

  it("sin choque cumple; sin referencias ni pregunta por los cobros", async () => {
    const sana = await INV35.correr(
      baseFalsa({ ingresoVariable: [{ referenciaExterna: "INV-27", concepto: "Fondo" }], cobro: [cobroDe("INV-26", "Insider")] }),
      AHORA,
    );
    expect(sana.ok).toBe(true);
    const llamadas: Llamada[] = [];
    expect((await INV35.correr(baseFalsa({ ingresoVariable: [] }, llamadas), AHORA)).ok).toBe(true);
    expect(llamadas.some((l) => l.modelo === "cobro")).toBe(false);
  });
});

describe("cobranza: INV36 (a quién se facturó es una sociedad de la cuenta, etapa 12)", () => {
  const fila = (p: Record<string, unknown>) => ({
    numCuota: 1,
    cuentaId: "inb",
    fechaEmision: hace(10),
    plataformaFactura: "MERCURY",
    cuenta: { client: { name: "Grupo INB" } },
    sociedadFacturada: { odooPartnerNombre: "Quirinale Group", cuentaId: "inb", plataforma: "MERCURY" },
    ...p,
  });

  it("de su cuenta, de su plataforma y facturado cumple; cada rotura sale con el cobro y la sociedad", async () => {
    const llamadas: Llamada[] = [];
    expect((await INV36.correr(baseFalsa({ cobro: [fila({})] }, llamadas), AHORA)).ok).toBe(true);
    expect(where(llamadas, "cobro")).toEqual({ OR: [{ plataformaFactura: { not: null } }, { sociedadFacturadaId: { not: null } }] });

    const r = await INV36.correr(
      baseFalsa({
        cobro: [
          fila({ numCuota: 2, sociedadFacturada: { odooPartnerNombre: "Teamnet Web", cuentaId: "teamnet", plataforma: "MERCURY" } }),
          fila({ numCuota: 3, plataformaFactura: "OTRA" }),
          fila({ numCuota: 4, fechaEmision: null, sociedadFacturada: null }),
        ],
      }),
      AHORA,
    );
    expect(r.ok).toBe(false);
    expect(r.lineas[0]).toContain("3 rotura(s) en a quién se facturó");
    expect(r.lineas[0]).toContain("Grupo INB #2: facturado a «Teamnet Web», que no le factura a esta cuenta");
    expect(r.lineas[0]).toContain("Grupo INB #3: «Quirinale Group» factura por MERCURY y el cobro dice OTRA");
    expect(r.lineas[0]).toContain("Grupo INB #4: dice a quién o dónde se facturó y no está facturado");
  });
});

const RAIZ = process.cwd();
const soloCodigo = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").split(/\r?\n/).filter((l) => !l.trimStart().startsWith("//")).join("\n");
const soloCodigoDe = (rel: string) => soloCodigo(fs.readFileSync(path.join(RAIZ, rel), "utf8"));

describe("tareas: INV38–INV43 (2026-10-09)", () => {
  it("INV38 · una tarea con un cliente distinto al de su proyecto de HubSpot o de tareas viola", async () => {
    const bien = { numero: 1, clientId: "c1", projectId: "p1", project: { clientId: "c1", name: "Onboarding" }, proyecto: { clientId: "c1", projectId: "p1", nombre: "Campaña" } };
    const mal = { numero: 2, clientId: "c2", projectId: "p1", project: { clientId: "c1", name: "Onboarding" }, proyecto: null };
    expect((await INV38.correr(baseFalsa({ tarea: [bien], proyectoDeTareas: [] }), AHORA)).ok).toBe(true);
    const r = await INV38.correr(baseFalsa({ tarea: [bien, mal], proyectoDeTareas: [{ nombre: "SAP", clientId: "c1", project: { clientId: "c9", name: "Otro" } }] }), AHORA);
    expect(r.ok).toBe(false);
    expect(r.lineas[0]).toContain("T-2");
    expect(r.lineas[0]).toContain("Proyecto «SAP»");
  });

  it("INV39 · una tarea en el contenedor «Información del cliente» viola", async () => {
    expect((await INV39.correr(baseFalsa({ tarea: 0, proyectoDeTareas: 0 }), AHORA)).ok).toBe(true);
    expect((await INV39.correr(baseFalsa({ tarea: 1, proyectoDeTareas: 0 }), AHORA)).ok).toBe(false);
  });

  it("INV40 · una tarea abierta en una semana que su responsable ya revisó viola; la de otra persona no", async () => {
    const semana = new Date("2026-10-05T00:00:00Z");
    const cierres = [{ personaEmail: "lidia@x.com", semana }];
    const ok = await INV40.correr(baseFalsa({ tarea: [{ numero: 3, responsableEmail: "ale@x.com", semana }], cierreDeSemana: cierres }), AHORA);
    expect(ok.ok).toBe(true);
    const r = await INV40.correr(baseFalsa({ tarea: [{ numero: 4, responsableEmail: "lidia@x.com", semana }], cierreDeSemana: cierres }), AHORA);
    expect(r.ok).toBe(false);
    expect(r.lineas[0]).toContain("T-4 de lidia@x.com, semana del 2026-10-05");
  });

  it("INV41 · una fusión entre clientes distintos viola; sin cliente de un lado, o de ninguno, no", async () => {
    expect((await INV41.correr(baseFalsa({ tarea: [{ numero: 5, clientId: null, mismaQue: { numero: 1, clientId: null } }] }), AHORA)).ok).toBe(true);
    expect((await INV41.correr(baseFalsa({ tarea: [{ numero: 3, clientId: null, mismaQue: { numero: 1, clientId: "c1" } }, { numero: 4, clientId: "c1", mismaQue: { numero: 2, clientId: null } }] }), AHORA)).ok).toBe(true);
    expect((await INV41.correr(baseFalsa({ tarea: [{ numero: 6, clientId: "c1", mismaQue: { numero: 1, clientId: "c2" } }] }), AHORA)).ok).toBe(false);
  });

  it("INV42 · la cita de una reunión de OTRO cliente viola; una reunión interna o del mismo cliente no", async () => {
    const deWherex = { numero: 7, clientId: "honda", session: { title: "Kickoff Wherex", resolvedClientId: "wherex", manualClientId: null } };
    const interna = { numero: 8, clientId: "honda", session: { title: "Sprint planning", resolvedClientId: "smarteam", manualClientId: null } };
    // La precedencia del chokepoint: resolvedClientId; el manual solo cuando no hay.
    const propia = { numero: 9, clientId: "honda", session: { title: "Semanal Honda", resolvedClientId: null, manualClientId: "honda" } };
    expect((await INV42.correr(baseFalsa({ tarea: [interna, propia], client: [{ id: "smarteam" }] }), AHORA)).ok).toBe(true);
    const r = await INV42.correr(baseFalsa({ tarea: [deWherex, interna], client: [{ id: "smarteam" }] }), AHORA);
    expect(r.ok).toBe(false);
    expect(r.lineas[0]).toContain("T-7");
  });

  it("INV43 · una tarea abierta en un sprint sin personas activas viola; el sprint personal de alguien activo no", async () => {
    const miembros = [{ email: "lidia@x.com", area: "Marketing" }];
    const ok = await INV43.correr(baseFalsa({ teamMember: miembros, tarea: [{ numero: 1, equipo: "marketing" }, { numero: 2, equipo: "persona:lidia@x.com" }] }), AHORA);
    expect(ok.ok).toBe(true);
    const r = await INV43.correr(baseFalsa({ teamMember: miembros, tarea: [{ numero: 3, equipo: "ventas" }, { numero: 4, equipo: "persona:ido@x.com" }] }), AHORA);
    expect(r.ok).toBe(false);
    expect(r.lineas[0]).toContain("2 tarea(s)");
  });
});

describe("la lectura de cada reunión: INV44 (memoria de la cuenta, etapa 2)", () => {
  const TEXTO = "Ana: les mando la base el miércoles. ".repeat(10);
  /** Una reunión de hace 3 días, enriquecida hace 2, con transcripción y del cliente c1. */
  const reunion = (c: Record<string, unknown> = {}) => ({ id: "s1", title: "Semanal Acme", date: hace(3), enrichedAt: hace(2), resolvedClientId: "c1", manualClientId: null, transcript: TEXTO, ...c });
  const clientes = [{ id: "c1", kind: "CLIENTE" }, { id: "p1", kind: "PROSPECTO" }, { id: "a1", kind: "ALIADO" }];

  it("viola: una reunión fresca de un cliente, con transcripción, sin lectura ni minuta", async () => {
    const llamadas: Llamada[] = [];
    const r = await INV44.correr(baseFalsa({ firefliesSession: [reunion()], client: clientes, sessionMinute: [], lecturaDeReunion: [] }, llamadas), AHORA);
    expect(r.ok).toBe(false);
    expect(r.lineas[0]).toContain("«Semanal Acme» (s1)");
    // La forma de la consulta es la mitad del invariante: 14 días, enriquecida hace 24 h o más, con texto y con dueño.
    const w = where(llamadas, "firefliesSession");
    expect(w.AND).toEqual([DONDE_PUEDE_TENER_TEXTO]);
    expect(w.OR).toEqual([{ resolvedClientId: { not: null } }, { manualClientId: { not: null } }]);
  });

  it("cumple con la minuta (la transición y la bandera apagada)", async () => {
    const r = await INV44.correr(baseFalsa({ firefliesSession: [reunion()], client: clientes, sessionMinute: [{ sessionId: "s1" }], lecturaDeReunion: [] }), AHORA);
    expect(r.ok).toBe(true);
  });

  it("cumple con una lectura en error (falló tres veces: se ve en el job, no acá) y con una lista", async () => {
    for (const seguimientoEstado of ["error", "lista", "sin_texto", "copia"]) {
      const r = await INV44.correr(baseFalsa({ firefliesSession: [reunion()], client: clientes, sessionMinute: [], lecturaDeReunion: [{ sessionId: "s1", seguimientoEstado }] }), AHORA);
      expect(r.ok, seguimientoEstado).toBe(true);
    }
    // En la cola todavía no cuenta: a las 24 h tendría que haber terminado.
    const enCola = await INV44.correr(baseFalsa({ firefliesSession: [reunion()], client: clientes, sessionMinute: [], lecturaDeReunion: [{ sessionId: "s1", seguimientoEstado: "en_espera" }] }), AHORA);
    expect(enCola.ok).toBe(false);
  });

  it("un prospecto cuenta; un aliado, una reunión de hace 15 días, una enriquecida hace menos de 24 h o sin transcripción de verdad, no", async () => {
    const prospecto = await INV44.correr(baseFalsa({ firefliesSession: [reunion({ resolvedClientId: "p1" })], client: clientes, sessionMinute: [], lecturaDeReunion: [] }), AHORA);
    expect(prospecto.ok).toBe(false);
    for (const [motivo, fila] of [
      ["aliado", reunion({ resolvedClientId: "a1" })],
      ["15 días", reunion({ date: hace(15) })],
      ["recién enriquecida", reunion({ enrichedAt: hace(0.5) })],
      ["transcripción corta", reunion({ transcript: "hola" })],
    ] as const) {
      const r = await INV44.correr(baseFalsa({ firefliesSession: [fila], client: clientes, sessionMinute: [], lecturaDeReunion: [] }), AHORA);
      expect(r.ok, motivo).toBe(true);
    }
  });

  it("T2: una reunión con SOLO notas de Gemini también se espera, salvo con las notas y los hechos apagados", async () => {
    const soloNotas = reunion({ transcript: null, summary: { overview: TEXTO.repeat(2) } });
    const cortas = reunion({ transcript: null, summary: { overview: "Resumen corto." } });
    const correr = (fila: Record<string, unknown>) => INV44.correr(baseFalsa({ firefliesSession: [fila], client: clientes, sessionMinute: [], lecturaDeReunion: [] }), AHORA);
    vi.stubEnv("SEGUIMIENTO_SOLO_NOTAS", "");
    vi.stubEnv("SEGUIMIENTO_HECHOS", "");
    try {
      expect((await correr(soloNotas)).ok, "con las notas prendidas (por defecto) se espera su lectura").toBe(false);
      expect((await correr(cortas)).ok, "unas notas bajo el piso no son texto").toBe(true);
      vi.stubEnv("SEGUIMIENTO_SOLO_NOTAS", "0");
      expect((await correr(soloNotas)).ok, "con las notas y los hechos apagados nadie la lee: no se espera").toBe(true);
      vi.stubEnv("SEGUIMIENTO_HECHOS", "1");
      expect((await correr(soloNotas)).ok, "con los hechos prendidos la cola la toma: se espera").toBe(false);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("una reunión de puertas adentro (solo estuvo el equipo) no se espera, aunque su dueño sea un cliente", async () => {
    const categorias = [{ domains: ["smarteamcr.com"], kind: "internal" }];
    const interna = reunion({ participants: ["marco@smarteamcr.com", "lidia@smarteamcr.com"], organizerEmail: "marco@smarteamcr.com" });
    const r = await INV44.correr(baseFalsa({ firefliesSession: [interna], sessionCategory: categorias, client: clientes, sessionMinute: [], lecturaDeReunion: [] }), AHORA);
    expect(r.ok).toBe(true);
    const conElCliente = reunion({ participants: ["marco@smarteamcr.com", "ana@acme.com"] });
    expect((await INV44.correr(baseFalsa({ firefliesSession: [conElCliente], sessionCategory: categorias, client: clientes, sessionMinute: [], lecturaDeReunion: [] }), AHORA)).ok).toBe(false);
  });

  it("el remedio nombra lo que existe: «Leer esta reunión» en su página y el script de la cola", async () => {
    const r = await INV44.correr(baseFalsa({ firefliesSession: [reunion()], client: clientes, sessionMinute: [], lecturaDeReunion: [] }), AHORA);
    expect(r.lineas[0]).toContain("«Leer esta reunión»");
    expect(r.lineas[0]).toContain("scripts/encolar-lecturas-pendientes.ts");
    expect(fs.existsSync(path.join(RAIZ, "scripts/encolar-lecturas-pendientes.ts"))).toBe(true);
    expect(r.lineas[0]).not.toContain("«Generar minuta»");
  });

  it("INV46 · un pedido fuera de alcance de una reunión de OTRO cliente viola; uno descartado, del mismo cliente o de una reunión interna, no", async () => {
    const deWherex = { id: "pf1", clientId: "honda", pedido: "Integrar DocuSign", estado: "PEDIDO", session: { title: "Kickoff Wherex", resolvedClientId: "wherex", manualClientId: null } };
    const descartado = { ...deWherex, id: "pf2", estado: "DESCARTADO" };
    const propio = { id: "pf3", clientId: "honda", pedido: "App móvil", estado: "CONFIRMADO", session: { title: "Semanal Honda", resolvedClientId: null, manualClientId: "honda" } };
    const interna = { id: "pf4", clientId: "honda", pedido: "Otro", estado: "PEDIDO", session: { title: "Sprint", resolvedClientId: "smarteam", manualClientId: null } };
    expect((await INV46.correr(baseFalsa({ pedidoFueraDeAlcance: [descartado, propio, interna], client: [{ id: "smarteam" }] }), AHORA)).ok).toBe(true);
    const r = await INV46.correr(baseFalsa({ pedidoFueraDeAlcance: [deWherex, propio], client: [{ id: "smarteam" }] }), AHORA);
    expect(r.ok).toBe(false);
    expect(r.lineas[0]).toContain("pf1");
  });

  it("sin las columnas de la cola (falta el SQL) mira solo la minuta, y lo dice", async () => {
    const base = baseFalsa({ firefliesSession: [reunion()], client: clientes, sessionMinute: [{ sessionId: "s1" }] });
    const sinColumnas = new Proxy(base, {
      get: (t, m) =>
        m === "lecturaDeReunion"
          ? { findMany: async () => Promise.reject(Object.assign(new Error("The column `seguimientoEstado` does not exist in the current database."), { code: "P2022" })) }
          : (t as unknown as Record<string | symbol, unknown>)[m],
    }) as PrismaClient;
    const r = await INV44.correr(sinColumnas, AHORA);
    expect(r.ok).toBe(true);
    expect(r.lineas[0]).toContain("se mira solo la minuta");
  });
});

describe("hechos: INV45 (memoria de la cuenta, etapa 6)", () => {
  const sesion = (dueno: string | null, manual: string | null = null) => ({ title: "Seguimiento", resolvedClientId: dueno, manualClientId: manual });
  const hecho = (o: Partial<Record<string, unknown>> = {}) => ({
    id: "h1",
    clientId: "c1",
    projectId: null,
    sessionId: "s1",
    estado: "pendiente",
    frase: "El cliente sigue sus cotizaciones en Excel",
    client: { kind: "CLIENTE" },
    project: null,
    session: sesion("c1"),
    ...o,
  });

  it("un hecho del cliente de su reunión (o del manual, si no hay resolución) cumple", async () => {
    expect((await INV45.correr(baseFalsa({ hechoDeReunion: [hecho(), hecho({ id: "h2", session: sesion(null, "c1") })] }), AHORA)).ok).toBe(true);
  });

  it("⛔ un hecho de una reunión de OTRO cliente viola (la precedencia del chokepoint: resolvedClientId gana)", async () => {
    const r = await INV45.correr(baseFalsa({ hechoDeReunion: [hecho({ session: sesion("c2", "c1") })] }), AHORA);
    expect(r.ok).toBe(false);
    expect(r.lineas.join("\n")).toContain("que es de otro cliente");
  });

  it("⛔ un hecho de un proyecto de otro cliente viola; uno de una reunión que alguien desvinculó del proyecto no (es del mismo cliente: los lectores ya no la ven)", async () => {
    const delProyecto = hecho({ projectId: "p1", project: { clientId: "c1" } });
    expect((await INV45.correr(baseFalsa({ hechoDeReunion: [delProyecto] }), AHORA)).ok).toBe(true);
    const ajeno = await INV45.correr(baseFalsa({ hechoDeReunion: [hecho({ projectId: "p9", project: { clientId: "c2" } })] }), AHORA);
    expect(ajeno.ok).toBe(false);
    expect(ajeno.lineas.join("\n")).toContain("de un proyecto de otro cliente");
  });

  it("⛔ un hecho de una empresa de Smarteam o de un aliado viola", async () => {
    expect((await INV45.correr(baseFalsa({ hechoDeReunion: [hecho({ client: { kind: "INTERNO" } })] }), AHORA)).ok).toBe(false);
    expect((await INV45.correr(baseFalsa({ hechoDeReunion: [hecho({ client: { kind: "ALIADO" } })] }), AHORA)).ok).toBe(false);
  });

  it("solo cuenta lo vivo: un desestimado (se retiró al cambiar de dueño) o un usado (ya lo decidió una persona) no; la consulta los deja afuera", async () => {
    const llamadas: Llamada[] = [];
    const r = await INV45.correr(
      baseFalsa({ hechoDeReunion: [hecho({ estado: "desestimado", session: sesion("c2") }), hecho({ id: "h2", estado: "usado", session: sesion("c2") })] }, llamadas),
      AHORA,
    );
    expect(r.ok).toBe(true);
    expect(where(llamadas, "hechoDeReunion")).toEqual({ estado: "pendiente" });
  });

  it("el remedio dice lo que se puede hacer de verdad: corregir el dueño, o el script que retira los hechos", async () => {
    const r = await INV45.correr(baseFalsa({ hechoDeReunion: [hecho({ session: sesion("c2") })] }), AHORA);
    expect(r.lineas.join("\n")).toContain("scripts/hechos-fuera-de-su-cliente.ts");
  });

  it("sin la tabla: «no aplica todavía»", async () => {
    const sinTabla = new Proxy({}, { get: () => ({ findMany: async () => { throw Object.assign(new Error("The table `public.HechoDeReunion` does not exist in the current database."), { code: "P2021" }); } }) }) as unknown as PrismaClient;
    const r = await INV45.correr(sinTabla, AHORA);
    expect(r.ok).toBe(true);
    expect(r.lineas[0]).toContain("no aplica todavía");
  });
});

describe("el registro y el consumidor", () => {

  it("el registro tiene los 49 solo-base, con ids únicos y en el orden del gate", () => {
    /* Del 28 salta al 30: INV29 lo reserva docs/database-refactoring-plan.md. 31 y 32 son las frescuras (espejo y corte);
       33 y 34, el número de factura (etapa 7); 35, la plata que no es venta (etapa 10); 36, a quién se facturó (etapa 12); 37, dos clientes con un dominio (2026-10-02). */
    expect(INVARIANTES_SOLO_BASE.map((i) => i.id)).toEqual([
      "1", "3", "5", "8", "8c", "10", "11", "14", "18", "20", "21", "22", "23", "24", "25", "26", "27", "28", "30", "31", "32",
      "33", "34", "35", "36", "37",
      // 38–43: Tareas internas (2026-10-09).
      "38", "39", "40", "41", "42", "43",
      // 44: la lectura de cada reunión (memoria de la cuenta, etapa 2); 45, los hechos de las reuniones (etapa 6); 46,
      // los pedidos fuera de alcance de una reunión de otro cliente (el gemelo de INV42); 47, ninguna reunión reciente con
      // texto sin empresa (T1, 2026-10-24). 48 vive en el script.
      "44", "45", "46", "47",
      // 49 a 60 (2026-10-25 y 26): 49, la frescura de la copia de Meet (U1); 50, Partner y la comisión de HubSpot (U25,
      // U29); 51, cada documento con dueño y ninguna persona del cliente del equipo (la empresa, parte 2); 52, el motivo de
      // cada reunión sin texto (T4); 53, las conferencias de Meet revisadas (U3); 54, ninguna ficha con una empresa de
      // HubSpot fusionada (U9); 55, SmartLoop sin «proyecto_temporal» (M1); 56, cada investigación de la empresa de su
      // preventa (R5); 57, cada análisis de venta de la empresa de su reunión (S3); 58, los tests llegan a HubSpot (área
      // O); 59, ninguna escala publicada con preguntas abiertas (N); 60, la copia del banco de Odoo al día (U15); 61, ninguna
      // sesión de una exploración unida a una reunión de otra empresa (K5, 2026-10-27).
      "49", "50", "51", "52", "53", "54", "55", "56", "57", "58", "59", "60", "61",
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
    await expect(correrJobDeInvariantes(baseFalsa({}), AHORA)).resolves.toBe("49 invariantes solo-base en verde");
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
    expect(src, "el 503 lo decide solo el `ok`").toContain("status: ok ? 200 : 503");
    /* Tres cosas apagan el `ok`, y las tres son «este contenedor no puede atender»: la base no
       responde, el cliente Prisma es de otra imagen, o a la base le falta algo que este código usa
       (2026-09-30: el esquema atrasado, con sus propias guardas en lib/db/salud-del-esquema.test.ts).
       Un invariante en rojo no es ninguna de las tres. */
    expect((src.match(/ok = false/g) ?? []).length, "solo los tres checks de infraestructura apagan el ok").toBe(3);
    expect(src).not.toMatch(/invariantesOk\s*(&&|\|\||\?)/);
    expect(src).not.toMatch(/\.(lineas|error|resultados)\b/);
  });
});

describe("INV61 (las sesiones de una exploración y su empresa, K5)", () => {
  it("verde si cada reunión de una sesión es de la empresa (o sin dueña); rojo si es de otra", async () => {
    const exploracion = (sessionId: string) => ({ id: "e1", clientId: "c1", contenido: { sesiones: [{ id: "s-1", reunion: { origen: "meet", id: sessionId } }, { id: "s-2" }] } });
    expect((await INV61.correr(baseFalsa({ exploracionDeVenta: [] }), AHORA)).ok).toBe(true);
    const propia = { id: "m1", title: "Exploración Marketing", resolvedClientId: "c1", manualClientId: null };
    const sinDuena = { id: "m1", title: "Exploración", resolvedClientId: null, manualClientId: null };
    const aMano = { id: "m1", title: "Kickoff", resolvedClientId: "c2", manualClientId: "c1" };
    for (const r of [propia, sinDuena, aMano]) {
      expect((await INV61.correr(baseFalsa({ exploracionDeVenta: [exploracion("m1")], firefliesSession: [r] }), AHORA)).ok).toBe(true);
    }
    const soloAMano = { id: "m1", title: "Puesta a mano en otra", resolvedClientId: null, manualClientId: "c2" };
    expect((await INV61.correr(baseFalsa({ exploracionDeVenta: [exploracion("m1")], firefliesSession: [soloAMano] }), AHORA)).ok).toBe(false);
    const ajena = { id: "m1", title: "Exploración de OTRA", resolvedClientId: "c2", manualClientId: null };
    const r = await INV61.correr(baseFalsa({ exploracionDeVenta: [exploracion("m1")], firefliesSession: [ajena] }), AHORA);
    expect(r.ok).toBe(false);
    expect(r.lineas.join(" ")).toContain("Exploración de OTRA");
  });
});

describe("INV56 (la investigación de una preventa)", () => {
  it("una investigación colgada de una empresa distinta a la de su preventa la pone en rojo", async () => {
    const propia = { id: "i1", clientId: "c1", exploracion: { clientId: "c1" } };
    const cruzada = { id: "i2", clientId: "c1", exploracion: { clientId: "c2" } };
    expect((await INV56.correr(baseFalsa({ investigacionDeEmpresa: [propia] }), AHORA)).ok).toBe(true);
    const r = await INV56.correr(baseFalsa({ investigacionDeEmpresa: [propia, cruzada] }), AHORA);
    expect(r.ok).toBe(false);
    expect(r.lineas[0]).toContain("i2");
  });
});

describe("INV51 (la empresa, parte 2)", () => {
  it("un documento sin dueño o una persona del cliente que es del equipo lo ponen en rojo", async () => {
    const equipo = [{ email: "Eli@Smarteamcr.com" }];
    expect((await INV51.correr(baseFalsa({ teamMember: equipo, projectCanvas: 0, personaDeLaEmpresa: 0 }), AHORA)).ok).toBe(true);
    expect((await INV51.correr(baseFalsa({ teamMember: equipo, projectCanvas: 2, personaDeLaEmpresa: 0 }), AHORA)).lineas[0]).toContain("2 documento(s) sin dueño");
    const llamadas: Llamada[] = [];
    const r = await INV51.correr(baseFalsa({ teamMember: equipo, projectCanvas: 0, personaDeLaEmpresa: 1 }, llamadas), AHORA);
    expect(r.ok).toBe(false);
    expect(where(llamadas, "personaDeLaEmpresa", "count")).toEqual({ correo: { in: ["eli@smarteamcr.com"] }, vigente: true });
  });

  it("sin el SQL de la parte 2 dice qué archivo falta, en vez de cortar el gate", async () => {
    const sinTabla = Object.assign(new Error("The table `public.PersonaDeLaEmpresa` does not exist in the current database."), { code: "P2021" });
    const base = new Proxy({}, {
      get: (_, modelo) => ({
        findMany: async () => [{ email: "a@b.com" }],
        count: async () => {
          if (modelo === "personaDeLaEmpresa") throw sinTabla;
          return 0;
        },
      }),
    }) as unknown as Parameters<typeof INV51.correr>[0];
    const r = await INV51.correr(base, AHORA);
    expect(r.ok).toBe(false);
    expect(r.lineas[0]).toContain("2026-10-25-empresa-parte-2.sql");
  });
});

describe("frescura: INV49 (la copia de Google Meet)", () => {
  /* Medido el 2026-10-24 (sábado): la última copia buena tenía casi dos horas, porque solo corría al abrir la app. */
  const haceMin = (m: number) => new Date(AHORA.getTime() - m * 60_000).toISOString();
  const turno = (lastResult: unknown) => ({ cronJobState: [{ id: "google-auto-sync", lastResult }] });

  it("a 50 min cumple; a 61 min viola con la fecha, cuánto hace y el remedio", async () => {
    /* La edición que lo pone en rojo: mirar `at` de la última corrida en vez de la última BUENA. */
    expect((await INV49.correr(baseFalsa(turno({ ok: true, at: haceMin(50), ultimaBuena: haceMin(50) })), AHORA)).ok).toBe(true);
    const vieja = await INV49.correr(baseFalsa(turno({ ok: true, at: haceMin(61), ultimaBuena: haceMin(61) })), AHORA);
    expect(vieja.ok).toBe(false);
    expect(vieja.lineas[0]).toContain("(hace 61 min)");
    expect(vieja.lineas[0]).toContain("google-meet-sync");
  });

  it("una corrida que acaba de fallar no la deja al día: cuenta la última BUENA", async () => {
    const r = await INV49.correr(baseFalsa(turno({ ok: false, at: haceMin(5), ultimaBuena: haceMin(180) })), AHORA);
    expect(r.ok).toBe(false);
    expect(r.lineas[0]).toContain("(hace 3 h)");
  });

  it("una fila de antes de U1 cuenta por su `at` si terminó bien; corrió y nunca bien viola; sin fila cumple", async () => {
    expect((await INV49.correr(baseFalsa(turno({ ok: true, at: haceMin(10) })), AHORA)).ok).toBe(true);
    const nunca = await INV49.correr(baseFalsa(turno({ ok: false, at: haceMin(10), error: "x" })), AHORA);
    expect(nunca.ok).toBe(false);
    expect(nunca.lineas[0]).toContain("ninguna corrida anotada terminó bien");
    expect((await INV49.correr(baseFalsa({}), AHORA)).ok, "sin copia no hay copia vieja").toBe(true);
  });
});

describe("SmartLoop: INV55 (2026-10-25, M1)", () => {
  it("sin proyectos de SmartLoop con «proyecto_temporal», cumple; con alguno lo lista, y no bloquea hasta su primer verde", async () => {
    const llamadas: Llamada[] = [];
    expect((await INV55.correr(baseFalsa({ project: [] }, llamadas), AHORA)).ok).toBe(true);
    // Mira solo los activos del pipeline de SmartLoop con el tipo temporal.
    expect(where(llamadas, "project")).toMatchObject({ status: "active", serviceType: "proyecto_temporal", hubspotPipelineId: { in: ["942509592"] } });
    const r = await INV55.correr(baseFalsa({ project: [{ id: "p1", name: "CONTINUIDAD CRM", client: { name: "RC Inmobiliaria" } }] }), AHORA);
    expect(r.ok).toBe(!INV55_BLOQUEA);
    expect(r.lineas[0]).toContain("1 proyecto de SmartLoop dice");
    expect(r.lineas[1]).toContain("RC Inmobiliaria › CONTINUIDAD CRM");
  });
});

describe("el test del diagnóstico: INV58 (2026-10-26, área O)", () => {
  const atascado = { id: "t1", email: "ana@acme.com", area: "1", estado: "terminado", hubspotError: "El contacto todavía no está en HubSpot", createdAt: AHORA };

  it("sin intentos atascados cumple; mira solo los de más de 3 horas a los que les falta el formulario o la nota", async () => {
    const llamadas: Llamada[] = [];
    expect((await INV58.correr(baseFalsa({ intentoDelTest: [] }, llamadas), AHORA)).ok).toBe(true);
    const w = where(llamadas, "intentoDelTest") as { createdAt: { lt: Date }; OR: unknown[] };
    expect(w.createdAt.lt.getTime()).toBe(AHORA.getTime() - 3 * 3_600_000);
    expect(w.OR).toEqual([{ hubspotFormAt: null }, { hubspotNotaAt: null, estado: { in: ["terminado", "abandonado"] } }]);
  });

  it("con el envío apagado avisa sin fallar; prendido, lista el error y no bloquea hasta su primer verde", async () => {
    const antes = process.env.TESTS_HUBSPOT_ENABLED;
    try {
      delete process.env.TESTS_HUBSPOT_ENABLED;
      const apagado = await INV58.correr(baseFalsa({ intentoDelTest: [atascado] }), AHORA);
      expect(apagado.ok).toBe(true);
      expect(apagado.lineas[0]).toContain("apagado");
      process.env.TESTS_HUBSPOT_ENABLED = "1";
      const prendido = await INV58.correr(baseFalsa({ intentoDelTest: [atascado] }), AHORA);
      expect(prendido.ok).toBe(!INV58_BLOQUEA);
      expect(prendido.lineas.join("\n")).toContain("ana@acme.com · área 1 · terminado — El contacto todavía no está en HubSpot");
    } finally {
      if (antes === undefined) delete process.env.TESTS_HUBSPOT_ENABLED;
      else process.env.TESTS_HUBSPOT_ENABLED = antes;
    }
  });
});

describe("frescura: INV53 (la revisión de las conferencias de Meet)", () => {
  /* Google borra las frases a los 30 días: una reunión de 3 a 25 días sin cerrar es una que el job no está mirando. */
  const job = { id: "google-meet-conferencias" };

  it("sin el job en esta base cumple; con reuniones abiertas viola con cuáles y el remedio", async () => {
    expect((await INV53.correr(baseFalsa({ firefliesSession: 3 }), AHORA)).ok, "nunca corrió: no hay atraso del que avisar").toBe(true);
    const abiertas = [{ id: "s1", title: "Camosa l Exploración", date: hace(10) }];
    const r = await INV53.correr(baseFalsa({ cronJobState: [job], firefliesSession: abiertas }), AHORA);
    expect(r.ok).toBe(false);
    expect(r.lineas[0]).toContain("1 reunión(es)");
    expect(r.lineas.join("\n")).toContain("«Camosa l Exploración»");
    expect(r.lineas.join("\n")).toContain("google-meet-conferencias");
  });

  it("mira solo las de 3 a 25 días, sin cerrar, con código de Meet", async () => {
    const llamadas: Llamada[] = [];
    const r = await INV53.correr(baseFalsa({ cronJobState: [job], firefliesSession: [] }, llamadas), AHORA);
    expect(r.ok).toBe(true);
    const w = where(llamadas, "firefliesSession", "count") as { conferenciaCerradaEn: null; conferenceId: unknown; date: { gte: Date; lte: Date } };
    expect(w.conferenciaCerradaEn).toBeNull();
    expect(w.conferenceId).toEqual({ not: null });
    expect(w.date.gte.toISOString()).toBe(hace(25).toISOString());
    expect(w.date.lte.toISOString()).toBe(hace(3).toISOString());
  });
});

describe("la escala: INV59 (ninguna publicada trae «Lo que falta decidir»)", () => {
  const parte = (titulo: string) => ({ tipo: "prosa", bloques: [{ tipo: "titulo", nivel: 1, texto: titulo }] });
  const version = (v: string, titulos: string[]) => ({ version: v, datos: { partes: titulos.map(parte) } });

  it("una publicada con la parte del borrador viola, con su versión; sin ella cumple; mira solo las publicadas", async () => {
    const llamadas: Llamada[] = [];
    const bien = await INV59.correr(baseFalsa({ escalaVersion: [version("8.9.1", ["Cómo leer este documento", "Parte 1 — Qué es la escala"])] }, llamadas), AHORA);
    expect(bien.ok).toBe(true);
    expect(where(llamadas, "escalaVersion")).toEqual({ estado: "publicada" });
    const mal = await INV59.correr(baseFalsa({ escalaVersion: [version("9.0.0", ["Cómo leer este documento", "Borrador 9.0.0 — Lo que falta decidir"])] }), AHORA);
    expect(mal.ok).toBe(false);
    expect(mal.lineas[0]).toContain("9.0.0");
  });
});
