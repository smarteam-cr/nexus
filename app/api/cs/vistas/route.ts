/**
 * POST /api/cs/vistas   body: { nombre, filtros }
 *
 * Guarda los filtros de la pestaña «Cartera» de Éxito del cliente con un nombre (2026-10-09,
 * docs/exito-del-cliente-cartera-plan.md, entrega 3). Las vistas son compartidas entre la CSL y dirección.
 * Los filtros se limpian con la misma regla que la dirección (lib/cs/filtros-de-cartera.ts): lo que no se
 * entiende no se guarda.
 */
import { NextRequest, NextResponse } from "next/server";
import { guardLiderDeCs } from "@/lib/auth/api-guards";
import { vistaDeCarteraSchema } from "@/lib/cs/schema";
import { crearVista } from "@/lib/cs/vistas-de-cartera-server";
import { faltaLaTabla } from "@/lib/cs/clasificacion-server";

export async function POST(req: NextRequest) {
  const guard = await guardLiderDeCs();
  if (guard instanceof NextResponse) return guard;
  let cuerpo: unknown;
  try {
    cuerpo = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const parsed = vistaDeCarteraSchema.safeParse(cuerpo);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Datos inválidos" }, { status: 400 });
  }
  try {
    const vista = await crearVista(parsed.data.nombre, parsed.data.filtros, {
      email: guard.user.email ?? "sin-correo",
      nombre: guard.teamMember?.name ?? null,
    });
    return NextResponse.json({ vista });
  } catch (e) {
    if (faltaLaTabla(e)) {
      return NextResponse.json({ error: "Falta aplicar el SQL de la cartera (scripts/sql/2026-10-09-cartera-de-la-csl.sql)." }, { status: 503 });
    }
    throw e;
  }
}
