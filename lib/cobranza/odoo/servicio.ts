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
import { ODOO_CAMPOS_PARTNER, OdooError, dominioBuscarFicha, explicarFallo } from "./transporte";
import { copiaRecienHecha, textoOdoo } from "./espejo";
import {
  buscarPartners,
  cedulaAAprender,
  decidirMarcaDeMercury,
  esContactoYNoCliente,
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
  facturasPorCliente,
  numeroVerificableEnOdoo,
  textoDeLiberacion,
  type DiferenciaOdoo,
  type EstadoDelCruce,
  type LiberacionParaCruzar,
  type MontoEnMoneda,
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
import { facturacionPorCliente, type FacturacionDelAnio } from "./facturacion-por-cliente";
import { sincronizarOdoo, ultimaCorrida, ultimaCorridaOk } from "./sync";
import { crDateParts } from "@/lib/jobs/time";
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
  /**
   * Lo que tiene facturado en la copia de Odoo (2026-09-29): la lista de clientes sin cuenta dice con esto cuáles
   * tienen plata en la calle. `facturas: 0` = todavía no se le facturó.
   */
  facturas: number;
  /** Día de su documento más nuevo (`YYYY-MM-DD`); null = sin documentos. */
  ultimaFactura: string | null;
  /** Lo que Odoo le da por cobrar, sin IVA y por moneda: la misma cifra que «Lo que no cuadra». */
  porCobrar: MontoEnMoneda[];
  /** Cuántas facturas suman eso. */
  facturasPorCobrar: number;
}

/** Lo que devuelve el buscador de «Emparejar»: una ficha de Odoo, y si ya es de alguna cuenta. */
export interface FichaEncontrada extends PartnerOdoo {
  /** La cuenta de Nexus que ya la tiene vinculada. Elegirla para otra cuenta se rechaza: se dice antes del clic. */
  vinculadaA: string | null;
  /** Documentos en la copia de Odoo. 0 = todavía no se le facturó. */
  facturas: number;
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
   * Todas las cuentas de Nexus (2026-09-29): la fila de un cliente de Odoo sin cuenta ofrece vincularlo a una que ya
   * existe. Hasta ese día el vínculo solo se podía empezar desde la tarjeta de la cuenta.
   */
  cuentas: Array<{ cuentaId: string; nombre: string; via: string }>;
}

/**
 * ⚠⚠ **NUNCA LLAMA AL ERP**. Los clientes salen de la lista guardada y los montos de la copia de
 * facturas: las dos cosas las deja en la base la copia de Odoo (`sincronizarOdoo`).
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
 * Hasta el 2026-09-29 tenía un `refrescar: true` que traía la lista de clientes (y solo eso) con un botón
 * aparte. Ahora la lista viaja con cada copia, y la copia a pedido es `actualizarDesdeOdoo`.
 */
