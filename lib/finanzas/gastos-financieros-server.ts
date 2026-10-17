/**
 * lib/finanzas/gastos-financieros-server.ts — leer y decidir los gastos financieros (2026-10-17). Server-only por lo que
 * importa (Prisma); sin la marca `server-only` porque lo importa lib/cobranza/queries.ts, que cargan las pruebas.
 *
 * La regla de qué es candidato vive en lib/finanzas/gastos-financieros.ts (puro). Acá: leer la copia de Mercury, atar
 * las entradas a sus facturas con la regla de siempre (`entradasDeFacturas`), y guardar lo que la persona decide.
 * ⛔ No toca Mercury ni la copia: guarda solo la decisión (`GastoFinanciero`).
 */
import { prisma } from "@/lib/db/prisma";
import { esquemaDesactualizado } from "@/lib/db/esquema";
import { esEntradaDeCliente } from "@/lib/cobranza/mercury/espejo";
import { entradasDeFacturas } from "@/lib/cobranza/mercury/diferencias";
import {
  candidatosDeGastoFinanciero,
  egresosFinancieros,
  revisionFinanciera,
  type CandidatoFinanciero,
  type GastoFinancieroDecidido,
  type RevisionFinanciera,
  type TipoGastoFinanciero,
} from "./gastos-financieros";

/** Un error para una persona, con su estado HTTP. Propio y no `CobranzaError`: este archivo lo importa queries.ts. */
export class GastoFinancieroError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

const iso = (d: Date) => d.toISOString().slice(0, 10);

/** Desde cuándo se revisa: doce meses para atrás desde hoy (`YYYY-MM-DD`). */
export function desdeParaRevisar(hoy: string): string {
  return `${Number(hoy.slice(0, 4)) - 1}${hoy.slice(4)}`;
}

/** Los candidatos de la copia de Mercury desde `desde`. */
async function candidatos(desde: string): Promise<CandidatoFinanciero[]> {
  const [movs, facturas] = await Promise.all([
    prisma.movimientoMercury.findMany({
      where: { estadoEspejo: "VIGENTE", creadoEnMercury: { gte: new Date(`${desde}T00:00:00.000Z`) } },
      select: {
        id: true, monto: true, estado: true, tipo: true, contraparteNombre: true, descripcionBanco: true, nota: true, conTarjeta: true,
        posteadoEn: true, creadoEnMercury: true,
      },
    }),
    prisma.facturaMercury.findMany({
      where: { estadoEspejo: "VIGENTE", estado: "Paid" },
      select: { id: true, numero: true, invoiceDate: true, dueDate: true, monto: true, moneda: true, estado: true, mercuryCustomerId: true, clienteNombre: true, actualizadaEnMercury: true },
    }),
  ]);
  const movimientos = movs.map((m) => ({
    id: m.id,
    monto: Number(m.monto),
    estado: m.estado,
    tipo: m.tipo,
    contraparteNombre: m.contraparteNombre,
    descripcionBanco: m.descripcionBanco,
    nota: m.nota,
    conTarjeta: m.conTarjeta,
    fecha: iso(m.posteadoEn ?? m.creadoEnMercury),
  }));
  /* Las entradas atadas a sus facturas pagadas, con la misma regla que «Lo que no cuadra» y que «Lo pagado». */
  const entradas = movimientos
    .filter((m) => esEntradaDeCliente(m))
    .map((m) => ({ id: m.id, monto: m.monto, fecha: m.fecha, quien: m.contraparteNombre ?? "" }));
  const porFactura = entradasDeFacturas(
    facturas.map((f) => ({
      id: f.id, numero: f.numero, invoiceDate: iso(f.invoiceDate), dueDate: f.dueDate ? iso(f.dueDate) : null, monto: Number(f.monto), moneda: f.moneda,
      estado: f.estado, mercuryCustomerId: f.mercuryCustomerId, clienteNombre: f.clienteNombre, actualizadaEn: iso(f.actualizadaEnMercury),
    })),
    entradas,
  );
  const facturaPorId = new Map(facturas.map((f) => [f.id, f]));
  const pagos = [...porFactura].map(([facturaId, e]) => {
    const f = facturaPorId.get(facturaId)!;
    return { entradaId: e.id, facturaNumero: f.numero, facturaMonto: Number(f.monto), cliente: f.clienteNombre };
  });
  return candidatosDeGastoFinanciero(movimientos, pagos, desde);
}

function aDecidido(g: {
  id: string; movimientoMercuryId: string; tipo: string; decision: string; fecha: Date; monto: unknown; moneda: string; montoPropuesto: unknown;
  descripcion: string; decididoPor: string; decididoEn: Date; nota: string | null;
}): GastoFinancieroDecidido {
  return {
    id: g.id,
    movimientoMercuryId: g.movimientoMercuryId,
    tipo: g.tipo as TipoGastoFinanciero,
    decision: g.decision as "GASTO" | "NO_ES",
    fecha: iso(g.fecha),
    monto: Number(g.monto),
    moneda: g.moneda,
    montoPropuesto: g.montoPropuesto === null ? null : Number(g.montoPropuesto),
    descripcion: g.descripcion,
    decididoPor: g.decididoPor,
    decididoEn: g.decididoEn.toISOString(),
    nota: g.nota,
  };
}

