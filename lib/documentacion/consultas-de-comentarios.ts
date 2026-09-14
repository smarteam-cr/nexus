/**
 * lib/documentacion/consultas-de-comentarios.ts — lecturas y escrituras de los comentarios. SERVIDOR.
 *
 * Aparte de `consultas.ts` (las páginas) porque no se tocan: comentar no escribe la página, no
 * sube su versión y no deja foto en el historial. Las REGLAS (quién resuelve, edita o borra) viven
 * en `comentarios.ts`, que es puro; acá solo se lee y se escribe.
 *
 * Los autores se guardan por email, como el resto del módulo. El nombre y la foto se leen de
 * TeamMember al devolver, con un select propio (⛔ no ampliar `TEAM_MEMBER_SAFE_SELECT`).
 */
import { prisma } from "@/lib/db/prisma";
import type { Autor, HiloAbiertoDeLaBase, HiloVisto } from "./comentarios";

const CAMPOS_DEL_HILO = {
  id: true,
  paginaId: true,
  bloqueId: true,
  cita: true,
  antes: true,
  despues: true,
  autorEmail: true,
  resueltoAt: true,
  resueltoPorEmail: true,
  createdAt: true,
  comentarios: {
    orderBy: { createdAt: "asc" },
    select: { id: true, autorEmail: true, cuerpo: true, editadoAt: true, createdAt: true },
  },
} as const;

interface FilaDeHilo {
  id: string;
  paginaId: string;
  bloqueId: string;
  cita: string;
  antes: string;
  despues: string;
  autorEmail: string;
  resueltoAt: Date | null;
  resueltoPorEmail: string | null;
  createdAt: Date;
  comentarios: { id: string; autorEmail: string; cuerpo: string; editadoAt: Date | null; createdAt: Date }[];
}

/** Nombre y foto de cada email. Quien ya no está en el equipo se muestra con su email. */
async function autoresDe(emails: Iterable<string>): Promise<(email: string) => Autor> {
  const unicos = [...new Set([...emails].map((e) => e.toLowerCase()))];
  const filas =
    unicos.length === 0
      ? []
      : await prisma.teamMember.findMany({
          where: { email: { in: unicos, mode: "insensitive" } },
          select: { email: true, name: true, photoUrl: true },
        });
  const porEmail = new Map(filas.map((f) => [f.email.toLowerCase(), f]));
  return (email) => {
    const f = porEmail.get(email.toLowerCase());
    return { email, nombre: f?.name ?? email.split("@")[0], foto: f?.photoUrl ?? null };
  };
}

function emailsDe(filas: FilaDeHilo[]): string[] {
  return filas.flatMap((h) => [
    h.autorEmail,
    ...(h.resueltoPorEmail ? [h.resueltoPorEmail] : []),
    ...h.comentarios.map((c) => c.autorEmail),
  ]);
}

function verHilo(h: FilaDeHilo, autor: (email: string) => Autor): HiloVisto {
  return {
    id: h.id,
    paginaId: h.paginaId,
    bloqueId: h.bloqueId,
    cita: h.cita,
    antes: h.antes,
    despues: h.despues,
    autor: autor(h.autorEmail),
    resueltoAt: h.resueltoAt?.toISOString() ?? null,
    resueltoPor: h.resueltoPorEmail ? autor(h.resueltoPorEmail) : null,
    createdAt: h.createdAt.toISOString(),
    comentarios: h.comentarios.map((c) => ({
      id: c.id,
      autor: autor(c.autorEmail),
      cuerpo: c.cuerpo,
      createdAt: c.createdAt.toISOString(),
      editadoAt: c.editadoAt?.toISOString() ?? null,
    })),
  };
}

/* ── Leer ───────────────────────────────────────────────────────────────────── */

/** Todos los hilos de una página, abiertos y resueltos, del más viejo al más nuevo. */
export async function hilosDePagina(paginaId: string): Promise<HiloVisto[]> {
  const filas = await prisma.hiloDeComentariosDoc.findMany({
    where: { paginaId },
    select: CAMPOS_DEL_HILO,
    orderBy: { createdAt: "asc" },
  });
  const autor = await autoresDe(emailsDe(filas));
  return filas.map((h) => verHilo(h, autor));
}

