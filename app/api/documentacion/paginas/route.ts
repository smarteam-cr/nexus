import { NextRequest, NextResponse } from "next/server";
import { guardPermission } from "@/lib/auth/api-guards";
import { crearPagina, paginaPorId } from "@/lib/documentacion/consultas";
import { CrearPagina } from "@/lib/documentacion/esquema";
import { puedeCrearBajo } from "@/lib/documentacion/permisos";

/**
 * POST /api/documentacion/paginas — crea una página (o una subpágina, si viene `parentId`).
 *
 * Nace vacía y con su dirección ya fijada: el slug sale del título y NO cambia al renombrar, así
 * un enlace pegado en un chat sigue funcionando. Una página madre bloqueada no acepta subpáginas
 * nuevas: el árbol que cuelga de ella es parte de lo que se está protegiendo.
 */
export async function POST(req: NextRequest) {
  const guard = await guardPermission("documentacion", "write");
  if (guard instanceof NextResponse) return guard;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Cuerpo inválido." }, { status: 400 });
  }

  const parsed = CrearPagina.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Datos inválidos." },
      { status: 400 },
    );
  }
  const { titulo, parentId = null, icono = null } = parsed.data;

  const madre = parentId ? await paginaPorId(parentId) : null;
  if (parentId && (!madre || madre.archivadaAt)) {
    return NextResponse.json({ error: "La página madre no existe." }, { status: 404 });
  }
  if (!(await puedeCrearBajo(guard.teamMember, madre))) {
    return NextResponse.json(
      { error: "Esa página está bloqueada: solo el liderazgo le agrega subpáginas." },
      { status: 403 },
    );
  }

  const r = await crearPagina({
    titulo,
    parentId,
    icono: icono ?? null,
    email: guard.user.email,
  });
  if (!r.ok) return NextResponse.json({ error: r.motivo }, { status: 409 });

  return NextResponse.json(
    { pagina: { id: r.pagina.id, slug: r.pagina.slug, titulo: r.pagina.titulo } },
    { status: 201 },
  );
}
