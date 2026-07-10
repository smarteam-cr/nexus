/**
 * lib/cobranza/engine.test.ts
 *
 * Tests del MOTOR PURO de Cobranza (lib/cobranza/engine.ts — sin DB ni red).
 * Casos:
 *   A) expandPlanCuotas PAREJO:
 *      A1 canónico 1000/3 → 333.33+333.33+333.34, suma EXACTA, offsets mensuales.
 *      A2 numCuotas precede a duracionMeses; sin numCuotas cae a duracionMeses.
 *      A3 numCuotas y duracionMeses null → PlanInvalidoError.
 *      A4 residuo negativo (100/6): la última cuota absorbe hacia abajo.
 *   B) expandPlanCuotas ENTRADA_Y_RESTO:
 *      B1 entrada 50% + resto en 3: numeración/offsets corridos y suma EXACTA.
 *      B2 inválidos → PlanInvalidoError (sin orden 1, valor 0/100, MONTO_FIJO, sin numCuotas).
 *   C) expandPlanCuotas SUSCRIPCION:
 *      C1 rolling: monthsBetween(inicio, hoy) + horizonte cuotas, monto mensual c/u.
 *      C2 arranque futuro → horizonte+1 cuotas; horizonMeses override respeta.
 *      C3 sin fechaInicioFacturacion → [].
 *   D) expandPlanCuotas PERSONALIZADO:
 *      D1 mapea PORCENTAJE/MONTO_FIJO ordenado por orden, sin invariante de suma.
 *      D2 cero cuotas → PlanInvalidoError.
 *   E) cobroDateFor:
 *      E1 sin ancla → día del arranque + periodo del mes destino.
 *      E2 clamp: día 31 en febrero → 28; el clamp NO se arrastra (marzo vuelve a 31).
 *      E3 bisiesto: día 31 en febrero 2028 → 29.
 *      E4 cruce de año: noviembre + 3 meses → febrero del año siguiente.
 *      E5 ISO completo se normaliza a fecha de calendario UTC.
 *   F) materializeCobros:
 *      F1 sin fechaInicioFacturacion → [] (cero fabricación).
 *      F2 composición PAREJO: fechas clampeadas, periodos y montos por cuota.
 *      F3 diaCobroAncla aplica desde la cuota 1 (mes de arranque).
 *   G) reconcileCobros (idempotencia):
 *      G1 sin existentes → todo a toCreate.
 *      G2 re-run con drafts idénticos → toCreate/toUpdate/toDelete VACÍOS.
 *      G3 PROGRAMADO con fecha o monto distinto → toUpdate con el payload del draft.
 *      G4 intocables colisionantes (COBRADO / fechaEmision / MANUAL) → untouched, draft descartado.
 *      G5 plan achicado: PROGRAMADO PLAN/CATCH_UP sin draft → toDelete; COBRADO → untouched.
 *      G6 existente con numCuota null → untouched SIEMPRE (nunca update/delete).
 *   H) splitCatchUp:
 *      H1 estrictamente < hoy → catchUp; == hoy y > hoy → regulares.
 *   I) semáforos:
 *      I1 COBRADO → verde aunque esté vencido.
 *      I2 borde del umbral: exactamente umbral días pasados NO es rojo; umbral+1 sí.
 *      I3 no vencidos: POR_COBRAR → amarillo, PROGRAMADO futuro → gris.
 *      I4 umbral custom cambia el corte del rojo.
 *      I5 semaforoCuenta: el peor gana (rojo>amarillo>gris>verde); lista vacía → verde.
 *   J) computeAlertSet:
 *      J1 cuenta excluidaOperacion → CERO alertas aunque haya de todo.
 *      J2 tieneCuenta=false → exactamente 1 CUENTA_SIN_DATOS (media) y corta la evaluación.
 *      J3 cuenta sin servicios → CUENTA_SIN_DATOS a nivel cuenta.
 *      J4 servicio ACTIVO sin fechaInicio → CUENTA_SIN_DATOS por servicio; no-ACTIVO no alerta.
 *      J5 fechaInicio ≠ anchor (calendario) → ARRANQUE_CAMBIADO (alta); igual calendario o sin anchor → nada.
 *      J6 bordes vencido/próximo: +4 días → VENCIDO; +3 y -15 → PROXIMO; -16 → nada.
 *      J7 cobro COBRADO → ninguna alerta.
 *      J8 CATCH_UP PROGRAMADO → INCONSISTENCIA_CICLO ADEMÁS del vencido; CATCH_UP no-PROGRAMADO no.
 *      J9 dedupeKey estable: mismo input dos veces → mismas keys.
 *   K) diffAlertSets:
 *      K1 nuevas/resueltas/persistentes por dedupeKey.
 *      K2 sin cambios → sinCambios true (también con ambos sets vacíos).
 *
 * Correr: `npx vitest run lib/cobranza/engine.test.ts --project unit`.
 */
