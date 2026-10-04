/**
 * lib/finanzas/revision-server.ts — lee y escribe la revisión de quien supervisa (rediseño de Finanzas, 2026-10-03,
 * etapa «Revisión»). Server-only. Las reglas (huella, avisos, orden) viven en revision.ts.
 *
 * Qué entra: los pagos (Cobro en Cobrado) que confirmó alguien del equipo que NO es Super Admin, y los gastos que anotó,
 * registrados desde `REVISION_DESDE`. Las firmas de importación (el libro de Alex, la planilla de facturaciones) no son
 * de nadie del equipo y no entran: ya se cuadraron contra su fuente.
 *
 * ⛔ La huella se calcula SIEMPRE acá, con lo que hay en la base al momento de revisar: nunca la manda la pantalla. Así
 * un «Está bien» no puede quedar pegado a números que la persona no vio.
 */
import "server-only";
import { prisma } from "@/lib/db/prisma";
import { CobranzaError } from "@/lib/cobranza/mutations";
import { crDateParts } from "@/lib/jobs/time";
import { fmtMontoLibro } from "@/lib/cobranza/montos";
import { etiquetaMes } from "./gastos";
import {
  REVISION_DESDE,
  avisosDeGasto,
  avisosDePago,
  diaCorto,
  enRevision,
  huellaDeGasto,
  huellaDePago,
  ordenDeRevision,
  type Devuelto,
  type EnRevision,
  type TipoRevisado,
} from "./revision";

export interface FilaDeRevision {
  tipo: TipoRevisado;
  id: string;
  /** El cliente del pago, o el nombre del gasto. */
  titulo: string;
  /** «Cuota de junio 2026» o las etiquetas del gasto. */
  detalle: string;
  monto: number;
  moneda: string;
  /** Cuándo entró la plata, o la fecha del gasto (YYYY-MM-DD). */
  fecha: string | null;
  /** Nombre de pila de quien lo registró. */
  registradoPor: string;
  registradoPorEmail: string;
  /** Día (de Costa Rica) en que se registró. */
  registradoEn: string;
  avisos: string[];
  estado: EnRevision;
  /** El comentario de la devolución (DEVUELTO y CORREGIDO). */
  comentario: string | null;
  /** Dónde se corrige. */
  href: string;
}

export interface DatosDeRevision {
  pagos: FilaDeRevision[];
  gastos: FilaDeRevision[];
  /** Lo devuelto que todavía no se corrigió: espera a quien lo registró. */
  devueltos: FilaDeRevision[];
}

const diaCR = (d: Date) => crDateParts(d).dateKey;
const desde = new Date(`${REVISION_DESDE}T06:00:00Z`); // medianoche de Costa Rica

/** Quienes registran: el equipo que no es Super Admin, por email en minúsculas → nombre de pila. */
async function quienesRegistran(): Promise<Map<string, string>> {
  const miembros = await prisma.teamMember.findMany({
    where: { roleEnum: { not: "SUPER_ADMIN" } },
    select: { email: true, name: true },
  });
  return new Map(miembros.map((m) => [m.email.toLowerCase(), m.name.split(" ")[0] || m.email]));
}

const SELECT_PAGO = {
  id: true,
  estado: true,
  monto: true,
  moneda: true,
  periodo: true,
  fechaCobro: true,
  fechaEmision: true,
  referenciaExterna: true,
  numeroFactura: true,
  confirmadoPor: true,
  confirmadoEn: true,
  cuentaId: true,
  cuenta: { select: { client: { select: { name: true } } } },
} as const;

const SELECT_GASTO = {
  id: true,
  nombre: true,
  monto: true,
  moneda: true,
  fecha: true,
  tags: true,
  registradoPor: true,
  createdAt: true,
} as const;

type PagoLeido = Awaited<ReturnType<typeof leerPagos>>[number];
type GastoLeido = Awaited<ReturnType<typeof leerGastos>>[number];

