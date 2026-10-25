/**
 * /api/sessions/[id]/audio — el audio de una reunión presencial (T5, 2026-10-25), detrás de REUNIONES_AUDIO=1.
 *
 *   GET                              → cómo va el audio de la reunión (o null)
 *   POST { archivo, tipo, bytes }    → abre la subida: responde la dirección a la que el navegador sube el archivo
 *
 * Pide acceso a la reunión (`guardAccesoALaReunion`) y que tenga dueña. Al terminar la subida, el navegador avisa en
 * POST .../audio/subido. Lo demás: lib/sessions/audio-de-reunion-server.ts.
 */
import { NextRequest, NextResponse } from "next/server";
import { cuerpoInvalido } from "@/lib/api/cuerpo-invalido";
import { esquemaDesactualizado } from "@/lib/db/esquema";
import { guardAccesoALaReunion } from "@/lib/sessions/acceso-a-la-reunion";
import { audioDeLaReunion, empezarSubida } from "@/lib/sessions/audio-de-reunion-server";
import { SubidaDelAudio } from "@/lib/sessions/reunion-schema";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const acceso = await guardAccesoALaReunion(id);
  if (acceso instanceof NextResponse) return acceso;
  return NextResponse.json({ audio: await audioDeLaReunion(id) });
}

/** El origen de Nexus para la subida (Google responde a ese origen con los permisos de CORS). */
function origenDe(req: NextRequest): string {
  const o = req.headers.get("origin");
  return o && /^https?:\/\/[^/]+$/.test(o) ? o : (process.env.APP_URL ?? req.nextUrl.origin);
}

export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const acceso = await guardAccesoALaReunion(id);
  if (acceso instanceof NextResponse) return acceso;
  const raw = await req.json().catch(() => undefined);
  if (raw === undefined) return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  const parsed = SubidaDelAudio.safeParse(raw);
  if (!parsed.success) return cuerpoInvalido(parsed.error);
  try {
    const r = await empezarSubida(id, parsed.data, { email: acceso.user.email }, origenDe(req));
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
    return NextResponse.json({ subida: r.subida });
  } catch (e) {
    if (esquemaDesactualizado(e)) return NextResponse.json({ error: "A la base le falta el SQL 2026-10-25-reuniones-parte-2.sql." }, { status: 503 });
    console.error(`[api/sessions/audio] ${id}:`, e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "No se pudo abrir la subida en Google. Vuelve a intentarlo en un momento." }, { status: 502 });
  }
}
