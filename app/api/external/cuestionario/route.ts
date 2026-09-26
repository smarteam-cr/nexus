/**
 * POST /api/external/cuestionario — las escrituras del cliente en su cuestionario previo.
 *
 * Pública (sin login, como la aprobación de la propuesta): el token de 64 hex viaja en el BODY y
 * es la única llave. Toda la seguridad vive en `lib/cuestionario/externo.ts`, que re-resuelve el
 * token en cada escritura — revocar un enlace corta el próximo autoguardado.
 *
 * Acciones: `guardar` (el autoguardado), `enviar` (guarda y bloquea la pestaña) y `pedir_cambio`
 * (después de enviar, el cliente dice qué quiere cambiar y queda en el registro).
 */
import { NextRequest, NextResponse } from "next/server";
import { leerGuardado } from "@/lib/cuestionario/avance";
import { enviarPestana, guardarPestana, pedirCambio } from "@/lib/cuestionario/externo";
import { checkExternalWriteRate } from "@/lib/external/write-rate-limit";

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Solicitud inválida" }, { status: 400 });
  }
  const token = typeof body?.token === "string" ? body.token : "";
  // El autoguardado corre cada pocos segundos mientras se escribe: el tope es para el martilleo
  // accidental (una pestaña en bucle), no para quien contesta rápido.
  if (!checkExternalWriteRate(`cuestionario:${token}`)) {
    return NextResponse.json({ ok: false, error: "Demasiados cambios seguidos. Espera unos segundos." }, { status: 429 });
  }

  if (body.accion === "pedir_cambio") {
    const r = await pedirCambio(token, body.key, body.mensaje);
    return NextResponse.json(r, { status: r.ok ? 200 : r.status });
  }

  if (body.accion !== "guardar" && body.accion !== "enviar") {
    return NextResponse.json({ ok: false, error: "Solicitud inválida" }, { status: 400 });
  }
  const guardado = leerGuardado(body.guardado);
  if (!guardado) return NextResponse.json({ ok: false, error: "Solicitud inválida" }, { status: 400 });

  const r =
    body.accion === "enviar"
      ? await enviarPestana(token, body.key, guardado)
      : await guardarPestana(token, body.key, guardado);
  return NextResponse.json(r, { status: r.ok ? 200 : r.status });
}
