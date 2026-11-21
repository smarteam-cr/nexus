/**
 * scripts/seed-trivia-ejemplo.ts — siembra en la base LOCAL la trivia de ejemplo «Ejemplo · Implementación de HubSpot»
 * (10 preguntas, scripts/lib/trivia-de-ejemplo.ts), lista para lanzar desde /trivia en el 3005.
 *
 * Por el mismo camino que la pantalla: la valida TriviaInput (el schema de POST /api/trivia) y la escriben
 * crearTrivia / guardarTrivia (lib/trivias/mutations.ts). Queda a nombre de la persona de `--para`: una trivia la ve
 * y la lanza solo quien la creó.
 *
 * ⛔ Solo contra la base local (assertLocalWriteOnly): ni ALLOW_PROD_WRITE lo destraba. Por eso escribe sin pedir
 * confirmación, como scripts/seed-fixture.ts: el destino solo puede ser la base local.
 * Idempotente: si esa persona ya tiene una trivia con ese título, se reemplazan sus preguntas (las partidas jugadas
 * guardan su copia); correrlo dos veces deja una sola trivia.
 *
 * Uso (PowerShell):
 *   $env:DATABASE_URL="postgresql://postgres:postgres@localhost:5433/nexus_local"; npx tsx scripts/seed-trivia-ejemplo.ts --para <correo>; Remove-Item Env:DATABASE_URL
 */
import "dotenv/config";
import "./lib/permitir-server-only";
import { assertLocalWriteOnly } from "./lib/guard";
import { prisma } from "@/lib/db/prisma";
import { TriviaInput } from "@/lib/trivias/schema";
import { crearTrivia, guardarTrivia } from "@/lib/trivias/mutations";
import { PREGUNTAS_DE_EJEMPLO, TITULO_DE_EJEMPLO, triviaDeEjemplo } from "./lib/trivia-de-ejemplo";

assertLocalWriteOnly(process.env.DATABASE_URL, "seed-trivia-ejemplo");

function argumento(nombre: string): string | null {
  const i = process.argv.indexOf(nombre);
  return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--") ? process.argv[i + 1] : null;
}

async function main() {
  const correo = argumento("--para")?.trim().toLowerCase();
  if (!correo) {
    console.error("Falta --para <correo>: la trivia queda a nombre de esa persona (solo ella la ve y la lanza).");
    process.exit(1);
  }
  const persona = await prisma.teamMember.findFirst({
    where: { email: { equals: correo, mode: "insensitive" }, deactivatedAt: null },
    select: { id: true, name: true },
  });
  if (!persona) {
    console.error(`No hay una persona activa del equipo con el correo ${correo} en la base local.`);
    console.error("Si falta el equipo real: npm run db:local -- acceso");
    process.exit(1);
  }

  const datos = TriviaInput.parse(triviaDeEjemplo());
  const ya = await prisma.trivia.findFirst({
    where: { creadaPorId: persona.id, titulo: TITULO_DE_EJEMPLO },
    select: { id: true },
  });

  console.log(`\n«${TITULO_DE_EJEMPLO}» para ${persona.name}: ${ya ? "ya existe, se reemplazan sus preguntas" : "se crea"}.\n`);
  datos.preguntas.forEach((p, i) => {
    const q = PREGUNTAS_DE_EJEMPLO[i];
    const correcta = p.correctas.map((c) => p.opciones[c]).join(", ");
    console.log(`${String(i + 1).padStart(2)}. [${q.tema} · ${q.dificultad} · ${p.segundos} s] ${p.texto}`);
    console.log(`    → ${correcta}`);
  });

  const id = ya ? (await guardarTrivia(ya.id, datos, persona.id), ya.id) : (await crearTrivia(datos, persona.id)).id;
  console.log(`\n✓ Lista: http://localhost:3005/trivia/${id}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
