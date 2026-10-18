/**
 * lib/rentabilidad/lectura/senales.ts — LO QUE NO PROGRESA, DETECTADO POR EL CÓDIGO. PURO.
 *
 * La lectura de los números (iniciativa C de docs/roadmap.md; plan en docs/rentabilidad-conectada-plan.md) va en dos
 * pasos: primero el código encuentra las señales con reglas fijas y números exactos; después el modelo, que recibe SOLO
 * esas señales, escribe qué hacer y cuánto invertir. Sin señales no se llama al modelo.
 *
 * Las cuatro clases de señal:
 *  · solvencia — los meses cerrados del año que no cubrieron el piso, y si los que vienen tampoco lo cubren.
 *  · margen-cuenta — una cuenta con cobros cuyo margen cargado está bajo el umbral o es negativo.
 *  · horas-sin-facturar — una cuenta con horas y sin cobros en el período.
 *  · meta — lo que falta para la meta del año que viene con la recurrencia de hoy y el pipeline.
 *
 * Cada señal trae su `clave` (la huella: con una propuesta pendiente igual no se crea otra) y sus números. Todo lo de
 * acá es AGREGADO: ninguna señal lleva una persona, un correo ni un salario (lo vigila lectura.test.ts).
 */

export type TipoDeSenal = "solvencia" | "margen-cuenta" | "horas-sin-facturar" | "meta";

export const ETIQUETA_DE_SENAL: Record<TipoDeSenal, string> = {
  solvencia: "Solvencia",
  "margen-cuenta": "Margen de una cuenta",
  "horas-sin-facturar": "Horas sin facturar",
  meta: "Meta del año",
};

/** Los umbrales, en un solo lugar. Cambiarlos cambia qué se detecta, nunca un número. */
export const UMBRALES = {
  /** Margen cargado bajo esto (de lo cobrado) es una señal. */
  margenBajo: 0.15,
  /** Horas mínimas en el período para que una cuenta sin cobros sea una señal. */
  horasSinFacturar: 10,
  /** Cuántas cuentas por clase, como mucho (las que más plata mueven). */
  cuentasPorClase: 5,
} as const;

export interface MesDeSolvencia {
  periodo: string;
  ingresos: number;
  /** Lo programado sin factura del mes (para los meses que vienen). */
  porFacturar: number;
  futuro: boolean;
  /** El mes ya ocurrió y tiene el gasto completo (los parciales no se juzgan). */
  completo: boolean;
}

export interface CuentaParaLeer {
  clienteId: string;
  nombre: string;
  ingreso: number;
  horas: number;
  costoCargado: number;
  margenCargado: number;
}

export interface EntradaDeLasSenales {
  /** El período que se leyó («jul – sep 2026»). */
  periodo: string;
  /** El último mes cerrado («2026-09»). */
  mes: string;
  piso: number | null;
  meses: readonly MesDeSolvencia[];
  cuentas: readonly CuentaParaLeer[];
  /** horas con clientes ÷ horas pagadas, de 0 a 1. */
  parteAClientes: number | null;
  costoHoraCargado: number | null;
  meta: { anio: number; monto: number; falta: number; recurrenciaMensual: number; expansiones: number; nuevos: number } | null;
}

export interface Senal {
  tipo: TipoDeSenal;
  clave: string;
  clienteId: string | null;
  /** El nombre de la cuenta, si es de una. */
  cuenta: string | null;
  /** Lo que el código vio, en una frase con sus números. */
  resumen: string;
  datos: Record<string, number | string | null>;
}

const r0 = (n: number) => Math.round(n);
const usd = (n: number) => `US$ ${String(Math.round(Math.abs(n))).replace(/\B(?=(\d{3})+(?!\d))/g, ".")}${n < 0 ? " en contra" : ""}`;

