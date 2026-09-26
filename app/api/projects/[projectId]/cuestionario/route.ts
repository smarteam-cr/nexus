/**
 * GET/POST /api/projects/[projectId]/cuestionario — el cuestionario previo, del lado del CSE.
 *
 * GET: lectura (cualquiera con acceso al proyecto). Los adjuntos traen un enlace firmado de 1 h.
 * POST: una ACCIÓN por request, validada con zod. Editar pide lo mismo que el cronograma (dueño del
 * cliente o handoff en cualquier cliente); crear enlaces y publicar pide además que el proyecto
 * admita publicación externa — un proyecto interno no le manda nada a nadie.
 *
 * La lógica vive en lib/cuestionario/servicio.ts; acá solo se autentica y se despacha.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { guardAccessToProject, guardProjectHandoffAccess } from "@/lib/auth/api-guards";
import { leerOperaciones } from "@/lib/cuestionario/operaciones";
import { arrancarPrellenado } from "@/lib/cuestionario/prellenar";
import {
  ErrorDeCuestionario,
  asignarPestana,
  cerrar,
  crearResponsable,
  editarEstructura,
  editarResponsable,
  generarCuestionario,
  obtenerCuestionario,
  publicar,
  reabrirPestana,
  revocarResponsable,
  type CuestionarioVista,
} from "@/lib/cuestionario/servicio";
import { getSignedUrl } from "@/lib/storage/client";
import { prisma } from "@/lib/db/prisma";

async function conEnlaces(v: CuestionarioVista | null) {
  if (!v) return { cuestionario: null, enlaces: {} };
  const ids = v.pestanas.flatMap((p) => p.adjuntos.map((a) => a.id));
  const docs = ids.length
    ? await prisma.clientDocument.findMany({ where: { id: { in: ids } }, select: { id: true, url: true } })
    : [];
  const enlaces: Record<string, string> = {};
  await Promise.all(
    docs.map(async (d) => {
      const url = d.url ? await getSignedUrl(d.url) : null;
      if (url) enlaces[d.id] = url;
    }),
  );
  return { cuestionario: v, enlaces };
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const guard = await guardAccessToProject(projectId);
  if (guard instanceof NextResponse) return guard;
  return NextResponse.json({
    ...(await conEnlaces(await obtenerCuestionario(projectId))),
    publicable: guard.capacidades.publicable,
    motivoNoPublicable: guard.motivoNoPublicable ?? null,
  });
}

const id = z.string().min(1).max(64);
const datosPersona = {
  nombre: z.string().max(120).optional(),
  cargo: z.string().max(120).nullable().optional(),
  email: z.string().max(200).nullable().optional(),
};

const Accion = z.discriminatedUnion("accion", [
  z.strictObject({ accion: z.literal("generar") }),
  z.strictObject({ accion: z.literal("prellenar") }),
  z.strictObject({ accion: z.literal("operaciones"), ops: z.array(z.unknown()).min(1).max(50) }),
  z.strictObject({ accion: z.literal("crear_responsable"), ...datosPersona }),
  z.strictObject({ accion: z.literal("editar_responsable"), responsableId: id, ...datosPersona }),
  z.strictObject({ accion: z.literal("revocar_responsable"), responsableId: id }),
  z.strictObject({ accion: z.literal("asignar"), pestanaId: id, responsableId: id.nullable() }),
  z.strictObject({ accion: z.literal("publicar"), publicado: z.boolean() }),
  z.strictObject({ accion: z.literal("cerrar"), cerrado: z.boolean() }),
  z.strictObject({ accion: z.literal("reabrir_pestana"), pestanaId: id, motivo: z.string().max(2000).optional() }),
]);

/** Acciones que dejan algo al alcance del cliente: exigen un proyecto publicable. */
const HACIA_AFUERA = new Set(["crear_responsable", "publicar"]);

export async function POST(req: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const guard = await guardProjectHandoffAccess(projectId);
  if (guard instanceof NextResponse) return guard;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const parsed = Accion.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: "Solicitud inválida" }, { status: 400 });
  const a = parsed.data;

  if (HACIA_AFUERA.has(a.accion) && !(a.accion === "publicar" && !a.publicado)) {
    const acceso = await guardAccessToProject(projectId);
    if (acceso instanceof NextResponse) return acceso;
    if (!acceso.capacidades.publicable) {
      return NextResponse.json(
        { error: acceso.motivoNoPublicable ?? "Este proyecto no admite publicación externa." },
        { status: 409 },
      );
    }
  }

  const email = guard.user.email ?? null;
  try {
    let v: CuestionarioVista;
    switch (a.accion) {
      case "generar": {
        const yaExistia = !!(await obtenerCuestionario(projectId));
        v = await generarCuestionario(projectId, guard.teamMember?.id ?? null);
        // Recién armado: Nexus contesta de una lo que ya sabe del handoff y el kickoff.
        if (!yaExistia && (await arrancarPrellenado(projectId))) v = (await obtenerCuestionario(projectId))!;
        break;
      }
      case "prellenar":
        if (!(await obtenerCuestionario(projectId))) {
          return NextResponse.json({ error: "Este proyecto todavía no tiene cuestionario." }, { status: 404 });
        }
        await arrancarPrellenado(projectId);
        v = (await obtenerCuestionario(projectId))!;
        break;
      case "operaciones": {
        const ops = leerOperaciones(a.ops);
        if (!ops) return NextResponse.json({ error: "Operaciones inválidas" }, { status: 400 });
        v = await editarEstructura(projectId, ops);
        break;
      }
      case "crear_responsable":
        v = await crearResponsable(projectId, a);
        break;
      case "editar_responsable":
        v = await editarResponsable(projectId, a.responsableId, a);
        break;
      case "revocar_responsable":
        v = await revocarResponsable(projectId, a.responsableId);
        break;
      case "asignar":
        v = await asignarPestana(projectId, a.pestanaId, a.responsableId);
        break;
      case "publicar":
        v = await publicar(projectId, a.publicado);
        break;
      case "cerrar":
        v = await cerrar(projectId, a.cerrado);
        break;
      case "reabrir_pestana":
        v = await reabrirPestana(projectId, a.pestanaId, email, a.motivo);
        break;
    }
    return NextResponse.json(await conEnlaces(v));
  } catch (e) {
    if (e instanceof ErrorDeCuestionario) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
}