export async function cargarEmparejado(): Promise<EstadoEmparejado> {
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

  /* Todos los documentos vigentes de la copia: dicen qué cliente tiene facturas, cuánto le queda por cobrar
     (`facturasPorCliente`) y, con las facturas propiamente dichas, los montos para proponer. */
  const espejo = await prisma.facturaOdoo.findMany({
    where: { estadoEspejo: "VIGENTE" },
    select: {
      odooPartnerId: true,
      invoiceDate: true,
      montoNeto: true,
      montoTotal: true,
      montoResidual: true,
      moneda: true,
      moveType: true,
      paymentState: true,
      state: true,
    },
  });
  const deCliente = facturasPorCliente(
    espejo.map((f) => ({
      ...f,
      invoiceDate: f.invoiceDate.toISOString().slice(0, 10),
      montoNeto: Number(f.montoNeto),
      montoTotal: Number(f.montoTotal),
      montoResidual: Number(f.montoResidual),
    })),
  );
  /* Los montos para proponer salen de la copia, no del ERP. Solo las facturas propiamente
     dichas: una nota de crédito por el mismo monto que un cobro apuntaría al partner correcto
     por la razón equivocada. */
  const facturasDeVenta = espejo.filter((f) => f.moveType === "out_invoice");
  const montosOdoo: MontoDeOdoo[] = facturasDeVenta.map((f) => ({
    odooPartnerId: f.odooPartnerId,
    montoNeto: Number(f.montoNeto),
    moneda: f.moneda,
  }));
  const facturasLeidas = facturasDeVenta.length;

  /* ⚠ Solo las fichas de Odoo: desde la etapa 12 la tabla guarda también las sociedades de Mercury y
     QuickBooks, que no son clientes de Odoo y no se emparejan. Con `select` explícito, así una columna
     nueva no tumba el emparejado.
     ⚠ Y sin los contactos de correo (2026-09-29): 4 fichas que Odoo creó al mandar una factura a un «correo 2»
     entraron a la lista como si fueran empresas. La copia ya no las trae (`cambiosDeLaLista`), y las que entraron
     antes se dejan de mostrar acá, sin borrar nada. La que alguien vinculó a una cuenta se sigue viendo: hay que
     poder desvincularla. */
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
  )
    .filter(conFicha)
    .filter(
      (v) =>
        v.cuentaId !== null ||
        !esContactoYNoCliente({ nombre: v.odooPartnerNombre, vat: v.odooVat }, deCliente.has(v.odooPartnerId)),
    );

  const partnersOdoo: PartnerOdoo[] = guardados.map((v) => ({
    odooPartnerId: v.odooPartnerId,
    nombre: v.odooPartnerNombre,
    vat: v.odooVat,
    customerRank: 1,
  }));

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
      facturas: deCliente.get(v.odooPartnerId)?.documentos ?? 0,
      ultimaFactura: deCliente.get(v.odooPartnerId)?.ultima ?? null,
      porCobrar: deCliente.get(v.odooPartnerId)?.porCobrar ?? [],
      facturasPorCobrar: deCliente.get(v.odooPartnerId)?.facturasPorCobrar ?? 0,
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
    cuentas: cuentasDb.map((c) => ({ cuentaId: c.id, nombre: c.client.name, via: c.viaCobro })),
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

/* ── 1 bis. Traer lo último de Odoo, a pedido ───────────────────────────────────── */

/** Cuánto espera cada respuesta de Odoo la copia que pide una persona: corto, para que el botón no quede colgado. */
const ESPERA_A_PEDIDO_MS = 15_000;

export type EstadoDeActualizar = "COPIADO" | "RECIENTE" | "EN_CURSO" | "FALLO";

export interface ResultadoDeActualizar {
  estado: EstadoDeActualizar;
  /** Lo que se le dice a quien apretó el botón, tal cual. */
  mensaje: string;
  /** La línea de arriba de las pestañas, ya actualizada. */
  corrida: Awaited<ReturnType<typeof ultimaCorrida>>;
  /** Documentos vigentes en la copia, para esa misma línea. */
  facturas: number;
}

const plural = (n: number, uno: string, varios: string) => (n === 1 ? `1 ${uno}` : `${n} ${varios}`);

/**
 * «Actualizar desde Odoo» (2026-09-29): vuelve a copiar las facturas y la lista de clientes AHORA, sin esperar la
 * copia de la mañana. Lo pidió Alex: registraba un pago en Odoo y «Lo que no cuadra» lo seguía acusando hasta el día
 * siguiente, y un cliente recién creado en Odoo no aparecía para emparejar.
 *
 * Es la misma copia de todas las mañanas (`sincronizarOdoo`), con el mismo candado —no corren dos a la vez— y firmada
 * por quien la pidió. ⛔ Solo lee Odoo, y no toca ningún cobro: la fila de un cobro sale de la lista porque la copia
 * nueva dice que su factura está pagada, no porque esto lo marque.
 *
 * ⚠ Con una copia de hace segundos no se vuelve a leer (`copiaRecienHecha`): en una reunión lo aprietan varias
 * personas, acá y en el punto de equilibrio. La pantalla se recarga igual.
 * ⚠ Nunca lanza por un fallo de Odoo: lo devuelve como texto, con la línea de arriba diciendo qué pasó.
 */
