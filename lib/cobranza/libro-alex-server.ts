/**
 * lib/cobranza/libro-alex-server.ts
 *
 * Lo que toca la base para el libro de Alex: guardar el lote que se subió, y leer lo que Nexus tiene
 * para compararlo. La decisión vive en libro-alex.ts (comparación) y odoo/numero-propuesta.ts (números),
 * que son puros.
 *
 * ⛔ La ÚNICA escritura es el lote: `ImportacionCobranza` con sus filas, igual que un CSV de cuentas en
 * staging. Ni cuentas, ni cobros, ni el espejo. Aplicar el libro vive aparte (libro-alex-aplicar-server.ts),
 * y ni ahí entra un cobro como COBRADO. Lo vigilan libro-alex.test.ts y libro-alex-aplicar.test.ts.
 *
 * ⚠ Sin `server-only`, igual que odoo/sync.ts: lo usan también los scripts de medición de solo lectura.
 */
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { esquemaDesactualizado } from "@/lib/db/esquema";
import { ultimaCorridaOk } from "./odoo/sync";
import { FUENTE_LIBRO_ALEX, leerLibro, type FilaLibro, type HojaLeida } from "./libro-alex-lectura";
import { hojasDelXlsx } from "./libro-alex-xlsx";
import { compararLibro, documentosDelLibroPorCobro, type CobroParaLibro, type ComparacionDelLibro, type ContextoLibro } from "./libro-alex";
import type { DocumentoDelLibro } from "./odoo/diferencias";
import { proponerNumeros, type NumerosDelLibro } from "./odoo/numero-propuesta";

export class LibroError extends Error {
  readonly status: number;
  constructor(mensaje: string, status = 400) {
    super(mensaje);
    this.name = "LibroError";
    this.status = status;
  }
}

/* ── Guardar el lote ────────────────────────────────────────────────────────────── */

export type LoteDelLibroResumen = {
  id: string;
  archivoNombre: string;
  estado: string;
  creadoPor: string;
  createdAt: string;
  totalFilas: number;
  hojas: HojaLeida[];
};

export async function crearLoteDelLibro(
  archivo: { nombre: string; datos: ArrayBuffer },
  creadoPor: string,
): Promise<LoteDelLibroResumen> {
  let libro;
  try {
    libro = leerLibro(await hojasDelXlsx(archivo.datos));
  } catch {
    throw new LibroError("No pude abrir el archivo como Excel. Subí el libro tal como sale de Excel o Google Sheets (.xlsx).");
  }
  if (!libro.filas.length) {
    throw new LibroError(
      "No encontré ninguna pestaña del libro de cobranza: faltan encabezados como «Número», «Nombre del cliente a mostrar en la factura» o «No Inscritos».",
    );
  }
  const lote = await prisma.importacionCobranza.create({
    data: {
      archivoNombre: archivo.nombre,
      fuente: FUENTE_LIBRO_ALEX,
      mapeo: {},
      columnas: libro.hojas,
      totalFilas: libro.filas.length,
      creadoPor,
      filas: {
        createMany: {
          data: libro.filas.map((f, i) => ({
            numFila: i + 1,
            raw: f,
            idExterno: f.numero ?? `${f.hoja}#${f.fila}`,
          })),
        },
      },
    },
    select: { id: true, archivoNombre: true, estado: true, creadoPor: true, createdAt: true, totalFilas: true },
  });
  return { ...lote, createdAt: lote.createdAt.toISOString(), hojas: libro.hojas };
}

/* ── Leer el lote ───────────────────────────────────────────────────────────────── */

const seccionSchema = z.enum(["ODOO", "MERCURY", "QUICKBOOKS", "NO_INSCRITOS", "PLAN_DE_PAGO", "COMPENDIO"]);

/** Lo que se guardó en `ImportacionFila.raw`. Se valida al leer: el JSON no trae su tipo consigo. */
const filaLibroSchema = z.object({
  hoja: z.string(),
  fila: z.number().int(),
  seccion: seccionSchema,
  numero: z.string().nullable(),
  cliente: z.string(),
  proyecto: z.string().nullable(),
  fechaFactura: z.string().nullable(),
  fechaVencimiento: z.string().nullable(),
  fechaPago: z.string().nullable(),
  total: z.number().nullable(),
  pendiente: z.number().nullable(),
  moneda: z.string().nullable(),
  estado: z.enum(["PAGADO", "SIN_PAGAR", "ACTIVA"]).nullable(),
  periodo: z.string().nullable(),
  color: z.enum(["VENCIDA", "EN_GRACIA", "SIN_COLOR", "OTRO"]),
  anotacion: z.string().nullable(),
  origen: z.string().nullable(),
}) satisfies z.ZodType<FilaLibro>;

