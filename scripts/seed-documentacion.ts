/**
 * scripts/seed-documentacion.ts — siembra los artículos de la base de conocimiento.
 *
 *   «¿Cómo funciona Nexus?»       — el manual, con sus bloques vivos.
 *   «Escala de rendimiento»       — el reglamento v5.2.0, con una subpágina por área.
 *   «Customer Success»            — el departamento: roles, competencias, relación con el cliente,
 *                                   Land and Expand y SmartLoop (con la Guía de CSE adentro).
 *   «¿Cómo trabajar en Smarteam?» — canales, grabación y cómo se escribe a distancia.
 *
 * ── LAS TRES REGLAS QUE LO HACEN SEGURO DE REPETIR ───────────────────────────
 * 1. Es IDEMPOTENTE por `slug`: correrlo dos veces no duplica nada.
 * 2. NO pisa lo que escribió una persona. Al sembrar se guarda en `semillaVersion` la versión
 *    que quedó; si hoy la página tiene otra, alguien la editó y se SALTA. Para pisarla igual hay
 *    que pedirlo por su nombre: `--forzar <slug>` (y antes se guarda una versión en el historial,
 *    así lo editado no se pierde).
 * 3. La ESTRUCTURA sí es de la semilla. Una página editada que la semilla ubica en otro lugar del
 *    árbol se MUEVE —madre y orden— sin tocar su contenido ni su versión. La decisión vive en
 *    `lib/documentacion/semillas/accion.ts`, que tiene sus pruebas.
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
import { construirCustomerSuccess } from "@/lib/documentacion/semillas/customer-success";
import { construirTrabajarEnSmarteam } from "@/lib/documentacion/semillas/trabajar-en-smarteam";
import { resolverMenciones, type PaginaSembrada } from "@/lib/documentacion/semillas/bloques";
import { decidirAccion } from "@/lib/documentacion/semillas/accion";
import { textoDeBloques, textoDeBusqueda } from "@/lib/documentacion/texto";
import type { BloqueGuardado } from "@/lib/documentacion/tipos";

const APPLY = resolverApply({ tablas: ["PaginaDoc", "PaginaDocVersion"] });

/** Los slugs que se pisan aunque estén editados: `--forzar <slug>` (se puede repetir). */
const FORZAR = new Set(
  process.argv.filter((arg, i) => process.argv[i - 1] === "--forzar" && !arg.startsWith("--")),
);

type Accion = "crear" | "actualizar" | "saltar" | "mover" | "enlazar";
const bitacora: { accion: Accion; slug: string; detalle?: string }[] = [];

/** Lo que se escribió en esta corrida: la segunda pasada le completa los enlaces. */
const escritas: { id: string; slug: string; bloques: BloqueGuardado[] }[] = [];

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
  madrePendiente = false,
): Promise<void> {
  const existente = await prisma.paginaDoc.findUnique({ where: { slug: pagina.slug } });
  const datos = contenidoDe(pagina);
  let id = existente?.id ?? null;
  const { accion, editada } = decidirAccion(
    existente,
    { parentId, orden, madrePendiente },
    FORZAR.has(pagina.slug),
  );

  if (!existente || accion === "crear") {
    bitacora.push({ accion: "crear", slug: pagina.slug });
    if (APPLY) {
      const creada = await prisma.paginaDoc.create({
        data: { ...datos, slug: pagina.slug, parentId, orden, version: 1, semillaVersion: 1 },
      });
      id = creada.id;
      escritas.push({ id: creada.id, slug: pagina.slug, bloques: pagina.bloques as BloqueGuardado[] });
    }
  } else {
    const editadaPor = `la editó una persona (versión ${existente.version}, sembrada ${existente.semillaVersion ?? "—"})`;

    if (accion === "saltar") {
      bitacora.push({
        accion: "saltar",
        slug: pagina.slug,
        detalle: `${editadaPor}. Para pisarla: --forzar ${pagina.slug}`,
      });
    } else if (accion === "mover") {
      /* Solo el lugar en el árbol: el contenido es de quien la editó, y la versión no sube (mover
         no es editar, igual que en la app). */
      bitacora.push({
        accion: "mover",
        slug: pagina.slug,
        detalle: `${editadaPor}: se lleva a su lugar en el árbol sin tocar su contenido`,
      });
      if (APPLY) {
        await prisma.paginaDoc.update({ where: { id: existente.id }, data: { parentId, orden } });
      }
    } else {
      bitacora.push({
        accion: "actualizar",
        slug: pagina.slug,
        detalle: editada ? "forzada: se guarda una versión antes de pisar" : undefined,
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
              motivo: editada ? "antes-de-forzar" : "semilla",
            },
          });
          const version = existente.version + 1;
          await tx.paginaDoc.update({
            where: { id: existente.id },
            data: { ...datos, parentId, orden, version, semillaVersion: version },
          });
        });
        escritas.push({
          id: existente.id,
          slug: pagina.slug,
          bloques: pagina.bloques as BloqueGuardado[],
        });
      }
    }
  }

  for (const [i, hija] of (pagina.hijas ?? []).entries()) {
    /* En seco, una madre que se va a crear todavía no tiene id: se avisa, para que un `null` que
       significa «todavía no sé» no se lea como «está en la raíz». */
    await sembrar(prisma, hija, id, i, id === null);
  }
}

