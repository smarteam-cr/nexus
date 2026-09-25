/**
 * lib/cobranza/odoo/servicio.ts
 *
 * La orquestación del emparejado: Prisma de un lado, el transporte del otro, y en el medio
 * las funciones puras de `emparejado.ts`, que son las que deciden. Server-only.
 *
 * ── QUÉ ESCRIBE Y QUÉ NO ─────────────────────────────────────────────────────────
 * Escribe el catálogo de partners y los vínculos que una persona confirma. Desde el 2026-09-25, también
 * la vía de cobro de una cuenta («Está en Mercury»), y solo por su chokepoint (`cambiarViaCobroTx`,
 * lib/cobranza/via-cobro.ts), que firma y deja la línea en la bitácora de la cuenta. De `FacturaOdoo`
 * escribe **una sola cosa**: la cuenta de las facturas del cliente que se vincula o desvincula,
 * y solo a través de `atribucion.ts`. Montos, estados y fechas siguen siendo del sync. Los
 * montos de Odoo se leen acá solo para PROPONER emparejamientos y se descartan.
 *
 * ⚠ Hasta el 2026-09-12 decía «se corrige sola cuando alguien vincula ese cliente», porque la
 * cuenta la resolvía el sync en cada corrida. Con el sync caído desde el 2-sep eso fue falso
 * durante diez días: 27 vínculos confirmados y 347 facturas sin cuenta. Ahora vincular atribuye
 * en la misma transacción, y el sync solo escribe la cuenta cuando cambia.
 */
import "server-only";
import type { FacturaLiberada } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { atribuirFacturasDelPartner } from "./atribucion";
import { crearTransporteXmlRpc, configDesdeEntorno } from "./transporte-xmlrpc";
import { ODOO_CAMPOS_PARTNER, OdooError, dominioClientes, explicarFallo } from "./transporte";
import { textoOdoo } from "./espejo";
import {
  buscarPartners,
  cedulaAAprender,
  decidirMarcaDeMercury,
  proponerEmparejados,
  quedaPorEmparejar,
  resumenDelEmparejado,
  type CuentaNexus,
  type MontoDeOdoo,
  type PartnerOdoo,
  type PropuestaEmparejado,
  type ResumenDelEmparejado,
} from "./emparejado";
import { cambiarViaCobroTx } from "../via-cobro";
import {
  contarDocumentos,
  decidirMarcas,
  detectarDiferenciasOdoo,
  numeroVerificableEnOdoo,
  textoDeLiberacion,
  type DiferenciaOdoo,
  type EstadoDelCruce,
  type LiberacionParaCruzar,
} from "./diferencias";
import {
  MARCA_ANULADA,
  MARCA_BIEN_ASI,
  anularLiberacionTx,
  deshacerMarcasTx,
  marcarFilasTx,
  reabrirLiberacionTx,
} from "./marcas";
import { documentosDelUltimoLibro, leerServiciosDeVenta } from "../libro-alex-server";
import { candidatasParaElCobro, type CandidatasDeCobro } from "./candidatas";
import { ultimaCorridaOk } from "./sync";
import type {
  OdooCuentaVia,
  OdooDeshacerMarcas,
  OdooMarcarFilas,
  OdooReabrirLiberacion,
  OdooResolverLiberacion,
  OdooVinculoConfirmar,
  OdooVinculoDesvincular,
  OdooVinculoIgnorar,
} from "../schema";

export class EmparejadoError extends Error {
  readonly status: number;
  constructor(mensaje: string, status = 400) {
    super(mensaje);
    this.name = "EmparejadoError";
    this.status = status;
  }
}

/**
 * ¿Es una ficha de Odoo? Desde la etapa 12 `OdooPartnerVinculo` guarda también las sociedades de Mercury y
 * QuickBooks, que no tienen ficha. El emparejado y el espejo miran solo las que la tienen.
 */