const hojasSchema = z.array(z.object({ nombre: z.string(), filas: z.number(), secciones: z.array(seccionSchema) }));

export type LoteDelLibro = LoteDelLibroResumen & { filas: FilaLibro[]; filasIlegibles: number };

/** null = no existe. ⚠ Un lote de cuentas (CSV) no es un libro: 409. */
export async function leerLoteDelLibro(importId: string): Promise<LoteDelLibro | null> {
  const lote = await prisma.importacionCobranza.findUnique({
    where: { id: importId },
    select: {
      id: true,
      archivoNombre: true,
      estado: true,
      creadoPor: true,
      createdAt: true,
      totalFilas: true,
      fuente: true,
      columnas: true,
      filas: { orderBy: { numFila: "asc" }, select: { raw: true } },
    },
  });
  if (!lote) return null;
  if (lote.fuente !== FUENTE_LIBRO_ALEX) {
    throw new LibroError("Este lote es una importación de cuentas, no el libro de Alex.", 409);
  }
  const filas: FilaLibro[] = [];
  let filasIlegibles = 0;
  for (const f of lote.filas) {
    const p = filaLibroSchema.safeParse(f.raw);
    if (p.success) filas.push(p.data);
    else filasIlegibles += 1;
  }
  const hojas = hojasSchema.safeParse(lote.columnas);
  return {
    id: lote.id,
    archivoNombre: lote.archivoNombre,
    estado: lote.estado,
    creadoPor: lote.creadoPor,
    createdAt: lote.createdAt.toISOString(),
    totalFilas: lote.totalFilas,
    hojas: hojas.success ? hojas.data : [],
    filas,
    filasIlegibles,
  };
}

/* ── Lo que Nexus tiene ─────────────────────────────────────────────────────────── */

export type ContextoCargado = {
  ctx: ContextoLibro;
  /**
   * true = la base todavía no tiene las columnas del número de factura
   * (scripts/sql/2026-09-12-7-numero-de-factura.sql). La comparación anda igual, sin números anotados;
   * «Números» avisa que no se puede guardar.
   */
  faltaSqlNumeros: boolean;
  /** Día de la última lectura buena de Odoo (`YYYY-MM-DD`). */
  espejoAl: string | null;
};

const dia = (d: Date) => d.toISOString().slice(0, 10);

const SELECT_COBRO = {
  id: true,
  cuentaId: true,
  servicioId: true,
  periodo: true,
  fechaProgramada: true,
  fechaEmision: true,
  monto: true,
  moneda: true,
  estado: true,
  confirmadoPor: true,
  numCuota: true,
  promesaPago: true,
  servicio: { select: { descripcion: true, tipoServicio: true } },
} satisfies Prisma.CobroSelect;

type CobroLeido = Prisma.CobroGetPayload<{ select: typeof SELECT_COBRO }>;

const cobroParaLibro = (
  c: CobroLeido,
  numeroFactura: string | null,
  sinNumeroFacturaMotivo: string | null,
): CobroParaLibro => ({
  id: c.id,
  cuentaId: c.cuentaId,
  servicioId: c.servicioId,
  servicio: c.servicio.descripcion ?? c.servicio.tipoServicio,
  periodo: c.periodo,
  fechaProgramada: dia(c.fechaProgramada),
  fechaEmision: c.fechaEmision ? dia(c.fechaEmision) : null,
  monto: Number(c.monto),
  moneda: c.moneda,
  estado: c.estado,
  confirmadoPor: c.confirmadoPor,
  numeroFactura,
  sinNumeroFacturaMotivo,
  numCuota: c.numCuota,
  promesaPago: c.promesaPago ? dia(c.promesaPago) : null,
});

/** ⚠ Si el código llega antes que el SQL de la etapa 7, relee sin sus columnas y lo marca. Cualquier otro error sube. */
async function leerCobros(): Promise<{ cobros: CobroParaLibro[]; faltaSqlNumeros: boolean }> {
  try {
    const filas = await prisma.cobro.findMany({
      select: { ...SELECT_COBRO, numeroFactura: true, sinNumeroFacturaMotivo: true },
    });
    return {
      cobros: filas.map((c) => cobroParaLibro(c, c.numeroFactura, c.sinNumeroFacturaMotivo)),
      faltaSqlNumeros: false,
    };
  } catch (e) {
    if (!esquemaDesactualizado(e)) throw e;
    const filas = await prisma.cobro.findMany({ select: SELECT_COBRO });
    return { cobros: filas.map((c) => cobroParaLibro(c, null, null)), faltaSqlNumeros: true };
  }
}

