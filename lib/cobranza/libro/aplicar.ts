/**
 * lib/cobranza/libro/aplicar.ts — escribe en Nexus lo que dicen Odoo y Mercury (etapa «Odoo y Mercury mandan», 2026-10-16).
 *
 * Lee los cobros y las dos copias, decide con `hechos.ts` (puro) y escribe cada cuota por el chokepoint
 * `cambiarEstadoCobroTx`, con la firma de la PERSONA que lo corre (un miembro del equipo): la misma doctrina de
 * scripts/cargar-cuenta-desde-odoo.ts `--cobrar-con-firma`. Pegar la factura (facturado + número) va siempre; cobrar
 * las pagadas solo si quien firma lo pide (`cobrar`), después de ver la lista.
 *
 * Una transacción por cuota: una que falla (un número que ya está en otra cuenta, INV33) no frena a las demás y queda
 * en el resultado. ⚠ Antes de escribir bloquea la cuota (`FOR UPDATE`) y la vuelve a leer dentro de la transacción: si
 * alguien la tocó entre la lectura y la escritura, manda lo que hizo la persona y esta cuota se salta.
 *
 * Desde el 2026-10-18 también cobra SOLO (`cobrarLoPagadoSolo`): lo pagado y conciliado con el banco, firmado por el
 * sistema (`sistema:odoo`, `sistema:mercury`), cada día desde el job `lo-pagado-daily`. Lo que no es seguro sigue
 * esperando a una persona en «Lo pagado».
 *
 * Sin `server-only`, como `odoo/sync.ts`: lo corre un script.
 */
import { FIRMA_DEL_SISTEMA } from "@/lib/cobranza/firma-del-sistema";
import { TEXTO_DE_LA_REVERSION } from "@/lib/cobranza/reversion-cobro";
import { prisma } from "@/lib/db/prisma";
import { cambiarEstadoCobroTx, CobranzaError } from "@/lib/cobranza/mutations";
import { esEntradaDeCliente } from "@/lib/cobranza/mercury/espejo";
import type { OdooTransport } from "@/lib/cobranza/odoo/transporte";
import { fechasDePagoEnOdoo } from "@/lib/cobranza/odoo/fechas-de-pago";
import { crDateParts } from "@/lib/jobs/time";
import {
  accionesElegidas,
  decidir,
  facturasOdooParaFechar,
  paraCobrarSolo,
  pegarMercury,
  pegarOdoo,
  type Accion,
  type CobroDelLibro,
  type Decision,
  type EntradaDelLibro,
  type Fuente,
  type Pegado,
  type SeleccionDelLibro,
} from "./hechos";

/** Una columna `@db.Date` (fecha sin hora): su día es el de UTC. */
const iso = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null);
/** Un INSTANTE (cuándo se posteó un movimiento): su día es el de Costa Rica, no el de UTC (de 18:00 a 24:00 serían otro día). */
const diaCR = (d: Date) => crDateParts(d).dateKey;

interface DeLaCuota {
  cuentaId: string;
  cuenta: string;
  periodo: string;
  monto: number;
  moneda: string;
}

export interface ResultadoDelLibro {
  aplicado: boolean;
  cobro: boolean;
  acciones: Array<Accion & DeLaCuota>;
  pagadasSinFecha: Array<Pegado & DeLaCuota>;
  choques: Array<Pegado & DeLaCuota>;
  escritas: number;
  saltadas: Array<{ cobroId: string; cuenta: string; motivo: string }>;
  /** Odoo no contestó al pedirle el día de los pagos: sus pagadas quedaron en `pagadasSinFecha`. null = contestó (o no se le pidió). */
  avisoOdoo: string | null;
}

