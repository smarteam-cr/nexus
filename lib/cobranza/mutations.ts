/**
 * lib/cobranza/mutations.ts
 *
 * Escrituras Prisma del módulo Cobranza (server-only). Los endpoints validan con
 * Zod (lib/cobranza/schema.ts) ANTES de llamar acá. Dos CHOKEPOINTS medulares:
 *  - generateCobros: única materialización de cobros (engine → transacción).
 *  - cambiarEstadoCobro: única escritura de Cobro.estado. INV3 vive acá — marcar
 *    COBRADO exige el email del guard (confirmadoPor); revertir limpia la tripleta.
 *    La red dura del invariante está en scripts/check-invariants.ts.
 */
import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@prisma/client";
import {
  materializeCobros,
  reconcileCobros,
  splitCatchUp,
  sumaPlanExpandido,
  type AlertaDraft,
  type CobroExistente,
  type PlanEngineInput,
  type ServicioEngineInput,
} from "./engine";
import type { z } from "zod";
import type {
  cuentaCreateSchema,
  cuentaPatchSchema,
  servicioCreateSchema,
  servicioPatchSchema,
  planPutSchema,
  cobroPatchSchema,
  cobroManualSchema,
  alertaPatchSchema,
  bitacoraCreateSchema,
  costoCreateSchema,
  costoPatchSchema,
} from "./schema";

export class CobranzaError extends Error {
  constructor(
    message: string,
    public status: number = 400,
  ) {
    super(message);
  }
}

const dayUTC = (isoDate: string) => new Date(`${isoDate}T00:00:00.000Z`);
const isoDay = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

// ── Cuenta ──────────────────────────────────────────────────────────────────────

/**
 * Get-or-create: "Configurar cuenta" es ensure-and-open, no un alta estricta —
 * si el cliente ya tiene cuenta (p.ej. un click previo con la tabla stale, u otra
 * PC), se devuelve la existente SIN pisarla con los defaults del body.
 */
export async function createCuenta(
  data: z.infer<typeof cuentaCreateSchema>,
): Promise<{ cuenta: { id: string }; created: boolean }> {
  const existente = await prisma.cuentaFinanciera.findUnique({ where: { clientId: data.clientId } });
  if (existente) return { cuenta: existente, created: false };
  try {
    const cuenta = await prisma.cuentaFinanciera.create({
      data: {
        clientId: data.clientId,
        tipo: data.tipo,
        viaCobro: data.viaCobro,
        moneda: data.moneda,
        terminosPago: data.terminosPago,
        diaCobroAncla: data.diaCobroAncla ?? null,
        notas: data.notas ?? null,
      },
    });
    return { cuenta, created: true };
  } catch (e: unknown) {
    // Carrera de doble click: otro request la creó entre el find y el create.
    if ((e as { code?: string }).code === "P2002") {
      const ganadora = await prisma.cuentaFinanciera.findUnique({ where: { clientId: data.clientId } });
      if (ganadora) return { cuenta: ganadora, created: false };
    }
    throw e;
  }
}

export async function updateCuenta(
  cuentaId: string,
  data: z.infer<typeof cuentaPatchSchema>,
  byEmail: string,
) {
  // Cambio manual de estadoCuenta → triple columna de curaduría (idioma health override).
  const tocaEstado = data.estadoCuenta !== undefined;
  return prisma.cuentaFinanciera.update({
    where: { id: cuentaId },
    data: {
      ...data,
      ...(tocaEstado ? { estadoActualizadoPor: byEmail, estadoActualizadoEn: new Date() } : {}),
    },
  });
}

// ── Servicio ────────────────────────────────────────────────────────────────────

