/**
 * /api/cobranza/servicios/[servicioId]/generar — materializar los cobros.
 *   GET  → lo que PASARÍA si se regenera, sin escribir nada, más la huella del cronograma.
 *   POST → engine (materialize → reconcile → catch-up) + transacción. IDEMPOTENTE:
 *          re-apretarlo sin cambios de plan = 0 mutaciones. Los catch-up nacen
 *          PROGRAMADO + alerta INCONSISTENCIA_CICLO (Alex confirma — nunca COBRADO solo).
 *          Con `liberar` en el cuerpo, además suelta las facturas que el acuerdo nuevo ya no
 *          justifica — y eso exige permiso de EDICIÓN, no de lectura.
 */
import { NextRequest, NextResponse } from "next/server";
import { guardCobranzaAccess, guardCobranzaEditor } from "@/lib/auth/api-guards";
import {
  CobranzaError,
  generateCobros,
  huellaDelCronograma,
  liberarYRegenerar,
  planificarCobros,
} from "@/lib/cobranza/mutations";
import { planDeCambios } from "@/lib/cobranza/plan-vs-cobros";
import { liberarPostSchema } from "@/lib/cobranza/schema";
import { crDateParts } from "@/lib/jobs/time";

type Params = { params: Promise<{ servicioId: string }> };

/**
 * El preview. Lectura pura, así que le alcanza con el permiso de ver el módulo: mirar qué
 * pasaría no cambia nada.
 *
 * ⚠ Devuelve lo que calcula **la misma función que después ejecuta**. Si el cliente
 * recalculara por su cuenta, terminaría mostrando algo que el servidor no va a hacer.
 */
export async function GET(_req: NextRequest, { params }: Params) {
  const guard = await guardCobranzaAccess();
  if (guard instanceof NextResponse) return guard;
  const { servicioId } = await params;

  try {
    const p = await planificarCobros(servicioId, crDateParts(new Date()).dateKey);
    const preview = planDeCambios(
      p.drafts,
      p.servicio.cobros.map((c) => ({
        id: c.id,
        numCuota: c.numCuota,
        periodo: c.periodo,
        monto: c.monto,
        estado: c.estado,
        fechaEmision: c.fechaEmisionISO,
        origen: c.origen,
        fechaProgramadaISO: c.fechaProgramadaISO,
        promesaPago: c.promesaPagoISO,
      })),
    );
    return NextResponse.json({ preview, huella: huellaDelCronograma(p) });
  } catch (e) {
    if (e instanceof CobranzaError) {
      /* ⚠ El 409 del plan descuadrado se DEVUELVE, no se traga: es justo lo que la persona
         tiene que ver ANTES de confirmar, no después de intentarlo. */
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    throw e;
  }
}

export async function POST(req: NextRequest, { params }: Params) {
  const { servicioId } = await params;

  let raw: unknown = null;
  try {
    raw = await req.json();
  } catch {
    /* Sin cuerpo = el botón «Generar cobros» de siempre. */
  }

  const parsed = raw === null ? null : liberarPostSchema.safeParse(raw);
  if (parsed && !parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Input inválido" }, { status: 400 });
  }
  const liberar = parsed?.success ? parsed.data.liberar : [];

  /* ⚠ El guard depende de lo que se pide. Sin `liberar` esto se comporta EXACTAMENTE como
     antes; con `liberar` está soltando facturas ya emitidas, que es otra cosa. */
  const guard = liberar.length > 0 ? await guardCobranzaEditor() : await guardCobranzaAccess();
  if (guard instanceof NextResponse) return guard;

  const todayISO = crDateParts(new Date()).dateKey;
  try {
    if (liberar.length > 0) {
      const result = await liberarYRegenerar(
        servicioId,
        liberar,
        guard.user.email,
        todayISO,
        parsed?.success ? parsed.data.huella : undefined,
        parsed?.success ? parsed.data.corregirViaCobro : false,
      );
      return NextResponse.json({ result });
    }
    const result = await generateCobros(servicioId, guard.user.email, todayISO);
    return NextResponse.json({ result });
  } catch (e) {
    if (e instanceof CobranzaError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    throw e;
  }
}
