/**
 * /api/cobranza/odoo/emparejado — decir qué cliente de Odoo es qué cuenta de Nexus.
 *   GET            → propuestas + vínculos ya hechos + conteos. Consulta el ERP.
 *   GET ?q=texto   → buscador sobre los partners ya conocidos. NO consulta el ERP.
 *   POST           → confirmar | ignorar | desvincular.
 *
 * Acceso: guardCobranzaAccess (ADMIN + SUPER_ADMIN) — el mismo gate que el resto del módulo.
 *
 * ⚠ El GET sin `q` lee 82 clientes y 347 facturas de Odoo, así que tarda un par de segundos.
 * Es a propósito: la señal de monto necesita los montos facturados, y cachearlos sería
 * inventar una capa que nadie pidió para una pantalla que se usa un puñado de veces.
 *
 * ⛔ Ninguno de estos endpoints escribe una sola fila del espejo de facturas. Emparejar va
 * ANTES de espejar: al revés se produce un espejo mal atribuido que cuesta más limpiar.
 */
import { NextRequest, NextResponse } from "next/server";
import { guardCobranzaAccess } from "@/lib/auth/api-guards";
import {
  EmparejadoError,
  buscarEnOdoo,
  cargarEmparejado,
  confirmarVinculo,
  cuentasSinVinculo,
  desvincularPartner,
  ignorarPartner,
} from "@/lib/cobranza/odoo/servicio";
import {
  odooVinculoConfirmarSchema,
  odooVinculoDesvincularSchema,
  odooVinculoIgnorarSchema,
} from "@/lib/cobranza/schema";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const guard = await guardCobranzaAccess();
  if (guard instanceof NextResponse) return guard;

  const q = req.nextUrl.searchParams.get("q");
  if (q !== null) return NextResponse.json(await buscarEnOdoo(q));

  /* ⚠ Solo `?refrescar=1` toca el ERP. La carga normal sale del espejo y del catálogo
     guardados: consultar Odoo en cada render fue lo que provocó el bloqueo del 2026-09-02. */
  const refrescar = req.nextUrl.searchParams.get("refrescar") === "1";
  const [estado, sinVinculo] = await Promise.all([cargarEmparejado({ refrescar }), cuentasSinVinculo()]);
  return NextResponse.json({ ...estado, cuentasSinVinculo: sinVinculo });
}

export async function POST(req: NextRequest) {
  const guard = await guardCobranzaAccess();
  if (guard instanceof NextResponse) return guard;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const accion = (raw as { accion?: unknown })?.accion;
  const actor = guard.user.email;

  try {
    if (accion === "confirmar") {
      const p = odooVinculoConfirmarSchema.safeParse(raw);
      if (!p.success) return NextResponse.json({ error: p.error.issues[0]?.message ?? "Input inválido" }, { status: 400 });
      return NextResponse.json(await confirmarVinculo(p.data, actor));
    }
    if (accion === "ignorar") {
      const p = odooVinculoIgnorarSchema.safeParse(raw);
      if (!p.success) return NextResponse.json({ error: p.error.issues[0]?.message ?? "Input inválido" }, { status: 400 });
      await ignorarPartner(p.data, actor);
      return NextResponse.json({ ok: true });
    }
    if (accion === "desvincular") {
      const p = odooVinculoDesvincularSchema.safeParse(raw);
      if (!p.success) return NextResponse.json({ error: p.error.issues[0]?.message ?? "Input inválido" }, { status: 400 });
      await desvincularPartner(p.data, actor);
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: "Acción desconocida." }, { status: 400 });
  } catch (e) {
    if (e instanceof EmparejadoError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
}
