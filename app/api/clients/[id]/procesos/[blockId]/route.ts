import { NextRequest, NextResponse } from "next/server";
import { guardAccessToClient } from "@/lib/auth/api-guards";
import { cuerpoInvalido } from "@/lib/api/cuerpo-invalido";
import { cambioDeMapaSchema } from "@/lib/procesos/schema";
import { cambiarEstadoDelMapa, editarPaso, ErrorDeProcesos, guardarMapaAnterior, quitarMapa } from "@/lib/procesos/servidor";

/**
 * /api/clients/[id]/procesos/[blockId] — un mapa de procesos del cliente.
 *
 * PATCH { accion: "estado", estado }  → borrador / revisado / validado con el cliente (lo validado
 *                                        es lo único que el kickoff le muestra al cliente).
 * PATCH { accion: "paso", … }         → edita un paso; el mapa pasa a «editado a mano» y el agente
 *                                        ya no lo pisa al volver a mapear.
 * PATCH { accion: "anterior", data }  → guarda un mapa del formato anterior editado en el visor viejo.
 * DELETE                              → quita el mapa (nuevo o del formato anterior).
 *
 * Misma vara que editar un bloque de canvas: acceso al cliente (guardAccessToClient).
 */
type Params = { params: Promise<{ id: string; blockId: string }> };

function respuestaDeError(e: unknown) {
  if (e instanceof ErrorDeProcesos) return NextResponse.json({ error: e.message }, { status: e.status });
  throw e;
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const { id, blockId } = await params;
  const guard = await guardAccessToClient(id);
  if (guard instanceof NextResponse) return guard;
  const cuerpo = cambioDeMapaSchema.safeParse(await req.json().catch(() => null));
  if (!cuerpo.success) return cuerpoInvalido(cuerpo.error);
  const quien = guard.user.email ?? "desconocido";
  try {
    const c = cuerpo.data;
    if (c.accion === "anterior") {
      await guardarMapaAnterior(id, blockId, c.data);
      return NextResponse.json({ ok: true });
    }
    const mapa =
      c.accion === "estado"
        ? await cambiarEstadoDelMapa(id, blockId, c.estado, quien)
        : await editarPaso(id, blockId, { version: c.version, pasoId: c.pasoId, texto: c.texto, carril: c.carril, herramienta: c.herramienta, dolor: c.dolor, origen: c.origen, quitarCitas: c.quitarCitas }, quien);
    return NextResponse.json({ mapa });
  } catch (e) {
    return respuestaDeError(e);
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id, blockId } = await params;
  const guard = await guardAccessToClient(id);
  if (guard instanceof NextResponse) return guard;
  try {
    await quitarMapa(id, blockId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return respuestaDeError(e);
  }
}
