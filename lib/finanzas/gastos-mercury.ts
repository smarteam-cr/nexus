/**
 * lib/finanzas/gastos-mercury.ts — los GASTOS de Nexus contra los cargos de Mercury (pedido de Elías, 2026-10-06).
 *
 * La conciliación con Mercury solo miraba las entradas (facturas y pagos de clientes). Esto mira las salidas: los cargos
 * de la tarjeta de herramientas (la de crédito de Mercury), los de la de débito y la suscripción de Mercury, contra los
 * recurrentes y los gastos que se anotan a mano en Nexus. Interesa sobre todo la tarjeta de herramientas: qué cobra
 * todos los meses y a qué precio.
 *
 * ── LO QUE DICE ─────────────────────────────────────────────────────────────────────────────────────────────────────
 *   · Cobros recurrentes de la tarjeta: cada comercio que cobró en al menos dos de los últimos tres meses (y en el mes
 *     pasado o en este), con su recurrente de Nexus al lado. «Sin registrar» si Nexus no lo tiene; «precio distinto» si
 *     lo que cobró el último mes completo se aleja del monto de Nexus más de US$2 y del 10%.
 *   · Recurrentes de Nexus que la tarjeta no cobra: herramientas mensuales en dólares sin cargo en los últimos 60 días.
 *   · Cargos sueltos sin registrar: desde que los gastos se anotan en Nexus (`EGRESOS_DESDE_NEXUS`), los cargos que no son
 *     de un comercio recurrente y no tienen su gasto (mismo monto ±1%, ±5 días).
 *   · Gastos de Nexus sin cargo en Mercury: los gastos en dólares de ese mismo período que no aparecen en ninguna tarjeta.
 *
 * ⛔ Las transferencias (planilla, proveedores) NO entran: son salarios y pagos que no pasan por tarjeta, y esta pantalla
 * la ve quien registra. Los gastos en colones tampoco se cruzan (Mercury es en dólares): solo se cuentan.
 * ⛔ Nexus nunca escribe en Mercury. Esto no guarda nada: se recalcula cada vez que se abre.
 *
 * PURO: sin Prisma ni red.
 */

export interface MovimientoMercuryParaGasto {
  id: string;
  /** Con signo, en dólares: los gastos son negativos. */
  monto: number;
  estado: string;
  tipo: string;
  contraparteNombre: string | null;
  /** Día del cargo (posteado o, si todavía no, creado). */
  fechaISO: string;
}

export interface CargoDeTarjeta {
  id: string;
  fechaISO: string;
  monto: number;
  comercio: string;
  /** La tarjeta de herramientas (crédito), la de débito, o la suscripción de Mercury. */
  medio: "CREDITO" | "DEBITO" | "MERCURY";
}

export interface RecurrenteDeNexus {
  id: string;
  nombre: string;
  categoria: string;
  monto: number;
  moneda: string;
  frecuencia: "MENSUAL" | "ANUAL";
}

export interface GastoDeNexus {
  id: string;
  nombre: string;
  monto: number;
  moneda: string;
  fechaISO: string;
}

export type EstadoDelComercio = "SIN_REGISTRAR" | "PRECIO_DISTINTO" | "AL_DIA";

export interface ComercioRecurrente {
  comercio: string;
  medio: CargoDeTarjeta["medio"];
  /** Los últimos tres meses, del más viejo al de hoy (0 = no cobró). */
  meses: Array<{ periodo: string; monto: number }>;
  ultimoCargo: { fechaISO: string; monto: number };
  /** Lo que cobró el último mes completo (o este, si el pasado no cobró). */
  precio: number;
  enNexus: RecurrenteDeNexus | null;
  estado: EstadoDelComercio;
}

export interface GastosContraMercury {
  desde: string;
  recurrentes: ComercioRecurrente[];
  nexusSinCargo: RecurrenteDeNexus[];
  sueltosSinRegistrar: CargoDeTarjeta[];
  gastosSinCargo: GastoDeNexus[];
  /** Gastos en colones del período: no se cruzan, solo se cuentan. */
  gastosEnColones: number;
}

const TIPOS: Record<string, CargoDeTarjeta["medio"]> = {
  creditCardTransaction: "CREDITO",
  debitCardTransaction: "DEBITO",
  billingEngineSubscriptionFee: "MERCURY",
};

