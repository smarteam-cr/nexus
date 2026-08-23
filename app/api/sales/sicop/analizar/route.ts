/**
 * POST /api/sales/sicop/analizar — lee con IA las licitaciones del pipeline «Gobiernos».
 *
 * Body opcional: { ticketIds?: string[], forzar?: boolean, profundo?: boolean }
 *   · sin body            → lee todo lo que cambió desde la última corrida (superficial).
 *   · ticketIds           → solo las que el usuario marcó en la tabla.
 *   · profundo            → además BAJA los archivos, les saca el texto y se lo pasa al modelo.
 *   · forzar              → re-lee aunque la huella no haya cambiado, y reintenta los archivos
 *                           que fallaron (nunca los que ya se sabe que no tienen texto).
 *
 * ⛔ Pide `ventas.write` y no `ventas.read`: leer la pantalla es gratis, pero apretar este
 * botón gasta una llamada a Claude por licitación —y en modo profundo, ~5× más—. El permiso
 * separa mirar de gastar.
 *
 * El gasto queda medido solo: todas las llamadas pasan por `lib/anthropic.ts`, que registra
 * cada una en `LlmCall` y consulta el tope diario antes de disparar.
 */
import { NextRequest, NextResponse } from "next/server";
import { guardPermission } from "@/lib/auth/api-guards";
import { correrAnalisisSicop } from "@/lib/ventas/sicop-analisis";

/**
 * Una corrida completa son ~45 lecturas de a 6 en paralelo, y en modo profundo cada una
 * además baja y parsea un PDF. Bastante más que el default.
 */
export const maxDuration = 300;

/** Tope de selección por corrida: más que esto es una corrida completa, no una selección. */
const MAX_SELECCION = 50;

export async function POST(req: NextRequest) {
  const guard = await guardPermission("ventas", "write");
  if (guard instanceof NextResponse) return guard;

  let body: { ticketIds?: unknown; forzar?: unknown; profundo?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    /* Sin body es el caso normal (el botón «Analizar»): no es un error. */
  }

  const ticketIds = Array.isArray(body.ticketIds)
    ? [...new Set(body.ticketIds.filter((x): x is string => typeof x === "string" && !!x))]
    : [];
  if (ticketIds.length > MAX_SELECCION) {
    return NextResponse.json(
      { error: `Son ${ticketIds.length} licitaciones; el tope por corrida es ${MAX_SELECCION}.` },
      { status: 400 },
    );
  }

  const resultado = await correrAnalisisSicop({
    ticketIds,
    forzar: body.forzar === true,
    profundo: body.profundo === true,
  });

  if (resultado.esquemaAtrasado) {
    return NextResponse.json(
      {
        error:
          "No hay dónde guardar la lectura: falta aplicar " +
          "scripts/sql/2026-08-23-sicop-adjuntos.sql, o el server corre con un cliente de " +
          "Prisma anterior al modelo (npx prisma generate + reiniciar el server).",
      },
      { status: 503 },
    );
  }
  if (resultado.error) return NextResponse.json({ error: resultado.error }, { status: 502 });

  return NextResponse.json({ resultado });
}
