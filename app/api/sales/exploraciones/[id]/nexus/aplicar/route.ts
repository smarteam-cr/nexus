/**
 * POST /api/sales/exploraciones/[id]/nexus/aplicar   body: { conversacion, vuelta, desmarcadas? }
 *
 * «Aplicar» la lista que dejó un pedido de la cuenta en la conversación de Nexus de la preventa (24 nov, una sola
 * conversación: lib/exploraciones/nexus-en-la-preventa-server.ts › `aplicarEnLaPreventa`). `vuelta` es la que dejó la
 * lista (`turno.lista.id`); `desmarcadas`, los renglones que la persona sacó.
 *
 * ⛔ La lista la lee el servidor de la vuelta de quien pide, en esta preventa y en esta conversación: el navegador no
 * manda operaciones. Responde { yaEstaba, aplicadas, fallo, sinIntentar, desenlace, lista }; «Ya estaba aplicado» a un
 * segundo clic; 409 si otra lista la reemplazó (la nueva la lleva); 422 sin escribir nada si algo cambió desde que se
 * propuso. Pide poder cambiar la exploración Y lo que pide el chat de la cuenta (`asistente.read` y acceso a la empresa);
 * cada cambio pide además su propio permiso al aplicarse.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { cuerpoInvalido } from "@/lib/api/cuerpo-invalido";
import { guardDeLaExploracion } from "@/lib/exploraciones/guardia";
import { aplicarEnLaPreventa } from "@/lib/exploraciones/nexus-en-la-preventa-server";
import { quienPideLaCuenta, respuestaDeError } from "@/lib/nexus-chat/http-server";

type Ctx = { params: Promise<{ id: string }> };

const ID = z.string().regex(/^[a-z0-9-]{8,64}$/i);
const CuerpoSchema = z.object({
  conversacion: ID,
  vuelta: z.string().trim().min(1, "Falta la lista.").max(60),
  desmarcadas: z.array(z.number().int().min(0).max(200)).max(200).default([]),
});

export async function POST(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const guard = await guardDeLaExploracion(id, "write");
  if (guard instanceof NextResponse) return guard;
  if (!guard.email) return NextResponse.json({ error: "No se sabe quién aplica." }, { status: 401 });
  const cuerpo = CuerpoSchema.safeParse(await req.json().catch(() => null));
  if (!cuerpo.success) return cuerpoInvalido(cuerpo.error);
  const c = cuerpo.data;
  try {
    const r = await aplicarEnLaPreventa(id, c.conversacion, c.vuelta, c.desmarcadas, guard.email, quienPideLaCuenta);
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
    const hecho = r.resultado ?? { aplicadas: 0, fallo: null, sinIntentar: 0, desenlace: "" };
    return NextResponse.json({ ...hecho, yaEstaba: r.yaEstaba, lista: r.lista, ...(r.yaEstaba ? { mensaje: "Ya estaba aplicado." } : {}) });
  } catch (e) {
    return respuestaDeError(e, "aplicar en la preventa");
  }
}
