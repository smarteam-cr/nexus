/**
 * lib/cobranza/libro-alex-aplicar-server.ts
 *
 * Aplicar el libro de Alex (etapa 13), lo que toca la base: armar el plan con lo que Nexus tiene HOY y cargar
 * lo que Alex tildó. Qué entra, por cuánto y qué se rechaza lo decide libro-alex-aplicar.ts, que es puro.
 *
 * ── CÓMO ENTRA CADA FACTURA ─────────────────────────────────────────────────────
 * Una transacción por factura, así una que falla no se lleva a las demás:
 *   1. si el número ya está en algún cobro, no se carga (aplicar dos veces, u otra pestaña);
 *   2. la sociedad del documento: la ficha de Odoo si está emparejada con la cuenta; en Mercury, la sociedad
 *      con ese nombre en factura, que se anota si no estaba (`agregarSociedadTx`, la misma regla del alta);
 *   3. el servicio «Facturación importada del libro de Alex» de la cuenta en esa moneda, sin plan: sus cobros
 *      no tienen número de cuota y el motor no los reescribe al regenerar;
 *   4. el cobro, PROGRAMADO, y enseguida la factura por el chokepoint `cambiarEstadoCobroTx`: POR COBRAR, con
 *      la fecha de emisión, el número y la sociedad. Firma quien aplica (INV5, INV34), frena un número de
 *      otra cuenta (INV33) y valida la sociedad (INV36);
 *   5. la línea de la carga y la de la anotación, en la bitácora del cobro.
 *
 * ⛔ Nunca escribe COBRADO ni fecha de cobro, ni pasa un estado que no sea POR_COBRAR: lo vigila
 * libro-alex-aplicar.test.ts sobre este archivo. Tampoco empareja clientes de Odoo ni crea empresas: la
 * cuenta nueva la da de alta Alex con «Nueva empresa».
 */
import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { esquemaDesactualizado } from "@/lib/db/esquema";
import { crDateParts } from "@/lib/jobs/time";
import { cambiarEstadoCobroTx, CobranzaError } from "./mutations";
import { agregarSociedadTx, SociedadError } from "./sociedades-servicio";
import { cargarContextoLibro, leerLoteDelLibro, LibroError, type LoteDelLibroResumen } from "./libro-alex-server";
import {
  anotacionesNuevas,
  decidirCarga,
  descripcionDelServicioDelLibro,
  planDelLibro,
  type AnotacionDeCobro,
  type CobroACargar,
  type NoSeCarga,
  type PedidoDeAplicacion,
  type PlanDelLibro,
} from "./libro-alex-aplicar";

/** Los SQL sin los cuales no se puede cargar: el número de factura (etapa 7) y la sociedad (etapa 12). */
export const SQL_NUMEROS = "scripts/sql/2026-09-12-7-numero-de-factura.sql";
export const SQL_SOCIEDADES = "scripts/sql/2026-09-12-12-sociedades-facturadoras.sql";

const dia = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

/** El código de error de Prisma, sin depender de la clase (mismo patrón que sociedades-servicio.ts). */
const codigoDe = (e: unknown): string | undefined =>
  e && typeof e === "object" && "code" in e && typeof e.code === "string" ? e.code : undefined;

/**
 * Qué SQL falta correr para poder cargar. El plan se arma igual sin ellos: se ve qué entraría y nada se escribe.
 * ⚠ Cualquier otro error sube: un fallo de conexión no es «falta el SQL».
 */
async function sqlQueFalta(): Promise<string[]> {
  const pruebas: Array<[string, () => Promise<unknown>]> = [
    [SQL_NUMEROS, () => prisma.cobro.findFirst({ select: { numeroFactura: true, numeroFacturaPor: true, sinNumeroFacturaMotivo: true } })],
    [
      SQL_SOCIEDADES,
      () =>
        Promise.all([
          prisma.cobro.findFirst({ select: { plataformaFactura: true, sociedadFacturadaId: true } }),
          prisma.odooPartnerVinculo.findFirst({ select: { plataforma: true, claveFactura: true } }),
        ]),
    ],
  ];
  const falta: string[] = [];
  for (const [archivo, probar] of pruebas) {
    try {
      await probar();
    } catch (e) {
      if (!esquemaDesactualizado(e)) throw e;
      falta.push(archivo);
    }
  }
  return falta;
}

/** «Este mes» de una anotación es el mes en que se subió el libro, en Costa Rica. */
const referenciaDelLote = (createdAtISO: string) => crDateParts(new Date(createdAtISO)).dateKey;

