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
import { crDateParts } from "@/lib/jobs/time";
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
  gastoCreateSchema,
  gastoPatchSchema,
  ingresoVariableCreateSchema,
  ingresoVariablePatchSchema,
  tarjetaCreateSchema,
  tarjetaPatchSchema,
  tarjetaSaldoSchema,
  tarjetaCostoSchema,
  planillaGenerarSchema,
  planillaPagarSchema,
  pagoPlanillaPatchSchema,
  comisionPartnerCreateSchema,
  comisionPartnerPatchSchema,
  reglaComisionCreateSchema,
  reglaComisionPatchSchema,
  liquidarComisionSchema,
  partnerCreateSchema,
  partnerPatchSchema,
} from "./schema";
import { montoQuincena } from "./engine";
import { quincenasDelPeriodo } from "./planilla";
import { loadComisionesVendedor } from "./queries";
import { normalizePartner } from "./schema";

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
  if (patch.fechaEmision !== undefined) {
    const nuevaFecha = patch.fechaEmision ? dayUTC(patch.fechaEmision) : null;
    data.fechaEmision = nuevaFecha;
    // Auditoría de "Marcar facturado" (Tanda B) — mismo espíritu que COBRADO/
    // confirmadoPor, patrón nuevo y paralelo (no toca la tripleta de COBRADO).
    if (nuevaFecha !== null && cobro.fechaEmision === null) {
      // null → seteada: se marca facturado ahora — exige autoría.
      if (!byEmail) throw new CobranzaError("Marcar facturado exige confirmación de un usuario.", 400);
      data.facturadoPor = byEmail;
      data.facturadoEn = new Date();
    } else if (nuevaFecha === null && cobro.fechaEmision !== null) {
      // seteada → null: se revierte (error de captura) — limpia la tripleta.
      data.facturadoPor = null;
      data.facturadoEn = null;
    }
    // fecha A → fecha B (edición, no un toggle): la autoría original no cambia.
  }
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
        // ⚠ ÚNICA concesión al chokepoint por las comisiones de vendedor: si la
        // comisión de este cobro YA se liquidó, revertirlo dejaría una comisión
        // pagada sobre plata que Nexus dice que nunca entró. La comisión
        // devengada es derivada y se recalcula sola; la LIQUIDADA está congelada
        // y hay que deshacerla a mano primero.
        // Es un count server-side y el mensaje NO lleva montos: quien revierte
        // un cobro es ADMIN y las comisiones de vendedor son SUPER_ADMIN-only.
        const liquidadas = await prisma.comisionVendedor.count({
          where: { cobroIds: { has: cobroId } },
        });
        if (liquidadas > 0) {
          throw new CobranzaError(
            "Este cobro ya entró en una comisión liquidada. Hay que deshacer la liquidación antes de revertirlo.",
            409,
          );
        }
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
const hoyCR = () => crDateParts(new Date()).dateKey;

type MovimientoTipo = "ALTA" | "BAJA" | "REACTIVACION" | "PAUSA" | "CAMBIO_MONTO" | "ELIMINACION";

/**
 * Escribe un CostoMovimiento (historia append-only) con SNAPSHOT autosuficiente
 * del costo — SOLO desde las mutations de costos, en la MISMA transacción. Nunca
 * toca BitacoraCobro ni ninguna superficie no-SUPER_ADMIN.
 */
async function registrarMovimiento(
  tx: Prisma.TransactionClient,
  m: {
    costoId: string;
    tipo: MovimientoTipo;
    snapshot: {
      nombre: string;
      categoria: Prisma.CostoMovimientoCreateInput["categoria"];
      moneda: Prisma.CostoMovimientoCreateInput["moneda"];
      frecuencia: Prisma.CostoMovimientoCreateInput["frecuencia"];
      monto: Prisma.Decimal | number;
    };
    fechaEfectivaISO: string;
    usuarioEmail: string | null;
    notas?: string | null;
    montoAnterior?: number | null;
  },
) {
  await tx.costoMovimiento.create({
    data: {
      costoId: m.costoId,
      tipo: m.tipo,
      nombre: m.snapshot.nombre,
      categoria: m.snapshot.categoria,
      moneda: m.snapshot.moneda,
      frecuencia: m.snapshot.frecuencia,
      monto: m.snapshot.monto,
      montoAnterior: m.montoAnterior ?? null,
      fechaEfectiva: dayUTC(m.fechaEfectivaISO),
      usuarioEmail: m.usuarioEmail,
      notas: m.notas ?? null,
    },
  });
}