function leerPagos(where: { id?: { in: string[] } } = {}) {
  return prisma.cobro.findMany({
    where: { estado: "COBRADO", confirmadoEn: { gte: desde }, confirmadoPor: { not: null }, ...where },
    select: SELECT_PAGO,
  });
}

function leerGastos(where: { id?: { in: string[] } } = {}) {
  return prisma.gastoPuntual.findMany({
    where: { createdAt: { gte: desde }, registradoPor: { not: null }, ...where },
    select: SELECT_GASTO,
  });
}

const huellaPago = (p: PagoLeido) =>
  huellaDePago({
    estado: p.estado,
    monto: Number(p.monto),
    moneda: p.moneda,
    fechaCobro: p.fechaCobro ? p.fechaCobro.toISOString().slice(0, 10) : null,
    referenciaExterna: p.referenciaExterna,
    numeroFactura: p.numeroFactura,
  });

const huellaGasto = (g: GastoLeido) =>
  huellaDeGasto({ nombre: g.nombre, monto: Number(g.monto), moneda: g.moneda, fecha: g.fecha.toISOString().slice(0, 10) });

function filaDePago(p: PagoLeido, nombre: string, estado: EnRevision, comentario: string | null): FilaDeRevision {
  const registradoEn = diaCR(p.confirmadoEn!);
  const fechaCobro = p.fechaCobro ? p.fechaCobro.toISOString().slice(0, 10) : null;
  return {
    tipo: "PAGO",
    id: p.id,
    titulo: p.cuenta.client.name,
    detalle: `Cuota de ${etiquetaMes(p.periodo, true)}`,
    monto: Number(p.monto),
    moneda: p.moneda,
    fecha: fechaCobro,
    registradoPor: nombre,
    registradoPorEmail: p.confirmadoPor!.toLowerCase(),
    registradoEn,
    avisos: avisosDePago({ fechaCobro, fechaEmision: p.fechaEmision ? p.fechaEmision.toISOString().slice(0, 10) : null, registradoEn }),
    estado,
    comentario,
    href: `/cobranza?cuenta=${p.cuentaId}`,
  };
}

function filaDeGasto(g: GastoLeido, nombre: string, estado: EnRevision, comentario: string | null): FilaDeRevision {
  const registradoEn = diaCR(g.createdAt);
  const fecha = g.fecha.toISOString().slice(0, 10);
  return {
    tipo: "GASTO",
    id: g.id,
    titulo: g.nombre,
    detalle: g.tags.length ? g.tags.join(" · ") : `Gasto del ${diaCorto(fecha)}`,
    monto: Number(g.monto),
    moneda: g.moneda,
    fecha,
    registradoPor: nombre,
    registradoPorEmail: g.registradoPor!.toLowerCase(),
    registradoEn,
    avisos: avisosDeGasto({ fecha, registradoEn }),
    estado,
    comentario,
    href: `/finanzas/gastos?mes=${fecha.slice(0, 7)}`,
  };
}

/** Todo lo que está en la revisión: por revisar (pagos y gastos) y lo devuelto que espera corrección. */
export async function cargarRevision(): Promise<DatosDeRevision> {
  const [nombres, pagos, gastos] = await Promise.all([quienesRegistran(), leerPagos(), leerGastos()]);
  const delEquipo = <T>(xs: T[], por: (x: T) => string | null) => xs.filter((x) => nombres.has((por(x) ?? "").toLowerCase()));
  const pagosDelEquipo = delEquipo(pagos, (p) => p.confirmadoPor);
  const gastosDelEquipo = delEquipo(gastos, (g) => g.registradoPor);

  const guardadas = await prisma.revisionRegistro.findMany({
    where: {
      OR: [
        { tipo: "PAGO", registroId: { in: pagosDelEquipo.map((p) => p.id) } },
        { tipo: "GASTO", registroId: { in: gastosDelEquipo.map((g) => g.id) } },
      ],
    },
    select: { tipo: true, registroId: true, estado: true, huella: true, comentario: true },
  });
  const guardada = new Map(guardadas.map((r) => [`${r.tipo}:${r.registroId}`, r]));

  const filas: FilaDeRevision[] = [];
  for (const p of pagosDelEquipo) {
    const g = guardada.get(`PAGO:${p.id}`) ?? null;
    const estado = enRevision(huellaPago(p), g);
    if (estado) filas.push(filaDePago(p, nombres.get(p.confirmadoPor!.toLowerCase())!, estado, g?.comentario ?? null));
  }
  for (const x of gastosDelEquipo) {
    const g = guardada.get(`GASTO:${x.id}`) ?? null;
    const estado = enRevision(huellaGasto(x), g);
    if (estado) filas.push(filaDeGasto(x, nombres.get(x.registradoPor!.toLowerCase())!, estado, g?.comentario ?? null));
  }
  const ordenadas = ordenDeRevision(filas);
  return {
    pagos: ordenadas.filter((f) => f.tipo === "PAGO" && f.estado !== "DEVUELTO"),
    gastos: ordenadas.filter((f) => f.tipo === "GASTO" && f.estado !== "DEVUELTO"),
    devueltos: ordenadas.filter((f) => f.estado === "DEVUELTO"),
  };
}

