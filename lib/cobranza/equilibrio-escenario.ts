/**
 * lib/cobranza/equilibrio-escenario.ts
 *
 * La matemática del ESCENARIO del reporte anual: mover a mano el facturado de un mes y
 * ver cómo se mueven la brecha, los ingresos y los indicadores del año.
 *
 * ⚠ VIVE EN `lib/` Y NO EN EL COMPONENTE por una razón concreta: los mismos números los
 * calcula el servidor (al armar el reporte) y el navegador (al simular). Dos
 * implementaciones divergen —una redondea distinto, la otra suma un rubro de más— y el
 * encabezado termina contradiciendo a la tabla que tiene debajo. Es la misma regla que
 * ya sostiene `ReportesPanel`: un solo helper para las dos pantallas.
 *
 * ⚠ LO SIMULADO NO SE GUARDA. No hay fetch, ni localStorage, ni query param: el
 * escenario vive en un `useState` y se muere al recargar. Mover el facturado de marzo es
 * una PREGUNTA ("¿y si hubiéramos vendido esto?"), no un dato — persistirla la
 * convertiría en un segundo juego de cifras conviviendo con el real, que es exactamente
 * lo que este módulo existe para evitar. Si alguien viene a "completar la feature"
 * agregándole un guardar: no está incompleta.
 */
import type { FilaMes, ReporteEquilibrio } from "@/lib/finanzas/equilibrio";

const round2 = (n: number) => Math.round(n * 100) / 100;

/** periodo ("YYYY-MM") → facturado simulado, en la moneda de presentación. */
export type OverrideEscenario = Record<string, number>;

export interface MesEfectivo extends FilaMes {
  /** El facturado que manda: el simulado si hay override, el real si no. */
  facturadoEfectivo: number;
  /** true = este mes lo movió una persona a mano. */
  simulado: boolean;
}

export interface IndicadoresAnio {
  egresosTotales: number;
  facturadoTotal: number;
  cobradoTotal: number;
  porCobrarTotal: number;
  partnershipTotal: number;
  ingresosTotales: number;
  /** Los doce meses. PROYECCIÓN: mezcla lo ocurrido con lo comprometido. */
  margenAnual: number;
  /** Solo los meses ya ocurridos — el titular. */
  margenAlDia: number;
  /** Ingreso ya fechado en meses que no llegaron. Se declara aparte. */
  comprometidoPorVenir: number;
  /** Egreso que salió del banco: sin meses futuros, sin la reserva de aguinaldo. */
  egresosDeCajaTotal: number;
  tasaCobro: number | null;
  mesesQueCubren: number;
  mesesEgresoCompleto: number;
  /** Cuántos meses están simulados. 0 = todo es real. */
  mesesSimulados: number;
}

/**
 * Aplica los overrides y recalcula lo que depende del facturado.
 *
 * Lo que NO se toca al simular: los egresos, el partnership y el piso. Simular
 * ingresos no cambia lo que cuesta la operación — si además se moviera el egreso, la
 * brecha dejaría de significar algo.
 */
export function aplicarEscenario(
  meses: readonly FilaMes[],
  override: OverrideEscenario,
): MesEfectivo[] {
  return meses.map((m) => {
    const simulado = Object.prototype.hasOwnProperty.call(override, m.periodo);
    const facturadoEfectivo = simulado ? override[m.periodo]! : m.facturado;
    const ingresosTotales = round2(facturadoEfectivo + m.partnership);
    return {
      ...m,
      facturadoEfectivo,
      simulado,
      ingresosTotales,
      brecha: round2(ingresosTotales - m.egresos),
      // Un mes PARCIAL sigue sin poder afirmar que cubre, simulado o no: la mitad de
      // los costos ausentes no aparece por mover el facturado.
      cubreEgresos: m.estado === "PARCIAL" ? null : ingresosTotales >= m.egresos,
    };
  });
}

/**
 * Los indicadores del año sobre los meses YA efectivos.
 *
 * Se renderizan siempre estos, no los del DTO: al simular, mostrar los del servidor
 * haría que el encabezado dijera un número y la tabla otro. Con escenario vacío tienen
 * que dar exactamente lo mismo que trajo el servidor — hay un test que lo verifica.
 */
