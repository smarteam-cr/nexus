/**
 * /api/sales/exploraciones/[id]/acceso — el «Acceso» de La escala, en la cuenta y en la preventa
 * (lib/exploraciones/acceso-a-la-escala.ts).
 *
 *   GET     → el estado del enlace y cuánto vería el cliente hoy.
 *   POST    → crea el enlace, o da uno nuevo si estaba revocado. 409 si no hay nada con evidencia. En segundo plano, el
 *             agente escribe la descripción de los equipos que no tienen una vigente (lib/exploraciones/descripcion-de-la-escala-server.ts).
 *   DELETE  → revoca: el enlace deja de abrir.
 * Mirar pide leer la exploración; crear y revocar, poder cambiarla (lib/exploraciones/guardia.ts).
 */
import { after, NextRequest, NextResponse } from "next/server";
import { esquemaDesactualizado } from "@/lib/db/esquema";
import { crearAcceso, ErrorDelAcceso, estadoDelAcceso, revocarAcceso, type EstadoDelAcceso } from "@/lib/exploraciones/acceso-a-la-escala";
import { generarDescripcionesDeLaEscala } from "@/lib/exploraciones/descripcion-de-la-escala-server";
import { guardDeLaExploracion } from "@/lib/exploraciones/guardia";

type Ctx = { params: Promise<{ id: string }> };

async function responder(hacer: () => Promise<EstadoDelAcceso>) {
  try {
    return NextResponse.json(await hacer());
  } catch (e) {
    if (e instanceof ErrorDelAcceso) return NextResponse.json({ error: e.message }, { status: e.status });
    if (esquemaDesactualizado(e)) return NextResponse.json({ error: "Falta aplicar scripts/sql/2026-10-30-acceso-a-la-escala.sql y reiniciar." }, { status: 503 });
    throw e;
  }
}

export async function GET(_req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const guard = await guardDeLaExploracion(id, "read");
  if (guard instanceof NextResponse) return guard;
  return responder(() => estadoDelAcceso(id));
}

export async function POST(_req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const guard = await guardDeLaExploracion(id, "write");
  if (guard instanceof NextResponse) return guard;
  const r = await responder(() => crearAcceso(id, guard.email));
  // Con el enlace creado, que lo que vea el cliente ya tenga la descripción del agente (la de respaldo sale mientras tanto).
  if (r.ok) {
    after(() =>
      generarDescripcionesDeLaEscala({ exploracionId: id, email: guard.email, soloFaltantes: true })
        .then((x) => (x.ok ? undefined : console.warn("[acceso a la escala] la descripción no se escribió:", x.error)))
        .catch((e) => console.error("[acceso a la escala] la descripción falló", e)),
    );
  }
  return r;
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const guard = await guardDeLaExploracion(id, "write");
  if (guard instanceof NextResponse) return guard;
  return responder(() => revocarAcceso(id));
}
