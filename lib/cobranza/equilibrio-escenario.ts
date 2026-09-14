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
import { margenDeMesesCompletos, type FilaMes, type ReporteEquilibrio } from "@/lib/finanzas/equilibrio";
import { lecturaDeCobranza, type LecturaDeCobranza } from "./antiguedad";

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
  porCobrarVencidoTotal: number;
  partnershipTotal: number;
  ingresosTotales: number;
  /** Los doce meses. PROYECCIÓN: mezcla lo ocurrido con lo comprometido. */
  margenAnual: number;
  /** Solo los meses ya ocurridos con el gasto completo — el titular. */
  margenAlDia: number;
  mesesDelMargen: string[];
  /** Ocurridos, con el gasto incompleto: fuera del margen y dichos por nombre. */
  mesesFueraDelMargen: string[];
  /** Ingreso ya fechado en meses que no llegaron. Se declara aparte. */
  comprometidoPorVenir: number;
  /** Egreso que salió del banco en los meses del margen, sin la reserva de aguinaldo. */
  egresosDeCajaTotal: number;
  /** Lo que entró al banco en los meses del margen. */
  cajaAlDia: number;
  noVentaEnCajaAlDia: number;
  /** Lo vendido del año. NO cambia al simular: simular mueve el facturado, no la venta. */
  vendidoTotal: number;
  /** El % de cobranza en par, sobre lo REAL. Ver `lecturaDeCobranza`. */
  cobranza: LecturaDeCobranza;
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
    // `partnershipEnIngresos` y no `partnership`: la fila ya trae aplicada la bandera
    // PARTNERSHIP_CUBRE_EL_PISO y sin la estimación. Sumar el otro campo haría que simular un mes
    // cambiara también el criterio.
    const ingresosTotales = round2(facturadoEfectivo + m.partnershipEnIngresos);
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
  const porCobrarTotal = suma((m) => m.porCobrar);
  const porCobrarVencidoTotal = suma((m) => m.porCobrarVencido);
  const egresosTotales = suma((m) => m.egresos);
  const ingresosTotales = suma((m) => m.ingresosTotales);
  return {
    egresosTotales,
    facturadoTotal,
    cobradoTotal,
    porCobrarTotal,
    porCobrarVencidoTotal,
    partnershipTotal: suma((m) => m.partnership),
    ingresosTotales,
    margenAnual: round2(ingresosTotales - egresosTotales),
    // La MISMA función que usa el servidor (lib/finanzas/equilibrio.ts), no una copia: si el margen
    // se calculara distinto acá, el encabezado cambiaría de significado al simular y nadie se daría
    // cuenta. El test de paridad con escenario vacío lo sostiene.
    ...margenDeMesesCompletos(meses),
    comprometidoPorVenir: round2(
      meses.filter((m) => m.futuro).reduce((n, m) => n + m.ingresosTotales, 0),
    ),
    // Intocable al simular, igual que el partnership: mover el facturado de marzo es
    // preguntarse qué pasaría si se facturara más, no reescribir lo que se vendió.
    vendidoTotal: round2(meses.reduce((n, m) => n + m.vendido, 0)),
    // El % de cobranza se mide contra lo facturado REAL: dividir por uno simulado
    // produciría un porcentaje de cobro inventado, que es de las cifras que más se
    // citan sueltas fuera de la pantalla. Mismas tres sumas que el servidor.
    cobranza: lecturaDeCobranza({ cobrado: cobradoTotal, porCobrar: porCobrarTotal, vencido: porCobrarVencidoTotal }),
    mesesQueCubren: meses.filter((m) => m.cubreEgresos === true).length,
    mesesEgresoCompleto: meses.filter((m) => m.estado === "COMPLETO").length,
    mesesSimulados: meses.filter((m) => m.simulado).length,
  };
}

/**
 * El escenario "igualar al equilibrio": que NINGÚN mes quede por debajo de la línea.
 *
 * El partnership ya cuenta como ingreso, así que lo que hay que facturar es el piso
 * MENOS lo que deja el aliado ese mes, y nunca menos de cero.
 *
 * ⚠ Descuenta solo lo CONFIRMADO y solo si PARTNERSHIP_CUBRE_EL_PISO (`partnershipEnIngresos`).
 * Antes restaba el partnership entero: un mes con una comisión estimada de US$51.000 figuraba
 * sin necesidad de facturar un peso, apoyado en plata que nadie había visto entrar.
 *
 * ⚠ SUBE, NO EMPAREJA. La primera versión le ponía a todos los meses exactamente el
 * piso, y con eso BAJABA los que ya facturaban por encima: el escenario terminaba
 * mostrando un año PEOR que el real, debajo de un botón que se lee como una aspiración.
 * Nadie se pregunta "¿y si hubiera facturado menos?". La pregunta es qué falta, así que
 * un mes que ya cubre se queda como está.
 */
export function igualarAlEquilibrio(meses: readonly FilaMes[], piso: number): OverrideEscenario {
  const out: OverrideEscenario = {};
  for (const m of meses) {
    const necesario = Math.max(0, piso - m.partnershipEnIngresos);
    out[m.periodo] = round2(Math.max(necesario, m.facturado));
  }
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
