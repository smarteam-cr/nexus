/**
 * /api/sales/exploraciones/[id]/pagina-de-la-escala — la página de resultados de La escala tal como la ve el cliente,
 * para la pantalla interna que la edita (La escala interna editable, 8 nov). Sale del MISMO cálculo que la página pública
 * (`paginaParaElCse`, lib/exploraciones/escala-para-el-cliente-server.ts), con todas las áreas y cuáles ve el cliente.
 *
 *   GET → la página. Pide leer la exploración (lib/exploraciones/guardia.ts). Se escribe por las operaciones de siempre.
 */
import { NextRequest, NextResponse } from "next/server";
import { paginaParaElCse } from "@/lib/exploraciones/escala-para-el-cliente-server";
import { guardDeLaExploracion } from "@/lib/exploraciones/guardia";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const guard = await guardDeLaExploracion(id, "read");
  if (guard instanceof NextResponse) return guard;
  const pagina = await paginaParaElCse(id);
  if (!pagina) return NextResponse.json({ error: "Esta escala no tiene una página que mostrar." }, { status: 404 });
  return NextResponse.json(pagina, {
    headers: { "Cache-Control": "no-store" },
  });
}
