/**
 * /api/projects/[projectId]/timeline/sources — NOTAS MANUALES DEL CRONOGRAMA (2026-09-23).
 *
 * Lo que el CSE pega a mano en el «Contexto del cronograma» para que el agente arme fases y tareas:
 * una decisión que no quedó en ninguna reunión, un cambio de prioridad, algo que ya se hizo.
 *
 *   GET  → { sources } (no borradas, en orden de carga)
 *   POST { title?, content } → crea una nota (createdByEmail del guard)
 *
 * ── NO ES HandoffSource ──────────────────────────────────────────────────────
 * Tabla propia (`TimelineSource`): las fuentes manuales del handoff las leen el handoff, el mapeo de
 * procesos de TODO el cliente y el gate de material del handoff, sin filtrar por tipo. Una nota del
 * cronograma guardada ahí se habría colado en los tres.
 *
 * ── EL GUARD ES EL DEL CRONOGRAMA ────────────────────────────────────────────
 * Leer = acceso al proyecto (como las instrucciones de la pieza). Escribir = `guardTimelineEdit`
 * (`cronograma.write`, que el CSE tiene). NO el guard del handoff: ataba el permiso al handoff y le
 * devolvía 403 al CSE con el cliente compartido — y la pantalla vieja se lo tragaba en silencio.
 */
import { NextRequest, NextResponse } from "next/server";
import { guardAccessToProject, guardTimelineEdit } from "@/lib/auth/api-guards";
import { prisma } from "@/lib/db/prisma";
import { esquemaDesactualizado, modeloDisponible } from "@/lib/db/esquema";
import { TOPE_NOTAS_CRONOGRAMA } from "@/lib/contexto/material-cronograma";

const SELECT = { id: true, title: true, content: true, createdByEmail: true, createdAt: true } as const;

/**
 * La tabla todavía no existe (el SQL va antes del deploy, pero la ventana existe).
 * ⚠ Función y no constante: un `Response` se consume una vez; reusar el mismo objeto en dos
 * pedidos devuelve un cuerpo vacío al segundo.
 */
const esquemaAtrasado = () => NextResponse.json(
  {
    error:
      "Falta aplicar la migración de las notas del cronograma " +
      "(scripts/sql/2026-09-23-contexto-cronograma.sql).",
    esquemaAtrasado: true,
  },
  { status: 503 },
);

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await params;
  const guard = await guardAccessToProject(projectId);
  if (guard instanceof NextResponse) return guard;

  if (!modeloDisponible(prisma.timelineSource)) return esquemaAtrasado();
  try {
    const sources = await prisma.timelineSource.findMany({
      where: { projectId, deletedAt: null },
      orderBy: { createdAt: "asc" },
      select: SELECT,
    });
    return NextResponse.json({ sources });
  } catch (e) {
    if (esquemaDesactualizado(e)) return esquemaAtrasado();
    throw e;
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await params;
  const guard = await guardTimelineEdit(projectId);
  if (guard instanceof NextResponse) return guard;

  let body: { title?: unknown; content?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const content = typeof body.content === "string" ? body.content.trim() : "";
  const title = typeof body.title === "string" && body.title.trim() ? body.title.trim().slice(0, 200) : null;
  if (!content) {
    return NextResponse.json({ error: "El contenido no puede estar vacío." }, { status: 400 });
  }
  /* Una nota sola más larga que el tope TOTAL no entra nunca entera: el agente leería el
     principio y la pantalla diría «guardada». Se rechaza con el número, que es lo que dice qué hacer. */
  if (content.length > TOPE_NOTAS_CRONOGRAMA) {
    return NextResponse.json(
      {
        error: `La nota tiene ${content.length.toLocaleString("es-CR")} caracteres y el agente lee hasta ${TOPE_NOTAS_CRONOGRAMA.toLocaleString("es-CR")} en total. Resumila o partila.`,
      },
      { status: 400 },
    );
  }

  if (!modeloDisponible(prisma.timelineSource)) return esquemaAtrasado();
  try {
    const created = await prisma.timelineSource.create({
      data: { projectId, title, content, createdByEmail: guard.teamMember.email ?? null },
      select: SELECT,
    });
    return NextResponse.json({ source: created }, { status: 201 });
  } catch (e) {
    if (esquemaDesactualizado(e)) return esquemaAtrasado();
    throw e;
  }
}