export async function createCosto(data: z.infer<typeof costoCreateSchema>, usuarioEmail: string) {
  if (data.teamMemberId) {
    const persona = await prisma.teamMember.findUnique({
      where: { id: data.teamMemberId },
      select: { id: true },
    });
    if (!persona) throw new CobranzaError("La persona vinculada no existe.", 400);
  }
  const finalizado = data.finalizadoEl != null;
  return prisma.$transaction(async (tx) => {
    const costo = await tx.costoRecurrente.create({
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
        finalizadoEl: finalizado ? dayUTC(data.finalizadoEl!) : null,
      },
    });
    // Un costo que nace finalizado (carga histórica de una baja) registra BAJA;
    // uno vigente registra ALTA (retroactiva si viene fechaEfectiva).
    await registrarMovimiento(tx, {
      costoId: costo.id,
      tipo: finalizado ? "BAJA" : "ALTA",
      snapshot: costo,
      fechaEfectivaISO: finalizado ? data.finalizadoEl! : (data.fechaEfectiva ?? hoyCR()),
      usuarioEmail,
      notas: data.motivoMovimiento ?? null,
    });
    return { id: costo.id };
  });
}

export async function updateCosto(
  costoId: string,
  data: z.infer<typeof costoPatchSchema>,
  usuarioEmail: string,
) {
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

  // Detectar transiciones que generan movimientos (antes de escribir).
  const montoAnterior = Number(actual.monto);
  const montoCambia = data.monto !== undefined && data.monto !== montoAnterior;
  const activoCambia = data.activo !== undefined && data.activo !== actual.activo;
  const finalizadoActualISO = isoDay(actual.finalizadoEl);
  const finalizadoNuevoISO = data.finalizadoEl !== undefined ? data.finalizadoEl : undefined; // string|null|undefined
  const bajaSet =
    finalizadoNuevoISO !== undefined &&
    finalizadoNuevoISO !== null &&
    finalizadoNuevoISO !== finalizadoActualISO;
  const bajaLimpia =
    finalizadoNuevoISO !== undefined && finalizadoNuevoISO === null && finalizadoActualISO !== null;

  return prisma.$transaction(async (tx) => {
    const costo = await tx.costoRecurrente.update({
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
        ...(finalizadoNuevoISO !== undefined
          ? { finalizadoEl: finalizadoNuevoISO ? dayUTC(finalizadoNuevoISO) : null }
          : {}),
      },
    });
    const hoy = hoyCR();
    const emit = (tipo: MovimientoTipo, fechaEfectivaISO: string, extra?: { montoAnterior?: number; notas?: string | null }) =>
      registrarMovimiento(tx, {
        costoId: costo.id,
        tipo,
        snapshot: costo,
        fechaEfectivaISO,
        usuarioEmail,
        notas: extra?.notas ?? null,
        montoAnterior: extra?.montoAnterior ?? null,
      });
    // Un PATCH puede disparar varios movimientos (cambió monto Y pausó).
    if (montoCambia) await emit("CAMBIO_MONTO", hoy, { montoAnterior });
    if (activoCambia) await emit(data.activo ? "REACTIVACION" : "PAUSA", hoy);
    if (bajaSet) await emit("BAJA", finalizadoNuevoISO!, { notas: data.motivoMovimiento ?? null });
    if (bajaLimpia) await emit("REACTIVACION", hoy, { notas: data.motivoMovimiento ?? null });
    return { id: costo.id };
  });
}

export async function deleteCosto(costoId: string, usuarioEmail: string) {
  const actual = await prisma.costoRecurrente.findUnique({ where: { id: costoId } });
  if (!actual) throw new CobranzaError("El costo no existe.", 404);
  // ELIMINACION se registra ANTES del delete; el FK SetNull deja el movimiento
  // con costoId null (el snapshot lo hace autosuficiente).
  await prisma.$transaction(async (tx) => {
    await registrarMovimiento(tx, {
      costoId,
      tipo: "ELIMINACION",
      snapshot: actual,
      fechaEfectivaISO: hoyCR(),
      usuarioEmail,
    });
    await tx.costoRecurrente.delete({ where: { id: costoId } });
  });
}

