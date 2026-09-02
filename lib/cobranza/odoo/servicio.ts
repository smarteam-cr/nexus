/**
 * lib/cobranza/odoo/servicio.ts
 *
 * La orquestación del emparejado: Prisma de un lado, el transporte del otro, y en el medio
 * las funciones puras de `emparejado.ts`, que son las que deciden. Server-only.
 *
 * ── POR QUÉ ESTO NO ESCRIBE NI UNA FILA DE `FacturaOdoo` ────────────────────────
 * El orden del plan es a propósito: **emparejar ANTES de espejar**. Con 15 de 49 cuentas
 * resueltas por señal automática, encender el sync primero produciría un espejo mal
 * atribuido —facturas colgadas de la cuenta equivocada— que cuesta más limpiar que hacerlo
 * bien de entrada.
 *
 * Los montos de Odoo se leen para PROPONER y se descartan. El espejo llega en la etapa 2.
 */
import "server-only";
import { prisma } from "@/lib/db/prisma";
import { crearTransporteXmlRpc, configDesdeEntorno } from "./transporte-xmlrpc";
import {
  ODOO_CAMPOS_FACTURA,
  ODOO_CAMPOS_PARTNER,
  OdooError,
  dominioClientes,
  dominioFacturasVenta,
  explicarFallo,
} from "./transporte";
import { mapearFactura, textoOdoo } from "./espejo";
import {
  buscarPartners,
  cedulaAAprender,
  proponerEmparejados,
  soloDigitos,
  type CuentaNexus,
  type MontoDeOdoo,
  type PartnerOdoo,
  type PropuestaEmparejado,
} from "./emparejado";
import type { OdooVinculoConfirmar, OdooVinculoDesvincular, OdooVinculoIgnorar } from "../schema";

export class EmparejadoError extends Error {
  readonly status: number;
  constructor(mensaje: string, status = 400) {
    super(mensaje);
    this.name = "EmparejadoError";
    this.status = status;
  }
}

/* ── 1. Traer el estado ─────────────────────────────────────────────────────────── */

export interface VinculoGuardado {
  odooPartnerId: number;
  odooPartnerNombre: string;
  odooVat: string | null;
  cuentaId: string | null;
  cuentaNombre: string | null;
  via: string | null;
  ignorado: boolean;
  confirmadoPor: string | null;
  confirmadoEn: string | null;
}

export interface EstadoEmparejado {
  propuestas: PropuestaEmparejado[];
  vinculos: VinculoGuardado[];
  partners: PartnerOdoo[];
  conteos: {
    cuentas: number;
    cuentasVinculadas: number;
    partners: number;
    partnersVinculados: number;
    partnersIgnorados: number;
    facturasLeidas: number;
  };
  /**
   * ⚠ No null cuando Odoo no contestó. La pantalla sigue sirviendo con lo que hay guardado
   * —el trabajo hecho no se pierde porque el ERP esté caído— pero **lo dice**, en vez de
   * mostrar cero propuestas como si el emparejado ya estuviera completo.
   */
  errorOdoo: string | null;
}

