/**
 * /api/sessions/[id]/lo-que-dejo — «Lo que dejó esta reunión» (lib/seguimiento).
 *
 *   GET            → la tarjeta de la reunión para quien la mira
 *   POST { huella } → «Usar todo»: revisa la minuta, confirma los pedidos fuera de alcance y usa tus tareas propuestas.
 *                     Nunca toca la ficha, la etapa, la fecha del diagnóstico ni las alertas. Con otra huella, 409 con la
 *                     tarjeta nueva y sin escribir nada.
 *
 * Las dos piden un usuario interno, y la tarjeta verifica el acceso al cliente dueño de la reunión: sin acceso (o sin
 * tarjeta), 404. Quien no tiene acceso tampoco tiene por qué enterarse de que la reunión existe.
 */
import { NextRequest, NextResponse } from "next/server";
import { guardInternalUser } from "@/lib/auth/api-guards";
import { esquemaDesactualizado } from "@/lib/db/esquema";
import { cargarTarjeta } from "@/lib/seguimiento/tarjeta-server";
import { usarTodo } from "@/lib/seguimiento/usar-todo-server";
import { UsarTodo } from "@/lib/seguimiento/schema";

type Params = { params: Promise<{ id: string }> };

const noEncontrada = () => NextResponse.json({ error: "Esa reunión no tiene nada para revisar acá." }, { status: 404 });

function errorDeEsquema(e: unknown): NextResponse {
  if (esquemaDesactualizado(e)) {
    return NextResponse.json({ error: "A la base le falta un SQL que esta tarjeta necesita. Corre npm run check:esquema." }, { status: 503 });
  }
  throw e;
}

export async function GET(_req: NextRequest, { params }: Params) {
  const guard = await guardInternalUser();
  if (guard instanceof NextResponse) return guard;
  const { id } = await params;
  try {
    const tarjeta = await cargarTarjeta(id, guard.user);
    if (!tarjeta) return noEncontrada();
    return NextResponse.json({ tarjeta });
  } catch (e) {
    return errorDeEsquema(e);
  }
}

export async function POST(req: NextRequest, { params }: Params) {
  const guard = await guardInternalUser();
  if (guard instanceof NextResponse) return guard;
  const { id } = await params;
  const parsed = UsarTodo.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Falta la huella de la tarjeta." }, { status: 400 });
  try {
    const r = await usarTodo(id, guard.user, parsed.data.huella);
    if (!r.ok && r.status === 404) return noEncontrada();
    if (!r.ok) return NextResponse.json({ error: r.error, tarjeta: r.tarjeta }, { status: 409 });
    return NextResponse.json(r);
  } catch (e) {
    return errorDeEsquema(e);
  }
}