export async function cargarContextoLibro(): Promise<ContextoCargado> {
  const [cuentas, vinculos, facturas, aliados, comisiones, corridaOk, { cobros, faltaSqlNumeros }] = await Promise.all([
    prisma.cuentaFinanciera.findMany({
      select: {
        id: true,
        tipo: true,
        viaCobro: true,
        razonSocial: true,
        cedulaJuridica: true,
        client: { select: { name: true } },
      },
    }),
    /* Solo las fichas de Odoo: desde la etapa 12 la tabla guarda también las sociedades de Mercury y
       QuickBooks, que no tienen cliente de Odoo con el que cruzar el libro. */
    prisma.odooPartnerVinculo
      .findMany({
        where: { odooPartnerId: { not: null } },
        select: { odooPartnerId: true, odooPartnerNombre: true, cuentaId: true, ignorado: true },
      })
      .then((vs) => vs.flatMap((v) => (v.odooPartnerId === null ? [] : [{ ...v, odooPartnerId: v.odooPartnerId }]))),
    /* `select` explícito: una columna nueva del espejo no tumba la comparación si el código llega antes que su SQL. */
    prisma.facturaOdoo.findMany({
      where: { estadoEspejo: "VIGENTE" },
      select: {
        odooMoveId: true,
        numero: true,
        odooPartnerId: true,
        odooPartnerNombre: true,
        moneda: true,
        montoNeto: true,
        montoImpuesto: true,
        moveType: true,
        state: true,
        paymentState: true,
        invoiceDate: true,
      },
    }),
    prisma.partnerComercial.findMany({ select: { nombre: true } }),
    prisma.comisionPartner.findMany({ select: { partner: true }, distinct: ["partner"] }),
    ultimaCorridaOk(),
    leerCobros(),
  ]);

  return {
    ctx: {
      cuentas: cuentas.map((c) => ({
        cuentaId: c.id,
        nombre: c.client.name,
        razonSocial: c.razonSocial,
        cedulaJuridica: c.cedulaJuridica,
        tipo: c.tipo,
        viaCobro: c.viaCobro,
      })),
      vinculos,
      facturas: facturas.map((f) => ({
        ...f,
        montoNeto: Number(f.montoNeto),
        montoImpuesto: Number(f.montoImpuesto),
        invoiceDate: dia(f.invoiceDate),
      })),
      cobros,
      aliados: [...new Set([...aliados.map((a) => a.nombre), ...comisiones.map((c) => c.partner)])],
    },
    faltaSqlNumeros,
    espejoAl: corridaOk ? dia(corridaOk) : null,
  };
}

/**
 * La factura con que el último Excel de Alexander cubre cada cobro sin número (cobroId → documento), para «Lo que no
 * cuadra». Vacío si nunca se subió el Excel. Lee lo mismo que la comparación: el último lote no descartado contra lo
 * que Nexus tiene hoy (`documentosDelLibroPorCobro`, puro).
 */
export async function documentosDelUltimoLibro(): Promise<Map<string, DocumentoDelLibro>> {
  const ultimo = await prisma.importacionCobranza.findFirst({
    where: { fuente: FUENTE_LIBRO_ALEX, estado: { not: "DESCARTADO" } },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });
  if (!ultimo) return new Map();
  const [lote, { ctx }] = await Promise.all([leerLoteDelLibro(ultimo.id), cargarContextoLibro()]);
  return lote ? documentosDelLibroPorCobro(lote.filas, ctx) : new Map();
}

/* ── La comparación ─────────────────────────────────────────────────────────────── */

export type RespuestaDelLibro = {
  lote: LoteDelLibroResumen & { filasIlegibles: number };
  comparacion: ComparacionDelLibro;
  faltaSqlNumeros: boolean;
  espejoAl: string | null;
};

/** null = el lote no existe. */
export async function compararLote(importId: string): Promise<RespuestaDelLibro | null> {
  const lote = await leerLoteDelLibro(importId);
  if (!lote) return null;
  const { ctx, faltaSqlNumeros, espejoAl } = await cargarContextoLibro();
  const { filas, ...resumen } = lote;
  return { lote: resumen, comparacion: compararLibro(filas, ctx), faltaSqlNumeros, espejoAl };
}

/* ── Los números ────────────────────────────────────────────────────────────────── */

export type RespuestaDeNumeros = {
  lote: LoteDelLibroResumen & { filasIlegibles: number };
  numeros: NumerosDelLibro;
  faltaSqlNumeros: boolean;
  espejoAl: string | null;
};

/** null = el lote no existe. `hoyISO` decide qué factura tiene fecha futura. */
export async function numerosDelLote(importId: string, hoyISO: string): Promise<RespuestaDeNumeros | null> {
  const lote = await leerLoteDelLibro(importId);
  if (!lote) return null;
  const { ctx, faltaSqlNumeros, espejoAl } = await cargarContextoLibro();
  const { filas, ...resumen } = lote;
  return { lote: resumen, numeros: proponerNumeros(filas, ctx, hoyISO), faltaSqlNumeros, espejoAl };
}
