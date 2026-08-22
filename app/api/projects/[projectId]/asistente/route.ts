/**
 * /api/projects/[projectId]/asistente — LA CONVERSACIÓN SOBRE UN DOCUMENTO DE PROYECTO.
 *
 *   GET  ?pieza=timeline          → el hilo vivo de esta persona sobre esa pieza (o vacío)
 *   POST { pieza, mensaje }       → un turno: el CSE dice algo, el asistente contesta
 *   POST { pieza, empezarDeCero } → abre un hilo nuevo (el viejo queda como historia)
 *   POST { pieza, desenlace }     → qué pasó cuando el CSE apretó «Aplicar»
 *
 * ⚠ El cuerpo vive en `lib/asistente/handler.ts`, compartido con las rutas de la propuesta
 * comercial y de Roles. Lo único propio de esta ruta es QUIÉN es el dueño del hilo y QUÉ guard lo
 * protege — tres copias del mismo manejador divergirían, y la que se olvida no falla: contesta
 * distinto.
 *
 * RBAC: acceso al proyecto + la celda `asistente.read`. ⚠ NO alcanza con el acceso al proyecto:
 * conversar consume modelo, así que es una capacidad y no un permiso implícito de lectura.
 */
import { NextRequest, NextResponse } from "next/server";
import { guardAccessToProject, guardPermission } from "@/lib/auth/api-guards";
import { manejarGetDelAsistente, manejarPostDelAsistente } from "@/lib/asistente/handler";

type Params = Promise<{ projectId: string }>;

/* ⚠ Los dos guards van INLINE en cada handler, no en un helper compartido. El trinquete de
   `lib/auth/project-api-guards.test.ts` escanea el cuerpo de cada handler buscando la llamada:
   esconderla en una función lo dejaría en verde por texto mientras alguien agrega un handler sin
   guard. Dos líneas repetidas valen menos que un trinquete que mira para otro lado. */

export async function GET(req: NextRequest, { params }: { params: Params }) {
  const { projectId } = await params;
  const access = await guardAccessToProject(projectId);
  if (access instanceof NextResponse) return access;
  const perm = await guardPermission("asistente", "read");
  if (perm instanceof NextResponse) return perm;
  return manejarGetDelAsistente(req, { projectId });
}

export async function POST(req: NextRequest, { params }: { params: Params }) {
  const { projectId } = await params;
  const access = await guardAccessToProject(projectId);
  if (access instanceof NextResponse) return access;
  const perm = await guardPermission("asistente", "read");
  if (perm instanceof NextResponse) return perm;
  return manejarPostDelAsistente(req, { projectId });
}
