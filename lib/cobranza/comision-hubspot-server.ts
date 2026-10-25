/**
 * lib/cobranza/comision-hubspot-server.ts — la parte con base de la comisión de HubSpot desde Partner (U25).
 *
 * La regla es pura y tiene pruebas (`comision-hubspot.ts`). Acá: leer la copia de Partner y la fila del pago, y
 * escribirla. Lo usan el job `comisiones-hubspot-estimado` (lib/jobs/defs.ts), el script
 * `scripts/comisiones-hubspot-estimado.ts` (simulacro, y `--apply` para tomar el estimado escrito a mano) y la
 * pantalla Finanzas › Comisiones de partner. Recibe el cliente de la base por parámetro: el script trae el suyo.
 */
import { Prisma, type PrismaClient } from "@prisma/client";
import { columnasDePartner } from "@/lib/cs/partner-columnas";
import { normalizePartner } from "./schema";
import {
  CLAVE_ALIADO_HUBSPOT,
  DIAS_DE_TOLERANCIA_DE_LA_FECHA,
  comprobarContraElUltimoPago,
  copiaFresca,
  decidirFilaDeHubspot,
  detalleDelEstimado,
  estimarComisionDeHubspot,
  MONEDA_HUBSPOT,
  proximoPagoDeHubspot,
  type Comprobacion,
  type CuentaConComision,
  type DecisionDeLaFila,
  type EstimadoDeHubspot,
  type FilaDeHubspot,
} from "./comision-hubspot";

/** Quién firma lo que escribe el estimado (`registradoPor`). */
export const FIRMA_DEL_ESTIMADO = "nexus:comisiones-hubspot-estimado";

/**
 * Un registro de Partner cuenta si vino en la última copia: los que HubSpot ya no devuelve se quedan en la tabla
 * (desvinculados) con su comisión vieja, y sumarlos inflaría el estimado.
 */
const VENTANA_DE_LA_ULTIMA_COPIA_MS = 2 * 86400000;

const dia = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);
const dayUTC = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

/** Las cuentas de la última copia de Partner, con su comisión. Lee las columnas de U29 y, sin ellas, el crudo. */
export async function cuentasDePartner(db: PrismaClient): Promise<{ cuentas: CuentaConComision[]; ultimaCopia: Date | null }> {
  const max = await db.clientPartnerSnapshot.aggregate({ _max: { fetchedAt: true } });
  const ultimaCopia = max._max.fetchedAt ?? null;
  if (!ultimaCopia) return { cuentas: [], ultimaCopia };
  const filas = await db.clientPartnerSnapshot.findMany({
    where: { fetchedAt: { gte: new Date(ultimaCopia.getTime() - VENTANA_DE_LA_ULTIMA_COPIA_MS) } },
    select: {
      hubspotPartnerClientId: true,
      clientId: true,
      domain: true,
      properties: true,
      isManaged: true,
      isSold: true,
      projectedCommission: true,
      projectedCommissionCurrency: true,
      soldRelationshipStartAt: true,
      client: { select: { name: true } },
    },
  });
  const cuentas = filas.map((f): CuentaConComision => {
    const props = (f.properties ?? {}) as Record<string, unknown>;
    // Antes del backfill las columnas están vacías: se leen del crudo, con la misma función que usa la copia.
    const col =
      f.isSold === null && f.projectedCommission === null
        ? columnasDePartner(props)
        : { projectedCommission: f.projectedCommission, projectedCommissionCurrency: f.projectedCommissionCurrency, isManaged: f.isManaged, soldRelationshipStartAt: f.soldRelationshipStartAt };
    const nombreHs = typeof props.hs_client_name === "string" && props.hs_client_name.trim() ? props.hs_client_name.trim() : null;
    return {
      id: f.hubspotPartnerClientId,
      nombre: f.client?.name ?? nombreHs ?? f.domain ?? `Partner ${f.hubspotPartnerClientId}`,
      clientId: f.clientId,
      comisionMensual: col.projectedCommission,
      moneda: col.projectedCommissionCurrency,
      gestionada: col.isManaged,
      ventaDesde: dia(col.soldRelationshipStartAt),
    };
  });
  return { cuentas, ultimaCopia };
}

/** El aliado HubSpot configurado, si existe. */
async function aliadoHubspot(db: PrismaClient) {
  return db.partnerComercial.findUnique({ where: { clave: CLAVE_ALIADO_HUBSPOT }, select: { id: true, nombre: true } });
}

/** ¿El nombre escrito es HubSpot? Con la misma normalización que agrupa la pantalla, y sin espacios («Hub Spot »). */
export function esNombreDeHubspot(partner: string): boolean {
  return normalizePartner(partner).replace(/ /g, "") === CLAVE_ALIADO_HUBSPOT;
}

/**
 * Las comisiones de HubSpot que cumplen `where`: ligadas al aliado o, sin ligar, con un nombre que es HubSpot. El nombre
 * se compara en memoria: la base no sabe normalizar como `normalizePartner`.
 */
