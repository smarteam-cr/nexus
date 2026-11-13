/**
 * lib/finanzas/metas-de-gerencia-server.ts — lee las metas de gerencia y su avance, y las escribe. SERVER-ONLY.
 * SOLO DIRECCIÓN: lo llaman la página Finanzas › Metas y bonos y las rutas /api/cobranza/costos/goals
 * (guardCostosAccess). La cuenta vive en lib/finanzas/metas-de-gerencia.ts (puro, con pruebas).
 *
 * Cada fuente se lee UNA vez por carga, solo si alguna meta la usa:
 *  · HubSpot Partner (`ClientPartnerSnapshot`): la última copia, con la misma regla que la comisión de HubSpot
 *    (lib/cobranza/comision-hubspot-server.ts): un registro cuenta si vino en los 2 días antes de la última copia.
 *  · Las metas del plan de partner de HubSpot: por `tramosDelPlanDePartner` (lib/ventas/metas.ts, la única puerta de
 *    `MetaComercial`).
 *  · Cobranza: los cobros del mes de los servicios recurrentes activos.
 *  · Los negocios ganados (`VentaGanada`) de los pipelines de venta propia.
 */
import "server-only";
import { prisma } from "@/lib/db/prisma";
import { esquemaDesactualizado, modeloDisponible } from "@/lib/db/esquema";
import { CobranzaError } from "@/lib/cobranza/mutations";
import { PIPELINES_VENTA_PROPIA } from "@/lib/ventas/pipelines";
import { tramosDelPlanDePartner } from "@/lib/ventas/metas";
import {
  DEFINICION_DE_MEDIDA,
  comisionMensualDeHubspot,
  estadoDeLaMeta,
  leerAvanceManual,
  leerMrrGestionado,
  leerMrrVendidoNuevo,
  leerPlanDePartner,
  leerServiciosRecurrentes,
  leerVentasGanadas,
  medidaDe,
  type CuentaDePartner,
  type DefinicionDeMedida,
  type EstadoDeLaMeta,
  type Lectura,
  type Medida,
} from "./metas-de-gerencia";
import type { MetaDeGerenciaInput } from "./metas-de-gerencia-esquema";

/** La misma ventana que usa la comisión de HubSpot: lo que HubSpot ya no devuelve no se suma. */
const VENTANA_DE_LA_ULTIMA_COPIA_MS = 2 * 86_400_000;

const dia = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);
const aFecha = (iso: string | null) => (iso ? new Date(`${iso}T00:00:00.000Z`) : null);
const num = (d: { toString(): string } | null) => (d === null ? null : Number(d));

export interface MetaDeGerenciaDTO {
  id: string;
  nombre: string;
  medida: Medida;
  definicion: DefinicionDeMedida;
  objetivoUsd: number | null;
  desde: string | null;
  hasta: string | null;
  corteEn: string | null;
  premio: string | null;
  paraQuien: string | null;
  avanceManualUsd: number | null;
  avanceManualAl: string | null;
  nota: string | null;
  actualizadaPor: string;
  actualizadaEn: string;
  lectura: Lectura;
  estado: EstadoDeLaMeta;
}

export interface MetasDeGerencia {
  /** null = falta aplicar el SQL (la página lo dice). */
  metas: MetaDeGerenciaDTO[] | null;
  /** Contexto del nivel de partner: la comisión que HubSpot proyecta hoy, al mes. */
  comisionMensualHubspot: number | null;
  ultimaCopiaPartner: string | null;
  hoy: string;
}

async function leerFilas() {
  if (!modeloDisponible(prisma.metaDeGerencia)) return null;
  try {
    return await prisma.metaDeGerencia.findMany({ where: { archivada: false }, orderBy: { createdAt: "asc" } });
  } catch (e) {
    if (esquemaDesactualizado(e)) return null;
    throw e;
  }
}

async function cuentasDePartner(): Promise<{ cuentas: CuentaDePartner[]; ultimaCopia: string | null }> {
  const max = await prisma.clientPartnerSnapshot.aggregate({ _max: { fetchedAt: true } });
  const ultima = max._max.fetchedAt ?? null;
  if (!ultima) return { cuentas: [], ultimaCopia: null };
  const filas = await prisma.clientPartnerSnapshot.findMany({
    where: { fetchedAt: { gte: new Date(ultima.getTime() - VENTANA_DE_LA_ULTIMA_COPIA_MS) } },
    select: { isManaged: true, mrrManaged: true, soldMrr: true, soldRelationshipStartAt: true, projectedCommission: true },
  });
  return {
    ultimaCopia: dia(ultima),
    cuentas: filas.map((f) => ({
      gestionada: f.isManaged,
      mrrGestionado: f.mrrManaged,
      mrrVendido: f.soldMrr,
      ventaDesde: dia(f.soldRelationshipStartAt),
      comisionMensual: f.projectedCommission,
    })),
  };
}

/** Los servicios recurrentes activos con sus cobros del mes de `hoy` (lib/finanzas/metas-de-gerencia.ts dice por qué cobros). */
async function serviciosRecurrentes(hoy: string) {
  const filas = await prisma.servicioContratado.findMany({
    where: { modalidad: "RECURRENTE", estado: "ACTIVO" },
    select: { cobros: { where: { periodo: hoy.slice(0, 7) }, select: { monto: true, moneda: true } } },
  });
  return filas.map((s) => ({ cobrosDelMes: s.cobros.map((c) => ({ monto: Number(c.monto), moneda: c.moneda })) }));
}

