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
 * Sin `server-only`, como `odoo/sync.ts`: lo corre un script.
 */
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
  pegarMercury,
  pegarOdoo,
  type Accion,
  type CobroDelLibro,
  type EntradaDelLibro,
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
      select: { id: true, numero: true, invoiceDate: true, dueDate: true, monto: true, moneda: true, estado: true, mercuryCustomerId: true, clienteNombre: true, actualizadaEnMercury: true },
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
    })),
    cuentaDeClienteMercury: new Map(clientesDb.map((c) => [c.mercuryCustomerId, c.cuentaId!])),
    entradasMercury: movimientosDb
      .filter((m) => esEntradaDeCliente({ monto: Number(m.monto), estado: m.estado, tipo: m.tipo, contraparteNombre: m.contraparteNombre, conTarjeta: m.conTarjeta }))
      .map((m) => ({ id: m.id, monto: Number(m.monto), fecha: diaCR(m.posteadoEn ?? m.creadoEnMercury), quien: m.contraparteNombre ?? "" })),
    datos: new Map(cobros.map((c) => [c.id, { cuentaId: c.cuentaId, cuenta: c.cuentaNombre, periodo: c.periodo, monto: c.monto, moneda: c.moneda }])),
  };
}

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
  const entrada = await cargarEntradaDelLibro(opts.hoy);
  const pegados = [...pegarOdoo(entrada), ...pegarMercury(entrada)];
  const paraFechar = facturasOdooParaFechar(entrada, pegados);
  const moveDe = new Map(entrada.facturasOdoo.map((f) => [f.id, f.odooMoveId]));
  /* ⚠ Si Odoo falla, la lista igual se arma (lo de Mercury no depende de Odoo): las pagadas de Odoo quedan sin el día del
     pago y la pantalla lo avisa. Nunca se cobran con otra fecha. */
  let porMove = new Map<number, string>();
  let avisoOdoo: string | null = null;
  if (opts.odoo && paraFechar.length) {
    try {
      porMove = await fechasDePagoEnOdoo(opts.odoo, paraFechar.map((id) => moveDe.get(id)!));
    } catch (e) {
      avisoOdoo = `Odoo no contestó al pedirle el día de los pagos (${e instanceof Error ? e.message : String(e)}): sus facturas pagadas quedan sin el día del pago.`;
    }
  }
  const fechas = new Map<string, string>();
  for (const id of paraFechar) {
    const f = porMove.get(moveDe.get(id)!);
    if (f) fechas.set(id, f);
  }
  const d = decidir(entrada, pegados, fechas);
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
      const salto = await prisma.$transaction(async (tx) => {
        /* ⚠ La cuota se bloquea ANTES de releerla: sin el candado, dos confirmaciones a la vez leían las dos «sin cobrar»
           y escribían las dos (dos líneas de bitácora, dos firmas). La segunda espera acá y, al releer, ve lo que dejó la
           primera y se salta. */
        await tx.$queryRaw`SELECT id FROM "Cobro" WHERE id = ${a.cobroId} FOR UPDATE`;
        const c = await tx.cobro.findUnique({ where: { id: a.cobroId }, select: { estado: true, fechaEmision: true, numeroFactura: true, cuentaId: true } });
        if (!c || c.estado === "COBRADO") return "ya estaba cobrada";
        if (a.numeroFactura && c.numeroFactura) return "alguien le anotó un número entretanto";
        if (a.fechaEmision && c.fechaEmision) return "alguien la marcó facturada entretanto";
        await cambiarEstadoCobroTx(
          tx,
          a.cobroId,
          {
            ...(a.fechaEmision ? { fechaEmision: a.fechaEmision } : {}),
            ...(a.numeroFactura ? { numeroFactura: a.numeroFactura } : {}),
            ...(cobrar ? { estado: "COBRADO" as const, fechaCobro: cobrar.fechaCobro } : {}),
          },
          opts.firma,
        );
        const fuente = a.fuente === "ODOO" ? "Odoo" : "Mercury";
        const partes = [
          a.fechaEmision || a.numeroFactura ? `se pegó a la factura ${a.numero}` : null,
          cobrar ? `quedó cobrada el ${cobrar.fechaCobro} (${cobrar.deDonde})` : null,
        ].filter(Boolean);
        await tx.bitacoraCobro.create({
          data: {
            cuentaId: c.cuentaId,
            cobroId: a.cobroId,
            tipo: "NOTA",
            contenido: `Desde ${fuente}: la cuota ${partes.join(" y ")}. Lo aplicó ${opts.firma} con «Odoo y Mercury mandan».`,
            usuarioEmail: opts.firma,
          },
        });
        return null;
      });
      if (salto) r.saltadas.push({ cobroId: a.cobroId, cuenta: de(a.cobroId).cuenta, motivo: salto });
      else r.escritas++;
    } catch (e) {
      const motivo = e instanceof CobranzaError || e instanceof Error ? e.message : String(e);
      r.saltadas.push({ cobroId: a.cobroId, cuenta: de(a.cobroId).cuenta, motivo });
    }
  }
  return r;
}
