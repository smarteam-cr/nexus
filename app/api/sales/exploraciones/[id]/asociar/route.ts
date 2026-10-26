/**
 * GET /api/sales/exploraciones/[id]/asociar — lo que pregunta el lienzo arriba (K5 del roadmap, 2026-10-27).
 *
 * Devuelve `{ sugerencias, huella }`:
 *   · sugerencias: las reuniones recientes de la empresa que calzan con una sesión planeada («¿Es la sesión 2 con
 *     Marketing?»), con por qué y, si no se asoció sola, sus dudas (lib/exploraciones/asociar.ts). Las reuniones salen del
 *     chokepoint: nunca una de otro cliente.
 *   · huella: cambia cuando entra una reunión a una sesión, se lee una o cambia la exploración. El lienzo la pide cada
 *     minuto mientras está a la vista (y al volver a la pestaña) y, si cambió, se vuelve a leer solo.
 *
 * Solo lee. «Sí» va por POST …/sesiones (la misma puerta de «+ Agregar sesión») y «No» por el PATCH
 * (`descartarAsociacion`). Lo que no tiene duda lo une el job `exploraciones-asociar`. Pide poder ver la exploración.
 */
import { NextRequest, NextResponse } from "next/server";
import { MAX_SUGERENCIAS_A_LA_VISTA } from "@/lib/exploraciones/asociar";
import { asociacionesDeLaFila } from "@/lib/exploraciones/asociar-server";
import { guardDeLaExploracion } from "@/lib/exploraciones/guardia";
import { leerExploracion } from "@/lib/exploraciones/servidor";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const guard = await guardDeLaExploracion(id, "read");
  if (guard instanceof NextResponse) return guard;

  const lectura = await leerExploracion(id);
  if (lectura.estado !== "ok") return NextResponse.json({ error: "Esa exploración no existe." }, { status: 404 });
  try {
    const { sugerencias, huella } = await asociacionesDeLaFila(lectura.fila);
    /* Las que no tienen duda también se muestran mientras el job no las une (corre cada 10 minutos): «Nexus la une sola»,
       con «No» por si no es. Cuando el job la une, la huella cambia y el lienzo se pone al día. */
    return NextResponse.json({ sugerencias: sugerencias.slice(0, MAX_SUGERENCIAS_A_LA_VISTA), huella });
  } catch (e) {
    console.error("[exploraciones/asociar] no se pudieron calcular las sugerencias", e instanceof Error ? e.message : e);
    return NextResponse.json({ sugerencias: [], huella: null });
  }
}