export async function comisionesDeHubspot<S extends Prisma.ComisionPartnerSelect & { partnerId: true; partner: true }>(
  db: PrismaClient,
  aliadoId: string | null,
  where: Prisma.ComisionPartnerWhereInput,
  select: S,
) {
  const candidatas = await db.comisionPartner.findMany({
    where: { AND: [where, aliadoId ? { OR: [{ partnerId: aliadoId }, { partnerId: null }] } : { partnerId: null }] },
    select,
  });
  return candidatas.filter((c) => {
    const f = c as unknown as { partnerId: string | null; partner: string };
    return (aliadoId !== null && f.partnerId === aliadoId) || (f.partnerId === null && esNombreDeHubspot(f.partner));
  });
}

export interface PlanDelEstimado {
  /** null = no hay copia de Partner en esta base, o es vieja: no se arma nada. */
  estimado: EstimadoDeHubspot | null;
  ultimaCopia: Date | null;
  copiaFresca: boolean;
  /** Las cuentas de la última copia (también sin copia fresca: la comprobación las usa igual). */
  cuentas: CuentaConComision[];
  filas: Array<FilaDeHubspot & { fecha: string }>;
  decision: DecisionDeLaFila;
  aliado: { id: string; nombre: string } | null;
}

/** Qué haría el estimado hoy, sin escribir nada. */
export async function planDelEstimado(
  db: PrismaClient,
  hoyISO: string,
  ahora: Date,
  opciones: { tomarLaManual?: boolean } = {},
): Promise<PlanDelEstimado> {
  const pago = proximoPagoDeHubspot(hoyISO);
  const [{ cuentas, ultimaCopia }, aliado] = await Promise.all([cuentasDePartner(db), aliadoHubspot(db)]);
  // Una fila del pago aunque la hayan movido de día (al 13, al 30) o anotado en otra moneda: si no, el job crearía otra.
  const dia0 = dayUTC(pago.fecha).getTime();
  const tolerancia = DIAS_DE_TOLERANCIA_DE_LA_FECHA * 86400000;
  const filasDb = await comisionesDeHubspot(
    db,
    aliado?.id ?? null,
    { fecha: { gte: new Date(dia0 - tolerancia), lte: new Date(dia0 + tolerancia) } },
    { id: true, partnerId: true, partner: true, estado: true, moneda: true, monto: true, montoEsProyeccion: true, montoDesdePartner: true, fecha: true },
  );
  const filas = filasDb.map((f) => ({
    id: f.id,
    estado: f.estado,
    moneda: f.moneda,
    monto: Number(f.monto),
    montoEsProyeccion: f.montoEsProyeccion,
    montoDesdePartner: f.montoDesdePartner,
    fecha: dia(f.fecha)!,
  }));
  const fresca = copiaFresca(ultimaCopia, ahora);
  if (!fresca || cuentas.length === 0) {
    return {
      estimado: null,
      ultimaCopia,
      copiaFresca: fresca,
      cuentas,
      filas,
      aliado,
      decision: {
        accion: "nada",
        motivo: ultimaCopia
          ? `la última copia de Partner es del ${dia(ultimaCopia)}: con datos viejos no se estima`
          : "no hay copia de Partner en esta base",
      },
    };
  }
  const estimado = estimarComisionDeHubspot(cuentas, pago);
  return { estimado, ultimaCopia, copiaFresca: fresca, cuentas, filas, aliado, decision: decidirFilaDeHubspot(filas, estimado, opciones) };
}

/** El resultado de escribir: lo que se escribió (null = nada) y por qué no, si la fila cambió mientras tanto. */
export interface ResultadoDelEstimado {
  plan: PlanDelEstimado;
  /** Lo que se escribió: null = nada. */
  escrito: { accion: "creada" | "actualizada"; id: string; antes: number | null; despues: number } | null;
  /** Por qué no se escribió lo que el plan decía (la fila cambió mientras tanto). */
  aviso: string | null;
}

/** Arma el estimado y, si el plan lo decide, escribe la fila. Idempotente. */
export async function aplicarEstimado(
  db: PrismaClient,
  hoyISO: string,
  ahora: Date,
  opciones: { tomarLaManual?: boolean } = {},
): Promise<ResultadoDelEstimado> {
  return escribirEstimado(db, await planDelEstimado(db, hoyISO, ahora, opciones), ahora);
}

/**
 * Escribe lo que decidió un plan. Separada de `aplicarEstimado` para poder probar la guarda: entre el plan y la
 * escritura alguien puede pasar la fila a real, cobrarla o cambiarle el monto, y entonces no se escribe.
 */