export async function cargarEmparejado(): Promise<EstadoEmparejado> {
  const cuentasDb = await prisma.cuentaFinanciera.findMany({
    select: {
      id: true,
      cedulaJuridica: true,
      client: { select: { name: true } },
      cobros: { select: { monto: true } },
    },
  });

  let partnersOdoo: PartnerOdoo[] = [];
  let montosOdoo: MontoDeOdoo[] = [];
  let facturasLeidas = 0;
  let errorOdoo: string | null = null;

  try {
    const t = crearTransporteXmlRpc(configDesdeEntorno());
    const [crudosPartner, crudasFacturas] = await Promise.all([
      t.buscarYLeer("res.partner", dominioClientes(), ODOO_CAMPOS_PARTNER, { order: "name asc" }),
      t.buscarYLeer("account.move", dominioFacturasVenta(), ODOO_CAMPOS_FACTURA, { order: "id asc" }),
    ]);
    facturasLeidas = crudasFacturas.length;

    partnersOdoo = crudosPartner.map((p) => ({
      odooPartnerId: Number(p.id),
      nombre: textoOdoo(p.name) ?? "",
      vat: textoOdoo(p.vat),
      customerRank: Number(p.customer_rank ?? 0),
    }));

    for (const c of crudasFacturas) {
      const r = mapearFactura(c);
      /* Solo facturas propiamente dichas: una nota de crédito por el mismo monto que un
         cobro apuntaría al partner correcto por la razón equivocada. */
      if ("rechazo" in r || r.factura.moveType !== "out_invoice") continue;
      montosOdoo.push({
        odooPartnerId: r.factura.odooPartnerId,
        montoNeto: r.factura.montoNeto,
        moneda: r.factura.moneda,
      });
    }

    await recordarPartners(partnersOdoo);
  } catch (e) {
    /* ⛔ No se traga el error. Un ERP que no responde es un hallazgo, no un problema a
       resolver en silencio dejando la pantalla vacía. */
    errorOdoo =
      e instanceof OdooError ? `${explicarFallo(e.clase)} (${e.message})` : e instanceof Error ? e.message : String(e);
    montosOdoo = [];
  }

  const guardados = await prisma.odooPartnerVinculo.findMany({
    include: { cuenta: { select: { id: true, client: { select: { name: true } } } } },
    orderBy: { odooPartnerNombre: "asc" },
  });

  /* Si Odoo no contestó, la lista de partners sale de lo que ya se había guardado: el
     buscador y los vínculos hechos siguen funcionando. */
  if (!partnersOdoo.length) {
    partnersOdoo = guardados.map((v) => ({
      odooPartnerId: v.odooPartnerId,
      nombre: v.odooPartnerNombre,
      vat: v.odooVat,
      customerRank: 1,
    }));
  }

  const yaVinculado = new Set(guardados.filter((v) => v.cuentaId).map((v) => v.cuentaId!));
  const partnersLibres = new Set(guardados.filter((v) => v.cuentaId || v.ignorado).map((v) => v.odooPartnerId));

  const cuentas: CuentaNexus[] = cuentasDb
    .filter((c) => !yaVinculado.has(c.id))
    .map((c) => ({
      cuentaId: c.id,
      nombre: c.client.name,
      cedulaJuridica: c.cedulaJuridica,
      montos: [...new Set(c.cobros.map((x) => Number(x.monto)))],
    }));

  /* Un partner ya vinculado o ya marcado «no es cliente nuestro» no vuelve a proponerse:
     de otro modo la lista no baja nunca y a la tercera sesión nadie la mira. */
  const candidateables = partnersOdoo.filter((p) => !partnersLibres.has(p.odooPartnerId));

  return {
    propuestas: proponerEmparejados(cuentas, candidateables, montosOdoo),
    vinculos: guardados.map((v) => ({
      odooPartnerId: v.odooPartnerId,
      odooPartnerNombre: v.odooPartnerNombre,
      odooVat: v.odooVat,
      cuentaId: v.cuentaId,
      cuentaNombre: v.cuenta?.client.name ?? null,
      via: v.via,
      ignorado: v.ignorado,
      confirmadoPor: v.confirmadoPor,
      confirmadoEn: v.confirmadoEn?.toISOString() ?? null,
    })),
    partners: partnersOdoo,
    conteos: {
      cuentas: cuentasDb.length,
      cuentasVinculadas: yaVinculado.size,
      partners: partnersOdoo.length,
      partnersVinculados: guardados.filter((v) => v.cuentaId).length,
      partnersIgnorados: guardados.filter((v) => v.ignorado).length,
      facturasLeidas,
    },
    errorOdoo,
  };
}

/**
 * Deja constancia de los partners que Odoo tiene hoy, SIN tocar los que ya tienen decisión.
 * Es lo que permite que la pantalla siga sirviendo cuando el ERP no responde.
 */
async function recordarPartners(partners: readonly PartnerOdoo[]): Promise<void> {
  const conocidos = new Set(
    (await prisma.odooPartnerVinculo.findMany({ select: { odooPartnerId: true } })).map((v) => v.odooPartnerId),
  );
  const nuevos = partners.filter((p) => !conocidos.has(p.odooPartnerId));
  if (nuevos.length) {
    await prisma.odooPartnerVinculo.createMany({
      data: nuevos.map((p) => ({ odooPartnerId: p.odooPartnerId, odooPartnerNombre: p.nombre, odooVat: p.vat })),
      skipDuplicates: true,
    });
  }
  /* El nombre y el vat SÍ se refrescan en los que no tienen decisión: si alguien corrigió la
     razón social en Odoo, la pantalla tiene que mostrar la buena. En los ya decididos no se
     toca nada — el nombre guardado es el que la persona vio cuando confirmó. */
  for (const p of partners) {
    await prisma.odooPartnerVinculo.updateMany({
      where: { odooPartnerId: p.odooPartnerId, cuentaId: null, ignorado: false },
      data: { odooPartnerNombre: p.nombre, odooVat: p.vat },
    });
  }
}

/* ── 2. Buscar ──────────────────────────────────────────────────────────────────── */

export async function buscarEnOdoo(consulta: string): Promise<{ partners: PartnerOdoo[]; errorOdoo: string | null }> {
  const guardados = await prisma.odooPartnerVinculo.findMany({
    select: { odooPartnerId: true, odooPartnerNombre: true, odooVat: true },
  });
  const partners: PartnerOdoo[] = guardados.map((v) => ({
    odooPartnerId: v.odooPartnerId,
    nombre: v.odooPartnerNombre,
    vat: v.odooVat,
    customerRank: 1,
  }));
  /* Se busca sobre lo guardado, no sobre Odoo: son 82 filas y una consulta por tecla al ERP
     sería gratis de escribir y cara de sostener. `cargarEmparejado` las refresca. */
  return { partners: buscarPartners(partners, consulta, { limite: 25 }), errorOdoo: null };
}

/* ── 3. Decidir ─────────────────────────────────────────────────────────────────── */

