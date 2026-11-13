/**
 * lib/cobranza/seguimiento-server.ts — lo que Cobranza persigue con un responsable (2026-11-13). SERVER-ONLY.
 *
 * Lee y escribe lo de los puntos 11 a 16 del frente de cobranza. Las reglas son puras y viven aparte:
 *   · ventas ganadas sin cobro ........ lib/ventas/ventas-sin-cobro.ts  (+ responsables.ts)
 *   · la regla de los 15 días ......... lib/cobranza/estado-de-pago.ts
 *   · conectores en mora .............. lib/cobranza/conectores-en-mora.ts
 *   · paso a producción ............... lib/cobranza/paso-a-produccion.ts
 *   · contratos recurrentes ........... lib/cobranza/contratos.ts
 *
 * Toda escritura deja quién y cuándo, y la de un servicio, además, una nota en la bitácora de su cuenta.
 */
import "server-only";
import { prisma } from "@/lib/db/prisma";
import { esquemaDesactualizado } from "@/lib/db/esquema";
import { cargarTasasDelAnio } from "@/lib/finanzas/tipo-cambio-server";
import { PIPELINES_VENTA_PROPIA } from "@/lib/ventas/pipelines";
import { ventasSinCobro, type VentaSinCobro } from "@/lib/ventas/ventas-sin-cobro";
import type { MonedaEq } from "@/lib/finanzas/equilibrio";
import { nombresDelEquipo } from "@/lib/cuentas/encargado-server";
import { CONFIRMA_PRODUCCION, RESPONSABLE_DE_COBRO, paraGuardar, responsablesDelProyecto } from "./responsables";
import { estadoDePago, primeraCuotaVencida, serviciosDelProyecto, type EstadoDePago, type ServicioParaEstado } from "./estado-de-pago";
import { conectoresEnMora, type ConectorEnMora } from "./conectores-en-mora";
import { PIPELINE_DESARROLLO, ETAPAS_TERMINADAS, serviciosQueArrancan, tablaDeProduccion, type FilaDeProduccion } from "./paso-a-produccion";
import { avisoDeFin, finDelContrato, esRenovacion, type AvisoDeContrato, type Renovacion } from "./contratos";
import { nombreDelServicio } from "./nombre-del-servicio";
import { NO_ES_CONTENEDOR_WHERE } from "@/lib/projects/scope";

export class SeguimientoError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

const isoDay = (d: Date | null | undefined): string | null => (d ? d.toISOString().slice(0, 10) : null);
const dayUTC = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const num = (d: { toString(): string } | null | undefined): number | null => (d == null ? null : Number(d.toString()));

/** Un correo del equipo activo, o error. null = el responsable por defecto. */
async function correoDelEquipo(email: string | null): Promise<string | null> {
  if (email === null) return null;
  const e = email.trim().toLowerCase();
  const tm = await prisma.teamMember.findFirst({ where: { email: { equals: e, mode: "insensitive" }, deactivatedAt: null }, select: { email: true } });
  if (!tm) throw new SeguimientoError("Esa persona no está en el equipo activo.", 400);
  return tm.email.toLowerCase();
}

// ── 11. Negocios ganados sin cobro ──────────────────────────────────────────────