/** Cuántos hilos abiertos tiene cada página viva: el contador del árbol. */
export async function abiertosPorPagina(): Promise<Record<string, number>> {
  const grupos = await prisma.hiloDeComentariosDoc.groupBy({
    by: ["paginaId"],
    where: { resueltoAt: null, pagina: { archivadaAt: null } },
    _count: { _all: true },
  });
  return Object.fromEntries(grupos.map((g) => [g.paginaId, g._count._all]));
}

/** Los hilos abiertos de TODA la base, con su página: lo que tiene pendiente quien resuelve. */
export async function hilosAbiertos(): Promise<HiloAbiertoDeLaBase[]> {
  const filas = await prisma.hiloDeComentariosDoc.findMany({
    where: { resueltoAt: null, pagina: { archivadaAt: null } },
    select: { ...CAMPOS_DEL_HILO, pagina: { select: { slug: true, titulo: true, icono: true } } },
    orderBy: { createdAt: "desc" },
  });
  const autor = await autoresDe(emailsDe(filas));
  return filas.map(({ pagina, ...h }) => ({ hilo: verHilo(h, autor), pagina }));
}

export async function hiloPorId(id: string) {
  return prisma.hiloDeComentariosDoc.findUnique({
    where: { id },
    select: { id: true, paginaId: true, resueltoAt: true },
  });
}

export async function comentarioPorId(id: string) {
  return prisma.comentarioDoc.findUnique({
    where: { id },
    select: { id: true, hiloId: true, autorEmail: true },
  });
}

/* ── Escribir ───────────────────────────────────────────────────────────────── */

export async function crearHilo(datos: {
  paginaId: string;
  bloqueId: string;
  cita: string;
  antes: string;
  despues: string;
  cuerpo: string;
  email: string;
}) {
  const { paginaId, bloqueId, cita, antes, despues, cuerpo, email } = datos;
  const pagina = await prisma.paginaDoc.findUnique({ where: { id: paginaId }, select: { archivadaAt: true } });
  if (!pagina) return { ok: false as const, motivo: "La página no existe." };
  if (pagina.archivadaAt) return { ok: false as const, motivo: "La página está en la papelera." };

  const creado = await prisma.hiloDeComentariosDoc.create({
    data: {
      paginaId,
      bloqueId,
      cita,
      antes,
      despues,
      autorEmail: email,
      comentarios: { create: { autorEmail: email, cuerpo } },
    },
    select: CAMPOS_DEL_HILO,
  });
  const autor = await autoresDe(emailsDe([creado]));
  return { ok: true as const, hilo: verHilo(creado, autor) };
}

export async function responder(datos: { hiloId: string; cuerpo: string; email: string }) {
  const { hiloId, cuerpo, email } = datos;
  await prisma.comentarioDoc.create({ data: { hiloId, autorEmail: email, cuerpo } });
  // Tocar el hilo mueve su `updatedAt`: una respuesta es actividad del hilo.
  await prisma.hiloDeComentariosDoc.update({ where: { id: hiloId }, data: { updatedAt: new Date() } });
}

export async function cambiarResuelto(datos: { hiloId: string; resuelto: boolean; email: string }) {
  const { hiloId, resuelto, email } = datos;
  await prisma.hiloDeComentariosDoc.update({
    where: { id: hiloId },
    data: resuelto
      ? { resueltoAt: new Date(), resueltoPorEmail: email }
      : { resueltoAt: null, resueltoPorEmail: null },
  });
}

export async function editarComentario(datos: { comentarioId: string; cuerpo: string }) {
  await prisma.comentarioDoc.update({
    where: { id: datos.comentarioId },
    data: { cuerpo: datos.cuerpo, editadoAt: new Date() },
  });
}

/** Borra el comentario; si era el último del hilo, se va el hilo (un hilo vacío no dice nada). */
export async function borrarComentario(comentarioId: string) {
  return prisma.$transaction(async (tx) => {
    const comentario = await tx.comentarioDoc.delete({ where: { id: comentarioId }, select: { hiloId: true } });
    const quedan = await tx.comentarioDoc.count({ where: { hiloId: comentario.hiloId } });
    if (quedan === 0) await tx.hiloDeComentariosDoc.delete({ where: { id: comentario.hiloId } });
    return { hiloBorrado: quedan === 0 };
  });
}