// ── Comisiones de PARTNER (ingreso — superficie ADMIN) ──────────────────────────
// Lo que Smarteam GANA de un aliado. Llamadas desde routes con
// `guardCobranzaAccess`, NO con el de costos: es plata que entra.
// `registradoPor` sale del guard (trazabilidad, mismo espíritu que confirmadoPor).

export async function createComisionPartner(
  data: z.infer<typeof comisionPartnerCreateSchema>,
  byEmail: string,
) {
  if (data.clientId) {
    const cliente = await prisma.client.findUnique({
      where: { id: data.clientId },
      select: { id: true },
    });
    if (!cliente) throw new CobranzaError("El cliente vinculado no existe.", 400);
  }
  const c = await prisma.comisionPartner.create({
    data: {
      partner: data.partner,
      concepto: data.concepto ?? null,
      monto: data.monto,
      moneda: data.moneda,
      fecha: dayUTC(data.fecha),
      clientId: data.clientId ?? null,
      notas: data.notas ?? null,
      registradoPor: byEmail,
    },
  });
  return { id: c.id };
}

export async function updateComisionPartner(
  comisionId: string,
  data: z.infer<typeof comisionPartnerPatchSchema>,
) {
  const actual = await prisma.comisionPartner.findUnique({
    where: { id: comisionId },
    select: { id: true },
  });
  if (!actual) throw new CobranzaError("La comisión no existe.", 404);
  await prisma.comisionPartner.update({
    where: { id: comisionId },
    data: {
      ...(data.partner !== undefined ? { partner: data.partner } : {}),
      ...(data.concepto !== undefined ? { concepto: data.concepto } : {}),
      ...(data.monto !== undefined ? { monto: data.monto } : {}),
      ...(data.moneda !== undefined ? { moneda: data.moneda } : {}),
      ...(data.fecha !== undefined ? { fecha: dayUTC(data.fecha) } : {}),
      ...(data.clientId !== undefined ? { clientId: data.clientId } : {}),
      ...(data.notas !== undefined ? { notas: data.notas } : {}),
    },
  });
  return { id: comisionId };
}

export async function deleteComisionPartner(comisionId: string) {
  const actual = await prisma.comisionPartner.findUnique({
    where: { id: comisionId },
    select: { id: true },
  });
  if (!actual) throw new CobranzaError("La comisión no existe.", 404);
  await prisma.comisionPartner.delete({ where: { id: comisionId } });
}

// ── Tarjetas de crédito (SUPER_ADMIN-only) ──────────────────────────────────────
// ⚠ Llamadas SOLO desde routes con guardCostosAccess. Una tarjeta NO emite
// `CostoMovimiento`: esa bitácora es la historia de un COSTO, y meter acá las
// altas y bajas de tarjetas la ensuciaría con eventos de otra naturaleza. La
// auditoría que sí lleva es la del saldo (`saldoPorEmail`/`saldoAlDia`), que es
// el único dato que una persona AFIRMA.
// ⚠ Y sin semáforo ni alertas: la prohibición transversal de costos sigue en pie
// aunque una tarjeta sí tenga fecha de corte.

export async function createTarjeta(data: z.infer<typeof tarjetaCreateSchema>) {
  if (data.titularTeamMemberId) {
    const persona = await prisma.teamMember.findUnique({
      where: { id: data.titularTeamMemberId },
      select: { id: true },
    });
    if (!persona) throw new CobranzaError("La persona titular no existe.", 400);
  }
  const tarjeta = await prisma.tarjetaCredito.create({
    data: {
      alias: data.alias,
      emisor: data.emisor ?? null,
      ultimos4: data.ultimos4 ?? null,
      moneda: data.moneda,
      limite: data.limite ?? null,
      titularTeamMemberId: data.titularTeamMemberId ?? null,
      diaCorte: data.diaCorte ?? null,
      diaPago: data.diaPago ?? null,
      activa: data.activa ?? true,
      notas: data.notas ?? null,
    },
  });
  return { id: tarjeta.id };
}

