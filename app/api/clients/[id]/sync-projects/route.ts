import { NextRequest, NextResponse } from "next/server";
import { syncProjectsForClient } from "@/lib/hubspot/sync-projects";
import { guardAccessToClient } from "@/lib/auth/api-guards";
import { desenlaceDe, registrarUso } from "@/lib/hubspot/uso-de-traer-proyectos";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  /* Este endpoint NO tenía guard: cualquiera con sesión podía dispararle el sync a
     cualquier cliente y, de yapa, leerse en `debug` los NOMBRES de sus proyectos y de su
     empresa en HubSpot. Además gasta llamadas a la API de HubSpot, así que sin gate también
     era una palanca gratis para agotar la cuota. */
  const guard = await guardAccessToClient(id);
  if (guard instanceof NextResponse) return guard;

  // force=1 saltea el cooldown en memoria (el botón «Traer proyectos de HubSpot»). La auto-sync del
  // montaje NO lo pasa → respeta el cooldown y no re-sincroniza en cada navegación.
  const force = _req.nextUrl.searchParams.get("force") === "1";

  try {
    /* El botón, además, relee por id lo que la ficha ya tiene si el piso de 60 s o una corrida en curso no dejan correr
       la completa (2026-10-29, SmartAgro): lo que alguien acaba de cambiar en HubSpot se ve en segundos. */
    const result = await syncProjectsForClient(id, { force, releerSiHayPiso: force });
    void registrarUso(force ? "boton" : "fondo", desenlaceDe(result)); // no demora la respuesta; nunca lanza
    return NextResponse.json(result);
  } catch (e) {
    void registrarUso(force ? "boton" : "fondo", "error");
    return NextResponse.json(
      { error: (e as Error).message },
      { status: 500 }
    );
  }
}
