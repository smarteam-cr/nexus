/**
 * scripts/seed-cobranza-demo-historia.ts
 *
 * FASE 3 — siembra HISTORIA sobre la data demo existente (corré primero
 * seed-cobranza-demo.ts) para que la analítica tenga qué mostrar desde el día 1:
 *
 *   1) HISTORIA DE PAGOS (cobros MANUAL + chokepoint cambiarEstadoCobro):
 *      · A-VERDE  (USD): 3 COBRADO pagados 2-3 días ANTES → diasPromedioCobro
 *        negativo (el buen pagador) y umbral de riesgo más exigente.
 *      · B-AMARILLO (USD): 3 COBRADO pagados +8/+10/+12 días tarde → "paga a
 *        +10 d" en la tabla de riesgo.
 *      · C-ROJO (CRC): 2 COBRADO +15/+25 (moroso con historia) + 4 VENCIDOS a
 *        15/45/75/100 días → llena los 4 buckets del aging y banderea riesgo
 *        (45/75/100 superan promedio+15; el de 15 días no).
 *      · F-SIN-PROYECTO (USD): 2 COBRADO puntuales (día exacto).
 *   2) PROMESAS: el vencido de 15 días recibe promesa VIGENTE (hoy+5 — sus
 *      alertas se callan, chip azul) y el de 45 días una promesa PASADA
 *      (hoy−3 — chip rojo; el próximo corte emite PROMESA_INCUMPLIDA).
 *   3) SERIE RETROACTIVA: 10 SnapshotCartera semanales hacia atrás con métricas
 *      REALES — el engine puro se corre "como si" cada lunes pasado (los cobros
 *      pagados después de esa fecha se replayean como pendientes; las promesas
 *      de hoy no existen en el pasado). Nada de números fabricados: los charts
 *      de tendencia muestran la evolución que esa cartera habría medido.
 *      triggeredBy="seed-demo-historia" para que el cleanup los borre.
 *
 * Idempotente: salta la historia si la cuenta ya tiene cobros marcados y la
 * serie si ya hay snapshots del seed. DRY-RUN por default; escribe SOLO con
 * --apply (local == PROD — el usuario revisa y aprueba).
 * LIMPIEZA: scripts/cleanup-cobranza-demo.ts (borra cuentas demo por cascade,
 * snapshots del seed, y con --snapshots-todos TODA la historia de cortes).
 *
 *   npx tsx scripts/seed-cobranza-demo-historia.ts            # dry-run
 *   npx tsx scripts/seed-cobranza-demo-historia.ts --apply    # aplica
 */
import "dotenv/config";
import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@prisma/client";
import { cambiarEstadoCobro } from "@/lib/cobranza/mutations";
import { buildCarteraEngineInput } from "@/lib/cobranza/queries";
import {
  addDaysISO,
  computeAlertSet,
  computeMetricasCartera,
  type CarteraEngineInput,
} from "@/lib/cobranza/engine";
import { crDateParts } from "@/lib/jobs/time";

const APPLY = process.argv.includes("--apply");
const SEED_EMAIL = "seed-cobranza-demo";
const MARK = "[demo cobranza]";
const MARK_H = "[demo cobranza historia]";
const TRIGGER = "seed-demo-historia";
const CORTES_RETRO = 10; // ~2.5 meses de serie semanal

const dayUTC = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

/** Historia por escenario: COBRADOs con su puntualidad + vencidos del aging. */
const HISTORIA: Record<
  string,
  {
    cobrados: Array<{ progDias: number; delayDias: number; monto: number }>;
    vencidos: Array<{ progDias: number; monto: number; promesaDias?: number }>;
  }