export async function updateTarjeta(tarjetaId: string, data: z.infer<typeof tarjetaPatchSchema>) {
  const actual = await prisma.tarjetaCredito.findUnique({
    where: { id: tarjetaId },
    select: { id: true },
  });
  if (!actual) throw new CobranzaError("La tarjeta no existe.", 404);

  if (data.titularTeamMemberId) {
    const persona = await prisma.teamMember.findUnique({
      where: { id: data.titularTeamMemberId },
      select: { id: true },
    });
    if (!persona) throw new CobranzaError("La persona titular no existe.", 400);
  }

  // ⚠ El saldo NO se toca desde acá: tiene su propia mutación porque exige
  // fecha de corte y autoría. Un PATCH genérico podría moverlo sin ninguna de
  // las dos y el disponible pasaría a ser un número sin respaldo.
  await prisma.tarjetaCredito.update({
    where: { id: tarjetaId },
    data: {
      ...(data.alias !== undefined ? { alias: data.alias } : {}),
      ...(data.emisor !== undefined ? { emisor: data.emisor } : {}),
      ...(data.ultimos4 !== undefined ? { ultimos4: data.ultimos4 } : {}),
      ...(data.moneda !== undefined ? { moneda: data.moneda } : {}),
      ...(data.limite !== undefined ? { limite: data.limite } : {}),
      ...(data.titularTeamMemberId !== undefined
        ? { titularTeamMemberId: data.titularTeamMemberId }
        : {}),
      ...(data.diaCorte !== undefined ? { diaCorte: data.diaCorte } : {}),
      ...(data.diaPago !== undefined ? { diaPago: data.diaPago } : {}),
      ...(data.activa !== undefined ? { activa: data.activa } : {}),
      ...(data.notas !== undefined ? { notas: data.notas } : {}),
    },
  });
  return { id: tarjetaId };
}

export async function deleteTarjeta(tarjetaId: string) {
  const actual = await prisma.tarjetaCredito.findUnique({
    where: { id: tarjetaId },
    select: { id: true },
  });
  if (!actual) throw new CobranzaError("La tarjeta no existe.", 404);
  // El puente cae por CASCADE: borrar la tarjeta no borra ningún costo, solo el
  // vínculo. Los costos siguen vivos y contando en el burn, que es lo correcto.
  await prisma.tarjetaCredito.delete({ where: { id: tarjetaId } });
}

/**
 * Registrar el saldo usado, con su fecha de corte y quién lo afirma. Es la
 * ÚNICA verdad del disponible: Nexus no lo deriva de los costos asignados.
 */
export async function registrarSaldoTarjeta(
  tarjetaId: string,
  data: z.infer<typeof tarjetaSaldoSchema>,
  usuarioEmail: string,
) {
  if (!usuarioEmail) {
    throw new CobranzaError("Registrar el saldo exige confirmación de un usuario.", 400);
  }
  const actual = await prisma.tarjetaCredito.findUnique({
    where: { id: tarjetaId },
    select: { id: true },
  });
  if (!actual) throw new CobranzaError("La tarjeta no existe.", 404);

  await prisma.tarjetaCredito.update({
    where: { id: tarjetaId },
    data: {
      saldoUsado: data.saldoUsado,
      saldoAlDia: dayUTC(data.saldoAlDia),
      saldoPorEmail: usuarioEmail,
    },
  });
  return { id: tarjetaId };
}

/** Asignar o quitar un costo recurrente de la tarjeta (la tabla puente). */
export async function asignarCostoATarjeta(
  tarjetaId: string,
  data: z.infer<typeof tarjetaCostoSchema>,
) {
  const [tarjeta, costo] = await Promise.all([
    prisma.tarjetaCredito.findUnique({ where: { id: tarjetaId }, select: { id: true } }),
    prisma.costoRecurrente.findUnique({ where: { id: data.costoId }, select: { id: true } }),
  ]);
  if (!tarjeta) throw new CobranzaError("La tarjeta no existe.", 404);
  if (!costo) throw new CobranzaError("El costo no existe.", 404);

  if (data.asignar) {
    // Idempotente: re-asignar lo ya asignado no es un error, es un no-op.
    await prisma.tarjetaCreditoCosto.upsert({
      where: { tarjetaId_costoId: { tarjetaId, costoId: data.costoId } },
      create: { tarjetaId, costoId: data.costoId },
      update: {},
    });
  } else {
    await prisma.tarjetaCreditoCosto.deleteMany({ where: { tarjetaId, costoId: data.costoId } });
  }
  return { id: tarjetaId };
}

// ── Libro de planilla (SUPER_ADMIN-only) ────────────────────────────────────────
// ⚠ Llamadas SOLO desde routes con guardCostosAccess.

