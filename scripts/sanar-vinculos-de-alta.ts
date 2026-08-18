/**
 * scripts/sanar-vinculos-de-alta.ts — proyectos que nacieron sin ninguna sesión vinculada.
 *
 * ── QUÉ PASA ─────────────────────────────────────────────────────────────────
 * El alta sella `Project.altaReclasificadoAt` para pagar la reclasificación UNA sola vez
 * (cuesta ~US$1 de modelo). El sello es correcto; el problema es que se pone aunque la
 * reclasificación no haya tenido nada que mirar. Dos formas de que eso pase, las dos vistas
 * en producción el 2026-08-18:
 *
 *   (a) LA CARRERA — el cliente acaba de nacer. `POST /api/projects` crea el Client
 *       (`route.ts:137`) y, a diferencia de la otra puerta que crea clientes
 *       (`POST /api/clients:48`), NO dispara la atribución de sesiones. Un segundo y medio
 *       después el alta reclasifica: consulta las sesiones DEL CLIENTE y encuentra cero,
 *       porque todavía ninguna apunta al cliente nuevo. Sella igual.
 *       Caso: «Discover Puerto Rico» — cliente creado 2 s antes de reclasificar, 2 sesiones
 *       suyas (por título), 0 vínculos.
 *
 *   (b) LA VENTANA — `reclassifyClientSessions` mira 90 días hacia atrás. Un cliente cuyo
 *       historial es más viejo entra al alta con las manos vacías.
 *       Caso: «kamalio» — 3 sesiones, todas de 2025, alta de agosto 2026, 0 vínculos.
 *
 * En los dos casos el resultado es el mismo y es el que reporta el CSE: **el proyecto no
 * tiene ninguna reunión**, y como el sello ya está puesto, no se arregla solo nunca.
 *
 * ── QUÉ HACE ESTE SCRIPT ─────────────────────────────────────────────────────
 * Busca proyectos activos con el sello puesto, CERO vínculos de sesión, y un cliente que SÍ
 * tiene sesiones — y les vuelve a correr la reclasificación, con la ventana abierta.
 *
 * ⚠ NO escribe vínculos a mano: llama a `reclassifyClientSessions`, el mismo camino que usa
 * el alta. Eso importa — ese camino respeta los candados por link (manual / revisado /
 * tombstone / override de handoff), así que no puede pisar una curación humana. Escribir el
 * `SessionProject` directo se saltearía esos candados, que es exactamente el error que la
 * guarda de `duenio-manual.test.ts` cazó en el script de REMPRO.
 *
 * ⚠ Cuesta plata cuando el cliente tiene 2+ proyectos: ahí la clasificación la hace Claude
 * (~US$0,03-0,04 por sesión). Con 1 solo proyecto es un atajo determinista y no llama al
 * modelo. El dry-run dice cuántas sesiones y cuántos clientes multi-proyecto hay antes.
 *
 * Dry-run por defecto. `--apply` exige ALLOW_PROD_WRITE=1 (INV12).
 *   npx tsx --env-file=.env scripts/sanar-vinculos-de-alta.ts
 *   ALLOW_PROD_WRITE=1 npx tsx --env-file=.env scripts/sanar-vinculos-de-alta.ts --apply
 *   ... --apply --proyecto <id>     (uno solo, para probar)
 */
import { resolverApply } from "./lib/guard";
import { reclassifyClientSessions } from "@/lib/sessions/reclassify";
import { classifySessionToProjects } from "@/lib/sessions/classify-session-project";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL, max: 2 }),
});

/** Ventana amplia a propósito: el caso (b) es justamente un historial más viejo que 90 días. */
const VENTANA_DIAS = 3650;

function argValor(nombre: string): string | null {
  const i = process.argv.indexOf(nombre);
  return i >= 0 ? (process.argv[i + 1] ?? null) : null;
}

