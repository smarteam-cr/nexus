import { NextRequest, NextResponse } from "next/server";
import { guardInternalUser, guardPermission } from "@/lib/auth/api-guards";
import { editarMetadatos, guardarContenido, paginaPorId } from "@/lib/documentacion/consultas";
import { EditarMetadatos, GuardarContenido } from "@/lib/documentacion/esquema";
import { puedeEditarPagina } from "@/lib/documentacion/permisos";
import { sanearBloques } from "@/lib/documentacion/texto";
import { cargarDatosVivos, fuentesDe, textoDeLoVivo } from "@/lib/documentacion/vivos";

/** GET — una página con su contenido. Leer es de todo el equipo interno. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await guardInternalUser();
  if (guard instanceof NextResponse) return guard;

  const { id } = await params;
  const pagina = await paginaPorId(id);
  if (!pagina) return NextResponse.json({ error: "La página no existe." }, { status: 404 });
  return NextResponse.json({ pagina });
}

/**
 * PATCH — guarda el CONTENIDO o los METADATOS (título e ícono). Son dos cosas distintas a
 * propósito:
 *
 *   · El contenido viaja con la `version` que el editor leyó y se escribe solo si sigue siendo
 *     esa. Si otra persona guardó primero, responde 409 con quién fue y cuándo: nadie pisa a
 *     nadie en silencio.
 *   · El título y el ícono se guardan sin control de versión (gana el último). Si pidieran
 *     versión, renombrar en una pestaña haría fallar el autoguardado de la otra — un conflicto
 *     inventado sobre dos cambios que no chocan.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await guardPermission("documentacion", "write");
  if (guard instanceof NextResponse) return guard;

  const { id } = await params;
  const pagina = await paginaPorId(id);
  if (!pagina) return NextResponse.json({ error: "La página no existe." }, { status: 404 });
  if (pagina.archivadaAt) {
    return NextResponse.json(
      { error: "La página está en la papelera: primero hay que restaurarla." },
      { status: 409 },
    );
  }
  if (!(await puedeEditarPagina(guard.teamMember, pagina))) {
    return NextResponse.json(
      { error: "Esta página está bloqueada: la edita el liderazgo." },
      { status: 403 },
    );
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Cuerpo inválido." }, { status: 400 });
  }

  if ("contenido" in body) {
    const parsed = GuardarContenido.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Contenido inválido." },
        { status: 400 },
      );
    }
    /* Lo que muestran los bloques vivos entra en la columna de búsqueda. Sin esto, buscar
       «kickoff» no encontraría la página que lo lista: esa palabra no está escrita en ninguna
       parte del contenido guardado. Se calcula solo si la página tiene algún bloque vivo. */
    const fuentes = fuentesDe(sanearBloques(parsed.data.contenido));
    const derivado = fuentes.length > 0 ? textoDeLoVivo(await cargarDatosVivos(), fuentes) : "";

    const r = await guardarContenido({
      id,
      version: parsed.data.version,
      contenido: parsed.data.contenido,
      email: guard.user.email,
      derivado,
    });
    if (!r.ok) {
      return NextResponse.json(
        {
          error: "Alguien más guardó esta página mientras la editabas. Recargá para ver su versión.",
          conflicto: r.conflicto,
        },
        { status: 409 },
      );
    }
    return NextResponse.json({ version: r.version });
  }

  const parsed = EditarMetadatos.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Datos inválidos." },
      { status: 400 },
    );
  }
  const actualizada = await editarMetadatos({
    id,
    titulo: parsed.data.titulo,
    icono: parsed.data.icono,
    email: guard.user.email,
  });
  return NextResponse.json({
    pagina: { id: actualizada.id, titulo: actualizada.titulo, icono: actualizada.icono },
  });
}