/**
 * Materializa las dos filas de una quincena para TODOS los salarios activos.
 *
 * ⚠ CREATE-ONLY: nunca update, nunca delete. Si alguien sube un salario a mitad
 * de mes, un `toUpdate` reescribiría la Q2 pendiente al monto nuevo con la Q1 ya
 * pagada al viejo — y Q1+Q2 no daría ningún salario. Re-generar una quincena ya
 * generada es un NO-OP (`skipDuplicates` sobre el @@unique), no un error.
 *
 * La lista de personas se deriva ACÁ y no viene del cliente: así nadie puede
 * pedir que se materialice a alguien que ya no está en planilla.
 *
 * El monto sale de `montoQuincena` UNA vez y queda congelado como snapshot —
 * desde ese momento la fila es la verdad, no el costo.
 */
export async function generarQuincena(
  data: z.infer<typeof planillaGenerarSchema>,
): Promise<{ creadas: number; yaExistian: number; sinPersona: number }> {
  const quincenas = quincenasDelPeriodo(data.periodo);
  const dia = quincenas.find((q) => q.quincena === data.quincena);
  if (!dia) throw new CobranzaError("Período o quincena inválidos.", 400);

  const salarios = await prisma.costoRecurrente.findMany({
    where: { categoria: "SALARIO", activo: true, finalizadoEl: null },
    select: {
      nombre: true,
      monto: true,
      moneda: true,
      teamMemberId: true,
      teamMember: { select: { name: true } },
    },
  });

  // Un salario sin persona ligada no puede entrar: el @@unique del libro es
  // (persona, período, quincena), y con NULL los duplicados no colisionan — se
  // crearían filas repetidas en cada corrida. Se reportan para que alguien ate
  // ese costo a su TeamMember, en vez de meterlos a medias.
  const conPersona = salarios.filter((s) => s.teamMemberId !== null);
  const sinPersona = salarios.length - conPersona.length;

  const filas = conPersona.map((s) => ({
    sujetoTeamMemberId: s.teamMemberId!,
    sujetoNombre: s.teamMember?.name ?? s.nombre,
    periodo: data.periodo,
    quincena: data.quincena,
    fechaProgramada: dayUTC(dia.fechaProgramada),
    monto: montoQuincena(Number(s.monto), data.quincena),
    moneda: s.moneda,
  }));

  const res = await prisma.pagoPlanilla.createMany({ data: filas, skipDuplicates: true });
  return { creadas: res.count, yaExistian: filas.length - res.count, sinPersona };
}

/**
 * CHOKEPOINT del libro (INV18, espejo de INV3): marcar una quincena PAGADA exige
 * `byEmail` y deja `confirmadoPor`/`confirmadoEn`. Ninguna otra ruta escribe
 * `estado = PAGADO`.
 *
 * `fechaPago` default hoy: la plata suele salir días antes de que alguien la
 * registre, así que la fecha real se puede escribir hacia atrás.
 *
 * ⚠ Acá va a engancharse la liquidación de comisiones de esa persona (F3),
 * DENTRO de esta misma transacción — por eso ya es una `$transaction` aunque hoy
 * tenga un solo write: agregar el segundo no debe cambiar la forma.
 */
export async function pagarQuincena(
  pagoId: string,
  data: z.infer<typeof planillaPagarSchema>,
  byEmail: string,
) {
  if (!byEmail) {
    throw new CobranzaError("Marcar pagada una quincena exige confirmación de un usuario.", 400);
  }
  const actual = await prisma.pagoPlanilla.findUnique({ where: { id: pagoId } });
  if (!actual) throw new CobranzaError("La quincena no existe.", 404);
  if (actual.estado === "PAGADO") {
    throw new CobranzaError("Esa quincena ya está pagada.", 409);
  }

  return prisma.$transaction(async (tx) => {
    await tx.pagoPlanilla.update({
      where: { id: pagoId },
      data: {
        estado: "PAGADO",
        fechaPago: data.fechaPago ? dayUTC(data.fechaPago) : dayUTC(hoyCR()),
        confirmadoPor: byEmail,
        confirmadoEn: new Date(),
        ...(data.notas !== undefined ? { notas: data.notas } : {}),
      },
    });
    return { id: pagoId };
  });
}

/**
 * Editar una quincena PENDIENTE (corregir el monto sugerido antes de pagarla).
 * Un PAGADO es intocable: frena con 409 en vez de reescribir historia.
 */
