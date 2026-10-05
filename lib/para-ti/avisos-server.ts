/**
 * lib/para-ti/avisos-server.ts — escribir, leer y marcar los AVISOS de «Para ti» (2026-10-04). SERVER-ONLY.
 *
 * `avisar()` es la ÚNICA puerta para escribir un aviso. Se llama DESPUÉS de que la acción ya quedó hecha y NUNCA lanza:
 * un aviso que no se pudo escribir se dice por consola y la acción de la persona sigue igual. Avisar es un efecto de
 * costado; perder un aviso es mucho menos grave que fallar el «Devolver» o el «Aprobar» que lo disparó.
 *
 * Destinatarios: los correos que se pasan (`para`) y/o quienes llevan un frente (`frente`), sin quien hizo la acción.
 */
import "server-only";
import { prisma } from "@/lib/db/prisma";
import { esquemaDesactualizado, modeloDisponible } from "@/lib/db/esquema";
import { frentesDelMiembro } from "./alcance-server";
import { destinatarios, esBuenaNoticia, esRutaInterna, textoDeAviso } from "./avisos";
import { esClaveDeFrente, type ClaveDeFrente } from "./frentes";
import type { AvisoVisto } from "./tipos";

export interface NuevoAviso {
  /** A quién, por correo. */
  para?: string | readonly (string | null | undefined)[] | null;
  /** O a quienes llevan este frente. */
  frente?: ClaveDeFrente;
  tipo: string;
  titulo: string;
  detalle?: string | null;
  href: string;
  /** Quien hizo la acción: nunca recibe el aviso. */
  actorEmail?: string | null;
  /** El mismo hecho avisa una vez por persona: `<tipo>:<id del dato>`. */
  dedupeKey: string;
}

/** Quiénes llevan un frente hoy (activos, con su default por rol si nunca eligieron). */
export async function quienesLlevan(frente: ClaveDeFrente): Promise<string[]> {
  const miembros = await prisma.teamMember.findMany({
    where: { deactivatedAt: null },
    select: { email: true, roleEnum: true, frentes: true, frentesEditadosAt: true, vistaFinanzas: true },
  });
  return miembros.filter((m) => frentesDelMiembro(m).includes(frente)).map((m) => m.email);
}

/** Escribe el aviso para cada destinatario. Devuelve cuántos se escribieron. NUNCA lanza. */
export async function avisar(a: NuevoAviso): Promise<number> {
  try {
    if (!modeloDisponible(prisma.aviso)) return 0;
    if (!esRutaInterna(a.href)) {
      console.error(`[para-ti] aviso ${a.tipo} descartado: el enlace no es una ruta de Nexus (${a.href})`);
      return 0;
    }
    const directos = a.para == null ? [] : typeof a.para === "string" ? [a.para] : [...a.para];
    const porFrente = a.frente ? await quienesLlevan(a.frente) : [];
    const para = destinatarios(directos, porFrente, a.actorEmail);
    if (para.length === 0) return 0;
    const titulo = textoDeAviso(a.titulo);
    const detalle = a.detalle ? textoDeAviso(a.detalle, 280) : null;
    const actor = a.actorEmail ? a.actorEmail.trim().toLowerCase() : null;
    // El frente se anota solo si la persona lo recibió POR el frente, y no porque la nombraron.
    const nombrados = new Set(directos.filter((d): d is string => !!d).map((d) => d.trim().toLowerCase()));
    const r = await prisma.aviso.createMany({
      data: para.map((email) => ({
        paraEmail: email,
        tipo: a.tipo,
        titulo,
        detalle,
        href: a.href,
        frente: a.frente && !nombrados.has(email) ? a.frente : null,
        actorEmail: actor,
        dedupeKey: a.dedupeKey,
      })),
      skipDuplicates: true,
    });
    return r.count;
  } catch (e) {
    if (esquemaDesactualizado(e)) return 0;
    console.error(`[para-ti] no se pudo escribir el aviso ${a.tipo} (${a.dedupeKey}): ${e instanceof Error ? e.message : String(e)}`);
    return 0;
  }
}

/** Los avisos de una persona, lo más nuevo primero. Si la tabla todavía no existe, ninguno. */
export async function avisosDe(email: string, cuantos = 30): Promise<AvisoVisto[]> {
  if (!modeloDisponible(prisma.aviso)) return [];
  try {
    const filas = await prisma.aviso.findMany({
      where: { paraEmail: email.toLowerCase() },
      orderBy: { creadoAt: "desc" },
      take: cuantos,
      select: { id: true, tipo: true, titulo: true, detalle: true, href: true, frente: true, creadoAt: true, leidoAt: true },
    });
    return filas.map((f) => ({
      id: f.id,
      tipo: f.tipo,
      titulo: f.titulo,
      detalle: f.detalle,
      href: f.href,
      frente: esClaveDeFrente(f.frente) ? f.frente : null,
      creadoAt: f.creadoAt.toISOString(),
      nuevo: f.leidoAt === null,
      bueno: esBuenaNoticia(f.tipo),
    }));
  } catch (e) {
    if (esquemaDesactualizado(e)) return [];
    throw e;
  }
}

/** Cuántos sin leer, y el más nuevo (para la notificación del navegador). */
export async function avisosNuevosDe(email: string): Promise<{ n: number; ultimo: { id: string; titulo: string; href: string } | null }> {
  if (!modeloDisponible(prisma.aviso)) return { n: 0, ultimo: null };
  try {
    const where = { paraEmail: email.toLowerCase(), leidoAt: null };
    const [n, ultimo] = await Promise.all([
      prisma.aviso.count({ where }),
      prisma.aviso.findFirst({ where, orderBy: { creadoAt: "desc" }, select: { id: true, titulo: true, href: true } }),
    ]);
    return { n, ultimo };
  } catch (e) {
    if (esquemaDesactualizado(e)) return { n: 0, ultimo: null };
    throw e;
  }
}

/** Marca leídos los avisos pedidos (o todos) de ESA persona: nadie marca los de otro. */
export async function marcarLeidos(email: string, ids: readonly string[] | "todos"): Promise<number> {
  const r = await prisma.aviso.updateMany({
    where: { paraEmail: email.toLowerCase(), leidoAt: null, ...(ids === "todos" ? {} : { id: { in: [...ids] } }) },
    data: { leidoAt: new Date() },
  });
  return r.count;
}

/** Lo que se borra solo: leído hace más de 90 días, o sin leer hace más de 180. Lo llama el mantenimiento diario. */
export async function borrarAvisosViejos(ahora = new Date()): Promise<number> {
  if (!modeloDisponible(prisma.aviso)) return 0;
  const dia = 86_400_000;
  const r = await prisma.aviso.deleteMany({
    where: {
      OR: [
        { leidoAt: { lt: new Date(ahora.getTime() - 90 * dia) } },
        { leidoAt: null, creadoAt: { lt: new Date(ahora.getTime() - 180 * dia) } },
      ],
    },
  });
  return r.count;
}