/** Todo lo que hace falta para decidir, leído de la base. */
export async function cargarEntradaDelLibro(hoy: string): Promise<EntradaDelLibro & { datos: Map<string, DeLaCuota> }> {
  const [cobrosDb, facturasOdooDb, facturasMercuryDb, clientesDb, movimientosDb] = await Promise.all([
    prisma.cobro.findMany({
      select: {
        id: true, cuentaId: true, periodo: true, fechaProgramada: true, monto: true, moneda: true, estado: true, fechaEmision: true,
        numeroFactura: true, plataformaFactura: true, servicioId: true,
        servicio: { select: { descripcion: true, tipoServicio: true } },
        cuenta: { select: { viaCobro: true, client: { select: { name: true } } } },
      },
      orderBy: [{ fechaProgramada: "asc" }, { id: "asc" }],
    }),
    prisma.facturaOdoo.findMany({
      where: { estadoEspejo: "VIGENTE" },
      select: {
        id: true, odooMoveId: true, numero: true, cuentaId: true, odooPartnerId: true, odooPartnerNombre: true, invoiceDate: true,
        montoNeto: true, montoTotal: true, montoResidual: true, montoImpuesto: true, moneda: true, moveType: true, paymentState: true, state: true,
      },
      orderBy: { odooMoveId: "asc" },
    }),
    prisma.facturaMercury.findMany({
      where: { estadoEspejo: "VIGENTE" },
      select: {
        id: true, numero: true, invoiceDate: true, dueDate: true, monto: true, moneda: true, estado: true, mercuryCustomerId: true, clienteNombre: true,
        actualizadaEnMercury: true, pagadaVistaEn: true, pagadaNoVistaEn: true,
      },
      orderBy: { invoiceDate: "asc" },
    }),
    prisma.clienteMercury.findMany({ where: { cuentaId: { not: null }, ignorado: false }, select: { mercuryCustomerId: true, cuentaId: true } }),
    prisma.movimientoMercury.findMany({
      where: { estadoEspejo: "VIGENTE", monto: { gt: 0 } },
      select: { id: true, monto: true, estado: true, tipo: true, contraparteNombre: true, conTarjeta: true, posteadoEn: true, creadoEnMercury: true },
    }),
  ]);
  const cobros: CobroDelLibro[] = cobrosDb.map((c) => ({
    id: c.id,
    cuentaId: c.cuentaId,
    cuentaNombre: c.cuenta.client.name,
    periodo: c.periodo,
    fechaProgramada: iso(c.fechaProgramada)!,
    monto: Number(c.monto),
    moneda: c.moneda,
    estado: c.estado,
    fechaEmision: iso(c.fechaEmision),
    numeroFactura: c.numeroFactura,
    plataformaFactura: c.plataformaFactura,
    servicioId: c.servicioId,
    servicio: c.servicio.descripcion ?? c.servicio.tipoServicio,
    plataforma: c.plataformaFactura ?? c.cuenta.viaCobro,
  }));
  return {
    hoy,
    cobros,
    facturasOdoo: facturasOdooDb.map((f) => ({
      id: f.id, odooMoveId: f.odooMoveId, numero: f.numero, cuentaId: f.cuentaId, odooPartnerId: f.odooPartnerId, odooPartnerNombre: f.odooPartnerNombre,
      invoiceDate: iso(f.invoiceDate)!, montoNeto: Number(f.montoNeto), montoTotal: Number(f.montoTotal), montoResidual: Number(f.montoResidual),
      montoImpuesto: Number(f.montoImpuesto), moneda: f.moneda, moveType: f.moveType, paymentState: f.paymentState, state: f.state,
    })),
    facturasMercury: facturasMercuryDb.map((f) => ({
      id: f.id, numero: f.numero, invoiceDate: iso(f.invoiceDate)!, dueDate: iso(f.dueDate), monto: Number(f.monto), moneda: f.moneda, estado: f.estado,
      mercuryCustomerId: f.mercuryCustomerId, clienteNombre: f.clienteNombre, actualizadaEn: diaCR(f.actualizadaEnMercury),
      pagadaVistaEn: f.pagadaVistaEn ? diaCR(f.pagadaVistaEn) : null, pagadaNoVistaEn: f.pagadaNoVistaEn ? diaCR(f.pagadaNoVistaEn) : null,
    })),
    cuentaDeClienteMercury: new Map(clientesDb.map((c) => [c.mercuryCustomerId, c.cuentaId!])),
    entradasMercury: movimientosDb
      .filter((m) => esEntradaDeCliente({ monto: Number(m.monto), estado: m.estado, tipo: m.tipo, contraparteNombre: m.contraparteNombre, conTarjeta: m.conTarjeta }))
      .map((m) => ({ id: m.id, monto: Number(m.monto), fecha: diaCR(m.posteadoEn ?? m.creadoEnMercury), quien: m.contraparteNombre ?? "" })),
    datos: new Map(cobros.map((c) => [c.id, { cuentaId: c.cuentaId, cuenta: c.cuentaNombre, periodo: c.periodo, monto: c.monto, moneda: c.moneda }])),
  };
}

