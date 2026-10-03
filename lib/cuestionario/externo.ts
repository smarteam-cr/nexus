import "server-only";

/**
 * lib/cuestionario/externo.ts — los cuestionarios del lado del CLIENTE. CHOKEPOINT de seguridad.
 *
 * La URL es el secreto (`/external/cuestionario/<token de 64 hex>`), igual que la propuesta: el
 * cliente abre el enlace y contesta, sin contraseña. Desde el 2026-10-02 el enlace es de una PERSONA
 * y le muestra TODOS sus cuestionarios publicados (táctico, escala…); nada más del proyecto, y nada
 * de lo que contestó otra persona.
 *
 * Todo fallo de acceso se ve igual (`denegado`): token inventado, revocado o sin ningún cuestionario
 * publicado dan el mismo 404 neutro.
 *
 * Cada escritura vuelve a pasar por `resolver`: revocar un enlace o despublicar un cuestionario corta
 * al cliente en su próximo guardado, no en su próxima visita.
 *
 * ⛔ El cliente nunca ve a qué apunta una pregunta de escala ni qué nivel significa cada opción:
 * `preguntaParaElCliente` los quita antes de armar la vista.
 */
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { nombreVisibleDelProyecto } from "@/lib/external/nombre-visible";
import { fundirGuardado, type GuardadoDelCliente } from "./avance";
import {
  TITULO_DEL_TIPO,
  esTipoDeCuestionario,
  leerEtapas,
  leerPreguntas,
  leerRespuestas,
  preguntaParaElCliente,
  type Etapa,
  type Pregunta,
  type Respuestas,
  type TipoDeCuestionario,
  type TipoPestana,
} from "./tipos";

export const TOKEN_RE = /^[a-f0-9]{64}$/i;

export interface AdjuntoDelCliente {
  id: string;
  titulo: string;
  descripcion: string | null;
  fileSize: number | null;
}

export interface PestanaDelCliente {
  /** El id de la pestaña: así la nombran las escrituras (dos cuestionarios pueden repetir `key`). */
  id: string;
  key: string;
  titulo: string;
  descripcion: string | null;
  tipo: TipoPestana;
  preguntas: Pregunta[];
  respuestas: Respuestas;
  etapas: Etapa[];
  contextoAdicional: string | null;
  enviadaAt: string | null;
  clienteActualizadoAt: string | null;
  adjuntos: AdjuntoDelCliente[];
  /** Los cambios que esta persona pidió después de enviar (para que vea que quedaron registrados). */
  solicitudes: Array<{ mensaje: string; createdAt: string }>;
}

export interface CuestionarioDelCliente {
  id: string;
  tipo: TipoDeCuestionario;
  titulo: string;
  cerrado: boolean;
  pestanas: PestanaDelCliente[];
}

export interface VistaDelCliente {
  persona: { nombre: string };
  proyecto: string;
  cliente: string;
  clientLogoUrl: string | null;
  cuestionarios: CuestionarioDelCliente[];
}

export type ResolucionDelCliente =
  | { kind: "denegado" }
  | { kind: "ok"; personaId: string; clientId: string; projectId: string; vista: VistaDelCliente };

const iso = (d: Date | null) => (d ? d.toISOString() : null);

/** «Último uso» sin escribir en cada autoguardado: basta con saber que entró hoy. */
const TOQUE_MS = 5 * 60_000;

