/**
 * /api/sales/exploraciones/[id]/acceso — el «Acceso» de La escala, en la cuenta y en la preventa
 * (lib/exploraciones/acceso-a-la-escala.ts).
 *
 *   GET     → el estado del enlace, cuánto vería el cliente hoy y si hay cambios sin publicar.
 *   POST    → crea el enlace, o da uno nuevo si estaba revocado, y publica lo de hoy si nunca se publicó. 409 si no hay
 *             nada con evidencia. En segundo plano, el agente escribe la descripción de los equipos que no tienen una
 *             vigente (lib/exploraciones/descripcion-de-la-escala-server.ts): le llega al cliente cuando alguien publica.
 *             Nunca se publica solo después (revisión del 16 nov: al renovar un enlace publicaba el borrador a medio editar).
 *   PATCH   → «Publicar» (16 nov): el cliente pasa a ver lo de hoy (lib/exploraciones/escala-publicada.ts). 409 sin acceso.
 *   DELETE  → revoca: el enlace deja de abrir.
 * Mirar pide leer la exploración; crear y revocar, poder cambiarla (lib/exploraciones/guardia.ts).
 */
import { after, NextRequest, NextResponse } from "next/server";
import { esquemaDesactualizado } from "@/lib/db/esquema";
import { crearAcceso, ErrorDelAcceso, estadoDelAcceso, publicarLaEscala, revocarAcceso, type EstadoDelAcceso } from "@/lib/exploraciones/acceso-a-la-escala";
import { generarDescripcionesDeLaEscala } from "@/lib/exploraciones/descripcion-de-la-escala-server";
import { guardDeLaExploracion } from "@/lib/exploraciones/guardia";

type Ctx = { params: Promise<{ id: string }> };

async function responder(hacer: () => Promise<EstadoDelAcceso>) {
  try {
    return NextResponse.json(await hacer());
  } catch (e) {
    if (e instanceof ErrorDelAcceso) return NextResponse.json({ error: e.message }, { status: e.status });
    if (esquemaDesactualizado(e))
      return NextResponse.json({ error: "Falta aplicar scripts/sql/2026-10-30-acceso-a-la-escala.sql y 2026-11-16-escala-publicada.sql, y reiniciar." }, { status: 503 });
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
  // Con el enlace creado, la descripción del agente para los equipos que no la tienen. NO se publica sola: lo que llega
  // al cliente lo decide una persona con «Publicar», que la cuenta como cambio al volver a mirar (al volver a la
  // pestaña o con el próximo cambio); mientras tanto el cliente ve la descripción de respaldo.
  if (r.ok) {
    after(() =>
      generarDescripcionesDeLaEscala({ exploracionId: id, email: guard.email, soloFaltantes: true })
        .then((x) => (x.ok ? undefined : console.warn("[acceso a la escala] la descripción no se escribió:", x.error)))
        .catch((e) => console.error("[acceso a la escala] la descripción falló", e)),
    );
  }
  return r;
}

export async function PATCH(_req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const guard = await guardDeLaExploracion(id, "write");
  if (guard instanceof NextResponse) return guard;
  return responder(async () => {
    await publicarLaEscala(id, guard.email);
    return estadoDelAcceso(id);
  });
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const guard = await guardDeLaExploracion(id, "write");
  if (guard instanceof NextResponse) return guard;
  return responder(() => revocarAcceso(id));
}