/** Lo que ya está en la bitácora y puede ser una de estas anotaciones: la de sus cobros, y la de la cuenta con ese texto. */
async function bitacoraDeLasAnotaciones(anotaciones: readonly AnotacionDeCobro[]) {
  const cobroIds = [...new Set(anotaciones.flatMap((a) => (a.cobroId ? [a.cobroId] : [])))];
  const deCuenta = anotaciones.filter((a) => a.cobroId === null);
  const donde: Prisma.BitacoraCobroWhereInput[] = [];
  if (cobroIds.length) donde.push({ cobroId: { in: cobroIds } });
  if (deCuenta.length) {
    donde.push({
      cobroId: null,
      cuentaId: { in: [...new Set(deCuenta.map((a) => a.cuentaId))] },
      contenido: { in: [...new Set(deCuenta.map((a) => a.texto))] },
    });
  }
  if (!donde.length) return [];
  return prisma.bitacoraCobro.findMany({ where: { OR: donde }, select: { cuentaId: true, cobroId: true, contenido: true } });
}

/* ── El plan ────────────────────────────────────────────────────────────────────── */

export type CuentaParaElegir = { id: string; nombre: string; viaCobro: string; tipo: string };

export type RespuestaDeAplicar = {
  lote: LoteDelLibroResumen & { filasIlegibles: number };
  plan: PlanDelLibro;
  cuentas: CuentaParaElegir[];
  /** Los SQL que faltan: sin ellos se ve el plan y no se carga nada. */
  faltaSql: string[];
  /** Las anotaciones (`documento|cobro`) que ya están en la bitácora de su cobro. */
  yaAnotadas: string[];
};

/** null = el lote no existe. */
export async function planDelLote(importId: string): Promise<RespuestaDeAplicar | null> {
  const lote = await leerLoteDelLibro(importId);
  if (!lote) return null;
  const [{ ctx }, faltaSql] = await Promise.all([cargarContextoLibro(), sqlQueFalta()]);
  const { filas, ...resumen } = lote;
  const plan = planDelLibro(filas, ctx, referenciaDelLote(lote.createdAt));

  const existentes = await bitacoraDeLasAnotaciones(plan.anotaciones);
  const nuevas = new Set(anotacionesNuevas(plan.anotaciones, existentes).map((a) => a.clave));

  return {
    lote: resumen,
    plan,
    cuentas: ctx.cuentas
      .map((c) => ({ id: c.cuentaId, nombre: c.nombre, viaCobro: c.viaCobro, tipo: c.tipo }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre, "es")),
    faltaSql,
    yaAnotadas: plan.anotaciones.filter((a) => !nuevas.has(a.clave)).map((a) => a.clave),
  };
}

/* ── La carga ───────────────────────────────────────────────────────────────────── */

export type FacturaCargada = {
  numero: string;
  cuentaId: string;
  cuentaNombre: string;
  cobroId: string;
  monto: number;
  moneda: string;
  pagadaSegunLibro: boolean;
  avisos: string[];
};

export type ResultadoDeAplicar = {
  cargadas: FacturaCargada[];
  yaEstaban: Array<{ numero: string; cuentaNombre: string }>;
  rechazos: NoSeCarga[];
  sociedadesNuevas: number;
  serviciosNuevos: number;
  anotacionesEscritas: number;
};

type PatchDeSociedad = { plataformaFactura?: "ODOO" | "MERCURY" | "OTRA"; sociedadFacturadaId?: string };

/**
 * A quién se le facturó, del documento. Odoo: la ficha si está emparejada con la cuenta; si no, solo la
 * plataforma (y el aviso de emparejar), salvo que la cuenta facture por Odoo con varias sociedades, donde
 * decir la plataforma sin la sociedad es un 400 del chokepoint. Mercury: la sociedad con ese nombre en factura.
 */
