/**
 * GET /api/sessions/grupo?g=<kind:id> — las filas de UN grupo de la barra de /sessions.
 *
 * C-20 (2026-09-04): /sessions manda al entrar el índice de conteos + las filas del grupo de la
 * URL (C-19). Cambiar de grupo pide acá las de ese grupo, UNA vez, y el cliente las guarda; la
 * URL se actualiza sin re-render del servidor. Así la cascada de categorización corre al entrar
 * y una vez por grupo, no en cada clic.
 *
 * Carga por el MISMO cargador que la página: el grupo que vuelve es exactamente el que la barra
 * contó. El costo es la cascada entera por pedido; el paso siguiente, si hace falta, es cachearla
 * unos segundos en el servidor — no cambiar el criterio.
 */
import { NextRequest, NextResponse } from "next/server";
import { withInternal } from "@/lib/api";
import { cargarSesionesCategorizadas } from "@/lib/sessions/cargar-sesiones-categorizadas";
import { filasDelGrupo, paramAGrupo } from "@/lib/sessions/indice-de-grupos";

export const GET = withInternal(async (req: NextRequest) => {
  const grupo = paramAGrupo(req.nextUrl.searchParams.get("g"));
  if (!grupo) return NextResponse.json({ error: "Falta el grupo (?g=kind:id)." }, { status: 400 });
  try {
    const { sessionsWithMeta } = await cargarSesionesCategorizadas();
    return NextResponse.json({ filas: filasDelGrupo(sessionsWithMeta, grupo) });
  } catch (e) {
    const message = e instanceof Error ? e.message : "No se pudieron cargar las sesiones.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
});
