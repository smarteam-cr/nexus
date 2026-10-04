/**
 * lib/finanzas/cierre-server.ts — lee y escribe el cierre del mes (rediseño de Finanzas, 2026-10-03, etapa «Cierre del
 * mes»). Server-only. Las reglas (qué bloquea, cómo se ve cada mes) viven en cierre.ts.
 *
 * ⚠ La calidad de cada mes (qué le falta al gasto) sale del MISMO cálculo que el punto de equilibrio: la lista de egresos
 * de `cargarEgresosDelAnio` pasada por `calcularEquilibrio`. Si el cierre la midiera por su cuenta, un mes podría estar
 * «completo» acá y «parcial» allá.
 *
 * ⛔ Lee la planilla (las quincenas y el total del mes): solo para quien supervisa (`guardSupervisionFinanzas` en las
 * rutas, `isCostosRole` en la página).
 */
import "server-only";
import { prisma } from "@/lib/db/prisma";
import { CobranzaError } from "@/lib/cobranza/mutations";
import { crDateParts } from "@/lib/jobs/time";
import { cargarEgresosDelAnio, loadReporteAnual } from "@/lib/cobranza/queries";
import { calcularEquilibrio, type TasaDeMes } from "./equilibrio";
import { textoDeMontos } from "@/lib/cobranza/odoo/diferencias";
import { cargarRevision } from "./revision-server";
import { medirPendientes } from "./pendientes-server";
import { nombreDeQuienRegistra, nombreDeQuienSupervisa } from "./vista-server";
import { EGRESOS_DESDE_NEXUS } from "./gastos";
import {
  confirmadoPorPersona,
  esFaltanteDePlanilla,
  estadoEnElAnio,
  faltanParaCerrar,
  itemsDeCierre,
  type DatosDelMes,
  type EstadoEnElAnio,
  type ItemDeCierre,
  type NumerosDelCierre,
  type PendientesDelEquipo,
} from "./cierre";

export interface CierreDelMesDTO {
  periodo: string;
  /** La tira del año: cómo está cada mes. */
  meses: Array<{ periodo: string; estado: EstadoEnElAnio; texto: string }>;
  items: ItemDeCierre[];
  /** Cuántas líneas que bloquean faltan. */
  faltan: number;
  /** El mes ya terminó: solo un mes terminado se puede cerrar. */
  terminado: boolean;
  cierre: {
    estado: "ABIERTO" | "CERRADO";
    cerradoPor: string | null;
    /** Día de Costa Rica (YYYY-MM-DD). */
    cerradoEn: string | null;
    reabiertoPor: string | null;
    reabiertoEn: string | null;
    motivo: string | null;
  } | null;
  tipoCambio: { crcPorUsd: number; fuente: string; confirmadoPor: string | null; registradoEn: string } | null;
  nombres: { registra: string; supervisa: string };
}

const MES_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const num = (d: unknown) => Number(d);

async function nombrePorEmail(emails: ReadonlyArray<string | null | undefined>): Promise<Map<string, string>> {
  const lista = [...new Set(emails.filter((e): e is string => !!e && e.includes("@")).map((e) => e.toLowerCase()))];
  if (lista.length === 0) return new Map();
  const ms = await prisma.teamMember.findMany({
    where: { email: { in: lista, mode: "insensitive" } },
    select: { email: true, name: true },
  });
  return new Map(ms.map((m) => [m.email.toLowerCase(), m.name.split(" ")[0] || m.email]));
}

/**
 * El cierre de un mes con la tira de su año. `conEquipo`: sumar lo que se muestra y no bloquea (cuotas por facturar,
 * pagos detectados, comisiones, conciliación); lo lee de las mismas fuentes que Pendientes, y es lo más lento.
 */
