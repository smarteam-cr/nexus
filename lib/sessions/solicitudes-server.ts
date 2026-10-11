/**
 * lib/sessions/solicitudes-server.ts — leer, sumar y cambiar las SOLICITUDES FUERA DE ALCANCE de un
 * cliente, y avisar al confirmarlas. SERVIDOR. Las reglas: ./solicitudes-fuera-de-alcance.ts.
 *
 * Al confirmar una (2026-10-07, Elías) les llega un aviso a quien lleva el frente «Liderar Customer
 * Success» (Alex Vanegas) y al vendedor dueño de la empresa en HubSpot. El aviso sale DESPUÉS de
 * guardar y nunca frena el cambio: si no se pudo avisar al vendedor, el CSE lo sabe por la respuesta.
 */
import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { avisar } from "@/lib/para-ti/avisos-server";
import { fingerprintFromTitle } from "@/lib/timeline/particularidad-identity";
import { porQueNoSeAvisoAlVendedor, vendedorDeLaEmpresa } from "@/lib/hubspot/vendedor-de-la-empresa";
import {
  conEntrada,
  estadoDeSolicitud,
  laConfirma,
  leerHistorial,
  ORDEN_DE_SOLICITUD,
  urlDeSolicitudes,
  type CambioDeSolicitud,
  type EntradaDelHistorial,
  type EstadoDeSolicitud,
} from "./solicitudes-fuera-de-alcance";

export interface SolicitudEnPantalla {
  id: string;
  pedido: string;
  quienLoPidio: string | null;
  estado: EstadoDeSolicitud;
  monto: string | null;
  cita: string | null;
  nota: string | null;
  decididoPor: string | null;
  decididoAt: string | null;
  creadoPor: string | null;
  createdAt: string;
  historial: EntradaDelHistorial[];
  proyecto: { id: string; nombre: string } | null;
  reunion: { id: string; titulo: string | null; fecha: string } | null;
}

const SELECT = {
  id: true,
  pedido: true,
  quienLoPidio: true,
  estado: true,
  monto: true,
  cita: true,
  nota: true,
  decididoPor: true,
  decididoAt: true,
  creadoPor: true,
  createdAt: true,
  historial: true,
  clientId: true,
  project: { select: { id: true, name: true } },
  session: { select: { id: true, title: true, date: true } },
} satisfies Prisma.PedidoFueraDeAlcanceSelect;

type Fila = Prisma.PedidoFueraDeAlcanceGetPayload<{ select: typeof SELECT }>;

function enPantalla(f: Fila): SolicitudEnPantalla {
  return {
    id: f.id,
    pedido: f.pedido,
    quienLoPidio: f.quienLoPidio,
    estado: estadoDeSolicitud(f.estado),
    monto: f.monto,
    cita: f.cita,
    nota: f.nota,
    decididoPor: f.decididoPor,
    decididoAt: f.decididoAt?.toISOString() ?? null,
    creadoPor: f.creadoPor,
    createdAt: f.createdAt.toISOString(),
    historial: leerHistorial(f.historial),
    proyecto: f.project ? { id: f.project.id, nombre: f.project.name } : null,
    reunion: f.session ? { id: f.session.id, titulo: f.session.title, fecha: f.session.date.toISOString() } : null,
  };
}

/** Las de un cliente (o de uno de sus proyectos), lo que pide decisión primero. */
export async function solicitudesDelCliente(clientId: string, opts: { projectId?: string } = {}): Promise<SolicitudEnPantalla[]> {
  const filas = await prisma.pedidoFueraDeAlcance.findMany({
    where: { clientId, ...(opts.projectId ? { projectId: opts.projectId } : {}) },
    orderBy: { createdAt: "desc" },
    select: SELECT,
  });
  return filas
    .map(enPantalla)
    .sort((a, b) => ORDEN_DE_SOLICITUD[a.estado] - ORDEN_DE_SOLICITUD[b.estado]);
}

export interface ResultadoDelAviso {
  /** Cuántas personas recibieron el aviso. */
  avisados: number;
  /** Si no se pudo avisar al vendedor, por qué (para decírselo al CSE). */
  sinVendedor: string | null;
}

async function avisarQueSeConfirmo(f: Fila, actorEmail: string): Promise<ResultadoDelAviso> {
  const [cliente, vendedor] = await Promise.all([
    prisma.client.findUnique({ where: { id: f.clientId }, select: { name: true } }),
    vendedorDeLaEmpresa(f.clientId),
  ]);
  const empresa = cliente?.name ?? "Un cliente";
  const quien = f.quienLoPidio ? ` · Lo pidió: ${f.quienLoPidio}` : "";
  const avisados = await avisar({
    para: vendedor.ok ? vendedor.email : null,
    frente: "LIDERAR_CS",
    tipo: "alcance.confirmado",
    titulo: `${empresa} pidió algo fuera del alcance`,
    detalle: `«${f.pedido}»${quien}${f.project ? ` · ${f.project.name}` : ""}`,
    href: urlDeSolicitudes(f.clientId),
    actorEmail,
    dedupeKey: `alcance.confirmado:${f.id}`,
  });
  return { avisados, sinVendedor: vendedor.ok ? null : porQueNoSeAvisoAlVendedor(vendedor.motivo) };
}

