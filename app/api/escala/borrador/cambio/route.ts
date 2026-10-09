/**
 * POST /api/escala/borrador/cambio — un cambio del editor sobre el borrador de la escala.
 *
 * `{ revision, cambio, nota?, feedbackId? }`: el cambio es un criterio, un criterio nuevo, un nivel o
 * una dimensión de la matriz (lib/escala/datos/editar.ts). `revision` es la que se leyó: si el borrador
 * cambió desde entonces, frena. Queda en la bitácora con quién, la nota y el reporte de feedback que lo
 * originó. Solo los super admin.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { guardInternalUser } from "@/lib/auth/api-guards";
import { cuerpoInvalido } from "@/lib/api/cuerpo-invalido";
import { MARCAS_DE_PERFIL } from "@/lib/escala/datos/editar";
import { puedeEditarLaEscala } from "@/lib/escala/datos/reglas";
import { respuestaDelError, SOLO_SUPER_ADMIN } from "@/lib/escala/datos/respuestas";
import { editarElBorrador } from "@/lib/escala/datos/servidor";
import { VERIFICACIONES } from "@/lib/escala/documento/tipos";

const texto = z.string().max(4_000);
const delCriterio = {
  texto,
  verificacion: z.enum(VERIFICACIONES as [string, ...string[]]),
  riesgo: z.boolean(),
  habito: z.boolean(),
  perfil: z.enum(MARCAS_DE_PERFIL as [string, ...string[]]).nullable(),
  requiere: z.array(z.string().max(20)).max(20),
};

const cuerpo = z.strictObject({
  revision: z.number().int().min(0),
  nota: z.string().trim().max(500).nullable().optional(),
  // El reporte que originó el cambio. Sin `.cuid()`: hay ids UUID (guardas de la escala).
  feedbackId: z.string().min(1).max(64).nullable().optional(),
  cambio: z.discriminatedUnion("tipo", [
    z.strictObject({ tipo: z.literal("criterio"), id: z.string().max(20), ...delCriterio }),
    z.strictObject({ tipo: z.literal("nuevo-criterio"), nivel: z.string().max(20), ...delCriterio }),
    z.strictObject({ tipo: z.literal("nivel"), id: z.string().max(20), frase: texto, resultado: texto.nullable() }),
    z.strictObject({ tipo: z.literal("dimension"), id: z.string().max(20), nombre: texto, pregunta: texto, descripcion: texto.nullable(), costoDeQuedarse: texto }),
  ]),
});

export async function POST(req: NextRequest) {
  const ctx = await guardInternalUser();
  if (ctx instanceof NextResponse) return ctx;
  if (!puedeEditarLaEscala(ctx.role)) return NextResponse.json({ error: SOLO_SUPER_ADMIN }, { status: 403 });
  const parsed = cuerpo.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return cuerpoInvalido(parsed.error);
  const { revision, nota, feedbackId, cambio } = parsed.data;
  try {
    return NextResponse.json(
      await editarElBorrador({
        revision,
        // zod valida los valores contra las mismas listas; el tipo exacto lo pone el editor.
        cambio: cambio as Parameters<typeof editarElBorrador>[0]["cambio"],
        nota: nota || null,
        feedbackId: feedbackId ?? null,
        por: ctx.user.email,
      }),
    );
  } catch (e) {
    const r = respuestaDelError(e);
    if (r) return r;
    throw e;
  }
}
