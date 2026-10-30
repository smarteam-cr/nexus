/**
 * lib/exploraciones/acceso-a-la-escala.ts — el «Acceso» de La escala: el enlace con que la empresa ve su escala
 * (Elías, 30 oct). SERVIDOR.
 *
 * Mismo modelo que un documento de la empresa (lib/clients/documentos-de-la-empresa-compartir.ts): la URL es el secreto
 * (256 bits), sin contraseña; revocar deja de abrirla y crear otro da un enlace NUEVO (el viejo pudo circular a quien ya
 * no debía verlo). No hay foto: la página lee lo medido hoy (lib/external/escala-view.ts). Pide el permiso quien llama.
 */
import "server-only";
import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/db/prisma";
import { escalaParaElCliente } from "./escala-para-el-cliente-server";

export interface EstadoDelAcceso {
  estado: "sin-generar" | "activo" | "revocado";
  enlace: string | null;
  creadoEn: string | null;
  ultimaVista: string | null;
  /** Lo que vería el cliente hoy: cuántas partes tienen evidencia, de cuántas hay en las áreas en juego. */
  medidas: number;
  total: number;
  /** False: la exploración ya no se puede mostrar (se archivó, por ejemplo), y un enlace activo da 404. */
  abre: boolean;
}

export class ErrorDelAcceso extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

/** El enlace público de un token (la página la sirve app/external/escala/[token]). */
export function enlaceDeLaEscala(token: string): string {
  const base = (process.env.APP_URL ?? "").replace(/\/+$/, "");
  return `${base}/external/escala/${token}`;
}

async function loQueVeElCliente(exploracionId: string): Promise<{ medidas: number; total: number; abre: boolean }> {
  const e = await escalaParaElCliente(exploracionId);
  return { medidas: (e?.resultados ?? []).reduce((n, r) => n + r.preguntadas, 0), total: e?.partesEnJuego ?? 0, abre: !!e };
}

export async function estadoDelAcceso(exploracionId: string): Promise<EstadoDelAcceso> {
  const [a, cuanto] = await Promise.all([
    prisma.accesoALaEscala.findUnique({ where: { exploracionId }, select: { accessToken: true, enabledAt: true, revokedAt: true, lastUsedAt: true } }),
    loQueVeElCliente(exploracionId),
  ]);
  const vivo = !!a && !a.revokedAt;
  return {
    estado: !a ? "sin-generar" : vivo ? "activo" : "revocado",
    enlace: vivo ? enlaceDeLaEscala(a.accessToken) : null,
    creadoEn: vivo ? a.enabledAt.toISOString() : null,
    ultimaVista: vivo ? (a.lastUsedAt?.toISOString() ?? null) : null,
    ...cuanto,
  };
}

/** Crea el enlace (o devuelve el vivo). Sin nada con evidencia no se crea: la página saldría vacía. */
export async function crearAcceso(exploracionId: string, porEmail: string | null): Promise<EstadoDelAcceso> {
  if (!(await loQueVeElCliente(exploracionId)).medidas) {
    throw new ErrorDelAcceso(409, "Todavía no hay niveles con evidencia: confirma al menos uno con lo que dijo el cliente para poder compartir la escala.");
  }
  // Con dos personas a la vez, una sola crea o renueva: la otra se queda con el mismo enlace.
  const token = randomBytes(32).toString("hex");
  await prisma.accesoALaEscala.createMany({ data: [{ exploracionId, accessToken: token, creadoPor: porEmail }], skipDuplicates: true });
  await prisma.accesoALaEscala.updateMany({
    where: { exploracionId, revokedAt: { not: null } },
    data: { accessToken: token, revokedAt: null, enabledAt: new Date(), lastUsedAt: null, creadoPor: porEmail },
  });
  return estadoDelAcceso(exploracionId);
}

/** Revoca: el enlace deja de abrir. */
export async function revocarAcceso(exploracionId: string): Promise<EstadoDelAcceso> {
  await prisma.accesoALaEscala.updateMany({ where: { exploracionId, revokedAt: null }, data: { revokedAt: new Date() } });
  return estadoDelAcceso(exploracionId);
}
