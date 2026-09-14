/**
 * lib/cobranza/odoo/servicio.ts
 *
 * La orquestación del emparejado: Prisma de un lado, el transporte del otro, y en el medio
 * las funciones puras de `emparejado.ts`, que son las que deciden. Server-only.
 *
 * ── QUÉ ESCRIBE Y QUÉ NO ─────────────────────────────────────────────────────────
 * Escribe el catálogo de partners y los vínculos que una persona confirma. De `FacturaOdoo`
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
import { prisma } from "@/lib/db/prisma";
import { atribuirFacturasDelPartner } from "./atribucion";
import { crearTransporteXmlRpc, configDesdeEntorno } from "./transporte-xmlrpc";
import { ODOO_CAMPOS_PARTNER, OdooError, dominioClientes, explicarFallo } from "./transporte";
import { textoOdoo } from "./espejo";
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
import {
  contarDocumentos,
  detectarDiferenciasOdoo,
  huellaDe,
  numeroVerificableEnOdoo,
  type DiferenciaOdoo,
  type EstadoDelCruce,
} from "./diferencias";
import { documentosDelUltimoLibro } from "../libro-alex-server";
import { candidatasParaElCobro, type CandidatasDeCobro } from "./candidatas";
import { ultimaCorridaOk } from "./sync";
import type { OdooVinculoConfirmar, OdooVinculoDesvincular, OdooVinculoIgnorar } from "../schema";

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
    },
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
  const partnersLibres = new Set(guardados.filter((v) => v.cuentaId || v.ignorado).map((v) => v.odooPartnerId));

  /* ⭐ Etapa 12 (H10): las cuentas ya vinculadas SIGUEN en la lista. Hasta el 2026-09-13 salían apenas
     tenían su primer cliente de Odoo, y la segunda ficha de la misma empresa —otra sociedad, o la misma
     cargada dos veces con la cédula tipeada distinta— quedaba inalcanzable, con sus facturas sin dueño.
     Vuelven solo con cédula o nombre exacto (`proponerEmparejados`), y sin montos: su plata ya la
     explica su primer cliente, y contarla haría pasar por única una cifra que no lo es. */
  const cuentas: CuentaNexus[] = cuentasDb.map((c) => ({
    cuentaId: c.id,
    nombre: c.client.name,
    cedulaJuridica: c.cedulaJuridica,
    montos: yaVinculado.has(c.id)
      ? []
      : [...new Map(c.cobros.map((x) => [`${x.moneda}|${Number(x.monto)}`, { monto: Number(x.monto), moneda: x.moneda }])).values()],
  }));

  /* Un partner ya vinculado o ya marcado «no es cliente nuestro» no vuelve a proponerse:
     de otro modo la lista no baja nunca y a la tercera sesión nadie la mira. */
  const candidateables = partnersOdoo.filter((p) => !partnersLibres.has(p.odooPartnerId));

  return {
    propuestas: proponerEmparejados(cuentas, candidateables, montosOdoo, { yaVinculadas: yaVinculado }),
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
  if (!partner) throw new EmparejadoError("Ese cliente de Odoo no está en la lista. Actualizá desde Odoo primero.", 404);

  /* ⛔ Un partner no puede tener dos dueños: el `@unique` de la base lo impide, pero acá se
     explica en vez de reventar con un error de Postgres. */
  if (partner.cuentaId && partner.cuentaId !== input.cuentaId) {
    throw new EmparejadoError("Ese cliente de Odoo ya está vinculado a otra cuenta. Desvinculalo primero.", 409);
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
    throw new EmparejadoError("Ese cliente ya está vinculado a una cuenta. Desvinculalo antes de ignorarlo.", 409);
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
      `${facturados} cobro(s) dicen que se le facturaron a «${partner.odooPartnerNombre}». Cambiales la sociedad en el cronograma de la cuenta antes de desvincularla.`,
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

/** Para la pantalla: qué cuentas de Nexus todavía no tienen partner. */
export async function cuentasSinVinculo(): Promise<Array<{ cuentaId: string; nombre: string; cedula: string | null }>> {
  const [cuentas, vinculos] = await Promise.all([
    prisma.cuentaFinanciera.findMany({
      select: { id: true, cedulaJuridica: true, client: { select: { name: true } } },
      orderBy: { client: { name: "asc" } },
    }),
    prisma.odooPartnerVinculo.findMany({ where: { cuentaId: { not: null }, odooPartnerId: { not: null } }, select: { cuentaId: true } }),
  ]);
  const tomadas = new Set(vinculos.map((v) => v.cuentaId!));
  return cuentas
    .filter((c) => !tomadas.has(c.id))
    .map((c) => ({ cuentaId: c.id, nombre: c.client.name, cedula: soloDigitos(c.cedulaJuridica) || null }));
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
  aceptadas: Array<{ clave: string; motivo: string; aceptadaPor: string; aceptadaEn: string }>;
  medido: MedidoDelCruce;
}> {
  const { estado, aceptadas, medido } = await cargarEstadoDelCruce();
  return {
    inconsistencias: detectarDiferenciasOdoo(estado),
    aceptadas: aceptadas.map((a) => ({
      clave: a.clave,
      motivo: a.motivo,
      aceptadaPor: a.aceptadaPor,
      aceptadaEn: a.aceptadaEn.toISOString(),
    })),
    medido,
  };
}

type MedidoDelCruce = {
  cobros: number;
  /** Facturas vivas de Odoo. */
  facturas: number;
  /** Notas de crédito y documentos anulados o revertidos: «364 facturas» eran 296 facturas y 68 de estos. */
  otrosDocumentos: number;
  cuentasSinVinculo: number;
  cuentasTotales: number;
  /** Día de la última copia buena de Odoo (`YYYY-MM-DD`): el pie de las líneas de Odoo lo dice. */
  espejoAl: string | null;
};

/**
 * Lo que «Lo que no cuadra» cruza, leído de la base. Aparte de `cargarDiferencias` para que una medición de solo
 * lectura pruebe la cobertura (`coberturaDelCruce`) con exactamente lo mismo que ve la pantalla.
 */
export async function cargarEstadoDelCruce(): Promise<{
  estado: EstadoDelCruce;
  aceptadas: Array<{ clave: string; motivo: string; aceptadaPor: string; aceptadaEn: Date }>;
  medido: MedidoDelCruce;
}> {
  const [cobrosDb, facturasDb, cuentasDb, vinculosDb, aceptadasDb, liberadasDb, corridaOk, libro] = await Promise.all([
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
    prisma.diferenciaOdooAceptada.findMany({ orderBy: { aceptadaEn: "desc" } }),
    /* Solo las que siguen abiertas: una resuelta no produce ninguna línea, y traerlas todas
       hacía crecer esta consulta para siempre sin que nada lo usara. La regla de qué es
       «pendiente» sigue viviendo entera en `liberacionesPendientes` —el módulo puro la prueba
       contra el caso «alguien la cerró a mano»—; acá solo se evita traer lo que ya se sabe
       que va a descartar. */
    prisma.facturaLiberada.findMany({ where: { resueltaEn: null }, orderBy: { liberadaEn: "desc" } }),
    ultimaCorridaOk(),
    /* Lo que el Excel de Alexander dice de las cuotas sin número (ACCCSA, facturada por Mercury). Sin lote, vacío. */
    documentosDelUltimoLibro(),
  ]);
  const cuentasVinculadas = new Set(vinculosDb.flatMap((v) => (v.cuentaId ? [v.cuentaId] : [])));
  /* ⚠ Solo las cuentas nacionales que facturan por Odoo: son las únicas que se pueden emparejar. Medido el
     2026-09-13, el «falta emparejar 24 de 51» contaba cuentas de Mercury y cuentas internacionales sin ninguna
     factura en Odoo, que nunca se van a emparejar; esas tienen su propia línea. */
  const emparejables = cuentasDb.filter((c) => c.viaCobro === "ODOO" && c.tipo !== "INTERNACIONAL");
  const cuentasTotales = emparejables.length;
  const cuentasSinVinculo = emparejables.filter((c) => !cuentasVinculadas.has(c.id)).length;
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
    liberaciones: liberadasDb.map((l) => ({
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
    })),
    cuentas: cuentasDb.map((c) => ({
      id: c.id,
      nombre: c.client.name,
      tipo: c.tipo,
      viaCobro: c.viaCobro,
    })),
    libro,
    cuentasSinVinculo,
    cuentasTotales,
    cuentasVinculadas,
    ultimaCorridaOk: espejoAl,
    aceptadas: new Map(aceptadasDb.map((a) => [a.clave, a.huella])),
  };
  const documentos = contarDocumentos(facturasDb);

  return {
    estado,
    aceptadas: aceptadasDb,
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
 */
export async function resolverLiberacion(
  input: { liberacionId: string; nota?: string },
  actor: string,
): Promise<void> {
  const l = await prisma.facturaLiberada.findUnique({
    where: { id: input.liberacionId },
    select: { plataforma: true, resueltaEn: true, motivo: true, referenciaExterna: true },
  });
  if (!l) throw new EmparejadoError("Esa liberación ya no existe.", 404);
  if (l.plataforma === "ODOO" && numeroVerificableEnOdoo(l.referenciaExterna)) {
    throw new EmparejadoError(
      "Esta factura es de Odoo y tiene número: el sync la cierra solo cuando vea el documento anulado. No hace falta marcarla.",
      409,
    );
  }
  if (l.resueltaEn) throw new EmparejadoError("Esa liberación ya estaba resuelta.", 409);

  await prisma.facturaLiberada.update({
    where: { id: input.liberacionId },
    data: {
      resueltaEn: new Date(),
      resueltaPor: actor,
      /* La nota se ACUMULA sobre el motivo original en vez de pisarlo: por qué se soltó y por
         qué se dio por cerrada son dos cosas distintas y las dos importan después. */
      motivo: input.nota ? [l.motivo, `Resuelta: ${input.nota}`].filter(Boolean).join(" · ") : l.motivo,
    },
  });
}

/**
 * «Está bien así». ⚠ Se guarda la HUELLA de los números aceptados, no solo la clave: si el
 * monto cambia, la línea vuelve sola. Una aceptación no puede convertirse en el lugar donde
 * se esconde un problema nuevo.
 */
export async function aceptarDiferencia(
  input: { clave: string; motivo: string },
  actor: string,
): Promise<void> {
  const { inconsistencias } = await cargarDiferencias();
  const inc = inconsistencias.find((i) => i.codigo === input.clave);
  if (!inc) throw new EmparejadoError("Esa diferencia ya no está en la lista.", 404);
  await prisma.diferenciaOdooAceptada.upsert({
    where: { clave: input.clave },
    create: { clave: input.clave, motivo: input.motivo, huella: huellaDe(inc), aceptadaPor: actor },
    update: { motivo: input.motivo, huella: huellaDe(inc), aceptadaPor: actor, aceptadaEn: new Date() },
  });
}

export async function reabrirDiferencia(clave: string): Promise<void> {
  await prisma.diferenciaOdooAceptada.deleteMany({ where: { clave } });
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
