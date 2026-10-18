/**
 * lib/ai/proyeccion.ts — CUÁNTO SE VA A GASTAR EN CLAUDE LOS PRÓXIMOS MESES. PURO: lo prueba lib/ai/proyeccion.test.ts,
 * la base la mide lib/ai/proyeccion-server.ts y los escenarios los mueve una persona en /integrations/gasto-ia
 * › «Proyección» (no se guardan).
 *
 * ── EL MODELO ────────────────────────────────────────────────────────────────
 * Costo de un mes = Σ por componente (costo unitario MEDIDO × volumen esperado). El costo unitario sale de los últimos
 * 30 días de `LlmCall`: lo que costó leer una reunión (con todo lo que esa lectura dispara), una corrida del vigía, un
 * turno del chat, un mapeo de procesos con Opus. Lo que no tiene una unidad clara (la preventa, los documentos y el
 * resto) se proyecta como un monto mensual que crece con la cantidad de clientes.
 *
 * ⚠ Es una cuenta, no una predicción: no sabe de una campaña de marketing ni de un agente nuevo. Por eso cada número
 * dice de dónde sale y los escenarios se mueven a mano.
 *
 * ── LOS AHORROS ──────────────────────────────────────────────────────────────
 * Cada palanca de lib/ai/ahorro.ts tiene su fracción MEDIDA sobre el componente que toca (nunca un porcentaje
 * inventado): el clasificador con Haiku cuesta un tercio; lo que va por lote, la mitad; la caché del prompt del vigía y
 * el prefijo compartido de la lectura y los hechos, lo que da la cuenta de sus tokens.
 */

export type ClaveDeComponente = "reuniones" | "hechos" | "vigia" | "chat" | "procesos" | "venta" | "resto";

/** Con qué crece un componente: las reuniones, los proyectos de la cartera o la cantidad de clientes en general. */
export type EscalaDelComponente = "reuniones" | "proyectos" | "clientes";

export interface ComponenteMedido {
  clave: ClaveDeComponente;
  nombre: string;
  /** Qué es una unidad («reunión leída», «corrida», «mes»…). */
  unidad: string;
  /** US$ por unidad, medido. */
  costoUnitario: number;
  /** Unidades por mes, medidas (30 días). */
  volumenMensual: number;
  escala: EscalaDelComponente;
  /** De dónde sale el número, en palabras de la pantalla. */
  deDondeSale: string;
}

/** Las fracciones de cada ahorro, medidas sobre el componente que tocan (0–1). */
export interface FraccionesDeAhorro {
  /** reuniones: la parte del clasificador que pasa a Haiku × (1 − 1/3). */
  modelosBaratos: number;
  /** reuniones y vigía: la parte que puede ir por lote × 0,5. */
  lotesReuniones: number;
  lotesVigia: number;
  /** vigía: el prompt cacheado. */
  cacheVigia: number;
  /** hechos: la reunión leída de la caché de la lectura (neto del recargo de escribirla). */
  prefijoCompartido: number;
}

export interface BaseDeCalculo {
  /** El primer mes que se proyecta («2026-11»). */
  primerMes: string;
  componentes: ComponenteMedido[];
  ahorros: FraccionesDeAhorro;
  /** Proyectos de la cartera con servicio activo hoy (para escalar el vigía con los servicios nuevos). */
  proyectosActivos: number;
  /** ¿Los hechos ya están prendidos? Si no, su componente arranca apagado en el escenario. */
  hechosPrendidosHoy: boolean;
  /** Lo que costó el último mes completo, para comparar. */
  ultimoMesCompleto: { mes: string; costo: number } | null;
}

