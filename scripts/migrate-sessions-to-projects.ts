/**
 * Migra FirefliesSession → SessionProject (pivote N:N) usando el matching
 * cascade real (categorizeSession) para resolver cliente.
 *
 * Para cada FirefliesSession con participants:
 *   1. Correr cascade (categorizeSession) → resolver client
 *   2. Si matched y cliente tiene 1 proyecto activo → crear SessionProject
 *      con source="legacy", isPrimary=true
 *   3. Si matched y cliente tiene N proyectos → skip y log (clasificador IA
 *      lo resolverá cuando post-process corra)
 *   4. Si matched y cliente tiene 0 proyectos → skip
 *
 * Idempotente (upsert sobre el unique compuesto sessionId_projectId).
 *
 * Uso:
 *   npx tsx scripts/migrate-sessions-to-projects.ts          # dry-run
 *   npx tsx scripts/migrate-sessions-to-projects.ts --apply  # ejecuta
 */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import "dotenv/config";
import {
  categorizeSession,
  buildInternalDomainsSet,
  type CategorizeContext,
} from "../lib/sessions/categorize";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL!,
  ssl: { rejectUnauthorized: false },
});
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

async function main() {
  const apply = process.argv.includes("--apply");
  console.log(`Modo: ${apply ? "APLICAR" : "DRY-RUN (usa --apply para ejecutar)"}\n`);

  // 1. Cargar contexto de matching
  const [sessions, clients, categories, projects] = await Promise.all([
    prisma.firefliesSession.findMany({
      select: {
        id: true,
        title: true,
        participants: true,
        manualClientId: true,
      },
    }),
    prisma.client.findMany({
      select: { id: true, name: true, company: true, emailDomains: true },
    }),
    prisma.sessionCategory.findMany({
      select: { id: true, name: true, slug: true, domains: true, kind: true, color: true },
    }),
    prisma.project.findMany({
      where: {
        status: "active",
        serviceType: { not: "__strategy__" },
      },
      select: { id: true, clientId: true, name: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  console.log(`Sesiones totales: ${sessions.length}`);
  console.log(`Clientes:         ${clients.length}`);
  console.log(`Proyectos activos: ${projects.length}\n`);

  // 2. Agrupar proyectos por cliente
  const projectsByClient = new Map<string, typeof projects>();
  for (const p of projects) {
    const arr = projectsByClient.get(p.clientId) ?? [];
    arr.push(p);
    projectsByClient.set(p.clientId, arr);
  }

  // 3. Context para cascade (sin HubspotCompanies — los clientes con emailDomains
  //    bien configurados deberían matchearse igual)
  const ctx: CategorizeContext = {
    clients,
    categories,
    hubspotCompaniesByDomain: new Map(),
    internalDomains: buildInternalDomainsSet(categories),
  };

  // 4. Iterar sesiones y aplicar
  let matched = 0;
  let created = 0;
  let alreadyExisted = 0;
  let skippedNoProjects = 0;
  let skippedMultiProjects = 0;
  let skippedNotMatched = 0;

  for (const s of sessions) {
    const group = categorizeSession(s, ctx);
    if (group.kind !== "client") {
      skippedNotMatched++;
      continue;
    }
    matched++;

    const clientProjects = projectsByClient.get(group.id) ?? [];

    if (clientProjects.length === 0) {
      skippedNoProjects++;
      continue;
    }

    if (clientProjects.length > 1) {
      skippedMultiProjects++;
      // Para multi-proyecto, lo dejamos para el clasificador IA (correrá en
      // postProcessSession), pero podemos opcionalmente asignar al más reciente
      // como heurística de fallback. Para ser conservadores, skipeamos.
      continue;
    }

    const project = clientProjects[0];

    // Idempotente: upsert sobre (sessionId, projectId)
    if (apply) {
      const before = await prisma.sessionProject.findUnique({
        where: { sessionId_projectId: { sessionId: s.id, projectId: project.id } },
        select: { id: true },
      });
      if (before) {
        alreadyExisted++;
        continue;
      }
      await prisma.sessionProject.create({
        data: {
          sessionId: s.id,
          projectId: project.id,
          isPrimary: true,
          source: "legacy",
        },
      });
      created++;
    } else {
      created++; // dry-run: solo contar lo que se haría
    }
  }

  console.log("─── Resumen ───");
  console.log(`Matched a cliente:           ${matched}`);
  console.log(`No matched (skip):           ${skippedNotMatched}`);
  console.log(`Cliente sin proyectos:       ${skippedNoProjects}`);
  console.log(`Cliente con multi-proyectos: ${skippedMultiProjects} (deja para clasificador IA)`);
  console.log(`SessionProject ${apply ? "creados" : "a crear"}: ${created}`);
  console.log(`Ya existían:                 ${alreadyExisted}`);

  if (!apply) console.log("\n⚠ Dry-run. Ejecuta con --apply para persistir cambios.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