> = {
  "A-VERDE": {
    // Buen pagador: paga 2-3 días antes (promedio ≈ −2.7).
    cobrados: [
      { progDias: -70, delayDias: -3, monto: 1200 },
      { progDias: -42, delayDias: -2, monto: 1200 },
      { progDias: -14, delayDias: -3, monto: 1200 },
    ],
    vencidos: [],
  },
  "B-AMARILLO": {
    // Tardío consistente: +8/+10/+12 (promedio +10 → umbral de riesgo 25).
    cobrados: [
      { progDias: -63, delayDias: 8, monto: 800 },
      { progDias: -42, delayDias: 10, monto: 800 },
      { progDias: -21, delayDias: 12, monto: 800 },
    ],
    vencidos: [],
  },
  "C-ROJO": {
    // Moroso con historia (+15/+25 → umbral 35) y 4 vencidos que llenan el aging.
    cobrados: [
      { progDias: -80, delayDias: 15, monto: 500_000 },
      { progDias: -60, delayDias: 25, monto: 500_000 },
    ],
    vencidos: [
      { progDias: -15, monto: 400_000, promesaDias: 5 }, // promesa VIGENTE → alertas calladas
      { progDias: -45, monto: 350_000, promesaDias: -3 }, // promesa PASADA → PROMESA_INCUMPLIDA
      { progDias: -75, monto: 300_000 },
      { progDias: -100, monto: 250_000 },
    ],
  },
  "F-SIN-PROYECTO": {
    // Puntual exacto (promedio 0).
    cobrados: [
      { progDias: -56, delayDias: 0, monto: 450 },
      { progDias: -28, delayDias: 0, monto: 450 },
    ],
    vencidos: [],
  },
};

/**
 * Replay honesto de la cartera "como si" fuera la fecha D: un cobro pagado
 * DESPUÉS de D todavía estaba pendiente, y las promesas registradas hoy no
 * existían. Todo lo demás (fechas programadas, montos) es idéntico.
 */
function carteraComoSi(cartera: CarteraEngineInput, dISO: string): CarteraEngineInput {
  return {
    cuentas: cartera.cuentas.map((cu) => ({
      ...cu,
      cobros: cu.cobros.map((c) => {
        const pagadoDespues = c.estado === "COBRADO" && !!c.fechaCobroISO && c.fechaCobroISO > dISO;
        return {
          ...c,
          estado: pagadoDespues ? "POR_COBRAR" : c.estado,
          fechaCobroISO: pagadoDespues ? null : c.fechaCobroISO,
          promesaPagoISO: null,
        };
      }),
    })),
  };
}