export async function createServicio(cuentaId: string, data: z.infer<typeof servicioCreateSchema>) {
  // Default del ancla: si viene projectId sin fechaInicioFacturacion, se LEE (una
  // vez) del anchorStartDate del cronograma del proyecto — copia editable, no sync.
  let fechaInicio: Date | null = data.fechaInicioFacturacion
    ? dayUTC(data.fechaInicioFacturacion)
    : null;
  if (!fechaInicio && data.projectId) {
    const tl = await prisma.projectTimeline.findUnique({
      where: { projectId: data.projectId },
      select: { anchorStartDate: true },
    });
    fechaInicio = tl?.anchorStartDate ?? null;
  }
  return prisma.servicioContratado.create({
    data: {
      cuentaId,
      tipoServicio: data.tipoServicio,
      modalidad: data.modalidad,
      montoTotal: data.montoTotal,
      moneda: data.moneda,
      fechaInicioFacturacion: fechaInicio,
      duracionMeses: data.duracionMeses ?? null,
      projectId: data.projectId ?? null,
      descripcion: data.descripcion ?? null,
    },
  });
}

export async function updateServicio(servicioId: string, data: z.infer<typeof servicioPatchSchema>) {
  const { fechaInicioFacturacion, ...rest } = data;
  return prisma.servicioContratado.update({
    where: { id: servicioId },
    data: {
      ...rest,
      ...(fechaInicioFacturacion !== undefined
        ? { fechaInicioFacturacion: fechaInicioFacturacion ? dayUTC(fechaInicioFacturacion) : null }
        : {}),
    },
  });
}

export async function deleteServicio(servicioId: string) {
  const cobrados = await prisma.cobro.count({ where: { servicioId, estado: "COBRADO" } });
  if (cobrados > 0) {
    throw new CobranzaError(
      `No se puede borrar: el servicio tiene ${cobrados} cobro(s) ya COBRADO(s). Marcalo FINALIZADO en su lugar.`,
      409,
    );
  }
  return prisma.servicioContratado.delete({ where: { id: servicioId } });
}

// ── Plan de pago (1 activo por servicio, transaccional) ─────────────────────────

export async function setPlanActivo(servicioId: string, data: z.infer<typeof planPutSchema>) {
  // PAREJO sin numCuotas exige duracionMeses en el servicio (el Zod no ve el servicio).
  if (data.template === "PAREJO" && !data.numCuotas) {
    const servicio = await prisma.servicioContratado.findUnique({
      where: { id: servicioId },
      select: { duracionMeses: true },
    });
    if (!servicio?.duracionMeses) {
      throw new CobranzaError(
        "Cuotas parejas necesita el número de cuotas (o que el servicio tenga duración en meses).",
      );
    }
  }
  return prisma.$transaction(async (tx) => {
    await tx.planDePago.updateMany({ where: { servicioId, activo: true }, data: { activo: false } });
    const plan = await tx.planDePago.create({
      data: {
        servicioId,
        template: data.template,
        numCuotas: data.numCuotas ?? null,
        notas: data.notas ?? null,
      },
    });
    if (data.cuotas.length > 0) {
      await tx.cuotaPlan.createMany({
        data: data.cuotas.map((c) => ({
          planId: plan.id,
          orden: c.orden,
          base: c.base,
          valor: c.valor,
          offsetMeses: c.offsetMeses,
          descripcion: c.descripcion ?? null,
        })),
      });
    }
    return plan;
  });
}

// ── CHOKEPOINT: materialización de cobros ───────────────────────────────────────

export interface GenerateResult {
  created: number;
  updated: number;
  deleted: number;
  catchUp: number;
  untouched: number;
}

/**
 * Materializa/reconcilia los Cobros del servicio desde su plan activo. Idempotente:
 * re-ejecutar sin cambios de plan = 0 mutaciones (el botón del demo se puede apretar
 * dos veces). Los catch-up (períodos ya pasados) nacen origen=CATCH_UP + alerta
 * INCONSISTENCIA_CICLO para que Alex confirme. Deja rastro en BitacoraCobro.
 */
