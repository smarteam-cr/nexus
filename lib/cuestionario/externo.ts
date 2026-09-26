import "server-only";

/**
 * lib/cuestionario/externo.ts — el cuestionario del lado del CLIENTE. CHOKEPOINT de seguridad.
 *
 * La URL es el secreto (`/external/cuestionario/<token de 64 hex>`), igual que la propuesta: el
 * cliente abre el enlace y contesta, sin contraseña. Cada enlace es de UNA persona y solo le
 * muestra las pestañas que el CSE le asignó; nada más del proyecto.
 *
 * Todo fallo de acceso se ve igual (`denegado`): token inventado, revocado o cuestionario sin
 * publicar dan el mismo 404 neutro. La excepción es `cerrado`, que se muestra en solo lectura:
 * para verlo hay que tener un token válido en la mano.
 *
 * Cada escritura vuelve a pasar por `resolver`: revocar un enlace o despublicar el cuestionario
 * corta al cliente en su próximo guardado, no en su próxima visita.
 */
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { nombreVisibleDelProyecto } from "@/lib/external/nombre-visible";
import { fundirGuardado, type GuardadoDelCliente } from "./avance";
import { leerEtapas, leerPreguntas, leerRespuestas, type Etapa, type Pregunta, type Respuestas, type TipoPestana } from "./tipos";

export const TOKEN_RE = /^[a-f0-9]{64}$/i;

export interface AdjuntoDelCliente {
  id: string;
  titulo: string;
  descripcion: string | null;
  fileSize: number | null;
}

export interface PestanaDelCliente {
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
  responsable: { nombre: string };
  proyecto: string;
  cliente: string;
  clientLogoUrl: string | null;
  cerrado: boolean;
  pestanas: PestanaDelCliente[];
}

export type ResolucionDelCliente =
  | { kind: "denegado" }
  | { kind: "ok"; responsableId: string; cuestionarioId: string; clientId: string; projectId: string; vista: CuestionarioDelCliente };

const iso = (d: Date | null) => (d ? d.toISOString() : null);

/** «Último uso» sin escribir en cada autoguardado: basta con saber que entró hoy. */
const TOQUE_MS = 5 * 60_000;

export async function resolver(token: unknown): Promise<ResolucionDelCliente> {
  if (typeof token !== "string" || !TOKEN_RE.test(token)) return { kind: "denegado" };

  const r = await prisma.cuestionarioResponsable.findUnique({
    where: { accessToken: token },
    include: {
      cuestionario: {
        include: {
          project: { select: { id: true, name: true, clientId: true, client: { select: { name: true, logoUrl: true } } } },
        },
      },
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
  });
  if (!r || r.revokedAt || !r.cuestionario.publicadoAt) return { kind: "denegado" };

  if (!r.ultimoUsoAt || Date.now() - r.ultimoUsoAt.getTime() > TOQUE_MS) {
    // Best-effort: una lectura no falla porque no se pudo anotar el último uso.
    await prisma.cuestionarioResponsable
      .update({ where: { id: r.id }, data: { ultimoUsoAt: new Date() } })
      .catch(() => {});
  }

  const project = r.cuestionario.project;
  return {
    kind: "ok",
    responsableId: r.id,
    cuestionarioId: r.cuestionarioId,
    clientId: project.clientId,
    projectId: project.id,
    vista: {
      responsable: { nombre: r.nombre },
      proyecto: nombreVisibleDelProyecto(project.name, project.client.name),
      cliente: project.client.name,
      clientLogoUrl: project.client.logoUrl,
      cerrado: r.cuestionario.cerradoAt != null,
      pestanas: r.pestanas.map((p) => ({
        key: p.key,
        titulo: p.titulo,
        descripcion: p.descripcion,
        tipo: p.tipo === "etapas" ? "etapas" : "normal",
        preguntas: leerPreguntas(p.preguntas),
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
        // Solo las de ESTA persona: si la pestaña pasó de manos, lo que pidió otro no es suyo.
        solicitudes: p.cambios
          .filter((c) => c.responsableId === r.id && c.mensaje)
          .map((c) => ({ mensaje: c.mensaje!, createdAt: c.createdAt.toISOString() })),
      })),
    },
  };
}

export type ResultadoDelCliente<T = object> = ({ ok: true } & T) | { ok: false; error: string; status: number };

type ErrorDelCliente = { ok: false; error: string; status: number };

const NO_DISPONIBLE = { ok: false as const, error: "Este enlace ya no está disponible.", status: 404 };

/** La pestaña de ESTA persona, lista para escribir; o el motivo por el que no se puede. */
type Editable =
  | { error: ErrorDelCliente }
  | {
      res: Extract<ResolucionDelCliente, { kind: "ok" }>;
      fila: NonNullable<Awaited<ReturnType<typeof prisma.cuestionarioPestana.findFirst>>>;
    };

async function pestanaEditable(token: unknown, key: unknown): Promise<Editable> {
  const res = await resolver(token);
  if (res.kind !== "ok") return { error: NO_DISPONIBLE };
  if (res.vista.cerrado) {
    return { error: { ok: false as const, error: "El cuestionario ya se cerró. Gracias por tu ayuda.", status: 409 } };
  }
  const fila = await prisma.cuestionarioPestana.findFirst({
    where: { cuestionarioId: res.cuestionarioId, key: typeof key === "string" ? key : "", responsableId: res.responsableId },
  });
  if (!fila) return { error: NO_DISPONIBLE };
  return { res, fila };
}

export async function guardarPestana(
  token: unknown,
  key: unknown,
  guardado: GuardadoDelCliente,
): Promise<ResultadoDelCliente<{ actualizadoAt: string }>> {
  const r = await pestanaEditable(token, key);
  if ("error" in r) return r.error;
  const { fila } = r;
  if (fila.enviadaAt) {
    return { ok: false, error: "Ya enviaste esta pestaña. Si quieres cambiar algo, pídelo abajo.", status: 409 };
  }
  const ahora = new Date();
  const fundido = fundirGuardado(
    {
      tipo: fila.tipo === "etapas" ? "etapas" : "normal",
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
  key: unknown,
  guardado: GuardadoDelCliente,
): Promise<ResultadoDelCliente<{ enviadaAt: string }>> {
  const g = await guardarPestana(token, key, guardado);
  if (!g.ok) return g;
  const r = await pestanaEditable(token, key);
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
        cuestionarioId: r.res.cuestionarioId,
        pestanaId: r.fila.id,
        responsableId: r.res.responsableId,
        tipo: "ENVIO",
      },
    });
  }
  return { ok: true, enviadaAt: (r.fila.enviadaAt ?? ahora).toISOString() };
}