export async function resolver(token: unknown): Promise<ResolucionDelCliente> {
  if (typeof token !== "string" || !TOKEN_RE.test(token)) return { kind: "denegado" };

  const r = await prisma.cuestionarioResponsable.findUnique({
    where: { accessToken: token },
    include: {
      project: { select: { id: true, name: true, clientId: true, client: { select: { name: true, logoUrl: true } } } },
      cuestionarios: {
        where: { publicadoAt: { not: null } },
        orderBy: { createdAt: "asc" },
        include: {
          pestanas: {
            orderBy: { orden: "asc" },
            include: {
              adjuntos: {
                orderBy: { createdAt: "asc" },
                select: { id: true, title: true, descripcion: true, fileSize: true },
              },
              cambios: {
                where: { tipo: "SOLICITUD" },
                orderBy: { createdAt: "asc" },
                select: { mensaje: true, createdAt: true, responsableId: true },
              },
            },
          },
        },
      },
    },
  });
  if (!r || r.revokedAt || !r.project || r.cuestionarios.length === 0) return { kind: "denegado" };

  if (!r.ultimoUsoAt || Date.now() - r.ultimoUsoAt.getTime() > TOQUE_MS) {
    // Best-effort: una lectura no falla porque no se pudo anotar el último uso.
    await prisma.cuestionarioResponsable
      .update({ where: { id: r.id }, data: { ultimoUsoAt: new Date() } })
      .catch(() => {});
  }

  const project = r.project;
  return {
    kind: "ok",
    personaId: r.id,
    clientId: project.clientId,
    projectId: project.id,
    vista: {
      persona: { nombre: r.nombre },
      proyecto: nombreVisibleDelProyecto(project.name, project.client.name),
      cliente: project.client.name,
      clientLogoUrl: project.client.logoUrl,
      cuestionarios: r.cuestionarios.map((c) => {
        const tipo: TipoDeCuestionario = esTipoDeCuestionario(c.tipo) ? c.tipo : "tactico";
        return {
          id: c.id,
          tipo,
          titulo: TITULO_DEL_TIPO[tipo],
          cerrado: c.cerradoAt != null,
          pestanas: c.pestanas.map((p) => ({
            id: p.id,
            key: p.key,
            titulo: p.titulo,
            descripcion: p.descripcion,
            tipo: tipoDeFila(p.tipo),
            preguntas: leerPreguntas(p.preguntas).map(preguntaParaElCliente),
            respuestas: leerRespuestas(p.respuestas),
            etapas: leerEtapas(p.etapas),
            contextoAdicional: p.contextoAdicional,
            enviadaAt: iso(p.enviadaAt),
            clienteActualizadoAt: iso(p.clienteActualizadoAt),
            adjuntos: p.adjuntos.map((a) => ({
              id: a.id,
              titulo: a.title,
              descripcion: a.descripcion,
              fileSize: a.fileSize,
            })),
            // Solo las de ESTA persona.
            solicitudes: p.cambios
              .filter((x) => x.responsableId === r.id && x.mensaje)
              .map((x) => ({ mensaje: x.mensaje!, createdAt: x.createdAt.toISOString() })),
          })),
        };
      }),
    },
  };
}

export type ResultadoDelCliente<T = object> = ({ ok: true } & T) | { ok: false; error: string; status: number };

type ErrorDelCliente = { ok: false; error: string; status: number };

const NO_DISPONIBLE = { ok: false as const, error: "Este enlace ya no está disponible.", status: 404 };

function tipoDeFila(t: string): TipoPestana {
  return t === "etapas" ? "etapas" : t === "escala" ? "escala" : "normal";
}

/** La pestaña de un cuestionario PUBLICADO de ESTA persona, lista para escribir; o el motivo. */
type Editable =
  | { error: ErrorDelCliente }
  | {
      res: Extract<ResolucionDelCliente, { kind: "ok" }>;
      fila: NonNullable<Awaited<ReturnType<typeof prisma.cuestionarioPestana.findFirst>>>;
    };

async function pestanaEditable(token: unknown, pestanaId: unknown): Promise<Editable> {
  const res = await resolver(token);
  if (res.kind !== "ok" || typeof pestanaId !== "string" || !pestanaId) return { error: NO_DISPONIBLE };
  const c = res.vista.cuestionarios.find((x) => x.pestanas.some((p) => p.id === pestanaId));
  if (!c) return { error: NO_DISPONIBLE };
  if (c.cerrado) {
    return { error: { ok: false as const, error: "El cuestionario ya se cerró. Gracias por tu ayuda.", status: 409 } };
  }
  // Se vuelve a leer con el cuestionario y la persona en el where: la vista ya lo garantizó, la
  // escritura no se apoya en eso.
  const fila = await prisma.cuestionarioPestana.findFirst({
    where: { id: pestanaId, cuestionario: { id: c.id, personaId: res.personaId, publicadoAt: { not: null } } },
  });
  if (!fila) return { error: NO_DISPONIBLE };
  return { res, fila };
}

