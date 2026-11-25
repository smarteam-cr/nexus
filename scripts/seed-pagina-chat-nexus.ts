/**
 * scripts/seed-pagina-chat-nexus.ts — publica en Documentación «El chat Nexus: qué le puedes pedir» (2026-11-24), adentro
 * de «¿Cómo funciona Nexus?», y el enlace que la madre le suma. La abre el enlace «¿Qué puedo pedirte?» del chat vacío.
 *
 * Es la siembra de siempre (`scripts/seed-documentacion.ts`) recortada a DOS páginas, para no tocar las otras ~60 de la
 * base al publicarla:
 *   · la página nueva, en su lugar adentro de la madre;
 *   · la madre, «¿Cómo funciona Nexus?», que cambia su sección del chat y enlaza la nueva. Se queda donde está en el árbol:
 *     ese lugar lo manda la siembra entera.
 * Las mismas reglas, con la misma función que decide (`lib/documentacion/semillas/accion.ts`):
 *   1. idempotente por `slug`: correrlo dos veces no duplica nada, y si el contenido ya es ese no escribe ni sube la versión;
 *   2. NO pisa lo que editó una persona después de la última siembra: se salta y lo dice. Para pisar la página nueva igual,
 *      `--forzar` (antes guarda la versión de hoy en el historial). La madre NUNCA se fuerza desde acá: si una persona la
 *      editó, el enlace se agrega a mano desde la app (forzarla con la siembra entera tocaría todas las páginas). Cada
 *      escritura lleva la versión que se leyó, como el editor: lo que una persona guarde mientras corre no se pisa;
 *   3. la página nueva vive donde la ubica la semilla: si una persona la movió y la editó, se lleva a su lugar sin tocar su
 *      contenido;
 *   4. como la siembra entera, no saca nada de la papelera (solo lo avisa).
 * Los enlaces salen con el id de la página que nombran, así la página destino sabe quién la nombra.
 *
 * ⛔ AL CAMBIAR LO QUE EL CHAT SABE HACER se actualiza `lib/documentacion/semillas/chat-nexus.ts` y se vuelve a correr esto.
 *
 * Uso:
 *   npx tsx scripts/seed-pagina-chat-nexus.ts                               (simulacro: dice qué haría)
 *   $env:ALLOW_PROD_WRITE="1"; npx tsx scripts/seed-pagina-chat-nexus.ts --apply
 *   $env:ALLOW_PROD_WRITE="1"; npx tsx scripts/seed-pagina-chat-nexus.ts --apply --forzar
 *
 * En la base local no hace falta la variable: el guard mira el destino. Con `--apply` respalda las dos tablas antes de
 * escribir (necesita pg_dump; en la base local, `SIN_RESPALDO=1`). Necesita que «¿Cómo funciona Nexus?» exista (la crea
 * `scripts/seed-documentacion.ts`).
 */
import "dotenv/config";
import type { Prisma, PrismaClient } from "@prisma/client";
import { resolverApply } from "./lib/guard";
import { createScriptDb } from "./lib/db";
import { construirComoFunciona } from "@/lib/documentacion/semillas/como-funciona";
import { construirChatNexus } from "@/lib/documentacion/semillas/chat-nexus";
import { resolverMenciones, type PaginaSembrada } from "@/lib/documentacion/semillas/bloques";
import { decidirAccion } from "@/lib/documentacion/semillas/accion";
import { textoDeBloques, textoDeBusqueda } from "@/lib/documentacion/texto";
import type { BloqueGuardado } from "@/lib/documentacion/tipos";

const APPLY = resolverApply({ tablas: ["PaginaDoc", "PaginaDocVersion"] });
const FORZAR = process.argv.includes("--forzar");

/** El mismo JSON sin importar el orden de las claves: la base (jsonb) las devuelve reordenadas. */
function mismoJson(a: unknown, b: unknown): boolean {
  const ordenar = (v: unknown): unknown =>
    Array.isArray(v)
      ? v.map(ordenar)
      : v && typeof v === "object"
        ? Object.fromEntries(Object.keys(v as object).sort().map((k) => [k, ordenar((v as Record<string, unknown>)[k])]))
        : v;
  return JSON.stringify(ordenar(a)) === JSON.stringify(ordenar(b));
}

/**
 * Escribe UNA página sembrada con las reglas de la siembra. `destino` es dónde la quiere la semilla; `forzar`, si se pisa
 * lo que editó una persona. Devuelve el id (null en el simulacro de una página que todavía no existe).
 */