/** Lo de hoy: la entrada, la decisión y si Odoo contestó al pedirle el día de los pagos. Sin escribir nada. */
async function decidirHoy(
  hoy: string,
  odoo: OdooTransport | null,
): Promise<{ entrada: EntradaDelLibro & { datos: Map<string, DeLaCuota> }; d: Decision; avisoOdoo: string | null }> {
  const entrada = await cargarEntradaDelLibro(hoy);
  const pegados = [...pegarOdoo(entrada), ...pegarMercury(entrada)];
  const paraFechar = facturasOdooParaFechar(entrada, pegados);
  const moveDe = new Map(entrada.facturasOdoo.map((f) => [f.id, f.odooMoveId]));
  /* ⚠ Si Odoo falla, la lista igual se arma (lo de Mercury no depende de Odoo): las pagadas de Odoo quedan sin el día del
     pago y la pantalla lo avisa. Nunca se cobran con otra fecha. */
  let porMove = new Map<number, string>();
  let avisoOdoo: string | null = null;
  if (odoo && paraFechar.length) {
    try {
      porMove = await fechasDePagoEnOdoo(odoo, paraFechar.map((id) => moveDe.get(id)!));
    } catch (e) {
      avisoOdoo = `Odoo no contestó al pedirle el día de los pagos (${e instanceof Error ? e.message : String(e)}): sus facturas pagadas quedan sin el día del pago.`;
    }
  }
  const fechas = new Map<string, string>();
  for (const id of paraFechar) {
    const f = porMove.get(moveDe.get(id)!);
    if (f) fechas.set(id, f);
  }
  return { entrada, d: decidir(entrada, pegados, fechas), avisoOdoo };
}

/**
 * Escribe UNA cuota en su propia transacción. Devuelve null si escribió, o el porqué si la saltó.
 * ⚠ La cuota se bloquea ANTES de releerla: sin el candado, dos confirmaciones a la vez leían las dos «sin cobrar» y
 * escribían las dos (dos líneas de bitácora, dos firmas). La segunda espera acá y, al releer, ve lo que dejó la primera.
 */
async function escribirUnaCuota(
  a: Accion,
  cobrar: Accion["cobrar"],
  firma: string,
  bitacora: (partes: string[]) => string,
  opciones: { saltarSiSeRevirtio: boolean },
): Promise<string | null> {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Cobro" WHERE id = ${a.cobroId} FOR UPDATE`;
    const c = await tx.cobro.findUnique({ where: { id: a.cobroId }, select: { estado: true, fechaEmision: true, numeroFactura: true, cuentaId: true } });
    if (!c) return "ya no existe";
    /* Una cuota ya cobrada solo recibe su número (`yaCobrada`): el resto de lo que escribe esto la quiere sin cobrar. */
    if (a.yaCobrada ? c.estado !== "COBRADO" : c.estado === "COBRADO") {
      return a.yaCobrada ? "alguien la sacó de Cobrado entretanto" : "ya estaba cobrada";
    }
    if (a.numeroFactura && c.numeroFactura) return "alguien le anotó un número entretanto";
    if (a.fechaEmision && c.fechaEmision) return "alguien la marcó facturada entretanto";
    /* El cobro solo vuelve a mirar, adentro del candado, si alguien la sacó de Cobrado: una reversión que llegó entre la
       lectura y la escritura manda sobre lo que dice Odoo. */
    if (opciones.saltarSiSeRevirtio) {
      const revertida = await tx.bitacoraCobro.findFirst({ where: { cobroId: a.cobroId, contenido: { contains: TEXTO_DE_LA_REVERSION } }, select: { id: true } });
      if (revertida) return "una persona la sacó de Cobrado";
    }
    await cambiarEstadoCobroTx(
      tx,
      a.cobroId,
      {
        ...(a.fechaEmision ? { fechaEmision: a.fechaEmision } : {}),
        ...(a.numeroFactura ? { numeroFactura: a.numeroFactura } : {}),
        ...(cobrar ? { estado: "COBRADO" as const, fechaCobro: cobrar.fechaCobro } : {}),
      },
      firma,
    );
    const partes = [
      a.fechaEmision || a.numeroFactura ? `se pegó a la factura ${a.numero}` : null,
      cobrar ? `quedó cobrada el ${cobrar.fechaCobro} (${cobrar.deDonde})` : null,
    ].filter((x): x is string => !!x);
    await tx.bitacoraCobro.create({
      data: { cuentaId: c.cuentaId, cobroId: a.cobroId, tipo: "NOTA", contenido: bitacora(partes), usuarioEmail: firma },
    });
    return null;
  });
}