export async function updatePagoPlanilla(
  pagoId: string,
  data: z.infer<typeof pagoPlanillaPatchSchema>,
) {
  const actual = await prisma.pagoPlanilla.findUnique({
    where: { id: pagoId },
    select: { estado: true },
  });
  if (!actual) throw new CobranzaError("La quincena no existe.", 404);
  if (actual.estado === "PAGADO") {
    throw new CobranzaError("Una quincena PAGADA no se edita.", 409);
  }
  await prisma.pagoPlanilla.update({
    where: { id: pagoId },
    data: {
      ...(data.monto !== undefined ? { monto: data.monto } : {}),
      ...(data.notas !== undefined ? { notas: data.notas } : {}),
    },
  });
  return { id: pagoId };
}

/** Borrar una quincena PENDIENTE (se generó de más). Un PAGADO no se borra. */
export async function deletePagoPlanilla(pagoId: string) {
  const actual = await prisma.pagoPlanilla.findUnique({
    where: { id: pagoId },
    select: { estado: true },
  });
  if (!actual) throw new CobranzaError("La quincena no existe.", 404);
  if (actual.estado === "PAGADO") {
    throw new CobranzaError("Una quincena PAGADA no se borra.", 409);
  }
  await prisma.pagoPlanilla.delete({ where: { id: pagoId } });
}

// ── Gastos puntuales (fase 4.5 — SUPER_ADMIN-only) ──────────────────────────────
// Misma línea dura que los costos: sin tracking de pago, sin fuga de montos.

// ── Ingresos variables ──────────────────────────────────────────────────────────
// Entradas fuera del ciclo quincenal SIN servicio contratado detrás. No pasan por
// `cambiarEstadoCobro` porque NO son cobros: no hay factura, ni crédito, ni
// semáforo, ni INV3 que sostener. `registradoPor` deja la trazabilidad (mismo
// espíritu que confirmadoPor).

export async function createIngresoVariable(
  data: z.infer<typeof ingresoVariableCreateSchema>,
  byEmail: string,
) {
  return prisma.ingresoVariable.create({
    data: {
      concepto: data.concepto,
      monto: data.monto,
      moneda: data.moneda,
      fecha: dayUTC(data.fecha),
      clientId: data.clientId ?? null,
      notas: data.notas ?? null,
      registradoPor: byEmail,
    },
    select: { id: true },
  });
}

export async function updateIngresoVariable(
  ingresoId: string,
  data: z.infer<typeof ingresoVariablePatchSchema>,
) {
  try {
    return await prisma.ingresoVariable.update({
      where: { id: ingresoId },
      data: {
        ...(data.concepto !== undefined ? { concepto: data.concepto } : {}),
        ...(data.monto !== undefined ? { monto: data.monto } : {}),
        ...(data.moneda !== undefined ? { moneda: data.moneda } : {}),
        ...(data.fecha !== undefined ? { fecha: dayUTC(data.fecha) } : {}),
        ...(data.clientId !== undefined ? { clientId: data.clientId ?? null } : {}),
        ...(data.notas !== undefined ? { notas: data.notas ?? null } : {}),
      },
      select: { id: true },
    });
  } catch {
    throw new CobranzaError("No se encontró el ingreso", 404);
  }
}

export async function deleteIngresoVariable(ingresoId: string) {
  try {
    return await prisma.ingresoVariable.delete({ where: { id: ingresoId }, select: { id: true } });
  } catch {
    throw new CobranzaError("No se encontró el ingreso", 404);
  }
}

export async function createGasto(data: z.infer<typeof gastoCreateSchema>) {
  return prisma.gastoPuntual.create({
    data: {
      nombre: data.nombre,
      monto: data.monto,
      moneda: data.moneda,
      fecha: dayUTC(data.fecha),
      tags: data.tags,
      notas: data.notas ?? null,
    },
    select: { id: true },
  });
}

export async function updateGasto(gastoId: string, data: z.infer<typeof gastoPatchSchema>) {
  try {
    return await prisma.gastoPuntual.update({
      where: { id: gastoId },
      data: {
        ...(data.nombre !== undefined ? { nombre: data.nombre } : {}),
        ...(data.monto !== undefined ? { monto: data.monto } : {}),
        ...(data.moneda !== undefined ? { moneda: data.moneda } : {}),
        ...(data.fecha !== undefined ? { fecha: dayUTC(data.fecha) } : {}),
        ...(data.tags !== undefined ? { tags: data.tags } : {}),
        ...(data.notas !== undefined ? { notas: data.notas } : {}),
      },
      select: { id: true },
    });
  } catch {
    throw new CobranzaError("El gasto no existe.", 404);
  }
}

