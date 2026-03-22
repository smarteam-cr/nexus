import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import pg from "pg";
import * as dotenv from "dotenv";
dotenv.config();

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter } as Parameters<typeof PrismaClient>[0]);

async function main() {
  const clients = await prisma.client.findMany({ select: { id: true, name: true } });

  console.log(`Encontrados ${clients.length} clientes.`);

  for (const client of clients) {
    // Verificar si ya tiene un proyecto
    const existing = await prisma.project.findFirst({ where: { clientId: client.id } });

    let projectId: string;
    if (existing) {
      console.log(`  ↩ ${client.name}: ya tiene proyecto "${existing.name}" (${existing.id})`);
      projectId = existing.id;
    } else {
      const project = await prisma.project.create({
        data: {
          clientId: client.id,
          name: "Proyecto principal",
          status: "active",
        },
      });
      console.log(`  ✓ ${client.name}: proyecto creado (${project.id})`);
      projectId = project.id;
    }

    // Asignar projectId a todos los registros del cliente que no lo tengan
    const [notes, cards, docs, runs] = await Promise.all([
      prisma.stageNote.updateMany({
        where: { clientId: client.id, projectId: null },
        data: { projectId },
      }),
      prisma.clientContextCard.updateMany({
        where: { clientId: client.id, projectId: null },
        data: { projectId },
      }),
      prisma.clientDocument.updateMany({
        where: { clientId: client.id, projectId: null },
        data: { projectId },
      }),
      prisma.agentRun.updateMany({
        where: { clientId: client.id, projectId: null },
        data: { projectId },
      }),
    ]);

    const total = notes.count + cards.count + docs.count + runs.count;
    if (total > 0) {
      console.log(
        `     → ${notes.count} notas, ${cards.count} cards, ${docs.count} docs, ${runs.count} runs migrados`
      );
    }
  }

  console.log("\n✅ Migración completada.");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