export async function actualizarDesdeOdoo(actor: string, ahora: Date = new Date()): Promise<ResultadoDeActualizar> {
  let estado: EstadoDeActualizar;
  let mensaje: string;
  const ultimaOk = await ultimaCorridaOk();
  if (copiaRecienHecha(ultimaOk, ahora)) {
    estado = "RECIENTE";
    mensaje =
      "La copia de Odoo es de hace unos segundos: no se volvió a leer. Si acabas de registrar algo en Odoo, espera medio minuto y actualiza otra vez.";
  } else {
    const r = await sincronizarOdoo({ disparadaPor: actor, esperaMs: ESPERA_A_PEDIDO_MS });
    if (r.enCurso) {
      estado = "EN_CURSO";
      mensaje = "Ya hay una copia de Odoo en curso, pedida por otra persona o la de la mañana. Espera unos segundos y actualiza otra vez.";
    } else if (!r.ok) {
      estado = "FALLO";
      mensaje = `No se pudo leer Odoo: ${r.error ?? "sin detalle"} Lo que ves es la copia anterior.`;
    } else {
      estado = "COPIADO";
      const cambios = [
        r.creadas > 0 ? plural(r.creadas, "factura nueva", "facturas nuevas") : null,
        r.actualizadas > 0 ? plural(r.actualizadas, "con cambios", "con cambios") : null,
        r.desaparecidas > 0 ? plural(r.desaparecidas, "que Odoo ya no tiene", "que Odoo ya no tiene") : null,
        r.clientesNuevos > 0 ? plural(r.clientesNuevos, "cliente nuevo para emparejar", "clientes nuevos para emparejar") : null,
      ].filter((x): x is string => x !== null);
      mensaje = cambios.length
        ? `Listo: Nexus leyó las ${r.facturasVistas} facturas de Odoo ahora. ${cambios.join(" · ")}.`
        : `Listo: Nexus leyó las ${r.facturasVistas} facturas de Odoo ahora y no cambió nada desde la copia anterior.`;
    }
  }
  const [corrida, facturas] = await Promise.all([
    ultimaCorrida(ahora),
    prisma.facturaOdoo.count({ where: { estadoEspejo: "VIGENTE" } }),
  ]);
  return { estado, mensaje, corrida, facturas };
}

/* ── 2. Buscar ──────────────────────────────────────────────────────────────────── */

/** Cuántas fichas devuelve el buscador, como mucho. */
const LIMITE_DEL_BUSCADOR = 25;

const textoDelFalloDeOdoo = (e: unknown) =>
  e instanceof OdooError ? `${explicarFallo(e.clase)} (${e.message})` : e instanceof Error ? e.message : String(e);

/**
 * El buscador de «Emparejar». Por defecto busca en la lista guardada —una consulta por tecla al ERP sería gratis de
 * escribir y cara de sostener—, que desde el 2026-09-29 se actualiza con cada copia de Odoo.
 *
 * `enOdoo: true` busca directamente en el ERP, y lo dispara una persona con un botón: encuentra también la empresa
 * que Odoo todavía no marca como cliente porque nunca se le facturó (`dominioBuscarFicha`). Elegir una de esas la
 * agrega a la lista en el momento (`confirmarVinculo`).
 *
 * Cada ficha dice si ya es de una cuenta: hasta ese día se podía elegir un cliente de otra cuenta y recién ahí
 * aparecía el rechazo.
 */