export class SolicitudNoEncontrada extends Error {}
export class SolicitudRepetida extends Error {}
export class ProyectoDeOtroCliente extends Error {}

async function proyectoDelCliente(clientId: string, projectId: string | null | undefined): Promise<void> {
  if (!projectId) return;
  const p = await prisma.project.findFirst({ where: { id: projectId, clientId }, select: { id: true } });
  if (!p) throw new ProyectoDeOtroCliente("Ese proyecto no es de este cliente.");
}

/** Cambia una solicitud del cliente. `projectId` acota a un proyecto (la ruta del proyecto). */
export async function cambiarSolicitud(args: {
  clientId: string;
  id: string;
  cambio: CambioDeSolicitud;
  actorEmail: string;
  projectId?: string;
}): Promise<{ solicitud: SolicitudEnPantalla; aviso: ResultadoDelAviso | null }> {
  const previa = await prisma.pedidoFueraDeAlcance.findFirst({
    where: { id: args.id, clientId: args.clientId, ...(args.projectId ? { projectId: args.projectId } : {}) },
    select: SELECT,
  });
  if (!previa) throw new SolicitudNoEncontrada("Esa solicitud no es de este cliente.");
  if (args.cambio.projectId !== undefined) await proyectoDelCliente(args.clientId, args.cambio.projectId);

  const c = args.cambio;
  const antes = estadoDeSolicitud(previa.estado);
  const cambiaEstado = c.estado !== undefined && c.estado !== antes;
  const cambiaNota = c.nota !== undefined && c.nota !== (previa.nota ?? "");
  const ahora = new Date();
  const historial =
    cambiaEstado || cambiaNota
      ? conEntrada(previa.historial, {
          estado: c.estado ?? antes,
          por: args.actorEmail,
          en: ahora.toISOString(),
          ...(cambiaNota && c.nota ? { nota: c.nota } : {}),
        })
      : undefined;

  const fila = await prisma.pedidoFueraDeAlcance.update({
    where: { id: previa.id },
    data: {
      ...(cambiaEstado
        ? {
            estado: c.estado,
            // Volver a «por revisar» deshace la decisión: la próxima reunión puede volver a actualizarla.
            decididoPor: c.estado === "PEDIDO" ? null : args.actorEmail,
            decididoAt: c.estado === "PEDIDO" ? null : ahora,
          }
        : {}),
      ...(c.nota !== undefined ? { nota: c.nota || null } : {}),
      ...(c.pedido !== undefined ? { pedido: c.pedido } : {}),
      ...(c.monto !== undefined ? { monto: c.monto || null } : {}),
      ...(c.quienLoPidio !== undefined ? { quienLoPidio: c.quienLoPidio || null } : {}),
      ...(c.projectId !== undefined ? { projectId: c.projectId } : {}),
      ...(historial ? { historial: historial as unknown as Prisma.InputJsonValue } : {}),
    },
    select: SELECT,
  });
  const aviso = cambiaEstado && laConfirma(antes, c.estado) ? await avisarQueSeConfirmo(fila, args.actorEmail) : null;
  return { solicitud: enPantalla(fila), aviso };
}

/** Suma una solicitud que no salió de una reunión. La suma el CSE, así que nace confirmada y avisa. */
export async function sumarSolicitud(args: {
  clientId: string;
  pedido: string;
  quienLoPidio: string;
  monto: string;
  nota: string;
  projectId: string | null;
  actorEmail: string;
}): Promise<{ solicitud: SolicitudEnPantalla; aviso: ResultadoDelAviso }> {
  await proyectoDelCliente(args.clientId, args.projectId);
  const huella = fingerprintFromTitle(args.pedido) || `manual-${Date.now()}`;
  const ahora = new Date();
  let fila: Fila;
  try {
    fila = await prisma.pedidoFueraDeAlcance.create({
      data: {
        clientId: args.clientId,
        projectId: args.projectId,
        huella,
        pedido: args.pedido,
        quienLoPidio: args.quienLoPidio || null,
        monto: args.monto || null,
        nota: args.nota || null,
        estado: "CONFIRMADO",
        decididoPor: args.actorEmail,
        decididoAt: ahora,
        creadoPor: args.actorEmail,
        historial: [{ estado: "CONFIRMADO", por: args.actorEmail, en: ahora.toISOString() }] as unknown as Prisma.InputJsonValue,
      },
      select: SELECT,
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      throw new SolicitudRepetida("Esa solicitud ya está en la lista de este cliente.");
    }
    throw e;
  }
  return { solicitud: enPantalla(fila), aviso: await avisarQueSeConfirmo(fila, args.actorEmail) };
}
