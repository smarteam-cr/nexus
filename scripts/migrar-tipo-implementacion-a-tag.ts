/**
 * scripts/migrar-tipo-implementacion-a-tag.ts
 *
 * Mueve el TIPO DE IMPLEMENTACIÓN de su columna propia (`implementationType`, un enum) al array
 * de clasificación (`tags`), sobre `Project` Y `BusinessCase`. Es el paso de DATOS de la
 * unificación del 2026-08-12; el paso de CÓDIGO ya está deployado.
 *
 *   IMPLEMENTATION   → agrega el tag `implementacion`
 *   REIMPLEMENTATION → agrega el tag `reimplementacion`
 *   NULL             → NO TOCA NADA (ver abajo)
 *
 * Ver:      npx tsx scripts/migrar-tipo-implementacion-a-tag.ts
 * Aplicar:  ALLOW_PROD_WRITE=1 npx tsx scripts/migrar-tipo-implementacion-a-tag.ts --apply
 *
 * ── EL ORDEN IMPORTA, Y ES CÓDIGO PRIMERO ────────────────────────────────────
 * Este script corre DESPUÉS del deploy, nunca antes. El motivo no es cautela genérica: el
 * `sanitizeTags` VIEJO no conoce los slugs nuevos y DESCARTA lo que no conoce, en silencio. Con
 * el código viejo sirviendo, la primera escritura de tags posterior a la migración —regenerar un
 * handoff, tocar un chip— borraría el tag recién puesto sin un solo error.
 *
 * ── POR QUÉ ES ADITIVO Y NO LIMPIA LA COLUMNA ────────────────────────────────
 * La columna queda con su dato como red de seguridad hasta su `DROP` (paso dos del retiro, un
 * cambio aparte). Si algo salió mal, el remedio es re-correr esto, no reconstruir un dato perdido.
 *
 * ── POR QUÉ `NULL` NO SE RELLENA ─────────────────────────────────────────────
 * Un proyecto sin tipo definido es un proyecto donde NADIE respondió la pregunta. Escribirle
 * `implementacion` porque "es lo que el sistema asumía igual" convertiría un hueco conocido en
 * una afirmación falsa, y encima taparía justo el aviso que esta tanda agregó para que se vea.
 * El sistema los sigue tratando como "desde cero" y la pantalla los sigue marcando.
 */
import "dotenv/config";
import { resolverApply } from "./lib/guard";
import { prisma } from "@/lib/db/prisma";
import { sanitizeTags, tipoDeImplementacion, labelForTag } from "@/lib/tags/catalog";

const APPLY = resolverApply();

/** Los tags que le quedarían a la fila, o `null` si no hay nada que cambiar. */
function tagsMigrados(tags: string[], columna: string | null): string[] | null {
  if (!columna) return null; // sin dato que mover
  /* El valor del enum entra por `TAG_ALIASES` (lib/tags/catalog.ts), así que la migración es
     literalmente "meté la columna en la lista y saneá". Y como `sanitizeTags` resuelve el eje
     excluyente con PRIMERO-GANA, un tag ya curado a mano le gana a la columna: la migración
     nunca pisa una corrección humana posterior. */
  const antes = sanitizeTags(tags);
  if (tipoDeImplementacion(antes)) return null; // ya migrada (o ya curada) — no tocar
  const despues = sanitizeTags([...antes, columna]);
  return JSON.stringify(despues) === JSON.stringify(tags) ? null : despues;
}

async function migrar<T extends { id: string; tags: string[]; implementationType: string | null }>(
  rotulo: string,
  filas: T[],
  escribir: (id: string, tags: string[]) => Promise<unknown>,
) {
  const cambios = filas
    .map((f) => ({ f, next: tagsMigrados(f.tags, f.implementationType) }))
    .filter((c): c is { f: T; next: string[] } => c.next !== null);

  const conColumna = filas.filter((f) => f.implementationType).length;
  const yaMigradas = conColumna - cambios.length;
  console.log(
    `\n${rotulo}: ${filas.length} filas · ${conColumna} con tipo declarado · ` +
      `${cambios.length} a migrar · ${yaMigradas} ya resueltas · ${filas.length - conColumna} sin definir (no se tocan)`,
  );

  for (const { f, next } of cambios) {
    const tag = tipoDeImplementacion(next);
    console.log(`  ${f.id}  [${f.tags.join(", ")}] + ${f.implementationType} → ${labelForTag(tag ?? "")}`);
    if (APPLY) await escribir(f.id, next);
  }
  return cambios.length;
}

async function main() {
  const proyectos = await prisma.project.findMany({
    select: { id: true, tags: true, implementationType: true },
    orderBy: { createdAt: "asc" },
  });
  const bcs = await prisma.businessCase.findMany({
    select: { id: true, tags: true, implementationType: true },
    orderBy: { createdAt: "asc" },
  });

  const a = await migrar("Proyectos", proyectos, (id, tags) =>
    prisma.project.update({ where: { id }, data: { tags } }),
  );
  const b = await migrar("Business cases", bcs, (id, tags) =>
    prisma.businessCase.update({ where: { id }, data: { tags } }),
  );

  console.log(
    APPLY
      ? `\n✓ ${a + b} filas migradas. La columna NO se tocó — sigue ahí como respaldo hasta su DROP.`
      : `\n(simulación) ${a + b} filas cambiarían. Para aplicar: ALLOW_PROD_WRITE=1 npx tsx scripts/migrar-tipo-implementacion-a-tag.ts --apply`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
