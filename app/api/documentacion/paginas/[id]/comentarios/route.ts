import { NextRequest, NextResponse } from "next/server";
import { guardInternalUser } from "@/lib/auth/api-guards";
import { crearHilo, hilosDePagina } from "@/lib/documentacion/consultas-de-comentarios";
import { CrearHilo } from "@/lib/documentacion/esquema";

/** GET — los hilos de la página, abiertos y resueltos. Leer es de todo el equipo interno. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await guardInternalUser();
  if (guard instanceof NextResponse) return guard;

  const { id } = await params;
  const hilos = await hilosDePagina(id);
  return NextResponse.json({ hilos });
}

/**
 * POST — un hilo nuevo sobre un texto o un bloque de la página.
 *
 * ⚠ Pide usuario interno y NO la celda `documentacion.write`: comentar es de todo el equipo, en
 * todas las páginas, también las bloqueadas (Elías, 2026-09-13). Comentar no escribe la página.
 * Lo congela `lib/documentacion/guardas.test.ts`.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await guardInternalUser();
  if (guard instanceof NextResponse) return guard;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Cuerpo inválido." }, { status: 400 });
  }
  const parsed = CrearHilo.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Datos inválidos." }, { status: 400 });
  }

  const { id } = await params;
  const r = await crearHilo({ paginaId: id, ...parsed.data, email: guard.user.email });
  if (!r.ok) return NextResponse.json({ error: r.motivo }, { status: 404 });
  return NextResponse.json({ hilo: r.hilo }, { status: 201 });
}