/** Las ventas del año sin respaldo en cobranza, con su responsable. La misma regla que la línea de Finanzas. */
export async function cargarVentasSinCobro(hoyISO: string): Promise<VentaSinCobro[]> {
  const anio = Number(hoyISO.slice(0, 4));
  const desde = dayUTC(`${anio}-01-01`);
  const hasta = dayUTC(`${anio}-12-31`);
  const otroAnio = dayUTC(`${anio + 1}-01-01`);
  const [ventas, cobros, cuentas, tasas] = await Promise.all([
    prisma.ventaGanada.findMany({
      where: { estado: "GANADA", fechaCierre: { gte: desde, lte: hasta } },
      select: {
        id: true, hubspotDealId: true, nombre: true, fechaCierre: true, monto: true, moneda: true, montoConvertidoHubspot: true,
        pipelineId: true, clientId: true, excluida: true, responsableCobroEmail: true, client: { select: { name: true } },
      },
    }),
    // El mismo `where` que `armarEstadoParaAuditar`: lo del año, y las cuotas cargadas de los años que vienen.
    prisma.cobro.findMany({
      where: {
        OR: [
          { periodo: { startsWith: `${anio}-` } },
          { fechaEmision: { gte: desde, lt: otroAnio } },
          { fechaCobro: { gte: desde, lt: otroAnio } },
          { periodo: { gte: `${anio + 1}-01` }, estado: { not: "COBRADO" }, fechaEmision: null },
        ],
      },
      select: { cuentaId: true, periodo: true, monto: true, moneda: true, estado: true, fechaProgramada: true, fechaEmision: true, fechaCobro: true },
    }),
    prisma.cuentaFinanciera.findMany({ select: { id: true, clientId: true } }),
    cargarTasasDelAnio(anio, hoyISO),
  ]);
  const clienteDeCuenta = new Map(cuentas.map((c) => [c.id, c.clientId]));
  return ventasSinCobro({
    anio,
    hoyISO,
    monedaPresentacion: "USD",
    tasas: tasas.tasas,
    pipelinesQueCuentan: [...PIPELINES_VENTA_PROPIA],
    ventas: ventas.map((v) => ({
      id: v.id,
      hubspotDealId: v.hubspotDealId,
      nombre: v.nombre,
      fechaCierre: isoDay(v.fechaCierre)!,
      monto: num(v.monto),
      moneda: v.moneda,
      montoConvertidoHubspot: num(v.montoConvertidoHubspot),
      pipelineId: v.pipelineId,
      clientId: v.clientId,
      clienteNombre: v.client?.name ?? null,
      excluida: v.excluida,
      responsableCobroEmail: v.responsableCobroEmail,
    })),
    cobros: cobros.flatMap((c) => {
      const clientId = clienteDeCuenta.get(c.cuentaId);
      if (!clientId) return [];
      return [{
        clientId,
        estado: c.estado,
        periodo: c.periodo,
        fechaProgramada: isoDay(c.fechaProgramada)!,
        fechaEmision: isoDay(c.fechaEmision),
        fechaCobro: isoDay(c.fechaCobro),
        monto: num(c.monto)!,
        moneda: c.moneda as MonedaEq,
      }];
    }),
  });
}

export interface VentaDescartada {
  id: string;
  nombre: string;
  clienteNombre: string | null;
  fechaCierre: string;
  motivo: string | null;
  por: string | null;
  en: string | null;
}

/** Las descartadas del año, con su razón: para poder devolverlas a la lista si fue un error. */
export async function cargarVentasDescartadas(hoyISO: string): Promise<VentaDescartada[]> {
  const anio = Number(hoyISO.slice(0, 4));
  const filas = await prisma.ventaGanada.findMany({
    where: { estado: "GANADA", excluida: true, fechaCierre: { gte: dayUTC(`${anio}-01-01`), lte: dayUTC(`${anio}-12-31`) } },
    orderBy: [{ excluidaEn: { sort: "desc", nulls: "last" } }, { fechaCierre: "desc" }],
    select: { id: true, nombre: true, fechaCierre: true, excluidaMotivo: true, excluidaPor: true, excluidaEn: true, client: { select: { name: true } } },
  });
  return filas.map((f) => ({
    id: f.id,
    nombre: f.nombre,
    clienteNombre: f.client?.name ?? null,
    fechaCierre: isoDay(f.fechaCierre)!,
    motivo: f.excluidaMotivo,
    por: f.excluidaPor,
    en: f.excluidaEn?.toISOString() ?? null,
  }));
}

