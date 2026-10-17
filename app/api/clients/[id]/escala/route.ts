/**
 * La cuenta › La escala (2026-10-12): dónde está la empresa en cada área, con la fecha y de dónde sale. Ver
 * lib/exploraciones/escala-de-la-empresa.ts.
 *
 *   GET  → la escala de hoy de cada exploración, las versiones guardadas (la escala en el tiempo), las exploraciones
 *          vivas desde donde se regenera y `puede` (trabajar la preventa / la exploración de un proyecto). Pide acceso
 *          al cliente.
 *   POST → (ficha B, 2026-10-17)
 *          { accion: "guardar", exploracionId, nota? } — guarda esta versión (origen «manual»).
 *          { accion: "regenerar", exploracionId }      — el agente lee todo lo que Nexus sabe y PROPONE niveles; nada
 *                                                        se confirma solo: se usan en La escala de la exploración.
 *          { accion: "activar", projectId }            — abre la exploración del proyecto si no hay y lanza el agente.
 *          Pide acceso al cliente y poder trabajar esa exploración (la preventa: `preventa`; la de un proyecto: la
 *          celda de generar la exploración), igual que /api/sales/exploraciones/[id]/*.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { cuerpoInvalido } from "@/lib/api/cuerpo-invalido";
import { guardAccessToClient, guardContextoDelDocumento } from "@/lib/auth/api-guards";
import { can } from "@/lib/auth/permissions/engine";
import { lanzarCorrida } from "@/lib/exploraciones/agente";
import { asegurarExploracionDelProyecto } from "@/lib/exploraciones/del-proyecto";
import { escalaDeLaEmpresa, esDeLaEmpresa } from "@/lib/exploraciones/escala-de-la-empresa";
import { guardDeLaExploracion } from "@/lib/exploraciones/guardia";
import { guardarVersionDeLaEscala, SQL_DE_LAS_VERSIONES } from "@/lib/exploraciones/versiones-de-la-escala";

type Params = Promise<{ id: string }>;

export async function GET(_req: NextRequest, { params }: { params: Params }) {
  const { id } = await params;
  const guard = await guardAccessToClient(id);
  if (guard instanceof NextResponse) return guard;
  try {
    // Qué puede hacer quien mira (la pantalla pinta los botones con esto; la API igual lo vuelve a pedir).
    const tm = guard.user.teamMember;
    const puede = tm
      ? { preventa: await can(tm, "preventa", "write"), exploracion: await can(tm, "exploracion", "generate") }
      : { preventa: false, exploracion: false };
    return NextResponse.json({ ...(await escalaDeLaEmpresa(id)), puede });
  } catch (e) {
    console.error("[clients/escala]", e);
    return NextResponse.json({ error: "No se pudo cargar la escala de la empresa." }, { status: 500 });
  }
}

const Cuerpo = z.discriminatedUnion("accion", [
  z.object({ accion: z.literal("guardar"), exploracionId: z.string().min(1).max(64), nota: z.string().max(500).optional() }),
  z.object({ accion: z.literal("regenerar"), exploracionId: z.string().min(1).max(64) }),
  z.object({ accion: z.literal("activar"), projectId: z.string().min(1).max(64) }),
]);

export async function POST(req: NextRequest, { params }: { params: Params }) {
  const { id } = await params;
  const acceso = await guardAccessToClient(id);
  if (acceso instanceof NextResponse) return acceso;
  const cuerpo = Cuerpo.safeParse(await req.json().catch(() => null));
  if (!cuerpo.success) return cuerpoInvalido(cuerpo.error);
  const c = cuerpo.data;

  try {
    if (c.accion === "activar") {
      if (!(await esDeLaEmpresa(id, { projectId: c.projectId }))) return NextResponse.json({ error: "Ese proyecto no es de esta empresa." }, { status: 404 });
      const g = await guardContextoDelDocumento(c.projectId, "exploracion");
      if (g instanceof NextResponse) return g;
      const email = g.teamMember?.email ?? g.user.email ?? "desconocido";
      const r = await asegurarExploracionDelProyecto(c.projectId, email);
      if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
      const corrida = await lanzarCorrida(r.id, "leer", { triggeredByEmail: email, posicionar: true });
      if (!corrida.ok) return NextResponse.json({ error: corrida.error }, { status: corrida.status });
      return NextResponse.json({ exploracionId: r.id, runId: corrida.runId, yaCorria: corrida.yaCorria }, { status: 202 });
    }

    if (!(await esDeLaEmpresa(id, { exploracionId: c.exploracionId }))) return NextResponse.json({ error: "Esa exploración no es de esta empresa." }, { status: 404 });
    const g = await guardDeLaExploracion(c.exploracionId, "write");
    if (g instanceof NextResponse) return g;

    if (c.accion === "regenerar") {
      const corrida = await lanzarCorrida(c.exploracionId, "leer", { triggeredByEmail: g.email, posicionar: true });
      if (!corrida.ok) return NextResponse.json({ error: corrida.error }, { status: corrida.status });
      return NextResponse.json({ exploracionId: c.exploracionId, runId: corrida.runId, yaCorria: corrida.yaCorria }, { status: 202 });
    }

    const r = await guardarVersionDeLaEscala(c.exploracionId, { origen: "manual", email: g.email, nota: c.nota ?? null });
    switch (r.estado) {
      case "guardada":
        return NextResponse.json({ ok: true, id: r.id });
      case "igual":
        return NextResponse.json({ ok: true, id: r.id, igual: true });
      case "sin-nivel":
        return NextResponse.json({ error: "Esa exploración todavía no tiene ningún nivel confirmado: no hay qué guardar." }, { status: 409 });
      case "sin-tabla":
        return NextResponse.json({ error: `Falta aplicar ${SQL_DE_LAS_VERSIONES} y reiniciar.` }, { status: 503 });
      case "no-existe":
        return NextResponse.json({ error: "Esa exploración no existe." }, { status: 404 });
    }
  } catch (e) {
    console.error("[clients/escala]", e);
    return NextResponse.json({ error: "No se pudo completar el pedido." }, { status: 500 });
  }
}