const motivoDe = (e: unknown) => (e instanceof CobranzaError || e instanceof Error ? e.message : String(e));
const nombreDeFuente = (f: Fuente) => (f === "ODOO" ? "Odoo" : "Mercury");

/**
 * Decide y, con `aplicar`, escribe firmado por `firma`. Sin `cobrar`, a las pagadas solo se les pega la factura.
 * `odoo` = el puerto para pedirle a Odoo el día de cada pago; sin él, las de Odoo pagadas quedan en `pagadasSinFecha`.
 * `seleccion` = lo que la persona marcó en la pantalla (lib/cobranza/libro/servicio.ts): se escribe SOLO eso, con el día
 * del pago que vio (`accionesElegidas`). Sin `seleccion` (el script), todo lo decidido.
 */
export async function aplicarLoQueDicenOdooYMercury(opts: {
  aplicar: boolean;
  cobrar: boolean;
  firma: string;
  hoy: string;
  odoo: OdooTransport | null;
  seleccion?: SeleccionDelLibro;
}): Promise<ResultadoDelLibro> {
  if (opts.aplicar && !(await prisma.teamMember.findUnique({ where: { email: opts.firma }, select: { id: true } }))) {
    throw new Error(`«${opts.firma}» no es del equipo: lo que se escribe lleva la firma de una persona.`);
  }
  const { entrada, d, avisoOdoo } = await decidirHoy(opts.hoy, opts.odoo);
  const de = (id: string) => entrada.datos.get(id)!;
  const r: ResultadoDelLibro = {
    aplicado: opts.aplicar,
    cobro: opts.cobrar,
    acciones: d.acciones.map((a) => ({ ...a, ...de(a.cobroId) })),
    pagadasSinFecha: d.pagadasSinFecha.map((p) => ({ ...p, ...de(p.cobroId) })),
    choques: d.choques.map((p) => ({ ...p, ...de(p.cobroId) })),
    escritas: 0,
    saltadas: [],
    avisoOdoo,
  };
  if (!opts.aplicar) return r;

  let aEscribir: Accion[] = d.acciones;
  if (opts.seleccion) {
    const elegidas = accionesElegidas(d.acciones, opts.seleccion);
    aEscribir = elegidas.acciones;
    for (const c of elegidas.cambiaron) r.saltadas.push({ cobroId: c.cobroId, cuenta: entrada.datos.get(c.cobroId)?.cuenta ?? "—", motivo: c.motivo });
  }
  for (const a of aEscribir) {
    const cobrar = opts.cobrar ? a.cobrar : undefined;
    if (!a.fechaEmision && !a.numeroFactura && !cobrar) continue;
    try {
      const salto = await escribirUnaCuota(
        a,
        cobrar,
        opts.firma,
        (partes) => `Desde ${nombreDeFuente(a.fuente)}: la cuota ${partes.join(" y ")}. Lo aplicó ${opts.firma} con «Odoo y Mercury mandan».`,
        { saltarSiSeRevirtio: false },
      );
      if (salto) r.saltadas.push({ cobroId: a.cobroId, cuenta: de(a.cobroId).cuenta, motivo: salto });
      else r.escritas++;
    } catch (e) {
      r.saltadas.push({ cobroId: a.cobroId, cuenta: de(a.cobroId).cuenta, motivo: motivoDe(e) });
    }
  }
  return r;
}