/** Reasigna quién persigue el cobro de una venta. null = el responsable por defecto. */
export async function asignarResponsableDeVenta(ventaId: string, email: string | null): Promise<void> {
  const valido = await correoDelEquipo(email);
  const r = await prisma.ventaGanada.updateMany({
    where: { id: ventaId },
    data: { responsableCobroEmail: paraGuardar(valido, RESPONSABLE_DE_COBRO.email) },
  });
  if (r.count === 0) throw new SeguimientoError("Esa venta no existe.", 404);
}

/** Descarta una venta de la lista: no genera cobro (continuidad, add-on, renovación…). Con razón, quién y cuándo. */
export async function descartarVenta(ventaId: string, motivo: string, actorEmail: string): Promise<void> {
  const r = await prisma.ventaGanada.updateMany({
    where: { id: ventaId },
    data: { excluida: true, excluidaMotivo: motivo.trim(), excluidaPor: actorEmail.toLowerCase(), excluidaEn: new Date() },
  });
  if (r.count === 0) throw new SeguimientoError("Esa venta no existe.", 404);
}

/** Devuelve una venta descartada a la lista (el descarte fue un error). */
export async function devolverVentaALaLista(ventaId: string): Promise<void> {
  const r = await prisma.ventaGanada.updateMany({
    where: { id: ventaId },
    data: { excluida: false, excluidaMotivo: null, excluidaPor: null, excluidaEn: null },
  });
  if (r.count === 0) throw new SeguimientoError("Esa venta no existe.", 404);
}

// ── 13. Estado de pago y la regla de los 15 días ────────────────────────────────

const SELECT_SERVICIO_PARA_ESTADO = {
  id: true,
  descripcion: true,
  tipoServicio: true,
  projectId: true,
  estado: true,
  cobros: { select: { numCuota: true, estado: true, fechaProgramada: true, fechaEmision: true, fechaCobro: true } },
} as const;

type FilaServicioParaEstado = {
  id: string;
  descripcion: string | null;
  tipoServicio: string;
  projectId: string | null;
  estado: string;
  cobros: Array<{ numCuota: number | null; estado: string; fechaProgramada: Date; fechaEmision: Date | null; fechaCobro: Date | null }>;
};

const aServicioParaEstado = (s: FilaServicioParaEstado, creditoDias: number | null): ServicioParaEstado => ({
  id: s.id,
  nombre: nombreDelServicio(s.descripcion, s.tipoServicio),
  projectId: s.projectId,
  estado: s.estado,
  creditoDias,
  cobros: s.cobros.map((c) => ({
    numCuota: c.numCuota,
    estado: c.estado,
    fechaProgramada: isoDay(c.fechaProgramada)!,
    fechaEmision: isoDay(c.fechaEmision),
    fechaCobro: isoDay(c.fechaCobro),
  })),
});

/** El estado de pago de un proyecto (sin montos: lo lee Customer Success). */
export async function cargarEstadoDePagoDelProyecto(projectId: string, hoyISO: string): Promise<EstadoDePago> {
  const p = await prisma.project.findUnique({ where: { id: projectId }, select: { clientId: true, esPrueba: true } });
  if (!p || p.esPrueba) return { clave: "sin-cobranza" };
  const cuenta = await prisma.cuentaFinanciera.findUnique({
    where: { clientId: p.clientId },
    select: { creditoDias: true, servicios: { select: SELECT_SERVICIO_PARA_ESTADO } },
  });
  if (!cuenta) return { clave: "sin-cobranza" };
  const servicios = serviciosDelProyecto(projectId, cuenta.servicios).map((s) => aServicioParaEstado(s, cuenta.creditoDias));
  return estadoDePago(servicios, hoyISO);
}

export interface PrimeraCuotaVencida {
  clientId: string;
  clienteNombre: string;
  servicioId: string;
  servicio: string;
  /** El proyecto del servicio; null = es de la cuenta. */
  projectId: string | null;
  dias: number;
}

