/**
 * GET/POST /api/projects/[projectId]/cuestionario — los cuestionarios del proyecto, del lado del CSE.
 *
 * Desde el 2026-10-02: varias PERSONAS del cliente (un enlace cada una) y varios CUESTIONARIOS, cada
 * uno de una persona y de un tipo («tactico» | «escala»).
 *
 * GET: lectura (cualquiera con acceso al proyecto). Los adjuntos traen un enlace firmado de 1 h.
 * POST: una ACCIÓN por request, validada con zod. Editar pide lo mismo que el cronograma (dueño del
 * cliente o handoff en cualquier cliente); crear personas y publicar pide además que el proyecto
 * admita publicación externa — un proyecto interno no le manda nada a nadie.
 *
 * La lógica vive en lib/cuestionario/servicio.ts (y escala.ts); acá solo se autentica y se despacha.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { guardAccessToProject, guardProjectHandoffAccess } from "@/lib/auth/api-guards";
import { compararCuestionarios } from "@/lib/cuestionario/comparar";
import { crearEscala, resultadosDeEscala } from "@/lib/cuestionario/escala";
import { leerOperaciones } from "@/lib/cuestionario/operaciones";
import { arrancarPrellenado } from "@/lib/cuestionario/prellenar";
import {
  ErrorDeCuestionario,
  asignarPersona,
  cerrar,
  crearPersona,
  crearTactico,
  editarEstructura,
  editarPersona,
  eliminarCuestionario,
  obtenerCuestionarios,
  publicar,
  reabrirPestana,
  revocarPersona,
} from "@/lib/cuestionario/servicio";
import { getSignedUrl } from "@/lib/storage/client";
import { prisma } from "@/lib/db/prisma";

async function respuesta(projectId: string) {
  const v = await obtenerCuestionarios(projectId);
  const ids = v.cuestionarios.flatMap((c) => c.pestanas.flatMap((p) => p.adjuntos.map((a) => a.id)));
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
  const resultados = await resultadosDeEscala(projectId).catch(() => []);
  return { ...v, comparacion: compararCuestionarios(v, resultados), enlaces };
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const guard = await guardAccessToProject(projectId);
  if (guard instanceof NextResponse) return guard;
  return NextResponse.json({
    ...(await respuesta(projectId)),
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
  z.strictObject({ accion: z.literal("crear_persona"), ...datosPersona }),
  z.strictObject({ accion: z.literal("editar_persona"), personaId: id, ...datosPersona }),
  z.strictObject({ accion: z.literal("revocar_persona"), personaId: id }),
  z.strictObject({ accion: z.literal("crear_cuestionario"), tipo: z.enum(["tactico", "escala"]), personaId: id }),
  z.strictObject({ accion: z.literal("asignar_persona"), cuestionarioId: id, personaId: id.nullable() }),
  z.strictObject({ accion: z.literal("operaciones"), cuestionarioId: id, ops: z.array(z.unknown()).min(1).max(50) }),
  z.strictObject({ accion: z.literal("publicar"), cuestionarioId: id, publicado: z.boolean() }),
  z.strictObject({ accion: z.literal("cerrar"), cuestionarioId: id, cerrado: z.boolean() }),
  z.strictObject({ accion: z.literal("eliminar_cuestionario"), cuestionarioId: id }),
  z.strictObject({ accion: z.literal("prellenar"), cuestionarioId: id }),
  z.strictObject({ accion: z.literal("reabrir_pestana"), pestanaId: id, motivo: z.string().max(2000).optional() }),
]);

/** Acciones que dejan algo al alcance del cliente: exigen un proyecto publicable. */
const HACIA_AFUERA = new Set(["crear_persona", "publicar"]);

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
    switch (a.accion) {
      case "crear_persona":
        await crearPersona(projectId, a);
        break;
      case "editar_persona":
        await editarPersona(projectId, a.personaId, a);
        break;
      case "revocar_persona":
        await revocarPersona(projectId, a.personaId);
        break;
      case "crear_cuestionario": {
        if (a.tipo === "tactico") {
          const cuestionarioId = await crearTactico(projectId, a.personaId, guard.teamMember?.id ?? null);
          // Recién armado: Nexus contesta de una lo que ya sabe del handoff y el kickoff.
          await arrancarPrellenado(cuestionarioId);
        } else {
          await crearEscala(projectId, a.personaId, guard.teamMember?.id ?? null);
        }
        break;
      }
      case "asignar_persona":
        await asignarPersona(projectId, a.cuestionarioId, a.personaId);
        break;
      case "operaciones": {
        const ops = leerOperaciones(a.ops);
        if (!ops) return NextResponse.json({ error: "Operaciones inválidas" }, { status: 400 });
        await editarEstructura(projectId, a.cuestionarioId, ops);
        break;
      }
      case "publicar":
        await publicar(projectId, a.cuestionarioId, a.publicado);
        break;
      case "cerrar":
        await cerrar(projectId, a.cuestionarioId, a.cerrado);
        break;
      case "eliminar_cuestionario":
        await eliminarCuestionario(projectId, a.cuestionarioId);
        break;
      case "prellenar": {
        const c = await prisma.cuestionario.findFirst({ where: { id: a.cuestionarioId, projectId }, select: { id: true, tipo: true } });
        if (!c) return NextResponse.json({ error: "Ese cuestionario no es de este proyecto." }, { status: 404 });
        if (c.tipo === "tactico") await arrancarPrellenado(c.id);
        break;
      }
      case "reabrir_pestana":
        await reabrirPestana(projectId, a.pestanaId, email, a.motivo);
        break;
    }
    return NextResponse.json(await respuesta(projectId));
  } catch (e) {
    if (e instanceof ErrorDeCuestionario) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
}
