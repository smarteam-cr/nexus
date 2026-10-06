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
 *
 * Los gastos revisados que alguien borró (2026-10-05) también entran: su revisión guarda la foto del gasto
 * (lib/finanzas/revision.ts, «Lo que cambia otro, y lo que se borra»). La escribe `deleteGasto`
 * (lib/cobranza/mutations.ts); acá se lee y se da por vista.
 */
import "server-only";
import { prisma } from "@/lib/db/prisma";
import { avisar } from "@/lib/para-ti/avisos-server";
import { CobranzaError } from "@/lib/cobranza/mutations";
import { crDateParts } from "@/lib/jobs/time";
import { fmtMontoLibro } from "@/lib/cobranza/montos";
import { etiquetaMes } from "./gastos";
import {
  PREFIJO_BORRADO,
  REVISION_DESDE,
  avisosDeGasto,
  avisosDePago,
  borradoSinVer,
  diaCorto,
  enRevision,
  huellaDeGasto,
  huellaDePago,
  leerBorrado,
  mismaPersona,
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
  /** El comentario de la devolución (DEVUELTO y CORREGIDO; en un BORRADO, el de antes de borrarlo). */
  comentario: string | null;
  /** Dónde se corrige. */
  href: string;
  /** Lo cambió alguien que no es quien lo registró (nombre de pila), después de tu revisión. */
  cambiadoPor?: string | null;
  /** Solo en un BORRADO: quién lo borró (nombre de pila) y el día de Costa Rica. */
  borrado?: { por: string; en: string } | null;
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

/** El nombre de pila de cualquiera del equipo (también un Super Admin), por email. Quien no está, queda con su email. */
async function nombresDe(emails: ReadonlyArray<string | null | undefined>): Promise<(e: string | null | undefined) => string> {
  const lista = [...new Set(emails.filter((e): e is string => !!e && e.includes("@")).map((e) => e.toLowerCase()))];
  const ms = lista.length
    ? await prisma.teamMember.findMany({ where: { email: { in: lista, mode: "insensitive" } }, select: { email: true, name: true } })
    : [];
  const mapa = new Map(ms.map((m) => [m.email.toLowerCase(), m.name.split(" ")[0] || m.email]));
  return (e) => (e ? (mapa.get(e.toLowerCase()) ?? e) : "alguien");
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
  const [nombres, pagos, gastos, borrados] = await Promise.all([
    quienesRegistran(),
    leerPagos(),
    leerGastos(),
    // Los gastos revisados que alguien borró (2026-10-05). Pocos: se filtra en memoria cuáles no se vieron.
    prisma.revisionRegistro.findMany({
      where: { tipo: "GASTO", huella: { startsWith: PREFIJO_BORRADO } },
      select: { registroId: true, huella: true, revisadoEn: true, corregidoPor: true, corregidoEn: true },
    }),
  ]);
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
    select: { tipo: true, registroId: true, estado: true, huella: true, comentario: true, corregidoPor: true },
  });
  const guardada = new Map(guardadas.map((r) => [`${r.tipo}:${r.registroId}`, r]));
  const sinVer = borrados.filter(borradoSinVer);
  // Quién cambió un gasto ajeno (en una revisión BIEN, `corregidoPor` lo escribe solo `updateGasto`) y quién borró.
  const nombre = await nombresDe([
    ...guardadas.filter((r) => r.estado === "BIEN").map((r) => r.corregidoPor),
    ...sinVer.flatMap((r) => [r.corregidoPor, leerBorrado(r.huella)?.registradoPor]),
  ]);

  const filas: FilaDeRevision[] = [];
  for (const p of pagosDelEquipo) {
    const g = guardada.get(`PAGO:${p.id}`) ?? null;
    const estado = enRevision(huellaPago(p), g);
    if (estado) filas.push(filaDePago(p, nombres.get(p.confirmadoPor!.toLowerCase())!, estado, g?.comentario ?? null));
  }
  for (const x of gastosDelEquipo) {
    const g = guardada.get(`GASTO:${x.id}`) ?? null;
    const estado = enRevision(huellaGasto(x), g);
    if (!estado) continue;
    const fila = filaDeGasto(x, nombres.get(x.registradoPor!.toLowerCase())!, estado, g?.comentario ?? null);
    if (estado === "CAMBIO" && g?.estado === "BIEN" && g.corregidoPor && !mismaPersona(g.corregidoPor, x.registradoPor)) {
      fila.cambiadoPor = nombre(g.corregidoPor);
    }
    filas.push(fila);
  }
  for (const r of sinVer) {
    const g = leerBorrado(r.huella);
    if (!g) continue;
    filas.push({
      tipo: "GASTO",
      id: r.registroId,
      titulo: g.nombre,
      // Quién lo borró y cuándo va en `borrado` (la pantalla lo pone en su chip); el detalle es el del gasto.
      detalle: `Gasto del ${diaCorto(g.fecha)}`,
      monto: g.monto,
      moneda: g.moneda,
      fecha: g.fecha,
      registradoPor: nombre(g.registradoPor),
      registradoPorEmail: (g.registradoPor ?? "").toLowerCase(),
      registradoEn: g.registradoEn,
      avisos: [],
      estado: "BORRADO",
      comentario: g.comentarioAntes,
      href: `/finanzas/gastos?mes=${g.fecha.slice(0, 7)}`,
      borrado: { por: nombre(r.corregidoPor), en: diaCR(r.corregidoEn!) },
    });
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

/** De los gastos pedidos, los que ya no existen y dejaron su foto de borrado en la revisión. */
async function gastosBorrados(items: ReadonlyArray<{ tipo: TipoRevisado; id: string }>): Promise<Set<string>> {
  const ids = items.filter((i) => i.tipo === "GASTO").map((i) => i.id);
  if (ids.length === 0) return new Set();
  const filas = await prisma.revisionRegistro.findMany({
    where: { tipo: "GASTO", registroId: { in: ids }, huella: { startsWith: PREFIJO_BORRADO } },
    select: { registroId: true },
  });
  return new Set(filas.map((f) => f.registroId));
}

/**
 * «Está bien» (uno o varios) o «Devolver» (uno, con comentario). Quien revisa sale del guard.
 * Sobre un gasto que borraron (2026-10-05), «Está bien» es «Visto»: firma la revisión con la fecha de hoy y deja la
 * foto del borrado como rastro. No se devuelve: ya no hay nada que corregir.
 */
export async function revisar(
  input: { accion: "BIEN" | "DEVOLVER"; items: Array<{ tipo: TipoRevisado; id: string }>; comentario?: string | null },
  actor: string,
): Promise<{ n: number }> {
  if (input.accion === "DEVOLVER" && (input.items.length !== 1 || !input.comentario?.trim())) {
    throw new CobranzaError("Para devolver, uno a la vez y con un comentario que diga qué corregir.", 400);
  }
  const borrados = await gastosBorrados(input.items);
  const esBorrado = (i: { tipo: TipoRevisado; id: string }) => i.tipo === "GASTO" && borrados.has(i.id);
  if (input.accion === "DEVOLVER" && esBorrado(input.items[0]!)) {
    throw new CobranzaError("Ese gasto ya lo borraron: no hay nada que devolver. Márcalo como visto.", 409);
  }
  const vivos = input.items.filter((i) => !esBorrado(i));
  const huellas = await huellasDeHoy(vivos);
  const ahora = new Date();
  const estado = input.accion === "BIEN" ? "BIEN" : "DEVUELTO";
  const comentario = input.accion === "DEVOLVER" ? input.comentario!.trim() : null;
  await prisma.$transaction([
    ...vivos.map((i) => {
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
    // Visto: quién borró y cuándo (`corregidoPor`/`corregidoEn`) y la foto quedan; solo se firma la revisión.
    ...input.items.filter(esBorrado).map((i) =>
      prisma.revisionRegistro.update({
        where: { tipo_registroId: { tipo: i.tipo, registroId: i.id } },
        data: { revisadoPor: actor, revisadoEn: ahora },
      }),
    ),
  ]);
  if (input.accion === "DEVOLVER") await avisarDevolucion(input.items[0], comentario!, actor, ahora);
  return { n: input.items.length };
}

/**
 * «Para ti» (2026-10-04): a quien registró lo devuelto le llega un aviso con el comentario. Va DESPUÉS de guardar y no
 * lanza: un aviso perdido no puede deshacer la devolución.
 */
async function avisarDevolucion(item: { tipo: TipoRevisado; id: string }, comentario: string, actor: string, cuando: Date) {
  let registro: string | null | undefined;
  try {
    registro =
      item.tipo === "PAGO"
        ? (await prisma.cobro.findUnique({ where: { id: item.id }, select: { confirmadoPor: true } }))?.confirmadoPor
        : (await prisma.gastoPuntual.findUnique({ where: { id: item.id }, select: { registradoPor: true } }))?.registradoPor;
  } catch (e) {
    console.error(`[para-ti] no se pudo saber quién registró ${item.tipo} ${item.id}: ${e instanceof Error ? e.message : String(e)}`);
    return;
  }
  await avisar({
    para: registro ?? null,
    tipo: "finanzas.devuelto",
    titulo: item.tipo === "PAGO" ? "Te devolvieron un pago para corregir" : "Te devolvieron un gasto para corregir",
    detalle: `«${comentario}»`,
    href: "/finanzas/pendientes",
    actorEmail: actor,
    // Cada devolución avisa: si se corrige y se vuelve a devolver, es otro aviso.
    dedupeKey: `finanzas.devuelto:${item.tipo}:${item.id}:${cuando.toISOString()}`,
  });
}

/**
 * Deshacer una revisión (un «Está bien» o una devolución apretados de más): el registro vuelve a «por revisar». Sobre
 * un gasto borrado, deshacer el «Visto» lo vuelve a «sin ver» sin perder el rastro (la fila es lo único que queda).
 */
export async function deshacerRevision(item: { tipo: TipoRevisado; id: string }): Promise<void> {
  const r = await prisma.revisionRegistro.findUnique({
    where: { tipo_registroId: { tipo: item.tipo, registroId: item.id } },
    select: { huella: true, corregidoEn: true },
  });
  if (r && r.huella.startsWith(PREFIJO_BORRADO) && r.corregidoEn) {
    await prisma.revisionRegistro.update({
      where: { tipo_registroId: { tipo: item.tipo, registroId: item.id } },
      data: { revisadoEn: new Date(r.corregidoEn.getTime() - 1) },
    });
    return;
  }
  await prisma.revisionRegistro.deleteMany({ where: { tipo: item.tipo, registroId: item.id } });
}

/**
 * «Ya lo corregí»: lo devuelto vuelve a la revisión marcado como corregido. Solo sobre algo devuelto (409 si no).
 *
 * ⛔ Lo marca quien registró ese pago (`confirmadoPor`) o ese gasto (`registradoPor`), o quien supervisa Finanzas
 * (`supervisa`: la condición de `guardSupervisionFinanzas`, la decide la ruta). Cualquier otro recibe 403 (decisión de
 * Elías, 2026-10-05): con solo el permiso de editar Cobranza o gastos, alguien podía dar por corregido lo de otra
 * persona. Quién lo corrigió sale del guard.
 */
export async function marcarCorregido(
  item: { tipo: TipoRevisado; id: string },
  quien: { email: string; supervisa: boolean },
): Promise<void> {
  const dueno =
    item.tipo === "PAGO"
      ? await prisma.cobro.findUnique({ where: { id: item.id }, select: { confirmadoPor: true } }).then((p) => (p ? p.confirmadoPor : undefined))
      : await prisma.gastoPuntual.findUnique({ where: { id: item.id }, select: { registradoPor: true } }).then((g) => (g ? g.registradoPor : undefined));
  if (dueno === undefined) throw new CobranzaError("Ese registro ya no existe.", 404);
  if (!quien.supervisa && !mismaPersona(dueno, quien.email)) {
    const nombre = await nombresDe([dueno]);
    throw new CobranzaError(
      `Esto lo registró ${nombre(dueno)}: solo quien lo registró o quien supervisa Finanzas puede marcarlo como corregido.`,
      403,
    );
  }
  const r = await prisma.revisionRegistro.findUnique({
    where: { tipo_registroId: { tipo: item.tipo, registroId: item.id } },
    select: { estado: true },
  });
  if (!r) throw new CobranzaError("Eso no está devuelto.", 404);
  if (r.estado !== "DEVUELTO") throw new CobranzaError("Eso ya no está devuelto: alguien lo marcó antes.", 409);
  await prisma.revisionRegistro.update({
    where: { tipo_registroId: { tipo: item.tipo, registroId: item.id } },
    data: { estado: "CORREGIDO", corregidoPor: quien.email, corregidoEn: new Date() },
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