async function escribir(
  prisma: PrismaClient,
  pagina: PaginaSembrada,
  destino: { parentId: string | null; orden: number },
  forzar: boolean,
  idPorSlug: Map<string, string>,
  siSeSalta = "",
): Promise<string | null> {
  const bloques = resolverMenciones(pagina.bloques, idPorSlug) as BloqueGuardado[];
  const texto = textoDeBloques(bloques);
  const datos = {
    titulo: pagina.titulo,
    icono: pagina.icono,
    contenido: bloques as unknown as Prisma.InputJsonValue,
    texto,
    busqueda: textoDeBusqueda(pagina.titulo, texto),
    // Como las demás sembradas: la edita el liderazgo y no se archiva.
    bloqueada: true,
    fija: true,
  };

  const existente = await prisma.paginaDoc.findUnique({ where: { slug: pagina.slug } });
  const { accion, editada } = decidirAccion(existente, destino, forzar);
  if (existente?.archivadaAt) console.log(`  ⚠ ${pagina.slug} está en la papelera: este script no la saca (restáurala desde la app)`);

  if (!existente || accion === "crear") {
    console.log(`  + crear       ${pagina.slug}`);
    if (!APPLY) return null;
    const creada = await prisma.paginaDoc.create({
      data: { ...datos, slug: pagina.slug, parentId: destino.parentId, orden: destino.orden, version: 1, semillaVersion: 1 },
      select: { id: true },
    });
    return creada.id;
  }

  if (accion === "saltar") {
    console.log(
      `  = saltar      ${pagina.slug}\n      la editó una persona (versión ${existente.version}, sembrada ${existente.semillaVersion ?? "—"}): no se pisa${siSeSalta ? `\n      ${siSeSalta}` : ""}`,
    );
    return existente.id;
  }

  if (accion === "mover") {
    console.log(`  ↳ mover       ${pagina.slug}\n      la editó una persona: se lleva a su lugar sin tocar su contenido`);
    if (APPLY) await prisma.paginaDoc.update({ where: { id: existente.id }, data: destino });
    return existente.id;
  }

  const enSuLugar = existente.parentId === destino.parentId && existente.orden === destino.orden;
  if (enSuLugar && mismoJson(existente.contenido, bloques) && existente.titulo === datos.titulo && existente.icono === datos.icono) {
    if (editada && forzar) {
      /* Editada con el mismo contenido que la semilla (alguien restauró la versión sembrada): forzar solo la vuelve a marcar
         como sembrada, así el próximo cambio de la semilla no pide --forzar otra vez. */
      console.log(`  = igual       ${pagina.slug}: ya tiene este contenido; vuelve a quedar como sembrada`);
      if (APPLY) await prisma.paginaDoc.updateMany({ where: { id: existente.id, version: existente.version }, data: { semillaVersion: existente.version } });
      return existente.id;
    }
    console.log(`  = igual       ${pagina.slug}: ya tiene este contenido, no se escribe nada`);
    return existente.id;
  }

  console.log(`  ~ actualizar  ${pagina.slug}${editada ? "\n      forzada: se guarda la versión de hoy en el historial antes de pisarla" : ""}`);
  if (APPLY) {
    await prisma.$transaction(async (tx) => {
      await tx.paginaDocVersion.create({
        data: {
          paginaId: existente.id,
          version: existente.version,
          titulo: existente.titulo,
          icono: existente.icono,
          contenido: existente.contenido as Prisma.InputJsonValue,
          motivo: editada ? "antes-de-forzar" : "semilla",
        },
      });
      const version = existente.version + 1;
      /* Con la versión que se leyó, como guarda el editor: si una persona guardó entre la lectura y esta escritura, no se
         pisa su cambio (la transacción se deshace, y el historial con ella). */
      const r = await tx.paginaDoc.updateMany({
        where: { id: existente.id, version: existente.version },
        data: { ...datos, parentId: destino.parentId, orden: destino.orden, version, semillaVersion: version },
      });
      if (r.count !== 1) throw new Error(`${pagina.slug}: alguien la guardó mientras corría el script. No se pisó nada: vuelve a correrlo.`);
    });
  }
  return existente.id;
}

async function main() {
  console.log(APPLY ? "\n✍  Escribiendo" : "\n👀 Simulacro (agrega --apply para escribir)");

  const madre = construirComoFunciona();
  const pagina = construirChatNexus();
  const orden = (madre.hijas ?? []).findIndex((h) => h.slug === pagina.slug);
  if (orden < 0) throw new Error(`«${pagina.titulo}» no está entre las hijas de «${madre.titulo}» en la semilla.`);

  const { prisma, close } = createScriptDb();
  try {
    const madreEnLaBase = await prisma.paginaDoc.findUnique({ where: { slug: madre.slug }, select: { id: true, parentId: true, orden: true, archivadaAt: true } });
    if (!madreEnLaBase) {
      console.error(`\n⛔ No existe «${madre.titulo}» (${madre.slug}). Corre antes scripts/seed-documentacion.ts.`);
      process.exitCode = 1;
      return;
    }
    if (madreEnLaBase.archivadaAt) {
      console.error(`\n⛔ «${madre.titulo}» está en la papelera: restáurala desde la app antes de sumarle la página nueva.`);
      process.exitCode = 1;
      return;
    }

    /* Los enlaces, con el id de cada página nombrada. La nueva todavía puede no tenerlo: se suma apenas se crea, para que
       el enlace de la madre ya salga con él. */
    const todas = await prisma.paginaDoc.findMany({ select: { id: true, slug: true } });
    const idPorSlug = new Map(todas.map((p) => [p.slug, p.id]));

    const id = await escribir(prisma, pagina, { parentId: madreEnLaBase.id, orden }, FORZAR, idPorSlug);
    if (id) idPorSlug.set(pagina.slug, id);
    // La madre se queda en su lugar del árbol (lo manda la siembra entera) y nunca se fuerza desde acá.
    await escribir(
      prisma,
      madre,
      { parentId: madreEnLaBase.parentId, orden: madreEnLaBase.orden },
      false,
      idPorSlug,
      "Para que enlace la página nueva, agrega el enlace a mano desde la app (con «@», en su sección del chat). Forzarla con la siembra entera tocaría todas las páginas de la base.",
    );

    console.log(`\n${APPLY ? "Listo." : "Simulacro: no se escribió nada."} La página se abre en /documentacion/${pagina.slug}\n`);
  } finally {
    await close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