/** De estas cuentas, los servicios activos con la primera cuota vencida (la regla de los 15 días). */
export async function primerasCuotasVencidas(clientIds: readonly string[], hoyISO: string): Promise<PrimeraCuotaVencida[]> {
  const ids = [...new Set(clientIds)].filter(Boolean);
  if (ids.length === 0) return [];
  const cuentas = await prisma.cuentaFinanciera.findMany({
    where: { clientId: { in: ids } },
    select: {
      clientId: true,
      creditoDias: true,
      client: { select: { name: true } },
      servicios: { where: { estado: "ACTIVO" }, select: SELECT_SERVICIO_PARA_ESTADO },
    },
  });
  const out: PrimeraCuotaVencida[] = [];
  for (const c of cuentas) {
    for (const s of c.servicios) {
      const sv = aServicioParaEstado(s, c.creditoDias);
      const dias = primeraCuotaVencida(sv, hoyISO);
      if (dias !== null) out.push({ clientId: c.clientId, clienteNombre: c.client.name, servicioId: s.id, servicio: sv.nombre, projectId: s.projectId, dias });
    }
  }
  return out.sort((a, b) => b.dias - a.dias);
}

// ── 14. Conectores en mora ──────────────────────────────────────────────────────

export async function cargarConectores(hoyISO: string): Promise<ConectorEnMora[]> {
  const filas = await prisma.servicioContratado.findMany({
    where: { tipoServicio: "CONECTOR", estado: "ACTIVO" },
    select: {
      id: true, cuentaId: true, descripcion: true, tipoServicio: true, estado: true,
      desactivacionConfirmadaPor: true, desactivacionConfirmadaEn: true,
      cuenta: { select: { creditoDias: true, client: { select: { name: true } } } },
      cobros: { where: { estado: { not: "COBRADO" } }, select: { estado: true, fechaEmision: true, promesaPago: true } },
    },
  });
  return conectoresEnMora(
    filas.map((f) => ({
      servicioId: f.id,
      cuentaId: f.cuentaId,
      clienteNombre: f.cuenta.client.name,
      descripcion: nombreDelServicio(f.descripcion, f.tipoServicio),
      tipoServicio: f.tipoServicio,
      estado: f.estado,
      creditoDias: f.cuenta.creditoDias,
      desactivacionConfirmadaPor: f.desactivacionConfirmadaPor,
      desactivacionConfirmadaEn: f.desactivacionConfirmadaEn?.toISOString() ?? null,
      cobros: f.cobros.map((c) => ({ estado: c.estado, fechaEmision: isoDay(c.fechaEmision), promesaPago: isoDay(c.promesaPago) })),
    })),
    hoyISO,
  );
}

/**
 * Confirma (o deshace) la desactivación de un conector. Confirmar exige que Nexus lo esté proponiendo HOY (en mora y sin
 * promesa vigente): nadie desactiva un conector que está al día por un clic viejo.
 */
export async function decidirDesactivacion(servicioId: string, desactivar: boolean, actorEmail: string, hoyISO: string): Promise<void> {
  const fila = (await cargarConectores(hoyISO)).find((x) => x.servicioId === servicioId) ?? null;
  if (!fila || (desactivar ? fila.situacion.clave !== "proponer-desactivar" : fila.situacion.clave !== "desactivado" && fila.situacion.clave !== "proponer-reactivar")) {
    throw new SeguimientoError(
      desactivar ? "Nexus ya no propone desactivar este conector: recarga la página." : "Este conector no está desactivado.",
      409,
    );
  }
  const mora = fila.situacion.clave === "proponer-desactivar" ? fila.situacion.diasDeMora : null;
  const actor = actorEmail.toLowerCase();
  await prisma.$transaction([
    prisma.servicioContratado.update({
      where: { id: servicioId },
      data: desactivar ? { desactivacionConfirmadaPor: actor, desactivacionConfirmadaEn: new Date() } : { desactivacionConfirmadaPor: null, desactivacionConfirmadaEn: null },
    }),
    prisma.bitacoraCobro.create({
      data: {
        cuentaId: fila.cuentaId,
        tipo: "NOTA",
        usuarioEmail: actor,
        contenido: desactivar
          ? `Desactivación del conector «${fila.descripcion}» confirmada por ${actor}, con ${mora} días de mora.`
          : `Conector «${fila.descripcion}» reactivado por ${actor}.`,
      },
    }),
  ]);
}

