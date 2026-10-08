/**
 * lib/escala/datos/respuestas.ts — cómo contestan las rutas del borrador cuando algo no se puede.
 *
 * Un `ErrorDelBorrador` (ya hay otro borrador, cambió mientras tanto, no pasa las pruebas) y un
 * `ErrorDeFormato` (el `.md` subido tiene una línea que no se entiende, con su número) se le dicen a
 * quien lo pidió tal cual: están escritos para leerse. Cualquier otro error sigue su camino (500).
 */
import { NextResponse } from "next/server";
import { ErrorDeFormato } from "@/lib/escala/documento/tipos";
import { ErrorDelBorrador } from "./versiones";

export function respuestaDelError(e: unknown): NextResponse | null {
  if (e instanceof ErrorDeFormato) return NextResponse.json({ error: `El archivo no se puede subir. ${e.message}`, linea: e.linea }, { status: 422 });
  if (e instanceof ErrorDelBorrador) return NextResponse.json({ error: e.message }, { status: 409 });
  return null;
}

export const SOLO_SUPER_ADMIN = "La escala la editan y la publican los super admin.";