async function main() {
  console.log(`Modo: ${APPLY ? "APPLY (escribe)" : "DRY-RUN (no escribe)"}\n`);
  const todayISO = crDateParts(new Date()).dateKey;

  // ── Localizar las cuentas demo por escenario (marca en la descripción/fuente) ─
  const cuentas = await prisma.cuentaFinanciera.findMany({
    where: {
      OR: [{ notas: { contains: MARK } }, { fuenteIdExterno: { startsWith: "demo-" } }],
    },
    select: {
      id: true,
      moneda: true,
      fuenteIdExterno: true,
      client: { select: { name: true } },
      servicios: { select: { id: true, descripcion: true, estado: true } },
      cobros: { where: { notas: { contains: MARK_H } }, select: { id: true } },
    },
  });
  if (cuentas.length === 0) {
    console.log("⚠ No hay cuentas demo — corré primero seed-cobranza-demo.ts --apply.");
    return;
  }

  const porEscenario = new Map<string, (typeof cuentas)[number]>();
  for (const c of cuentas) {
    if (c.fuenteIdExterno === "demo-cobranza-sin-proyecto") {
      porEscenario.set("F-SIN-PROYECTO", c);
      continue;
    }
    for (const key of ["A-VERDE", "B-AMARILLO", "C-ROJO"]) {
      if (c.servicios.some((s) => s.descripcion?.includes(key))) porEscenario.set(key, c);
    }
  }

  // ── 1+2) Historia de pagos + vencidos + promesas ──────────────────────────────
  for (const [key, spec] of Object.entries(HISTORIA)) {
    const cuenta = porEscenario.get(key);
    if (!cuenta) {
      console.log(`■ ${key}: cuenta demo no encontrada — salteado.`);
      continue;
    }
    if (cuenta.cobros.length > 0) {
      console.log(`■ ${key} (${cuenta.client.name}): historia ya sembrada (${cuenta.cobros.length} cobros) — salteado.`);
      continue;
    }
    const servicio = cuenta.servicios.find((s) => s.estado === "ACTIVO") ?? cuenta.servicios[0];
    if (!servicio) {
      console.log(`■ ${key}: sin servicio — salteado.`);
      continue;
    }

    console.log(`■ ${key} → "${cuenta.client.name}" (${cuenta.moneda})`);
    for (const h of spec.cobrados) {
      const prog = addDaysISO(todayISO, h.progDias);
      const pago = addDaysISO(prog, h.delayDias);
      console.log(
        `   · COBRADO ${cuenta.moneda} ${h.monto.toLocaleString("es-CR")} — programado ${prog}, pagado ${pago} (${h.delayDias >= 0 ? "+" : ""}${h.delayDias} d)`,
      );
      if (!APPLY) continue;
      const cobro = await prisma.cobro.create({
        data: {
          servicioId: servicio.id,
          cuentaId: cuenta.id,
          planId: null,
          numCuota: null, // MANUAL: el reconcile jamás lo toca (regla G6)
          periodo: prog.slice(0, 7),
          fechaProgramada: dayUTC(prog),
          monto: h.monto,
          moneda: cuenta.moneda as never,
          origen: "MANUAL",
          notas: `${MARK_H} pago histórico`,
        },
      });
      // Chokepoint (INV3): COBRADO con confirmadoPor + fechaCobro retrodatada.
      await cambiarEstadoCobro(cobro.id, { estado: "COBRADO", fechaCobro: pago }, SEED_EMAIL);
    }
    for (const v of spec.vencidos) {
      const prog = addDaysISO(todayISO, v.progDias);
      const promesa = v.promesaDias !== undefined ? addDaysISO(todayISO, v.promesaDias) : null;
      console.log(
        `   · VENCIDO ${cuenta.moneda} ${v.monto.toLocaleString("es-CR")} — programado ${prog} (${-v.progDias} d de atraso)${promesa ? ` · promesa ${promesa}${v.promesaDias! >= 0 ? " (vigente)" : " (incumplida)"}` : ""}`,
      );
      if (!APPLY) continue;
      const cobro = await prisma.cobro.create({
        data: {
          servicioId: servicio.id,
          cuentaId: cuenta.id,
          planId: null,
          numCuota: null,
          periodo: prog.slice(0, 7),
          fechaProgramada: dayUTC(prog),
          monto: v.monto,
          moneda: cuenta.moneda as never,
          origen: "MANUAL",
          notas: `${MARK_H} vencido aging`,
        },
      });
      await cambiarEstadoCobro(cobro.id, { estado: "POR_COBRAR" }, SEED_EMAIL);
      if (promesa) await cambiarEstadoCobro(cobro.id, { promesaPago: promesa }, SEED_EMAIL);
    }
  }

  // ── 3) Serie retroactiva de cortes con métricas REALES del engine ─────────────
  const snapsSeed = await prisma.snapshotCartera.count({ where: { triggeredBy: TRIGGER } });
  if (snapsSeed > 0) {
    console.log(`\n■ SERIE: ya hay ${snapsSeed} snapshot(s) del seed — salteada.`);
  } else {
    console.log(
      `\n■ SERIE: ${CORTES_RETRO} cortes semanales retroactivos (${addDaysISO(todayISO, -7 * CORTES_RETRO)} → ${addDaysISO(todayISO, -7)}), métricas del engine "como si" cada fecha (triggeredBy=${TRIGGER}).`,
    );
    if (APPLY) {
      const cartera = await buildCarteraEngineInput(); // estado REAL post-historia
      for (let i = CORTES_RETRO; i >= 1; i--) {
        const d = addDaysISO(todayISO, -7 * i);
        const replay = carteraComoSi(cartera, d);
        const desde = i === CORTES_RETRO ? null : addDaysISO(d, -7); // el 1º es el 1º (sin ventana)
        const metricas = computeMetricasCartera(replay, {
          todayISO: d,
          desdeUltimoCorteISO: desde,
          proximoCorteISO: addDaysISO(d, 7),
        });
        const alertSet = computeAlertSet(replay, { todayISO: d });
        await prisma.snapshotCartera.create({
          data: {
            capturedAt: new Date(`${d}T13:00:00.000Z`), // lunes 7:00 CR
            alertSet: alertSet as unknown as Prisma.InputJsonValue,
            resumen: { seed: true, totalAlertas: alertSet.length } as unknown as Prisma.InputJsonValue,
            metricas: metricas as unknown as Prisma.InputJsonValue,
            triggeredBy: TRIGGER,
          },
        });
        console.log(
          `   · corte ${d}: vencido ₡${metricas.moneda.CRC.totalVencido.toLocaleString("es-CR")} / $${metricas.moneda.USD.totalVencido.toLocaleString("es-CR")} · ${alertSet.length} alertas`,
        );
      }
    }
  }

  console.log(
    `\n${APPLY ? "✓ Aplicado. Corré \"Correr corte ahora\" (tab Digest) para el corte de HOY — con él, el tab Reportes pinta las tendencias completas, el riesgo y las promesas." : "Dry-run: corré con --apply para escribir."}\nLimpieza total: npx tsx scripts/cleanup-cobranza-demo.ts [--snapshots-todos] → --apply`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
