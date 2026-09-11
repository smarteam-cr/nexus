/**
 * lib/documentacion/consultas.ts — las lecturas y escrituras de las páginas. SERVIDOR (Prisma).
 *
 * Acá vive TODO lo que toca la base, para que las rutas de la API queden en lo suyo: validar,
 * chequear permisos y traducir a HTTP. Las decisiones de forma (dónde va una página, qué texto
 * se indexa) viven en `arbol.ts` y `texto.ts`, que son puros y se prueban sin base.
 *
 * Tres reglas que se sostienen desde acá:
 *   · El TEXTO y la BÚSQUEDA se derivan en el servidor del contenido guardado. Nunca se confía
 *     en un texto que mande el navegador.
 *   · El CONTENIDO se escribe con `WHERE id AND version`: si otra persona guardó primero, no se
 *     pisa — se devuelve el conflicto para que el editor avise.
 *   · Mover se resuelve DENTRO de una transacción, con el árbol entero cargado ahí: es lo que
 *     hace imposible que dos movimientos cruzados creen un ciclo.
 */
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { normalizarTexto } from "@/lib/ui/text-search";
import { armarArbol, puedeMover, ramaDe, reordenar, slugDesdeTitulo, slugLibre } from "./arbol";
import { fragmentoDe, sanearBloques, textoDeBloques, textoDeBusqueda } from "./texto";
import {
  MINUTOS_ENTRE_VERSIONES,
  TOPE_DE_VERSIONES,
  type BloqueGuardado,
  type MotivoDeVersion,
  type NodoDePagina,
} from "./tipos";

/** Las columnas que necesita el árbol: sin contenido, que es lo pesado. */
const CAMPOS_DEL_ARBOL = {
  id: true,
  parentId: true,
  slug: true,
  titulo: true,
  icono: true,
  orden: true,
  bloqueada: true,
  fija: true,
} as const;

function comoJson(bloques: BloqueGuardado[]): Prisma.InputJsonValue {
  return bloques as unknown as Prisma.InputJsonValue;
}

/** Las páginas vivas (sin archivar), planas y en orden. */
export async function paginasVivas(): Promise<NodoDePagina[]> {
  return prisma.paginaDoc.findMany({
    where: { archivadaAt: null },
    select: CAMPOS_DEL_ARBOL,
    orderBy: [{ orden: "asc" }, { titulo: "asc" }],
  });
}

/** El árbol vivo, listo para pintar: padre → hijas, cada nivel en su orden. */
export async function arbolDePaginas() {
  return armarArbol(await paginasVivas());
}

export async function paginaPorSlug(slug: string) {
  return prisma.paginaDoc.findUnique({ where: { slug } });
}

export async function paginaPorId(id: string) {
  return prisma.paginaDoc.findUnique({ where: { id } });
}

/** Cuántas subpáginas vivas cuelgan de ésta (decide si alguien puede archivar su propio borrador). */
export async function contarHijas(id: string): Promise<number> {
  return prisma.paginaDoc.count({ where: { parentId: id, archivadaAt: null } });
}

/** Las últimas páginas que EDITÓ una persona (no las que se movieron). */
export async function editadasHacePoco(limite = 6) {
  return prisma.paginaDoc.findMany({
    where: { archivadaAt: null, editadaAt: { not: null } },
    select: { ...CAMPOS_DEL_ARBOL, editadaAt: true, editadaPorEmail: true },
    orderBy: { editadaAt: "desc" },
    take: limite,
  });
}

/* ── Crear ──────────────────────────────────────────────────────────────────── */

