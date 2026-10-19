/**
 * POST /api/para-ti/siguiente-paso-de-la-reunion   body: { clientId, eventoId, llevaEmail?, accion: "usar" | "descartar" }
 *
 * El siguiente paso que Nexus sugiere para una cuenta con reunión esta semana y sin acción (2026-10-19): «Usar» deja la
 * reunión como el siguiente paso (una tarea con fecha, por el escritor único de Tareas, y lo pone al día en HubSpot);
 * «Descartar» no se la vuelve a sugerir a quien la descarta. La sugerencia se vuelve a calcular en el servidor con el
 * calendario de quien lleva la cuenta (lib/mi-dia/paso-sugerido-server.ts): lo que dice el navegador no se usa. Lo puede
 * decidir quien lleva la cuenta o quien lidera Customer Success. Con «Ver como» no se escribe nada.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { guardInternalUser } from "@/lib/auth/api-guards";
import { cuerpoInvalido } from "@/lib/api/cuerpo-invalido";
import { descartarElPasoSugerido, ErrorDelPasoSugerido, usarElPasoSugerido } from "@/lib/mi-dia/paso-sugerido-server";

export const dynamic = "force-dynamic";

const Pedido = z.object({
  clientId: z.string().min(1).max(60),
  eventoId: z.string().min(1).max(300),
  llevaEmail: z.string().email().max(200).nullish(),
  accion: z.enum(["usar", "descartar"]),
});

export async function POST(req: NextRequest) {
  const g = await guardInternalUser();
  if (g instanceof NextResponse) return g;
  if (g.user.verComoDe) return NextResponse.json({ error: "Mientras ves Nexus como otra persona no se guarda nada." }, { status: 403 });
  const parsed = Pedido.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return cuerpoInvalido(parsed.error);
  const p = { clientId: parsed.data.clientId, eventoId: parsed.data.eventoId, llevaEmail: parsed.data.llevaEmail ?? null };
  try {
    if (parsed.data.accion === "descartar") {
      await descartarElPasoSugerido(g.teamMember, p);
      return NextResponse.json({ ok: true });
    }
    const r = await usarElPasoSugerido(g.teamMember, p);
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    if (e instanceof ErrorDelPasoSugerido) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
}
