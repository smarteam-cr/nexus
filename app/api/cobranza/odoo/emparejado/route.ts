/**
 * /api/cobranza/odoo/emparejado — decir qué cliente de Odoo es qué cuenta de Nexus.
 *   GET            → propuestas + vínculos ya hechos + conteos. Consulta el ERP.
 *   GET ?q=texto   → buscador sobre los partners ya conocidos. NO consulta el ERP.
 *   POST           → confirmar | ignorar | desvincular | via («Está en Mercury» y su «Deshacer»).
 *
 * Acceso: guardCobranzaAccess (ADMIN + SUPER_ADMIN) — el mismo gate que el resto del módulo. `via` pide
 * además EDICIÓN (guardCobranzaEditor): cambia la vía de cobro de la cuenta en todo Cobranza.
 *
 * ⚠ El GET sin `q` lee 82 clientes y 347 facturas de Odoo, así que tarda un par de segundos.
 * Es a propósito: la señal de monto necesita los montos facturados, y cachearlos sería
 * inventar una capa que nadie pidió para una pantalla que se usa un puñado de veces.
 *
 * ⛔ Del espejo de facturas escriben UNA sola cosa: confirmar y desvincular dejan las facturas
 * de ese cliente con la cuenta de su vínculo (o sin cuenta), con su fila CUENTA firmada. Montos,
 * estados y fechas siguen siendo solo del sync. La respuesta dice cuántas cambiaron.
 */
import { NextRequest, NextResponse } from "next/server";
import { guardCobranzaAccess, guardCobranzaEditor } from "@/lib/auth/api-guards";
import {
  EmparejadoError,
  buscarEnOdoo,
  cargarEmparejado,
  confirmarVinculo,
  desvincularPartner,
  ignorarPartner,
  marcarViaDesdeEmparejado,
} from "@/lib/cobranza/odoo/servicio";
import {
  odooCuentaViaSchema,
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
  return NextResponse.json(await cargarEmparejado({ refrescar }));
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
      return NextResponse.json({ ok: true, ...(await desvincularPartner(p.data, actor)) });
    }
    /* ⚠ «Está en Mercury» exige EDICIÓN, no lectura: cambia la vía de cobro de la cuenta en todo Cobranza
       (su ficha, la plataforma al soltar una factura, las facturas que se ofrecen al marcar facturado).
       Medido el 2026-09-25: solo ADMIN y SUPER_ADMIN ven Cobranza, y los dos pueden editarla. */
    if (accion === "via") {
      const editor = await guardCobranzaEditor();
      if (editor instanceof NextResponse) return editor;
      const p = odooCuentaViaSchema.safeParse(raw);
      if (!p.success) return NextResponse.json({ error: p.error.issues[0]?.message ?? "Input inválido" }, { status: 400 });
      return NextResponse.json({ ok: true, ...(await marcarViaDesdeEmparejado(p.data, editor.user.email)) });
    }
    return NextResponse.json({ error: "Acción desconocida." }, { status: 400 });
  } catch (e) {
    if (e instanceof EmparejadoError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
}
