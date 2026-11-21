/**
 * scripts/seed-trivia-ejemplo.ts — siembra las trivias de ejemplo (scripts/lib/trivia-de-ejemplo.ts) a nombre de una
 * persona del equipo: «Ejemplo · Implementación de HubSpot», «Good Strategy / Bad Strategy» y «Cómo funciona Nexus».
 *
 * Por el mismo camino que la pantalla: las valida TriviaInput (el schema de POST /api/trivia) y las escriben
 * crearTrivia / guardarTrivia (lib/trivias/mutations.ts). Quedan a nombre de la persona de `--para`, buscada por su
 * correo en la base: una trivia la ve y la lanza solo quien la creó.
 *
 * Dos destinos, el que diga DATABASE_URL:
 * · Base LOCAL (localhost): escribe sin más, como scripts/seed-fixture.ts.
 * · Producción: DRY-RUN por defecto (solo lee y muestra qué haría). Escribe con `--apply` + `ALLOW_PROD_WRITE=1`, y el
 *   guard respalda antes "Trivia" y "PreguntaDeTrivia" (necesita pg_dump en el PATH; sin él aborta, salvo
 *   SIN_RESPALDO=1).
 *
 * Idempotente por título y persona: si ya tiene una trivia con ese título y las mismas preguntas, no hace nada; si las
 * preguntas son otras (alguien la editó en la pantalla), la deja como está y lo dice. `--reemplazar` la pisa con la
 * versión de este archivo (las partidas ya jugadas guardan su copia).
 *
 * Uso (PowerShell):
 *   Local:      $env:DATABASE_URL="postgresql://postgres:postgres@localhost:5433/nexus_local"; npx tsx scripts/seed-trivia-ejemplo.ts --para <correo>; Remove-Item Env:DATABASE_URL
 *   Prod, ver:  npx tsx scripts/seed-trivia-ejemplo.ts --para <correo>
 *   Prod, hacer: $env:ALLOW_PROD_WRITE="1"; npx tsx scripts/seed-trivia-ejemplo.ts --para <correo> --apply; Remove-Item Env:ALLOW_PROD_WRITE
 */
import "dotenv/config";
import "./lib/permitir-server-only";
import { describirDestino, esBaseLocal, resolverApply } from "./lib/guard";
import { prisma } from "@/lib/db/prisma";
import { TriviaInput } from "@/lib/trivias/schema";
import { crearTrivia, guardarTrivia } from "@/lib/trivias/mutations";
import type { PreguntaDeTrivia, TipoDePregunta } from "@/lib/trivias/tipos";
import { TRIVIAS_DE_EJEMPLO, comoLaMandaLaPantalla } from "./lib/trivia-de-ejemplo";

const LOCAL = esBaseLocal(process.env.DATABASE_URL);
console.error(`[db] destino: ${describirDestino(process.env.DATABASE_URL)} (${LOCAL ? "local ✓" : "PRODUCCIÓN"})`);
// En producción, el guard de siempre: sin --apply no se escribe; con --apply exige ALLOW_PROD_WRITE=1 y respalda.
const ESCRIBE = LOCAL ? true : resolverApply({ tablas: ["Trivia", "PreguntaDeTrivia"] });
const REEMPLAZAR = process.argv.includes("--reemplazar");

function argumento(nombre: string): string | null {
  const i = process.argv.indexOf(nombre);
  return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--") ? process.argv[i + 1] : null;
}

/** Las preguntas comparables (la base devuelve las mismas llaves que el schema). */
function huella(preguntas: PreguntaDeTrivia[]): string {
  return JSON.stringify(preguntas.map(({ tipo, texto, opciones, correctas, segundos }) => [tipo, texto, opciones, correctas, segundos]));
}

async function main() {
  const correo = argumento("--para")?.trim().toLowerCase();
  if (!correo) {
    console.error("Falta --para <correo>: las trivias quedan a nombre de esa persona (solo ella las ve y las lanza).");
    process.exit(1);
  }
  const persona = await prisma.teamMember.findFirst({
    where: { email: { equals: correo, mode: "insensitive" }, deactivatedAt: null },
    select: { id: true, name: true },
  });
  if (!persona) {
    console.error(`No hay una persona activa del equipo con el correo ${correo} en esta base.`);
    if (LOCAL) console.error("Si falta el equipo real en la local: npm run db:local -- acceso");
    process.exit(1);
  }
  console.log(`\nA nombre de: ${persona.name}`);

  const resumen: string[] = [];
  for (const ejemplo of TRIVIAS_DE_EJEMPLO) {
    const datos = TriviaInput.parse(comoLaMandaLaPantalla(ejemplo));
    const ya = await prisma.trivia.findFirst({
      where: { creadaPorId: persona.id, titulo: datos.titulo },
      select: {
        id: true,
        preguntas: {
          orderBy: { orden: "asc" },
          select: { tipo: true, texto: true, opciones: true, correctas: true, segundos: true },
        },
      },
    });
    const igual = ya !== null && huella(ya.preguntas.map((p) => ({ ...p, tipo: p.tipo as TipoDePregunta }))) === huella(datos.preguntas);
    const plan = !ya
      ? "se crea"
      : igual
        ? "ya está, con las mismas preguntas: no se toca"
        : REEMPLAZAR
          ? "ya existe con otras preguntas: se reemplazan (--reemplazar)"
          : "ya existe con otras preguntas: se deja como está (para pisarla, --reemplazar)";

    console.log(`\n«${datos.titulo}» — ${plan}.`);
    datos.preguntas.forEach((p, i) => {
      const q = ejemplo.preguntas[i];
      const correcta = p.correctas.map((c) => p.opciones[c]).join(", ");
      console.log(`${String(i + 1).padStart(2)}. [${q.tema} · ${q.dificultad} · ${p.segundos} s] ${p.texto}`);
      console.log(`    → ${correcta}`);
    });

    if (!ESCRIBE) {
      resumen.push(`«${datos.titulo}»: ${plan}`);
      continue;
    }
    if (!ya) {
      const { id } = await crearTrivia(datos, persona.id);
      resumen.push(`«${datos.titulo}»: creada (${id})`);
    } else if (!igual && REEMPLAZAR) {
      await guardarTrivia(ya.id, datos, persona.id);
      resumen.push(`«${datos.titulo}»: preguntas reemplazadas (${ya.id})`);
    } else {
      resumen.push(`«${datos.titulo}»: sin cambios (${ya.id})`);
    }
  }

  console.log(`\n${ESCRIBE ? "Hecho" : "Dry-run, no se escribió nada (para escribir: --apply con ALLOW_PROD_WRITE=1)"}:`);
  for (const r of resumen) console.log(`  · ${r}`);
  console.log(`Dónde: ${LOCAL ? "http://localhost:3005" : "Nexus"} › Trivias › «Tus trivias».`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
