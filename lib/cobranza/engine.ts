/**
 * lib/cobranza/engine.ts
 *
 * MOTOR PURO del módulo Cobranza: materialización de cobros desde el plan de
 * pago, reconciliación idempotente, catch-up, semáforos y cómputo de alertas.
 *
 * Reglas de la casa (patrón lib/portfolio/summary.ts + lib/timeline/weeks.ts):
 *  - CERO Prisma/red/env: inputs y outputs son tipos propios serializables.
 *  - TODA la matemática de fechas en UTC (getUTC* / setUTC*) — las fechas de
 *    calendario viven como instantes UTC (patrón anchorStartDate); mezclar
 *    getters locales reproduce el hydration mismatch que ya nos quemó.
 *  - Montos como number redondeado a 2 decimales; la última cuota absorbe el
 *    residuo de redondeo (invariante: la suma de un plan completo === montoTotal).
 *  - Autonomía en la derivación, confirmación en el dinero: este motor PROPONE
 *    (drafts); nunca marca nada COBRADO — eso es de la persona (INV3).
 */

// ── Tipos de input (client-safe, sin Prisma) ────────────────────────────────────

export interface ServicioEngineInput {
  id: string;
  montoTotal: number; // para SUSCRIPCION = monto MENSUAL
  moneda: "CRC" | "USD";
  fechaInicioFacturacion: string | null; // ISO date (YYYY-MM-DD o ISO completo)
  duracionMeses: number | null;
  diaCobroAncla: number | null; // de la cuenta (ej. 15); null = día del arranque
}

export interface CuotaPlanInput {
  orden: number; // 1-based
  base: "PORCENTAJE" | "MONTO_FIJO";
  valor: number; // 0-100 si PORCENTAJE; monto absoluto si MONTO_FIJO
  offsetMeses: number; // 0 = mes de arranque
  descripcion?: string | null;
}

export interface PlanEngineInput {
  template: "PAREJO" | "ENTRADA_Y_RESTO" | "SUSCRIPCION" | "PERSONALIZADO";
  numCuotas: number | null;
  cuotas: CuotaPlanInput[];
}

export interface CobroDraft {
  numCuota: number;
  periodo: string; // "YYYY-MM"
  fechaProgramadaISO: string; // "YYYY-MM-DD"
  monto: number;
  descripcion?: string;
}

export interface CobroExistente {
  id: string;
  numCuota: number | null;
  estado: string; // CobranzaEstadoCobro
  origen: string; // CobranzaOrigenCobro
  fechaEmision: string | null;
  fechaProgramadaISO: string;
  monto: number;
}

export interface ReconcileResult {
  toCreate: CobroDraft[];
  toUpdate: Array<{ id: string; fechaProgramadaISO: string; monto: number; periodo: string }>;
  toDelete: string[]; // ids de PROGRAMADO origen PLAN que el plan ya no contempla
  untouched: string[]; // ids intocables (cobrados/emitidos/manuales) o sin cambios
}

export type Semaforo = "verde" | "amarillo" | "gris" | "rojo";

export interface AlertaDraft {
  dedupeKey: string;
  tipo:
    | "COBRO_PROXIMO"
    | "COBRO_VENCIDO"
    | "CUENTA_SIN_DATOS"
    | "INCONSISTENCIA_CICLO"
    | "ARRANQUE_CAMBIADO"
    | "MONTOS_DESCUADRADOS"
    | "PROMESA_INCUMPLIDA";
  urgencia: "ALTA" | "MEDIA" | "BAJA";
  cuentaId: string;
  cobroId?: string;
  mensaje: string;
  evidencia?: Record<string, unknown>;
}

/** Input del cómputo de alertas: la cartera aplanada (la arma queries.ts). */
export interface CarteraEngineInput {
  cuentas: Array<{
    cuentaId: string;
    clienteNombre: string;
    excluidaOperacion: boolean;
    tieneCuenta: boolean; // false = cliente con proyecto activo SIN CuentaFinanciera
    /**
     * false = empresa creada/importada en Cobranza SIN proyecto en Nexus: sus
     * CUENTA_SIN_DATOS bajan a urgencia BAJA (backlog de datos, no operación en
     * riesgo — evita inundar el digest tras un import). Ausente = true (compat).
     */
    tieneProyectoReal?: boolean;
    /** FASE 3 (opcional — compat): estado de la cuenta para la cobertura de métricas. */
    estadoCuenta?: string | null;
    servicios: Array<{
      servicioId: string;
      descripcion: string | null;
      estado: string; // CobranzaEstadoServicio
      fechaInicioFacturacion: string | null;
      anchorActualISO: string | null; // anchorStartDate ACTUAL del project vinculado
      /** Para MONTOS_DESCUADRADOS (queries los computa con sumaPlanExpandido). Ausentes = no evaluar. */
      montoTotal?: number | null;
      planTemplate?: string | null;
      sumaPlan?: number | null;
    }>;
    cobros: Array<{
      cobroId: string;
      servicioId: string;
      estado: string;
      origen: string;
      fechaProgramadaISO: string;
      monto: number;
      /** FASE 3 (opcionales — compat con fixtures): métricas por moneda, historia de pago y promesa. */
      moneda?: "CRC" | "USD";
      fechaCobroISO?: string | null;
      promesaPagoISO?: string | null;
    }>;
  }>;
}

export interface DiffAlertas {
  nuevas: AlertaDraft[];
  resueltas: AlertaDraft[];
  persistentes: number;
  sinCambios: boolean;
}

// ── Constantes del preview (hardcodeadas a propósito; configurables post-demo) ──

/** Días después de fechaProgramada sin cobrar → rojo/COBRO_VENCIDO. */
export const UMBRAL_VENCIDO_DIAS = 3;
/** Ventana de "entra a la quincena" para COBRO_PROXIMO. */
export const VENTANA_PROXIMA_DIAS = 15;
/** Meses de horizonte rolling para SUSCRIPCION (se extiende en cada digest). */
export const HORIZONTE_SUSCRIPCION_MESES = 3;

