/**
 * lib/cobranza/sociedades-servicio.ts
 *
 * Las sociedades que le facturan a una cuenta: listarlas, agregar una de Mercury o QuickBooks, y soltarla.
 * Server-only. Las decisiones puras viven en lib/cobranza/sociedades.ts.
 *
 * ── POR QUÉ (etapa 12, 2026-09-13) ─────────────────────────────────────────────
 * Grupo INB factura por Mercury como Quirinale Group y como Ingeniería Verde, y ninguna factura dice «Grupo
 * INB». Del lado de Odoo una cuenta ya podía tener varios clientes de Odoo; fuera de Odoo solo cabía un texto
 * en `razonSocial`. La tabla de vínculos con Odoo se generalizó: una fila por sociedad, con ficha de Odoo o
 * sin ella, con su cuenta y con quién la anotó.
 *
 * ⛔ Qué NO hace: vincular fichas de Odoo (eso es el emparejado, que además mueve sus facturas), borrar una
 * sociedad (se SUELTA: la fila queda sin cuenta, y volver a agregarla la retoma), ni elegir a qué sociedad
 * se le factura un cobro (eso lo dice quien marca facturado).
 */
import "server-only";
import { prisma } from "@/lib/db/prisma";
import { choqueDeSociedad, claveFactura, NOMBRE_DE_PLATAFORMA, type SociedadDeLaCuenta } from "./sociedades";
import type { SociedadAgregar } from "./schema";

export class SociedadError extends Error {
  readonly status: number;
  constructor(mensaje: string, status = 400) {
    super(mensaje);
    this.name = "SociedadError";
    this.status = status;
  }
}

/** null = la cuenta no existe. */
export async function listarSociedades(cuentaId: string): Promise<SociedadDeLaCuenta[] | null> {
  const cuenta = await prisma.cuentaFinanciera.findUnique({ where: { id: cuentaId }, select: { id: true } });
  if (!cuenta) return null;
  const filas = await prisma.odooPartnerVinculo.findMany({
    where: { cuentaId },
    select: {
      id: true,
      plataforma: true,
      odooPartnerNombre: true,
      odooVat: true,
      odooPartnerId: true,
      confirmadoPor: true,
      _count: { select: { cobrosFacturados: true } },
    },
    orderBy: [{ plataforma: "asc" }, { odooPartnerNombre: "asc" }],
  });
  return filas.map((f) => ({
    id: f.id,
    plataforma: f.plataforma,
    nombre: f.odooPartnerNombre,
    cedula: f.odooVat,
    conFicha: f.odooPartnerId !== null,
    cobros: f._count.cobrosFacturados,
    confirmadoPor: f.confirmadoPor,
  }));
}

/** El código de error de Prisma, sin depender de la clase (el repo lo lee así, lib/cobranza/ingest.ts). */
const codigoDe = (e: unknown): string | undefined =>
  e && typeof e === "object" && "code" in e && typeof e.code === "string" ? e.code : undefined;

/**
 * Anota una sociedad de Mercury o QuickBooks para la cuenta, firmada, con su línea en la bitácora.
 *
 * Única por plataforma y nombre en factura (`claveFactura`), sin cédula única. Si ya le factura a OTRA cuenta,
 * 409: una sociedad le factura a una sola cuenta, y si es la misma empresa lo que está duplicado son las
 * cuentas. Si quedó suelta, se retoma.
 */
