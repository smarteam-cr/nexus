/**
 * /api/roles/[id]/asistente — LA CONVERSACIÓN SOBRE UN PERFIL DE PUESTO O UNA PROPUESTA LABORAL.
 *
 * Mismos verbos que las otras dos: el cuerpo vive en `lib/asistente/handler.ts`.
 *
 * ── LO QUE ES DISTINTO ACÁ, Y POR QUÉ ────────────────────────────────────────
 * Roles reusa el motor de PRESENTACIÓN del resto de los documentos (LandingView, las mismas
 * primitivas de edición) pero NO su motor de datos: su contenido vive en `RoleProfile.content`, un
 * Json por sección, y no en filas de `CanvasSection`. Es una decisión escrita en `docs/DECISIONS`,
 * no un accidente — por eso el contexto lo arma `contextoDeRol` y no el de canvas.
 *
 * ⛔ Y su lista de secciones es FIJA: no se crean, no se borran, no se ocultan y no se mueven. El
 * motor las arma siempre desde `ROLE_SECTIONS` completo, así que una operación de estructura acá
 * escribiría algo que nadie lee. El ejecutor las rechaza con su motivo.
 *
 * RBAC: `guardRolesAdmin` — el mismo que el assist de este módulo. ⚠ NO la celda
 * `asistente.read`: esa es de PROYECTO, y estos documentos no cuelgan de uno.
 */
import { NextRequest, NextResponse } from "next/server";
import { guardRolesAdmin } from "@/lib/auth/api-guards";
import { manejarGetDelAsistente, manejarPostDelAsistente } from "@/lib/asistente/handler";

type Params = Promise<{ id: string }>;

export async function GET(req: NextRequest, { params }: { params: Params }) {
  const { id } = await params;
  const guard = await guardRolesAdmin();
  if (guard instanceof NextResponse) return guard;
  return manejarGetDelAsistente(req, { roleId: id });
}

export async function POST(req: NextRequest, { params }: { params: Params }) {
  const { id } = await params;
  const guard = await guardRolesAdmin();
  if (guard instanceof NextResponse) return guard;
  return manejarPostDelAsistente(req, { roleId: id });
}