async function sociedadDelCobroTx(
  tx: Prisma.TransactionClient,
  c: CobroACargar,
  byEmail: string,
  avisos: string[],
): Promise<{ patch: PatchDeSociedad; nueva: boolean }> {
  const { plataforma, odooPartnerId, nombre, cedula } = c.sociedad;
  if (plataforma === "ODOO") {
    const ficha =
      odooPartnerId !== null
        ? await tx.odooPartnerVinculo.findUnique({ where: { odooPartnerId }, select: { id: true, cuentaId: true } })
        : null;
    if (ficha && ficha.cuentaId === c.cuentaId) {
      return { patch: { plataformaFactura: "ODOO", sociedadFacturadaId: ficha.id }, nueva: false };
    }
    avisos.push(`El cliente de Odoo «${nombre}» no está emparejado con ${c.cuentaNombre}: emparejalo en Cobranza › Odoo, así el cruce encuentra sus facturas.`);
    const fichas = await tx.odooPartnerVinculo.count({ where: { cuentaId: c.cuentaId, plataforma: "ODOO" } });
    if (fichas >= 2) {
      avisos.push(`${c.cuentaNombre} factura por Odoo con ${fichas} sociedades: elegí a cuál se le facturó desde el cronograma.`);
      return { patch: {}, nueva: false };
    }
    return { patch: { plataformaFactura: "ODOO" }, nueva: false };
  }
  const r = await agregarSociedadTx(tx, c.cuentaId, { plataforma, nombre, cedula }, byEmail, { siYaLeFactura: "usar" });
  return { patch: { plataformaFactura: plataforma, sociedadFacturadaId: r.id }, nueva: !r.yaLeFacturaba };
}

async function servicioDelLibroTx(tx: Prisma.TransactionClient, c: CobroACargar): Promise<{ id: string; nuevo: boolean }> {
  const descripcion = descripcionDelServicioDelLibro(c.moneda);
  const existente = await tx.servicioContratado.findFirst({
    where: { cuentaId: c.cuentaId, moneda: c.moneda, tipoServicio: "OTRO", descripcion },
    select: { id: true },
  });
  if (existente) return { id: existente.id, nuevo: false };
  const creado = await tx.servicioContratado.create({
    data: {
      cuentaId: c.cuentaId,
      tipoServicio: "OTRO",
      modalidad: "PROYECTO",
      montoTotal: c.monto,
      moneda: c.moneda,
      /* Con fecha de arranque: sin ella el motor la da por «pendiente de datos» y abre CUENTA_SIN_DATOS. */
      fechaInicioFacturacion: dia(c.fechaFactura),
      estado: "ACTIVO",
      descripcion,
    },
    select: { id: true },
  });
  return { id: creado.id, nuevo: true };
}

type CargaHecha =
  | { tipo: "ya-estaba"; cuentaNombre: string }
  | { tipo: "cargada"; cobroId: string; sociedadNueva: boolean; servicioNuevo: boolean; avisos: string[] };

async function cargarFactura(c: CobroACargar, byEmail: string): Promise<CargaHecha> {
  return prisma.$transaction(
    async (tx): Promise<CargaHecha> => {
      /* Idempotencia: el número ya está en un cobro. Adentro de la transacción, así dos pestañas no la cargan dos veces. */
      const ya = await tx.cobro.findFirst({
        where: { numeroFactura: c.numero },
        select: { cuenta: { select: { client: { select: { name: true } } } } },
      });
      if (ya) return { tipo: "ya-estaba", cuentaNombre: ya.cuenta.client.name };

      const avisos = [...c.avisos];
      const sociedad = await sociedadDelCobroTx(tx, c, byEmail, avisos);
      const servicio = await servicioDelLibroTx(tx, c);
      const cobro = await tx.cobro.create({
        data: {
          servicioId: servicio.id,
          cuentaId: c.cuentaId,
          planId: null,
          numCuota: null,
          periodo: c.periodo,
          fechaProgramada: dia(c.fechaFactura),
          monto: c.monto,
          moneda: c.moneda,
          origen: "IMPORTACION",
        },
        select: { id: true },
      });
      await cambiarEstadoCobroTx(
        tx,
        cobro.id,
        { estado: c.estado, fechaEmision: c.fechaFactura, numeroFactura: c.numero, ...sociedad.patch },
        byEmail,
      );

      /* El servicio vale lo que suman sus facturas y arranca con la primera. */
      const suma = await tx.cobro.aggregate({
        where: { servicioId: servicio.id },
        _sum: { monto: true },
        _min: { fechaEmision: true },
      });
      await tx.servicioContratado.update({
        where: { id: servicio.id },
        data: {
          montoTotal: suma._sum.monto ?? c.monto,
          fechaInicioFacturacion: suma._min.fechaEmision ?? dia(c.fechaFactura),
        },
      });

      await tx.bitacoraCobro.create({
        data: { cuentaId: c.cuentaId, cobroId: cobro.id, tipo: "NOTA", contenido: c.bitacora, usuarioEmail: byEmail },
      });
      if (c.anotacion) {
        await tx.bitacoraCobro.create({
          data: { cuentaId: c.cuentaId, cobroId: cobro.id, tipo: "NOTA", contenido: c.anotacion, usuarioEmail: byEmail },
        });
      }
      return { tipo: "cargada", cobroId: cobro.id, sociedadNueva: sociedad.nueva, servicioNuevo: servicio.nuevo, avisos };
    },
    { timeout: 30_000, maxWait: 10_000 },
  );
}