export async function cargarCierre(periodo: string, hoyISO: string, opciones: { conEquipo?: boolean } = {}): Promise<CierreDelMesDTO> {
  if (!MES_RE.test(periodo)) throw new CobranzaError("El mes no es válido.", 400);
  const anio = Number(periodo.slice(0, 4));
  const periodos = Array.from({ length: 12 }, (_, i) => `${anio}-${String(i + 1).padStart(2, "0")}`);

  const [{ egresos, planillaAcc, calidadDada }, filasTasa, cierres, gastos, revision, registra, supervisa, pendientes] = await Promise.all([
    cargarEgresosDelAnio(anio, hoyISO),
    prisma.tipoCambioMes.findMany({
      where: { periodo: { in: periodos } },
      select: { periodo: true, crcPorUsd: true, fuente: true, registradoPor: true, registradoEn: true },
    }),
    prisma.cierreMes.findMany({ where: { periodo: { in: periodos } } }),
    prisma.gastoPuntual.findMany({
      where: { fecha: { gte: new Date(`${anio}-01-01T00:00:00Z`), lt: new Date(`${anio + 1}-01-01T00:00:00Z`) } },
      select: { fecha: true },
    }),
    cargarRevision(),
    nombreDeQuienRegistra(),
    nombreDeQuienSupervisa(),
    opciones.conEquipo ? medirPendientes(hoyISO, null) : Promise.resolve(null),
  ]);

  /* La calidad de cada mes, con el mismo cálculo que el punto de equilibrio (sin ingresos: no la cambian). */
  const tasas: TasaDeMes[] = filasTasa.map((t) => ({ periodo: t.periodo, crcPorUsd: num(t.crcPorUsd), fuente: t.fuente }));
  const calidad = new Map(calcularEquilibrio(egresos, [], { anio, hoyISO, tasas, calidadDada }).meses.map((m) => [m.periodo, m]));

  const quincenas = new Map<string, Set<number>>();
  for (const p of planillaAcc.values()) {
    if (!quincenas.has(p.periodo)) quincenas.set(p.periodo, new Set());
    quincenas.get(p.periodo)!.add(p.quincena);
  }
  const anotados = new Map<string, number>();
  for (const g of gastos) {
    const p = g.fecha.toISOString().slice(0, 7);
    anotados.set(p, (anotados.get(p) ?? 0) + 1);
  }
  const mesDe = (f: { fecha: string | null; registradoEn: string }) => (f.fecha ?? f.registradoEn).slice(0, 7);
  const porRevisar = new Map<string, number>();
  for (const f of [...revision.pagos, ...revision.gastos]) porRevisar.set(mesDe(f), (porRevisar.get(mesDe(f)) ?? 0) + 1);
  const devueltos = new Map<string, number>();
  for (const f of revision.devueltos) devueltos.set(mesDe(f), (devueltos.get(mesDe(f)) ?? 0) + 1);
  const tasaDe = new Map(filasTasa.map((t) => [t.periodo, t]));
  const cierreDe = new Map(cierres.map((c) => [c.periodo, c]));
  const nombres = { registra, supervisa };

  const datosDe = (p: string): DatosDelMes => {
    const t = tasaDe.get(p);
    return {
      periodo: p,
      quincenas: [...(quincenas.get(p) ?? [])].sort(),
      gastosListos: !!cierreDe.get(p)?.gastosListosPor,
      gastosAnotados: anotados.get(p) ?? 0,
      faltantesDelExcel: p >= EGRESOS_DESDE_NEXUS ? [] : (calidad.get(p)?.faltantes ?? []).filter((f) => !esFaltanteDePlanilla(f)),
      tipoCambio: t ? { crcPorUsd: num(t.crcPorUsd), fuente: t.fuente, confirmadoPor: confirmadoPorPersona(t.registradoPor) } : null,
      porRevisar: porRevisar.get(p) ?? 0,
      devueltos: devueltos.get(p) ?? 0,
    };
  };

  const meses = periodos.map((p) => ({
    periodo: p,
    ...estadoEnElAnio(p, hoyISO, cierreDe.get(p)?.estado === "CERRADO", faltanParaCerrar(itemsDeCierre(datosDe(p), null, nombres))),
  }));

  const equipo: PendientesDelEquipo | null = pendientes
    ? {
        porFacturar: { n: pendientes.porFacturar.n, plata: textoDeMontos(pendientes.porFacturar.montos) },
        pagosDetectados: { n: pendientes.pagosDetectados.n, plata: textoDeMontos(pendientes.pagosDetectados.montos) },
        comisionesVencidas: pendientes.comisionesVencidas,
        conciliacion: pendientes.diferencias + pendientes.decisiones,
      }
    : null;
  const items = itemsDeCierre(datosDe(periodo), equipo, nombres);
  const c = cierreDe.get(periodo);
  const t = tasaDe.get(periodo);
  const firmas = await nombrePorEmail([c?.cerradoPor, c?.reabiertoPor, t?.registradoPor]);
  const nombre = (e: string | null | undefined) => (e ? (firmas.get(e.toLowerCase()) ?? e) : null);

  return {
    periodo,
    meses,
    items,
    faltan: faltanParaCerrar(items).length,
    terminado: periodo < hoyISO.slice(0, 7),
    cierre: c
      ? {
          estado: c.estado === "CERRADO" ? "CERRADO" : "ABIERTO",
          cerradoPor: nombre(c.cerradoPor),
          cerradoEn: c.cerradoEn ? crDateParts(c.cerradoEn).dateKey : null,
          reabiertoPor: nombre(c.reabiertoPor),
          reabiertoEn: c.reabiertoEn ? crDateParts(c.reabiertoEn).dateKey : null,
          motivo: c.motivoReapertura,
        }
      : null,
    tipoCambio: t
      ? {
          crcPorUsd: num(t.crcPorUsd),
          fuente: t.fuente,
          confirmadoPor: nombre(confirmadoPorPersona(t.registradoPor)),
          registradoEn: crDateParts(t.registradoEn).dateKey,
        }
      : null,
    nombres,
  };
}