export async function deleteGasto(gastoId: string) {
  try {
    await prisma.gastoPuntual.delete({ where: { id: gastoId } });
  } catch {
    throw new CobranzaError("El gasto no existe.", 404);
  }
}

// ── Comisiones de VENDEDOR (remuneración — SUPER_ADMIN-only) ───────────────────
// Se persisten DOS cosas y ninguna es la comisión devengada: la REGLA (el % que
// le toca a alguien) y, al liquidar, la comisión CONGELADA. Lo devengado se
// deriva de los cobros COBRADO en cada lectura — ver lib/cobranza/comisiones.ts.

export async function createReglaComision(data: z.infer<typeof reglaComisionCreateSchema>) {
  return prisma.reglaComisionVendedor.create({
    data: {
      teamMemberId: data.teamMemberId,
      clientId: data.clientId ?? null,
      porcentaje: data.porcentaje,
      vigenteDesde: dayUTC(data.vigenteDesde),
      vigenteHasta: data.vigenteHasta ? dayUTC(data.vigenteHasta) : null,
      notas: data.notas ?? null,
    },
    select: { id: true },
  });
}

export async function updateReglaComision(
  reglaId: string,
  data: z.infer<typeof reglaComisionPatchSchema>,
) {
  try {
    return await prisma.reglaComisionVendedor.update({
      where: { id: reglaId },
      data: {
        ...(data.teamMemberId !== undefined ? { teamMemberId: data.teamMemberId } : {}),
        ...(data.clientId !== undefined ? { clientId: data.clientId ?? null } : {}),
        ...(data.porcentaje !== undefined ? { porcentaje: data.porcentaje } : {}),
        ...(data.vigenteDesde !== undefined ? { vigenteDesde: dayUTC(data.vigenteDesde) } : {}),
        ...(data.vigenteHasta !== undefined
          ? { vigenteHasta: data.vigenteHasta ? dayUTC(data.vigenteHasta) : null }
          : {}),
        ...(data.notas !== undefined ? { notas: data.notas ?? null } : {}),
      },
      select: { id: true },
    });
  } catch {
    throw new CobranzaError("La regla no existe.", 404);
  }
}

/**
 * Borrar una regla NO toca lo ya liquidado: esas filas llevan su propio snapshot
 * de porcentaje y monto justamente para sobrevivir a esto. Lo que sí cambia es
 * lo DEVENGADO de acá en adelante, que es lo que se espera al borrarla.
 */
export async function deleteReglaComision(reglaId: string) {
  try {
    await prisma.reglaComisionVendedor.delete({ where: { id: reglaId } });
  } catch {
    throw new CobranzaError("La regla no existe.", 404);
  }
}

/**
 * Liquidar lo devengado de una persona en un período y una moneda.
 *
 * ⚠ El monto NO viene del cliente: se RECALCULA con el mismo cálculo puro que
 * pintó la pantalla. Si el navegador pudiera mandarlo, la comisión sería lo que
 * dijo el navegador y no lo que dicen los cobros.
 *
 * Congela un snapshot autosuficiente (patrón `CostoMovimiento`): la fila se lee
 * sola aunque después cambien la regla, el cobro o la persona.
 */