export interface ResultadoConfirmar {
  odooPartnerId: number;
  cuentaId: string;
  cedulaAprendida: string | null;
  /** ⚠ No null cuando Nexus y Odoo tienen cédulas distintas. NO se pisó nada. */
  conflictoCedula: { nexus: string; odoo: string } | null;
}

export async function confirmarVinculo(
  input: OdooVinculoConfirmar,
  actor: string,
): Promise<ResultadoConfirmar> {
  const cuenta = await prisma.cuentaFinanciera.findUnique({
    where: { id: input.cuentaId },
    select: { id: true, cedulaJuridica: true },
  });
  if (!cuenta) throw new EmparejadoError("Esa cuenta no existe.", 404);

  const partner = await prisma.odooPartnerVinculo.findUnique({ where: { odooPartnerId: input.odooPartnerId } });
  if (!partner) throw new EmparejadoError("Ese cliente de Odoo no está en la lista. Actualizá desde Odoo primero.", 404);

  /* ⛔ Un partner no puede tener dos dueños: el `@unique` de la base lo impide, pero acá se
     explica en vez de reventar con un error de Postgres. */
  if (partner.cuentaId && partner.cuentaId !== input.cuentaId) {
    throw new EmparejadoError("Ese cliente de Odoo ya está vinculado a otra cuenta. Desvinculalo primero.", 409);
  }

  const aprendizaje = input.aprenderCedula ? cedulaAAprender(cuenta.cedulaJuridica, partner.odooVat) : null;
  const escribir = aprendizaje && "escribir" in aprendizaje ? aprendizaje.escribir : null;
  const conflicto = aprendizaje && "conflicto" in aprendizaje ? aprendizaje.conflicto : null;

  await prisma.$transaction(async (tx) => {
    await tx.odooPartnerVinculo.update({
      where: { odooPartnerId: input.odooPartnerId },
      data: {
        cuentaId: input.cuentaId,
        via: input.via,
        ignorado: false,
        confirmadoPor: actor,
        confirmadoEn: new Date(),
      },
    });
    /* ⭐ Aprender la cédula es lo que hace que el trabajo de una tarde no haya que repetirlo:
       hoy solo 2 de 49 cuentas la tienen, que es por lo que la señal más confiable casi no
       opera. ⛔ Pero nunca pisa una que ya está: si difieren, eso es una línea de trabajo. */
    if (escribir) {
      await tx.cuentaFinanciera.update({ where: { id: cuenta.id }, data: { cedulaJuridica: escribir } });
    }
  });

  return { odooPartnerId: input.odooPartnerId, cuentaId: input.cuentaId, cedulaAprendida: escribir, conflictoCedula: conflicto };
}

export async function ignorarPartner(input: OdooVinculoIgnorar, actor: string): Promise<void> {
  const partner = await prisma.odooPartnerVinculo.findUnique({ where: { odooPartnerId: input.odooPartnerId } });
  if (!partner) throw new EmparejadoError("Ese cliente de Odoo no está en la lista.", 404);
  if (partner.cuentaId && input.ignorado) {
    throw new EmparejadoError("Ese cliente ya está vinculado a una cuenta. Desvinculalo antes de ignorarlo.", 409);
  }
  await prisma.odooPartnerVinculo.update({
    where: { odooPartnerId: input.odooPartnerId },
    data: { ignorado: input.ignorado, confirmadoPor: actor, confirmadoEn: new Date() },
  });
}

/** Deshacer. ⚠ La cédula aprendida NO se borra: el dato quedó bueno igual que antes. */
export async function desvincularPartner(input: OdooVinculoDesvincular, actor: string): Promise<void> {
  const partner = await prisma.odooPartnerVinculo.findUnique({ where: { odooPartnerId: input.odooPartnerId } });
  if (!partner) throw new EmparejadoError("Ese cliente de Odoo no está en la lista.", 404);
  await prisma.odooPartnerVinculo.update({
    where: { odooPartnerId: input.odooPartnerId },
    data: { cuentaId: null, via: null, ignorado: false, confirmadoPor: actor, confirmadoEn: new Date() },
  });
}

/** Para la pantalla: qué cuentas de Nexus todavía no tienen partner. */
export async function cuentasSinVinculo(): Promise<Array<{ cuentaId: string; nombre: string; cedula: string | null }>> {
  const [cuentas, vinculos] = await Promise.all([
    prisma.cuentaFinanciera.findMany({
      select: { id: true, cedulaJuridica: true, client: { select: { name: true } } },
      orderBy: { client: { name: "asc" } },
    }),
    prisma.odooPartnerVinculo.findMany({ where: { cuentaId: { not: null } }, select: { cuentaId: true } }),
  ]);
  const tomadas = new Set(vinculos.map((v) => v.cuentaId!));
  return cuentas
    .filter((c) => !tomadas.has(c.id))
    .map((c) => ({ cuentaId: c.id, nombre: c.client.name, cedula: soloDigitos(c.cedulaJuridica) || null }));
}