export async function agregarSociedad(
  cuentaId: string,
  input: SociedadAgregar,
  actor: string,
): Promise<{ id: string; retomada: boolean }> {
  const cuenta = await prisma.cuentaFinanciera.findUnique({ where: { id: cuentaId }, select: { id: true } });
  if (!cuenta) throw new SociedadError("La cuenta no existe.", 404);

  const nombre = input.nombre.trim();
  const clave = claveFactura(nombre);
  if (!clave) throw new SociedadError("Ese nombre no alcanza para distinguir la sociedad. Escribilo como sale en la factura.");
  const cedula = input.cedula?.trim() || null;
  const donde = NOMBRE_DE_PLATAFORMA[input.plataforma];

  const existentes = await prisma.odooPartnerVinculo.findMany({
    where: { odooPartnerId: null, plataforma: input.plataforma },
    select: {
      id: true,
      plataforma: true,
      odooPartnerNombre: true,
      odooPartnerId: true,
      cuentaId: true,
      cuenta: { select: { client: { select: { name: true } } } },
    },
  });
  const choque = choqueDeSociedad(
    { plataforma: input.plataforma, nombre },
    existentes.map((e) => ({
      id: e.id,
      plataforma: e.plataforma,
      nombre: e.odooPartnerNombre,
      odooPartnerId: e.odooPartnerId,
      cuentaId: e.cuentaId,
      cuentaNombre: e.cuenta?.client.name ?? null,
    })),
  );
  if (choque && choque.cuentaId === cuentaId) {
    throw new SociedadError(`«${choque.nombre}» ya le factura a esta cuenta por ${donde}.`, 409);
  }
  if (choque && choque.cuentaId) {
    throw new SociedadError(
      `«${choque.nombre}» ya le factura a ${choque.cuentaNombre ?? "otra cuenta"} por ${donde}. Una sociedad le factura a una sola cuenta: si es la misma empresa, lo que está duplicado son las cuentas.`,
      409,
    );
  }

  try {
    return await prisma.$transaction(async (tx) => {
      const datos = {
        cuentaId,
        odooPartnerNombre: nombre,
        odooVat: cedula,
        via: "MANUAL" as const,
        ignorado: false,
        confirmadoPor: actor,
        confirmadoEn: new Date(),
      };
      /* Una sociedad que alguien soltó se retoma, en vez de chocar contra el índice único. */
      const fila = choque
        ? await tx.odooPartnerVinculo.update({ where: { id: choque.id }, data: datos, select: { id: true } })
        : await tx.odooPartnerVinculo.create({
            data: { ...datos, plataforma: input.plataforma, claveFactura: clave },
            select: { id: true },
          });
      await tx.bitacoraCobro.create({
        data: {
          cuentaId,
          tipo: "NOTA",
          contenido: `${actor} anotó una sociedad que le factura a la cuenta por ${donde}: «${nombre}»${cedula ? ` (cédula ${cedula})` : ""}.`,
          usuarioEmail: actor,
        },
      });
      return { id: fila.id, retomada: choque !== null };
    });
  } catch (e) {
    /* El índice único parcial (plataforma, claveFactura) es la red si dos personas la agregan a la vez. */
    if (codigoDe(e) === "P2002") throw new SociedadError(`«${nombre}» ya existe como sociedad de ${donde}.`, 409);
    throw e;
  }
}

/**
 * Suelta una sociedad de Mercury o QuickBooks: deja de facturarle a la cuenta, y la fila queda para retomarla.
 *
 * ⛔ No suelta una ficha de Odoo (eso es desvincular, que también mueve sus facturas) ni una sociedad con
 * cobros facturados a ella: quedarían anotados a alguien que ya no le factura a la cuenta (INV36).
 */
export async function soltarSociedad(cuentaId: string, sociedadId: string, actor: string): Promise<void> {
  const s = await prisma.odooPartnerVinculo.findUnique({
    where: { id: sociedadId },
    select: {
      cuentaId: true,
      odooPartnerId: true,
      odooPartnerNombre: true,
      plataforma: true,
      _count: { select: { cobrosFacturados: true } },
    },
  });
  if (!s || s.cuentaId !== cuentaId) throw new SociedadError("Esa sociedad no le factura a esta cuenta.", 404);
  if (s.odooPartnerId !== null) {
    throw new SociedadError("Es una ficha de Odoo: se desvincula en Cobranza › Odoo, donde también se mueven sus facturas.", 409);
  }
  if (s._count.cobrosFacturados > 0) {
    throw new SociedadError(
      `${s._count.cobrosFacturados} cobro(s) dicen que se le facturaron a «${s.odooPartnerNombre}». Cambiales la sociedad antes de soltarla.`,
      409,
    );
  }
  await prisma.$transaction(async (tx) => {
    await tx.odooPartnerVinculo.update({
      where: { id: sociedadId },
      data: { cuentaId: null, confirmadoPor: actor, confirmadoEn: new Date() },
    });
    await tx.bitacoraCobro.create({
      data: {
        cuentaId,
        tipo: "NOTA",
        contenido: `${actor} soltó la sociedad «${s.odooPartnerNombre}» (${NOMBRE_DE_PLATAFORMA[s.plataforma]}): ya no le factura a esta cuenta.`,
        usuarioEmail: actor,
      },
    });
  });
}
