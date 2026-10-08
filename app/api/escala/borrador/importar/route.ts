/**
 * POST /api/escala/borrador/importar — sube un `.md` con cambios al borrador.
 *
 * El cuerpo llega COMPRIMIDO (gzip de `{ texto, revision, nota, guardar }`): la escala pesa más de
 * medio mega y nginx corta los cuerpos en 1 MB; comprimida queda en ~100 KB. Con `guardar: false`
 * solo dice qué cambiaría; con `true` lo guarda y lo anota en la bitácora. `revision` es la que se
 * leyó: si el borrador cambió desde entonces, frena en vez de pisar el cambio de otro.
 *
 * Solo los super admin. Un `.md` con una línea que no se entiende vuelve con su número (422).
 */
import { gunzipSync } from "node:zlib";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { guardInternalUser } from "@/lib/auth/api-guards";
import { cuerpoInvalido } from "@/lib/api/cuerpo-invalido";
import { puedeEditarLaEscala } from "@/lib/escala/datos/reglas";
import { respuestaDelError, SOLO_SUPER_ADMIN } from "@/lib/escala/datos/respuestas";
import { guardarLaImportacion, verLaImportacion } from "@/lib/escala/datos/servidor";

/** Más que esto, descomprimido, no es una escala (hoy pesa ~550 KB). */
const TOPE = 8 * 1024 * 1024;

const cuerpo = z.strictObject({
  texto: z.string().min(1).max(TOPE),
  revision: z.number().int().min(0),
  nota: z.string().trim().max(500).nullable().optional(),
  guardar: z.boolean(),
});

export async function POST(req: NextRequest) {
  const ctx = await guardInternalUser();
  if (ctx instanceof NextResponse) return ctx;
  if (!puedeEditarLaEscala(ctx.role)) return NextResponse.json({ error: SOLO_SUPER_ADMIN }, { status: 403 });

  let json: unknown = null;
  try {
    json = JSON.parse(gunzipSync(Buffer.from(await req.arrayBuffer()), { maxOutputLength: TOPE }).toString("utf8"));
  } catch {
    return NextResponse.json({ error: "El archivo no llegó bien (se esperaba comprimido). Vuelve a intentarlo." }, { status: 400 });
  }
  const parsed = cuerpo.safeParse(json);
  if (!parsed.success) return cuerpoInvalido(parsed.error);
  const { texto, revision, guardar } = parsed.data;
  try {
    if (!guardar) return NextResponse.json(await verLaImportacion(texto, revision));
    return NextResponse.json(await guardarLaImportacion({ texto, revision, nota: parsed.data.nota || null, por: ctx.user.email }));
  } catch (e) {
    const r = respuestaDelError(e);
    if (r) return r;
    throw e;
  }
}
