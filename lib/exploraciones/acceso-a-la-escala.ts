/**
 * lib/exploraciones/acceso-a-la-escala.ts — el «Acceso» de La escala: el enlace con que la empresa ve su escala
 * (Elías, 30 oct). SERVIDOR.
 *
 * Mismo modelo que un documento de la empresa (lib/clients/documentos-de-la-empresa-compartir.ts): la URL es el secreto
 * (256 bits), sin contraseña; revocar deja de abrirla y crear otro da un enlace NUEVO (el viejo pudo circular a quien ya
 * no debía verlo). Pide el permiso quien llama.
 *
 * PUBLICAR (16 nov, ./escala-publicada.ts): el cliente ve la foto que se publicó, no lo medido hoy. Crear el primer
 * acceso la publica (crearlo es querer compartirlo); después solo «Publicar» la pone al día, nunca un proceso en segundo
 * plano. Revocar no la borra: un enlace nuevo arranca con la misma foto hasta que alguien publique.
 */
import "server-only";
import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@prisma/client";
import { escalaParaElCliente, type EscalaParaElCliente } from "./escala-para-el-cliente-server";
import { faltaParaPublicar } from "@/lib/external/pagina-del-resumen";
import { fotoDe, mismaPagina, paginaDeLaFoto } from "./escala-publicada";