export function indicadoresDe(meses: readonly MesEfectivo[]): IndicadoresAnio {
  const suma = (f: (m: MesEfectivo) => number) => round2(meses.reduce((n, m) => n + f(m), 0));
  const facturadoTotal = suma((m) => m.facturadoEfectivo);
  const cobradoTotal = suma((m) => m.cobrado);
  const egresosTotales = suma((m) => m.egresos);
  const ingresosTotales = suma((m) => m.ingresosTotales);
  return {
    egresosTotales,
    facturadoTotal,
    cobradoTotal,
    porCobrarTotal: suma((m) => m.porCobrar),
    partnershipTotal: suma((m) => m.partnership),
    ingresosTotales,
    margenAnual: round2(ingresosTotales - egresosTotales),
    // Espejo EXACTO del criterio del servidor (lib/finanzas/equilibrio.ts): si estas tres
    // se calcularan distinto acá, el encabezado cambiaría de significado al simular y
    // nadie se daría cuenta. El test de paridad con escenario vacío lo sostiene.
    margenAlDia: round2(
      meses.filter((m) => !m.futuro).reduce((n, m) => n + m.ingresosTotales - m.egresos, 0),
    ),
    comprometidoPorVenir: round2(
      meses.filter((m) => m.futuro).reduce((n, m) => n + m.ingresosTotales, 0),
    ),
    egresosDeCajaTotal: round2(
      meses.filter((m) => !m.futuro).reduce((n, m) => n + m.egresos - m.egresosPorRubro.RESERVA_AGUINALDO, 0),
    ),
    // La tasa de cobro se mide contra el facturado REAL: dividir por uno simulado
    // produciría un porcentaje de cobro inventado, que es de las cifras que más se
    // citan sueltas fuera de la pantalla.
    tasaCobro: (() => {
      const real = round2(meses.reduce((n, m) => n + m.facturado, 0));
      return real === 0 ? null : Math.round((cobradoTotal / real) * 1000) / 1000;
    })(),
    mesesQueCubren: meses.filter((m) => m.cubreEgresos === true).length,
    mesesEgresoCompleto: meses.filter((m) => m.estado === "COMPLETO").length,
    mesesSimulados: meses.filter((m) => m.simulado).length,
  };
}

/**
 * El escenario "igualar al equilibrio": cada mes aterriza exactamente sobre la línea
 * del piso. El partnership ya cuenta como ingreso, así que lo que hay que facturar es
 * el piso MENOS lo que deja el aliado ese mes (nunca menos de cero).
 */
export function igualarAlEquilibrio(meses: readonly FilaMes[], piso: number): OverrideEscenario {
  const out: OverrideEscenario = {};
  for (const m of meses) out[m.periodo] = round2(Math.max(0, piso - m.partnership));
  return out;
}

/** El escenario "no vendemos nada": deja ver el piso desnudo contra los egresos. */
export function limpiarFacturado(meses: readonly FilaMes[]): OverrideEscenario {
  const out: OverrideEscenario = {};
  for (const m of meses) out[m.periodo] = 0;
  return out;
}

/**
 * Lee un monto tecleado por una persona. Tolera "$", separadores de miles y coma
 * decimal, porque un reporte en español se copia y se pega desde una hoja en español.
 * Devuelve null cuando no hay un número — el llamador vuelve al dato real en vez de
 * escribir un NaN que después se propaga a todos los totales.
 */
export function parseMonto(texto: string): number | null {
  const limpio = texto.replace(/[$₡\s]/g, "").replace(/\.(?=\d{3}\b)/g, "").replace(",", ".");
  if (limpio === "") return null;
  const n = Number(limpio);
  return Number.isFinite(n) && n >= 0 ? round2(n) : null;
}

/** Los indicadores tal como los trae el servidor, para comparar sin escenario. */
export function indicadoresDelReporte(r: ReporteEquilibrio): Pick<IndicadoresAnio, "facturadoTotal" | "ingresosTotales" | "margenAnual" | "mesesQueCubren"> {
  return {
    facturadoTotal: r.indicadores.facturadoTotal,
    ingresosTotales: r.indicadores.ingresosTotales,
    margenAnual: r.indicadores.margenAnual,
    mesesQueCubren: r.indicadores.mesesQueCubren,
  };
}