/** La huella de hoy de cada registro pedido. ⛔ Un registro que no está en la revisión (de un Super Admin, viejo, ya no
 *  cobrado) no se puede marcar: 404, igual que uno que no existe. */
async function huellasDeHoy(items: ReadonlyArray<{ tipo: TipoRevisado; id: string }>): Promise<Map<string, string>> {
  const ids = (t: TipoRevisado) => items.filter((i) => i.tipo === t).map((i) => i.id);
  const [nombres, pagos, gastos] = await Promise.all([
    quienesRegistran(),
    ids("PAGO").length ? leerPagos({ id: { in: ids("PAGO") } }) : Promise.resolve([] as PagoLeido[]),
    ids("GASTO").length ? leerGastos({ id: { in: ids("GASTO") } }) : Promise.resolve([] as GastoLeido[]),
  ]);
  const out = new Map<string, string>();
  for (const p of pagos) if (nombres.has(p.confirmadoPor!.toLowerCase())) out.set(`PAGO:${p.id}`, huellaPago(p));
  for (const g of gastos) if (nombres.has(g.registradoPor!.toLowerCase())) out.set(`GASTO:${g.id}`, huellaGasto(g));
  for (const i of items) {
    if (!out.has(`${i.tipo}:${i.id}`)) throw new CobranzaError("Ese registro ya no está en la revisión. Vuelve a cargar la página.", 404);
  }
  return out;
}

/** «Está bien» (uno o varios) o «Devolver» (uno, con comentario). Quien revisa sale del guard. */
export async function revisar(
  input: { accion: "BIEN" | "DEVOLVER"; items: Array<{ tipo: TipoRevisado; id: string }>; comentario?: string | null },
  actor: string,
): Promise<{ n: number }> {
  if (input.accion === "DEVOLVER" && (input.items.length !== 1 || !input.comentario?.trim())) {
    throw new CobranzaError("Para devolver, uno a la vez y con un comentario que diga qué corregir.", 400);
  }
  const huellas = await huellasDeHoy(input.items);
  const ahora = new Date();
  const estado = input.accion === "BIEN" ? "BIEN" : "DEVUELTO";
  const comentario = input.accion === "DEVOLVER" ? input.comentario!.trim() : null;
  await prisma.$transaction(
    input.items.map((i) => {
      const datos = {
        estado,
        huella: huellas.get(`${i.tipo}:${i.id}`)!,
        comentario,
        revisadoPor: actor,
        revisadoEn: ahora,
        corregidoPor: null,
        corregidoEn: null,
      };
      return prisma.revisionRegistro.upsert({
        where: { tipo_registroId: { tipo: i.tipo, registroId: i.id } },
        create: { tipo: i.tipo, registroId: i.id, ...datos },
        update: datos,
      });
    }),
  );
  return { n: input.items.length };
}