export async function generateCobros(
  servicioId: string,
  byEmail: string,
  todayISO: string,
): Promise<GenerateResult> {
  const servicio = await prisma.servicioContratado.findUnique({
    where: { id: servicioId },
    include: {
      cuenta: { select: { id: true, diaCobroAncla: true } },
      planes: { where: { activo: true }, include: { cuotas: { orderBy: { orden: "asc" } } }, take: 1 },
      cobros: true,
    },
  });
  if (!servicio) throw new CobranzaError("El servicio no existe.", 404);
  const plan = servicio.planes[0];
  if (!plan) throw new CobranzaError("El servicio no tiene un plan de pago activo. Configuralo primero.");
  if (!servicio.fechaInicioFacturacion) {
    throw new CobranzaError(
      "El servicio no tiene fecha de inicio de facturación — no se generan cobros (pendiente de datos).",
    );
  }

  const servicioInput: ServicioEngineInput = {
    id: servicio.id,
    montoTotal: Number(servicio.montoTotal),
    moneda: servicio.moneda as ServicioEngineInput["moneda"],
    fechaInicioFacturacion: isoDay(servicio.fechaInicioFacturacion),
    duracionMeses: servicio.duracionMeses,
    diaCobroAncla: servicio.cuenta.diaCobroAncla,
  };
  const planInput: PlanEngineInput = {
    template: plan.template as PlanEngineInput["template"],
    numCuotas: plan.numCuotas,
    cuotas: plan.cuotas.map((c) => ({
      orden: c.orden,
      base: c.base as "PORCENTAJE" | "MONTO_FIJO",
      valor: Number(c.valor),
      offsetMeses: c.offsetMeses,
      descripcion: c.descripcion,
    })),
  };
  const existentes: CobroExistente[] = servicio.cobros.map((c) => ({
    id: c.id,
    numCuota: c.numCuota,
    estado: c.estado,
    origen: c.origen,
    fechaEmision: isoDay(c.fechaEmision),
    fechaProgramadaISO: isoDay(c.fechaProgramada)!,
    monto: Number(c.monto),
  }));

  // Guardarraíl de montos (fase 3): un plan descuadrado puede GUARDARSE (sigue
  // editable y la alerta MONTOS_DESCUADRADOS avisa), pero NO se materializa —
  // cobros que no suman el total del servicio jamás cuadran después. SUSCRIPCION
  // y planes inválidos devuelven null y pasan (materializeCobros ya los maneja);
  // el rolling del digest es inmune por la misma razón.
  const sumaPlan = sumaPlanExpandido(
    { montoTotal: servicioInput.montoTotal, duracionMeses: servicioInput.duracionMeses },
    planInput,
  );
  if (sumaPlan != null && Math.abs(sumaPlan - servicioInput.montoTotal) > 0.01) {
    throw new CobranzaError(
      `El plan suma ${sumaPlan.toLocaleString("es-CR")} pero el servicio vale ${servicioInput.montoTotal.toLocaleString("es-CR")} ${servicioInput.moneda} — cuadrá el plan antes de generar cobros.`,
      409,
    );
  }

  const drafts = materializeCobros(servicioInput, planInput, { todayISO });
  const rec = reconcileCobros(drafts, existentes);
  const { regulares, catchUp } = splitCatchUp(rec.toCreate, todayISO);

  await prisma.$transaction(async (tx) => {
    const mkData = (d: (typeof regulares)[number], origen: "PLAN" | "CATCH_UP") => ({
      servicioId: servicio.id,
      cuentaId: servicio.cuenta.id,
      planId: plan.id,
      numCuota: d.numCuota,
      periodo: d.periodo,
      fechaProgramada: dayUTC(d.fechaProgramadaISO),
      monto: d.monto,
      moneda: servicio.moneda,
      origen,
      notas: d.descripcion ?? null,
    });
    if (regulares.length) await tx.cobro.createMany({ data: regulares.map((d) => mkData(d, "PLAN")) });
    if (catchUp.length) await tx.cobro.createMany({ data: catchUp.map((d) => mkData(d, "CATCH_UP")) });
    for (const u of rec.toUpdate) {
      await tx.cobro.update({
        where: { id: u.id },
        data: { fechaProgramada: dayUTC(u.fechaProgramadaISO), monto: u.monto, periodo: u.periodo },
      });
    }
    if (rec.toDelete.length) await tx.cobro.deleteMany({ where: { id: { in: rec.toDelete } } });

    if (regulares.length || catchUp.length || rec.toUpdate.length || rec.toDelete.length) {
      await tx.bitacoraCobro.create({
        data: {
          cuentaId: servicio.cuenta.id,
          tipo: "ACTUALIZACION_IA",
          contenido: `Materialización de cobros por ${byEmail}: ${regulares.length + catchUp.length} nuevos (${catchUp.length} catch-up), ${rec.toUpdate.length} ajustados, ${rec.toDelete.length} eliminados.`,
        },
      });
    }
  });

  // Alertas de catch-up (fuera de la tx: el dedup lee lo recién creado).
  if (catchUp.length > 0) {
    const cobrosCatchUp = await prisma.cobro.findMany({
      where: { servicioId, origen: "CATCH_UP", estado: "PROGRAMADO" },
      select: { id: true, fechaProgramada: true, monto: true },
    });
    const cliente = await prisma.cuentaFinanciera.findUnique({
      where: { id: servicio.cuenta.id },
      select: { client: { select: { name: true } } },
    });
    await upsertAlertas(
      cobrosCatchUp.map((c) => ({
        dedupeKey: `INCONSISTENCIA_CICLO:${servicio.cuenta.id}:${c.id}`,
        tipo: "INCONSISTENCIA_CICLO" as const,
        urgencia: "MEDIA" as const,
        cuentaId: servicio.cuenta.id,
        cobroId: c.id,
        mensaje: `${cliente?.client.name ?? "Cliente"}: cobro de catch-up generado por desfase de arranque (${isoDay(c.fechaProgramada)}) — pendiente de tu confirmación.`,
        evidencia: { servicioId, fechaProgramada: isoDay(c.fechaProgramada), monto: Number(c.monto) },
      })),
    );
  }

  return {
    created: regulares.length + catchUp.length,
    updated: rec.toUpdate.length,
    deleted: rec.toDelete.length,
    catchUp: catchUp.length,
    untouched: rec.untouched.length,
  };
}