export async function liquidarComision(
  data: z.infer<typeof liquidarComisionSchema>,
  byEmail: string,
) {
  if (!byEmail) throw new CobranzaError("Liquidar exige confirmación de un usuario.", 400);

  const { devengadas } = await loadComisionesVendedor();
  const d = devengadas.find(
    (x) =>
      x.teamMemberId === data.teamMemberId &&
      x.periodo === data.periodo &&
      x.moneda === data.moneda,
  );
  if (!d) {
    throw new CobranzaError(
      "No hay nada devengado para esa persona en ese período y esa moneda. Puede que ya se haya liquidado.",
      409,
    );
  }

  // La quincena a la que se engancha tiene que ser de la MISMA persona: pagarle
  // la comisión de alguien junto al salario de otro sería un error mudo.
  if (data.pagoPlanillaId) {
    const pago = await prisma.pagoPlanilla.findUnique({
      where: { id: data.pagoPlanillaId },
      select: { sujetoTeamMemberId: true, moneda: true },
    });
    if (!pago) throw new CobranzaError("La quincena no existe.", 404);
    if (pago.sujetoTeamMemberId !== data.teamMemberId) {
      throw new CobranzaError("Esa quincena es de otra persona.", 409);
    }
    if (pago.moneda !== data.moneda) {
      throw new CobranzaError(
        "La quincena está en otra moneda. Nexus no convierte: la comisión se paga en la moneda en que entró.",
        409,
      );
    }
  }

  return prisma.comisionVendedor.create({
    data: {
      teamMemberId: data.teamMemberId,
      vendedorNombre: d.vendedorNombre,
      periodo: d.periodo,
      base: d.base,
      porcentaje: d.porcentaje,
      monto: d.monto,
      // `data.moneda` viene del Zod (el enum), no del derivado: son el mismo
      // valor porque el `find` de arriba matchea por moneda.
      moneda: data.moneda,
      cobroIds: d.cobroIds,
      detalle: d.detalle as unknown as Prisma.InputJsonValue,
      pagoPlanillaId: data.pagoPlanillaId ?? null,
      liquidadoPor: byEmail,
      notas: data.notas ?? null,
    },
    select: { id: true },
  });
}

/**
 * Deshacer una liquidación. Los cobros vuelven a devengar solos (el derivado se
 * recalcula) y, con eso, el freno 409 del revert se suelta — que es exactamente
 * el camino que ese 409 le pide a quien quiere revertir un cobro.
 */
export async function deshacerLiquidacion(comisionId: string) {
  try {
    await prisma.comisionVendedor.delete({ where: { id: comisionId } });
  } catch {
    throw new CobranzaError("La liquidación no existe.", 404);
  }
}

// ── Aliados comerciales (configuración de un INGRESO — superficie ADMIN) ────────
// El aliado con su CADENCIA. Va acá y no bajo `costos/` porque es lo que Smarteam
// GANA: mismo guard que `ComisionPartner` (`guardCobranzaAccess`), no el de costos.

export async function createPartner(data: z.infer<typeof partnerCreateSchema>) {
  const clave = normalizePartner(data.nombre);
  const existente = await prisma.partnerComercial.findUnique({ where: { clave } });
  if (existente) {
    throw new CobranzaError(`Ya existe un aliado con ese nombre: «${existente.nombre}».`, 409);
  }
  return prisma.partnerComercial.create({
    data: {
      nombre: data.nombre,
      clave,
      frecuenciaMeses: data.frecuenciaMeses,
      activo: data.activo ?? true,
      notas: data.notas ?? null,
    },
    select: { id: true },
  });
}

/**
 * Editar un aliado. Renombrarlo RECALCULA la clave — es lo que hace que dos
 * grafías del mismo aliado no convivan. Si la clave nueva ya es de otro, se
 * frena con 409 en vez de reventar con el unique de la base.
 */
export async function updatePartner(
  partnerId: string,
  data: z.infer<typeof partnerPatchSchema>,
) {
  if (data.nombre !== undefined) {
    const clave = normalizePartner(data.nombre);
    const choca = await prisma.partnerComercial.findUnique({ where: { clave } });
    if (choca && choca.id !== partnerId) {
      throw new CobranzaError(`Ese nombre ya lo usa otro aliado: «${choca.nombre}».`, 409);
    }
  }
  try {
    return await prisma.partnerComercial.update({
      where: { id: partnerId },
      data: {
        ...(data.nombre !== undefined
          ? { nombre: data.nombre, clave: normalizePartner(data.nombre) }
          : {}),
        ...(data.frecuenciaMeses !== undefined ? { frecuenciaMeses: data.frecuenciaMeses } : {}),
        ...(data.activo !== undefined ? { activo: data.activo } : {}),
        ...(data.notas !== undefined ? { notas: data.notas ?? null } : {}),
      },
      select: { id: true },
    });
  } catch {
    throw new CobranzaError("El aliado no existe.", 404);
  }
}

/**
 * Borrar un aliado NO borra sus pagos: la FK es SetNull y `ComisionPartner.partner`
 * (el string) sigue siendo el snapshot de lo que se escribió. Se pierde la
 * cadencia, no la plata — y el historial vuelve a leerse mes a mes, que es la
 * degradación correcta.
 */
export async function deletePartner(partnerId: string) {
  try {
    await prisma.partnerComercial.delete({ where: { id: partnerId } });
  } catch {
    throw new CobranzaError("El aliado no existe.", 404);
  }
}