import { test, expect } from "vitest";
import {
  expandPlanCuotas,
  cobroDateFor,
  materializeCobros,
  reconcileCobros,
  splitCatchUp,
  semaforoCobro,
  semaforoCuenta,
  computeAlertSet,
  diffAlertSets,
  PlanInvalidoError,
} from "./engine";
import type {
  ServicioEngineInput,
  PlanEngineInput,
  CobroDraft,
  CobroExistente,
  CarteraEngineInput,
  AlertaDraft,
} from "./engine";

const HOY = "2026-07-10";

// ── Factories ────────────────────────────────────────────────────────────────────

function servicio(over: Partial<ServicioEngineInput> = {}): ServicioEngineInput {
  return {
    id: "srv1",
    montoTotal: 1000,
    moneda: "USD",
    fechaInicioFacturacion: "2026-01-15",
    duracionMeses: null,
    diaCobroAncla: null,
    ...over,
  };
}

function plan(over: Partial<PlanEngineInput> = {}): PlanEngineInput {
  return { template: "PAREJO", numCuotas: null, cuotas: [], ...over };
}

function draft(over: Partial<CobroDraft> = {}): CobroDraft {
  return { numCuota: 1, periodo: "2026-01", fechaProgramadaISO: "2026-01-15", monto: 333.33, ...over };
}

function existente(over: Partial<CobroExistente> = {}): CobroExistente {
  return {
    id: "e1",
    numCuota: 1,
    estado: "PROGRAMADO",
    origen: "PLAN",
    fechaEmision: null,
    fechaProgramadaISO: "2026-01-15",
    monto: 333.33,
    ...over,
  };
}

type Cuenta = CarteraEngineInput["cuentas"][number];
type ServicioCartera = Cuenta["servicios"][number];
type CobroCartera = Cuenta["cobros"][number];

function cuenta(over: Partial<Cuenta> = {}): Cuenta {
  return {
    cuentaId: "c1",
    clienteNombre: "Acme",
    excluidaOperacion: false,
    tieneCuenta: true,
    servicios: [],
    cobros: [],
    ...over,
  };
}

function servicioCartera(over: Partial<ServicioCartera> = {}): ServicioCartera {
  return {
    servicioId: "s1",
    descripcion: null,
    estado: "ACTIVO",
    fechaInicioFacturacion: "2026-03-01",
    anchorActualISO: null,
    ...over,
  };
}

function cobroCartera(over: Partial<CobroCartera> = {}): CobroCartera {
  return {
    cobroId: "co1",
    servicioId: "s1",
    estado: "POR_COBRAR",
    origen: "PLAN",
    fechaProgramadaISO: "2026-07-20",
    monto: 100,
    ...over,
  };
}

/** Suma en CENTAVOS (evita el epsilon de sumar floats): exactitud al centavo. */
const sumCents = (cuotas: Array<{ monto: number }>) =>
  cuotas.reduce((s, c) => s + Math.round(c.monto * 100), 0);

const keysOf = (alertas: AlertaDraft[]) => alertas.map((a) => a.dedupeKey).sort();

// ── A) PAREJO ────────────────────────────────────────────────────────────────────

test("A1 — PAREJO canónico 1000/3: 333.33+333.33+333.34, suma exacta y offsets mensuales", () => {
  const cuotas = expandPlanCuotas(servicio({ montoTotal: 1000 }), plan({ numCuotas: 3 }), { todayISO: HOY });
  expect(cuotas.map((c) => c.monto)).toEqual([333.33, 333.33, 333.34]);
  expect(cuotas.map((c) => c.numCuota)).toEqual([1, 2, 3]);
  expect(cuotas.map((c) => c.offsetMeses)).toEqual([0, 1, 2]);
  expect(sumCents(cuotas)).toBe(100000); // invariante: suma EXACTA === montoTotal
});

test("A2 — PAREJO: numCuotas precede a duracionMeses; sin numCuotas cae a duracionMeses", () => {
  const conAmbos = expandPlanCuotas(
    servicio({ montoTotal: 1000, duracionMeses: 6 }),
    plan({ numCuotas: 4 }),
    { todayISO: HOY },
  );
  expect(conAmbos).toHaveLength(4);
  expect(conAmbos.every((c) => c.monto === 250)).toBe(true);

  const soloDuracion = expandPlanCuotas(
    servicio({ montoTotal: 600, duracionMeses: 6 }),
    plan({ numCuotas: null }),
    { todayISO: HOY },
  );
  expect(soloDuracion).toHaveLength(6);
  expect(soloDuracion.every((c) => c.monto === 100)).toBe(true);
});

test("A3 — PAREJO sin numCuotas NI duracionMeses → PlanInvalidoError", () => {
  expect(() =>
    expandPlanCuotas(servicio({ duracionMeses: null }), plan({ numCuotas: null }), { todayISO: HOY }),
  ).toThrow(PlanInvalidoError);
});