/** Un cargo que cuenta: salida, no fallida, y de tarjeta o de la suscripción de Mercury. Las transferencias no. */
export function cargoDeTarjeta(m: MovimientoMercuryParaGasto): CargoDeTarjeta | null {
  const medio = TIPOS[m.tipo];
  if (!medio || m.monto >= 0 || m.estado === "failed" || m.estado === "cancelled") return null;
  const comercio = (m.contraparteNombre ?? "").trim() || (medio === "MERCURY" ? "Mercury" : "Sin nombre");
  return { id: m.id, fechaISO: m.fechaISO, monto: Math.round(-m.monto * 100) / 100, comercio, medio };
}

// ── Nombres ──────────────────────────────────────────────────────────────────────────────────────────────────────────

const compacto = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

const RELLENO = new Set(["licencia", "elias", "premium", "inc", "llc", "com", "mgf", "the", "app", "plan"]);
const palabras = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 3 && !RELLENO.has(w));

/** Nombres que no se parecen y son lo mismo (el comercio de Mercury → cómo se llama en Nexus). */
const ALIAS: Record<string, string[]> = {
  anthropic: ["claude"],
  openai: ["chatgpt"],
  amazonwebservices: ["aws"],
  googleworkspace: ["gsuite", "googlegsuite"],
  magnific: ["freepik"],
};

/** Qué tanto se parece un recurrente de Nexus a un comercio: 3 = mismo nombre o alias, 2 = uno contiene al otro, 1 = una palabra. */
export function parecido(nexus: string, comercio: string): number {
  const a = compacto(nexus);
  const b = compacto(comercio);
  if (!a || !b) return 0;
  if (a === b || (ALIAS[b] ?? []).some((x) => a === x || a.includes(x))) return 3;
  if (a.includes(b) || b.includes(a)) return 2;
  if (palabras(nexus).some((w) => b.includes(w)) || palabras(comercio).some((w) => a.includes(w))) return 1;
  return 0;
}

// ── Fechas ───────────────────────────────────────────────────────────────────────────────────────────────────────────