function conFicha<T extends { odooPartnerId: number | null }>(v: T): v is T & { odooPartnerId: number } {
  return v.odooPartnerId !== null;
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

/**
 * Una cuenta sin cliente de Odoo que factura por otra plataforma: la lista «En Mercury» de Emparejar
 * (2026-09-25). Sale de la vía de cobro, no de una marca aparte.
 */
export interface CuentaFueraDeOdoo {
  cuentaId: string;
  nombre: string;
  /** MERCURY u OTRA (QuickBooks). */
  via: string;
  /** Quién la dejó en esa vía y cuándo (`viaCobroPor/En`). null = venía así, sin firma. */
  marcadaPor: string | null;
  marcadaEn: string | null;
  /** Sin firma, de dónde venía: la cuenta nació del importador (`fuente = sheet`) o de un alta. */
  origen: "IMPORTACION" | "ALTA";
  /** Día del alta de la cuenta (`YYYY-MM-DD`). */
  altaEn: string;
}

export interface EstadoEmparejado {
  propuestas: PropuestaEmparejado[];
  vinculos: VinculoGuardado[];
  partners: PartnerOdoo[];
  /** ⭐ De `resumenDelEmparejado`: la misma regla que la pestaña, «Cómo funciona» y «Lo que no cuadra». */
  conteos: {
    cuentas: number;
    cuentasVinculadas: number;
    porEmparejar: number;
    enMercury: number;
    enOtra: number;
    deOdoo: number;
    partners: number;
    partnersVinculados: number;
    partnersIgnorados: number;
    facturasLeidas: number;
  };
  /** Las cuentas sin cliente de Odoo que facturan por Mercury o QuickBooks, con quién las dejó ahí. */
  fueraDeOdoo: CuentaFueraDeOdoo[];
  /**
   * ⚠ No null cuando Odoo no contestó. La pantalla sigue sirviendo con lo que hay guardado
   * —el trabajo hecho no se pierde porque el ERP esté caído— pero **lo dice**, en vez de
   * mostrar cero propuestas como si el emparejado ya estuviera completo.
   */
  errorOdoo: string | null;
}

/**
 * ⚠⚠ POR DEFECTO **NO LLAMA AL ERP**. Los partners salen del catálogo guardado y los montos
 * del espejo de facturas — las dos cosas ya están en la base desde que corre el sync.
 *
 * Antes esta función consultaba Odoo en cada carga de pantalla, y estaba escrito en la
 * bitácora como una decisión provisional: «con el espejo de la etapa 2 andando, los montos
 * salen de FacturaOdoo y la consulta al ERP desaparece sola». Desapareció.
 *
 * ⛔ No es una optimización: es la causa de un incidente. El 2026-09-02 Odoo empezó a rechazar
 * el usuario media hora después de una corrida exitosa, con un rechazo de cortocircuito de
 * 8 ms —ni evaluó la contraseña— compatible con su bloqueo por volumen de logins. Cada carga
 * de esta pantalla eran 2 autenticaciones, y 4 con el doble render de React en desarrollo.
 *
 * `refrescar: true` es el único camino que toca el ERP, y lo dispara una persona con un botón.
 */
export async function cargarEmparejado(opts: { refrescar?: boolean } = {}): Promise<EstadoEmparejado> {
  const cuentasDb = await prisma.cuentaFinanciera.findMany({
    select: {
      id: true,
      cedulaJuridica: true,
      client: { select: { name: true } },
      /* ⚠ La MONEDA viaja con el monto: sin ella el emparejado proponía un cliente cuya
         factura en colones coincidía en número con un cobro en dólares. */
      cobros: { select: { monto: true, moneda: true } },
      /* «Está en Mercury» (2026-09-25): la vía decide si la cuenta se empareja, y la firma sale en la
         lista «En Mercury». ⚠ `viaCobroPor/En` son del SQL 2026-09-25-1, que va antes del deploy. */
      viaCobro: true,
      viaCobroPor: true,
      viaCobroEn: true,
      fuente: true,
      createdAt: true,
    },
    orderBy: { client: { name: "asc" } },
  });

  let partnersOdoo: PartnerOdoo[] = [];
  let montosOdoo: MontoDeOdoo[] = [];
  let facturasLeidas = 0;
  let errorOdoo: string | null = null;

  /* Los montos para proponer salen del ESPEJO, no del ERP. Solo las facturas propiamente
     dichas: una nota de crédito por el mismo monto que un cobro apuntaría al partner correcto
     por la razón equivocada. */
  const espejo = await prisma.facturaOdoo.findMany({
    where: { estadoEspejo: "VIGENTE", moveType: "out_invoice" },
    select: { odooPartnerId: true, montoNeto: true, moneda: true },
  });
  montosOdoo = espejo.map((f) => ({
    odooPartnerId: f.odooPartnerId,
    montoNeto: Number(f.montoNeto),
    moneda: f.moneda,
  }));
  facturasLeidas = espejo.length;

  if (opts.refrescar) try {
    /* UNA sola lectura, y solo la lista de clientes: los montos ya salieron del espejo. */
    const t = crearTransporteXmlRpc(configDesdeEntorno());
    const crudosPartner = await t.buscarYLeer("res.partner", dominioClientes(), ODOO_CAMPOS_PARTNER, {
      order: "name asc",
    });
    partnersOdoo = crudosPartner.map((p) => ({
      odooPartnerId: Number(p.id),
      nombre: textoOdoo(p.name) ?? "",
      vat: textoOdoo(p.vat),
      customerRank: Number(p.customer_rank ?? 0),
    }));
    await recordarPartners(partnersOdoo);
  } catch (e) {
    /* ⛔ No se traga el error. Un ERP que no responde es un hallazgo, no un problema a
       resolver en silencio. ⚠ Pero los montos NO se descartan: vienen del espejo, que sigue
       siendo válido aunque el ERP esté caído. Vaciarlos borraría las propuestas por monto
       —que son 9 de las 15— por un problema que no las afecta. */
    errorOdoo =
      e instanceof OdooError ? `${explicarFallo(e.clase)} (${e.message})` : e instanceof Error ? e.message : String(e);
  }

  /* ⚠ Solo las fichas de Odoo: desde la etapa 12 la tabla guarda también las sociedades de Mercury y
     QuickBooks, que no son clientes de Odoo y no se emparejan. Con `select` explícito, así una columna
     nueva no tumba el emparejado. */
  const guardados = (
    await prisma.odooPartnerVinculo.findMany({
      where: { odooPartnerId: { not: null } },
      select: {
        odooPartnerId: true,
        odooPartnerNombre: true,
        odooVat: true,
        cuentaId: true,
        via: true,
        ignorado: true,
        confirmadoPor: true,
        confirmadoEn: true,
        cuenta: { select: { id: true, client: { select: { name: true } } } },
      },
      orderBy: { odooPartnerNombre: "asc" },
    })
  ).filter(conFicha);

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

  const yaVinculado = new Set(guardados.flatMap((v) => (v.cuentaId ? [v.cuentaId] : [])));
  /* Los clientes de Odoo que ya tienen decisión: vinculados a una cuenta o marcados ajenos. */
  const partnersDecididos = new Set(guardados.filter((v) => v.cuentaId || v.ignorado).map((v) => v.odooPartnerId));

  /* ⭐ Etapa 12 (H10): las cuentas ya vinculadas SIGUEN en la lista. Hasta el 2026-09-13 salían apenas
     tenían su primer cliente de Odoo, y la segunda ficha de la misma empresa —otra sociedad, o la misma
     cargada dos veces con la cédula tipeada distinta— quedaba inalcanzable, con sus facturas sin dueño.
     Vuelven solo con cédula o nombre exacto (`proponerEmparejados`), y sin montos: su plata ya la
     explica su primer cliente, y contarla haría pasar por única una cifra que no lo es.
     ⭐ 2026-09-25: las que no tienen cliente de Odoo entran solo si `quedaPorEmparejar` (vía Odoo). Una
     cuenta en Mercury o QuickBooks no tiene nada que buscar en Odoo: ni tarjeta, ni candidatos, y sus
     montos no cuentan para la unicidad de la señal de monto. */
  const seProponen = cuentasDb.filter((c) => yaVinculado.has(c.id) || quedaPorEmparejar(c, yaVinculado));
  const cuentas: CuentaNexus[] = seProponen.map((c) => ({
    cuentaId: c.id,
    nombre: c.client.name,
    cedulaJuridica: c.cedulaJuridica,
    montos: yaVinculado.has(c.id)
      ? []
      : [...new Map(c.cobros.map((x) => [`${x.moneda}|${Number(x.monto)}`, { monto: Number(x.monto), moneda: x.moneda }])).values()],
  }));

  /* Un partner ya vinculado o ya marcado «no es cliente nuestro» no vuelve a proponerse:
     de otro modo la lista no baja nunca y a la tercera sesión nadie la mira. ⚠ Tampoco por monto
     (`partnersDescartados`): el monto sale de todas las facturas del espejo, también las suyas. */
  const candidateables = partnersOdoo.filter((p) => !partnersDecididos.has(p.odooPartnerId));
  const resumen = resumenDelEmparejado(cuentasDb, yaVinculado);

  return {
    propuestas: proponerEmparejados(cuentas, candidateables, montosOdoo, {
      yaVinculadas: yaVinculado,
      partnersDescartados: partnersDecididos,
    }),
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
      cuentas: resumen.cuentas,
      cuentasVinculadas: resumen.vinculadas,
      porEmparejar: resumen.porEmparejar,
      enMercury: resumen.enMercury,
      enOtra: resumen.enOtra,
      deOdoo: resumen.deOdoo,
      partners: partnersOdoo.length,
      partnersVinculados: guardados.filter((v) => v.cuentaId).length,
      partnersIgnorados: guardados.filter((v) => v.ignorado).length,
      facturasLeidas,
    },
    /* Las que la regla deja fuera: sin cliente de Odoo y con otra vía. Son exactamente `enMercury + enOtra`. */
    fueraDeOdoo: cuentasDb
      .filter((c) => !yaVinculado.has(c.id) && !quedaPorEmparejar(c, yaVinculado))
      .map((c) => ({
        cuentaId: c.id,
        nombre: c.client.name,
        via: c.viaCobro,
        marcadaPor: c.viaCobroPor,
        marcadaEn: c.viaCobroEn?.toISOString() ?? null,
        origen: c.fuente === "sheet" ? ("IMPORTACION" as const) : ("ALTA" as const),
        altaEn: c.createdAt.toISOString().slice(0, 10),
      })),
    errorOdoo,
  };
}