export interface EstadoDelAcceso {
  estado: "sin-generar" | "activo" | "revocado";
  enlace: string | null;
  creadoEn: string | null;
  ultimaVista: string | null;
  /** Lo que vería el cliente hoy: cuántas partes tienen nivel (de esas, cuántas por explorar), de cuántas hay en sus áreas. */
  medidas: number;
  porExplorar: number;
  total: number;
  /** Cuántos equipos vería hoy (0: ninguno elegido). */
  areas: number;
  /** False: la exploración ya no se puede mostrar (se archivó, por ejemplo), y un enlace activo da 404. */
  abre: boolean;
  /** Cuándo y quién publicó lo que ve el cliente. null: nunca se publicó (la página dice que no está lista). */
  publicadaEn: string | null;
  publicadaPor: string | null;
  /** Si lo de hoy es distinto de lo publicado: hay cambios que el cliente todavía no ve. */
  sinPublicar: boolean;
  /** Por qué no se puede publicar lo de hoy (21 nov: una página sin titular), o null. «Publicar» se bloquea con el motivo. */
  noSePublica: string | null;
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

async function loQueVeElCliente(exploracionId: string): Promise<{ medidas: number; porExplorar: number; total: number; abre: boolean; areas: number; pagina: EscalaParaElCliente | null }> {
  const e = await escalaParaElCliente(exploracionId);
  return {
    pagina: e,
    areas: e?.resultados.length ?? 0,
    medidas: (e?.resultados ?? []).reduce((n, r) => n + r.preguntadas, 0),
    porExplorar: Object.values(e?.porExplorar ?? {}).reduce((n, xs) => n + xs.length, 0),
    total: e?.partesEnJuego ?? 0,
    abre: !!e,
  };
}

export async function estadoDelAcceso(exploracionId: string): Promise<EstadoDelAcceso> {
  const [a, { pagina, ...cuanto }] = await Promise.all([
    prisma.accesoALaEscala.findUnique({
      where: { exploracionId },
      select: { accessToken: true, enabledAt: true, revokedAt: true, lastUsedAt: true, publicada: true, publicadaEn: true, publicadaPor: true },
    }),
    loQueVeElCliente(exploracionId),
  ]);
  const vivo = !!a && !a.revokedAt;
  const foto = a ? paginaDeLaFoto(a.publicada) : null;
  return {
    estado: !a ? "sin-generar" : vivo ? "activo" : "revocado",
    enlace: vivo ? enlaceDeLaEscala(a.accessToken) : null,
    creadoEn: vivo ? a.enabledAt.toISOString() : null,
    ultimaVista: vivo ? (a.lastUsedAt?.toISOString() ?? null) : null,
    ...cuanto,
    // Una foto de otro formato no se sirve: cuenta como no publicada.
    publicadaEn: foto ? (a?.publicadaEn?.toISOString() ?? null) : null,
    publicadaPor: foto ? (a?.publicadaPor ?? null) : null,
    // Sin foto, hay algo que publicar solo si hay equipos; con foto, cualquier diferencia (también quitar todos los
    // equipos: publicarlo deja la página en «todavía no está lista»).
    sinPublicar: !!pagina && (foto ? !mismaPagina(pagina, foto) : pagina.resultados.length > 0),
    noSePublica: pagina?.resultados.length ? faltaParaPublicar(pagina.resumen) : null,
  };
}

/**
 * Publica lo de hoy: desde ahora el cliente ve esto. Sin acceso creado no hay dónde (409); sin nada que mostrar, tampoco.
 * `siSigue`: solo si la foto guardada sigue siendo la de esa fecha (`null`: solo si nunca se publicó; así publica el primer
 * acceso, y dos personas que lo crean a la vez no publican dos veces). Devuelve si publicó.
 */
export async function publicarLaEscala(exploracionId: string, porEmail: string | null, o: { siSigue?: Date | null } = {}): Promise<boolean> {
  const pagina = await escalaParaElCliente(exploracionId);
  if (!pagina) throw new ErrorDelAcceso(409, "Esta escala ya no se puede mostrar (se archivó o cambió de empresa).");
  // Sin equipos se publica solo para retirar lo que el cliente ya veía (queda «Tu escala todavía no está lista»).
  if (!pagina.resultados.length) {
    const antes = await prisma.accesoALaEscala.findUnique({ where: { exploracionId }, select: { publicadaEn: true } });
    if (!antes?.publicadaEn) throw new ErrorDelAcceso(409, "Todavía no hay nada que mostrarle al cliente: elige al menos un equipo en «Acceso».");
  }
  /* Una página sin titular no se publica (21 nov): el cliente vería el Resumen roto. Al crear el primer acceso (`siSigue`
     null) no se publica y listo: el enlace abre en «Tu escala todavía no está lista» hasta que alguien publique. */
  const falta = pagina.resultados.length ? faltaParaPublicar(pagina.resumen) : null;
  if (falta) {
    if (o.siSigue === null) return false;
    throw new ErrorDelAcceso(409, falta);
  }
  const { count } = await prisma.accesoALaEscala.updateMany({
    where: { exploracionId, ...(o.siSigue !== undefined ? { publicadaEn: o.siSigue } : {}) },
    data: { publicada: fotoDe(pagina) as unknown as Prisma.InputJsonValue, publicadaEn: new Date(), publicadaPor: porEmail },
  });
  if (!count && o.siSigue === undefined) throw new ErrorDelAcceso(409, "Primero crea el acceso del cliente: la página se publica en su enlace.");
  return count > 0;
}

/**
 * Crea el enlace (o devuelve el vivo). Sin ningún equipo en la página no se crea: saldría vacía. Un equipo elegido sin
 * nada ubicado sí cuenta: sale «En medición» (8 nov), la misma regla que la página.
 */
export async function crearAcceso(exploracionId: string, porEmail: string | null): Promise<EstadoDelAcceso> {
  if (!(await loQueVeElCliente(exploracionId)).areas) {
    throw new ErrorDelAcceso(409, "Todavía no hay equipos para mostrar: elige al menos uno en «Qué equipos ve», o usa algo de lo que sugiere Nexus.");
  }
  // Con dos personas a la vez, una sola crea o renueva: la otra se queda con el mismo enlace.
  const token = randomBytes(32).toString("hex");
  await prisma.accesoALaEscala.createMany({ data: [{ exploracionId, accessToken: token, creadoPor: porEmail }], skipDuplicates: true });
  await prisma.accesoALaEscala.updateMany({
    where: { exploracionId, revokedAt: { not: null } },
    data: { accessToken: token, revokedAt: null, enabledAt: new Date(), lastUsedAt: null, creadoPor: porEmail },
  });
  // El primer acceso publica lo de hoy: crearlo es querer compartirlo. Uno que ya tenía foto la conserva.
  await publicarLaEscala(exploracionId, porEmail, { siSigue: null });
  return estadoDelAcceso(exploracionId);
}

/** Revoca: el enlace deja de abrir. */
export async function revocarAcceso(exploracionId: string): Promise<EstadoDelAcceso> {
  await prisma.accesoALaEscala.updateMany({ where: { exploracionId, revokedAt: null }, data: { revokedAt: new Date() } });
  return estadoDelAcceso(exploracionId);
}
