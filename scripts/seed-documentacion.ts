/**
 * scripts/seed-documentacion.ts — siembra las dos páginas iniciales de la base de conocimiento.
 *
 *   «¿Cómo funciona Nexus?»  — el manual, con sus bloques vivos.
 *   «Escala de rendimiento»  — el reglamento v5.2.0, con una subpágina por área.
 *
 * ── LAS DOS REGLAS QUE LO HACEN SEGURO DE REPETIR ────────────────────────────
 * 1. Es IDEMPOTENTE por `slug`: correrlo dos veces no duplica nada.
 * 2. NO pisa lo que escribió una persona. Al sembrar se guarda en `semillaVersion` la versión
 *    que quedó; si hoy la página tiene otra, alguien la editó y se SALTA. Para pisarla igual hay
 *    que pedirlo por su nombre: `--forzar <slug>` (y antes se guarda una versión en el historial,
 *    así lo editado no se pierde).
 *
 * ⚠ Se compara por NÚMERO de versión y no por contenido: el editor normaliza los bloques al
 * cargarlos (les agrega ids y props por defecto), así que el JSON guardado cambia sin que nadie
 * haya editado. Comparar contenidos daría "editada" siempre.
 *
 * Uso:
 *   npx tsx scripts/seed-documentacion.ts                              (muestra qué haría)
 *   ALLOW_PROD_WRITE=1 npx tsx scripts/seed-documentacion.ts --apply
 *   ALLOW_PROD_WRITE=1 npx tsx scripts/seed-documentacion.ts --apply --forzar escala-de-rendimiento
 *
 * En la base local (descartable) no hace falta la variable: el guard mira el destino.
 */
import "dotenv/config";
import type { Prisma, PrismaClient } from "@prisma/client";
import { resolverApply } from "./lib/guard";
import { createScriptDb } from "./lib/db";
import { construirComoFunciona } from "@/lib/documentacion/semillas/como-funciona";
import { construirEscala } from "@/lib/documentacion/semillas/escala";
import type { PaginaSembrada } from "@/lib/documentacion/semillas/bloques";
import { textoDeBloques, textoDeBusqueda } from "@/lib/documentacion/texto";
import type { BloqueGuardado } from "@/lib/documentacion/tipos";

const APPLY = resolverApply({ tablas: ["PaginaDoc", "PaginaDocVersion"] });

/** Los slugs que se pisan aunque estén editados: `--forzar <slug>` (se puede repetir). */
const FORZAR = new Set(
  process.argv.filter((arg, i) => process.argv[i - 1] === "--forzar" && !arg.startsWith("--")),
);

type Accion = "crear" | "actualizar" | "saltar";
const bitacora: { accion: Accion; slug: string; detalle?: string }[] = [];

function contenidoDe(pagina: PaginaSembrada) {
  const bloques = pagina.bloques as BloqueGuardado[];
  const texto = textoDeBloques(bloques);
  return {
    titulo: pagina.titulo,
    icono: pagina.icono,
    contenido: bloques as unknown as Prisma.InputJsonValue,
    texto,
    busqueda: textoDeBusqueda(pagina.titulo, texto),
    // Las dos páginas nacen bloqueadas (las edita el liderazgo) y fijas (no se archivan).
    bloqueada: true,
    fija: true,
  };
}

async function sembrar(
  prisma: PrismaClient,
  pagina: PaginaSembrada,
  parentId: string | null,
  orden: number,
): Promise<void> {
  const existente = await prisma.paginaDoc.findUnique({ where: { slug: pagina.slug } });
  const datos = contenidoDe(pagina);
  let id = existente?.id ?? null;

  if (!existente) {
    bitacora.push({ accion: "crear", slug: pagina.slug });
    if (APPLY) {
      const creada = await prisma.paginaDoc.create({
        data: { ...datos, slug: pagina.slug, parentId, orden, version: 1, semillaVersion: 1 },
      });
      id = creada.id;
    }
  } else {
    const laEditoAlguien =
      existente.semillaVersion === null || existente.version !== existente.semillaVersion;

    if (laEditoAlguien && !FORZAR.has(pagina.slug)) {
      bitacora.push({
        accion: "saltar",
        slug: pagina.slug,
        detalle: `la editó una persona (versión ${existente.version}, sembrada ${existente.semillaVersion ?? "—"}). Para pisarla: --forzar ${pagina.slug}`,
      });
    } else {
      bitacora.push({
        accion: "actualizar",
        slug: pagina.slug,
        detalle: laEditoAlguien ? "forzada: se guarda una versión antes de pisar" : undefined,
      });
      if (APPLY) {
        await prisma.$transaction(async (tx) => {
          await tx.paginaDocVersion.create({
            data: {
              paginaId: existente.id,
              version: existente.version,
              titulo: existente.titulo,
              icono: existente.icono,
              contenido: existente.contenido as Prisma.InputJsonValue,
              motivo: laEditoAlguien ? "antes-de-forzar" : "semilla",
            },
          });
          const version = existente.version + 1;
          await tx.paginaDoc.update({
            where: { id: existente.id },
            data: { ...datos, parentId, orden, version, semillaVersion: version },
          });
        });
      }
    }
  }

  for (const [i, hija] of (pagina.hijas ?? []).entries()) {
    // En seco no hay id de la madre todavía: se reporta igual, con la madre en null.
    await sembrar(prisma, hija, id, i);
  }
}

async function main() {
  const { prisma, close } = createScriptDb();
  try {
    const paginas = [construirComoFunciona(), construirEscala()];

    console.log(`\n${APPLY ? "✍  Sembrando" : "👀 En seco (agregá --apply para escribir)"}\n`);
    for (const [i, pagina] of paginas.entries()) {
      await sembrar(prisma, pagina, null, i);
    }

    const simbolo: Record<Accion, string> = { crear: "+", actualizar: "~", saltar: "=" };
    for (const linea of bitacora) {
      console.log(
        `  ${simbolo[linea.accion]} ${linea.accion.padEnd(11)} ${linea.slug}${linea.detalle ? `\n      ${linea.detalle}` : ""}`,
      );
    }

    const saltadas = bitacora.filter((l) => l.accion === "saltar").length;
    console.log(
      `\n${bitacora.length} página(s): ${bitacora.filter((l) => l.accion === "crear").length} nuevas, ` +
        `${bitacora.filter((l) => l.accion === "actualizar").length} actualizadas, ${saltadas} salteadas.\n`,
    );
  } finally {
    await close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