// ── 15. Paso a producción y responsables por proyecto ───────────────────────────

/** La tabla de responsables y paso a producción, por proyecto. */
export async function cargarTablaDeProduccion(): Promise<FilaDeProduccion[]> {
  const proyectos = await prisma.project.findMany({
    where: {
      esPrueba: false,
      // El contenedor de «Información del cliente» no es un proyecto (en positivo: `serviceType` puede ser NULL).
      AND: [NO_ES_CONTENEDOR_WHERE],
      OR: [
        { hubspotPipelineId: PIPELINE_DESARROLLO, OR: [{ status: "active" }, { hubspotPipelineStageId: { in: [...ETAPAS_TERMINADAS] } }, { hubspotStatus: "completed" }] },
        { serviciosCobranza: { some: { estado: { not: "FINALIZADO" }, OR: [{ tipoServicio: "CONECTOR" }, { modalidad: "RECURRENTE" }] } } },
        { cobroDelProyecto: { isNot: null } },
      ],
    },
    select: {
      id: true, name: true, clientId: true, status: true,
      hubspotPipelineId: true, hubspotPipelineStageId: true, hubspotPipelineStageLabel: true, hubspotStatus: true,
      client: { select: { name: true } },
      serviciosCobranza: { select: { id: true, tipoServicio: true, modalidad: true, estado: true, _count: { select: { cobros: true } } } },
      cobroDelProyecto: true,
    },
  });
  return tablaDeProduccion(
    proyectos.map((p) => ({
      id: p.id,
      nombre: p.name,
      clientId: p.clientId,
      clienteNombre: p.client.name,
      hubspotPipelineId: p.hubspotPipelineId,
      hubspotPipelineStageId: p.hubspotPipelineStageId,
      hubspotPipelineStageLabel: p.hubspotPipelineStageLabel,
      hubspotStatus: p.hubspotStatus,
      activo: p.status === "active",
      servicios: p.serviciosCobranza.map((s) => ({ id: s.id, tipoServicio: s.tipoServicio, modalidad: s.modalidad, estado: s.estado, cobros: s._count.cobros })),
      fila: p.cobroDelProyecto
        ? {
            confirmaProduccionEmail: p.cobroDelProyecto.confirmaProduccionEmail,
            cobraEmail: p.cobroDelProyecto.cobraEmail,
            produccionDesde: isoDay(p.cobroDelProyecto.produccionDesde),
            produccionConfirmadaPor: p.cobroDelProyecto.produccionConfirmadaPor,
            produccionConfirmadaEn: p.cobroDelProyecto.produccionConfirmadaEn?.toISOString() ?? null,
          }
        : null,
    })),
  );
}

/** Guarda quién confirma la producción y quién cobra en un proyecto. Vacío = el por defecto. */
export async function guardarResponsablesDelProyecto(
  projectId: string,
  cambios: { confirma?: string | null; cobra?: string | null },
  actorEmail: string,
): Promise<void> {
  const existe = await prisma.project.findUnique({ where: { id: projectId }, select: { id: true } });
  if (!existe) throw new SeguimientoError("Ese proyecto no existe.", 404);
  const data: { confirmaProduccionEmail?: string | null; cobraEmail?: string | null } = {};
  if (cambios.confirma !== undefined) data.confirmaProduccionEmail = paraGuardar(await correoDelEquipo(cambios.confirma), CONFIRMA_PRODUCCION.email);
  if (cambios.cobra !== undefined) data.cobraEmail = paraGuardar(await correoDelEquipo(cambios.cobra), RESPONSABLE_DE_COBRO.email);
  const actor = actorEmail.toLowerCase();
  await prisma.cobroDelProyecto.upsert({
    where: { projectId },
    create: { projectId, ...data, actualizadoPor: actor },
    update: { ...data, actualizadoPor: actor },
  });
}

