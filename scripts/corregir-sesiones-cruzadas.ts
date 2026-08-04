/**
 * scripts/corregir-sesiones-cruzadas.ts
 *
 * Arregla las sesiones que quedaron atribuidas a un cliente y ligadas al proyecto de OTRO
 * (lo que INV1 llama "cruzan cliente").
 *
 * ── POR QUÉ PASA ─────────────────────────────────────────────────────────────
 * Cuando una reunión no tiene participantes de afuera, el único camino para saber de quién es
 * el TÍTULO. Y un título como "Presupuesto Plastimex / Smarteam" nombra a DOS clientes:
 * `findClientByTitleMatch` (lib/sessions/categorize.ts) devuelve el primero que encuentra, que
 * suele ser Smarteam porque aparece en medio mundo. La sesión queda como "de Smarteam" aunque
 * alimente el proyecto de Plastimex.
 *
 * ── POR QUÉ SE CORRIGE EN VEZ DE BORRAR EL VÍNCULO ───────────────────────────
 * El remedio que sugiere el invariante es `cleanup-cross-client-session-projects.ts`, que BORRA
 * el link. Sirve cuando el link es el error. Acá es al revés: el link es correcto —esa reunión
 * es del proyecto— y lo que está mal es de quién dice Nexus que es la sesión. Borrar el vínculo
 * le sacaría material real al proyecto para dejar un invariante contento.
 *
 * El arreglo es `manualClientId`, la palanca que ya existe para "el humano sabe mejor": gana en
 * el paso 1 de la cascada, así que sobrevive a cualquier re-resolución futura.
 *
 * ⚠ Una sesión ligada a proyectos de DOS clientes distintos NO se toca: no hay respuesta única,
 * y elegir una sería mover contexto de un cliente a otro a ciegas.
 *
 * DRY-RUN por defecto.
 *   npx tsx scripts/corregir-sesiones-cruzadas.ts
 *   ALLOW_PROD_WRITE=1 npx tsx scripts/corregir-sesiones-cruzadas.ts --apply
 */
import "dotenv/config";
import { resolverApply } from "./lib/guard";
import { prisma } from "@/lib/db/prisma";
import { resolveAllSessions } from "@/lib/sessions/resolve-client";

async function main() {
  const apply = resolverApply();

  const links = await prisma.sessionProject.findMany({
    select: {
      sessionId: true,
      project: { select: { name: true, clientId: true, client: { select: { name: true } } } },
      session: {
        select: { title: true, date: true, resolvedClientId: true, manualClientId: true },
      },
    },
  });

  /* El MISMO criterio que INV1 (scripts/check-invariants.ts): se transcribe en vez de importarse
     porque si el invariante cambia de idea, este script tiene que fallar ruidosamente y no
     seguirlo en silencio. */
  const cruzados = links.filter((l) => {
    const pc = l.project.clientId;
    const { resolvedClientId: r, manualClientId: m } = l.session;
    return r !== null && pc !== r && pc !== m;
  });

  if (cruzados.length === 0) {
    console.log("No hay sesiones cruzadas. Nada que hacer.");
    return;
  }

  const clientes = await prisma.client.findMany({ select: { id: true, name: true } });
  const nombreDe = new Map(clientes.map((c) => [c.id, c.name]));

  // Agrupar por sesión: una sesión ligada a dos clientes distintos no tiene arreglo automático.
  const porSesion = new Map<string, typeof cruzados>();
  for (const l of cruzados) {
    const lista = porSesion.get(l.sessionId) ?? [];
    lista.push(l);
    porSesion.set(l.sessionId, lista);
  }

  const aCorregir: { sessionId: string; clientId: string }[] = [];
  let ambiguas = 0;

  console.log(`\nSesiones cruzadas: ${porSesion.size} (en ${cruzados.length} vínculos)\n`);
  for (const [sessionId, lista] of porSesion) {
    const s = lista[0].session;
    const destinos = new Set(lista.map((l) => l.project.clientId));
    console.log(`· "${s.title?.slice(0, 60)}"  (${s.date?.toISOString().slice(0, 10)})`);
    console.log(`    hoy es de : ${nombreDe.get(s.resolvedClientId!) ?? "?"}`);

    if (destinos.size > 1) {
      ambiguas++;
      console.log(`    ⚠ ligada a proyectos de ${destinos.size} clientes distintos — NO SE TOCA`);
      console.log();
      continue;
    }
    const destino = lista[0].project.clientId;
    console.log(`    pasa a ser: ${lista[0].project.client.name}  («${lista[0].project.name}»)`);
    console.log();
    aCorregir.push({ sessionId, clientId: destino });
  }

  console.log(`Se corrigen: ${aCorregir.length}${ambiguas ? ` · ambiguas que quedan: ${ambiguas}` : ""}`);

  if (!apply) {
    console.log("\n(dry-run) Nada escrito. Repetí con --apply para aplicarlo.");
    return;
  }

  for (const { sessionId, clientId } of aCorregir) {
    await prisma.firefliesSession.update({ where: { id: sessionId }, data: { manualClientId: clientId } });
  }
  console.log(`\n✓ ${aCorregir.length} sesiones re-asignadas.`);

  /* Una sola re-resolución al final en vez de una por sesión: materializa `resolvedClientId` y
     dispara la reclasificación UNA vez por cliente que ganó sesiones, en vez de una por sesión
     (cada corrida del clasificador cuesta plata). */
  console.log("Re-resolviendo…");
  const r = await resolveAllSessions();
  console.log(`✓ ${r.changed} sesiones cambiaron de dueño.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