/** Deshacer una revisión (un «Está bien» o una devolución apretados de más): el registro vuelve a «por revisar». */
export async function deshacerRevision(item: { tipo: TipoRevisado; id: string }): Promise<void> {
  await prisma.revisionRegistro.deleteMany({ where: { tipo: item.tipo, registroId: item.id } });
}

/**
 * «Ya lo corregí», de quien lo registró: lo devuelto vuelve a la revisión marcado como corregido. Solo sobre algo
 * devuelto (409 si no). Quién lo corrigió sale del guard.
 */
export async function marcarCorregido(item: { tipo: TipoRevisado; id: string }, actor: string): Promise<void> {
  const r = await prisma.revisionRegistro.findUnique({
    where: { tipo_registroId: { tipo: item.tipo, registroId: item.id } },
    select: { estado: true },
  });
  if (!r) throw new CobranzaError("Eso no está devuelto.", 404);
  if (r.estado !== "DEVUELTO") throw new CobranzaError("Eso ya no está devuelto: alguien lo marcó antes.", 409);
  await prisma.revisionRegistro.update({
    where: { tipo_registroId: { tipo: item.tipo, registroId: item.id } },
    data: { estado: "CORREGIDO", corregidoPor: actor, corregidoEn: new Date() },
  });
}

/**
 * Lo devuelto que le toca a una persona, para su Pendientes: lo que ella registró. Con `email` null (un Super Admin
 * mirando Pendientes), todo lo devuelto.
 */
export async function devueltosPara(email: string | null): Promise<Devuelto[]> {
  const devueltos = await prisma.revisionRegistro.findMany({
    where: { estado: "DEVUELTO" },
    select: { tipo: true, registroId: true, comentario: true, revisadoPor: true },
    orderBy: { revisadoEn: "desc" },
  });
  if (devueltos.length === 0) return [];
  const ids = (t: TipoRevisado) => devueltos.filter((d) => d.tipo === t).map((d) => d.registroId);
  const [pagos, gastos, revisores] = await Promise.all([
    prisma.cobro.findMany({ where: { id: { in: ids("PAGO") } }, select: SELECT_PAGO }),
    prisma.gastoPuntual.findMany({ where: { id: { in: ids("GASTO") } }, select: SELECT_GASTO }),
    prisma.teamMember.findMany({
      where: { email: { in: [...new Set(devueltos.map((d) => d.revisadoPor))], mode: "insensitive" } },
      select: { email: true, name: true },
    }),
  ]);
  const nombreDe = new Map(revisores.map((m) => [m.email.toLowerCase(), m.name.split(" ")[0] || m.email]));
  const pago = new Map(pagos.map((p) => [p.id, p]));
  const gasto = new Map(gastos.map((g) => [g.id, g]));
  const out: Devuelto[] = [];
  for (const d of devueltos) {
    const por = nombreDe.get(d.revisadoPor.toLowerCase()) ?? d.revisadoPor;
    if (d.tipo === "PAGO") {
      const p = pago.get(d.registroId);
      if (!p || (email && (p.confirmadoPor ?? "").toLowerCase() !== email.toLowerCase())) continue;
      out.push({
        tipo: "PAGO",
        registroId: p.id,
        texto: `Pago de ${p.cuenta.client.name} · ${fmtMontoLibro(Number(p.monto), p.moneda)} · cuota de ${etiquetaMes(p.periodo, true)}`,
        comentario: d.comentario ?? "",
        por,
        href: `/cobranza?cuenta=${p.cuentaId}`,
      });
    } else {
      const g = gasto.get(d.registroId);
      if (!g || (email && (g.registradoPor ?? "").toLowerCase() !== email.toLowerCase())) continue;
      const fecha = g.fecha.toISOString().slice(0, 10);
      out.push({
        tipo: "GASTO",
        registroId: g.id,
        texto: `Gasto «${g.nombre}» · ${fmtMontoLibro(Number(g.monto), g.moneda)} · ${diaCorto(fecha)}`,
        comentario: d.comentario ?? "",
        por,
        href: `/finanzas/gastos?mes=${fecha.slice(0, 7)}`,
      });
    }
  }
  return out;
}