/** Quién confirma hoy la producción de un proyecto (su fila o el por defecto). */
export async function quienConfirmaLaProduccion(projectId: string): Promise<string> {
  const f = await prisma.cobroDelProyecto.findUnique({ where: { projectId }, select: { confirmaProduccionEmail: true, cobraEmail: true } });
  return responsablesDelProyecto(f).confirma;
}

/**
 * Registra el paso a producción: el día, quién y cuándo. Los servicios de cobro recurrente del proyecto que todavía no
 * tienen cuotas arrancan ese día (`fechaInicioFacturacion`); los que ya tienen cuotas no se tocan. Devuelve cuántos
 * arrancaron. Con `desde: null`, lo deshace (la fecha de arranque que ya se escribió se queda: se corrige en el servicio).
 */
export async function registrarPasoAProduccion(projectId: string, desde: string | null, actorEmail: string): Promise<{ arrancados: number }> {
  const p = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      id: true, name: true,
      serviciosCobranza: { select: { id: true, cuentaId: true, tipoServicio: true, modalidad: true, estado: true, descripcion: true, _count: { select: { cobros: true } } } },
    },
  });
  if (!p) throw new SeguimientoError("Ese proyecto no existe.", 404);
  const actor = actorEmail.toLowerCase();
  const ahora = new Date();
  if (desde === null) {
    await prisma.cobroDelProyecto.updateMany({
      where: { projectId },
      data: { produccionDesde: null, produccionConfirmadaPor: null, produccionConfirmadaEn: null, actualizadoPor: actor },
    });
    return { arrancados: 0 };
  }
  const arrancan = new Set(
    serviciosQueArrancan(p.serviciosCobranza.map((s) => ({ id: s.id, tipoServicio: s.tipoServicio, modalidad: s.modalidad, estado: s.estado, cobros: s._count.cobros }))),
  );
  const dia = dayUTC(desde);
  await prisma.$transaction(async (tx) => {
    await tx.cobroDelProyecto.upsert({
      where: { projectId },
      create: { projectId, produccionDesde: dia, produccionConfirmadaPor: actor, produccionConfirmadaEn: ahora, actualizadoPor: actor },
      update: { produccionDesde: dia, produccionConfirmadaPor: actor, produccionConfirmadaEn: ahora, actualizadoPor: actor },
    });
    for (const s of p.serviciosCobranza.filter((x) => arrancan.has(x.id))) {
      await tx.servicioContratado.update({ where: { id: s.id }, data: { fechaInicioFacturacion: dia } });
      await tx.bitacoraCobro.create({
        data: {
          cuentaId: s.cuentaId,
          tipo: "NOTA",
          usuarioEmail: actor,
          contenido: `Paso a producción de «${p.name}» confirmado por ${actor}: el cobro de «${nombreDelServicio(s.descripcion, s.tipoServicio)}» arranca el ${desde}.`,
        },
      });
    }
  });
  return { arrancados: arrancan.size };
}

// ── 16. Contratos recurrentes ───────────────────────────────────────────────────

export interface ContratoRecurrente {
  servicioId: string;
  cuentaId: string;
  clientId: string;
  clienteNombre: string;
  servicio: string;
  projectId: string | null;
  inicio: string | null;
  fin: string | null;
  /** El fin lo escribió alguien (false = sale del inicio + la duración, o no tiene). */
  finEscrito: boolean;
  renovacion: Renovacion | null;
  aviso: AvisoDeContrato | null;
}