export interface RevisionConEstado extends RevisionFinanciera {
  desde: string;
  /** false = la tabla todavía no existe (el SQL de 2026-10-17 sin aplicar): se ve la lista, no se puede decidir. */
  sePuedeDecidir: boolean;
}

/** La revisión: lo que espera una decisión y lo ya decidido, de los últimos doce meses. */
export async function cargarRevisionFinanciera(hoy: string): Promise<RevisionConEstado> {
  const desde = desdeParaRevisar(hoy);
  const lista = await candidatos(desde);
  try {
    const decididos = await prisma.gastoFinanciero.findMany({ where: { fecha: { gte: new Date(`${desde}T00:00:00.000Z`) } } });
    return { ...revisionFinanciera(lista, decididos.map(aDecidido)), desde, sePuedeDecidir: true };
  } catch (e) {
    if (!esquemaDesactualizado(e)) throw e;
    console.warn("[gastos financieros] falta la tabla GastoFinanciero (¿el SQL de 2026-10-17?)");
    return { ...revisionFinanciera(lista, []), desde, sePuedeDecidir: false };
  }
}

/**
 * Lo que una persona decide sobre un movimiento. El tipo, el día y la descripción salen del candidato que arma el
 * servidor, no del pedido: la pantalla solo dice qué movimiento, si es gasto y por cuánto.
 */
export async function decidirGastoFinanciero(
  input: { movimientoId: string; decision: "GASTO" | "NO_ES"; monto: number | null; nota: string | null },
  actor: string,
  hoy: string,
): Promise<void> {
  const c = (await candidatos(desdeParaRevisar(hoy))).find((x) => x.movimientoId === input.movimientoId);
  if (!c) throw new GastoFinancieroError("Ese movimiento ya no es un candidato: vuelve a cargar la lista.", 404);
  const monto = input.decision === "GASTO" ? (input.monto ?? c.montoPropuesto) : 0;
  if (input.decision === "GASTO" && !(monto > 0)) throw new GastoFinancieroError("Un gasto financiero tiene que tener monto.");
  if (input.decision === "GASTO" && c.como === "CARGO" && monto > Math.abs(c.montoMovimiento) + 0.005) {
    throw new GastoFinancieroError("El gasto no puede ser mayor que el cargo.");
  }
  try {
    await prisma.gastoFinanciero.create({
      data: {
        movimientoMercuryId: c.movimientoId,
        tipo: c.tipo,
        decision: input.decision,
        fecha: new Date(`${c.fecha}T00:00:00.000Z`),
        monto: Math.round(monto * 100) / 100,
        moneda: c.moneda,
        montoPropuesto: c.montoPropuesto,
        descripcion: c.descripcion,
        decididoPor: actor,
        decididoEn: new Date(),
        nota: input.nota?.trim() || null,
      },
    });
  } catch (e) {
    if (e && typeof e === "object" && (e as { code?: string }).code === "P2002") {
      throw new GastoFinancieroError("Ese movimiento ya se decidió (quizás otra persona, recién).", 409);
    }
    if (esquemaDesactualizado(e)) throw new GastoFinancieroError("Falta aplicar el SQL de los gastos financieros (2026-10-17).", 503);
    throw e;
  }
}

/** Deshacer una decisión: el movimiento vuelve a la lista. No toca Mercury. */
export async function deshacerGastoFinanciero(id: string): Promise<void> {
  const r = await prisma.gastoFinanciero.deleteMany({ where: { id } });
  if (r.count === 0) throw new GastoFinancieroError("Esa decisión ya no existe.", 404);
}

/**
 * Las líneas del rubro FINANCIERO de un año, para el punto de equilibrio. ⚠ Sin la tabla devuelve [] y lo dice: el
 * reporte no se cae por un SQL sin aplicar.
 */
export async function cargarGastosFinancierosDelAnio(anio: number) {
  try {
    const filas = await prisma.gastoFinanciero.findMany({
      where: { decision: "GASTO", fecha: { gte: new Date(`${anio}-01-01T00:00:00.000Z`), lt: new Date(`${anio + 1}-01-01T00:00:00.000Z`) } },
    });
    return egresosFinancieros(filas.map(aDecidido));
  } catch (e) {
    if (!esquemaDesactualizado(e)) throw e;
    console.warn("[equilibrio] falta la tabla GastoFinanciero (¿el SQL de 2026-10-17?): sin gastos financieros");
    return [];
  }
}