test("A4 — PAREJO residuo negativo (100/6): la última cuota absorbe hacia abajo", () => {
  const cuotas = expandPlanCuotas(servicio({ montoTotal: 100 }), plan({ numCuotas: 6 }), { todayISO: HOY });
  expect(cuotas.map((c) => c.monto)).toEqual([16.67, 16.67, 16.67, 16.67, 16.67, 16.65]);
  expect(sumCents(cuotas)).toBe(10000);
});

// ── B) ENTRADA_Y_RESTO ───────────────────────────────────────────────────────────

test("B1 — ENTRADA_Y_RESTO 50% + resto en 3: numeración corrida, residuo en la última, suma exacta", () => {
  const cuotas = expandPlanCuotas(
    servicio({ montoTotal: 1000 }),
    plan({
      template: "ENTRADA_Y_RESTO",
      numCuotas: 3,
      cuotas: [{ orden: 1, base: "PORCENTAJE", valor: 50, offsetMeses: 0 }],
    }),
    { todayISO: HOY },
  );
  expect(cuotas).toHaveLength(4); // entrada + 3 mensualidades
  expect(cuotas[0]).toMatchObject({ numCuota: 1, offsetMeses: 0, monto: 500, descripcion: "Entrada 50%" });
  expect(cuotas.slice(1).map((c) => c.monto)).toEqual([166.67, 166.67, 166.66]);
  expect(cuotas.slice(1).map((c) => c.numCuota)).toEqual([2, 3, 4]);
  expect(cuotas.slice(1).map((c) => c.offsetMeses)).toEqual([1, 2, 3]);
  expect(sumCents(cuotas)).toBe(100000);
});

test("B2 — ENTRADA_Y_RESTO inválido → PlanInvalidoError (sin orden 1, valor fuera de rango, MONTO_FIJO, sin numCuotas)", () => {
  const base = { todayISO: HOY };
  // Sin cuota orden 1
  expect(() =>
    expandPlanCuotas(servicio(), plan({ template: "ENTRADA_Y_RESTO", numCuotas: 3, cuotas: [] }), base),
  ).toThrow(PlanInvalidoError);
  // valor 0 y 100 (el rango es abierto: 0 < x < 100)
  for (const valor of [0, 100]) {
    expect(() =>
      expandPlanCuotas(
        servicio(),
        plan({
          template: "ENTRADA_Y_RESTO",
          numCuotas: 3,
          cuotas: [{ orden: 1, base: "PORCENTAJE", valor, offsetMeses: 0 }],
        }),
        base,
      ),
    ).toThrow(PlanInvalidoError);
  }
  // Entrada MONTO_FIJO
  expect(() =>
    expandPlanCuotas(
      servicio(),
      plan({
        template: "ENTRADA_Y_RESTO",
        numCuotas: 3,
        cuotas: [{ orden: 1, base: "MONTO_FIJO", valor: 200, offsetMeses: 0 }],
      }),
      base,
    ),
  ).toThrow(PlanInvalidoError);
  // Sin numCuotas para el resto
  expect(() =>
    expandPlanCuotas(
      servicio(),
      plan({
        template: "ENTRADA_Y_RESTO",
        numCuotas: null,
        cuotas: [{ orden: 1, base: "PORCENTAJE", valor: 30, offsetMeses: 0 }],
      }),
      base,
    ),
  ).toThrow(PlanInvalidoError);
});

// ── C) SUSCRIPCION ───────────────────────────────────────────────────────────────

