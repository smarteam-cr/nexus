/**
 * scripts/copiar-personas-de-la-empresa.ts — la carga de las personas de cada empresa (R6, 2026-10-25).
 *
 * Une, por empresa, sus contactos de HubSpot, las personas de sus cuestionarios y los participantes de sus reuniones (por
 * el chokepoint de sesiones) en una persona por correo (`PersonaDeLaEmpresa`), con la regla de
 * lib/clients/personas-de-la-empresa.ts. No toca el rol. No borra: la que ya no sale de ninguna fuente queda de baja.
 *
 * SIMULACRO por defecto: dice, por empresa, cuántas se crearían, cuántas cambian y cuántas quedan de baja. Solo lee
 * HubSpot a través de su copia (no llama a HubSpot). Se puede correr dos veces.
 *
 * Antes: scripts/sql/2026-10-25-empresa-parte-2.sql aplicado y el deploy hecho.
 * Uso (PowerShell):
 *   npx tsx scripts/copiar-personas-de-la-empresa.ts                      # simulacro de clientes y prospectos
 *   npx tsx scripts/copiar-personas-de-la-empresa.ts --solo <clientId> --detalle
 *   $env:ALLOW_PROD_WRITE="1"; npx tsx scripts/copiar-personas-de-la-empresa.ts --apply; Remove-Item Env:ALLOW_PROD_WRITE
 */
import "dotenv/config";
import "./lib/permitir-server-only";
import { resolverApply } from "./lib/guard";
import { prisma } from "@/lib/db/prisma";
import { copiarPersonasDeLaEmpresa } from "@/lib/clients/personas-de-la-empresa-server";

const APPLY = resolverApply({ tablas: ["PersonaDeLaEmpresa"] });
const i = process.argv.indexOf("--solo");
const SOLO = i >= 0 ? process.argv[i + 1] : undefined;
const DETALLE = process.argv.includes("--detalle");

async function main() {
  const empresas = await prisma.client.findMany({
    where: SOLO ? { id: SOLO } : { kind: { in: ["CLIENTE", "PROSPECTO"] } },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
  let creadas = 0;
  let actualizadas = 0;
  let deBaja = 0;
  let total = 0;
  for (const e of empresas) {
    const r = await copiarPersonasDeLaEmpresa(e.id, { apply: APPLY });
    creadas += r.creadas;
    actualizadas += r.actualizadas;
    deBaja += r.deBaja;
    total += r.personas.length;
    if (r.creadas || r.actualizadas || r.deBaja) console.log(`${e.name}: ${r.personas.length} personas · ${r.creadas} nuevas · ${r.actualizadas} con cambios · ${r.deBaja} de baja`);
    if (DETALLE) for (const p of r.personas) console.log(`   ${p.correo} · ${p.nombre ?? "sin nombre"} · ${p.origenes.join("+")} · ${p.reuniones} reuniones`);
  }
  console.log(`\n${APPLY ? "APLICADO" : "SIMULACRO"}: ${empresas.length} empresas · ${total} personas · ${creadas} nuevas · ${actualizadas} con cambios · ${deBaja} de baja.`);
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
