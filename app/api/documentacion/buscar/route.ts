import { NextRequest, NextResponse } from "next/server";
import { guardInternalUser } from "@/lib/auth/api-guards";
import { rutaDe } from "@/lib/documentacion/arbol";
import { buscarPaginas, paginasVivas } from "@/lib/documentacion/consultas";
import { Buscar } from "@/lib/documentacion/esquema";

/**
 * GET /api/documentacion/buscar?q=… — el buscador de la base de conocimiento (Ctrl+K).
 *
 * Busca en la columna `busqueda`, que ya está normalizada (sin tildes ni mayúsculas) y que
 * incluye el título, el texto y lo que muestran los bloques vivos. Cada resultado viene con su
 * ruta de páginas, para saber DÓNDE está lo que se encontró, y con el pedazo de texto donde
 * coincide.
 *
 * Leer es de todo el equipo interno: la sección no tiene gate.
 */
export async function GET(req: NextRequest) {
  const guard = await guardInternalUser();
  if (guard instanceof NextResponse) return guard;

  const crudo = {
    q: req.nextUrl.searchParams.get("q") ?? "",
    limite: req.nextUrl.searchParams.get("limite") ?? undefined,
  };
  const parsed = Buscar.safeParse(crudo);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Consulta inválida." },
      { status: 400 },
    );
  }

  const [resultados, vivas] = await Promise.all([
    buscarPaginas(parsed.data.q, parsed.data.limite),
    paginasVivas(),
  ]);

  return NextResponse.json({
    resultados: resultados.map((r) => ({
      ...r,
      // La ruta SIN la página misma: es la miga que la ubica ("Escala de rendimiento › Ventas").
      ruta: rutaDe(r.id, vivas)
        .slice(0, -1)
        .map((p) => p.titulo),
    })),
  });
}