export async function buscarEnOdoo(
  consulta: string,
  opts: { enOdoo?: boolean } = {},
): Promise<{ partners: FichaEncontrada[]; errorOdoo: string | null }> {
  const [guardados, facturas] = await Promise.all([
    prisma.odooPartnerVinculo.findMany({
      where: { odooPartnerId: { not: null } },
      select: {
        odooPartnerId: true,
        odooPartnerNombre: true,
        odooVat: true,
        cuentaId: true,
        cuenta: { select: { client: { select: { name: true } } } },
      },
    }),
    prisma.facturaOdoo.groupBy({ by: ["odooPartnerId"], where: { estadoEspejo: "VIGENTE" }, _count: { _all: true } }),
  ]);
  const facturasDe = new Map(facturas.map((f) => [f.odooPartnerId, f._count._all]));
  const guardada = new Map(guardados.filter(conFicha).map((v) => [v.odooPartnerId, v]));
  const comoFicha = (p: PartnerOdoo): FichaEncontrada => ({
    ...p,
    vinculadaA: guardada.get(p.odooPartnerId)?.cuenta?.client.name ?? null,
    facturas: facturasDe.get(p.odooPartnerId) ?? 0,
  });
  const esCliente = (p: PartnerOdoo) =>
    guardada.get(p.odooPartnerId)?.cuentaId != null || !esContactoYNoCliente(p, facturasDe.has(p.odooPartnerId));

  if (!opts.enOdoo) {
    const deLaLista: PartnerOdoo[] = [...guardada.values()].map((v) => ({
      odooPartnerId: v.odooPartnerId,
      nombre: v.odooPartnerNombre,
      vat: v.odooVat,
      customerRank: 1,
    }));
    return {
      partners: buscarPartners(deLaLista.filter(esCliente), consulta, { limite: LIMITE_DEL_BUSCADOR }).map(comoFicha),
      errorOdoo: null,
    };
  }

  try {
    const t = crearTransporteXmlRpc({ ...configDesdeEntorno(), timeoutMs: ESPERA_A_PEDIDO_MS });
    const crudos = await t.buscarYLeer("res.partner", dominioBuscarFicha(consulta), ODOO_CAMPOS_PARTNER, {
      order: "name asc",
      limit: LIMITE_DEL_BUSCADOR,
    });
    const deOdoo = crudos.flatMap((p): PartnerOdoo[] => {
      const odooPartnerId = Number(p.id);
      const nombre = textoOdoo(p.name);
      if (!Number.isFinite(odooPartnerId) || odooPartnerId <= 0 || !nombre) return [];
      return [{ odooPartnerId, nombre, vat: textoOdoo(p.vat), customerRank: Number(p.customer_rank ?? 0) }];
    });
    return { partners: deOdoo.filter(esCliente).map(comoFicha), errorOdoo: null };
  } catch (e) {
    /* ⛔ No se traga: «Odoo no tiene nada con ese nombre» y «Odoo no contestó» son dos respuestas distintas. */
    return { partners: [], errorOdoo: textoDelFalloDeOdoo(e) };
  }
}

/**
 * Trae UNA ficha de Odoo por su id y la agrega a la lista guardada. La usa `confirmarVinculo` cuando la persona eligió
 * una ficha que el buscador encontró directamente en Odoo y que la lista todavía no tenía.
 */
