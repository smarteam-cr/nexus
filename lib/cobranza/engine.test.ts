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
 *   N) computeMetricasCartera (fase 3):
 *      N1 cartera vacía → ceros/nulls honestos (dso null, no 0) + ventana declarada.
 *      N2 CRC y USD jamás se suman; cobro sin moneda no entra a ninguna.
 *      N3 mapeo 1:1 al semáforo: rojo→vencido, amarillo→porCobrar, gris→programado; COBRADO fuera.
 *      N4 aging con bordes 30/31/60/61/90/91 + invariante Σ buckets === totalVencido.
 *      N5 DSO ponderado por monto; los futuros no diluyen.
 *      N6 DSO null sin exigibles (solo futuros) — honestidad: no es 0.
 *      N7 ventana de cobrado (desde, hoy]: borde exclusivo/inclusivo; primer corte (null) → 0.
 *      N8 proyectadoProximoCorte: vencido fuera; gracia (amarillo pasado → hoy); futuro fuera de ventana no.
 *      N9 cobertura (excluida fuera de TODO, sin configurar, PENDIENTE_DATOS, sin cobros) + rojas/amarillas.
 *      N10 diasPromedioCobro negativo (paga antes).
 *   R) computeRiesgoPago (fase 3):
 *      R1 sin historia → umbral a secas (15): atraso 16 sí, 15 no; promedio null.
 *      R2 con historia → (promedio + umbral): 26 sí, 25 no con promedio 10.
 *      R3 promedio negativo NO se clampea: el buen pagador se bandera antes.
 *      R4 COBRADO / excluida / sin cuenta → fuera.
 *      R5 orden: excedente desc, empate por cobroId.
 *      R6 umbral custom + constante exportada.
 *   P) promesa de pago en computeAlertSet (fase 3):
 *      P1 promesa vigente (futura) suprime VENCIDO y PROXIMO de ese cobro.
 *      P2 promesa == hoy sigue vigente (silencio).
 *      P3 promesa pasada → PROMESA_INCUMPLIDA (ALTA) que REEMPLAZA al vencido (1 alerta por cobro).
 *      P4 COBRADO con promesa pasada → nada.
 *      P5 catch-up: INCONSISTENCIA_CICLO se sigue emitiendo aunque la promesa calle el vencido.
 *      P6 regresión: fixture sin el campo → comportamiento idéntico al de siempre.
 *   Q) finQuincenaISO + diffDays (cola de cobros):
 *      Q1 día 1 y 15 → día 15; día 16 y fin de mes → fin de mes; febrero clampeado.
 *      Q2 diffDays exportado: signo y cero.
 *   O) proyectarCostos + proyectarGastos + computeCajaNeta (fase 4 — la plata que sale):
 *      O1 ANUAL se mensualiza /12 con round2 único.
 *      O2 inactivo excluido de buckets y de totalMensual.
 *      O3 bucket mes recibe el mensual completo; bucket quincena la mitad.
 *      O4 el split de quincena no pierde centavos (Q1+Q2 === mensual, monto impar).
 *      O5 keys idénticas a proyectarIngresos con los mismos opts (incl. hoy>15 y clamp).
 *      O6 CRC y USD jamás sumados (totales separados en el mismo bucket).
 *      O7 totalMensual por moneda = suma de mensualizados ACTIVOS.
 *      O8 determinismo: input desordenado → mismo output.
 *      O9 neto = entra − sale por bucket y por moneda (round2).
 *      O10 costos vacíos → neto === entra en cada bucket.
 *      O11 vencidos del lado entra viajan APARTE — ni en buckets ni en el neto.
 *      O12 totalesHorizonte = Σ de los buckets (entra/sale/neto por moneda).
 *      O13 neto negativo se emite tal cual (sin clamp).
 *      O14 opts custom en ambos lados → mismas keys y matcheo correcto.
 *      O15 proyectarGastos: gasto futuro cae ENTERO en su bucket (sin mensualizar ni partir).
 *      O16 gasto de HOY cae en el primer bucket (quincena en curso: hoy ≤15 y hoy >15).
 *      O17 gasto pasado (fecha < hoy) → pasados; cero en buckets y en totalFuturo.
 *      O18 gasto > finHorizonteISO → fueraDeHorizonte, no bucket.
 *      O19 keys de proyectarGastos idénticas a proyectarCostos con los mismos opts (clamp + hoy>15).
 *      O20 computeCajaNeta(entra, sale, gastos): sale = costos+gastos por key/moneda; neto resta ambos.
 *      O21 REGRESIÓN: computeCajaNeta sin 3er arg === con proyectarGastos([]) (toEqual profundo).
 *      O22 CRC y USD jamás sumados en un bucket de gastos.
 *      O23 determinismo de gastos: input desordenado → mismo output.
 *      O24 costo con finalizadoEl PASADO (< hoy) → fuera de todos los buckets y del totalMensual.
 *      O25 costo con finalizadoEl FUTURO → presente hasta el bucket de la baja (quincena entera); burn lo incluye.
 *      O26 REGRESIÓN: proyectarCostos SIN finalizadoEl → output idéntico al histórico.
 *   G) GOLDEN de proyectarIngresos (fase 4 — números en producción):
 *      G1 el output completo sobre las fixtures congeladas (__fixtures__) es idéntico al
 *         JSON commiteado. Un refactor NO puede mover un número sin regenerar el golden
 *         en un commit que documente el porqué.
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
  sumaPlanExpandido,
  computeAlertSet,
  diffAlertSets,
  diffDays,
  finQuincenaISO,
  proyectarIngresos,
  proyectarCostos,
  proyectarGastos,
  computeCajaNeta,
  computeMetricasCartera,
  computeRiesgoPago,
  RIESGO_UMBRAL_DIAS,
  PlanInvalidoError,
} from "./engine";
import type {
  ServicioEngineInput,
  PlanEngineInput,
  CobroDraft,
  CobroExistente,
  CarteraEngineInput,
  AlertaDraft,
  CobroProyeccionInput,
  CostoProyeccionInput,
  GastoProyeccionInput,
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

test("I5 — semaforoCuenta: el peor gana; lista vacía → gris (vacío ≠ al día)", () => {
  const cobrado = { estado: "COBRADO", fechaProgramadaISO: "2026-06-01" };
  const futuro = { estado: "PROGRAMADO", fechaProgramadaISO: "2026-08-01" };
  const porCobrar = { estado: "POR_COBRAR", fechaProgramadaISO: "2026-07-20" };
  const vencido = { estado: "POR_COBRAR", fechaProgramadaISO: "2026-07-01" };
  expect(semaforoCuenta([cobrado, futuro], HOY)).toBe("gris"); // gris > verde
  expect(semaforoCuenta([cobrado, futuro, porCobrar], HOY)).toBe("amarillo"); // amarillo > gris
  expect(semaforoCuenta([cobrado, futuro, porCobrar, vencido], HOY)).toBe("rojo"); // rojo gana
  // Cuenta sin cobros = GRIS: verde significa "al día", no "vacío" (una cuenta
  // recién configurada / pendiente de datos no puede verse cobrada).
  expect(semaforoCuenta([], HOY)).toBe("gris");
  expect(semaforoCuenta([cobrado], HOY)).toBe("verde"); // con cobros y todo cobrado SÍ es verde
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

// ── L) MONTOS_DESCUADRADOS + sumaPlanExpandido ───────────────────────────────────

test("L1 — sumaPlanExpandido: PAREJO suma exacto; SUSCRIPCION → null; plan inválido → null", () => {
  expect(sumaPlanExpandido({ montoTotal: 1000, duracionMeses: null }, plan({ template: "PAREJO", numCuotas: 3 }))).toBe(1000);
  expect(sumaPlanExpandido({ montoTotal: 800, duracionMeses: null }, plan({ template: "SUSCRIPCION" }))).toBeNull();
  // PAREJO sin numCuotas ni duracionMeses = PlanInvalidoError → null (no revienta)
  expect(sumaPlanExpandido({ montoTotal: 1000, duracionMeses: null }, plan({ template: "PAREJO", numCuotas: null }))).toBeNull();
  // PERSONALIZADO parcial: suma lo que hay (la alerta la decide computeAlertSet)
  expect(
    sumaPlanExpandido(
      { montoTotal: 1000, duracionMeses: null },
      plan({
        template: "PERSONALIZADO",
        cuotas: [{ orden: 1, base: "MONTO_FIJO", valor: 400, offsetMeses: 0 }],
      }),
    ),
  ).toBe(400);
});

test("L2 — computeAlertSet: plan descuadrado emite MONTOS_DESCUADRADOS con la diferencia", () => {
  const cartera: CarteraEngineInput = {
    cuentas: [
      cuenta({
        servicios: [servicioCartera({ montoTotal: 1000, planTemplate: "PERSONALIZADO", sumaPlan: 400 })],
      }),
    ],
  };
  const alertas = computeAlertSet(cartera, { todayISO: HOY });
  const desc = alertas.filter((a) => a.tipo === "MONTOS_DESCUADRADOS");
  expect(desc).toHaveLength(1);
  expect(desc[0].dedupeKey).toBe("MONTOS_DESCUADRADOS:c1:s1");
  expect(desc[0].urgencia).toBe("MEDIA");
  expect(desc[0].evidencia).toMatchObject({ montoTotal: 1000, sumaPlan: 400, diferencia: -600 });
});

test("L3 — computeAlertSet: plan que cuadra NO alerta; SUSCRIPCION exenta; tolerancia 1 centavo", () => {
  const cartera: CarteraEngineInput = {
    cuentas: [
      cuenta({
        servicios: [
          servicioCartera({ servicioId: "ok", montoTotal: 1000, planTemplate: "PAREJO", sumaPlan: 1000 }),
          servicioCartera({ servicioId: "sub", montoTotal: 800, planTemplate: "SUSCRIPCION", sumaPlan: null }),
          servicioCartera({ servicioId: "centavo", montoTotal: 1000, planTemplate: "PAREJO", sumaPlan: 1000.01 }),
        ],
      }),
    ],
  };
  const alertas = computeAlertSet(cartera, { todayISO: HOY });
  expect(alertas.filter((a) => a.tipo === "MONTOS_DESCUADRADOS")).toHaveLength(0);
});

test("L4 — computeAlertSet: cuenta SIN proyecto real baja CUENTA_SIN_DATOS a urgencia BAJA", () => {
  const cartera: CarteraEngineInput = {
    cuentas: [
      cuenta({ cuentaId: "imp", tieneProyectoReal: false, servicios: [] }), // sin servicios
      cuenta({ cuentaId: "real", servicios: [] }), // con proyecto (default true)
    ],
  };
  const alertas = computeAlertSet(cartera, { todayISO: HOY });
  const imp = alertas.find((a) => a.cuentaId === "imp");
  const real = alertas.find((a) => a.cuentaId === "real");
  expect(imp?.tipo).toBe("CUENTA_SIN_DATOS");
  expect(imp?.urgencia).toBe("BAJA");
  expect(real?.urgencia).toBe("MEDIA");
});

// ── M) proyectarIngresos ─────────────────────────────────────────────────────────

function cobroProy(over: Partial<CobroProyeccionInput> = {}): CobroProyeccionInput {
  return {
    cobroId: "p1",
    cuentaId: "c1",
    clienteNombre: "Acme",
    estado: "PROGRAMADO",
    fechaProgramadaISO: "2026-07-20",
    monto: 100,
    moneda: "USD",
    ...over,
  };
}

test("M1 — CRC y USD nunca se suman entre sí (totales separados en el mismo bucket)", () => {
  const p = proyectarIngresos(
    [
      cobroProy({ cobroId: "a", moneda: "USD", monto: 100, fechaProgramadaISO: "2026-07-20" }),
      cobroProy({ cobroId: "b", moneda: "CRC", monto: 50000, fechaProgramadaISO: "2026-07-20" }),
    ],
    { todayISO: HOY },
  );
  const q2jul = p.buckets.find((b) => b.key === "2026-07-Q2")!;
  expect(q2jul.totales).toEqual({ CRC: 50000, USD: 100 });
});

test("M2 — COBRADO se excluye; vencido (> umbral) va a vencidos y NO a buckets", () => {
  const p = proyectarIngresos(
    [
      cobroProy({ cobroId: "cobrado", estado: "COBRADO", fechaProgramadaISO: "2026-07-20" }),
      cobroProy({ cobroId: "venc", estado: "POR_COBRAR", fechaProgramadaISO: "2026-07-01", monto: 300 }),
    ],
    { todayISO: HOY },
  );
  expect(p.vencidos.cobros.map((c) => c.cobroId)).toEqual(["venc"]);
  expect(p.vencidos.totales.USD).toBe(300);
  expect(p.buckets.every((b) => b.cobros.length === 0)).toBe(true);
});

test("M3 — gracia: pasado dentro del umbral cae en la quincena ACTUAL", () => {
  // HOY = 2026-07-10; fecha 2026-07-08 → 2 días pasados (≤ umbral 3) → Q1 de julio.
  const p = proyectarIngresos([cobroProy({ fechaProgramadaISO: "2026-07-08" })], { todayISO: HOY });
  expect(p.buckets.find((b) => b.key === "2026-07-Q1")!.cobros).toHaveLength(1);
  expect(p.vencidos.cobros).toHaveLength(0);
});

test("M4 — bordes de quincena: día 15 → Q1; día 16 → Q2", () => {
  const p = proyectarIngresos(
    [
      cobroProy({ cobroId: "d15", fechaProgramadaISO: "2026-07-15" }),
      cobroProy({ cobroId: "d16", fechaProgramadaISO: "2026-07-16" }),
    ],
    { todayISO: HOY },
  );
  expect(p.buckets.find((b) => b.key === "2026-07-Q1")!.cobros.map((c) => c.cobroId)).toEqual(["d15"]);
  expect(p.buckets.find((b) => b.key === "2026-07-Q2")!.cobros.map((c) => c.cobroId)).toEqual(["d16"]);
});

test("M5 — febrero: la Q2 clampea al fin de mes (16–28)", () => {
  const p = proyectarIngresos([], { todayISO: "2026-01-20", mesesEnQuincenas: 2 });
  const febQ2 = p.buckets.find((b) => b.key === "2026-02-Q2")!;
  expect(febQ2.hastaISO).toBe("2026-02-28");
  expect(febQ2.etiqueta).toBe("16–28 feb");
});

test("M6 — tras los meses en quincenas, los buckets son MENSUALES", () => {
  const p = proyectarIngresos([cobroProy({ fechaProgramadaISO: "2026-09-05" })], { todayISO: HOY });
  const sep = p.buckets.find((b) => b.key === "2026-09")!;
  expect(sep.granularidad).toBe("mes");
  expect(sep.cobros).toHaveLength(1);
});

test("M7 — más allá del horizonte → fueraDeHorizonte (contador), no bucket", () => {
  // Horizonte default 6 meses desde julio → termina 2026-12-31.
  const p = proyectarIngresos([cobroProy({ fechaProgramadaISO: "2027-02-01" })], { todayISO: HOY });
  expect(p.fueraDeHorizonte).toBe(1);
  expect(p.buckets.every((b) => b.cobros.length === 0)).toBe(true);
});

test("M8 — buckets vacíos SÍ se emiten y en orden cronológico (la línea no salta)", () => {
  const p = proyectarIngresos([], { todayISO: HOY });
  // jul Q1+Q2, ago Q1+Q2, sep, oct, nov, dic = 8 buckets
  expect(p.buckets.map((b) => b.key)).toEqual([
    "2026-07-Q1",
    "2026-07-Q2",
    "2026-08-Q1",
    "2026-08-Q2",
    "2026-09",
    "2026-10",
    "2026-11",
    "2026-12",
  ]);
});

test("M9 — hoy en la segunda quincena: la Q1 del mes actual NO se emite", () => {
  const p = proyectarIngresos([], { todayISO: "2026-07-20" });
  expect(p.buckets[0].key).toBe("2026-07-Q2");
  expect(p.buckets.some((b) => b.key === "2026-07-Q1")).toBe(false);
});

test("M10 — determinismo: mismo input → mismo output (orden estable por fecha y id)", () => {
  const cobros = [
    cobroProy({ cobroId: "b", fechaProgramadaISO: "2026-07-20" }),
    cobroProy({ cobroId: "a", fechaProgramadaISO: "2026-07-20" }),
    cobroProy({ cobroId: "c", fechaProgramadaISO: "2026-07-18" }),
  ];
  const p1 = proyectarIngresos(cobros, { todayISO: HOY });
  const p2 = proyectarIngresos([...cobros].reverse(), { todayISO: HOY });
  expect(p1).toEqual(p2);
  expect(p1.buckets.find((b) => b.key === "2026-07-Q2")!.cobros.map((c) => c.cobroId)).toEqual(["c", "a", "b"]);
});

// ── N) computeMetricasCartera (fase 3) ───────────────────────────────────────────

/** Corte estándar de los tests de métricas: ventana (2026-07-03, hoy], próximo corte +7. */
function metricasDe(
  cuentas: Cuenta[],
  over: Partial<{
    todayISO: string;
    desdeUltimoCorteISO: string | null;
    proximoCorteISO: string;
    umbralVencidoDias: number;
  }> = {},
) {
  return computeMetricasCartera(
    { cuentas },
    { todayISO: HOY, desdeUltimoCorteISO: "2026-07-03", proximoCorteISO: "2026-07-17", ...over },
  );
}

test("N1 — cartera vacía: ceros/nulls honestos (dso null, NO 0) y ventana declarada", () => {
  const m = metricasDe([], { desdeUltimoCorteISO: null });
  expect(m.version).toBe(1);
  expect(m.ventana).toEqual({ desdeISO: null, hastaISO: HOY, proximoCorteISO: "2026-07-17" });
  for (const mon of ["CRC", "USD"] as const) {
    expect(m.moneda[mon].totalVencido).toBe(0);
    expect(m.moneda[mon].totalPorCobrar).toBe(0);
    expect(m.moneda[mon].totalProgramado).toBe(0);
    expect(m.moneda[mon].totalCobradoDesdeUltimoCorte).toBe(0);
    expect(m.moneda[mon].aging).toEqual({ d0_30: 0, d31_60: 0, d61_90: 0, d90mas: 0 });
    expect(m.moneda[mon].dso).toBeNull();
    expect(m.moneda[mon].diasPromedioCobro).toBeNull();
    expect(m.moneda[mon].proyectadoProximoCorte).toBe(0);
  }
  expect(m.cuentasRojas).toBe(0);
  expect(m.cuentasAmarillas).toBe(0);
  expect(m.cobertura).toEqual({
    cuentasTotales: 0,
    cuentasConfiguradas: 0,
    cuentasPendienteDatos: 0,
    cuentasSinCobros: 0,
  });
});

test("N2 — CRC y USD jamás se suman; cobro sin moneda no entra a ninguna", () => {
  const m = metricasDe([
    cuenta({
      cobros: [
        cobroCartera({ cobroId: "co1", moneda: "CRC", monto: 100, fechaProgramadaISO: "2026-07-09" }),
        cobroCartera({ cobroId: "co2", moneda: "USD", monto: 200, fechaProgramadaISO: "2026-07-09" }),
        cobroCartera({ cobroId: "co3", monto: 400, fechaProgramadaISO: "2026-07-09" }), // sin moneda
      ],
    }),
  ]);
  expect(m.moneda.CRC.totalPorCobrar).toBe(100);
  expect(m.moneda.USD.totalPorCobrar).toBe(200);
  // los 400 sin moneda no aparecen en NINGÚN total (no se adivina)
  const totales = (["CRC", "USD"] as const).flatMap((mon) => [
    m.moneda[mon].totalVencido,
    m.moneda[mon].totalPorCobrar,
    m.moneda[mon].totalProgramado,
  ]);
  expect(totales.reduce((a, b) => a + b, 0)).toBe(300);
});

test("N3 — mapeo 1:1 al semáforo: rojo→vencido, amarillo→porCobrar, gris→programado; COBRADO fuera", () => {
  const m = metricasDe([
    cuenta({
      cobros: [
        cobroCartera({ cobroId: "co1", moneda: "USD", monto: 500, fechaProgramadaISO: "2026-07-01" }), // rojo (9d)
        cobroCartera({ cobroId: "co2", moneda: "USD", monto: 200, fechaProgramadaISO: "2026-07-09" }), // amarillo
        cobroCartera({ cobroId: "co3", moneda: "USD", monto: 300, estado: "PROGRAMADO", fechaProgramadaISO: "2026-08-01" }), // gris
        cobroCartera({ cobroId: "co4", moneda: "USD", monto: 100, estado: "COBRADO", fechaProgramadaISO: "2026-07-01", fechaCobroISO: "2026-07-05" }),
      ],
    }),
  ]);
  expect(m.moneda.USD.totalVencido).toBe(500);
  expect(m.moneda.USD.totalPorCobrar).toBe(200);
  expect(m.moneda.USD.totalProgramado).toBe(300);
  expect(m.moneda.USD.diasPromedioCobro).toBe(4); // cobró 4 días tarde
});

test("N4 — aging con bordes 30/31/60/61/90/91 + invariante Σ buckets === totalVencido", () => {
  const m = metricasDe([
    cuenta({
      cobros: [
        cobroCartera({ cobroId: "a", moneda: "USD", monto: 10, fechaProgramadaISO: "2026-06-10" }), // 30d → d0_30
        cobroCartera({ cobroId: "b", moneda: "USD", monto: 20, fechaProgramadaISO: "2026-06-09" }), // 31d → d31_60
        cobroCartera({ cobroId: "c", moneda: "USD", monto: 30, fechaProgramadaISO: "2026-05-11" }), // 60d → d31_60
        cobroCartera({ cobroId: "d", moneda: "USD", monto: 40, fechaProgramadaISO: "2026-05-10" }), // 61d → d61_90
        cobroCartera({ cobroId: "e", moneda: "USD", monto: 50, fechaProgramadaISO: "2026-04-11" }), // 90d → d61_90
        cobroCartera({ cobroId: "f", moneda: "USD", monto: 60, fechaProgramadaISO: "2026-04-10" }), // 91d → d90mas
      ],
    }),
  ]);
  expect(m.moneda.USD.aging).toEqual({ d0_30: 10, d31_60: 50, d61_90: 90, d90mas: 60 });
  const suma = Object.values(m.moneda.USD.aging).reduce((a, b) => a + b, 0);
  expect(suma).toBe(m.moneda.USD.totalVencido);
});

test("N5 — DSO ponderado por monto; los futuros no diluyen", () => {
  const m = metricasDe([
    cuenta({
      cobros: [
        cobroCartera({ cobroId: "a", moneda: "USD", monto: 100, fechaProgramadaISO: "2026-06-30" }), // edad 10
        cobroCartera({ cobroId: "b", moneda: "USD", monto: 300, fechaProgramadaISO: "2026-05-31" }), // edad 40
        cobroCartera({ cobroId: "c", moneda: "USD", monto: 1000, estado: "PROGRAMADO", fechaProgramadaISO: "2026-08-01" }), // futuro: fuera
      ],
    }),
  ]);
  // (10·100 + 40·300) / 400 = 32.5
  expect(m.moneda.USD.dso).toBe(32.5);
});

test("N6 — DSO null sin exigibles (solo futuros): honestidad, no es 0", () => {
  const m = metricasDe([
    cuenta({
      cobros: [cobroCartera({ moneda: "USD", monto: 500, estado: "PROGRAMADO", fechaProgramadaISO: "2026-09-01" })],
    }),
  ]);
  expect(m.moneda.USD.totalProgramado).toBe(500); // hay cartera, pero nada exigible
  expect(m.moneda.USD.dso).toBeNull();
});

test("N7 — ventana de cobrado (desde, hoy]: bordes exclusivo/inclusivo; primer corte (null) → 0", () => {
  const cuentas = [
    cuenta({
      cobros: [
        cobroCartera({ cobroId: "a", moneda: "USD", monto: 100, estado: "COBRADO", fechaProgramadaISO: "2026-07-01", fechaCobroISO: "2026-07-03" }), // == desde: fuera
        cobroCartera({ cobroId: "b", moneda: "USD", monto: 200, estado: "COBRADO", fechaProgramadaISO: "2026-07-01", fechaCobroISO: "2026-07-04" }), // dentro
        cobroCartera({ cobroId: "c", moneda: "USD", monto: 300, estado: "COBRADO", fechaProgramadaISO: "2026-07-01", fechaCobroISO: "2026-07-10" }), // == hoy: dentro
        cobroCartera({ cobroId: "d", moneda: "USD", monto: 400, estado: "COBRADO", fechaProgramadaISO: "2026-07-01", fechaCobroISO: "2026-07-02" }), // antes: fuera
      ],
    }),
  ];
  expect(metricasDe(cuentas).moneda.USD.totalCobradoDesdeUltimoCorte).toBe(500);
  // primer corte: sin ventana anterior no se declara cobrado (nada que comparar)
  expect(metricasDe(cuentas, { desdeUltimoCorteISO: null }).moneda.USD.totalCobradoDesdeUltimoCorte).toBe(0);
});

test("N8 — proyectadoProximoCorte: vencido fuera; gracia (pasado no-rojo cuenta como hoy); futuro fuera de ventana no", () => {
  const m = metricasDe([
    cuenta({
      cobros: [
        cobroCartera({ cobroId: "a", moneda: "USD", monto: 500, fechaProgramadaISO: "2026-07-01" }), // rojo: fuera
        cobroCartera({ cobroId: "b", moneda: "USD", monto: 100, fechaProgramadaISO: "2026-07-08" }), // amarillo pasado → gracia (hoy ≤ corte)
        cobroCartera({ cobroId: "c", moneda: "USD", monto: 200, estado: "PROGRAMADO", fechaProgramadaISO: "2026-07-15" }), // dentro
        cobroCartera({ cobroId: "d", moneda: "USD", monto: 400, estado: "PROGRAMADO", fechaProgramadaISO: "2026-07-20" }), // después del corte: fuera
      ],
    }),
  ]);
  expect(m.moneda.USD.proyectadoProximoCorte).toBe(300);
});

test("N9 — cobertura: excluida fuera de TODO; sin configurar / PENDIENTE_DATOS / sin cobros declaradas; rojas/amarillas", () => {
  const m = metricasDe([
    cuenta({
      cuentaId: "cx",
      excluidaOperacion: true,
      cobros: [cobroCartera({ moneda: "USD", monto: 999, fechaProgramadaISO: "2026-07-01" })], // rojo, pero excluida
    }),
    cuenta({ cuentaId: "cb", tieneCuenta: false }),
    cuenta({ cuentaId: "cc", estadoCuenta: "PENDIENTE_DATOS", cobros: [] }),
    cuenta({ cuentaId: "cd", cobros: [cobroCartera({ cobroId: "d1", moneda: "USD", monto: 100, fechaProgramadaISO: "2026-07-01" })] }), // roja
    cuenta({ cuentaId: "ce", cobros: [cobroCartera({ cobroId: "e1", moneda: "USD", monto: 50, fechaProgramadaISO: "2026-07-09" })] }), // amarilla
  ]);
  expect(m.cobertura).toEqual({
    cuentasTotales: 4, // la excluida NO cuenta ni en el universo medido
    cuentasConfiguradas: 3,
    cuentasPendienteDatos: 1,
    cuentasSinCobros: 1,
  });
  expect(m.cuentasRojas).toBe(1);
  expect(m.cuentasAmarillas).toBe(1);
  expect(m.moneda.USD.totalVencido).toBe(100); // los 999 de la excluida no entran
});

test("N10 — diasPromedioCobro negativo: el que paga antes se ve (round1)", () => {
  const m = metricasDe([
    cuenta({
      cobros: [
        cobroCartera({ cobroId: "a", moneda: "USD", monto: 100, estado: "COBRADO", fechaProgramadaISO: "2026-07-05", fechaCobroISO: "2026-07-01" }), // -4
        cobroCartera({ cobroId: "b", moneda: "USD", monto: 100, estado: "COBRADO", fechaProgramadaISO: "2026-07-05", fechaCobroISO: "2026-07-04" }), // -1
      ],
    }),
  ]);
  expect(m.moneda.USD.diasPromedioCobro).toBe(-2.5);
});

// ── R) computeRiesgoPago (fase 3) ────────────────────────────────────────────────

test("R1 — sin historia: umbral a secas (15) — atraso 16 sí, 15 no; promedio null", () => {
  const r = computeRiesgoPago(
    {
      cuentas: [
        cuenta({
          cobros: [
            cobroCartera({ cobroId: "a", moneda: "USD", fechaProgramadaISO: "2026-06-24" }), // 16d
            cobroCartera({ cobroId: "b", moneda: "USD", fechaProgramadaISO: "2026-06-25" }), // 15d = umbral: no
          ],
        }),
      ],
    },
    { todayISO: HOY },
  );
  expect(r).toHaveLength(1);
  expect(r[0]).toMatchObject({
    cobroId: "a",
    diasAtraso: 16,
    promedioHistoricoDias: null,
    umbralAplicado: RIESGO_UMBRAL_DIAS,
    excedenteDias: 1,
  });
});

test("R2 — con historia: promedio 10 → umbral 25 — atraso 26 sí, 25 no", () => {
  const r = computeRiesgoPago(
    {
      cuentas: [
        cuenta({
          cobros: [
            cobroCartera({ cobroId: "h1", estado: "COBRADO", fechaProgramadaISO: "2026-01-01", fechaCobroISO: "2026-01-11" }), // +10
            cobroCartera({ cobroId: "h2", estado: "COBRADO", fechaProgramadaISO: "2026-02-01", fechaCobroISO: "2026-02-11" }), // +10
            cobroCartera({ cobroId: "a", moneda: "USD", fechaProgramadaISO: "2026-06-14" }), // 26d
            cobroCartera({ cobroId: "b", moneda: "USD", fechaProgramadaISO: "2026-06-15" }), // 25d: no
          ],
        }),
      ],
    },
    { todayISO: HOY },
  );
  expect(r.map((i) => i.cobroId)).toEqual(["a"]);
  expect(r[0].promedioHistoricoDias).toBe(10);
  expect(r[0].umbralAplicado).toBe(25);
});

test("R3 — promedio negativo NO se clampea: el buen pagador se bandera antes (esa ES la señal)", () => {
  const r = computeRiesgoPago(
    {
      cuentas: [
        cuenta({
          cobros: [
            cobroCartera({ cobroId: "h1", estado: "COBRADO", fechaProgramadaISO: "2026-01-10", fechaCobroISO: "2026-01-05" }), // -5
            cobroCartera({ cobroId: "a", moneda: "USD", fechaProgramadaISO: "2026-06-29" }), // 11d > 10
            cobroCartera({ cobroId: "b", moneda: "USD", fechaProgramadaISO: "2026-06-30" }), // 10d: no
          ],
        }),
      ],
    },
    { todayISO: HOY },
  );
  expect(r.map((i) => i.cobroId)).toEqual(["a"]);
  expect(r[0].umbralAplicado).toBe(10); // (-5) + 15, sin clamp a 15
});

test("R4 — COBRADO no se bandera; cuenta excluida o sin configurar quedan fuera", () => {
  const r = computeRiesgoPago(
    {
      cuentas: [
        cuenta({
          cuentaId: "cx",
          excluidaOperacion: true,
          cobros: [cobroCartera({ cobroId: "x", fechaProgramadaISO: "2026-01-01" })],
        }),
        cuenta({
          cuentaId: "cb",
          tieneCuenta: false,
          cobros: [cobroCartera({ cobroId: "y", fechaProgramadaISO: "2026-01-01" })],
        }),
        cuenta({
          cuentaId: "cc",
          cobros: [cobroCartera({ cobroId: "z", estado: "COBRADO", fechaProgramadaISO: "2026-01-01", fechaCobroISO: "2026-07-01" })],
        }),
      ],
    },
    { todayISO: HOY },
  );
  expect(r).toEqual([]);
});

test("R5 — orden: excedente desc; empate se desempata por cobroId (determinismo)", () => {
  const r = computeRiesgoPago(
    {
      cuentas: [
        cuenta({
          cobros: [
            cobroCartera({ cobroId: "b", fechaProgramadaISO: "2026-06-10" }), // 30d → exc 15
            cobroCartera({ cobroId: "a", fechaProgramadaISO: "2026-06-10" }), // 30d → exc 15 (empate)
            cobroCartera({ cobroId: "c", fechaProgramadaISO: "2026-05-31" }), // 40d → exc 25
          ],
        }),
      ],
    },
    { todayISO: HOY },
  );
  expect(r.map((i) => i.cobroId)).toEqual(["c", "a", "b"]);
});

test("R6 — umbral custom cambia el corte", () => {
  const cartera: CarteraEngineInput = {
    cuentas: [
      cuenta({
        cobros: [
          cobroCartera({ cobroId: "a", fechaProgramadaISO: "2026-07-04" }), // 6d
          cobroCartera({ cobroId: "b", fechaProgramadaISO: "2026-07-05" }), // 5d
        ],
      }),
    ],
  };
  const r = computeRiesgoPago(cartera, { todayISO: HOY, umbralDias: 5 });
  expect(r.map((i) => i.cobroId)).toEqual(["a"]); // 6 > 5; 5 no
  expect(computeRiesgoPago(cartera, { todayISO: HOY })).toEqual([]); // con el default 15, ninguno
});

// ── P) Promesa de pago en computeAlertSet (fase 3) ───────────────────────────────

test("P1 — promesa VIGENTE (futura) suprime VENCIDO y PROXIMO de ese cobro", () => {
  const alertas = computeAlertSet(
    {
      cuentas: [
        cuenta({
          servicios: [servicioCartera()],
          cobros: [
            cobroCartera({ cobroId: "co1", fechaProgramadaISO: "2026-06-30", promesaPagoISO: "2026-07-15" }), // vencido, prometido
            cobroCartera({ cobroId: "co2", fechaProgramadaISO: "2026-07-15", promesaPagoISO: "2026-07-20" }), // próximo, prometido
          ],
        }),
      ],
    },
    { todayISO: HOY },
  );
  expect(alertas).toEqual([]);
});

test("P2 — promesa que vence HOY sigue vigente (silencio)", () => {
  const alertas = computeAlertSet(
    {
      cuentas: [
        cuenta({
          servicios: [servicioCartera()],
          cobros: [cobroCartera({ cobroId: "co1", fechaProgramadaISO: "2026-06-30", promesaPagoISO: HOY })],
        }),
      ],
    },
    { todayISO: HOY },
  );
  expect(alertas).toEqual([]);
});

test("P3 — promesa PASADA → PROMESA_INCUMPLIDA (ALTA) que REEMPLAZA al vencido: 1 sola alerta por cobro", () => {
  const alertas = computeAlertSet(
    {
      cuentas: [
        cuenta({
          servicios: [servicioCartera()],
          cobros: [cobroCartera({ cobroId: "co1", monto: 250, fechaProgramadaISO: "2026-06-30", promesaPagoISO: "2026-07-05" })],
        }),
      ],
    },
    { todayISO: HOY },
  );
  expect(alertas).toHaveLength(1);
  expect(alertas[0]).toMatchObject({
    dedupeKey: "PROMESA_INCUMPLIDA:c1:co1",
    tipo: "PROMESA_INCUMPLIDA",
    urgencia: "ALTA",
    cobroId: "co1",
    evidencia: {
      promesaPago: "2026-07-05",
      fechaProgramada: "2026-06-30",
      monto: 250,
      diasDesdePromesa: 5,
    },
  });
});

test("P4 — COBRADO con promesa pasada → nada (el cobro llegó, la promesa ya no importa)", () => {
  const alertas = computeAlertSet(
    {
      cuentas: [
        cuenta({
          servicios: [servicioCartera()],
          cobros: [
            cobroCartera({ cobroId: "co1", estado: "COBRADO", fechaProgramadaISO: "2026-06-30", promesaPagoISO: "2026-07-05" }),
          ],
        }),
      ],
    },
    { todayISO: HOY },
  );
  expect(alertas).toEqual([]);
});

test("P5 — catch-up: INCONSISTENCIA_CICLO se sigue emitiendo aunque la promesa calle el vencido", () => {
  const alertas = computeAlertSet(
    {
      cuentas: [
        cuenta({
          servicios: [servicioCartera()],
          cobros: [
            cobroCartera({
              cobroId: "co1",
              origen: "CATCH_UP",
              estado: "PROGRAMADO",
              fechaProgramadaISO: "2026-06-30",
              promesaPagoISO: "2026-07-20",
            }),
          ],
        }),
      ],
    },
    { todayISO: HOY },
  );
  expect(keysOf(alertas)).toEqual(["INCONSISTENCIA_CICLO:c1:co1"]);
});

test("P6 — regresión: fixture SIN el campo promesa → comportamiento idéntico al de siempre", () => {
  const alertas = computeAlertSet(
    {
      cuentas: [
        cuenta({
          servicios: [servicioCartera()],
          cobros: [cobroCartera({ cobroId: "co1", fechaProgramadaISO: "2026-06-30" })],
        }),
      ],
    },
    { todayISO: HOY },
  );
  expect(keysOf(alertas)).toEqual(["COBRO_VENCIDO:c1:co1"]);
});

// ── Q) finQuincenaISO + diffDays (cola de cobros) ────────────────────────────────

test("Q1 — finQuincenaISO: 1-15 → día 15; 16+ → fin de mes; febrero clampeado", () => {
  expect(finQuincenaISO("2026-07-01")).toBe("2026-07-15");
  expect(finQuincenaISO("2026-07-15")).toBe("2026-07-15");
  expect(finQuincenaISO("2026-07-16")).toBe("2026-07-31");
  expect(finQuincenaISO("2026-07-31")).toBe("2026-07-31");
  expect(finQuincenaISO("2026-02-20")).toBe("2026-02-28"); // no bisiesto
  expect(finQuincenaISO("2028-02-20")).toBe("2028-02-29"); // bisiesto
});

test("Q2 — diffDays exportado: signo y cero", () => {
  expect(diffDays("2026-07-01", "2026-07-10")).toBe(9);
  expect(diffDays("2026-07-10", "2026-07-01")).toBe(-9);
  expect(diffDays("2026-07-10", "2026-07-10")).toBe(0);
});

// ── O) proyectarCostos + computeCajaNeta (fase 4) ────────────────────────────────

function costoProy(over: Partial<CostoProyeccionInput> = {}): CostoProyeccionInput {
  return {
    costoId: "k1",
    nombre: "Herramienta demo",
    categoria: "HERRAMIENTA",
    monto: 100,
    moneda: "CRC",
    frecuencia: "MENSUAL",
    activo: true,
    ...over,
  };
}

const sum2 = (a: number, b: number) => Math.round((a + b) * 100) / 100;

test("O1 — ANUAL se mensualiza /12 con round2 único", () => {
  const p = proyectarCostos(
    [
      costoProy({ costoId: "a", monto: 1200, frecuencia: "ANUAL" }),
      costoProy({ costoId: "b", nombre: "Otra", monto: 1000, frecuencia: "ANUAL", moneda: "USD" }),
    ],
    { todayISO: HOY },
  );
  const sep = p.buckets.find((b) => b.key === "2026-09")!;
  expect(sep.totales.CRC).toBe(100); // 1200/12
  expect(sep.totales.USD).toBe(83.33); // 1000/12 → round2 una sola vez
  expect(p.totalMensual).toEqual({ CRC: 100, USD: 83.33 });
});

test("O2 — inactivo excluido de buckets y de totalMensual", () => {
  const p = proyectarCostos(
    [costoProy({ activo: false, monto: 999_999 })],
    { todayISO: HOY },
  );
  expect(p.totalMensual).toEqual({ CRC: 0, USD: 0 });
  expect(p.buckets.every((b) => b.costos.length === 0 && b.totales.CRC === 0)).toBe(true);
});

test("O3 — bucket mes recibe el mensual completo; bucket quincena la mitad", () => {
  const p = proyectarCostos([costoProy({ monto: 100 })], { todayISO: HOY });
  expect(p.buckets.find((b) => b.key === "2026-09")!.totales.CRC).toBe(100);
  expect(p.buckets.find((b) => b.key === "2026-07-Q2")!.totales.CRC).toBe(50);
  expect(p.buckets.find((b) => b.key === "2026-08-Q1")!.totales.CRC).toBe(50);
});

test("O4 — el split de quincena no pierde centavos (Q1+Q2 === mensual)", () => {
  const p = proyectarCostos([costoProy({ monto: 100.01 })], { todayISO: HOY });
  const q1 = p.buckets.find((b) => b.key === "2026-08-Q1")!.totales.CRC;
  const q2 = p.buckets.find((b) => b.key === "2026-08-Q2")!.totales.CRC;
  expect(sum2(q1, q2)).toBe(100.01);
  // Y el mes entero (bucket mensual) también lleva el mensual exacto.
  expect(p.buckets.find((b) => b.key === "2026-09")!.totales.CRC).toBe(100.01);
});

test("O5 — keys idénticas a proyectarIngresos con los mismos opts (incl. hoy>15 y clamp)", () => {
  const casos = [
    { todayISO: HOY },
    { todayISO: "2026-07-20" }, // Q1 del mes actual no se emite (espejo M9)
    { todayISO: HOY, horizonteMeses: 2, mesesEnQuincenas: 6 }, // clamp compartido
    { todayISO: HOY, mesesEnQuincenas: 0 },
  ];
  for (const opts of casos) {
    const entra = proyectarIngresos([], opts).buckets.map((b) => b.key);
    const sale = proyectarCostos([], opts).buckets.map((b) => b.key);
    expect(sale, JSON.stringify(opts)).toEqual(entra);
  }
});

test("O6 — CRC y USD jamás sumados: totales separados en el mismo bucket", () => {
  const p = proyectarCostos(
    [
      costoProy({ costoId: "a", monto: 200, moneda: "CRC" }),
      costoProy({ costoId: "b", nombre: "Zoom", monto: 300, moneda: "USD" }),
    ],
    { todayISO: HOY },
  );
  const sep = p.buckets.find((b) => b.key === "2026-09")!;
  expect(sep.totales).toEqual({ CRC: 200, USD: 300 });
});

test("O7 — totalMensual por moneda = suma de mensualizados ACTIVOS", () => {
  const p = proyectarCostos(
    [
      costoProy({ costoId: "a", monto: 100, moneda: "CRC" }),
      costoProy({ costoId: "b", nombre: "Zoom", monto: 1200, moneda: "USD", frecuencia: "ANUAL" }),
      costoProy({ costoId: "c", nombre: "Pausada", monto: 500, activo: false }),
    ],
    { todayISO: HOY },
  );
  expect(p.totalMensual).toEqual({ CRC: 100, USD: 100 });
});

test("O8 — determinismo: input desordenado → mismo output", () => {
  const costos = [
    costoProy({ costoId: "b", nombre: "Beta", monto: 50 }),
    costoProy({ costoId: "a", nombre: "Alfa", monto: 75, moneda: "USD" }),
    costoProy({ costoId: "c", nombre: "Alfa", monto: 25 }), // mismo nombre → tie-break por id
  ];
  const p1 = proyectarCostos(costos, { todayISO: HOY });
  const p2 = proyectarCostos([...costos].reverse(), { todayISO: HOY });
  expect(p1).toEqual(p2);
  expect(p1.buckets[0].costos.map((c) => c.costoId)).toEqual(["a", "c", "b"]);
});

test("O9 — neto = entra − sale por bucket y por moneda", () => {
  const entra = proyectarIngresos(
    [cobroProy({ cobroId: "in1", fechaProgramadaISO: "2026-09-05", monto: 1000, moneda: "CRC" })],
    { todayISO: HOY },
  );
  const sale = proyectarCostos([costoProy({ monto: 300 })], { todayISO: HOY });
  const caja = computeCajaNeta(entra, sale);
  const sep = caja.buckets.find((b) => b.key === "2026-09")!;
  expect(sep.entra.CRC).toBe(1000);
  expect(sep.sale.CRC).toBe(300);
  expect(sep.neto.CRC).toBe(700);
  expect(sep.neto.USD).toBe(0);
});

test("O10 — costos vacíos → neto === entra en cada bucket", () => {
  const entra = proyectarIngresos(
    [cobroProy({ cobroId: "in1", fechaProgramadaISO: "2026-08-20", monto: 500, moneda: "USD" })],
    { todayISO: HOY },
  );
  const caja = computeCajaNeta(entra, proyectarCostos([], { todayISO: HOY }));
  for (const b of caja.buckets) {
    expect(b.neto).toEqual(b.entra);
    expect(b.sale).toEqual({ CRC: 0, USD: 0 });
  }
});

test("O11 — vencidos del lado entra viajan APARTE: ni en buckets ni en el neto", () => {
  const entra = proyectarIngresos(
    [cobroProy({ cobroId: "v1", fechaProgramadaISO: "2026-06-01", monto: 500, moneda: "CRC" })],
    { todayISO: HOY },
  );
  const caja = computeCajaNeta(entra, proyectarCostos([], { todayISO: HOY }));
  expect(caja.vencidosAparte).toEqual({ totales: { CRC: 500, USD: 0 }, count: 1 });
  expect(caja.totalesHorizonte.entra).toEqual({ CRC: 0, USD: 0 }); // el vencido NO entra al horizonte
  expect(caja.buckets.every((b) => b.entra.CRC === 0)).toBe(true);
});

test("O12 — totalesHorizonte = Σ de los buckets (entra/sale/neto por moneda)", () => {
  const entra = proyectarIngresos(
    [
      cobroProy({ cobroId: "i1", fechaProgramadaISO: "2026-07-20", monto: 400, moneda: "CRC" }),
      cobroProy({ cobroId: "i2", fechaProgramadaISO: "2026-10-10", monto: 100, moneda: "USD" }),
    ],
    { todayISO: HOY },
  );
  const sale = proyectarCostos([costoProy({ monto: 60 })], { todayISO: HOY });
  const caja = computeCajaNeta(entra, sale);
  const suma = { entra: { CRC: 0, USD: 0 }, sale: { CRC: 0, USD: 0 }, neto: { CRC: 0, USD: 0 } };
  for (const b of caja.buckets) {
    for (const mon of ["CRC", "USD"] as const) {
      suma.entra[mon] = sum2(suma.entra[mon], b.entra[mon]);
      suma.sale[mon] = sum2(suma.sale[mon], b.sale[mon]);
      suma.neto[mon] = sum2(suma.neto[mon], b.neto[mon]);
    }
  }
  expect(caja.totalesHorizonte).toEqual(suma);
});

test("O13 — neto negativo se emite tal cual (sin clamp)", () => {
  const entra = proyectarIngresos([], { todayISO: HOY });
  const sale = proyectarCostos([costoProy({ monto: 100 })], { todayISO: HOY });
  const caja = computeCajaNeta(entra, sale);
  const sep = caja.buckets.find((b) => b.key === "2026-09")!;
  expect(sep.neto.CRC).toBe(-100);
  expect(caja.totalesHorizonte.neto.CRC).toBeLessThan(0);
});

test("O14 — opts custom en ambos lados → mismas keys y matcheo correcto", () => {
  const opts = { todayISO: HOY, horizonteMeses: 3, mesesEnQuincenas: 1 };
  const entra = proyectarIngresos(
    [cobroProy({ cobroId: "i1", fechaProgramadaISO: "2026-08-10", monto: 900, moneda: "CRC" })],
    opts,
  );
  const sale = proyectarCostos([costoProy({ monto: 200 })], opts);
  const caja = computeCajaNeta(entra, sale);
  expect(caja.buckets.map((b) => b.key)).toEqual(entra.buckets.map((b) => b.key));
  const ago = caja.buckets.find((b) => b.key === "2026-08")!; // mes (fuera de quincenas)
  expect(ago.neto.CRC).toBe(700); // 900 − 200
});

// ── O bis) proyectarGastos (gastos puntuales) + baja definitiva de costos ─────────

function gastoProy(
  fechaISO: string,
  monto: number,
  moneda: "CRC" | "USD" = "CRC",
  id = "g1",
): GastoProyeccionInput {
  return { gastoId: id, nombre: `Gasto ${id}`, monto, moneda, fechaISO };
}

test("O15 — gasto futuro cae ENTERO en el bucket de su fecha (sin mensualizar ni partir)", () => {
  const p = proyectarGastos(
    [
      gastoProy("2026-08-10", 500, "CRC", "a"), // quincena 2026-08-Q1
      gastoProy("2026-09-20", 750, "CRC", "b"), // mes 2026-09
    ],
    { todayISO: HOY },
  );
  const q1ago = p.buckets.find((b) => b.key === "2026-08-Q1")!;
  const sep = p.buckets.find((b) => b.key === "2026-09")!;
  expect(q1ago.totales.CRC).toBe(500); // entero, NO la mitad de quincena
  expect(q1ago.gastos.map((g) => g.monto)).toEqual([500]);
  expect(sep.totales.CRC).toBe(750);
  expect(sep.gastos.map((g) => g.monto)).toEqual([750]);
  expect(p.totalFuturo).toEqual({ CRC: 1250, USD: 0 });
  expect(p.pasados).toBe(0);
  expect(p.fueraDeHorizonte).toBe(0);
});

test("O16 — gasto de HOY cae en el primer bucket (quincena en curso): hoy ≤15 y hoy >15", () => {
  const antes = proyectarGastos([gastoProy("2026-07-10", 100)], { todayISO: "2026-07-10" });
  expect(antes.buckets[0].key).toBe("2026-07-Q1");
  expect(antes.buckets[0].gastos.map((g) => g.monto)).toEqual([100]);
  expect(antes.pasados).toBe(0);

  const despues = proyectarGastos([gastoProy("2026-07-20", 100)], { todayISO: "2026-07-20" });
  expect(despues.buckets[0].key).toBe("2026-07-Q2"); // la Q1 del mes actual no se emite
  expect(despues.buckets[0].gastos.map((g) => g.monto)).toEqual([100]);
  expect(despues.pasados).toBe(0);
});

test("O17 — gasto pasado (fecha < hoy): pasados incrementa, cero en buckets y en totalFuturo", () => {
  const p = proyectarGastos([gastoProy("2026-07-09", 400)], { todayISO: HOY });
  expect(p.pasados).toBe(1);
  expect(p.totalFuturo).toEqual({ CRC: 0, USD: 0 });
  expect(p.buckets.every((b) => b.gastos.length === 0)).toBe(true);
});

test("O18 — gasto más allá del horizonte → fueraDeHorizonte, no bucket", () => {
  // Horizonte default 6 meses desde julio → termina 2026-12-31.
  const p = proyectarGastos([gastoProy("2027-02-01", 300)], { todayISO: HOY });
  expect(p.fueraDeHorizonte).toBe(1);
  expect(p.totalFuturo).toEqual({ CRC: 0, USD: 0 });
  expect(p.buckets.every((b) => b.gastos.length === 0)).toBe(true);
});

test("O19 — keys de proyectarGastos idénticas a proyectarCostos con los mismos opts (clamp + hoy>15)", () => {
  const casos = [
    { todayISO: HOY },
    { todayISO: "2026-07-20" }, // hoy>15: la Q1 del mes actual no se emite
    { todayISO: HOY, horizonteMeses: 2, mesesEnQuincenas: 6 }, // clamp compartido
    { todayISO: HOY, mesesEnQuincenas: 0 },
  ];
  for (const opts of casos) {
    const gastos = proyectarGastos([], opts).buckets.map((b) => b.key);
    const costos = proyectarCostos([], opts).buckets.map((b) => b.key);
    expect(gastos, JSON.stringify(opts)).toEqual(costos);
  }
});

test("O20 — computeCajaNeta(entra, sale, gastos): sale = costos+gastos por key/moneda; neto resta ambos", () => {
  const entra = proyectarIngresos(
    [cobroProy({ cobroId: "in1", fechaProgramadaISO: "2026-09-05", monto: 1000, moneda: "CRC" })],
    { todayISO: HOY },
  );
  const sale = proyectarCostos([costoProy({ monto: 300, moneda: "CRC" })], { todayISO: HOY }); // mes completo = 300
  const gastos = proyectarGastos([gastoProy("2026-09-10", 200, "CRC")], { todayISO: HOY });
  const caja = computeCajaNeta(entra, sale, gastos);
  const sep = caja.buckets.find((b) => b.key === "2026-09")!;
  expect(sep.entra.CRC).toBe(1000);
  expect(sep.sale.CRC).toBe(500); // 300 costo + 200 gasto
  expect(sep.neto.CRC).toBe(500); // 1000 − (300 + 200)
  expect(sep.neto.USD).toBe(0);
});

test("O21 — regresión: computeCajaNeta sin 3er arg === con proyectarGastos([]) (toEqual profundo)", () => {
  const opts = { todayISO: HOY };
  const entra = proyectarIngresos(
    [cobroProy({ cobroId: "in1", fechaProgramadaISO: "2026-08-20", monto: 500, moneda: "USD" })],
    opts,
  );
  const sale = proyectarCostos([costoProy({ monto: 120 })], opts);
  const sinGastos = computeCajaNeta(entra, sale);
  const conVacios = computeCajaNeta(entra, sale, proyectarGastos([], opts));
  expect(conVacios).toEqual(sinGastos);
});

test("O22 — CRC y USD jamás sumados en un bucket de gastos", () => {
  const p = proyectarGastos(
    [
      gastoProy("2026-08-10", 200, "CRC", "a"),
      gastoProy("2026-08-10", 300, "USD", "b"),
    ],
    { todayISO: HOY },
  );
  const q1ago = p.buckets.find((b) => b.key === "2026-08-Q1")!;
  expect(q1ago.totales).toEqual({ CRC: 200, USD: 300 });
  expect(p.totalFuturo).toEqual({ CRC: 200, USD: 300 });
});

test("O23 — determinismo de gastos: input desordenado → mismo output (orden estable por fecha e id)", () => {
  const gastos = [
    gastoProy("2026-08-10", 100, "CRC", "b"),
    gastoProy("2026-08-10", 100, "CRC", "a"), // misma fecha → tie-break por id
    gastoProy("2026-07-18", 50, "USD", "c"),
  ];
  const p1 = proyectarGastos(gastos, { todayISO: HOY });
  const p2 = proyectarGastos([...gastos].reverse(), { todayISO: HOY });
  expect(p1).toEqual(p2);
  const q1ago = p1.buckets.find((b) => b.key === "2026-08-Q1")!;
  expect(q1ago.gastos.map((g) => g.gastoId)).toEqual(["a", "b"]);
});

test("O24 — costo con finalizadoEl PASADO (< hoy): fuera de TODOS los buckets y del totalMensual", () => {
  const p = proyectarCostos(
    [costoProy({ monto: 500, moneda: "CRC", finalizadoEl: "2026-06-30" })], // baja antes de HOY
    { todayISO: HOY },
  );
  expect(p.totalMensual).toEqual({ CRC: 0, USD: 0 });
  expect(p.buckets.every((b) => b.costos.length === 0 && b.totales.CRC === 0)).toBe(true);
});

test("O25 — costo con finalizadoEl FUTURO: presente hasta el bucket de la baja (quincena entera); burn lo incluye", () => {
  // baja 2026-08-20: entran jul entero + ago-Q1 (desde 08-01) + ago-Q2 (desde 08-16); sep NO.
  const p = proyectarCostos(
    [costoProy({ monto: 100, moneda: "CRC", finalizadoEl: "2026-08-20" })],
    { todayISO: HOY },
  );
  const presentes = p.buckets.filter((b) => b.totales.CRC > 0).map((b) => b.key);
  expect(presentes).toEqual(["2026-07-Q1", "2026-07-Q2", "2026-08-Q1", "2026-08-Q2"]);
  // sep en adelante: el bucket mensual arranca 2026-09-01 > 2026-08-20 → excluido.
  expect(p.buckets.find((b) => b.key === "2026-09")!.totales.CRC).toBe(0);
  // la quincena de la baja entra ENTERA (mitad del mensual, sin prorrateo diario).
  expect(p.buckets.find((b) => b.key === "2026-08-Q2")!.totales.CRC).toBe(50);
  // sigue quemando hoy (baja >= hoy) → el burn lo cuenta.
  expect(p.totalMensual).toEqual({ CRC: 100, USD: 0 });
});

test("O26 — regresión: proyectarCostos SIN finalizadoEl → output idéntico al histórico", () => {
  const p = proyectarCostos(
    [
      costoProy({ costoId: "a", nombre: "Alfa", monto: 100, moneda: "CRC" }),
      costoProy({ costoId: "b", nombre: "Beta", monto: 1200, moneda: "USD", frecuencia: "ANUAL" }),
    ],
    { todayISO: HOY },
  );
  expect(p.totalMensual).toEqual({ CRC: 100, USD: 100 }); // 1200/12 = 100
  expect(p.buckets.find((b) => b.key === "2026-09")!.totales).toEqual({ CRC: 100, USD: 100 }); // mes completo
  expect(p.buckets.find((b) => b.key === "2026-07-Q2")!.totales).toEqual({ CRC: 50, USD: 50 }); // quincena: mitad
  // sin baja, el costo está en TODOS los buckets del horizonte.
  expect(p.buckets.every((b) => b.costos.length === 2)).toBe(true);
});

// ── G) Golden de proyectarIngresos ───────────────────────────────────────────────

test("G1 — golden: el refactor no mueve un solo número de la proyección", async () => {
  const { GOLDEN_COBROS, GOLDEN_CASES } = await import("./__fixtures__/proyeccion-golden-input");
  const golden = (await import("./__fixtures__/proyeccion-golden.json")).default as Record<
    string,
    unknown
  >;
  expect(GOLDEN_CASES.length).toBeGreaterThan(0);
  for (const gc of GOLDEN_CASES) {
    const actual = proyectarIngresos(GOLDEN_COBROS, { todayISO: gc.todayISO, ...gc.opts });
    expect(golden[gc.nombre], `caso ${gc.nombre}`).toBeDefined();
    expect(actual, `caso ${gc.nombre}`).toEqual(golden[gc.nombre]);
  }
});

test("G2 — golden: la caja neta (entra − costos − gastos) no mueve un número", async () => {
  const { G2_COBROS, G2_COSTOS, G2_GASTOS, G2_OPTS } = await import(
    "./__fixtures__/caja-neta-golden-input"
  );
  const golden = (await import("./__fixtures__/caja-neta-golden.json")).default as Record<
    string,
    unknown
  >;
  const entra = proyectarIngresos(G2_COBROS, G2_OPTS);
  const sale = proyectarCostos(G2_COSTOS, G2_OPTS);
  const gastos = proyectarGastos(G2_GASTOS, G2_OPTS);
  const cajaNeta = computeCajaNeta(entra, sale, gastos);
  expect({
    cajaNeta,
    saleTotalMensual: sale.totalMensual,
    gastosTotalFuturo: gastos.totalFuturo,
    gastosPasados: gastos.pasados,
    gastosFueraDeHorizonte: gastos.fueraDeHorizonte,
  }).toEqual(golden);
});