/* ── El cobro solo, cada día (2026-10-18) ─────────────────────────────────────────────────────────────────────── */

export interface ResultadoDelCobroSolo {
  aplicado: boolean;
  /** Lo que se cobró (o, en simulacro, lo que se cobraría), con la firma del sistema. */
  cobradas: Array<Accion & DeLaCuota>;
  /** Lo pagado que NO se cobró solo, con el porqué: espera a una persona en «Lo pagado». */
  quedan: Array<Accion & DeLaCuota & { motivo: string }>;
  /** Pagadas allá sin el día del pago: nunca se cobran solas. */
  pagadasSinFecha: number;
  /** Lo que se intentó escribir y no se pudo, con el porqué. */
  saltadas: Array<{ cobroId: string; cuenta: string; motivo: string }>;
  avisoOdoo: string | null;
}

/**
 * Cobra lo que Odoo y Mercury dan por pagado y conciliado con el banco, sin una persona (decisión de Elías, 2026-10-18).
 * Cada cuota por `cambiarEstadoCobroTx`, firmada por `sistema:odoo` o `sistema:mercury`, con su bitácora.
 *
 * `fuentes`: las copias que corrieron bien hoy. Lo de una copia atrasada no se cobra (sus datos son de ayer): queda con
 * su porqué, y el job lo dice. Sin `aplicar`, el simulacro: dice qué cobraría y no escribe nada.
 * ⛔ Nunca cobra lo de «pagadas sin el día del pago», ni un choque, ni una cuota que una persona sacó de Cobrado.
 */
export async function cobrarLoPagadoSolo(opts: {
  aplicar: boolean;
  hoy: string;
  odoo: OdooTransport | null;
  fuentes: readonly Fuente[];
}): Promise<ResultadoDelCobroSolo> {
  const { entrada, d, avisoOdoo } = await decidirHoy(opts.hoy, opts.odoo);
  const de = (id: string) => entrada.datos.get(id)!;
  const conCobro = d.acciones.filter((a) => a.cobrar).map((a) => a.cobroId);
  const revertidas = conCobro.length
    ? await prisma.bitacoraCobro.findMany({
        where: { cobroId: { in: conCobro }, contenido: { contains: TEXTO_DE_LA_REVERSION } },
        select: { cobroId: true },
      })
    : [];
  const solo = paraCobrarSolo(d.acciones, new Set(revertidas.map((b) => b.cobroId).filter((x): x is string => !!x)));
  const r: ResultadoDelCobroSolo = {
    aplicado: opts.aplicar,
    cobradas: [],
    quedan: solo.quedan.map((q) => ({ ...q.accion, ...de(q.accion.cobroId), motivo: q.motivo })),
    pagadasSinFecha: d.pagadasSinFecha.length,
    saltadas: [],
    avisoOdoo,
  };
  for (const a of solo.acciones) {
    if (!opts.fuentes.includes(a.fuente)) {
      r.quedan.push({ ...a, ...de(a.cobroId), motivo: `La copia de ${nombreDeFuente(a.fuente)} no corrió bien hoy: se cobra cuando esté al día.` });
      continue;
    }
    if (!opts.aplicar) {
      r.cobradas.push({ ...a, ...de(a.cobroId) });
      continue;
    }
    try {
      const salto = await escribirUnaCuota(
        a,
        a.cobrar,
        FIRMA_DEL_SISTEMA[a.fuente],
        (partes) =>
          `Desde ${nombreDeFuente(a.fuente)}: la cuota ${partes.join(" y ")}. La cobró el sistema solo: ${nombreDeFuente(a.fuente)} la da pagada y conciliada con el banco. ` +
          `Si no entró, se deshace con «Sacar de Cobrado», y el sistema no la vuelve a cobrar sola.`,
        { saltarSiSeRevirtio: true },
      );
      if (salto) r.saltadas.push({ cobroId: a.cobroId, cuenta: de(a.cobroId).cuenta, motivo: salto });
      else r.cobradas.push({ ...a, ...de(a.cobroId) });
    } catch (e) {
      r.saltadas.push({ cobroId: a.cobroId, cuenta: de(a.cobroId).cuenta, motivo: motivoDe(e) });
    }
  }
  return r;
}
