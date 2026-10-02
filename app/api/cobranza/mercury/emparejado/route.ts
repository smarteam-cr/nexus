/**
 * /api/cobranza/mercury/emparejado — qué cuenta de Nexus es cada cliente de Mercury.
 *   GET  → los clientes de la copia con lo que tienen en Mercury, las propuestas con su evidencia y las cuentas.
 *          NO consulta Mercury: sale de la copia guardada.
 *   POST → confirmar | desvincular | ignorar («No es cliente nuestro» y su vuelta atrás).
 *
 * Acceso: guardCobranzaAccess, el mismo de Cobranza › Odoo › Emparejar. ⛔ Nada de esto escribe en Mercury.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { guardCobranzaAccess } from "@/lib/auth/api-guards";
import {
  MercuryServicioError,
  cargarEmparejadoMercury,
  confirmarClienteMercury,
  desvincularClienteMercury,
  ignorarClienteMercury,
} from "@/lib/cobranza/mercury/servicio";

export const dynamic = "force-dynamic";

const cliente = z.string().trim().min(1, "Falta el cliente de Mercury").max(100);
const confirmarSchema = z.object({
  mercuryCustomerId: cliente,
  cuentaId: z.string().trim().min(1, "Falta la cuenta").max(100),
  via: z.enum(["NUMERO", "NOMBRE", "MONTO", "MANUAL"]),
});
const desvincularSchema = z.object({ mercuryCustomerId: cliente });
const ignorarSchema = z.object({ mercuryCustomerId: cliente, ignorado: z.boolean() });

export async function GET() {
  const guard = await guardCobranzaAccess();
  if (guard instanceof NextResponse) return guard;
  return NextResponse.json(await cargarEmparejadoMercury());
}

export async function POST(req: NextRequest) {
  const guard = await guardCobranzaAccess();
  if (guard instanceof NextResponse) return guard;
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const accion = (raw as { accion?: unknown })?.accion;
  const invalido = (issues: ReadonlyArray<{ message: string }>) => NextResponse.json({ error: issues[0]?.message ?? "Input inválido" }, { status: 400 });
  try {
    if (accion === "confirmar") {
      const p = confirmarSchema.safeParse(raw);
      if (!p.success) return invalido(p.error.issues);
      return NextResponse.json(await confirmarClienteMercury(p.data, guard.user.email));
    }
    if (accion === "desvincular") {
      const p = desvincularSchema.safeParse(raw);
      if (!p.success) return invalido(p.error.issues);
      await desvincularClienteMercury(p.data, guard.user.email);
      return NextResponse.json({ ok: true });
    }
    if (accion === "ignorar") {
      const p = ignorarSchema.safeParse(raw);
      if (!p.success) return invalido(p.error.issues);
      await ignorarClienteMercury(p.data, guard.user.email);
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: "Acción desconocida." }, { status: 400 });
  } catch (e) {
    if (e instanceof MercuryServicioError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
}