test("C1 — SUSCRIPCION rolling: monthsBetween + horizonte cuotas, monto mensual cada una", () => {
  // inicio 2026-03-10 → hoy 2026-07-10 = 4 meses transcurridos + horizonte 3 → offsets 0..7
  const cuotas = expandPlanCuotas(
    servicio({ montoTotal: 150, fechaInicioFacturacion: "2026-03-10" }),
    plan({ template: "SUSCRIPCION" }),
    { todayISO: HOY },
  );
  expect(cuotas).toHaveLength(8);
  expect(cuotas.map((c) => c.offsetMeses)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  expect(cuotas.every((c) => c.monto === 150)).toBe(true);
  expect(cuotas.map((c) => c.numCuota)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
});

test("C2 — SUSCRIPCION arranque futuro → horizonte+1 cuotas; horizonMeses override respeta", () => {
  const svc = servicio({ montoTotal: 150, fechaInicioFacturacion: "2026-09-01" }); // futuro vs HOY
  const conDefault = expandPlanCuotas(svc, plan({ template: "SUSCRIPCION" }), { todayISO: HOY });
  expect(conDefault).toHaveLength(4); // offsets 0..3 (monthsBetween = 0)
  expect(conDefault.map((c) => c.offsetMeses)).toEqual([0, 1, 2, 3]);

  const conOverride = expandPlanCuotas(svc, plan({ template: "SUSCRIPCION" }), {
    todayISO: HOY,
    horizonMeses: 0,
  });
  expect(conOverride).toHaveLength(1);
});

test("C3 — SUSCRIPCION sin fechaInicioFacturacion → []", () => {
  const cuotas = expandPlanCuotas(
    servicio({ fechaInicioFacturacion: null }),
    plan({ template: "SUSCRIPCION" }),
    { todayISO: HOY },
  );
  expect(cuotas).toEqual([]);
});

// ── D) PERSONALIZADO ─────────────────────────────────────────────────────────────

test("D1 — PERSONALIZADO: mapea PORCENTAJE/MONTO_FIJO ordenado por orden, sin invariante de suma", () => {
  const cuotas = expandPlanCuotas(
    servicio({ montoTotal: 2000 }),
    plan({
      template: "PERSONALIZADO",
      cuotas: [
        { orden: 2, base: "MONTO_FIJO", valor: 500, offsetMeses: 4 }, // desordenado a propósito
        { orden: 1, base: "PORCENTAJE", valor: 25, offsetMeses: 0, descripcion: "Anticipo" },
      ],
    }),
    { todayISO: HOY },
  );
  expect(cuotas).toEqual([
    { numCuota: 1, offsetMeses: 0, monto: 500, descripcion: "Anticipo" }, // 25% de 2000
    { numCuota: 2, offsetMeses: 4, monto: 500, descripcion: undefined },
  ]);
  expect(sumCents(cuotas)).toBe(100000); // 1000 ≠ montoTotal (2000): plan parcial VÁLIDO
});

test("D2 — PERSONALIZADO sin cuotas → PlanInvalidoError", () => {
  expect(() =>
    expandPlanCuotas(servicio(), plan({ template: "PERSONALIZADO", cuotas: [] }), { todayISO: HOY }),
  ).toThrow(PlanInvalidoError);
});

// ── E) cobroDateFor ──────────────────────────────────────────────────────────────

test("E1 — sin ancla: día del arranque y periodo del mes destino", () => {
  expect(cobroDateFor("2026-01-15", 2, null)).toEqual({
    periodo: "2026-03",
    fechaProgramadaISO: "2026-03-15",
  });
});

test("E2 — clamp a febrero (31→28) y el clamp NO se arrastra: marzo vuelve al 31", () => {
  // Día del arranque = 31 (spec: "2026-01-31" con offset 1 → "2026-02-28")
  expect(cobroDateFor("2026-01-31", 1, null)).toEqual({
    periodo: "2026-02",
    fechaProgramadaISO: "2026-02-28",
  });
  // Ancla explícita 31 con arranque en día chico → mismo clamp
  expect(cobroDateFor("2026-01-05", 1, 31).fechaProgramadaISO).toBe("2026-02-28");
  // El clamp de febrero no contamina el mes siguiente
  expect(cobroDateFor("2026-01-31", 2, null).fechaProgramadaISO).toBe("2026-03-31");
});

test("E3 — bisiesto: día 31 en febrero 2028 → 29", () => {
  expect(cobroDateFor("2028-01-31", 1, null).fechaProgramadaISO).toBe("2028-02-29");
});

test("E4 — cruce de año: noviembre + 3 meses → febrero del año siguiente", () => {
  expect(cobroDateFor("2026-11-15", 3, null)).toEqual({
    periodo: "2027-02",
    fechaProgramadaISO: "2027-02-15",
  });
});

test("E5 — ISO completo se normaliza a fecha de calendario UTC", () => {
  expect(cobroDateFor("2026-01-31T00:00:00.000Z", 1, null).fechaProgramadaISO).toBe("2026-02-28");
  expect(cobroDateFor("2026-01-15T12:34:56.000Z", 0, null)).toEqual({
    periodo: "2026-01",
    fechaProgramadaISO: "2026-01-15",
  });
});

// ── F) materializeCobros ─────────────────────────────────────────────────────────

test("F1 — sin fechaInicioFacturacion → [] (cero fabricación)", () => {
  const drafts = materializeCobros(servicio({ fechaInicioFacturacion: null }), plan({ numCuotas: 3 }), {
    todayISO: HOY,
  });
  expect(drafts).toEqual([]);
});

test("F2 — composición PAREJO: fechas clampeadas, periodos y montos por cuota", () => {
  const drafts = materializeCobros(
    servicio({ montoTotal: 1000, fechaInicioFacturacion: "2026-01-31" }),
    plan({ numCuotas: 3 }),
    { todayISO: HOY },
  );
  expect(drafts).toHaveLength(3);
  expect(drafts.map((d) => [d.numCuota, d.periodo, d.fechaProgramadaISO, d.monto])).toEqual([
    [1, "2026-01", "2026-01-31", 333.33],
    [2, "2026-02", "2026-02-28", 333.33],
    [3, "2026-03", "2026-03-31", 333.34],
  ]);
});

test("F3 — diaCobroAncla de la cuenta aplica desde la cuota 1 (mes de arranque)", () => {
  const drafts = materializeCobros(
    servicio({ montoTotal: 200, fechaInicioFacturacion: "2026-01-10", diaCobroAncla: 15 }),
    plan({ numCuotas: 2 }),
    { todayISO: HOY },
  );
  expect(drafts.map((d) => d.fechaProgramadaISO)).toEqual(["2026-01-15", "2026-02-15"]);
});

// ── G) reconcileCobros (idempotencia) ────────────────────────────────────────────

test("G1 — sin existentes: todos los drafts van a toCreate", () => {
  const drafts = [draft({ numCuota: 1 }), draft({ numCuota: 2, periodo: "2026-02", fechaProgramadaISO: "2026-02-15" })];
  const r = reconcileCobros(drafts, []);
  expect(r.toCreate).toEqual(drafts);
  expect(r.toUpdate).toEqual([]);
  expect(r.toDelete).toEqual([]);
  expect(r.untouched).toEqual([]);
});

test("G2 — re-run con drafts idénticos (pipeline completo) → CERO mutaciones", () => {
  const svc = servicio({ montoTotal: 1000, fechaInicioFacturacion: "2026-01-31" });
  const drafts = materializeCobros(svc, plan({ numCuotas: 3 }), { todayISO: HOY });
  // Simula lo persistido en la primera corrida
  const existing: CobroExistente[] = drafts.map((d, i) =>
    existente({
      id: `e${i + 1}`,
      numCuota: d.numCuota,
      fechaProgramadaISO: d.fechaProgramadaISO,
      monto: d.monto,
    }),
  );
  const r = reconcileCobros(drafts, existing);
  expect(r.toCreate).toEqual([]);
  expect(r.toUpdate).toEqual([]);
  expect(r.toDelete).toEqual([]);
  expect(r.untouched.sort()).toEqual(["e1", "e2", "e3"]);
});

test("G3 — PROGRAMADO con fecha o monto distinto → toUpdate con el payload del draft", () => {
  const existing = [
    existente({ id: "e1", numCuota: 1, fechaProgramadaISO: "2026-01-15", monto: 333.33 }),
    existente({ id: "e2", numCuota: 2, fechaProgramadaISO: "2026-02-15", monto: 333.33 }),
  ];
  const drafts = [
    draft({ numCuota: 1, fechaProgramadaISO: "2026-01-20", monto: 333.33, periodo: "2026-01" }), // fecha movida
    draft({ numCuota: 2, fechaProgramadaISO: "2026-02-15", monto: 400, periodo: "2026-02" }), // monto cambiado
  ];
  const r = reconcileCobros(drafts, existing);
  expect(r.toUpdate).toEqual([
    { id: "e1", fechaProgramadaISO: "2026-01-20", monto: 333.33, periodo: "2026-01" },
    { id: "e2", fechaProgramadaISO: "2026-02-15", monto: 400, periodo: "2026-02" },
  ]);
  expect(r.toCreate).toEqual([]);
  expect(r.toDelete).toEqual([]);
});

test("G4 — intocables colisionantes (COBRADO / fechaEmision / MANUAL) → untouched y el draft se descarta", () => {
  const existing = [
    existente({ id: "e1", numCuota: 1, estado: "COBRADO" }),
    existente({ id: "e2", numCuota: 2, fechaEmision: "2026-05-01" }), // emitido: intocable aunque PROGRAMADO
    existente({ id: "e3", numCuota: 3, origen: "MANUAL" }),
  ];
  // Drafts colisionantes con fecha Y monto distintos: igual NO deben pisar ni duplicar
  const drafts = [
    draft({ numCuota: 1, fechaProgramadaISO: "2026-06-01", monto: 999 }),
    draft({ numCuota: 2, fechaProgramadaISO: "2026-06-01", monto: 999 }),
    draft({ numCuota: 3, fechaProgramadaISO: "2026-06-01", monto: 999 }),
  ];
  const r = reconcileCobros(drafts, existing);
  expect(r.toCreate).toEqual([]);
  expect(r.toUpdate).toEqual([]);
  expect(r.toDelete).toEqual([]);
  expect(r.untouched.sort()).toEqual(["e1", "e2", "e3"]);
});

test("G5 — plan achicado: PROGRAMADO PLAN/CATCH_UP sin draft → toDelete; COBRADO sin draft → untouched", () => {
  const existing = [
    existente({ id: "e1", numCuota: 1 }), // matchea el draft sin cambios
    existente({ id: "e2", numCuota: 2, origen: "PLAN" }),
    existente({ id: "e3", numCuota: 3, origen: "CATCH_UP" }),
    existente({ id: "e4", numCuota: 4, estado: "COBRADO" }),
  ];
  const r = reconcileCobros([draft({ numCuota: 1 })], existing);
  expect(r.toDelete.sort()).toEqual(["e2", "e3"]);
  expect(r.untouched.sort()).toEqual(["e1", "e4"]);
  expect(r.toCreate).toEqual([]);
  expect(r.toUpdate).toEqual([]);
});

test("G6 — existente con numCuota null (manual sin orden) → untouched SIEMPRE", () => {
  const existing = [
    existente({ id: "e1", numCuota: null, origen: "MANUAL" }),
    existente({ id: "e2", numCuota: null, origen: "PLAN" }), // aún PROGRAMADO PLAN: no se borra
  ];
  const r = reconcileCobros([], existing);
  expect(r.untouched.sort()).toEqual(["e1", "e2"]);
  expect(r.toDelete).toEqual([]);
  expect(r.toCreate).toEqual([]);
  expect(r.toUpdate).toEqual([]);
});

// ── H) splitCatchUp ──────────────────────────────────────────────────────────────

test("H1 — estrictamente < hoy → catchUp; == hoy y > hoy → regulares", () => {
  const ayer = draft({ numCuota: 1, fechaProgramadaISO: "2026-07-09" });
  const hoyMismo = draft({ numCuota: 2, fechaProgramadaISO: "2026-07-10" });
  const maniana = draft({ numCuota: 3, fechaProgramadaISO: "2026-07-11" });
  const { regulares, catchUp } = splitCatchUp([ayer, hoyMismo, maniana], HOY);
  expect(catchUp).toEqual([ayer]);
  expect(regulares).toEqual([hoyMismo, maniana]);
});

// ── I) Semáforos ─────────────────────────────────────────────────────────────────

test("I1 — COBRADO → verde aunque la fecha esté muy vencida", () => {
  expect(semaforoCobro({ estado: "COBRADO", fechaProgramadaISO: "2026-01-01" }, HOY)).toBe("verde");
});

test("I2 — borde del umbral: exactamente 3 días pasados NO es rojo; 4 sí", () => {
  // HOY = 2026-07-10, umbral default 3
  expect(semaforoCobro({ estado: "POR_COBRAR", fechaProgramadaISO: "2026-07-07" }, HOY)).toBe("amarillo");
  expect(semaforoCobro({ estado: "PROGRAMADO", fechaProgramadaISO: "2026-07-07" }, HOY)).toBe("gris");
  expect(semaforoCobro({ estado: "POR_COBRAR", fechaProgramadaISO: "2026-07-06" }, HOY)).toBe("rojo");
  expect(semaforoCobro({ estado: "PROGRAMADO", fechaProgramadaISO: "2026-07-06" }, HOY)).toBe("rojo");
});

test("I3 — no vencidos: POR_COBRAR → amarillo, PROGRAMADO futuro → gris", () => {
  expect(semaforoCobro({ estado: "POR_COBRAR", fechaProgramadaISO: "2026-08-01" }, HOY)).toBe("amarillo");
  expect(semaforoCobro({ estado: "PROGRAMADO", fechaProgramadaISO: "2026-08-01" }, HOY)).toBe("gris");
});

test("I4 — umbral custom mueve el corte del rojo", () => {
  const unDiaPasado = { estado: "POR_COBRAR", fechaProgramadaISO: "2026-07-09" };
  expect(semaforoCobro(unDiaPasado, HOY)).toBe("amarillo"); // default 3: 1 día no alcanza
  expect(semaforoCobro(unDiaPasado, HOY, 0)).toBe("rojo"); // umbral 0: 1 día ya es rojo
});

test("I5 — semaforoCuenta: el peor gana; lista vacía → verde", () => {
  const cobrado = { estado: "COBRADO", fechaProgramadaISO: "2026-06-01" };
  const futuro = { estado: "PROGRAMADO", fechaProgramadaISO: "2026-08-01" };
  const porCobrar = { estado: "POR_COBRAR", fechaProgramadaISO: "2026-07-20" };
  const vencido = { estado: "POR_COBRAR", fechaProgramadaISO: "2026-07-01" };
  expect(semaforoCuenta([cobrado, futuro], HOY)).toBe("gris"); // gris > verde
  expect(semaforoCuenta([cobrado, futuro, porCobrar], HOY)).toBe("amarillo"); // amarillo > gris
  expect(semaforoCuenta([cobrado, futuro, porCobrar, vencido], HOY)).toBe("rojo"); // rojo gana
  expect(semaforoCuenta([], HOY)).toBe("verde");
});

// ── J) computeAlertSet ───────────────────────────────────────────────────────────

test("J1 — cuenta excluidaOperacion → CERO alertas aunque tenga de todo", () => {
  const cartera: CarteraEngineInput = {
    cuentas: [
      cuenta({
        excluidaOperacion: true,
        servicios: [servicioCartera({ fechaInicioFacturacion: null })],
        cobros: [cobroCartera({ fechaProgramadaISO: "2026-06-01" })], // vencidísimo
      }),
    ],
  };
  expect(computeAlertSet(cartera, { todayISO: HOY })).toEqual([]);
});

test("J2 — tieneCuenta=false → exactamente 1 CUENTA_SIN_DATOS (media) y NO evalúa más", () => {
  const cartera: CarteraEngineInput = {
    cuentas: [
      cuenta({
        tieneCuenta: false,
        servicios: [servicioCartera({ fechaInicioFacturacion: null })], // alertaría si se evaluara
        cobros: [cobroCartera({ fechaProgramadaISO: "2026-06-01" })], // alertaría si se evaluara
      }),
    ],
  };
  const alertas = computeAlertSet(cartera, { todayISO: HOY });
  expect(alertas).toHaveLength(1);
  expect(alertas[0]).toMatchObject({
    tipo: "CUENTA_SIN_DATOS",
    urgencia: "MEDIA",
    dedupeKey: "CUENTA_SIN_DATOS:c1:cuenta",
  });
});

test("J3 — cuenta sin servicios → CUENTA_SIN_DATOS a nivel cuenta", () => {
  const alertas = computeAlertSet({ cuentas: [cuenta({ servicios: [] })] }, { todayISO: HOY });
  expect(alertas).toHaveLength(1);
  expect(alertas[0].dedupeKey).toBe("CUENTA_SIN_DATOS:c1:cuenta");
});

test("J4 — servicio ACTIVO sin fechaInicio → CUENTA_SIN_DATOS por servicio; no-ACTIVO no alerta", () => {
  const cartera: CarteraEngineInput = {
    cuentas: [
      cuenta({
        servicios: [
          servicioCartera({ servicioId: "s1", fechaInicioFacturacion: null }),
          servicioCartera({ servicioId: "s2", estado: "PAUSADO", fechaInicioFacturacion: null }),
        ],
      }),
    ],
  };
  const alertas = computeAlertSet(cartera, { todayISO: HOY });
  expect(alertas).toHaveLength(1);
  expect(alertas[0]).toMatchObject({ tipo: "CUENTA_SIN_DATOS", dedupeKey: "CUENTA_SIN_DATOS:c1:s1" });
});

test("J5 — fechaInicio ≠ anchor (calendario) → ARRANQUE_CAMBIADO alta; igual calendario o sin anchor → nada", () => {
  const distinta = computeAlertSet(
    {
      cuentas: [
        cuenta({
          servicios: [
            servicioCartera({ fechaInicioFacturacion: "2026-03-01", anchorActualISO: "2026-03-15" }),
          ],
        }),
      ],
    },
    { todayISO: HOY },
  );
  expect(distinta).toHaveLength(1);
  expect(distinta[0]).toMatchObject({
    tipo: "ARRANQUE_CAMBIADO",
    urgencia: "ALTA",
    dedupeKey: "ARRANQUE_CAMBIADO:c1:s1",
  });

  // Misma fecha de calendario en formatos distintos (date-only vs ISO completo) → NO alerta
  const igualCalendario = computeAlertSet(
    {
      cuentas: [
        cuenta({
          servicios: [
            servicioCartera({
              fechaInicioFacturacion: "2026-03-01",
              anchorActualISO: "2026-03-01T00:00:00.000Z",
            }),
          ],
        }),
      ],
    },
    { todayISO: HOY },
  );
  expect(igualCalendario).toEqual([]);

  // Sin anchor vinculado → nada que comparar
  const sinAnchor = computeAlertSet(
    {
      cuentas: [
        cuenta({ servicios: [servicioCartera({ fechaInicioFacturacion: "2026-03-01", anchorActualISO: null })] }),
      ],
    },
    { todayISO: HOY },
  );
  expect(sinAnchor).toEqual([]);
});

test("J6 — bordes vencido/próximo: +4 días → VENCIDO; +3 y -15 → PROXIMO; -16 → nada", () => {
  const cartera: CarteraEngineInput = {
    cuentas: [
      cuenta({
        servicios: [servicioCartera()],
        cobros: [
          cobroCartera({ cobroId: "co1", fechaProgramadaISO: "2026-07-06" }), // 4 días pasados
          cobroCartera({ cobroId: "co2", fechaProgramadaISO: "2026-07-07" }), // 3 = umbral exacto
          cobroCartera({ cobroId: "co3", fechaProgramadaISO: "2026-07-25" }), // -15 = borde de ventana
          cobroCartera({ cobroId: "co4", fechaProgramadaISO: "2026-07-26" }), // -16: fuera de ventana
        ],
      }),
    ],
  };
  const alertas = computeAlertSet(cartera, { todayISO: HOY });
  expect(keysOf(alertas)).toEqual([
    "COBRO_PROXIMO:c1:co2",
    "COBRO_PROXIMO:c1:co3",
    "COBRO_VENCIDO:c1:co1",
  ]);
  expect(alertas.find((a) => a.tipo === "COBRO_VENCIDO")?.urgencia).toBe("ALTA");
  expect(alertas.find((a) => a.dedupeKey.endsWith("co2"))?.urgencia).toBe("MEDIA");
});

test("J7 — cobro COBRADO → ninguna alerta aunque la fecha esté vencida", () => {
  const cartera: CarteraEngineInput = {
    cuentas: [
      cuenta({
        servicios: [servicioCartera()],
        cobros: [cobroCartera({ estado: "COBRADO", fechaProgramadaISO: "2026-06-01" })],
      }),
    ],
  };
  expect(computeAlertSet(cartera, { todayISO: HOY })).toEqual([]);
});

test("J8 — CATCH_UP PROGRAMADO → INCONSISTENCIA_CICLO ADEMÁS del vencido; no-PROGRAMADO no la dispara", () => {
  const cartera: CarteraEngineInput = {
    cuentas: [
      cuenta({
        servicios: [servicioCartera()],
        cobros: [
          cobroCartera({ cobroId: "co1", origen: "CATCH_UP", estado: "PROGRAMADO", fechaProgramadaISO: "2026-06-30" }),
          cobroCartera({ cobroId: "co2", origen: "CATCH_UP", estado: "POR_COBRAR", fechaProgramadaISO: "2026-06-30" }),
        ],
      }),
    ],
  };
  const alertas = computeAlertSet(cartera, { todayISO: HOY });
  expect(keysOf(alertas)).toEqual([
    "COBRO_VENCIDO:c1:co1",
    "COBRO_VENCIDO:c1:co2",
    "INCONSISTENCIA_CICLO:c1:co1", // solo el PROGRAMADO
  ]);
  expect(alertas.find((a) => a.tipo === "INCONSISTENCIA_CICLO")?.urgencia).toBe("MEDIA");
});

test("J9 — dedupeKey estable: el mismo input dos veces produce exactamente las mismas keys", () => {
  const cartera: CarteraEngineInput = {
    cuentas: [
      cuenta({
        servicios: [
          servicioCartera({ servicioId: "s1", fechaInicioFacturacion: null }),
          servicioCartera({ servicioId: "s2", fechaInicioFacturacion: "2026-02-01", anchorActualISO: "2026-02-15" }),
        ],
        cobros: [
          cobroCartera({ cobroId: "co1", fechaProgramadaISO: "2026-07-01" }),
          cobroCartera({ cobroId: "co2", origen: "CATCH_UP", estado: "PROGRAMADO", fechaProgramadaISO: "2026-07-20" }),
        ],
      }),
      cuenta({ cuentaId: "c2", clienteNombre: "Beta", tieneCuenta: false }),
    ],
  };
  const primera = computeAlertSet(cartera, { todayISO: HOY });
  const segunda = computeAlertSet(cartera, { todayISO: HOY });
  expect(primera.length).toBeGreaterThan(0);
  expect(keysOf(segunda)).toEqual(keysOf(primera));
  expect(new Set(keysOf(primera)).size).toBe(primera.length); // sin keys duplicadas
});

// ── K) diffAlertSets ─────────────────────────────────────────────────────────────

function alerta(key: string): AlertaDraft {
  return { dedupeKey: key, tipo: "COBRO_VENCIDO", urgencia: "ALTA", cuentaId: "c1", mensaje: key };
}

test("K1 — diff por dedupeKey: nuevas, resueltas y persistentes", () => {
  const prev = [alerta("a"), alerta("b")];
  const current = [alerta("b"), alerta("c")];
  const diff = diffAlertSets(prev, current);
  expect(diff.nuevas.map((a) => a.dedupeKey)).toEqual(["c"]);
  expect(diff.resueltas.map((a) => a.dedupeKey)).toEqual(["a"]);
  expect(diff.persistentes).toBe(1); // "b"
  expect(diff.sinCambios).toBe(false);
});

test("K2 — sin cambios: mismos sets → sinCambios true (también con ambos vacíos)", () => {
  const set = [alerta("a"), alerta("b")];
  const igual = diffAlertSets(set, [alerta("a"), alerta("b")]);
  expect(igual.nuevas).toEqual([]);
  expect(igual.resueltas).toEqual([]);
  expect(igual.persistentes).toBe(2);
  expect(igual.sinCambios).toBe(true);

  const vacios = diffAlertSets([], []);
  expect(vacios.sinCambios).toBe(true);
  expect(vacios.persistentes).toBe(0);
});