export async function guardarPestana(
  token: unknown,
  pestanaId: unknown,
  guardado: GuardadoDelCliente,
): Promise<ResultadoDelCliente<{ actualizadoAt: string }>> {
  const r = await pestanaEditable(token, pestanaId);
  if ("error" in r) return r.error;
  const { fila } = r;
  if (fila.enviadaAt) {
    return { ok: false, error: "Ya enviaste esta sección. Si quieres cambiar algo, pídelo abajo.", status: 409 };
  }
  const ahora = new Date();
  const fundido = fundirGuardado(
    {
      tipo: tipoDeFila(fila.tipo),
      preguntas: leerPreguntas(fila.preguntas),
      respuestas: leerRespuestas(fila.respuestas),
      etapas: leerEtapas(fila.etapas),
    },
    guardado,
    ahora.toISOString(),
  );
  await prisma.cuestionarioPestana.update({
    where: { id: fila.id },
    data: {
      respuestas: fundido.respuestas as unknown as Prisma.InputJsonValue,
      etapas: fundido.etapas as unknown as Prisma.InputJsonValue,
      contextoAdicional: guardado.contextoAdicional?.trim() ? guardado.contextoAdicional : null,
      clienteActualizadoAt: ahora,
    },
  });
  return { ok: true, actualizadoAt: ahora.toISOString() };
}

/** Guarda lo último y la BLOQUEA. Queda en el registro. */
export async function enviarPestana(
  token: unknown,
  pestanaId: unknown,
  guardado: GuardadoDelCliente,
): Promise<ResultadoDelCliente<{ enviadaAt: string }>> {
  const g = await guardarPestana(token, pestanaId, guardado);
  if (!g.ok) return g;
  const r = await pestanaEditable(token, pestanaId);
  if ("error" in r) return r.error;
  const ahora = new Date();
  // updateMany con `enviadaAt: null` en el where: dos clics en «Enviar» registran UN envío.
  const hecho = await prisma.cuestionarioPestana.updateMany({
    where: { id: r.fila.id, enviadaAt: null },
    data: { enviadaAt: ahora },
  });
  if (hecho.count === 1) {
    await prisma.cuestionarioCambio.create({
      data: {
        cuestionarioId: r.fila.cuestionarioId,
        pestanaId: r.fila.id,
        responsableId: r.res.personaId,
        tipo: "ENVIO",
      },
    });
  }
  return { ok: true, enviadaAt: (r.fila.enviadaAt ?? ahora).toISOString() };
}

/** Después de enviar, el cliente no edita: dice qué quiere cambiar y queda registrado. */
export async function pedirCambio(token: unknown, pestanaId: unknown, mensaje: unknown): Promise<ResultadoDelCliente> {
  const texto = typeof mensaje === "string" ? mensaje.trim().slice(0, 4000) : "";
  if (!texto) return { ok: false, error: "Cuéntanos qué quieres cambiar.", status: 400 };
  const r = await pestanaEditable(token, pestanaId);
  if ("error" in r) return r.error;
  if (!r.fila.enviadaAt) {
    return { ok: false, error: "Esta sección todavía no está enviada: puedes cambiarla directamente.", status: 409 };
  }
  await prisma.cuestionarioCambio.create({
    data: {
      cuestionarioId: r.fila.cuestionarioId,
      pestanaId: r.fila.id,
      responsableId: r.res.personaId,
      tipo: "SOLICITUD",
      mensaje: texto,
    },
  });
  return { ok: true };
}

/** Para los adjuntos: la pestaña editable + a qué cliente/proyecto va el archivo. */
export async function destinoDeAdjunto(
  token: unknown,
  pestanaId: unknown,
): Promise<{ error: ErrorDelCliente } | { pestanaId: string; clientId: string; projectId: string }> {
  const r = await pestanaEditable(token, pestanaId);
  if ("error" in r) return { error: r.error };
  if (r.fila.enviadaAt) {
    return { error: { ok: false as const, error: "Ya enviaste esta sección: no se pueden sumar archivos.", status: 409 } };
  }
  return { pestanaId: r.fila.id, clientId: r.res.clientId, projectId: r.res.projectId };
}

/** El adjunto, solo si es de una pestaña abierta de un cuestionario publicado de ESTA persona. */
export async function adjuntoBorrable(token: unknown, documentoId: unknown) {
  const res = await resolver(token);
  if (res.kind !== "ok" || typeof documentoId !== "string") return null;
  return prisma.clientDocument.findFirst({
    where: {
      id: documentoId,
      cuestionarioPestana: {
        enviadaAt: null,
        cuestionario: { personaId: res.personaId, publicadoAt: { not: null }, cerradoAt: null },
      },
    },
    select: { id: true, url: true },
  });
}