/**
 * Cerrar un mes: que haya terminado, que no falte nada de lo que bloquea, y guardar los números de este momento (del
 * punto de equilibrio, en dólares) para saber después si cambió.
 */
export async function cerrarMes(periodo: string, actor: string, hoyISO: string): Promise<void> {
  const estado = await cargarCierre(periodo, hoyISO);
  if (!estado.terminado) throw new CobranzaError("El mes todavía no terminó: se cierra cuando termine.", 409);
  if (estado.cierre?.estado === "CERRADO") throw new CobranzaError("El mes ya está cerrado.", 409);
  const faltan = faltanParaCerrar(estado.items);
  if (faltan.length > 0) {
    const enMinuscula = (t: string) => t.charAt(0).toLowerCase() + t.slice(1);
    throw new CobranzaError(`Todavía falta: ${faltan.map((i) => enMinuscula(i.titulo)).join(", ")}.`, 409);
  }
  const reporte = await loadReporteAnual(Number(periodo.slice(0, 4)), hoyISO, { monedaPresentacion: "USD" });
  const fila = reporte.meses.find((m) => m.periodo === periodo);
  if (!fila) throw new CobranzaError("El punto de equilibrio no tiene ese mes.", 409);
  const numeros: NumerosDelCierre = {
    moneda: "USD",
    egresos: fila.egresos,
    facturado: fila.facturado,
    cobrado: fila.cobrado,
    ingresosTotales: fila.ingresosTotales,
  };
  const datos = { estado: "CERRADO", cerradoPor: actor, cerradoEn: new Date(), numeros: { ...numeros } };
  await prisma.cierreMes.upsert({ where: { periodo }, create: { periodo, ...datos }, update: datos });
}

/** Reabrir un mes cerrado, con el motivo. Los números del cierre quedan guardados como estaban. */
export async function reabrirMes(periodo: string, motivo: string, actor: string): Promise<void> {
  const c = await prisma.cierreMes.findUnique({ where: { periodo }, select: { estado: true } });
  if (c?.estado !== "CERRADO") throw new CobranzaError("Ese mes no está cerrado.", 409);
  await prisma.cierreMes.update({
    where: { periodo },
    data: { estado: "ABIERTO", reabiertoPor: actor, reabiertoEn: new Date(), motivoReapertura: motivo.trim() },
  });
}

/**
 * El tipo de cambio del mes: confirmar el que está (queda a nombre de quien confirma) o poner otro, con de dónde sale.
 * No se frena en un mes cerrado: si cambia, el punto de equilibrio lo marca como «cambió después del cierre».
 */
export async function guardarTipoCambio(
  periodo: string,
  actor: string,
  nuevo: { crcPorUsd: number; fuente: string } | null,
): Promise<void> {
  if (!MES_RE.test(periodo)) throw new CobranzaError("El mes no es válido.", 400);
  if (!nuevo) {
    const t = await prisma.tipoCambioMes.findUnique({ where: { periodo }, select: { id: true } });
    if (!t) throw new CobranzaError("Ese mes no tiene tipo de cambio para confirmar: pon uno.", 404);
    await prisma.tipoCambioMes.update({ where: { periodo }, data: { registradoPor: actor, registradoEn: new Date() } });
    return;
  }
  const datos = { crcPorUsd: nuevo.crcPorUsd, fuente: nuevo.fuente.trim(), registradoPor: actor, registradoEn: new Date() };
  await prisma.tipoCambioMes.upsert({ where: { periodo }, create: { periodo, ...datos }, update: datos });
}