// ── CHOKEPOINT INV3: cambio de estado de un cobro ───────────────────────────────

/**
 * ÚNICA función que escribe Cobro.estado. Reglas:
 *  - estado=COBRADO exige byEmail (guard) → setea confirmadoPor/confirmadoEn +
 *    fechaCobro (default hoy). INV3: jamás COBRADO sin confirmadoPor.
 *  - Salir de COBRADO limpia la tripleta (confirmadoPor/En + fechaCobro).
 *  - fechaProgramada/monto SOLO editables mientras el cobro está PROGRAMADO (409).
 */
export async function cambiarEstadoCobro(
  cobroId: string,
  patch: z.infer<typeof cobroPatchSchema>,
  byEmail: string,
) {
  const cobro = await prisma.cobro.findUnique({ where: { id: cobroId } });
  if (!cobro) throw new CobranzaError("El cobro no existe.", 404);

  if ((patch.fechaProgramada !== undefined || patch.monto !== undefined) && cobro.estado !== "PROGRAMADO") {
    throw new CobranzaError(
      "La fecha programada y el monto solo se editan mientras el cobro está PROGRAMADO.",
      409,
    );
  }

  const data: Prisma.CobroUpdateInput = {};
  if (patch.fechaProgramada !== undefined) data.fechaProgramada = dayUTC(patch.fechaProgramada);
  if (patch.monto !== undefined) data.monto = patch.monto;
  if (patch.fechaEmision !== undefined)
    data.fechaEmision = patch.fechaEmision ? dayUTC(patch.fechaEmision) : null;
  // ReconciliationPort v1: referencia externa opcional (id transacción Mercury / factura Odoo).
  if (patch.referenciaExterna !== undefined) data.referenciaExterna = patch.referenciaExterna;
  if (patch.notas !== undefined) data.notas = patch.notas;

  // Promesa de pago (fase 3): fecha en que el cliente prometió pagar. No aplica
  // sobre un COBRADO (ya llegó) y NO se limpia al cobrar (trazabilidad de si
  // cumplió). Semáforos y métricas NO cambian — la promesa solo calla alertas.
  if (patch.promesaPago !== undefined) {
    if (cobro.estado === "COBRADO") {
      throw new CobranzaError("El cobro ya está COBRADO — la promesa no aplica.", 409);
    }
    data.promesaPago = patch.promesaPago ? dayUTC(patch.promesaPago) : null;
  }

  if (patch.estado !== undefined && patch.estado !== cobro.estado) {
    if (patch.estado === "COBRADO") {
      if (!byEmail) throw new CobranzaError("Marcar COBRADO exige confirmación de un usuario.", 400);
      data.estado = "COBRADO";
      data.confirmadoPor = byEmail;
      data.confirmadoEn = new Date();
      data.fechaCobro = patch.fechaCobro ? dayUTC(patch.fechaCobro) : new Date();
    } else {
      data.estado = patch.estado;
      if (cobro.estado === "COBRADO") {
        // Revertir un COBRADO limpia la confirmación (queda rastro en updatedAt/bitácora).
        data.confirmadoPor = null;
        data.confirmadoEn = null;
        data.fechaCobro = null;
      }
    }
  } else if (patch.fechaCobro !== undefined) {
    data.fechaCobro = patch.fechaCobro ? dayUTC(patch.fechaCobro) : null;
  }

  const updated = await prisma.cobro.update({ where: { id: cobroId }, data });

  if (patch.promesaPago !== undefined) {
    // AUTO-SNOOZE: registrar la promesa calla YA las alertas vivas de este cobro
    // hasta la fecha prometida (el humano ya gestionó — sin esto el ruido viejo
    // sigue en el feed hasta el próximo corte); quitarla las despierta.
    await prisma.alertaCobro.updateMany({
      where: { cobroId, estado: { in: ["ABIERTA", "VISTA"] } },
      data: { posponerHasta: patch.promesaPago ? dayUTC(patch.promesaPago) : null },
    });
    await prisma.bitacoraCobro.create({
      data: {
        cuentaId: cobro.cuentaId,
        cobroId,
        tipo: "NOTA",
        contenido: patch.promesaPago
          ? `Promesa de pago registrada: el cliente prometió pagar el ${patch.promesaPago}.`
          : "Promesa de pago retirada.",
        usuarioEmail: byEmail,
      },
    });
  }

  return updated;
}