export async function crearPagina(datos: {
  titulo: string;
  parentId: string | null;
  icono: string | null;
  email: string;
}) {
  const { titulo, parentId, icono, email } = datos;
  return prisma.$transaction(async (tx) => {
    if (parentId) {
      const padre = await tx.paginaDoc.findUnique({
        where: { id: parentId },
        select: { id: true, archivadaAt: true, bloqueada: true },
      });
      if (!padre || padre.archivadaAt) return { ok: false as const, motivo: "La página madre no existe." };
      if (padre.bloqueada) {
        return { ok: false as const, motivo: "La página madre está bloqueada: primero hay que desbloquearla." };
      }
    }
    // El slug se compara contra TODAS, archivadas incluidas: una dirección no se recicla.
    const ocupados = new Set((await tx.paginaDoc.findMany({ select: { slug: true } })).map((p) => p.slug));
    const ultima = await tx.paginaDoc.findFirst({
      where: { parentId, archivadaAt: null },
      orderBy: { orden: "desc" },
      select: { orden: true },
    });
    const pagina = await tx.paginaDoc.create({
      data: {
        titulo,
        parentId,
        icono,
        slug: slugLibre(slugDesdeTitulo(titulo), ocupados),
        orden: (ultima?.orden ?? -1) + 1,
        contenido: comoJson([]),
        busqueda: textoDeBusqueda(titulo, ""),
        creadaPorEmail: email,
        editadaPorEmail: email,
        editadaAt: new Date(),
      },
    });
    return { ok: true as const, pagina };
  });
}

/* ── Historial ──────────────────────────────────────────────────────────────── */

/**
 * Guarda una foto del estado ACTUAL si hace falta: si la última tiene más de
 * `MINUTOS_ENTRE_VERSIONES` o es de otra persona. Así una sesión de escritura deja una entrada
 * en el historial y no doscientas, pero el trabajo de otra persona nunca queda sin respaldo.
 */
async function guardarFotoSiHaceFalta(
  tx: Prisma.TransactionClient,
  pagina: { id: string; version: number; titulo: string; icono: string | null; contenido: unknown },
  autorEmail: string | null,
  motivo: MotivoDeVersion,
  forzar = false,
) {
  const ultima = await tx.paginaDocVersion.findFirst({
    where: { paginaId: pagina.id },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true, autorEmail: true },
  });
  const vieja = !ultima || Date.now() - ultima.createdAt.getTime() > MINUTOS_ENTRE_VERSIONES * 60_000;
  const otraPersona = ultima ? ultima.autorEmail !== autorEmail : true;
  if (!forzar && !vieja && !otraPersona) return;

  await tx.paginaDocVersion.create({
    data: {
      paginaId: pagina.id,
      version: pagina.version,
      titulo: pagina.titulo,
      icono: pagina.icono,
      contenido: comoJson(sanearBloques(pagina.contenido)),
      motivo,
      autorEmail,
    },
  });

  // El tope evita que una página muy trabajada se lleve la tabla entera.
  const sobran = await tx.paginaDocVersion.findMany({
    where: { paginaId: pagina.id },
    orderBy: { createdAt: "desc" },
    skip: TOPE_DE_VERSIONES,
    select: { id: true },
  });
  if (sobran.length > 0) {
    await tx.paginaDocVersion.deleteMany({ where: { id: { in: sobran.map((v) => v.id) } } });
  }
}

export async function versionesDe(paginaId: string) {
  return prisma.paginaDocVersion.findMany({
    where: { paginaId },
    orderBy: { createdAt: "desc" },
    select: { id: true, version: true, titulo: true, motivo: true, autorEmail: true, createdAt: true },
  });
}

/* ── Guardar contenido ──────────────────────────────────────────────────────── */

export type ResultadoDeGuardado =
  | { ok: true; version: number }
  | { ok: false; conflicto: { version: number; editadaPorEmail: string | null; editadaAt: Date | null } };

/**
 * Escribe el contenido con control de versión. `derivado` es el texto de los bloques vivos, que
 * el servidor ya conoce: entra en la columna de búsqueda para que la página se encuentre por lo
 * que muestra, no solo por lo que alguien tecleó.
 */