async function sumarFichaDeOdoo(odooPartnerId: number) {
  let cruda: Record<string, unknown> | undefined;
  try {
    const t = crearTransporteXmlRpc({ ...configDesdeEntorno(), timeoutMs: ESPERA_A_PEDIDO_MS });
    [cruda] = await t.buscarYLeer("res.partner", [["id", "=", odooPartnerId]], ODOO_CAMPOS_PARTNER, { limit: 1 });
  } catch (e) {
    throw new EmparejadoError(`No se pudo traer ese cliente de Odoo: ${textoDelFalloDeOdoo(e)}`, 502);
  }
  const nombre = cruda ? textoOdoo(cruda.name) : null;
  if (!cruda || !nombre) throw new EmparejadoError("Ese cliente ya no está en Odoo. Actualiza desde Odoo y búscalo otra vez.", 404);
  await prisma.odooPartnerVinculo.createMany({
    data: [{ odooPartnerId, odooPartnerNombre: nombre, odooVat: textoOdoo(cruda.vat) }],
    skipDuplicates: true,
  });
  return prisma.odooPartnerVinculo.findUnique({ where: { odooPartnerId } });
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

  /* ⭐ 2026-09-29: si la ficha todavía no está en la lista —la persona la encontró buscando directamente en Odoo,
     porque es un cliente nuevo al que todavía no se le facturó—, se trae y se agrega en el momento. Hasta ese día
     esto era un rechazo («actualiza la lista primero») y un cliente sin facturas no se podía emparejar. */
  const partner =
    (await prisma.odooPartnerVinculo.findUnique({ where: { odooPartnerId: input.odooPartnerId } })) ??
    (await sumarFichaDeOdoo(input.odooPartnerId));
  if (!partner) throw new EmparejadoError("Ese cliente de Odoo no está en la lista. Actualiza desde Odoo y búscalo otra vez.", 404);

  /* ⛔ Un partner no puede tener dos dueños: el `@unique` de la base lo impide, pero acá se
     explica en vez de reventar con un error de Postgres. ⚠ Y se dice CUÁL es la otra cuenta: casi siempre es la misma
     empresa cargada dos veces en Nexus (Librería Internacional y su razón social, 2026-09-29), y «desvincúlalo
     primero» mandaba a romper el historial de la cuenta buena. */
  if (partner.cuentaId && partner.cuentaId !== input.cuentaId) {
    const otra = await prisma.cuentaFinanciera.findUnique({
      where: { id: partner.cuentaId },
      select: { client: { select: { name: true } } },
    });
    throw new EmparejadoError(
      `Ese cliente de Odoo ya es de la cuenta «${otra?.client.name ?? "otra cuenta"}». Un cliente de Odoo va en una sola cuenta: si el servicio nuevo es de esa misma empresa, agrégalo como otro servicio en esa cuenta, sin desvincular nada.`,
      409,
    );
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
      "Esta factura es de Odoo y tiene número: se cierra sola cuando la copia de Odoo vea el documento anulado. No hace falta marcarla.",
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

/* ── 6. Facturación por cliente ─────────────────────────────────────────────────── */

export interface FacturacionPorCliente extends FacturacionDelAnio {
  /** false = quien mira no tiene acceso a Ventas: los tratos ni se leen. */
  conVentas: boolean;
  /** El día de la última copia buena de Odoo: de cuándo son los números. */
  copiaAl: string | null;
}

/**
 * Lo facturado y lo cobrado de cada cliente en un año, de la copia de Odoo, al lado de las ventas cerradas en HubSpot
 * (punto 8 de la revisión con Alex, 2026-09-30). La regla es `facturacionPorCliente` (pura). ⛔ No llama al ERP: sale de
 * la copia, igual que «Emparejar». Sin `anio`, el año anterior al de hoy en Costa Rica: el último año completo.
 */
export async function cargarFacturacionPorCliente(opts: {
  anio?: number | null;
  /** El permiso de Ventas de quien mira: lo decide la ruta. */
  conVentas: boolean;
  ahora?: Date;
}): Promise<FacturacionPorCliente> {
  const anio = opts.anio ?? Number(crDateParts(opts.ahora ?? new Date()).dateKey.slice(0, 4)) - 1;
  const dia = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
  /* `select` explícito: una columna nueva no tumba la vista si el código llega antes que su SQL. */
  const [documentos, cuentas, ventas, corridaOk] = await Promise.all([
    prisma.facturaOdoo.findMany({
      where: { estadoEspejo: "VIGENTE" },
      select: {
        numero: true,
        moveType: true,
        state: true,
        paymentState: true,
        invoiceDate: true,
        montoNeto: true,
        montoTotal: true,
        montoResidual: true,
        moneda: true,
        odooPartnerId: true,
        odooPartnerNombre: true,
        cuentaId: true,
      },
    }),
    prisma.cuentaFinanciera.findMany({ select: { id: true, clientId: true, viaCobro: true, client: { select: { name: true } } } }),
    opts.conVentas
      ? prisma.ventaGanada.findMany({
          where: { fechaCierre: { gte: dia(`${anio}-01-01`), lt: dia(`${anio + 1}-01-01`) } },
          select: {
            clientId: true,
            fechaCierre: true,
            monto: true,
            moneda: true,
            estado: true,
            excluida: true,
            pipelineId: true,
            client: { select: { name: true } },
          },
        })
      : Promise.resolve([]),
    ultimaCorridaOk(),
  ]);
  const r = facturacionPorCliente(
    documentos.map((d) => ({
      ...d,
      invoiceDate: d.invoiceDate.toISOString().slice(0, 10),
      montoNeto: Number(d.montoNeto),
      montoTotal: Number(d.montoTotal),
      montoResidual: Number(d.montoResidual),
    })),
    cuentas.map((c) => ({ cuentaId: c.id, clientId: c.clientId, nombre: c.client.name, viaCobro: c.viaCobro })),
    ventas.map((v) => ({
      clientId: v.clientId,
      clienteNombre: v.client?.name ?? null,
      fechaCierre: v.fechaCierre.toISOString().slice(0, 10),
      monto: v.monto === null ? null : Number(v.monto),
      moneda: v.moneda,
      estado: v.estado,
      excluida: v.excluida,
      pipelineId: v.pipelineId,
    })),
    anio,
  );
  const copiaAl = corridaOk ? corridaOk.toISOString().slice(0, 10) : null;
  if (opts.conVentas) return { ...r, conVentas: true, copiaAl };
  /* Sin permiso de Ventas, ni un número de ventas viaja: «0 tratos» diría algo que no se miró. */
  return {
    ...r,
    filas: r.filas.map((f) => ({ ...f, ventas: null })),
    totales: { ...r.totales, ventas: { tratos: 0, sinMonto: 0, montos: [] } },
    ventasSinFacturas: [],
    conVentas: false,
    copiaAl,
  };
}
