/**
 * lib/api/cuerpo-invalido.ts — EL 400 DE UN BODY QUE NO PASA ZOD, UNIFORME.
 *
 * A-19 (auditoría 2026-09-03): los handlers que escriben Json directo del body validan con
 * `schema.safeParse(...)` ANTES de tocar la base, y contestan con esto. Dice QUÉ campo y POR QUÉ
 * (hasta 10 issues), nunca el body: lo que llegó puede ser basura de 50 MB o un dato ajeno.
 */
import { NextResponse } from "next/server";
import type { ZodError } from "zod";

export function cuerpoInvalido(error: ZodError): NextResponse {
  return NextResponse.json(
    {
      error: "Cuerpo inválido",
      detalle: error.issues
        .slice(0, 10)
        .map((i) => `${i.path.map(String).join(".") || "(raíz)"}: ${i.message}`),
    },
    { status: 400 },
  );
}