/**
 * Los contadores del emparejado para la página, sin traer propuestas: la pestaña, la pestaña con que abre y
 * «Cómo funciona». La regla es `resumenDelEmparejado`, la misma de `cargarEmparejado` y «Lo que no cuadra».
 *
 * ⚠ Hasta el 2026-09-25 la página contaba FICHAS vinculadas (28, JUDESUR tiene dos) contra todas las
 * cuentas (56): la pestaña decía 28 con 29 tarjetas en la lista.
 */
export async function contarEmparejado(): Promise<ResumenDelEmparejado> {
  const [cuentas, vinculos] = await Promise.all([
    prisma.cuentaFinanciera.findMany({ select: { id: true, viaCobro: true } }),
    prisma.odooPartnerVinculo.findMany({
      where: { cuentaId: { not: null }, odooPartnerId: { not: null } },
      select: { cuentaId: true },
    }),
  ]);
  return resumenDelEmparejado(cuentas, new Set(vinculos.flatMap((v) => (v.cuentaId ? [v.cuentaId] : []))));
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
    where: { odooPartnerId: { not: null } },
    select: { odooPartnerId: true, odooPartnerNombre: true, odooVat: true },
  });
  const partners: PartnerOdoo[] = guardados.filter(conFicha).map((v) => ({
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
  /**
   * Etapa 12: la cédula de Odoo es otra, pero la de la cuenta es la de otra de sus sociedades. No es un
   * conflicto: la ficha queda como otra sociedad de la cuenta. Tampoco se pisó nada.
   */
  otraSociedad: { nexus: string; odoo: string } | null;
  /** Cuántos documentos de ese cliente (facturas y notas de crédito) quedaron con esta cuenta. */
  facturasAtribuidas: number;
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
  if (!partner) throw new EmparejadoError("Ese cliente de Odoo no está en la lista. Actualiza la lista desde Odoo primero.", 404);

  /* ⛔ Un partner no puede tener dos dueños: el `@unique` de la base lo impide, pero acá se
     explica en vez de reventar con un error de Postgres. */
  if (partner.cuentaId && partner.cuentaId !== input.cuentaId) {
    throw new EmparejadoError("Ese cliente de Odoo ya está vinculado a otra cuenta. Desvincúlalo primero.", 409);
  }

  /* Las cédulas de las OTRAS fichas de la cuenta: con ellas, una segunda cédula deja de ser un conflicto
     (etapa 12). Se descarta la propia en memoria: son dos o tres filas. */
  const otrasFichas = input.aprenderCedula
    ? await prisma.odooPartnerVinculo.findMany({
        where: { cuentaId: input.cuentaId },
        select: { odooPartnerId: true, odooVat: true },
      })
    : [];
  const aprendizaje = input.aprenderCedula
    ? cedulaAAprender(
        cuenta.cedulaJuridica,
        partner.odooVat,
        otrasFichas.filter((v) => v.odooPartnerId !== input.odooPartnerId).map((v) => v.odooVat),
      )
    : null;
  const escribir = aprendizaje && "escribir" in aprendizaje ? aprendizaje.escribir : null;
  const conflicto = aprendizaje && "conflicto" in aprendizaje ? aprendizaje.conflicto : null;
  const otraSociedad = aprendizaje && "otraSociedad" in aprendizaje ? aprendizaje.otraSociedad : null;

  const atribuidas = await prisma.$transaction(async (tx) => {
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
    /* ⭐ Y las facturas de ese cliente pasan a esta cuenta en la MISMA transacción: el vínculo y
       su efecto no pueden quedar separados, que es exactamente lo que pasó del 3 al 12-sep. */
    return atribuirFacturasDelPartner(tx, input.odooPartnerId, actor);
  });

  return {
    odooPartnerId: input.odooPartnerId,
    cuentaId: input.cuentaId,
    cedulaAprendida: escribir,
    conflictoCedula: conflicto,
    otraSociedad,
    facturasAtribuidas: atribuidas.length,
  };
}

export async function ignorarPartner(input: OdooVinculoIgnorar, actor: string): Promise<void> {
  const partner = await prisma.odooPartnerVinculo.findUnique({ where: { odooPartnerId: input.odooPartnerId } });
  if (!partner) throw new EmparejadoError("Ese cliente de Odoo no está en la lista.", 404);
  if (partner.cuentaId && input.ignorado) {
    throw new EmparejadoError("Ese cliente ya está vinculado a una cuenta. Desvincúlalo antes de ignorarlo.", 409);
  }
  await prisma.odooPartnerVinculo.update({
    where: { odooPartnerId: input.odooPartnerId },
    data: { ignorado: input.ignorado, confirmadoPor: actor, confirmadoEn: new Date() },
  });
}

/**
 * Deshacer. ⚠ La cédula aprendida NO se borra: el dato quedó bueno igual que antes.
 *
 * ⚠ Las facturas SÍ vuelven a quedar sin cuenta, en la misma transacción. Dejarles la cuenta
 * vieja las seguía apareando con los cobros de un cliente que ya no es el suyo.
 */
export async function desvincularPartner(
  input: OdooVinculoDesvincular,
  actor: string,
): Promise<{ facturasDesatribuidas: number }> {
  const partner = await prisma.odooPartnerVinculo.findUnique({ where: { odooPartnerId: input.odooPartnerId } });
  if (!partner) throw new EmparejadoError("Ese cliente de Odoo no está en la lista.", 404);
  /* ⛔ Etapa 12: con cobros facturados a esta ficha, desvincularla los dejaría anotados a una sociedad que
     ya no es de su cuenta (INV36). Primero se les cambia a quién se facturó. Es un conteo: nada de acá
     escribe un cobro. */
  const facturados = await prisma.cobro.count({ where: { sociedadFacturadaId: partner.id } });
  if (facturados > 0) {
    throw new EmparejadoError(
      `${facturados} cobro(s) dicen que se le facturaron a «${partner.odooPartnerNombre}». Cámbiales la sociedad en el cronograma de la cuenta antes de desvincularla.`,
      409,
    );
  }
  const cambios = await prisma.$transaction(async (tx) => {
    await tx.odooPartnerVinculo.update({
      where: { odooPartnerId: input.odooPartnerId },
      data: { cuentaId: null, via: null, ignorado: false, confirmadoPor: actor, confirmadoEn: new Date() },
    });
    return atribuirFacturasDelPartner(tx, input.odooPartnerId, actor);
  });
  return { facturasDesatribuidas: cambios.length };
}

/**
 * «Está en Mercury» y su «Deshacer», desde Emparejar (2026-09-25). Cambia la vía de cobro de la cuenta en
 * TODO Cobranza —Elías: «una sola verdad»— por el chokepoint `cambiarViaCobroTx`, que firma y deja la línea
 * en la bitácora de la cuenta. La regla de qué se puede es `decidirMarcaDeMercury` (pura).
 *
 * ⛔ Nada de Odoo: ni vínculos, ni facturas, ni «ajeno». La cuenta sale de «Emparejar» porque la regla
 * `quedaPorEmparejar` mira la vía, y «Deshacer» la devuelve con todo lo que tenía, porque no se guardó
 * nada aparte. Se lee y se escribe en la misma transacción: si alguien la vinculó en otra pestaña entre el
 * clic y la escritura, el rechazo lo ve.
 */
export async function marcarViaDesdeEmparejado(
  input: OdooCuentaVia,
  actor: string,
): Promise<{ cambio: boolean; via: OdooCuentaVia["via"]; nombre: string }> {
  return prisma.$transaction(async (tx) => {
    const cuenta = await tx.cuentaFinanciera.findUnique({
      where: { id: input.cuentaId },
      select: {
        viaCobro: true,
        client: { select: { name: true } },
        vinculosOdoo: { where: { odooPartnerId: { not: null } }, select: { odooPartnerNombre: true } },
      },
    });
    if (!cuenta) throw new EmparejadoError("Esa cuenta no existe.", 404);
    const nombre = cuenta.client.name;
    const decision = decidirMarcaDeMercury(
      { nombre, viaCobro: cuenta.viaCobro, fichasDeOdoo: cuenta.vinculosOdoo.map((v) => v.odooPartnerNombre) },
      input.via,
    );
    if (decision.tipo === "RECHAZO") throw new EmparejadoError(decision.motivo, 409);
    if (decision.tipo === "YA_ESTABA") return { cambio: false, via: input.via, nombre };
    await cambiarViaCobroTx(tx, {
      cuentaId: input.cuentaId,
      nueva: input.via,
      actor,
      motivo:
        input.via === "MERCURY"
          ? "la marcó «Está en Mercury» en Cobranza › Odoo › Emparejar."
          : "deshizo «Está en Mercury» en Cobranza › Odoo › Emparejar; la cuenta vuelve a la lista para emparejar.",
    });
    return { cambio: true, via: input.via, nombre };
  });
}

/* ── 4. La mesa de trabajo con el CFO ───────────────────────────────────────────── */

/**
 * Todo lo que no cuadra entre Nexus y Odoo, en una sola lista ordenada por plata.
 *
 * ⚠ Se leen TODOS los cobros y TODAS las facturas vigentes: la lista es la agenda de una
 * reunión y «y 12 más» la convierte en un titular. A 202 cobros y 347 facturas eso es una
 * consulta barata; el día que no lo sea, se pagina la PANTALLA, no la detección.
 */
export async function cargarDiferencias(): Promise<{
  inconsistencias: DiferenciaOdoo[];
  /** Las facturas soltadas que alguien cerró con «Ya está anulada»: van en «Marcadas», con «Deshacer». */
  anuladas: AnuladaAMano[];
  medido: MedidoDelCruce;
}> {
  const [{ estado, medido }, anuladas] = await Promise.all([cargarEstadoDelCruce(), cargarAnuladasAMano()]);
  return { inconsistencias: detectarDiferenciasOdoo(estado), anuladas, medido };
}

/**
 * Una factura soltada cerrada a mano con «Ya está anulada». Ya no está en ninguna línea —lo que la cierra es
 * `FacturaLiberada.resueltaEn`—, así que «Marcadas» la muestra aparte, con su motivo y «Deshacer».
 */
export interface AnuladaAMano {
  liberacionId: string;
  /** Lo que decía su fila: el cliente y el monto. */
  texto: string;
  /** El número de documento y la cuota. */
  nota: string;
  /** null = se cerró antes de que «Ya está anulada» pidiera motivo. */
  motivo: string | null;
  por: string | null;
  /** ISO. */
  en: string;
}

async function cargarAnuladasAMano(): Promise<AnuladaAMano[]> {
  const [cerradas, marcas] = await Promise.all([
    prisma.facturaLiberada.findMany({
      where: { resueltaEn: { not: null } },
      select: { id: true, clienteNombre: true, numCuota: true, monto: true, moneda: true, referenciaExterna: true, resueltaEn: true, resueltaPor: true },
      orderBy: [{ resueltaEn: "desc" }, { id: "asc" }],
    }),
    prisma.diferenciaOdooMarca.findMany({
      where: { tipo: MARCA_ANULADA, deshechaEn: null },
      select: { documento: true, motivo: true },
      orderBy: [{ marcadaEn: "desc" }, { id: "desc" }],
    }),
  ]);
  /* La más reciente por documento: es la del último cierre. */
  const motivoDe = new Map<string, string>();
  for (const m of marcas) if (!motivoDe.has(m.documento)) motivoDe.set(m.documento, m.motivo);
  return cerradas.map((l) => ({
    liberacionId: l.id,
    texto: textoDeLiberacion({ clienteNombre: l.clienteNombre, monto: Number(l.monto), moneda: l.moneda }),
    nota: `${l.referenciaExterna ?? "sin número"} · cuota ${l.numCuota ?? "?"}`,
    motivo: motivoDe.get(`l:${l.id}`) ?? null,
    por: l.resueltaPor,
    en: (l.resueltaEn ?? new Date(0)).toISOString(),
  }));
}

type MedidoDelCruce = {
  cobros: number;
  /** Facturas vivas de Odoo. */
  facturas: number;
  /** Notas de crédito y documentos anulados o revertidos: «364 facturas» eran 296 facturas y 68 de estos. */
  otrosDocumentos: number;
  /** `resumenDelEmparejado().porEmparejar`: vía Odoo y sin cliente de Odoo. El mismo número que la pestaña. */
  cuentasSinVinculo: number;
  /** `resumenDelEmparejado().deOdoo`: las que facturan por Odoo (vinculadas + por emparejar). */
  cuentasTotales: number;
  /** Día de la última copia buena de Odoo (`YYYY-MM-DD`): el pie de las líneas de Odoo lo dice. */
  espejoAl: string | null;
};

/** Una factura soltada como la cruza el detector. */
export function liberacionParaCruzar(l: FacturaLiberada): LiberacionParaCruzar {
  return {
    id: l.id,
    cuentaId: l.cuentaId,
    clienteNombre: l.clienteNombre,
    numCuota: l.numCuota,
    periodo: l.periodo,
    monto: Number(l.monto),
    moneda: l.moneda,
    fechaEmision: l.fechaEmision ? l.fechaEmision.toISOString().slice(0, 10) : null,
    referenciaExterna: l.referenciaExterna,
    plataforma: l.plataforma,
    decision: l.decision,
    liberadaPor: l.liberadaPor,
    liberadaEn: l.liberadaEn.toISOString().slice(0, 10),
    resuelta: l.resueltaEn !== null,
  };
}

/**
 * Lo que «Lo que no cuadra» cruza, leído de la base. Aparte de `cargarDiferencias` para que una medición de solo
 * lectura pruebe la cobertura (`coberturaDelCruce`) con exactamente lo mismo que ve la pantalla, y para que los scripts
 * de traspaso y reapertura (2026-09-25) decidan sobre las mismas filas que ve la pantalla.
 *
 * `sinMarcas`: SOLO para el simulacro de esos scripts, que tiene que poder correr antes de que exista la tabla de marcas
 * (su SQL va antes del deploy, y el simulacro se corre para decidir). La pantalla nunca lo pasa: sin marcas, todo lo
 * revisado volvería a la lista.
 */
export async function cargarEstadoDelCruce(opts: { sinMarcas?: boolean } = {}): Promise<{
  estado: EstadoDelCruce;
  medido: MedidoDelCruce;
}> {
  const leerMarcas = () =>
    prisma.diferenciaOdooMarca.findMany({
      where: { tipo: MARCA_BIEN_ASI, deshechaEn: null },
      select: { id: true, linea: true, fila: true, documento: true, huella: true, motivo: true, marcadaPor: true, marcadaEn: true },
      orderBy: [{ marcadaEn: "desc" }, { id: "desc" }],
    });
  const sinMarcas: Awaited<ReturnType<typeof leerMarcas>> = [];
  const [cobrosDb, facturasDb, cuentasDb, vinculosDb, marcasDb, liberadasDb, corridaOk, libro, servicios] = await Promise.all([
    prisma.cobro.findMany({
      select: {
        id: true,
        cuentaId: true,
        periodo: true,
        fechaProgramada: true,
        monto: true,
        moneda: true,
        estado: true,
        fechaEmision: true,
        /* ⚠ Etapa 8: el cruce aparea primero por número. La columna es del SQL de la etapa 7, que ya
           tenía que ir antes del deploy: sin él, esta pantalla también da error. */
        numeroFactura: true,
        /* Etapa 12: la plataforma anotada en la factura manda sobre la de la cuenta (su SQL va antes del deploy). */
        plataformaFactura: true,
        /* La venta contada dos veces compara cuotas de servicios distintos (2026-09-14). */
        servicioId: true,
        servicio: { select: { descripcion: true, tipoServicio: true } },
        cuenta: { select: { client: { select: { name: true } } } },
      },
      orderBy: [{ fechaProgramada: "asc" }, { id: "asc" }],
    }),
    /* ⚠ Con orden explícito. `cruzar()` desempata por id, pero una consulta sin ORDER BY no
       garantiza nada y el apareo no debería depender de eso en dos lugares distintos.
       Y con `select` explícito: una columna nueva del espejo (`montoMonedaCompania`, etapa 4) no
       puede tumbar esta pantalla si el código llega a producción antes que su SQL. */
    prisma.facturaOdoo.findMany({
      where: { estadoEspejo: "VIGENTE" },
      select: {
        id: true,
        odooMoveId: true,
        numero: true,
        cuentaId: true,
        odooPartnerId: true,
        odooPartnerNombre: true,
        invoiceDate: true,
        montoNeto: true,
        montoTotal: true,
        /* «Por cobrar», «sin saldo» y «nota sin aplicar» salen de acá (2026-09-13). La columna es del SQL del
           espejo original: está en producción desde el primer sync. */
        montoResidual: true,
        montoImpuesto: true,
        moneda: true,
        moveType: true,
        paymentState: true,
        state: true,
      },
      orderBy: { odooMoveId: "asc" },
    }),
    prisma.cuentaFinanciera.findMany({
      select: { id: true, tipo: true, viaCobro: true, client: { select: { name: true } } },
    }),
    /* Las CUENTAS vinculadas, no los vínculos: una cuenta con dos razones sociales en Odoo
       contaba dos veces y el «faltan emparejar» salía más chico que la verdad. */
    prisma.odooPartnerVinculo.findMany({ where: { cuentaId: { not: null }, odooPartnerId: { not: null } }, select: { cuentaId: true } }),
    /* ⭐ Las marcas «está bien así» por fila que nadie deshizo (2026-09-25). ⚠ La tabla es del SQL
       scripts/sql/2026-09-25-2-marcas-por-fila.sql, que va ANTES del deploy: sin ella esta pantalla da error.
       La marca de grupo (`DiferenciaOdooAceptada`) ya no se lee: la pantalla la dejó de usar ese día. */
    opts.sinMarcas ? sinMarcas : leerMarcas(),
    /* Solo las que siguen abiertas: una resuelta no produce ninguna línea, y traerlas todas
       hacía crecer esta consulta para siempre sin que nada lo usara. La regla de qué es
       «pendiente» sigue viviendo entera en `liberacionesPendientes` —el módulo puro la prueba
       contra el caso «alguien la cerró a mano»—; acá solo se evita traer lo que ya se sabe
       que va a descartar. */
    prisma.facturaLiberada.findMany({ where: { resueltaEn: null }, orderBy: { liberadaEn: "desc" } }),
    ultimaCorridaOk(),
    /* Lo que el Excel de Alexander dice de las cuotas sin número (ACCCSA, facturada por Mercury). Sin lote, vacío. */
    documentosDelUltimoLibro(),
    leerServiciosDeVenta(),
  ]);
  const cuentasVinculadas = new Set(vinculosDb.flatMap((v) => (v.cuentaId ? [v.cuentaId] : [])));
  /* ⭐ «Falta emparejar N de M» sale de `resumenDelEmparejado`, la misma regla que la pestaña «Emparejar»
     (2026-09-25): por emparejar = vía Odoo y sin cliente de Odoo; M = las que facturan por Odoo. Hasta ese día
     contaba solo las nacionales («7 de 34») mientras la pestaña decía 28: tres números para una pregunta. Las
     internacionales con vía Odoo SÍ cuentan: salen marcándolas «Está en Mercury», que es lo que les falta. */
  const resumenEmparejado = resumenDelEmparejado(cuentasDb, cuentasVinculadas);
  const cuentasTotales = resumenEmparejado.deOdoo;
  const cuentasSinVinculo = resumenEmparejado.porEmparejar;
  const espejoAl = corridaOk ? corridaOk.toISOString().slice(0, 10) : null;

  const estado: EstadoDelCruce = {
    cobros: cobrosDb.map((c) => ({
      id: c.id,
      cuentaId: c.cuentaId,
      cuentaNombre: c.cuenta.client.name,
      periodo: c.periodo,
      fechaProgramada: c.fechaProgramada.toISOString().slice(0, 10),
      monto: Number(c.monto),
      moneda: c.moneda,
      estado: c.estado,
      fechaEmision: c.fechaEmision ? c.fechaEmision.toISOString().slice(0, 10) : null,
      numeroFactura: c.numeroFactura,
      plataformaFactura: c.plataformaFactura,
      servicioId: c.servicioId,
      servicio: c.servicio.descripcion ?? c.servicio.tipoServicio,
    })),
    facturas: facturasDb.map((f) => ({
      id: f.id,
      odooMoveId: f.odooMoveId,
      numero: f.numero,
      cuentaId: f.cuentaId,
      odooPartnerId: f.odooPartnerId,
      odooPartnerNombre: f.odooPartnerNombre,
      invoiceDate: f.invoiceDate.toISOString().slice(0, 10),
      montoNeto: Number(f.montoNeto),
      montoTotal: Number(f.montoTotal),
      montoResidual: Number(f.montoResidual),
      montoImpuesto: Number(f.montoImpuesto),
      moneda: f.moneda,
      moveType: f.moveType,
      paymentState: f.paymentState,
      state: f.state,
    })),
    liberaciones: liberadasDb.map(liberacionParaCruzar),
    cuentas: cuentasDb.map((c) => ({
      id: c.id,
      nombre: c.client.name,
      tipo: c.tipo,
      viaCobro: c.viaCobro,
    })),
    libro,
    servicios,
    cuentasSinVinculo,
    cuentasTotales,
    cuentasVinculadas,
    ultimaCorridaOk: espejoAl,
    marcas: marcasDb.map((m) => ({ ...m, marcadaEn: m.marcadaEn.toISOString() })),
  };
  const documentos = contarDocumentos(facturasDb);

  return {
    estado,
    medido: {
      cobros: cobrosDb.length,
      facturas: documentos.facturas,
      otrosDocumentos: documentos.otros,
      cuentasSinVinculo,
      cuentasTotales,
      espejoAl,
    },
  };
}

/**
 * Cerrar a mano una factura soltada. Es el único cierre posible para MERCURY y OTRA: no hay
 * espejo que las vea, así que la evidencia es que una persona lo dice y firma.
 *
 * ⛔ Se rechaza sobre una liberación de ODOO **que tenga número de documento**. Ahí la cierra el
 * sync cuando ve el documento anulado; permitir el cierre a mano sería permitir esconder una
 * factura que sigue emitida — exactamente lo que esta lista existe para no dejar pasar.
 *
 * ⚠ Pero SIN número el sync no tiene contra qué compararla, así que esa misma regla la dejaba
 * abierta para siempre: sin cierre automático, sin botón y fuera de INV28. Esas sí las cierra
 * una persona. La asimetría es el punto: se pide a mano exactamente donde no hay nada que
 * verifique, y solo ahí.
 *
 * «Con número» es `numeroVerificableEnOdoo`, la misma regla que decide si se cierra sola: un número
 * de transferencia (666471587) no lo va a ver nunca el sync, así que cuenta como sin número.
 *
 * ⚠ Desde el 2026-09-25 pide MOTIVO (`nota`, obligatoria) y deja su marca: se ve en «Marcadas» con quién, cuándo y
 * por qué, y se deshace (`reabrirLiberacion`). Hasta ese día la pantalla no lo pedía: 4 facturas se cerraron sin
 * que nadie pudiera saber después por qué, ni volver a abrirlas.
 */
export async function resolverLiberacion(input: OdooResolverLiberacion, actor: string): Promise<void> {
  const l = await prisma.facturaLiberada.findUnique({
    where: { id: input.liberacionId },
    select: {
      id: true,
      plataforma: true,
      resueltaEn: true,
      motivo: true,
      referenciaExterna: true,
      clienteNombre: true,
      monto: true,
      moneda: true,
      decision: true,
      numCuota: true,
    },
  });
  if (!l) throw new EmparejadoError("Esa liberación ya no existe.", 404);
  if (l.plataforma === "ODOO" && numeroVerificableEnOdoo(l.referenciaExterna)) {
    throw new EmparejadoError(
      "Esta factura es de Odoo y tiene número: el sync la cierra solo cuando vea el documento anulado. No hace falta marcarla.",
      409,
    );
  }
  if (l.resueltaEn) throw new EmparejadoError("Esa liberación ya estaba resuelta.", 409);

  const cerrada = await prisma.$transaction((tx) =>
    anularLiberacionTx(tx, {
      liberacion: { ...l, monto: Number(l.monto) },
      linea: input.linea,
      nota: input.nota,
      actor,
      en: new Date(),
    }),
  );
  if (!cerrada) throw new EmparejadoError("Esa liberación ya estaba resuelta: recarga la lista.", 409);
}

/**
 * «Deshacer» de «Ya está anulada»: la factura soltada vuelve a la lista. Antes de abrirla se guarda quién y cuándo la
 * había cerrado, con la firma de quien la reabre (`reabrirLiberacionTx`).
 */
export async function reabrirLiberacion(input: OdooReabrirLiberacion, actor: string): Promise<void> {
  const r = await prisma.$transaction((tx) => reabrirLiberacionTx(tx, { liberacionId: input.liberacionId, actor, en: new Date() }));
  if (r === "NO_EXISTE") throw new EmparejadoError("Esa factura soltada ya no existe.", 404);
  if (r === "YA_ESTABA_ABIERTA") throw new EmparejadoError("Esa factura ya estaba en la lista: recarga la página.", 409);
}

/**
 * «Está bien así» sobre una o varias filas de UNA línea, con el mismo motivo (2026-09-25).
 *
 * ⭐ Se compara cada fila con los números que la persona VIO (`decidirMarcas`): la que cambió antes del clic —corrió el
 * sync, alguien anotó un número— no se marca, y se devuelve para avisar; las demás sí. Hasta ese día «Está bien así»
 * era por grupo y guardaba la huella que recalculaba el servidor al hacer clic: con un sync en el medio se aceptaba
 * otra cosa sin aviso.
 *
 * ⛔ No toca ningún cobro ni nada de Odoo: solo saca la fila de la lista.
 */
export async function marcarFilas(
  input: OdooMarcarFilas,
  actor: string,
): Promise<{ marcadas: number; cambiaron: Array<{ clave: string; texto: string | null }>; yaMarcadas: number }> {
  const { estado } = await cargarEstadoDelCruce();
  const linea = detectarDiferenciasOdoo(estado).find((l) => l.codigo === input.linea);
  const d = decidirMarcas(linea, input.filas, estado.marcas);
  if (d.aMarcar.length) {
    await prisma.$transaction((tx) =>
      marcarFilasTx(tx, { linea: input.linea, motivo: input.motivo, actor, en: new Date(), filas: d.aMarcar }),
    );
  }
  return { marcadas: d.aMarcar.length, cambiaron: d.cambiaron, yaMarcadas: d.yaMarcadas.length };
}

/** «Deshacer» de «Está bien así»: la fila vuelve a la lista. No borra la marca: la firma quien la deshace. */
export async function deshacerMarcas(input: OdooDeshacerMarcas, actor: string): Promise<number> {
  const n = await prisma.$transaction((tx) => deshacerMarcasTx(tx, { ids: input.ids, actor, en: new Date() }));
  if (n === 0) throw new EmparejadoError("Esa marca ya estaba deshecha: recarga la lista.", 409);
  return n;
}

/**
 * El motivo que se le propone a esta persona al marcar: el último que usó, y si nunca marcó nada, el último que usó
 * alguien. Uno para «Está bien así» y otro para «Ya está anulada», que dicen cosas distintas.
 */
export async function ultimosMotivos(actor: string): Promise<{ bienAsi: string | null; anulada: string | null }> {
  const ultimo = async (tipo: string) => {
    const buscar = (marcadaPor?: string) =>
      prisma.diferenciaOdooMarca.findFirst({
        where: { tipo, deshechaEn: null, ...(marcadaPor ? { marcadaPor } : {}) },
        orderBy: [{ marcadaEn: "desc" }, { id: "desc" }],
        select: { motivo: true },
      });
    return ((await buscar(actor)) ?? (await buscar()))?.motivo ?? null;
  };
  const [bienAsi, anulada] = await Promise.all([ultimo(MARCA_BIEN_ASI), ultimo(MARCA_ANULADA)]);
  return { bienAsi, anulada };
}

/* ── 5. Elegir la factura al marcar facturado ───────────────────────────────────── */

/**
 * Los documentos del espejo que se le ofrecen a un cobro al marcarlo facturado (etapa 7). Solo LEE:
 * elegir uno es mandar su número al chokepoint del cobro, que es el que firma. La regla de qué entra
 * y en qué orden es `candidatasParaElCobro` (candidatas.ts, pura).
 *
 * ⚠ Por los clientes de Odoo VINCULADOS a la cuenta, no por `FacturaOdoo.cuentaId`: la atribución
 * puede ir un paso atrás del vínculo, y un documento que existe no puede faltar de la lista por eso.
 * ⛔ No llama al ERP: sale del espejo, igual que el emparejado (el bloqueo del 2026-09-02).
 *
 * null = el cobro no existe.
 */
export async function candidatasParaCobro(cobroId: string): Promise<CandidatasDeCobro | null> {
  const cobro = await prisma.cobro.findUnique({
    where: { id: cobroId },
    select: {
      cuentaId: true,
      monto: true,
      moneda: true,
      fechaProgramada: true,
      numeroFactura: true,
      plataformaFactura: true,
      sociedadFacturadaId: true,
      cuenta: { select: { viaCobro: true } },
    },
  });
  if (!cobro) return null;
  const via = cobro.cuenta.viaCobro;

  /* Etapa 12: las sociedades que le facturan a la cuenta, de todas las plataformas. El diálogo pregunta a
     cuál se le facturó; no la elige él ni esta función. */
  const sociedadesDb = await prisma.odooPartnerVinculo.findMany({
    where: { cuentaId: cobro.cuentaId },
    select: { id: true, plataforma: true, odooPartnerNombre: true, odooPartnerId: true },
    orderBy: { odooPartnerNombre: "asc" },
  });
  const base = {
    via,
    sociedades: sociedadesDb.map((s) => ({ id: s.id, plataforma: s.plataforma, nombre: s.odooPartnerNombre })),
    plataformaFactura: cobro.plataformaFactura,
    sociedadFacturadaId: cobro.sociedadFacturadaId,
  };
  /* Mercury y QuickBooks no tienen espejo: ahí el número se teclea. */
  if (via !== "ODOO") return { ...base, clientesDeOdoo: 0, candidatas: [], espejoAl: null };

  const vinculos = sociedadesDb.filter(conFicha);
  const corridaOk = await ultimaCorridaOk();
  const espejoAl = corridaOk ? corridaOk.toISOString().slice(0, 10) : null;
  if (!vinculos.length) return { ...base, clientesDeOdoo: 0, candidatas: [], espejoAl };

  /* `select` explícito: una columna nueva del espejo no tumba el diálogo si el código llega antes que su SQL. */
  const facturas = await prisma.facturaOdoo.findMany({
    where: {
      estadoEspejo: "VIGENTE",
      odooPartnerId: { in: vinculos.map((v) => v.odooPartnerId) },
      moneda: cobro.moneda,
    },
    select: {
      odooMoveId: true,
      numero: true,
      odooPartnerId: true,
      odooPartnerNombre: true,
      invoiceDate: true,
      montoNeto: true,
      moneda: true,
      moveType: true,
      state: true,
      paymentState: true,
    },
  });
  const tomados = facturas.length
    ? await prisma.cobro.findMany({
        where: { id: { not: cobroId }, numeroFactura: { in: facturas.map((f) => f.numero) } },
        select: { numeroFactura: true },
      })
    : [];

  /* Elegir un documento es elegir su cliente de Odoo: cada candidata dice de qué sociedad de la cuenta es. */
  const sociedadDelPartner = new Map(vinculos.map((v) => [v.odooPartnerId, v.id]));
  const partnerDelNumero = new Map(facturas.map((f) => [f.numero, f.odooPartnerId]));
  const sociedadDe = (numero: string): string | null => {
    const partner = partnerDelNumero.get(numero);
    return partner === undefined ? null : (sociedadDelPartner.get(partner) ?? null);
  };

  return {
    ...base,
    clientesDeOdoo: vinculos.length,
    candidatas: candidatasParaElCobro(
      facturas.map((f) => ({ ...f, invoiceDate: f.invoiceDate.toISOString().slice(0, 10), montoNeto: Number(f.montoNeto) })),
      {
        monto: Number(cobro.monto),
        moneda: cobro.moneda,
        fechaProgramada: cobro.fechaProgramada.toISOString().slice(0, 10),
        numeroFactura: cobro.numeroFactura,
      },
      new Set(tomados.flatMap((t) => (t.numeroFactura ? [t.numeroFactura] : []))),
    ).map((c) => ({ ...c, sociedadId: sociedadDe(c.numero) })),
    espejoAl,
  };
}