export async function guardarContenido(datos: {
  id: string;
  version: number;
  contenido: unknown;
  email: string;
  derivado?: string;
}): Promise<ResultadoDeGuardado> {
  const { id, version, contenido, email, derivado = "" } = datos;
  const bloques = sanearBloques(contenido);

  return prisma.$transaction(async (tx) => {
    const pagina = await tx.paginaDoc.findUnique({ where: { id } });
    if (!pagina) throw new Error("La página no existe.");

    await guardarFotoSiHaceFalta(tx, pagina, email, "autoguardado");

    const texto = textoDeBloques(bloques);
    const escritas = await tx.paginaDoc.updateMany({
      where: { id, version },
      data: {
        contenido: comoJson(bloques),
        texto,
        busqueda: textoDeBusqueda(pagina.titulo, texto, derivado),
        version: { increment: 1 },
        editadaPorEmail: email,
        editadaAt: new Date(),
      },
    });

    if (escritas.count === 0) {
      const actual = await tx.paginaDoc.findUniqueOrThrow({
        where: { id },
        select: { version: true, editadaPorEmail: true, editadaAt: true },
      });
      return { ok: false as const, conflicto: actual };
    }
    return { ok: true as const, version: version + 1 };
  });
}

/** Título e ícono: no tocan la versión del contenido (renombrar no es editar el documento). */
export async function editarMetadatos(datos: {
  id: string;
  titulo?: string;
  icono?: string | null;
  email: string;
}) {
  const { id, titulo, icono, email } = datos;
  const pagina = await prisma.paginaDoc.findUniqueOrThrow({
    where: { id },
    select: { titulo: true, texto: true },
  });
  const tituloNuevo = titulo ?? pagina.titulo;
  return prisma.paginaDoc.update({
    where: { id },
    data: {
      ...(titulo !== undefined ? { titulo } : {}),
      ...(icono !== undefined ? { icono } : {}),
      busqueda: textoDeBusqueda(tituloNuevo, pagina.texto),
      editadaPorEmail: email,
      editadaAt: new Date(),
    },
  });
}

/* ── Mover ──────────────────────────────────────────────────────────────────── */

export async function moverPagina(datos: { id: string; parentId: string | null; indice?: number }) {
  const { id, parentId, indice } = datos;
  return prisma.$transaction(async (tx) => {
    const vivas = await tx.paginaDoc.findMany({
      where: { archivadaAt: null },
      select: { id: true, parentId: true, orden: true },
    });

    const veredicto = puedeMover(id, parentId, vivas);
    if (!veredicto.ok) return { ok: false as const, motivo: veredicto.motivo };

    if (parentId) {
      const padre = await tx.paginaDoc.findUnique({ where: { id: parentId }, select: { bloqueada: true } });
      if (padre?.bloqueada) {
        return { ok: false as const, motivo: "La página de destino está bloqueada." };
      }
    }

    const hermanas = vivas.filter((p) => p.parentId === parentId).map((p) => ({ id: p.id, orden: p.orden }));
    const destino = indice ?? hermanas.length;
    const nuevoOrden = reordenar(hermanas, id, destino);

    await tx.paginaDoc.update({ where: { id }, data: { parentId } });
    for (const fila of nuevoOrden) {
      await tx.paginaDoc.update({ where: { id: fila.id }, data: { orden: fila.orden } });
    }
    return { ok: true as const };
  });
}

/* ── Papelera ───────────────────────────────────────────────────────────────── */

/** Archiva la página y TODO lo que cuelga de ella, con un mismo lote para poder devolverlo igual. */
export async function archivarRama(id: string, email: string) {
  return prisma.$transaction(async (tx) => {
    const pagina = await tx.paginaDoc.findUnique({ where: { id }, select: { fija: true, archivadaAt: true } });
    if (!pagina || pagina.archivadaAt) return { ok: false as const, motivo: "La página no existe." };
    if (pagina.fija) {
      return { ok: false as const, motivo: "Es una página del sistema: no se archiva." };
    }
    const vivas = await tx.paginaDoc.findMany({
      where: { archivadaAt: null },
      select: { id: true, parentId: true },
    });
    const lote = crypto.randomUUID();
    const ids = ramaDe(id, vivas);
    await tx.paginaDoc.updateMany({
      where: { id: { in: ids } },
      data: { archivadaAt: new Date(), archivadaLote: lote, editadaPorEmail: email },
    });
    return { ok: true as const, lote, cuantas: ids.length };
  });
}

