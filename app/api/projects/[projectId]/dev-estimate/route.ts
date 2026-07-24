/**
 * GET  /api/projects/[projectId]/dev-estimate — estimación vigente + historial.
 * POST /api/projects/[projectId]/dev-estimate — registra una estimación NUEVA (append-only).
 *
 * DOS GUARDS DISTINTOS A PROPÓSITO:
 *   · GET  → `guardAccessToProject`: quien puede ver el proyecto puede VER cuánto se estimó
 *            (el CSE necesita el dato para hablar con el cliente).
 *   · POST → `guardAccessToProject` + `guardPermission("desarrollo","estimate")`: escribir la
 *            estimación es del equipo técnico. El acceso al proyecto va PRIMERO para que un
 *            DEV con el permiso no pueda escribir en un cliente al que no tiene acceso con
 *            solo conocer el projectId (row-level y matriz son ortogonales — ARCHITECTURE §4.2).
 *
 * La UI oculta el formulario con `useMe()`, pero eso es cosmético: la barrera real es este POST.
 */
import { NextRequest, NextResponse } from "next/server";
import { guardAccessToProject, guardPermission } from "@/lib/auth/api-guards";
import { addDevEstimate, devEstimateCreateSchema, loadDevEstimate } from "@/lib/desarrollo";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await params;
  const access = await guardAccessToProject(projectId);
  if (access instanceof NextResponse) return access;

  return NextResponse.json(await loadDevEstimate(projectId));
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await params;
  const access = await guardAccessToProject(projectId);
  if (access instanceof NextResponse) return access;
  const perm = await guardPermission("desarrollo", "estimate");
  if (perm instanceof NextResponse) return perm;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const parsed = devEstimateCreateSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Input inválido" },
      { status: 400 },
    );
  }

  // La autoría sale de la SESIÓN, nunca del body (si no, cualquiera firma como otro).
  const state = await addDevEstimate(projectId, parsed.data, perm.user.email);
  return NextResponse.json(state);
}