export async function escribirEstimado(db: PrismaClient, plan: PlanDelEstimado, ahora: Date): Promise<ResultadoDelEstimado> {
  const { estimado, decision } = plan;
  if (!estimado || decision.accion === "nada") return { plan, escrito: null, aviso: null };
  const detalle = detalleDelEstimado(estimado, ahora) as unknown as Prisma.InputJsonValue;

  if (decision.accion === "crear") {
    const creada = await db.comisionPartner.create({
      data: {
        partner: plan.aliado?.nombre ?? "HubSpot",
        partnerId: plan.aliado?.id ?? null,
        concepto: `Comisión de ${estimado.pago.trimestre}`,
        monto: estimado.total,
        moneda: MONEDA_HUBSPOT,
        fecha: dayUTC(estimado.pago.fecha),
        estado: "POR_COBRAR",
        montoEsProyeccion: true,
        montoDesdePartner: true,
        detalleDePartner: detalle,
        registradoPor: FIRMA_DEL_ESTIMADO,
        notas:
          "Estimada desde HubSpot Partner: la comisión mensual de cada cuenta por los meses del trimestre en que la venta ya existía. " +
          "El monto real sale de la liquidación de HubSpot (Commissions).",
      },
      select: { id: true },
    });
    return { plan, escrito: { accion: "creada", id: creada.id, antes: null, despues: estimado.total }, aviso: null };
  }

  const fila = plan.filas[0];
  // La guarda en el WHERE: si alguien la pasó a real, la cobró o le cambió el monto mientras tanto, no se pisa.
  const r = await db.comisionPartner.updateMany({
    where: {
      id: fila.id,
      estado: "POR_COBRAR",
      montoEsProyeccion: true,
      monto: fila.monto,
      ...(decision.tomaLaManual ? {} : { montoDesdePartner: true }),
    },
    data: { monto: estimado.total, montoDesdePartner: true, detalleDePartner: detalle },
  });
  if (r.count === 0) return { plan, escrito: null, aviso: "la comisión cambió mientras se armaba el estimado: no se tocó" };
  return { plan, escrito: { accion: "actualizada", id: fila.id, antes: fila.monto, despues: estimado.total }, aviso: null };
}

// ── Lo que ve la pantalla ─────────────────────────────────────────────────────────────────────────────────────────

export interface ComisionDeHubspotDTO {
  /** AAAA-MM-DD y «jul–sep 2026». */
  pago: { fecha: string; trimestre: string };
  /** ISO de la última copia de Partner. null = nunca corrió en esta base. */
  ultimaCopia: string | null;
  copiaFresca: boolean;
  /** null sin copia fresca. */
  estimado: {
    mensual: number;
    total: number;
    cuentas: EstimadoDeHubspot["cuentas"];
    otrasMonedas: EstimadoDeHubspot["otrasMonedas"];
  } | null;
  /** La fila de ese pago en la lista, y si la arma Partner. */
  fila: { id: string; monto: number; estado: string; montoEsProyeccion: boolean; montoDesdePartner: boolean } | null;
  /** Qué hace el job con la fila, en palabras. */
  queHace: string;
  comprobacion: Comprobacion | null;
}

/** Lo que muestra Finanzas › Comisiones de partner sobre HubSpot. Solo lecturas. */
export async function cargarComisionDeHubspot(db: PrismaClient, hoyISO: string, ahora: Date): Promise<ComisionDeHubspotDTO> {
  const plan = await planDelEstimado(db, hoyISO, ahora);
  const cobradas = await comisionesDeHubspot(db, plan.aliado?.id ?? null, { estado: "COBRADO" }, {
    partnerId: true, partner: true, fecha: true, monto: true, estado: true, moneda: true,
  });
  const pago = proximoPagoDeHubspot(hoyISO);
  const fila = plan.filas.length === 1 ? plan.filas[0] : null;
  const d = plan.decision;
  const queHace =
    d.accion === "crear"
      ? "Todavía no hay comisión anotada para ese pago: el job la anota estimada."
      : d.accion === "actualizar"
        ? "El monto de la comisión de ese pago se pone al día solo, cada día hábil."
        : `No toca la comisión de ese pago: ${d.motivo}.`;
  return {
    pago: { fecha: pago.fecha, trimestre: pago.trimestre },
    ultimaCopia: plan.ultimaCopia?.toISOString() ?? null,
    copiaFresca: plan.copiaFresca,
    estimado: plan.estimado
      ? { mensual: plan.estimado.mensual, total: plan.estimado.total, cuentas: plan.estimado.cuentas, otrasMonedas: plan.estimado.otrasMonedas }
      : null,
    fila: fila
      ? { id: fila.id, monto: fila.monto, estado: fila.estado, montoEsProyeccion: fila.montoEsProyeccion, montoDesdePartner: fila.montoDesdePartner }
      : null,
    queHace,
    comprobacion: comprobarContraElUltimoPago(
      plan.cuentas,
      cobradas.map((c) => ({ fecha: dia(c.fecha)!, monto: Number(c.monto), estado: c.estado, moneda: c.moneda })),
    ),
  };
}