export async function papelera() {
  return prisma.paginaDoc.findMany({
    where: { archivadaAt: { not: null } },
    select: { ...CAMPOS_DEL_ARBOL, archivadaAt: true, archivadaLote: true, editadaPorEmail: true },
    orderBy: { archivadaAt: "desc" },
  });
}

/**
 * Devuelve el lote entero al árbol. Si la madre de alguna sigue archivada, esa página vuelve a
 * la raíz: es preferible verla en el lugar equivocado a que vuelva a un lugar que no existe.
 */
export async function restaurarLote(lote: string) {
  return prisma.$transaction(async (tx) => {
    const delLote = await tx.paginaDoc.findMany({
      where: { archivadaLote: lote },
      select: { id: true, parentId: true },
    });
    if (delLote.length === 0) return { ok: false as const, motivo: "Ese grupo ya no está en la papelera." };

    const idsDelLote = new Set(delLote.map((p) => p.id));
    const vivas = await tx.paginaDoc.findMany({
      where: { archivadaAt: null },
      select: { id: true, parentId: true, orden: true },
    });
    const vivasIds = new Set(vivas.map((p) => p.id));

    for (const p of delLote) {
      const padreValido = p.parentId && (vivasIds.has(p.parentId) || idsDelLote.has(p.parentId));
      const parentId = padreValido ? p.parentId : null;
      const hermanas = vivas.filter((h) => h.parentId === parentId);
      await tx.paginaDoc.update({
        where: { id: p.id },
        data: {
          archivadaAt: null,
          archivadaLote: null,
          parentId,
          orden: hermanas.length + idsDelLote.size,
        },
      });
    }
    return { ok: true as const, cuantas: delLote.length };
  });
}

export async function cambiarBloqueo(id: string, bloqueada: boolean, email: string) {
  return prisma.paginaDoc.update({
    where: { id },
    data: { bloqueada, editadaPorEmail: email },
  });
}

/* ── Buscar ─────────────────────────────────────────────────────────────────── */

export interface ResultadoDeBusqueda {
  id: string;
  slug: string;
  titulo: string;
  icono: string | null;
  fragmento: string | null;
}

/** Busca en título y texto (sin tildes ni mayúsculas: la columna `busqueda` ya está normalizada). */
export async function buscarPaginas(consulta: string, limite = 20): Promise<ResultadoDeBusqueda[]> {
  const q = normalizarTexto(consulta);
  if (!q) return [];
  const filas = await prisma.paginaDoc.findMany({
    where: { archivadaAt: null, busqueda: { contains: q } },
    select: { id: true, slug: true, titulo: true, icono: true, texto: true },
    orderBy: { editadaAt: "desc" },
    take: limite,
  });
  return filas.map((f) => ({
    id: f.id,
    slug: f.slug,
    titulo: f.titulo,
    icono: f.icono,
    fragmento: fragmentoDe(f.texto, consulta),
  }));
}

/* ── Restaurar una versión ──────────────────────────────────────────────────── */

export async function restaurarVersion(datos: { paginaId: string; versionId: string; email: string }) {
  const { paginaId, versionId, email } = datos;
  return prisma.$transaction(async (tx) => {
    const foto = await tx.paginaDocVersion.findUnique({ where: { id: versionId } });
    if (!foto || foto.paginaId !== paginaId) {
      return { ok: false as const, motivo: "Esa versión no es de esta página." };
    }
    const pagina = await tx.paginaDoc.findUniqueOrThrow({ where: { id: paginaId } });
    // Antes de pisar lo actual, se guarda: restaurar tiene que poder deshacerse.
    await guardarFotoSiHaceFalta(tx, pagina, email, "antes-de-restaurar", true);

    const bloques = sanearBloques(foto.contenido);
    const texto = textoDeBloques(bloques);
    await tx.paginaDoc.update({
      where: { id: paginaId },
      data: {
        titulo: foto.titulo,
        icono: foto.icono,
        contenido: comoJson(bloques),
        texto,
        busqueda: textoDeBusqueda(foto.titulo, texto),
        version: { increment: 1 },
        editadaPorEmail: email,
        editadaAt: new Date(),
      },
    });
    return { ok: true as const };
  });
}