export function detectarSenales(e: EntradaDeLasSenales): Senal[] {
  const out: Senal[] = [];

  // ── Solvencia ──
  if (e.piso && e.piso > 0) {
    const cerrados = e.meses.filter((m) => !m.futuro && m.completo);
    const bajo = cerrados.filter((m) => m.ingresos < e.piso!);
    const porVenir = e.meses.filter((m) => m.futuro);
    const porVenirBajo = porVenir.filter((m) => m.ingresos + m.porFacturar < e.piso!);
    if (bajo.length > 0 || porVenirBajo.length > 0) {
      const brecha = bajo.reduce((a, m) => a + (e.piso! - m.ingresos), 0);
      const brechaPorVenir = porVenirBajo.reduce((a, m) => a + (e.piso! - m.ingresos - m.porFacturar), 0);
      out.push({
        tipo: "solvencia",
        clave: `solvencia:${e.mes}`,
        clienteId: null,
        cuenta: null,
        resumen: `${bajo.length} de ${cerrados.length} meses cerrados no cubrieron el piso de ${usd(e.piso)} (faltaron ${usd(brecha)} entre todos); de los ${porVenir.length} que vienen, ${porVenirBajo.length} no llegan con lo facturado y lo programado (faltan ${usd(brechaPorVenir)}).`,
        datos: {
          piso: r0(e.piso),
          mesesBajoElPiso: bajo.map((m) => m.periodo).join(", ") || null,
          brecha: r0(brecha),
          mesesPorVenirBajo: porVenirBajo.map((m) => m.periodo).join(", ") || null,
          brechaPorVenir: r0(brechaPorVenir),
        },
      });
    }
  }

  // ── El margen de cada cuenta ──
  const bajas = e.cuentas
    .filter((c) => c.ingreso > 0 && c.margenCargado / c.ingreso < UMBRALES.margenBajo)
    .sort((a, b) => a.margenCargado - b.margenCargado)
    .slice(0, UMBRALES.cuentasPorClase);
  for (const c of bajas) {
    const pct = c.margenCargado / c.ingreso;
    out.push({
      tipo: "margen-cuenta",
      clave: `margen-cuenta:${c.clienteId}:${e.mes}`,
      clienteId: c.clienteId,
      cuenta: c.nombre,
      resumen: `${c.nombre}: cobró ${usd(c.ingreso)} en ${e.periodo} y sus ${r0(c.horas)} h costaron ${usd(c.costoCargado)} (costo cargado): margen ${usd(c.margenCargado)}, ${Math.round(pct * 100)} % de lo cobrado.`,
      datos: { ingreso: r0(c.ingreso), horas: r0(c.horas), costo: r0(c.costoCargado), margen: r0(c.margenCargado), margenPct: Math.round(pct * 100) },
    });
  }

  // ── Horas sin facturar ──
  const sinCobro = e.cuentas
    .filter((c) => c.ingreso <= 0 && c.horas >= UMBRALES.horasSinFacturar)
    .sort((a, b) => b.costoCargado - a.costoCargado)
    .slice(0, UMBRALES.cuentasPorClase);
  for (const c of sinCobro) {
    out.push({
      tipo: "horas-sin-facturar",
      clave: `horas-sin-facturar:${c.clienteId}:${e.mes}`,
      clienteId: c.clienteId,
      cuenta: c.nombre,
      resumen: `${c.nombre}: ${r0(c.horas)} h en ${e.periodo} sin un cobro ni una factura; costaron ${usd(c.costoCargado)} (costo cargado).`,
      datos: { horas: r0(c.horas), costo: r0(c.costoCargado), parteAClientesDelEquipo: e.parteAClientes === null ? null : Math.round(e.parteAClientes * 100) },
    });
  }

  // ── La meta ──
  if (e.meta && e.meta.falta > 0) {
    out.push({
      tipo: "meta",
      clave: `meta:${e.meta.anio}:${e.mes}`,
      clienteId: null,
      cuenta: null,
      resumen: `Para la meta de ${usd(e.meta.monto)} en ${e.meta.anio}: la recurrencia de hoy (${usd(e.meta.recurrenciaMensual)} al mes) da ${usd(e.meta.recurrenciaMensual * 12)}, el pipeline ponderado suma ${usd(e.meta.expansiones)} en expansiones y ${usd(e.meta.nuevos)} en negocios nuevos; faltan ${usd(e.meta.falta)}.`,
      datos: {
        meta: r0(e.meta.monto),
        recurrenciaMensual: r0(e.meta.recurrenciaMensual),
        expansiones: r0(e.meta.expansiones),
        nuevos: r0(e.meta.nuevos),
        falta: r0(e.meta.falta),
        costoHoraCargado: e.costoHoraCargado === null ? null : r0(e.costoHoraCargado),
      },
    });
  }
  return out;
}