/** Después de enviar, el cliente no edita: dice qué quiere cambiar y queda registrado. */
export async function pedirCambio(token: unknown, key: unknown, mensaje: unknown): Promise<ResultadoDelCliente> {
  const texto = typeof mensaje === "string" ? mensaje.trim().slice(0, 4000) : "";
  if (!texto) return { ok: false, error: "Cuéntanos qué quieres cambiar.", status: 400 };
  const r = await pestanaEditable(token, key);
  if ("error" in r) return r.error;
  if (!r.fila.enviadaAt) {
    return { ok: false, error: "Esta pestaña todavía no está enviada: puedes cambiarla directamente.", status: 409 };
  }
  await prisma.cuestionarioCambio.create({
    data: {
      cuestionarioId: r.res.cuestionarioId,
      pestanaId: r.fila.id,
      responsableId: r.res.responsableId,
      tipo: "SOLICITUD",
      mensaje: texto,
    },
  });
  return { ok: true };
}

/** Para los adjuntos: la pestaña editable + a qué cliente/proyecto va el archivo. */
export async function destinoDeAdjunto(
  token: unknown,
  key: unknown,
): Promise<{ error: ErrorDelCliente } | { pestanaId: string; clientId: string; projectId: string }> {
  const r = await pestanaEditable(token, key);
  if ("error" in r) return { error: r.error };
  if (r.fila.enviadaAt) {
    return { error: { ok: false as const, error: "Ya enviaste esta pestaña: no se pueden sumar archivos.", status: 409 } };
  }
  return { pestanaId: r.fila.id, clientId: r.res.clientId, projectId: r.res.projectId };
}

/** El adjunto, solo si es de una pestaña de ESTA persona y la pestaña sigue abierta. */
export async function adjuntoBorrable(token: unknown, documentoId: unknown) {
  const res = await resolver(token);
  if (res.kind !== "ok" || typeof documentoId !== "string") return null;
  if (res.vista.cerrado) return null;
  const doc = await prisma.clientDocument.findFirst({
    where: {
      id: documentoId,
      cuestionarioPestana: { responsableId: res.responsableId, cuestionarioId: res.cuestionarioId, enviadaAt: null },
    },
    select: { id: true, url: true },
  });
  return doc;
}
