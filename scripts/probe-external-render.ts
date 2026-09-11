/**
 * scripts/probe-external-render.ts  (READ-ONLY)
 *
 * Reproduce lo que ve el cliente: con la credencial real en la cookie (lo que suma
 * /external/verify-access tras la contraseña), pega a la dirección DEL PROYECTO del kickoff y del
 * cronograma y reporta cuál renderiza contenido y cuál da "Acceso no disponible". Así separamos
 * "link equivocado / superficie sin publicar" de un bug de render.
 *
 * También pega a la dirección VIEJA sin proyecto (/external/cronograma): desde el 2026-09-10 tiene
 * que ofrecer elegir el proyecto y NUNCA pintar contenido.
 *
 * Uso: npx tsx scripts/probe-external-render.ts "Spectrum - MKT + SALES"
 */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import "dotenv/config";
import { armarCredencial } from "@/lib/external/credencial";
import { COOKIE_DE_ACCESOS, sumarALaListaDeAccesos } from "@/lib/external/lista-de-accesos";

const pool = new Pool({ connectionString: process.env.DATABASE_URL!, ssl: { rejectUnauthorized: false } });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

const BASE = "http://localhost:3004";

function classify(html: string): string {
  const text = html.replace(/<[^>]+>/g, " ");
  const noAccess = /no está disponible|Acceso no disponible|expiró/i.test(text);
  const elegir = /De qué proyecto quieres ver/i.test(text);
  const kickoff = /Arranquemos juntos|Kickoff del proyecto/i.test(text);
  const crono = /Cronograma de proyecto|Arrancamos el|preparando el cronograma/i.test(text);
  if (noAccess) return "❌ NoAccess (no disponible)";
  if (elegir) return "↪ Elegir proyecto (dirección sin proyecto)";
  if (crono) return "✅ Render cronograma";
  if (kickoff) return "✅ Render kickoff";
  return "¿? (ni NoAccess ni landing reconocido)";
}

async function main() {
  const term = process.argv[2] ?? "Spectrum - MKT + SALES";
  const project = await prisma.project.findFirst({
    where: { name: { contains: term, mode: "insensitive" } },
    select: {
      name: true,
      kickoffPublishedAt: true,
      timelinePublishedAt: true,
      externalAccess: { select: { id: true, accessToken: true, revokedAt: true, passwordHash: true } },
    },
  });
  if (!project) { console.log(`(sin proyecto para "${term}")`); return; }
  const acc = project.externalAccess;
  console.log(`▸ ${project.name}`);
  console.log(`  kickoffPublishedAt:  ${project.kickoffPublishedAt ? "publicado" : "NO publicado"}`);
  console.log(`  timelinePublishedAt: ${project.timelinePublishedAt ? "publicado" : "NO publicado"}`);
  if (!acc) { console.log("  (sin acceso externo)"); return; }
  if (acc.revokedAt) { console.log("  (acceso revocado)"); return; }
  const token = acc.accessToken;
  console.log(`  token: ${token.slice(0, 8)}…${token.slice(-4)}\n`);

  /* La cookie es la LISTA de proyectos abiertos (lib/external/lista-de-accesos.ts), y cada entrada
     es `<token>.<versión>` (A-11). Con cualquier otro formato este script reportaría «sin acceso»
     para toda vista externa y el diagnóstico mentiría justo cuando se lo necesita. */
  const cookie = `${COOKIE_DE_ACCESOS}=${sumarALaListaDeAccesos(undefined, armarCredencial(token, acc.passwordHash), Date.now())}`;
  for (const path of [`/external/kickoff/${acc.id}`, `/external/cronograma/${acc.id}`, "/external/cronograma"]) {
    const res = await fetch(`${BASE}${path}`, { headers: { Cookie: cookie } });
    const html = await res.text();
    console.log(`  ${path}  →  HTTP ${res.status}  ${classify(html)}`);
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); await pool.end(); });
