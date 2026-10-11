/**
 * GET  /api/sales/exploraciones/[id]/reuniones?q=    → para el buscador: las reuniones de la empresa
 *                                                      y las de tu calendario
 * POST /api/sales/exploraciones/[id]/reuniones       → RETIRADO (410)
 *
 * El buscador de «Contexto adicional» de la preventa (Elías, 2026-10-07: «siempre se debe poder
 * buscar y agregar cualquier sesión de Meet del usuario o del cliente»). Hasta ese día la preventa
 * solo veía las reuniones más recientes, desde un mes antes del alta, y no había cómo sumar otra.
 *
 * Hasta el 2026-10-10 el POST sumaba la reunión a `contenido.reunionesElegidas` y adoptaba una reunión
 * sin dueño (pasaba a ser de la empresa en todo Nexus).
 *
 * Las dos piden `preventa.write`: el buscador existe para elegir.
 *
 * Etapa A (2026-10-09): la exploración son sus sesiones. El GET sigue: le da al selector de «Agregar
 * sesión» «De la empresa · ya pasaron» (cada una con qué texto dejó y si tiene minuta; en la preventa,
 * también las reuniones de HubSpot que ya pasaron, `deHubspot`) y «De tu calendario».
 * El POST está RETIRADO desde el 2026-10-10 (responde 410): una reunión se agrega como sesión (POST
 * /api/sales/exploraciones/[id]/sesiones), que antes de adoptar una reunión sin dueño mira lo que haría fallar el
 * agregado. Ninguna pantalla lo llamaba, y adoptar una reunión le cambia el dueño en todo Nexus.
 * `contenido.reunionesElegidas` se sigue leyendo (en un prospecto cuenta como unida; en un cliente va a
 * «Fuera de la exploración») y ya no hay operación que la escriba.
 */
import { NextRequest, NextResponse } from "next/server";
import { guardDeLaExploracion } from "@/lib/exploraciones/guardia";
import { reunionesDeLaEmpresaParaElegir } from "@/lib/exploraciones/fuentes";
import { reunionesDeHubspotParaElegir } from "@/lib/exploraciones/lectura";
import { leerLoLeido } from "@/lib/exploraciones/lo-leido";
import { estadoDesdeFila, leerExploracion } from "@/lib/exploraciones/servidor";
import { buscarEnTuCalendario } from "@/lib/sessions/calendario-de-quien-busca";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const guard = await guardDeLaExploracion(id, "write");
  if (guard instanceof NextResponse) return guard;

  const lectura = await leerExploracion(id);
  if (lectura.estado !== "ok") return NextResponse.json({ error: "Esa preventa no existe." }, { status: 404 });
  const clientId = lectura.fila.clientId;
  const [deLaEmpresa, calendario] = await Promise.all([
    reunionesDeLaEmpresaParaElegir(clientId),
    buscarEnTuCalendario({
      email: guard.email ?? "",
      clientId,
      projectId: null,
      q: req.nextUrl.searchParams.get("q") ?? "",
      documento: lectura.fila.projectId ? "la exploración" : "la preventa",
    }),
  ]);
  // HubSpot, solo la preventa (la exploración de un proyecto no lee HubSpot): las que ya pasaron, leídas o no.
  const propuesta = estadoDesdeFila(lectura.fila).propuesta;
  const deHubspot = lectura.fila.projectId
    ? []
    : reunionesDeHubspotParaElegir(leerLoLeido(lectura.fila.test).agenda, propuesta.lecturas, propuesta.leidas.hubspot, new Date());
  return NextResponse.json({ deLaEmpresa, calendario, deHubspot });
}

/** RETIRADO (2026-10-10): una reunión se agrega como sesión, con «+ Agregar sesión». */
export async function POST(_req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const guard = await guardDeLaExploracion(id, "write");
  if (guard instanceof NextResponse) return guard;
  return NextResponse.json(
    { error: "Las reuniones ya no se eligen sueltas: agrégala como sesión con «+ Agregar sesión». Recarga la página." },
    { status: 410 },
  );
}