const periodoDe = (iso: string) => iso.slice(0, 7);
function mesAntes(periodo: string, n: number): string {
  const [y, m] = periodo.split("-").map(Number) as [number, number];
  const t = y * 12 + (m - 1) - n;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}`;
}
const dias = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
const centavos = (n: number) => Math.round(n * 100);

// ── El cruce ─────────────────────────────────────────────────────────────────────────────────────────────────────────

export function gastosContraMercury(entrada: {
  cargos: ReadonlyArray<CargoDeTarjeta>;
  recurrentes: ReadonlyArray<RecurrenteDeNexus>;
  gastos: ReadonlyArray<GastoDeNexus>;
  hoyISO: string;
  /** Desde qué mes los gastos se anotan en Nexus (antes salían del Excel). */
  desde: string;
}): GastosContraMercury {
  const { cargos, recurrentes, gastos, hoyISO, desde } = entrada;
  const m0 = periodoDe(hoyISO);
  const ultimos3 = [mesAntes(m0, 2), mesAntes(m0, 1), m0];

  // Los cargos por comercio.
  const porComercio = new Map<string, CargoDeTarjeta[]>();
  for (const c of cargos) {
    const k = compacto(c.comercio);
    porComercio.set(k, [...(porComercio.get(k) ?? []), c]);
  }

  // Los recurrentes: dos de los últimos tres meses, y el mes pasado o este. Solo la tarjeta de herramientas y la
  // suscripción de Mercury: la de débito es de viajes y compras sueltas (un Airbnb dos meses seguidos no es una suscripción).
  const esRecurrente = new Set<string>();
  const comercios: Array<Omit<ComercioRecurrente, "enNexus" | "estado">> = [];
  for (const [k, todos] of porComercio) {
    const lista = todos.filter((c) => c.medio !== "DEBITO");
    if (lista.length === 0) continue;
    const porMes = new Map<string, number>();
    for (const c of lista) porMes.set(periodoDe(c.fechaISO), (porMes.get(periodoDe(c.fechaISO)) ?? 0) + centavos(c.monto));
    const con = ultimos3.filter((p) => (porMes.get(p) ?? 0) > 0);
    if (con.length < 2 || !(porMes.has(ultimos3[1]!) || porMes.has(m0))) continue;
    esRecurrente.add(k);
    const ordenados = [...lista].sort((a, b) => a.fechaISO.localeCompare(b.fechaISO));
    const ultimo = ordenados[ordenados.length - 1]!;
    const precioCent = porMes.get(ultimos3[1]!) ?? porMes.get(m0) ?? 0;
    comercios.push({
      comercio: ultimo.comercio,
      medio: ultimo.medio,
      meses: ultimos3.map((p) => ({ periodo: p, monto: (porMes.get(p) ?? 0) / 100 })),
      ultimoCargo: { fechaISO: ultimo.fechaISO, monto: ultimo.monto },
      precio: precioCent / 100,
    });
  }

  // Cada recurrente de Nexus (en dólares) va con el comercio que más se le parece; cada comercio, con un solo recurrente.
  const enDolares = recurrentes.filter((r) => r.moneda === "USD");
  const usados = new Set<string>();
  const nexusDe = new Map<string, RecurrenteDeNexus>();
  const candidatos = enDolares
    .flatMap((r) => [...porComercio.keys()].map((k) => ({ r, k, p: parecido(r.nombre, porComercio.get(k)![0]!.comercio) })))
    .filter((x) => x.p > 0)
    .sort((a, b) => b.p - a.p || (porComercio.get(b.k)!.length - porComercio.get(a.k)!.length));
  for (const { r, k } of candidatos) {
    if (usados.has(r.id) || nexusDe.has(k)) continue;
    usados.add(r.id);
    nexusDe.set(k, r);
  }

  const tolerancia = (ref: number) => Math.max(2, ref * 0.1);
  const recurrentesOut: ComercioRecurrente[] = comercios
    .map((c) => {
      const enNexus = nexusDe.get(compacto(c.comercio)) ?? null;
      const ref = enNexus?.monto ?? 0;
      const precio = enNexus?.frecuencia === "ANUAL" ? c.ultimoCargo.monto : c.precio;
      const estado: EstadoDelComercio = !enNexus ? "SIN_REGISTRAR" : Math.abs(precio - ref) > tolerancia(ref) ? "PRECIO_DISTINTO" : "AL_DIA";
      return { ...c, enNexus, estado };
    })
    .sort((a, b) => ORDEN[a.estado] - ORDEN[b.estado] || b.precio - a.precio);

  // Recurrentes de Nexus (herramientas mensuales en dólares) sin cargo en los últimos 60 días.
  const cobradoHace = (r: RecurrenteDeNexus) => {
    const k = [...nexusDe.entries()].find(([, x]) => x.id === r.id)?.[0];
    if (!k) return Infinity;
    const ultimo = porComercio.get(k)!.map((c) => c.fechaISO).sort().pop()!;
    return dias(ultimo, hoyISO);
  };
  const nexusSinCargo = enDolares
    .filter((r) => r.categoria === "HERRAMIENTA" && r.frecuencia === "MENSUAL" && cobradoHace(r) > 60)
    .sort((a, b) => b.monto - a.monto);

  // Desde que los gastos se anotan en Nexus: cargos sueltos contra gastos, uno a uno. Lo de débito siempre es suelto.
  const inicio = `${desde}-01`;
  const sueltos = cargos
    .filter(
      (c) =>
        c.fechaISO >= inicio &&
        (c.medio === "DEBITO" || (!esRecurrente.has(compacto(c.comercio)) && !nexusDe.has(compacto(c.comercio)))),
    )
    .sort((a, b) => a.fechaISO.localeCompare(b.fechaISO));
  const gastosDelPeriodo = gastos.filter((g) => g.fechaISO >= inicio);
  const gastosUsd = gastosDelPeriodo.filter((g) => g.moneda === "USD");
  const cargoUsado = new Set<string>();
  const gastoUsado = new Set<string>();
  for (const g of gastosUsd) {
    const par = cargos.find(
      (c) =>
        !cargoUsado.has(c.id) &&
        c.fechaISO >= inicio &&
        Math.abs(c.monto - g.monto) <= Math.max(0.5, g.monto * 0.01) &&
        Math.abs(dias(g.fechaISO, c.fechaISO)) <= 5,
    );
    if (par) {
      cargoUsado.add(par.id);
      gastoUsado.add(g.id);
    }
  }

  return {
    desde,
    recurrentes: recurrentesOut,
    nexusSinCargo,
    sueltosSinRegistrar: sueltos.filter((c) => !cargoUsado.has(c.id)),
    gastosSinCargo: gastosUsd.filter((g) => !gastoUsado.has(g.id)),
    gastosEnColones: gastosDelPeriodo.filter((g) => g.moneda !== "USD").length,
  };
}

const ORDEN: Record<EstadoDelComercio, number> = { SIN_REGISTRAR: 0, PRECIO_DISTINTO: 1, AL_DIA: 2 };