async function main() {
  const { prisma, close } = createScriptDb();
  try {
    /* El orden del array es el orden del árbol: lo primero que se lee, primero. */
    const paginas = [
      construirComoFunciona(),
      construirEscala(),
      construirCustomerSuccess(),
      construirTrabajarEnSmarteam(),
    ];

    console.log(`\n${APPLY ? "✍  Sembrando" : "👀 En seco (agregá --apply para escribir)"}\n`);
    for (const [i, pagina] of paginas.entries()) {
      await sembrar(prisma, pagina, null, i);
    }

    /* SEGUNDA PASADA: los enlaces entre páginas. Al armar el contenido, la página destino todavía
       puede no existir, así que las menciones se escriben con el slug y sin id. Con todas creadas,
       acá se completa el id — que es lo que hace que la página destino sepa quién la nombra. */
    if (APPLY && escritas.length > 0) {
      const todas = await prisma.paginaDoc.findMany({ select: { id: true, slug: true } });
      const idPorSlug = new Map(todas.map((p) => [p.slug, p.id]));

      for (const escrita of escritas) {
        const resueltos = resolverMenciones(escrita.bloques, idPorSlug);
        if (JSON.stringify(resueltos) === JSON.stringify(escrita.bloques)) continue;

        const pagina = await prisma.paginaDoc.findUniqueOrThrow({ where: { id: escrita.id } });
        const texto = textoDeBloques(resueltos);
        await prisma.paginaDoc.update({
          where: { id: escrita.id },
          data: {
            contenido: resueltos as unknown as Prisma.InputJsonValue,
            texto,
            busqueda: textoDeBusqueda(pagina.titulo, texto),
            version: pagina.version + 1,
            semillaVersion: pagina.version + 1,
          },
        });
        bitacora.push({ accion: "enlazar", slug: escrita.slug, detalle: "enlaces completados" });
      }
    }

    const simbolo: Record<Accion, string> = {
      crear: "+",
      actualizar: "~",
      saltar: "=",
      mover: "↳",
      enlazar: "→",
    };
    for (const linea of bitacora) {
      console.log(
        `  ${simbolo[linea.accion]} ${linea.accion.padEnd(11)} ${linea.slug}${linea.detalle ? `\n      ${linea.detalle}` : ""}`,
      );
    }

    const cuantas = (accion: Accion) => bitacora.filter((l) => l.accion === accion).length;
    console.log(
      `\n${bitacora.length} página(s): ${cuantas("crear")} nuevas, ${cuantas("actualizar")} actualizadas, ` +
        `${cuantas("mover")} movidas, ${cuantas("saltar")} salteadas.\n`,
    );
  } finally {
    await close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