// ── Pago manual: un cobro que no salió de un plan ───────────────────────────────

/**
 * Registra un pago MANUAL: crea un Cobro origen=MANUAL (numCuota=null → intocable
 * por reconcileCobros, sobrevive a re-generate) sobre un servicio EXISTENTE, y lo
 * marca COBRADO por el chokepoint `cambiarEstadoCobro` (INV3: confirmadoPor del
 * guard). No hay pago flotante — el schema exige servicioId + cuentaId.
 */
export async function createCobroManual(
  input: z.infer<typeof cobroManualSchema>,
  byEmail: string,
) {
  const servicio = await prisma.servicioContratado.findUnique({
    where: { id: input.servicioId },
    select: { id: true, cuentaId: true },
  });
  if (!servicio) throw new CobranzaError("El servicio no existe.", 404);

  const periodo = input.periodo ?? input.fechaCobro.slice(0, 7);
  const cobro = await prisma.cobro.create({
    data: {
      servicioId: servicio.id,
      cuentaId: servicio.cuentaId,
      planId: null,
      numCuota: null, // MANUAL: reconcileCobros nunca lo toca
      periodo,
      fechaProgramada: dayUTC(input.fechaCobro),
      monto: input.monto,
      moneda: input.moneda,
      origen: "MANUAL",
      // estado default PROGRAMADO — el chokepoint lo pasa a COBRADO abajo.
      notas: "Pago manual",
    },
  });

  // Chokepoint INV3: única vía que escribe estado=COBRADO (setea confirmadoPor).
  await cambiarEstadoCobro(
    cobro.id,
    { estado: "COBRADO", fechaCobro: input.fechaCobro, referenciaExterna: input.referenciaExterna ?? null },
    byEmail,
  );

  await addBitacora(
    servicio.cuentaId,
    {
      tipo: "NOTA",
      contenido: `Pago manual registrado: ${input.monto.toLocaleString("es-CR")} ${input.moneda} (${input.fechaCobro})${input.referenciaExterna ? ` · ref. ${input.referenciaExterna}` : ""}.`,
      cobroId: cobro.id,
    },
    byEmail,
  );

  return cobro;
}

// ── Alertas: upsert con dedup (clon del runner del watchdog CS) ─────────────────