export interface Escenario {
  meses: number;
  /** Clientes de más desde el primer mes (%). */
  clientesPct: number;
  /** Crecimiento por mes encima de eso (%). */
  crecimientoMensualPct: number;
  /** Reuniones de más por cliente (%). */
  reunionesPct: number;
  /** Servicios recurrentes nuevos (SmartLoop): cada uno suma reuniones y un proyecto al vigía. */
  serviciosRecurrentes: number;
  reunionesPorRecurrente: number;
  hechos: boolean;
  modelosBaratos: boolean;
  lotes: boolean;
  /** La caché del prompt del vigía y el prefijo compartido de la lectura y los hechos. */
  cache: boolean;
}

export const ESCENARIO_DE_HOY = (base: Pick<BaseDeCalculo, "hechosPrendidosHoy">): Escenario => ({
  meses: 6,
  clientesPct: 0,
  crecimientoMensualPct: 0,
  reunionesPct: 0,
  serviciosRecurrentes: 0,
  reunionesPorRecurrente: 4,
  hechos: base.hechosPrendidosHoy,
  modelosBaratos: false,
  lotes: false,
  cache: false,
});

export interface MesProyectado {
  mes: string;
  porComponente: Record<ClaveDeComponente, number>;
  total: number;
  /** Lo que costaría el mismo mes sin ninguna palanca de ahorro. */
  sinAhorros: number;
}

export interface Proyeccion {
  meses: MesProyectado[];
  total: number;
  sinAhorros: number;
  ahorro: number;
  promedioMensual: number;
}

