/**
 * /api/academy — el catálogo de listas de HubSpot Academy (Q1 del roadmap, 2026-10-27, lib/kickoff/academy.ts).
 *
 *   GET            → { listas }: todo el catálogo (las archivadas al final). Lo lee cualquiera del equipo interno.
 *   POST {lista}   → crea una lista. Lo mantienen la líder de Customer Success y dirección (`guardLiderDeCs`).
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { guardInternalUser, guardLiderDeCs } from "@/lib/auth/api-guards";
import { catalogoDeAcademy, crearListaDeAcademy, ErrorDeAcademy } from "@/lib/kickoff/academy-server";

const NuevaLista = z.strictObject({
  nombre: z.string().min(1).max(200),
  enlace: z.string().min(1).max(1000),
  hub: z.string().min(1).max(40),
  rol: z.string().min(1).max(40),
  duracionMinutos: z.number().int().min(0).max(6000).nullable().optional(),
  descripcion: z.string().max(500).nullable().optional(),
});

export async function GET() {
  const guard = await guardInternalUser();
  if (guard instanceof NextResponse) return guard;
  return NextResponse.json({ listas: await catalogoDeAcademy() });
}

export async function POST(req: NextRequest) {
  const guard = await guardLiderDeCs();
  if (guard instanceof NextResponse) return guard;
  const cuerpo = NuevaLista.safeParse(await req.json().catch(() => null));
  if (!cuerpo.success) return NextResponse.json({ error: "Revisa los datos de la lista." }, { status: 400 });
  try {
    const lista = await crearListaDeAcademy(
      { ...cuerpo.data, duracionMinutos: cuerpo.data.duracionMinutos ?? null, descripcion: cuerpo.data.descripcion ?? null },
      guard.user.email,
    );
    return NextResponse.json({ lista });
  } catch (e) {
    if (e instanceof ErrorDeAcademy) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
}