/**
 * Persiste drafts de alerta con dedup por dedupeKey:
 *  - misma key ABIERTA/VISTA → merge (occurrences++, lastDetectedAt, mensaje;
 *    urgencia solo ESCALA hacia arriba).
 *  - misma key RESUELTA/DESCARTADA hace <7 días → se suprime (no re-nag).
 *  - si no → fila nueva.
 * Drafts con cuentaId sustituto "client:*" (clientes sin cuenta) se SALTAN — no
 * hay FK destino; viajan solo en el snapshot/digest.
 */
const URGENCIA_PESO: Record<string, number> = { BAJA: 0, MEDIA: 1, ALTA: 2 };

export async function upsertAlertas(drafts: AlertaDraft[]): Promise<{ created: number; merged: number; suppressed: number }> {
  let created = 0;
  let merged = 0;
  let suppressed = 0;
  const hace7d = new Date(Date.now() - 7 * 86_400_000);

  for (const d of drafts) {
    if (d.cuentaId.startsWith("client:")) continue; // sin cuenta → solo snapshot/digest

    const viva = await prisma.alertaCobro.findFirst({
      where: { dedupeKey: d.dedupeKey, estado: { in: ["ABIERTA", "VISTA"] } },
      orderBy: { lastDetectedAt: "desc" },
    });
    if (viva) {
      const escalada =
        URGENCIA_PESO[d.urgencia] > URGENCIA_PESO[viva.urgencia] ? d.urgencia : viva.urgencia;
      await prisma.alertaCobro.update({
        where: { id: viva.id },
        data: {
          occurrences: { increment: 1 },
          lastDetectedAt: new Date(),
          mensaje: d.mensaje,
          urgencia: escalada as never,
          evidencia: (d.evidencia ?? undefined) as Prisma.InputJsonValue | undefined,
        },
      });
      merged++;
      continue;
    }

    const cerradaReciente = await prisma.alertaCobro.findFirst({
      where: {
        dedupeKey: d.dedupeKey,
        estado: { in: ["RESUELTA", "DESCARTADA"] },
        updatedAt: { gte: hace7d },
      },
    });
    if (cerradaReciente) {
      suppressed++;
      continue;
    }

    await prisma.alertaCobro.create({
      data: {
        cuentaId: d.cuentaId,
        cobroId: d.cobroId ?? null,
        tipo: d.tipo,
        urgencia: d.urgencia,
        mensaje: d.mensaje,
        evidencia: (d.evidencia ?? undefined) as Prisma.InputJsonValue | undefined,
        dedupeKey: d.dedupeKey,
      },
    });
    created++;
  }
  return { created, merged, suppressed };
}

export async function patchAlerta(
  alertaId: string,
  patch: z.infer<typeof alertaPatchSchema>,
  byEmail: string,
) {
  const data: Prisma.AlertaCobroUpdateInput = {};
  if (patch.estado !== undefined) {
    data.estado = patch.estado as never;
    if (patch.estado === "VISTA") {
      data.vistaEn = new Date();
      data.vistaPor = byEmail;
    }
    if (patch.estado === "RESUELTA" || patch.estado === "DESCARTADA") {
      data.resueltaEn = new Date();
      data.resueltaPor = byEmail;
    }
    if (patch.estado === "ABIERTA") {
      data.vistaEn = null;
      data.vistaPor = null;
      data.resueltaEn = null;
      data.resueltaPor = null;
    }
  }
  // Snooze manual: posponer NO cambia el estado — la alerta sale del feed
  // (filtro en loadAlertas) y vuelve sola cuando la fecha llega.
  if (patch.posponerHasta !== undefined) {
    data.posponerHasta = patch.posponerHasta ? dayUTC(patch.posponerHasta) : null;
  }
  return prisma.alertaCobro.update({ where: { id: alertaId }, data });
}

// ── Bitácora ────────────────────────────────────────────────────────────────────

export async function addBitacora(
  cuentaId: string,
  data: z.infer<typeof bitacoraCreateSchema>,
  byEmail: string,
) {
  return prisma.bitacoraCobro.create({
    data: {
      cuentaId,
      cobroId: data.cobroId ?? null,
      tipo: data.tipo,
      contenido: data.contenido,
      usuarioEmail: byEmail,
    },
  });
}

