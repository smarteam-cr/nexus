/**
 * GET   /api/sales/exploraciones/[id]   → la exploración, como la pinta el lienzo
 * PATCH /api/sales/exploraciones/[id]   body: { version, operaciones: [...] }
 *
 * Las operaciones (lib/exploraciones/contenido.ts) cambian lo CONFIRMADO o usan y descartan lo que
 * propuso el agente. Se aplican todas o ninguna, con la fila bloqueada. Si otra persona cambió lo
 * confirmado entretanto, 409 con la exploración actual: la pantalla la recarga en vez de pisar.
 * Si cambia quién la lleva, a la persona nueva le llega un aviso y el «Para ti» de las dos se vuelve
 * a medir (la preventa sale de uno y entra al otro). Solo la lleva alguien del equipo con acceso a
 * Ventas: otro correo es un 400 (lib/exploraciones/responsable.ts).
 * Mirar pide `ventas.read`; cambiar, `ventas.write`.
 */
import { NextRequest, NextResponse } from "next/server";
import { cuerpoInvalido } from "@/lib/api/cuerpo-invalido";
import { guardPermission } from "@/lib/auth/api-guards";
import type { Operacion } from "@/lib/exploraciones/contenido";
import { CambiosSchema } from "@/lib/exploraciones/esquemas";
import {
  aplicarCambios,
  escalaParaExplorar,
  leerExploracion,
  paraLaPantalla,
  SQL_DE_EXPLORACIONES,
} from "@/lib/exploraciones/servidor";
import { paraLaPantallaCompleta } from "@/lib/exploraciones/pantalla";
import { errorDelResponsable } from "@/lib/exploraciones/responsable";
import { avisar } from "@/lib/para-ti/avisos-server";
import { olvidarMedicion } from "@/lib/para-ti/medir-server";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const guard = await guardPermission("preventa", "read");
  if (guard instanceof NextResponse) return guard;

  const lectura = await leerExploracion(id);
  if (lectura.estado === "sin-tablas") {
    return NextResponse.json({ error: `Falta aplicar ${SQL_DE_EXPLORACIONES} y reiniciar.` }, { status: 503 });
  }
  if (lectura.estado === "no-existe") return NextResponse.json({ error: "Esa preventa no existe." }, { status: 404 });
  return NextResponse.json({ exploracion: await paraLaPantallaCompleta(lectura.fila) });
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const guard = await guardPermission("preventa", "write");
  if (guard instanceof NextResponse) return guard;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const cuerpo = CambiosSchema.safeParse(raw);
  if (!cuerpo.success) return cuerpoInvalido(cuerpo.error);

  const escala = await escalaParaExplorar();
  if (escala.estado !== "ok") {
    return NextResponse.json({ error: "La escala no está publicada en Nexus: sin ella no se puede validar el cambio." }, { status: 503 });
  }

  // ⛔ Una preventa solo la lleva alguien con acceso a Preventa (Elías, 2026-10-05): lo mismo que filtra la lista.
  const sinAcceso = await errorDelResponsable(cuerpo.data.operaciones as Operacion[]);
  if (sinAcceso) return NextResponse.json({ error: sinAcceso }, { status: 400 });

  const r = await aplicarCambios(id, cuerpo.data.version, cuerpo.data.operaciones as Operacion[], escala.general);
  switch (r.estado) {
    case "no-existe":
      return NextResponse.json({ error: "Esa preventa no existe." }, { status: 404 });
    case "invalido":
      return NextResponse.json({ error: r.error }, { status: 400 });
    case "conflicto":
      return NextResponse.json(
        { error: "La preventa cambió mientras la editabas (otra persona, o el agente al preparar). Se cargó lo último.", exploracion: paraLaPantalla(r.fila) },
        { status: 409 },
      );
    case "ok": {
      const antes = r.responsableAntes?.toLowerCase() ?? null;
      const ahora = r.fila.responsableEmail?.toLowerCase() ?? null;
      if (antes !== ahora) {
        if (antes) olvidarMedicion(antes);
        if (ahora) {
          olvidarMedicion(ahora);
          await avisar({
            para: ahora,
            tipo: "preventa.responsable",
            titulo: `Te asignaron la preventa de ${r.fila.client.name}`,
            detalle: "Sus pendientes ya están en tu «Para ti».",
            href: `/sales/exploraciones/${encodeURIComponent(id)}`,
            actorEmail: guard.user.email,
            dedupeKey: `preventa.responsable:${id}:${ahora}:${new Date().toISOString().slice(0, 10)}`,
          });
        }
      }
      return NextResponse.json({ exploracion: paraLaPantalla(r.fila) });
    }
  }
}