/**
 * Carga lo que pidió Alex. null = el lote no existe.
 *
 * El plan se vuelve a armar acá, con lo que Nexus tiene en este momento: la pantalla pudo quedar abierta
 * mientras alguien anotaba un número o cargaba una factura en otra pestaña.
 */
export async function aplicarLote(importId: string, pedido: PedidoDeAplicacion, byEmail: string): Promise<ResultadoDeAplicar | null> {
  if (!byEmail) throw new LibroError("Aplicar el libro exige un usuario con nombre.");
  const lote = await leerLoteDelLibro(importId);
  if (!lote) return null;
  if (lote.estado === "DESCARTADO") throw new LibroError("Ese lote está descartado: subí el libro de nuevo.", 409);
  const faltaSql = await sqlQueFalta();
  if (faltaSql.length) {
    throw new LibroError(`Todavía no se puede cargar nada: falta correr ${faltaSql.join(" y ")}. El plan se ve igual.`, 409);
  }

  const { ctx } = await cargarContextoLibro();
  const plan = planDelLibro(lote.filas, ctx, referenciaDelLote(lote.createdAt));
  const decision = decidirCarga(plan, pedido, ctx, byEmail);

  const r: ResultadoDeAplicar = {
    cargadas: [],
    yaEstaban: [],
    rechazos: [...decision.rechazos],
    sociedadesNuevas: 0,
    serviciosNuevos: 0,
    anotacionesEscritas: 0,
  };

  for (const c of decision.cobros) {
    try {
      const hecho = await cargarFactura(c, byEmail);
      if (hecho.tipo === "ya-estaba") {
        r.yaEstaban.push({ numero: c.numero, cuentaNombre: hecho.cuentaNombre });
        continue;
      }
      r.cargadas.push({
        numero: c.numero,
        cuentaId: c.cuentaId,
        cuentaNombre: c.cuentaNombre,
        cobroId: hecho.cobroId,
        monto: c.monto,
        moneda: c.moneda,
        pagadaSegunLibro: c.pagadaSegunLibro,
        avisos: hecho.avisos,
      });
      if (hecho.sociedadNueva) r.sociedadesNuevas += 1;
      if (hecho.servicioNuevo) r.serviciosNuevos += 1;
    } catch (e) {
      /* Lo que dice una regla se muestra en su fila; un error que nadie previó sube entero. */
      const motivo =
        e instanceof CobranzaError || e instanceof SociedadError
          ? e.message
          : codigoDe(e) === "P2002"
            ? "Otra persona la estaba cargando a la vez: volvé a abrir «Aplicar»."
            : null;
      if (motivo === null) throw e;
      r.rechazos.push({ clave: c.clave, cliente: c.cuentaNombre, numero: c.numero, motivo });
    }
  }

  if (decision.anotaciones.length) {
    const existentes = await bitacoraDeLasAnotaciones(decision.anotaciones);
    const nuevas = anotacionesNuevas(decision.anotaciones, existentes);
    if (nuevas.length) {
      await prisma.bitacoraCobro.createMany({
        data: nuevas.map((a) => ({ cuentaId: a.cuentaId, cobroId: a.cobroId, tipo: "NOTA" as const, contenido: a.texto, usuarioEmail: byEmail })),
      });
    }
    r.anotacionesEscritas = nuevas.length;
  }

  /* El lote no se cierra: Alex aplica por partes, a medida que da de alta las cuentas. Queda la última pasada. */
  await prisma.importacionCobranza.update({
    where: { id: importId },
    data: {
      aplicadoEn: new Date(),
      aplicadoPor: byEmail,
      resumen: {
        facturasCargadas: r.cargadas.length,
        yaEstaban: r.yaEstaban.length,
        rechazadas: r.rechazos.length,
        sociedadesNuevas: r.sociedadesNuevas,
        serviciosNuevos: r.serviciosNuevos,
        anotacionesEscritas: r.anotacionesEscritas,
      },
    },
  });

  return r;
}