/** Los contratos recurrentes activos (de estas cuentas, o de todas), con su fin y su aviso. */
export async function cargarContratos(hoyISO: string, clientIds?: readonly string[]): Promise<ContratoRecurrente[]> {
  const filas = await prisma.servicioContratado.findMany({
    where: { modalidad: "RECURRENTE", estado: "ACTIVO", ...(clientIds ? { cuenta: { clientId: { in: [...clientIds] } } } : {}) },
    select: {
      id: true, cuentaId: true, descripcion: true, tipoServicio: true, modalidad: true, estado: true, projectId: true,
      fechaInicioFacturacion: true, duracionMeses: true, contratoFin: true, contratoRenovacion: true,
      cuenta: { select: { clientId: true, client: { select: { name: true } } } },
    },
  });
  return filas
    .map((f) => {
      const s = {
        modalidad: f.modalidad,
        estado: f.estado,
        fechaInicioFacturacion: isoDay(f.fechaInicioFacturacion),
        duracionMeses: f.duracionMeses,
        contratoFin: isoDay(f.contratoFin),
        contratoRenovacion: f.contratoRenovacion,
      };
      return {
        servicioId: f.id,
        cuentaId: f.cuentaId,
        clientId: f.cuenta.clientId,
        clienteNombre: f.cuenta.client.name,
        servicio: nombreDelServicio(f.descripcion, f.tipoServicio),
        projectId: f.projectId,
        inicio: s.fechaInicioFacturacion,
        fin: finDelContrato(s),
        finEscrito: !!f.contratoFin,
        renovacion: esRenovacion(f.contratoRenovacion) ? f.contratoRenovacion : null,
        aviso: avisoDeFin(s, hoyISO),
      };
    })
    .sort((a, b) => (a.fin ?? "9999").localeCompare(b.fin ?? "9999") || a.clienteNombre.localeCompare(b.clienteNombre, "es"));
}

// ── Lo de la pestaña «Seguimiento» de Cobranza, en una vuelta ───────────────────

export interface SeguimientoDeCobranza {
  ventas: VentaSinCobro[];
  descartadas: VentaDescartada[];
  conectores: ConectorEnMora[];
  contratos: ContratoRecurrente[];
  /** Los que confirman producción y no lo hicieron, y los cobros por arrancar: el resumen de la tabla por proyecto. */
  produccion: { faltaConfirmar: number; porArrancar: number };
  /** Correo → nombre del equipo activo, para los selectores. */
  equipo: Array<{ email: string; nombre: string }>;
  /** A la base le falta el SQL de este cambio (2026-11-13-cobranza-responsables-y-contratos.sql): todo sale vacío. */
  esquemaAtrasado: boolean;
}

export async function cargarSeguimiento(hoyISO: string): Promise<SeguimientoDeCobranza> {
  try {
    const [ventas, descartadas, conectores, contratos, tabla, equipo] = await Promise.all([
      cargarVentasSinCobro(hoyISO),
      cargarVentasDescartadas(hoyISO),
      cargarConectores(hoyISO),
      cargarContratos(hoyISO),
      cargarTablaDeProduccion(),
      equipoActivo(),
    ]);
    return {
      ventas,
      descartadas,
      conectores,
      contratos,
      produccion: {
        faltaConfirmar: tabla.filter((f) => f.situacion.clave === "falta-confirmar").length,
        porArrancar: tabla.filter((f) => f.situacion.clave === "en-produccion" && !f.situacion.cobroArrancado).length,
      },
      equipo,
      esquemaAtrasado: false,
    };
  } catch (e) {
    if (!esquemaDesactualizado(e)) throw e;
    return { ventas: [], descartadas: [], conectores: [], contratos: [], produccion: { faltaConfirmar: 0, porArrancar: 0 }, equipo: [], esquemaAtrasado: true };
  }
}

/** El equipo activo, para los selectores de responsable. */
export async function equipoActivo(): Promise<Array<{ email: string; nombre: string }>> {
  const filas = await prisma.teamMember.findMany({ where: { deactivatedAt: null }, select: { email: true, name: true }, orderBy: { name: "asc" } });
  return filas.map((f) => ({ email: f.email.toLowerCase(), nombre: f.name }));
}

/** Correo → nombre (todo el equipo, también quien se fue: una venta pudo quedar a su nombre). */
export async function nombresParaResponsables(): Promise<Map<string, string>> {
  return (await nombresDelEquipo()).nombres;
}
