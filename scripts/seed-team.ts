import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import pg from "pg";
import * as dotenv from "dotenv";
dotenv.config();

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter } as Parameters<typeof PrismaClient>[0]);

const TEAM = [
  { name: "Fidel Castro Chaves",  email: "fcastro@smarteamcr.com",    role: "Ventas" },
  { name: "Iván Rodriguez",       email: "irodriguez@smarteamcr.com",  role: "Ventas" },
  { name: "Danilo González",      email: "dgonzalez@smarteamcr.com",   role: "Ventas" },
  { name: "Sarahí Castañeda",     email: "scastaneda@smarteamcr.com",  role: "Ventas" },
  { name: "Alexander Vanegas",    email: "avanegas@smarteamcr.com",    role: "Ventas" },
  { name: "Carolina Muñoz",       email: "cmunoz@smarteamcr.com",      role: "CSE" },
  { name: "Ximena Rivera",        email: "xrivera@smarteamcr.com",     role: "CSE" },
  { name: "Nataly Morales",       email: "nmorales@smarteamcr.com",    role: "CSE" },
  { name: "Guillermo Osorio",     email: "gosorio@smarteamcr.com",     role: "CSE" },
  { name: "María Sánchez",        email: "msanchez@smarteamcr.com",    role: "CSE" },
];

async function main() {
  for (const member of TEAM) {
    const result = await prisma.teamMember.upsert({
      where: { email: member.email },
      update: { name: member.name, role: member.role },
      create: member,
    });
    console.log(`✓ ${result.name} <${result.email}>`);
  }
  console.log("\nEquipo sembrado correctamente.");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
