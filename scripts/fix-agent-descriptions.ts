/**
 * scripts/fix-agent-descriptions.ts
 *
 * Corrige descripciones de agentes que NO reflejan la realidad del flujo.
 * Idempotente (UPDATE puntual por id). Uso: npx tsx scripts/fix-agent-descriptions.ts
 *
 * Caso conocido: "Analizador de Participantes" decía que se llamaba "cada N
 * sesiones desde postProcessSession", pero `analyzeProjectParticipants` solo se
 * invoca ON-DEMAND desde la vista del proyecto (endpoint analyze-participants,
 * disparado por MinuteDialog). No corre en el post-process automático.
 */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import "dotenv/config";

const pool = new Pool({ connectionString: process.env.DATABASE_URL!, ssl: { rejectUnauthorized: false } });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

const FIXES: { id: string; description: string }[] = [
  {
    id: "agent-participants-analyzer",
    description:
      "Analiza el patrón de asistencia del cliente al proyecto y genera stats + alertas accionables. Se ejecuta ON-DEMAND desde la vista del proyecto (no corre en el post-process automático).",
  },
];

async function main() {
  for (const f of FIXES) {
    const before = await prisma.agent.findUnique({ where: { id: f.id }, select: { id: true, description: true } });
    if (!before) {
      console.log(`• [no existe] ${f.id} — saltando`);
      continue;
    }
    if (before.description === f.description) {
      console.log(`• [sin cambios] ${f.id} — ya tiene la descripción correcta`);
      continue;
    }
    await prisma.agent.update({ where: { id: f.id }, data: { description: f.description } });
    console.log(`✓ [actualizado] ${f.id}\n    antes: ${before.description}\n    ahora: ${f.description}`);
  }
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
