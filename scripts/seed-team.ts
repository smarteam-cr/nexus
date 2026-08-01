/**
 * scripts/seed-team.ts — roster FICTICIO del equipo (catálogo).
 *
 * ⚠ Los nombres y correos de acá abajo son deliberadamente falsos (dominio
 * reservado example.com, RFC 2606): los datos reales del equipo NO van al repo
 * (decisión 2026-08-01). En producción el equipo real ya existe en la tabla;
 * este seed existe para poblar una base LOCAL con un equipo verosímil.
 *
 * Idempotente (upsert por email). Guard: contra prod exige ALLOW_PROD_WRITE=1.
 */
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import * as dotenv from "dotenv";
dotenv.config();

import { assertProdWriteAllowed } from "./lib/guard";
import { createScriptPool } from "./lib/db";

// Este seed ESCRIBE siempre (no tiene --apply): el guard corre incondicional.
assertProdWriteAllowed("scripts/seed-team.ts");
const { pool } = createScriptPool();
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

// `area` = eje de ANÁLISIS (Ventas/CSE/…). El roleEnum (permiso) arranca en CSE
// y se asigna por scripts/assign-team-roles.ts.
const TEAM = [
  { name: "Sofía Vendedora Uno",    email: "ventas.uno@example.com",    area: "Ventas" },
  { name: "Bruno Vendedor Dos",     email: "ventas.dos@example.com",    area: "Ventas" },
  { name: "Clara Vendedora Tres",   email: "ventas.tres@example.com",   area: "Ventas" },
  { name: "Diego Vendedor Cuatro",  email: "ventas.cuatro@example.com", area: "Ventas" },
  { name: "Elena Vendedora Cinco",  email: "ventas.cinco@example.com",  area: "Ventas" },
  { name: "Fabián Consultor Uno",   email: "cse.uno@example.com",       area: "CSE" },
  { name: "Gina Consultora Dos",    email: "cse.dos@example.com",       area: "CSE" },
  { name: "Hugo Consultor Tres",    email: "cse.tres@example.com",      area: "CSE" },
  { name: "Irene Consultora Cuatro", email: "cse.cuatro@example.com",   area: "CSE" },
  { name: "Julián Consultor Cinco", email: "cse.cinco@example.com",     area: "CSE" },
];

async function main() {
  for (const member of TEAM) {
    const result = await prisma.teamMember.upsert({
      where: { email: member.email },
      update: { name: member.name, area: member.area },
      create: member,
    });
    console.log(`✓ ${result.name} <${result.email}>`);
  }
  console.log("\nEquipo (ficticio) sembrado correctamente.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