async function ventasGanadas(desde: string, hasta: string) {
  const [filas, ultima] = await Promise.all([
    prisma.ventaGanada.findMany({
      where: { estado: "GANADA", excluida: false, pipelineId: { in: [...PIPELINES_VENTA_PROPIA] }, fechaCierre: { gte: aFecha(desde)!, lte: aFecha(hasta)! } },
      select: { fechaCierre: true, monto: true, moneda: true },
    }),
    prisma.ventaGanada.aggregate({ _max: { sincronizadoEn: true } }),
  ]);
  return { ventas: filas.map((v) => ({ cierre: dia(v.fechaCierre)!, monto: num(v.monto), moneda: v.moneda })), sincronizado: dia(ultima._max.sincronizadoEn ?? null) };
}

export async function cargarMetasDeGerencia(hoy: string): Promise<MetasDeGerencia> {
  const filas = await leerFilas();
  const partner = await cuentasDePartner();
  const comisionMensualHubspot = partner.ultimaCopia ? comisionMensualDeHubspot(partner.cuentas) : null;
  if (!filas) return { metas: null, comisionMensualHubspot, ultimaCopiaPartner: partner.ultimaCopia, hoy };

  const medidas = new Set(filas.map((f) => medidaDe(f.medida)));
  const servicios = medidas.has("mrr_servicios_recurrentes") ? await serviciosRecurrentes(hoy) : [];

  const metas: MetaDeGerenciaDTO[] = [];
  for (const f of filas) {
    const medida = medidaDe(f.medida);
    const definicion = DEFINICION_DE_MEDIDA[medida];
    const desde = dia(f.desde);
    const hasta = dia(f.hasta);
    const avanceManualUsd = num(f.avanceManualUsd);
    const avanceManualAl = dia(f.avanceManualAl);
    const sinPeriodo: Lectura = { valor: null, al: null, detalle: [], aviso: "Esta medida suma dentro de un período: falta escribir desde y hasta." };
    let lectura: Lectura;
    switch (medida) {
      case "mrr_gestionado_partner":
        lectura = leerMrrGestionado(partner.cuentas, partner.ultimaCopia);
        break;
      case "mrr_vendido_nuevo_partner":
        lectura = desde && hasta ? leerMrrVendidoNuevo(partner.cuentas, partner.ultimaCopia, desde, hasta) : sinPeriodo;
        break;
      case "mrr_negocios_partner": {
        if (!desde || !hasta) {
          lectura = sinPeriodo;
          break;
        }
        const plan = await tramosDelPlanDePartner(desde, hasta);
        lectura = leerPlanDePartner(plan.tramos, dia(plan.sincronizadoEn), desde, hasta);
        break;
      }
      case "mrr_servicios_recurrentes":
        lectura = leerServiciosRecurrentes(servicios, hoy);
        break;
      case "ventas_ganadas": {
        if (!desde || !hasta) {
          lectura = sinPeriodo;
          break;
        }
        const v = await ventasGanadas(desde, hasta);
        lectura = leerVentasGanadas(v.ventas, v.sincronizado, desde, hasta);
        break;
      }
      case "manual":
        lectura = leerAvanceManual(avanceManualUsd, avanceManualAl);
        break;
    }
    const objetivoUsd = num(f.objetivoUsd);
    const corteEn = dia(f.corteEn);
    metas.push({
      id: f.id,
      nombre: f.nombre,
      medida,
      definicion,
      objetivoUsd,
      desde,
      hasta,
      corteEn,
      premio: f.premio,
      paraQuien: f.paraQuien,
      avanceManualUsd,
      avanceManualAl,
      nota: f.nota,
      actualizadaPor: f.actualizadaPor,
      actualizadaEn: f.updatedAt.toISOString(),
      lectura,
      estado: estadoDeLaMeta({ objetivoUsd, forma: definicion.forma, desde, hasta, corteEn }, lectura.valor, hoy),
    });
  }
  return { metas, comisionMensualHubspot, ultimaCopiaPartner: partner.ultimaCopia, hoy };
}

function datos(m: MetaDeGerenciaInput) {
  return {
    nombre: m.nombre,
    medida: m.medida,
    objetivoUsd: m.objetivoUsd,
    desde: aFecha(m.desde),
    hasta: aFecha(m.hasta),
    corteEn: aFecha(m.corteEn),
    premio: m.premio,
    paraQuien: m.paraQuien,
    // El avance a mano solo vive en una meta «a mano»: en otra medida no lo lee nadie y confundiría.
    avanceManualUsd: m.medida === "manual" ? m.avanceManualUsd : null,
    avanceManualAl: m.medida === "manual" ? aFecha(m.avanceManualAl) : null,
    nota: m.nota,
  };
}

function exigirTabla() {
  if (!modeloDisponible(prisma.metaDeGerencia)) throw new CobranzaError("Falta aplicar el SQL de las metas (2026-11-13-metas-de-gerencia.sql).", 503);
}

export async function crearMetaDeGerencia(m: MetaDeGerenciaInput, por: string): Promise<string> {
  exigirTabla();
  const fila = await prisma.metaDeGerencia.create({ data: { ...datos(m), creadaPor: por, actualizadaPor: por }, select: { id: true } });
  return fila.id;
}

export async function actualizarMetaDeGerencia(id: string, m: MetaDeGerenciaInput, por: string): Promise<void> {
  exigirTabla();
  const r = await prisma.metaDeGerencia.updateMany({ where: { id, archivada: false }, data: { ...datos(m), actualizadaPor: por } });
  if (r.count === 0) throw new CobranzaError("Esa meta ya no está.", 404);
}

/** Quitar la meta de la pantalla: la fila queda, archivada. */
export async function archivarMetaDeGerencia(id: string, por: string): Promise<void> {
  exigirTabla();
  const r = await prisma.metaDeGerencia.updateMany({ where: { id, archivada: false }, data: { archivada: true, actualizadaPor: por } });
  if (r.count === 0) throw new CobranzaError("Esa meta ya no está.", 404);
}
