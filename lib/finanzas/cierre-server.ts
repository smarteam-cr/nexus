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
import { avisar } from "@/lib/para-ti/avisos-server";
import { CobranzaError } from "@/lib/cobranza/mutations";
import { crDateParts } from "@/lib/jobs/time";
import { cargarEgresosDelAnio, loadReporteAnual } from "@/lib/cobranza/queries";
import { calcularEquilibrio, type TasaDeMes } from "./equilibrio";
import { cargarTasasDelAnio, type TasaDelMesParaReporte } from "./tipo-cambio-server";
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
  mandaLaTasaConfirmada,
  quincenasPorMes,
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
  /**
   * `bccr`: el mes tiene días del Banco Central (2026-10-05). Completo, la tasa es su promedio y no se confirma a mano;
   * con días que faltan, quien supervisa confirma la tasa (o pone otra) y esa es la que manda.
   * `registradoEn` es de la tasa confirmada a mano (null si la del mes es la del BCCR).
   */
  tipoCambio: {
    crcPorUsd: number;
    fuente: string;
    confirmadoPor: string | null;
    registradoEn: string | null;
    bccr: { dias: number; completo: boolean } | null;
  } | null;
  nombres: { registra: string; supervisa: string };
}

const MES_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

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

  const [{ egresos, calidadDada }, tasasDelAnio, cierres, gastos, filasPlanilla, revision, registra, supervisa, pendientes] = await Promise.all([
    cargarEgresosDelAnio(anio, hoyISO),
    // La misma lectura que el punto de equilibrio: el BCCR día por día y, sin días, la cargada a mano (2026-10-05).
    cargarTasasDelAnio(anio, hoyISO),
    prisma.cierreMes.findMany({ where: { periodo: { in: periodos } } }),
    prisma.gastoPuntual.findMany({
      where: { fecha: { gte: new Date(`${anio}-01-01T00:00:00Z`), lt: new Date(`${anio + 1}-01-01T00:00:00Z`) } },
      select: { fecha: true },
    }),
    // La planilla del año con el ESTADO de cada fila: el cierre pide las dos quincenas pagadas, no solo generadas
    // (2026-10-05). Solo periodo, quincena y estado: ni montos ni personas.
    prisma.pagoPlanilla.findMany({ where: { periodo: { in: periodos } }, select: { periodo: true, quincena: true, estado: true } }),
    cargarRevision(),
    nombreDeQuienRegistra(),
    nombreDeQuienSupervisa(),
    opciones.conEquipo ? medirPendientes(hoyISO, null) : Promise.resolve(null),
  ]);

  /* La calidad de cada mes, con el mismo cálculo que el punto de equilibrio (sin ingresos: no la cambian). */
  const tasas: TasaDeMes[] = tasasDelAnio.tasas;
  const calidad = new Map(
    calcularEquilibrio(egresos, [], { anio, hoyISO, tasas, tasasDiarias: tasasDelAnio.tasasDiarias, calidadDada }).meses.map((m) => [m.periodo, m]),
  );

  const quincenas = quincenasPorMes(filasPlanilla);
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
  const tasaDe = tasasDelAnio.porMes;
  /**
   * ¿Vale la confirmación a mano de este mes? En un mes sin días del BCCR, o con días que faltan (2026-10-05: ahí Alex
   * cierra confirmando él la tasa, y la confirmada es la que usa el año — `mandaLaTasaConfirmada`). Con el BCCR
   * completo, no: manda el BCCR.
   */
  const valeLaManual = (t: TasaDelMesParaReporte) =>
    !!t.manual && (t.bccr ? mandaLaTasaConfirmada(t.bccr, t.manual.registradoPor) : true);
  /** Lo que el cierre necesita de la tasa del mes. */
  const tipoCambioDe = (t: TasaDelMesParaReporte | undefined) =>
    t
      ? {
          crcPorUsd: t.crcPorUsd,
          fuente: t.fuente,
          confirmadoPor: valeLaManual(t) ? confirmadoPorPersona(t.manual!.registradoPor) : null,
          bccr: t.bccr && !t.bccr.porVenir ? { dias: t.bccr.dias, completo: t.bccr.completo } : null,
        }
      : null;
  const cierreDe = new Map(cierres.map((c) => [c.periodo, c]));
  const nombres = { registra, supervisa };

  const datosDe = (p: string): DatosDelMes => {
    const t = tasaDe.get(p);
    return {
      periodo: p,
      quincenas: quincenas.get(p)?.anotadas ?? [],
      quincenasPagadas: quincenas.get(p)?.pagadas ?? [],
      gastosListos: !!cierreDe.get(p)?.gastosListosPor,
      gastosAnotados: anotados.get(p) ?? 0,
      faltantesDelExcel: p >= EGRESOS_DESDE_NEXUS ? [] : (calidad.get(p)?.faltantes ?? []).filter((f) => !esFaltanteDePlanilla(f)),
      tipoCambio: tipoCambioDe(t),
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
  const firmas = await nombrePorEmail([c?.cerradoPor, c?.reabiertoPor, t?.manual?.registradoPor]);
  const tc = tipoCambioDe(t);
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
    tipoCambio:
      t && tc
        ? {
            ...tc,
            confirmadoPor: nombre(tc.confirmadoPor),
            registradoEn: t.manual && valeLaManual(t) ? crDateParts(t.manual.registradoEn).dateKey : null,
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
  // Lo que decide después si el mes cambió (2026-10-06): sus gastos y sus facturas; cobrar no lo marca.
  const huella = reporte.huellas[periodo] ?? { gastos: {}, facturas: {} };
  const numeros: NumerosDelCierre = {
    moneda: "USD",
    egresos: fila.egresos,
    facturado: fila.facturado,
    cobrado: fila.cobrado,
    ingresosTotales: fila.ingresosTotales,
    huella,
  };
  const datos = { estado: "CERRADO", cerradoPor: actor, cerradoEn: new Date(), numeros: { ...numeros, huella } };
  await prisma.cierreMes.upsert({ where: { periodo }, create: { periodo, ...datos }, update: datos });
  // «Para ti» (2026-10-04): le llega a quien registra (su trabajo de ese mes quedó cerrado) y a dirección. No lanza.
  const aviso = {
    tipo: "finanzas.mes-cerrado",
    titulo: `Se cerró ${NOMBRE_DEL_MES[Number(periodo.slice(5, 7)) - 1] ?? periodo} de ${periodo.slice(0, 4)}`,
    detalle: "Sus números quedaron guardados en el punto de equilibrio.",
    href: "/finanzas/equilibrio",
    actorEmail: actor,
    dedupeKey: `finanzas.mes-cerrado:${periodo}:${datos.cerradoEn.toISOString()}`,
  };
  await Promise.all([avisar({ ...aviso, frente: "FINANZAS_REGISTRAR" }), avisar({ ...aviso, frente: "DIRECCION" })]);
}

const NOMBRE_DEL_MES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

/**
 * Reabrir un mes cerrado, con el motivo. Los números del cierre quedan guardados como estaban.
 *
 * ⭐ Y el aviso de quien registra («ya anoté todos los gastos») se borra (decisión de Elías, 2026-10-05: «cuando Alex
 * reabre un mes, Dinia tiene que volver a avisar que los gastos están todos»). Se reabre porque algo del mes cambió:
 * el aviso de antes ya no dice nada sobre lo que hay ahora.
 */
export async function reabrirMes(periodo: string, motivo: string, actor: string): Promise<void> {
  const c = await prisma.cierreMes.findUnique({ where: { periodo }, select: { estado: true } });
  if (c?.estado !== "CERRADO") throw new CobranzaError("Ese mes no está cerrado.", 409);
  await prisma.cierreMes.update({
    where: { periodo },
    data: {
      estado: "ABIERTO",
      reabiertoPor: actor,
      reabiertoEn: new Date(),
      motivoReapertura: motivo.trim(),
      gastosListosPor: null,
      gastosListosEn: null,
    },
  });
}

/**
 * El tipo de cambio del mes: confirmar el que está (queda a nombre de quien confirma) o poner otro, con de dónde sale.
 * No se frena en un mes cerrado, y desde 2026-10-06 tampoco lo marca como «cambió después del cierre»: la marca es de
 * gastos y facturas, en su moneda (`HuellaDelMes`). Cambiar la tasa de un mes cerrado es decisión de quien lo cerró.
 *
 * Confirmar es firmar la tasa que el mes está USANDO (la misma lectura que el punto de equilibrio): la cargada a mano
 * en un mes sin días del BCCR, o el promedio de los días que sí trajo en un mes al que le faltan (2026-10-05). Desde
 * ese momento la confirmada manda (`mandaLaTasaConfirmada`). Con el BCCR completo no hay nada que confirmar: 409.
 */
export async function guardarTipoCambio(
  periodo: string,
  actor: string,
  nuevo: { crcPorUsd: number; fuente: string } | null,
  hoyISO: string,
): Promise<void> {
  if (!MES_RE.test(periodo)) throw new CobranzaError("El mes no es válido.", 400);
  if (!nuevo) {
    const t = (await cargarTasasDelAnio(Number(periodo.slice(0, 4)), hoyISO)).porMes.get(periodo);
    if (!t) throw new CobranzaError("Ese mes no tiene tipo de cambio para confirmar: pon uno.", 404);
    if (t.bccr && t.bccr.completo && !t.bccr.porVenir) {
      throw new CobranzaError("Ese mes tiene todos los días del Banco Central: su tipo de cambio no se confirma a mano.", 409);
    }
    const datos = { crcPorUsd: t.crcPorUsd, fuente: t.fuente, registradoPor: actor, registradoEn: new Date() };
    await prisma.tipoCambioMes.upsert({ where: { periodo }, create: { periodo, ...datos }, update: datos });
    return;
  }
  const datos = { crcPorUsd: nuevo.crcPorUsd, fuente: nuevo.fuente.trim(), registradoPor: actor, registradoEn: new Date() };
  await prisma.tipoCambioMes.upsert({ where: { periodo }, create: { periodo, ...datos }, update: datos });
}