async function main() {
  const apply = resolverApply();
  const soloProyecto = argValor("--proyecto");

  const proyectos = await prisma.project.findMany({
    where: {
      status: "active",
      altaReclasificadoAt: { not: null },
      ...(soloProyecto ? { id: soloProyecto } : {}),
    },
    select: {
      id: true, name: true, clientId: true, createdAt: true, altaReclasificadoAt: true,
      client: { select: { name: true, createdAt: true } },
      _count: { select: { sessions: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  const afectados: Array<{
    id: string; nombre: string; cliente: string; clientId: string;
    sesionesDelCliente: number; proyectosDelCliente: number; segundosDeVentaja: number | null;
  }> = [];

  for (const p of proyectos) {
    if (p._count.sessions > 0) continue;
    const sesionesDelCliente = await prisma.firefliesSession.count({
      where: {
        OR: [{ manualClientId: p.clientId }, { manualClientId: null, resolvedClientId: p.clientId }],
        date: { lte: new Date() },
      },
    });
    if (sesionesDelCliente === 0) continue; // no hay nada que vincular: no es este defecto
    const proyectosDelCliente = await prisma.project.count({
      where: { clientId: p.clientId, status: "active" },
    });
    afectados.push({
      id: p.id,
      nombre: p.name,
      cliente: p.client?.name ?? "(sin cliente)",
      clientId: p.clientId,
      sesionesDelCliente,
      proyectosDelCliente,
      segundosDeVentaja: p.client
        ? Math.round((p.altaReclasificadoAt!.getTime() - p.client.createdAt.getTime()) / 1000)
        : null,
    });
  }

  console.log(`\n═══ PROYECTOS SIN NINGUNA REUNIÓN VINCULADA ═══`);
  console.log(`   (sello puesto · 0 vínculos · el cliente SÍ tiene sesiones)\n`);
  if (afectados.length === 0) {
    console.log("  (ninguno — nada que sanar)");
    await prisma.$disconnect();
    return;
  }
  for (const a of afectados) {
    const causa =
      a.segundosDeVentaja !== null && a.segundosDeVentaja < 60
        ? `⚠ LA CARRERA: el cliente nació ${a.segundosDeVentaja}s antes de reclasificar`
        : "la ventana de 90 días, o el cliente ganó sesiones después";
    const costo = a.proyectosDelCliente > 1 ? `  💸 ${a.proyectosDelCliente} proyectos → clasifica Claude` : "  (1 proyecto → atajo, sin modelo)";
    console.log(`  · «${a.cliente}» :: ${a.nombre}`);
    console.log(`      ${a.sesionesDelCliente} sesión(es) del cliente sin vincular · ${causa}${costo}`);
  }

  const conModelo = afectados.filter((a) => a.proyectosDelCliente > 1);
  console.log(`\n  Total: ${afectados.length} proyecto(s). ${conModelo.length} pasan por Claude.`);

  if (!apply) {
    console.log("\n(dry-run — nada se escribió. Repetí con --apply y ALLOW_PROD_WRITE=1)");
    // Simulación por proyecto: qué HARÍA, sin escribir ni gastar modelo en el atajo.
    console.log("\n═══ SIMULACIÓN (solo los de 1 proyecto, que no llaman al modelo) ═══");
    for (const a of afectados.filter((x) => x.proyectosDelCliente === 1)) {
      const ses = await prisma.firefliesSession.findMany({
        where: {
          OR: [{ manualClientId: a.clientId }, { manualClientId: null, resolvedClientId: a.clientId }],
          date: { lte: new Date() },
        },
        select: { id: true, title: true },
        orderBy: { date: "desc" },
        take: 30,
      });
      console.log(`  «${a.cliente}»:`);
      for (const s of ses) {
        const r = await classifySessionToProjects(s.id, a.clientId, { dryRun: true });
        const destino = r.proposals?.map((p) => p.projectId).join(", ") ?? "-";
        console.log(`     ${r.status.padEnd(8)} → ${destino}  "${s.title}"`);
      }
    }
    await prisma.$disconnect();
    return;
  }

  console.log("\n═══ APLICANDO ═══");
  for (const a of afectados) {
    const r = await reclassifyClientSessions(a.clientId, { sinceDays: VENTANA_DIAS, max: 60 });
    const despues = await prisma.sessionProject.count({ where: { projectId: a.id } });
    console.log(
      `  «${a.cliente}»: candidatas=${r.candidates} clasificadas=${r.classified} skip=${r.skipped} err=${r.errors} → el proyecto quedó con ${despues} vínculo(s)`,
    );
  }

  console.log("\n✓ listo. Verificación:");
  for (const a of afectados) {
    const links = await prisma.sessionProject.findMany({
      where: { projectId: a.id },
      select: { included: true, isPrimary: true, session: { select: { title: true, date: true } } },
      orderBy: { session: { date: "desc" } },
    });
    console.log(`  «${a.cliente}» :: ${a.nombre} → ${links.length} vínculo(s)`);
    for (const l of links) {
      console.log(`     ${l.session.date.toISOString().slice(0, 10)} primary=${l.isPrimary} incl=${l.included} "${l.session.title}"`);
    }
  }
  await prisma.$disconnect();
}

main();