/** El mes siguiente de «AAAA-MM». */
export function mesSiguiente(mes: string, n = 1): string {
  const [a, m] = mes.split("-").map(Number);
  const d = new Date(Date.UTC(a, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Acota un número; lo que no es número (un campo vacío) vale `porDefecto`, no el mínimo: un −90 % de clientes no es «nada». */
const acotar = (n: number, min: number, max: number, porDefecto = 0) => Math.min(max, Math.max(min, Number.isFinite(n) ? n : porDefecto));

/** Lo que el escenario no puede romper: meses 3–6, porcentajes entre −90 y +500, recurrentes 0–200. */
export function escenarioValido(e: Escenario): Escenario {
  return {
    ...e,
    meses: Math.round(acotar(e.meses, 3, 6, 6)),
    clientesPct: acotar(e.clientesPct, -90, 500),
    crecimientoMensualPct: acotar(e.crecimientoMensualPct, -50, 100),
    reunionesPct: acotar(e.reunionesPct, -90, 500),
    serviciosRecurrentes: Math.round(acotar(e.serviciosRecurrentes, 0, 200)),
    reunionesPorRecurrente: acotar(e.reunionesPorRecurrente, 0, 40, 4),
  };
}

/** Proyecta los meses del escenario. */
export function proyectar(base: BaseDeCalculo, escenarioCrudo: Escenario): Proyeccion {
  const e = escenarioValido(escenarioCrudo);
  const porClave = new Map(base.componentes.map((c) => [c.clave, c]));
  const reunionesHoy = porClave.get("reuniones")?.volumenMensual ?? 0;

  const meses: MesProyectado[] = [];
  for (let i = 0; i < e.meses; i++) {
    const clientes = (1 + e.clientesPct / 100) * Math.pow(1 + e.crecimientoMensualPct / 100, i);
    const reunionesDeMas = e.serviciosRecurrentes * e.reunionesPorRecurrente;
    const factorReuniones = reunionesHoy > 0 ? (reunionesHoy * clientes * (1 + e.reunionesPct / 100) + reunionesDeMas) / reunionesHoy : 1;
    const factorProyectos = base.proyectosActivos > 0 ? (base.proyectosActivos * clientes + e.serviciosRecurrentes) / base.proyectosActivos : clientes;

    const porComponente = {} as Record<ClaveDeComponente, number>;
    let total = 0;
    let sinAhorros = 0;
    for (const c of base.componentes) {
      if (c.clave === "hechos" && !e.hechos) {
        porComponente[c.clave] = 0;
        continue;
      }
      const factor = c.escala === "reuniones" ? factorReuniones : c.escala === "proyectos" ? factorProyectos : clientes;
      const bruto = c.costoUnitario * c.volumenMensual * factor;
      const ahorro = fraccionDeAhorro(c.clave, base.ahorros, e);
      const neto = bruto * (1 - ahorro);
      porComponente[c.clave] = neto;
      total += neto;
      sinAhorros += bruto;
    }
    for (const clave of ["reuniones", "hechos", "vigia", "chat", "procesos", "venta", "resto"] as const) porComponente[clave] ??= 0;
    meses.push({ mes: mesSiguiente(base.primerMes, i), porComponente, total, sinAhorros });
  }
  const total = meses.reduce((s, m) => s + m.total, 0);
  const sinAhorros = meses.reduce((s, m) => s + m.sinAhorros, 0);
  return { meses, total, sinAhorros, ahorro: sinAhorros - total, promedioMensual: meses.length ? total / meses.length : 0 };
}

/** La fracción que se ahorra en un componente con las palancas que prende el escenario. Nunca más de 0,9. */
export function fraccionDeAhorro(clave: ClaveDeComponente, a: FraccionesDeAhorro, e: Pick<Escenario, "modelosBaratos" | "lotes" | "cache">): number {
  // Las palancas se componen: lo que ya se ahorró una no lo vuelve a ahorrar la otra.
  const quedan = (fracciones: number[]) => 1 - fracciones.reduce((r, f) => r * (1 - acotar(f, 0, 1)), 1);
  const f: number[] = [];
  if (clave === "reuniones") {
    if (e.modelosBaratos) f.push(a.modelosBaratos);
    if (e.lotes) f.push(a.lotesReuniones);
  }
  if (clave === "vigia") {
    if (e.cache) f.push(a.cacheVigia);
    if (e.lotes) f.push(a.lotesVigia);
  }
  if (clave === "hechos" && e.cache) f.push(a.prefijoCompartido);
  return Math.min(0.9, quedan(f));
}

/* ── Las fracciones, desde los tokens medidos ─────────────────────────────── */

/**
 * Cuánto se ahorra en los hechos si leen la reunión de la caché que escribió la lectura: la reunión (`tokensReunion`)
 * pasa de pagarse entera a pagarse a 0,1, y la lectura paga 0,25 de más por escribirla. Como fracción del costo de los
 * hechos (`costoHechos`, US$ por reunión). `precioEntrada` en US$ por millón.
 */
export function fraccionDelPrefijoCompartido(o: { tokensReunion: number; precioEntrada: number; costoHechos: number; factorLectura?: number; factorEscritura?: number }): number {
  if (o.costoHechos <= 0 || o.tokensReunion <= 0) return 0;
  const lectura = o.factorLectura ?? 0.1;
  const escritura = o.factorEscritura ?? 1.25;
  const ahorro = (o.tokensReunion / 1_000_000) * o.precioEntrada * (1 - lectura - (escritura - 1));
  return acotar(ahorro / o.costoHechos, 0, 0.9);
}

/**
 * Cuánto se ahorra en el vigía cacheando su prompt: de cada tanda de `llamadasPorTanda` corridas seguidas (dentro de 5
 * minutos), la primera escribe el prompt (1,25) y las demás lo leen (0,1). Como fracción del costo medio de una corrida.
 */
export function fraccionDeLaCacheDelPrompt(o: { tokensPrompt: number; precioEntrada: number; costoPorCorrida: number; llamadasPorTanda: number }): number {
  if (o.costoPorCorrida <= 0 || o.tokensPrompt <= 0 || o.llamadasPorTanda <= 0) return 0;
  const n = o.llamadasPorTanda;
  const sinCache = n * o.tokensPrompt;
  const conCache = 1.25 * o.tokensPrompt + (n - 1) * 0.1 * o.tokensPrompt;
  const ahorroPorCorrida = (((sinCache - conCache) / n) / 1_000_000) * o.precioEntrada;
  return acotar(ahorroPorCorrida / o.costoPorCorrida, 0, 0.9);
}