// ── Helpers de fecha (UTC estricto) ─────────────────────────────────────────────

function toUTCDate(iso: string): Date {
  // Acepta "YYYY-MM-DD" o ISO completo; normaliza a medianoche UTC del día.
  const d = new Date(iso);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function toISODate(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function daysInMonthUTC(year: number, monthIndex0: number): number {
  // Día 0 del mes siguiente = último día del mes pedido.
  return new Date(Date.UTC(year, monthIndex0 + 1, 0)).getUTCDate();
}

/** Diferencia en días (b - a), sobre medianoches UTC. */
function diffDays(aISO: string, bISO: string): number {
  const a = toUTCDate(aISO).getTime();
  const b = toUTCDate(bISO).getTime();
  return Math.round((b - a) / 86_400_000);
}

/** Meses calendario completos entre dos fechas (piso; 0 si b < a). */
export function monthsBetween(aISO: string, bISO: string): number {
  const a = toUTCDate(aISO);
  const b = toUTCDate(bISO);
  let months = (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + (b.getUTCMonth() - a.getUTCMonth());
  if (b.getUTCDate() < a.getUTCDate()) months -= 1;
  return Math.max(0, months);
}

const round2 = (n: number) => Math.round(n * 100) / 100;

// ── 1-2. Expansión del plan + fecha de cada cobro ───────────────────────────────

export class PlanInvalidoError extends Error {}

interface CuotaExpandida {
  numCuota: number;
  offsetMeses: number;
  monto: number;
  descripcion?: string;
}

/**
 * Expande el plan a cuotas {numCuota, offsetMeses, monto}. Reglas por template:
 *  - PAREJO: N = numCuotas ?? duracionMeses (error si ambos null). División pareja;
 *    la ÚLTIMA absorbe el residuo (sum === montoTotal exacto).
 *  - ENTRADA_Y_RESTO: cuotas[0] = entrada (PORCENTAJE, offset 0); el resto se
 *    reparte parejo en numCuotas mensualidades desde offset 1 (mismo residuo).
 *  - SUSCRIPCION: rolling — desde offset 0 hasta monthsBetween(inicio, hoy) +
 *    horizonte. Monto = montoTotal (mensual) cada una.
 *  - PERSONALIZADO: mapea las cuotas tal cual (sin invariante de suma — puede ser
 *    parcial a propósito; la UI muestra plan-vs-montoTotal como dato).
 */
export function expandPlanCuotas(
  servicio: ServicioEngineInput,
  plan: PlanEngineInput,
  opts: { todayISO: string; horizonMeses?: number },
): CuotaExpandida[] {
  const total = servicio.montoTotal;

  switch (plan.template) {
    case "PAREJO": {
      const n = plan.numCuotas ?? servicio.duracionMeses;
      if (!n || n < 1) {
        throw new PlanInvalidoError("PAREJO necesita numCuotas o duracionMeses del servicio.");
      }
      const base = round2(total / n);
      const out: CuotaExpandida[] = [];
      let acumulado = 0;
      for (let i = 1; i <= n; i++) {
        const monto = i === n ? round2(total - acumulado) : base;
        acumulado = round2(acumulado + monto);
        out.push({ numCuota: i, offsetMeses: i - 1, monto });
      }
      return out;
    }
    case "ENTRADA_Y_RESTO": {
      const entrada = plan.cuotas.find((c) => c.orden === 1);
      if (!entrada || entrada.base !== "PORCENTAJE" || entrada.valor <= 0 || entrada.valor >= 100) {
        throw new PlanInvalidoError(
          "ENTRADA_Y_RESTO necesita cuota 1 PORCENTAJE con 0 < valor < 100.",
        );
      }
      const n = plan.numCuotas;
      if (!n || n < 1) throw new PlanInvalidoError("ENTRADA_Y_RESTO necesita numCuotas del resto.");
      const montoEntrada = round2((total * entrada.valor) / 100);
      const resto = round2(total - montoEntrada);
      const base = round2(resto / n);
      const out: CuotaExpandida[] = [
        { numCuota: 1, offsetMeses: 0, monto: montoEntrada, descripcion: `Entrada ${entrada.valor}%` },
      ];
      let acumulado = 0;
      for (let i = 1; i <= n; i++) {
        const monto = i === n ? round2(resto - acumulado) : base;
        acumulado = round2(acumulado + monto);
        out.push({ numCuota: i + 1, offsetMeses: i, monto });
      }
      return out;
    }
    case "SUSCRIPCION": {
      if (!servicio.fechaInicioFacturacion) return [];
      const horizonte = opts.horizonMeses ?? HORIZONTE_SUSCRIPCION_MESES;
      const transcurridos = monthsBetween(servicio.fechaInicioFacturacion, opts.todayISO);
      const hasta = transcurridos + horizonte;
      const out: CuotaExpandida[] = [];
      for (let off = 0; off <= hasta; off++) {
        out.push({ numCuota: off + 1, offsetMeses: off, monto: round2(total) });
      }
      return out;
    }
    case "PERSONALIZADO": {
      if (plan.cuotas.length === 0) {
        throw new PlanInvalidoError("PERSONALIZADO necesita al menos una cuota.");
      }
      return [...plan.cuotas]
        .sort((a, b) => a.orden - b.orden)
        .map((c) => ({
          numCuota: c.orden,
          offsetMeses: c.offsetMeses,
          monto: c.base === "PORCENTAJE" ? round2((total * c.valor) / 100) : round2(c.valor),
          descripcion: c.descripcion ?? undefined,
        }));
    }
  }
}

/**
 * Suma de la expansión del plan (para la alerta MONTOS_DESCUADRADOS): cuánto
 * suman las cuotas del plan vs el montoTotal del servicio. null si no aplica:
 * SUSCRIPCION (rolling, sin total), plan inválido, o datos insuficientes.
 * No necesita "hoy" — las plantillas no-SUSCRIPCION lo ignoran.
 */
export function sumaPlanExpandido(
  servicio: Pick<ServicioEngineInput, "montoTotal" | "duracionMeses">,
  plan: PlanEngineInput,
): number | null {
  if (plan.template === "SUSCRIPCION") return null;
  try {
    const cuotas = expandPlanCuotas(
      {
        id: "suma-check",
        montoTotal: servicio.montoTotal,
        moneda: "CRC", // irrelevante para la suma
        fechaInicioFacturacion: null, // no-SUSCRIPCION no la usa para expandir
        duracionMeses: servicio.duracionMeses,
        diaCobroAncla: null,
      },
      plan,
      { todayISO: "2000-01-01" }, // ignorado por las plantillas no-SUSCRIPCION
    );
    return round2(cuotas.reduce((acc, c) => acc + c.monto, 0));
  } catch {
    return null; // PlanInvalidoError → la alerta de descuadre no aplica (otro flujo lo reporta)
  }
}

/**
 * Fecha programada de un cobro: fechaInicio + offsetMeses, con el día del mes =
 * diaCobroAncla (o el día del arranque si no hay ancla), CLAMPEADO al largo del
 * mes destino (ancla 31 en febrero → 28/29). Devuelve también el periodo YYYY-MM.
 */
export function cobroDateFor(
  fechaInicioISO: string,
  offsetMeses: number,
  diaCobroAncla: number | null,
): { periodo: string; fechaProgramadaISO: string } {
  const inicio = toUTCDate(fechaInicioISO);
  const targetYear = inicio.getUTCFullYear();
  const targetMonth0 = inicio.getUTCMonth() + offsetMeses; // Date.UTC normaliza overflow
  const diaDeseado = diaCobroAncla ?? inicio.getUTCDate();
  // Normalizar año/mes con un Date intermedio (día 1 para no arrastrar el día).
  const primerDia = new Date(Date.UTC(targetYear, targetMonth0, 1));
  const y = primerDia.getUTCFullYear();
  const m0 = primerDia.getUTCMonth();
  const dia = Math.min(diaDeseado, daysInMonthUTC(y, m0));
  const fecha = new Date(Date.UTC(y, m0, dia));
  return {
    periodo: `${y}-${String(m0 + 1).padStart(2, "0")}`,
    fechaProgramadaISO: toISODate(fecha),
  };
}

// ── 3. Materialización ──────────────────────────────────────────────────────────

/**
 * Materializa los drafts de Cobro desde el plan. Devuelve [] si el servicio no
 * tiene fechaInicioFacturacion (la cuenta queda PENDIENTE_DATOS — cero fabricación).
 */
export function materializeCobros(
  servicio: ServicioEngineInput,
  plan: PlanEngineInput,
  opts: { todayISO: string; horizonMeses?: number },
): CobroDraft[] {
  if (!servicio.fechaInicioFacturacion) return [];
  const cuotas = expandPlanCuotas(servicio, plan, opts);
  return cuotas.map((c) => {
    const { periodo, fechaProgramadaISO } = cobroDateFor(
      servicio.fechaInicioFacturacion!,
      c.offsetMeses,
      servicio.diaCobroAncla,
    );
    return { numCuota: c.numCuota, periodo, fechaProgramadaISO, monto: c.monto, descripcion: c.descripcion };
  });
}

// ── 4. Reconciliación idempotente ───────────────────────────────────────────────

/**
 * Diff drafts-vs-existentes por numCuota. INTOCABLES (van a untouched y su draft
 * colisionante se DESCARTA — jamás se pisa ni duplica): estado ≠ PROGRAMADO, o
 * fechaEmision seteada, u origen MANUAL. PROGRAMADO con fecha/monto distinto →
 * toUpdate. PROGRAMADO origen PLAN sin draft (el plan se achicó) → toDelete.
 * Re-run sin cambios ⇒ cero mutaciones (idempotencia: el botón se aprieta 2 veces
 * sin efecto — y el @@unique([servicioId, numCuota]) es la red dura en DB).
 */
export function reconcileCobros(drafts: CobroDraft[], existing: CobroExistente[]): ReconcileResult {
  const result: ReconcileResult = { toCreate: [], toUpdate: [], toDelete: [], untouched: [] };
  const byNumCuota = new Map<number, CobroExistente>();
  for (const e of existing) {
    if (e.numCuota !== null) byNumCuota.set(e.numCuota, e);
  }

  const esIntocable = (e: CobroExistente) =>
    e.estado !== "PROGRAMADO" || e.fechaEmision !== null || e.origen === "MANUAL";

  const draftNums = new Set<number>();
  for (const d of drafts) {
    draftNums.add(d.numCuota);
    const match = byNumCuota.get(d.numCuota);
    if (!match) {
      result.toCreate.push(d);
    } else if (esIntocable(match)) {
      result.untouched.push(match.id);
    } else if (match.fechaProgramadaISO !== d.fechaProgramadaISO || match.monto !== d.monto) {
      result.toUpdate.push({
        id: match.id,
        fechaProgramadaISO: d.fechaProgramadaISO,
        monto: d.monto,
        periodo: d.periodo,
      });
    } else {
      result.untouched.push(match.id);
    }
  }

  for (const e of existing) {
    if (e.numCuota === null) {
      result.untouched.push(e.id); // manuales sin orden: nunca se tocan
      continue;
    }
    if (!draftNums.has(e.numCuota)) {
      if (esIntocable(e)) result.untouched.push(e.id);
      else if (e.origen === "PLAN" || e.origen === "CATCH_UP") result.toDelete.push(e.id);
      else result.untouched.push(e.id);
    }
  }

  return result;
}

// ── 5. Catch-up ─────────────────────────────────────────────────────────────────

/**
 * Separa los drafts a crear en regulares vs catch-up (fechaProgramada < hoy —
 * períodos ya pasados sin cobro, caso Teamnet). Los catch-up se persisten con
 * origen=CATCH_UP + estado PROGRAMADO y disparan la alerta INCONSISTENCIA_CICLO:
 * Alex los revisa y confirma (autonomía en la derivación, confirmación en el dinero).
 */
export function splitCatchUp(
  toCreate: CobroDraft[],
  todayISO: string,
): { regulares: CobroDraft[]; catchUp: CobroDraft[] } {
  const regulares: CobroDraft[] = [];
  const catchUp: CobroDraft[] = [];
  for (const d of toCreate) {
    if (diffDays(d.fechaProgramadaISO, todayISO) > 0) catchUp.push(d);
    else regulares.push(d);
  }
  return { regulares, catchUp };
}

// ── 6. Semáforos ────────────────────────────────────────────────────────────────

/**
 * Semáforo de un cobro: cobrado → verde · por_cobrar → amarillo · programado
 * futuro → gris · no-cobrado con fecha + umbral < hoy → rojo (mapeo del Sheet
 * de Alex: verde=cobrado, amarillo=por cobrar).
 */
export function semaforoCobro(
  cobro: { estado: string; fechaProgramadaISO: string },
  todayISO: string,
  umbralVencidoDias: number = UMBRAL_VENCIDO_DIAS,
): Semaforo {
  if (cobro.estado === "COBRADO") return "verde";
  const diasPasados = diffDays(cobro.fechaProgramadaISO, todayISO);
  if (diasPasados > umbralVencidoDias) return "rojo";
  if (cobro.estado === "POR_COBRAR") return "amarillo";
  return "gris"; // PROGRAMADO futuro (o SIN_DATO sin vencer)
}

const SEMAFORO_PESO: Record<Semaforo, number> = { rojo: 3, amarillo: 2, gris: 1, verde: 0 };

/**
 * Semáforo agregado de la cuenta: el PEOR entre sus cobros no-verdes vivos.
 * Cuenta SIN cobros → GRIS (neutro): verde significa "al día", no "vacío" — una
 * cuenta recién configurada o pendiente de datos no puede verse como cobrada.
 */
export function semaforoCuenta(
  cobros: Array<{ estado: string; fechaProgramadaISO: string }>,
  todayISO: string,
  umbralVencidoDias: number = UMBRAL_VENCIDO_DIAS,
): Semaforo {
  if (cobros.length === 0) return "gris";
  let peor: Semaforo = "verde";
  for (const c of cobros) {
    const s = semaforoCobro(c, todayISO, umbralVencidoDias);
    if (SEMAFORO_PESO[s] > SEMAFORO_PESO[peor]) peor = s;
  }
  return peor;
}

// ── 7. Cómputo del set de alertas ───────────────────────────────────────────────

/**
 * Computa el set completo de alertas de la cartera. dedupeKey estable entre
 * corridas: `${tipo}:${cuentaId}:${cobroId | servicioId | "cuenta"}` — es la
 * base del merge/supresión en DB y del diff del digest.
 */
export function computeAlertSet(
  cartera: CarteraEngineInput,
  opts: {
    todayISO: string;
    ventanaProximaDias?: number;
    umbralVencidoDias?: number;
  },
): AlertaDraft[] {
  const ventana = opts.ventanaProximaDias ?? VENTANA_PROXIMA_DIAS;
  const umbral = opts.umbralVencidoDias ?? UMBRAL_VENCIDO_DIAS;
  const out: AlertaDraft[] = [];

  for (const cuenta of cartera.cuentas) {
    if (cuenta.excluidaOperacion) continue; // Colby: fuera de la operación estándar

    // Sin proyecto real (empresa creada/importada en Cobranza), los "sin datos" son
    // backlog de captura, no operación en riesgo → urgencia BAJA (no inundar el digest).
    const urgenciaSinDatos = cuenta.tieneProyectoReal === false ? "BAJA" : "MEDIA";

    // CUENTA_SIN_DATOS — cliente con proyecto sin cuenta / sin servicios / servicio sin arranque
    if (!cuenta.tieneCuenta) {
      out.push({
        dedupeKey: `CUENTA_SIN_DATOS:${cuenta.cuentaId}:cuenta`,
        tipo: "CUENTA_SIN_DATOS",
        urgencia: urgenciaSinDatos,
        cuentaId: cuenta.cuentaId,
        mensaje: `${cuenta.clienteNombre}: tiene proyecto activo pero no tiene cuenta financiera configurada.`,
      });
      continue; // sin cuenta no hay servicios/cobros que evaluar
    }
    if (cuenta.servicios.length === 0) {
      out.push({
        dedupeKey: `CUENTA_SIN_DATOS:${cuenta.cuentaId}:cuenta`,
        tipo: "CUENTA_SIN_DATOS",
        urgencia: urgenciaSinDatos,
        cuentaId: cuenta.cuentaId,
        mensaje: `${cuenta.clienteNombre}: la cuenta no tiene servicios contratados configurados.`,
      });
    }

    for (const s of cuenta.servicios) {
      if (s.estado !== "ACTIVO") continue;
      if (!s.fechaInicioFacturacion) {
        out.push({
          dedupeKey: `CUENTA_SIN_DATOS:${cuenta.cuentaId}:${s.servicioId}`,
          tipo: "CUENTA_SIN_DATOS",
          urgencia: urgenciaSinDatos,
          cuentaId: cuenta.cuentaId,
          mensaje: `${cuenta.clienteNombre}: el servicio${s.descripcion ? ` "${s.descripcion}"` : ""} no tiene fecha de inicio de facturación — no se generan cobros.`,
          evidencia: { servicioId: s.servicioId },
        });
      }

      // MONTOS_DESCUADRADOS — el plan activo no suma el montoTotal del servicio
      // (aviso, NO invariante: PERSONALIZADO parcial es legal — Alex decide).
      if (
        s.planTemplate &&
        s.planTemplate !== "SUSCRIPCION" &&
        s.sumaPlan != null &&
        s.montoTotal != null &&
        Math.abs(s.sumaPlan - s.montoTotal) > 0.01
      ) {
        const diferencia = Math.round((s.sumaPlan - s.montoTotal) * 100) / 100;
        out.push({
          dedupeKey: `MONTOS_DESCUADRADOS:${cuenta.cuentaId}:${s.servicioId}`,
          tipo: "MONTOS_DESCUADRADOS",
          urgencia: "MEDIA",
          cuentaId: cuenta.cuentaId,
          mensaje: `${cuenta.clienteNombre}: el plan de pago${s.descripcion ? ` de "${s.descripcion}"` : ""} suma ${s.sumaPlan.toLocaleString("es-CR")} pero el servicio vale ${s.montoTotal.toLocaleString("es-CR")} (diferencia ${diferencia.toLocaleString("es-CR")}).`,
          evidencia: { servicioId: s.servicioId, montoTotal: s.montoTotal, sumaPlan: s.sumaPlan, diferencia },
        });
      }

      if (
        s.fechaInicioFacturacion &&
        s.anchorActualISO &&
        toISODate(toUTCDate(s.fechaInicioFacturacion)) !== toISODate(toUTCDate(s.anchorActualISO))
      ) {
        // ARRANQUE_CAMBIADO — el CSE movió el anchor DESPUÉS de configurar el servicio.
        // Detección en el cómputo (sin plumbing de eventos): Alex decide si ajustar.
        out.push({
          dedupeKey: `ARRANQUE_CAMBIADO:${cuenta.cuentaId}:${s.servicioId}`,
          tipo: "ARRANQUE_CAMBIADO",
          urgencia: "ALTA",
          cuentaId: cuenta.cuentaId,
          mensaje: `${cuenta.clienteNombre}: el arranque del proyecto cambió (cronograma: ${toISODate(toUTCDate(s.anchorActualISO))}) y difiere de la facturación configurada (${toISODate(toUTCDate(s.fechaInicioFacturacion))}). Los cobros emitidos/cobrados NO se regeneran — revisá si hay que ajustar.`,
          evidencia: {
            servicioId: s.servicioId,
            fechaFacturacion: toISODate(toUTCDate(s.fechaInicioFacturacion)),
            anchorActual: toISODate(toUTCDate(s.anchorActualISO)),
          },
        });
      }
    }

    for (const c of cuenta.cobros) {
      if (c.estado === "COBRADO") continue;
      const diasPasados = diffDays(c.fechaProgramadaISO, opts.todayISO);

      // Promesa de pago: VIGENTE (>= hoy) calla COBRO_VENCIDO/COBRO_PROXIMO de este
      // cobro (el humano ya gestionó — semáforos y métricas NO cambian); PASADA sin
      // COBRADO → PROMESA_INCUMPLIDA que REEMPLAZA al vencido/próximo (1 alerta por
      // cobro). INCONSISTENCIA_CICLO (catch-up) se sigue emitiendo aparte.
      const promesaISO = c.promesaPagoISO ?? null;
      if (promesaISO) {
        const diasDesdePromesa = diffDays(promesaISO, opts.todayISO);
        if (diasDesdePromesa > 0) {
          out.push({
            dedupeKey: `PROMESA_INCUMPLIDA:${cuenta.cuentaId}:${c.cobroId}`,
            tipo: "PROMESA_INCUMPLIDA",
            urgencia: "ALTA",
            cuentaId: cuenta.cuentaId,
            cobroId: c.cobroId,
            mensaje: `${cuenta.clienteNombre}: prometió pagar ${c.monto.toLocaleString("es-CR")} el ${promesaISO} y ya pasaron ${diasDesdePromesa} día(s) sin cobro.`,
            evidencia: {
              servicioId: c.servicioId,
              promesaPago: promesaISO,
              fechaProgramada: c.fechaProgramadaISO,
              monto: c.monto,
              diasDesdePromesa,
            },
          });
        }
        // promesa vigente: silencio (ni vencido ni próximo)
      } else if (diasPasados > umbral) {
        out.push({
          dedupeKey: `COBRO_VENCIDO:${cuenta.cuentaId}:${c.cobroId}`,
          tipo: "COBRO_VENCIDO",
          urgencia: "ALTA",
          cuentaId: cuenta.cuentaId,
          cobroId: c.cobroId,
          mensaje: `${cuenta.clienteNombre}: cobro de ${c.monto.toLocaleString("es-CR")} vencido hace ${diasPasados} días (programado ${c.fechaProgramadaISO}).`,
          evidencia: { servicioId: c.servicioId, fechaProgramada: c.fechaProgramadaISO, monto: c.monto },
        });
      } else if (diasPasados >= -ventana && diasPasados <= umbral) {
        out.push({
          dedupeKey: `COBRO_PROXIMO:${cuenta.cuentaId}:${c.cobroId}`,
          tipo: "COBRO_PROXIMO",
          urgencia: "MEDIA",
          cuentaId: cuenta.cuentaId,
          cobroId: c.cobroId,
          mensaje: `${cuenta.clienteNombre}: cobro de ${c.monto.toLocaleString("es-CR")} entra a la quincena (programado ${c.fechaProgramadaISO}).`,
          evidencia: { servicioId: c.servicioId, fechaProgramada: c.fechaProgramadaISO, monto: c.monto },
        });
      }

      if (c.origen === "CATCH_UP" && c.estado === "PROGRAMADO") {
        out.push({
          dedupeKey: `INCONSISTENCIA_CICLO:${cuenta.cuentaId}:${c.cobroId}`,
          tipo: "INCONSISTENCIA_CICLO",
          urgencia: "MEDIA",
          cuentaId: cuenta.cuentaId,
          cobroId: c.cobroId,
          mensaje: `${cuenta.clienteNombre}: cobro de catch-up generado por desfase de arranque (${c.fechaProgramadaISO}) — pendiente de tu confirmación.`,
          evidencia: { servicioId: c.servicioId, fechaProgramada: c.fechaProgramadaISO, monto: c.monto },
        });
      }
    }
  }

  return out;
}

// ── 8. Diff del digest ──────────────────────────────────────────────────────────

/** Diff por dedupeKey entre la corrida anterior y la actual (el digest del lunes). */
export function diffAlertSets(prev: AlertaDraft[], current: AlertaDraft[]): DiffAlertas {
  const prevKeys = new Set(prev.map((a) => a.dedupeKey));
  const currKeys = new Set(current.map((a) => a.dedupeKey));
  const nuevas = current.filter((a) => !prevKeys.has(a.dedupeKey));
  const resueltas = prev.filter((a) => !currKeys.has(a.dedupeKey));
  const persistentes = current.length - nuevas.length;
  return { nuevas, resueltas, persistentes, sinCambios: nuevas.length === 0 && resueltas.length === 0 };
}

// ── 9. Proyección de ingresos ("plata que viene") ───────────────────────────────

/** Meses de horizonte de la proyección (rango pedido: 3-6). */
export const PROYECCION_HORIZONTE_MESES = 6;
/** Cuántos meses (desde el actual) se desglosan por QUINCENA; el resto va mensual. */
export const PROYECCION_MESES_EN_QUINCENAS = 2;

export interface CobroProyeccionInput {
  cobroId: string;
  cuentaId: string;
  clienteNombre: string;
  estado: string; // COBRADO se excluye adentro
  fechaProgramadaISO: string;
  monto: number;
  moneda: "CRC" | "USD";
}

/** Totales por moneda SEPARADOS — jamás se convierten ni suman entre sí. */
export interface TotalesMoneda {
  CRC: number;
  USD: number;
}

export interface BucketProyeccion {
  key: string; // "2026-07-Q2" | "2026-09"
  etiqueta: string; // "16–31 jul" | "sep 2026"
  granularidad: "quincena" | "mes";
  desdeISO: string;
  hastaISO: string;
  totales: TotalesMoneda;
  cobros: CobroProyeccionInput[];
}

export interface ProyeccionIngresos {
  /** Vencidos (> umbral) "en riesgo" — APARTE de los buckets futuros. */
  vencidos: { totales: TotalesMoneda; cobros: CobroProyeccionInput[] };
  buckets: BucketProyeccion[]; // quincenas del horizonte cercano, luego meses; vacíos SÍ se emiten
  fueraDeHorizonte: number; // count informativo de cobros más allá del horizonte
}

const MESES_CORTOS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/**
 * Proyección de ingresos por QUINCENA (horizonte cercano) + MES (resto), con
 * totales CRC y USD SEPARADOS (sin tipo de cambio — otra iteración). Reglas:
 *  - COBRADO se excluye (ya entró).
 *  - vencido (> umbral días pasado) → `vencidos` (en riesgo), NO a los buckets.
 *  - pasado dentro del umbral (gracia) → bucket de la quincena ACTUAL (entra ya).
 *  - quincena = día 1–15 / 16–fin de mes (fin clampeado: febrero 16–28/29).
 *  - buckets vacíos intermedios SÍ se emiten (la línea de tiempo no salta meses).
 *  - más allá del horizonte → `fueraDeHorizonte` (contador).
 */
export function proyectarIngresos(
  cobros: CobroProyeccionInput[],
  opts: {
    todayISO: string;
    horizonteMeses?: number;
    mesesEnQuincenas?: number;
    umbralVencidoDias?: number;
  },
): ProyeccionIngresos {
  const horizonteMeses = opts.horizonteMeses ?? PROYECCION_HORIZONTE_MESES;
  const mesesEnQuincenas = Math.min(opts.mesesEnQuincenas ?? PROYECCION_MESES_EN_QUINCENAS, horizonteMeses);
  const umbral = opts.umbralVencidoDias ?? UMBRAL_VENCIDO_DIAS;

  const hoy = toUTCDate(opts.todayISO);
  const hoyISO = toISODate(hoy);
  const y0 = hoy.getUTCFullYear();
  const m0 = hoy.getUTCMonth();
  const dia0 = hoy.getUTCDate();

  // Esqueleto de buckets: quincenas del mes actual (desde la quincena de HOY) y
  // del/los siguientes `mesesEnQuincenas`, luego meses hasta el horizonte.
  const buckets: BucketProyeccion[] = [];
  const mk = (y: number, mIdx: number) => new Date(Date.UTC(y, mIdx, 1));
  for (let off = 0; off < mesesEnQuincenas; off++) {
    const base = mk(y0, m0 + off);
    const y = base.getUTCFullYear();
    const mi = base.getUTCMonth();
    const mm = String(mi + 1).padStart(2, "0");
    const fin = daysInMonthUTC(y, mi);
    const mitades: Array<{ q: 1 | 2; desde: number; hasta: number }> = [
      { q: 1, desde: 1, hasta: 15 },
      { q: 2, desde: 16, hasta: fin },
    ];
    for (const { q, desde, hasta } of mitades) {
      if (off === 0 && q === 1 && dia0 > 15) continue; // la quincena YA pasada del mes actual no se emite
      buckets.push({
        key: `${y}-${mm}-Q${q}`,
        etiqueta: `${desde}–${hasta} ${MESES_CORTOS[mi]}`,
        granularidad: "quincena",
        desdeISO: `${y}-${mm}-${String(desde).padStart(2, "0")}`,
        hastaISO: `${y}-${mm}-${String(hasta).padStart(2, "0")}`,
        totales: { CRC: 0, USD: 0 },
        cobros: [],
      });
    }
  }
  for (let off = mesesEnQuincenas; off < horizonteMeses; off++) {
    const base = mk(y0, m0 + off);
    const y = base.getUTCFullYear();
    const mi = base.getUTCMonth();
    const mm = String(mi + 1).padStart(2, "0");
    const fin = daysInMonthUTC(y, mi);
    buckets.push({
      key: `${y}-${mm}`,
      etiqueta: `${MESES_CORTOS[mi]} ${y}`,
      granularidad: "mes",
      desdeISO: `${y}-${mm}-01`,
      hastaISO: `${y}-${mm}-${String(fin).padStart(2, "0")}`,
      totales: { CRC: 0, USD: 0 },
      cobros: [],
    });
  }
  const finHorizonteISO = buckets.length > 0 ? buckets[buckets.length - 1].hastaISO : hoyISO;

  const vencidos: ProyeccionIngresos["vencidos"] = { totales: { CRC: 0, USD: 0 }, cobros: [] };
  let fueraDeHorizonte = 0;

  const ordenados = [...cobros].sort(
    (a, b) => a.fechaProgramadaISO.localeCompare(b.fechaProgramadaISO) || a.cobroId.localeCompare(b.cobroId),
  );
  for (const c of ordenados) {
    if (c.estado === "COBRADO") continue;
    const diasPasados = diffDays(c.fechaProgramadaISO, opts.todayISO);
    if (diasPasados > umbral) {
      vencidos.cobros.push(c);
      vencidos.totales[c.moneda] = round2(vencidos.totales[c.moneda] + c.monto);
      continue;
    }
    // Gracia (pasado dentro del umbral) cuenta como "entra ya": quincena actual.
    const fechaEfectiva = diasPasados > 0 ? hoyISO : toISODate(toUTCDate(c.fechaProgramadaISO));
    if (fechaEfectiva > finHorizonteISO) {
      fueraDeHorizonte++;
      continue;
    }
    const bucket = buckets.find((b) => fechaEfectiva >= b.desdeISO && fechaEfectiva <= b.hastaISO);
    if (!bucket) {
      fueraDeHorizonte++; // no debería pasar (esqueleto continuo), red de seguridad
      continue;
    }
    bucket.cobros.push(c);
    bucket.totales[c.moneda] = round2(bucket.totales[c.moneda] + c.monto);
  }

  return { vencidos, buckets, fueraDeHorizonte };
}

// ── 10. Métricas de cartera + riesgo de pago (fase 3 — analítica) ───────────────

/** Suma `days` días a una fecha ISO (UTC estricto). Exportado: el digest calcula el próximo corte. */
export function addDaysISO(iso: string, days: number): string {
  const d = toUTCDate(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return toISODate(d);
}

const round1 = (n: number) => Math.round(n * 10) / 10;

export interface AgingBuckets {
  d0_30: number;
  d31_60: number;
  d61_90: number;
  d90mas: number;
}

export interface MetricasMoneda {
  /** Montos por semáforo del cobro (mapeo 1:1 — cero definiciones nuevas de "vencido"). */
  totalVencido: number; // rojos
  totalPorCobrar: number; // amarillos
  totalProgramado: number; // grises
  /** COBRADOs con fechaCobro dentro de la ventana (desde el corte anterior, exclusivo → hoy]. */
  totalCobradoDesdeUltimoCorte: number;
  /** SOLO vencidos, por días de atraso. Invariante: Σ buckets === totalVencido. */
  aging: AgingBuckets;
  /**
   * DSO proxy de control (sin ventas contables): promedio ponderado por monto de
   * la antigüedad en días de los cobros no-COBRADO EXIGIBLES (fecha ≤ hoy).
   * null = sin cobros elegibles (honestidad: no es 0).
   */
  dso: number | null;
  /** Comportamiento realizado: promedio de (fechaCobro − fechaProgramada) de los COBRADOs. Puede ser negativo. */
  diasPromedioCobro: number | null;
  /** Lo que la cartera dice que entra hasta el próximo corte (regla de gracia de proyectarIngresos). */
  proyectadoProximoCorte: number;
}

export interface MetricasCartera {
  version: 1;
  /** Ventana del corte — desdeISO null = primer corte (sin historia, declarado). */
  ventana: { desdeISO: string | null; hastaISO: string; proximoCorteISO: string };
  moneda: { CRC: MetricasMoneda; USD: MetricasMoneda };
  cuentasRojas: number;
  cuentasAmarillas: number;
  /** Honestidad de datos: cuánto de la cartera está realmente medido. */
  cobertura: {
    cuentasTotales: number; // en el universo (excluidas de operación fuera de TODO)
    cuentasConfiguradas: number;
    cuentasPendienteDatos: number;
    cuentasSinCobros: number; // configuradas pero sin nada que medir — NO cuentan como sanas
  };
}

/**
 * Computa las métricas agregadas de la cartera para el SnapshotCartera del corte.
 * Reglas de honestidad (constraint de la fase): cuentas excluidas de operación
 * fuera de TODO; sin configurar / sin cobros NO aportan a totales, DSO ni aging
 * (la cobertura lo declara); cobros sin `moneda` no entran (no se adivina).
 */
export function computeMetricasCartera(
  cartera: CarteraEngineInput,
  opts: {
    todayISO: string;
    desdeUltimoCorteISO: string | null;
    proximoCorteISO: string;
    umbralVencidoDias?: number;
  },
): MetricasCartera {
  const umbral = opts.umbralVencidoDias ?? UMBRAL_VENCIDO_DIAS;
  const mkMoneda = (): MetricasMoneda => ({
    totalVencido: 0,
    totalPorCobrar: 0,
    totalProgramado: 0,
    totalCobradoDesdeUltimoCorte: 0,
    aging: { d0_30: 0, d31_60: 0, d61_90: 0, d90mas: 0 },
    dso: null,
    diasPromedioCobro: null,
    proyectadoProximoCorte: 0,
  });
  const moneda = { CRC: mkMoneda(), USD: mkMoneda() };
  const dsoAcc = { CRC: { peso: 0, suma: 0 }, USD: { peso: 0, suma: 0 } };
  const cobroAcc = { CRC: { n: 0, suma: 0 }, USD: { n: 0, suma: 0 } };

  let cuentasRojas = 0;
  let cuentasAmarillas = 0;
  const cobertura = {
    cuentasTotales: 0,
    cuentasConfiguradas: 0,
    cuentasPendienteDatos: 0,
    cuentasSinCobros: 0,
  };

  for (const cuenta of cartera.cuentas) {
    if (cuenta.excluidaOperacion) continue;
    cobertura.cuentasTotales++;
    if (!cuenta.tieneCuenta) continue; // sin configurar: cuenta en el universo, nada que medir
    cobertura.cuentasConfiguradas++;
    if (cuenta.estadoCuenta === "PENDIENTE_DATOS") cobertura.cuentasPendienteDatos++;
    if (cuenta.cobros.length === 0) {
      cobertura.cuentasSinCobros++;
      continue; // vacía ≠ sana: no aporta ni al verde ni a los denominadores
    }

    const sem = semaforoCuenta(cuenta.cobros, opts.todayISO, umbral);
    if (sem === "rojo") cuentasRojas++;
    else if (sem === "amarillo") cuentasAmarillas++;

    for (const c of cuenta.cobros) {
      if (!c.moneda) continue; // sin moneda no se adivina
      const m = moneda[c.moneda];

      if (c.estado === "COBRADO") {
        if (c.fechaCobroISO) {
          const acc = cobroAcc[c.moneda];
          acc.n++;
          acc.suma += diffDays(c.fechaProgramadaISO, c.fechaCobroISO);
          if (
            opts.desdeUltimoCorteISO &&
            c.fechaCobroISO > opts.desdeUltimoCorteISO &&
            c.fechaCobroISO <= opts.todayISO
          ) {
            m.totalCobradoDesdeUltimoCorte = round2(m.totalCobradoDesdeUltimoCorte + c.monto);
          }
        }
        continue;
      }

      const s = semaforoCobro(c, opts.todayISO, umbral);
      const edad = diffDays(c.fechaProgramadaISO, opts.todayISO); // >0 = pasado

      if (s === "rojo") {
        m.totalVencido = round2(m.totalVencido + c.monto);
        const bucket = edad <= 30 ? "d0_30" : edad <= 60 ? "d31_60" : edad <= 90 ? "d61_90" : "d90mas";
        m.aging[bucket] = round2(m.aging[bucket] + c.monto);
      } else if (s === "amarillo") {
        m.totalPorCobrar = round2(m.totalPorCobrar + c.monto);
      } else if (s === "gris") {
        m.totalProgramado = round2(m.totalProgramado + c.monto);
      }

      // DSO: exigibles = la fecha programada ya llegó (los futuros no diluyen).
      if (edad >= 0) {
        dsoAcc[c.moneda].peso += c.monto;
        dsoAcc[c.moneda].suma += edad * c.monto;
      }

      // Proyectado al próximo corte: no-vencidos con fecha efectiva (gracia → hoy)
      // dentro de la ventana — el corte SIGUIENTE lo compara contra su cobrado real.
      if (s !== "rojo") {
        const fechaEfectiva = edad > 0 ? opts.todayISO : c.fechaProgramadaISO;
        if (fechaEfectiva <= opts.proximoCorteISO) {
          m.proyectadoProximoCorte = round2(m.proyectadoProximoCorte + c.monto);
        }
      }
    }
  }

  for (const mon of ["CRC", "USD"] as const) {
    if (dsoAcc[mon].peso > 0) moneda[mon].dso = round1(dsoAcc[mon].suma / dsoAcc[mon].peso);
    if (cobroAcc[mon].n > 0) moneda[mon].diasPromedioCobro = round1(cobroAcc[mon].suma / cobroAcc[mon].n);
  }

  return {
    version: 1,
    ventana: {
      desdeISO: opts.desdeUltimoCorteISO,
      hastaISO: opts.todayISO,
      proximoCorteISO: opts.proximoCorteISO,
    },
    moneda,
    cuentasRojas,
    cuentasAmarillas,
    cobertura,
  };
}

/** Umbral del riesgo de pago: días de atraso POR ENCIMA del comportamiento histórico. */
export const RIESGO_UMBRAL_DIAS = 15;

export interface RiesgoPagoItem {
  cobroId: string;
  cuentaId: string;
  servicioId: string;
  clienteNombre: string;
  moneda: "CRC" | "USD" | null;
  monto: number;
  fechaProgramadaISO: string;
  diasAtraso: number;
  /** Comportamiento histórico de la cuenta (promedio fechaCobro−fechaProgramada de sus COBRADOs). null = sin historia. */
  promedioHistoricoDias: number | null;
  umbralAplicado: number; // (promedio ?? 0) + umbral
  excedenteDias: number; // diasAtraso − umbralAplicado
}

/**
 * Riesgo de pago V1 — REGLA SIMPLE, sin ML (documentada en DECISIONS): una cuenta
 * que suele pagar a N días de la fecha y lleva N + umbral sin pagar está en riesgo.
 * Sin historia de COBRADOs → bandera si el atraso supera el umbral a secas. El
 * promedio NO se clampea: el buen pagador (promedio negativo) se bandera antes —
 * esa ES la señal. El patrón aprendido por cliente queda para cuando haya historia.
 */
export function computeRiesgoPago(
  cartera: CarteraEngineInput,
  opts: { todayISO: string; umbralDias?: number },
): RiesgoPagoItem[] {
  const umbral = opts.umbralDias ?? RIESGO_UMBRAL_DIAS;
  const out: RiesgoPagoItem[] = [];

  for (const cuenta of cartera.cuentas) {
    if (cuenta.excluidaOperacion || !cuenta.tieneCuenta) continue;

    const cobrados = cuenta.cobros.filter((c) => c.estado === "COBRADO" && c.fechaCobroISO);
    const promedio =
      cobrados.length > 0
        ? round1(
            cobrados.reduce((acc, c) => acc + diffDays(c.fechaProgramadaISO, c.fechaCobroISO!), 0) /
              cobrados.length,
          )
        : null;
    const umbralAplicado = round1((promedio ?? 0) + umbral);

    for (const c of cuenta.cobros) {
      if (c.estado === "COBRADO") continue;
      const diasAtraso = diffDays(c.fechaProgramadaISO, opts.todayISO);
      if (diasAtraso > umbralAplicado) {
        out.push({
          cobroId: c.cobroId,
          cuentaId: cuenta.cuentaId,
          servicioId: c.servicioId,
          clienteNombre: cuenta.clienteNombre,
          moneda: c.moneda ?? null,
          monto: c.monto,
          fechaProgramadaISO: c.fechaProgramadaISO,
          diasAtraso,
          promedioHistoricoDias: promedio,
          umbralAplicado,
          excedenteDias: round1(diasAtraso - umbralAplicado),
        });
      }
    }
  }

  return out.sort(
    (a, b) => b.excedenteDias - a.excedenteDias || a.cobroId.localeCompare(b.cobroId),
  );
}
