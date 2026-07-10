/**
 * POST /api/cobranza/import/[importId]/aplicar — el APPLY del importador CSV.
 * Toma las filas VALIDA del batch EN_REVISION y las ingiere vía el AccountSource
 * "sheet" (upsert idempotente por fuente+id_externo, dedup, TX por fila). Las
 * filas REVISAR bloquean (409): se corrigen u omiten primero — nada se ingiere
 * en silencio. Best-effort: genera los cobros de las suscripciones pre-armadas.
 * Al final, UNA sola re-resolución de sesiones si se crearon clientes (JAMÁS por
 * fila — incidente 2026-07-10). Acceso: guardCobranzaAccess (ADMIN + SUPER_ADMIN).
 */
import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { guardCobranzaAccess } from "@/lib/auth/api-guards";
import { prisma } from "@/lib/db/prisma";
import { getAccountSource } from "@/lib/cobranza/adapters";
import { generateCobros } from "@/lib/cobranza/mutations";
import { importFilaCanonicaSchema } from "@/lib/cobranza/schema";
import { slugNombre } from "@/lib/cobranza/import-core";
import type { CuentaEntrante } from "@/lib/cobranza/ports";
import { resolveAllSessions } from "@/lib/sessions/resolve-client";
import { crDateParts } from "@/lib/jobs/time";

type Params = { params: Promise<{ importId: string }> };

export async function POST(_req: NextRequest, { params }: Params) {
  const guard = await guardCobranzaAccess();
  if (guard instanceof NextResponse) return guard;
  const { importId } = await params;

  const batch = await prisma.importacionCobranza.findUnique({
    where: { id: importId },
    include: { filas: { orderBy: { numFila: "asc" } } },
  });
  if (!batch) return NextResponse.json({ error: "El import no existe" }, { status: 404 });
  if (batch.estado !== "EN_REVISION") {
    return NextResponse.json(
      { error: `El import no está en revisión (estado actual: ${batch.estado}).` },
      { status: 409 },
    );
  }

  const porRevisar = batch.filas.filter((f) => f.estado === "REVISAR").length;
  if (porRevisar > 0) {
    return NextResponse.json(
      { error: `quedan ${porRevisar} filas por revisar (corregilas u omitilas)` },
      { status: 409 },
    );
  }

  const validas = batch.filas.filter((f) => f.estado === "VALIDA");
  if (validas.length === 0) {
    return NextResponse.json(
      { error: "No hay filas válidas para aplicar (todas quedaron omitidas)." },
      { status: 409 },
    );
  }

  // Filas VALIDA → CuentaEntrante[] (mismo orden: el resultado se zipea por índice).
  const cuentas: CuentaEntrante[] = [];
  const filasAplicables: typeof validas = [];
  const updates: Prisma.PrismaPromise<unknown>[] = [];
  let fallidas = 0;

  for (const fila of validas) {
    const p = importFilaCanonicaSchema.safeParse(fila.canonico);
    if (!p.success) {
      // Defensivo: una VALIDA que ya no parsea vuelve a la cola, no tumba el batch.
      fallidas++;
      updates.push(
        prisma.importacionFila.update({
          where: { id: fila.id },
          data: { estado: "REVISAR", errores: ["El canónico guardado ya no valida — revisá la fila."] },
        }),
      );
      continue;
    }
    const c = p.data;
    cuentas.push({
      fuenteRef: { fuente: "sheet", idExterno: fila.idExterno ?? slugNombre(c.clienteNombre) },
      clienteNombre: c.clienteNombre,
      dominio: c.dominio ?? null,
      correoCobro: c.correoCobro ?? null,
      tipo: c.tipo ?? undefined,
      viaCobro: c.viaCobro ?? undefined,
      moneda: c.moneda ?? undefined,
      terminosPago: c.terminosPago ?? undefined,
      diaCobroAncla: c.diaCobroAncla ?? null,
      notas: c.notas ?? null,
      suscripcion: c.suscripcionMonto
        ? {
            montoMensual: c.suscripcionMonto,
            moneda: c.suscripcionMoneda ?? c.moneda ?? "CRC",
            fechaInicio: c.suscripcionInicio ?? null,
          }
        : null,
      dedupClientId: (fila.dedup as { clientId?: string } | null)?.clientId ?? null,
    });
    filasAplicables.push(fila);
  }

  const resultados = await getAccountSource("sheet").ingest(cuentas, { byEmail: guard.user.email });

  let clientsCreados = 0;
  let cuentasCreadas = 0;
  let cuentasVinculadas = 0;
  let serviciosCreados = 0;
  resultados.forEach((r, i) => {
    const fila = filasAplicables[i];
    if (r.error) {
      fallidas++;
      updates.push(
        prisma.importacionFila.update({
          where: { id: fila.id },
          data: { estado: "REVISAR", errores: [`No se pudo aplicar: ${r.error}`] },
        }),
      );
      return;
    }
    if (r.clientCreado) clientsCreados++;
    else cuentasVinculadas++;
    if (r.cuentaCreada) cuentasCreadas++;
    if (r.servicioCreado) serviciosCreados++;
    updates.push(
      prisma.importacionFila.update({
        where: { id: fila.id },
        data: { estado: "APLICADA", aplicadoClientId: r.clientId },
      }),
    );
  });

  const omitidas = batch.filas.filter((f) => f.estado === "OMITIDA").length;
  const resumen = { clientsCreados, cuentasCreadas, cuentasVinculadas, serviciosCreados, omitidas, fallidas };

  updates.push(
    prisma.importacionCobranza.update({
      where: { id: importId },
      data: {
        estado: "APLICADO",
        resumen,
        aplicadoEn: new Date(),
        aplicadoPor: guard.user.email,
      },
    }),
  );
  await prisma.$transaction(updates);

  // Best-effort: materializar los cobros de las suscripciones recién pre-armadas.
  const todayISO = crDateParts(new Date()).dateKey;
  for (const r of resultados) {
    if (!r.servicioCreado || r.error) continue;
    try {
      const servicio = await prisma.servicioContratado.findFirst({
        where: { cuentaId: r.cuentaId, tipoServicio: "SUSCRIPCION", estado: "ACTIVO" },
        orderBy: { createdAt: "desc" },
        select: { id: true },
      });
      if (servicio) await generateCobros(servicio.id, guard.user.email, todayISO);
    } catch {
      // silencioso: el engine avisa por alertas; la persona puede regenerar a mano.
    }
  }

  // UNA sola re-resolución al final del batch, solo si se crearon clientes
  // (JAMÁS por fila — resolveAllSessions recorre ~16k sesiones).
  if (clientsCreados > 0) {
    void resolveAllSessions().catch(() => {});
  }

  return NextResponse.json({ resumen });
}