// ── Costos recurrentes (fase 4 — SUPER_ADMIN-only) ──────────────────────────────
// ⚠ PRIVACIDAD: llamadas SOLO desde routes con guardCostosAccess. Reglas duras:
//  - Los mensajes de CobranzaError de costos NO llevan montos (van a logs/toasts).
//  - El CRUD de costos JAMÁS escribe en BitacoraCobro (ADMIN-visible) ni en
//    ninguna otra superficie visible para no-SUPER_ADMIN.
//  - Sin tracking de pago: un costo no tiene estado "pagado" ni semáforo.

const round4 = (n: number) => Math.round(n * 10_000) / 10_000;
const decimalONull = (d: Prisma.Decimal | null) => (d == null ? null : Number(d));

export async function createCosto(data: z.infer<typeof costoCreateSchema>) {
  if (data.teamMemberId) {
    const persona = await prisma.teamMember.findUnique({
      where: { id: data.teamMemberId },
      select: { id: true },
    });
    if (!persona) throw new CobranzaError("La persona vinculada no existe.", 400);
  }
  return prisma.costoRecurrente.create({
    data: {
      categoria: data.categoria,
      nombre: data.nombre,
      monto: data.monto,
      moneda: data.moneda,
      frecuencia: data.frecuencia,
      teamMemberId: data.teamMemberId ?? null,
      montoBase: data.montoBase ?? null,
      factorCargas: data.factorCargas != null ? round4(data.factorCargas) : null,
      activo: data.activo ?? true,
      notas: data.notas ?? null,
    },
    select: { id: true },
  });
}

export async function updateCosto(costoId: string, data: z.infer<typeof costoPatchSchema>) {
  const actual = await prisma.costoRecurrente.findUnique({ where: { id: costoId } });
  if (!actual) throw new CobranzaError("El costo no existe.", 404);

  // Cross-field sobre la fila MERGEADA (un partial puede traer teamMemberId sin
  // categoria, o base sin factor): la validación de forma la hizo Zod; acá se
  // valida la COHERENCIA del resultado final.
  const merged = {
    categoria: data.categoria ?? actual.categoria,
    teamMemberId: data.teamMemberId !== undefined ? data.teamMemberId : actual.teamMemberId,
    montoBase: data.montoBase !== undefined ? data.montoBase : decimalONull(actual.montoBase),
    factorCargas:
      data.factorCargas !== undefined ? data.factorCargas : decimalONull(actual.factorCargas),
  };
  const esSalario = merged.categoria === "SALARIO";
  if (!esSalario) {
    // Salir de SALARIO fuerza a soltar persona y helper base+factor.
    merged.teamMemberId = null;
    merged.montoBase = null;
    merged.factorCargas = null;
  }
  if ((merged.montoBase == null) !== (merged.factorCargas == null)) {
    throw new CobranzaError("Base y factor van juntos (o ninguno).", 400);
  }
  if (merged.teamMemberId) {
    const persona = await prisma.teamMember.findUnique({
      where: { id: merged.teamMemberId },
      select: { id: true },
    });
    if (!persona) throw new CobranzaError("La persona vinculada no existe.", 400);
  }

  return prisma.costoRecurrente.update({
    where: { id: costoId },
    data: {
      ...(data.categoria !== undefined ? { categoria: data.categoria } : {}),
      ...(data.nombre !== undefined ? { nombre: data.nombre } : {}),
      ...(data.monto !== undefined ? { monto: data.monto } : {}),
      ...(data.moneda !== undefined ? { moneda: data.moneda } : {}),
      ...(data.frecuencia !== undefined ? { frecuencia: data.frecuencia } : {}),
      teamMemberId: merged.teamMemberId,
      montoBase: merged.montoBase,
      factorCargas: merged.factorCargas != null ? round4(merged.factorCargas) : null,
      ...(data.activo !== undefined ? { activo: data.activo } : {}),
      ...(data.notas !== undefined ? { notas: data.notas } : {}),
    },
    select: { id: true },
  });
}

export async function deleteCosto(costoId: string) {
  try {
    await prisma.costoRecurrente.delete({ where: { id: costoId } });
  } catch {
    // P2025 (no existe) u otro error de borrado — sin detalles en el mensaje.
    throw new CobranzaError("El costo no existe.", 404);
  }
}
