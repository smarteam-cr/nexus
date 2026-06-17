import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import pg from "pg";
import * as dotenv from "dotenv";
dotenv.config();

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter } as Parameters<typeof PrismaClient>[0]);

// `area` = eje de ANÁLISIS (Ventas/CSE/…). El roleEnum (permiso) arranca en CSE
// y se asigna por scripts/assign-team-roles.ts.
const TEAM = [
  { name: "Fidel Castro Chaves",  email: "fcastro@smarteamcr.com",    area: "Ventas" },
  { name: "Iván Rodriguez",       email: "irodriguez@smarteamcr.com",  area: "Ventas" },
  { name: "Danilo González",      email: "dgonzalez@smarteamcr.com",   area: "Ventas" },
  { name: "Sarahí Castañeda",     email: "scastaneda@smarteamcr.com",  area: "Ventas" },
  { name: "Alexander Vanegas",    email: "avanegas@smarteamcr.com",    area: "Ventas" },
  { name: "Carolina Muñoz",       email: "cmunoz@smarteamcr.com",      area: "CSE" },
  { name: "Ximena Rivera",        email: "xrivera@smarteamcr.com",     area: "CSE" },
  { name: "Nataly Morales",       email: "nmorales@smarteamcr.com",    area: "CSE" },
  { name: "Guillermo Osorio",     email: "gosorio@smarteamcr.com",     area: "CSE" },
  { name: "María Sánchez",        email: "msanchez@smarteamcr.com",    area: "CSE" },
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
  console.log("\nEquipo sembrado correctamente.");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
