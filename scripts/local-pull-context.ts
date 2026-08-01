/**
 * scripts/local-pull-context.ts — copia contexto REAL de un cliente a la base local (F3+, 2026-08-01).
 *
 * Por qué existe: el fixture ficticio (`seed-fixture.ts`) prueba que la plomería funciona,
 * pero NO sirve para validar si un agente entendió bien una conversación real — eso exige
 * comparar contra un transcript de verdad y a alguien que estuvo en la llamada. Este script
 * copia, de PRODUCCIÓN (solo LECTURA) a la base LOCAL, el contexto real de UN cliente: sus
 * proyectos, las sesiones con transcript, los links sesión↔proyecto, y el equipo INTERNO de
 * Smarteam (para que "¿hay Ventas en la sala?" — lib/handoff/session-relevance.ts — se
 * comporte igual en local que en prod, y para que puedas loguearte con tu cuenta real en un
 * Nexus apuntando a la base local).
 *
 * ⛔ El DESTINO es SIEMPRE la base local — hardcodeado, nunca sale de `DATABASE_URL` — y
 * pasa por el mismo candado sin excepción que `seed-fixture.ts` (assertLocalWriteOnly).
 * La FUENTE es prod: LEER no está gateado por el guard (ver doctrina en guard.ts) — pero
 * este script además exige que la fuente SEA prod (si no, algo está mal configurado y
 * copiar "prod→prod" o "local→local" no tiene sentido para su propósito).
 *
 * Alcance v1 (deliberadamente acotado): Client, Project, FirefliesSession (CON transcript),
 * SessionProject, y el roster INTERNO completo (TeamMember + AppUser kind=INTERNAL — es
 * chico, ~16 personas, y sin él ni la clasificación de sesiones ni el login local funcionan).
 * NO copia: Cobranza, Timeline, Canvas/CanvasBlock existentes, AppUser EXTERNAL. La
 * generación (Handoff/Kickoff) crea sus propios canvases al correr — no hace falta traer
 * los de prod para probar que el agente los arma bien.
 *
 * IDEMPOTENTE: usa los mismos ids reales de prod (upsert) — correr de nuevo refresca el
 * contenido, no duplica nada.
 *
 * Uso:
 *   npx tsx scripts/local-pull-context.ts --client "nombre o parte del nombre"   # dry-run
 *   npx tsx scripts/local-pull-context.ts --client "..." --project <id> --apply  # escribe
 *   npm run db:local:pull -- --client "..."                                     # atajo
 */
import "dotenv/config";
import type { Prisma } from "@prisma/client";
import { assertLocalWriteOnly, describirDestino, esHostProduccion } from "./lib/guard";
import { createScriptDbFor } from "./lib/db";
import { copiarRosterInterno } from "./lib/roster";

// Prisma tipa las columnas Json? como `JsonValue` (incluye `null`) al LEER, pero exige el
// sentinel `Prisma.JsonNull` al ESCRIBIR — fricción conocida de su generador, no un bug real:
// acá se copia la fila 1:1 entre dos clientes del MISMO schema, el valor siempre es válido
// en runtime. Un solo cast documentado en vez de sentinels campo por campo en 5 modelos.
const asInput = <T>(row: object): T => row as unknown as T;

const URL_LOCAL = "postgresql://postgres:postgres@localhost:5433/nexus_local";

function leerArg(nombre: string): string | undefined {
  const idx = process.argv.indexOf(`--${nombre}`);
  return idx >= 0 ? process.argv[idx + 1] : undefined;
}

async function main() {
  const clienteQuery = leerArg("client");
  const projectId = leerArg("project");
  const apply = process.argv.includes("--apply");

  if (!clienteQuery) {
    console.error("Uso: npx tsx scripts/local-pull-context.ts --client \"nombre del cliente\" [--project <id>] [--apply]");
    process.exit(1);
  }

  // La fuente debe ser prod — leer de "local" o de otra cosa no cumple el propósito del script.
  const urlFuente = process.env.DATABASE_URL;
  if (!urlFuente || !esHostProduccion(urlFuente)) {
    console.error(`⛔ La FUENTE debe ser producción. DATABASE_URL actual: ${describirDestino(urlFuente)}`);
    console.error("   Corré este script con tu .env normal (el que hoy apunta a prod).");
    process.exit(1);
  }
  // El destino es SIEMPRE local, sin excepción — mismo candado que seed-fixture.ts.
  assertLocalWriteOnly(URL_LOCAL, "local-pull-context (destino)");

  const origen = createScriptDbFor(urlFuente, "origen (prod, solo lectura)");
  const destino = createScriptDbFor(URL_LOCAL, "destino (local)");

  try {
    const clientes = await origen.prisma.client.findMany({
      where: { name: { contains: clienteQuery, mode: "insensitive" } },
    });

    if (clientes.length === 0) {
      console.error(`No encontré ningún cliente cuyo nombre contenga "${clienteQuery}".`);
      process.exit(1);
    }
    if (clientes.length > 1) {
      console.error(`"${clienteQuery}" matchea ${clientes.length} clientes — sé más específico:`);
      for (const c of clientes) console.error(`  - ${c.name}  (id: ${c.id})`);
      process.exit(1);
    }
    const cliente = clientes[0];

    const proyectos = await origen.prisma.project.findMany({
      where: projectId ? { id: projectId, clientId: cliente.id } : { clientId: cliente.id },
    });
    if (proyectos.length === 0) {
      console.error(projectId ? `El proyecto ${projectId} no existe o no es de "${cliente.name}".` : `"${cliente.name}" no tiene proyectos.`);
      process.exit(1);
    }

    const sessionProjects = await origen.prisma.sessionProject.findMany({
      where: { projectId: { in: proyectos.map((p) => p.id) } },
    });
    const sessionIds = [...new Set(sessionProjects.map((sp) => sp.sessionId))];
    const sesiones = sessionIds.length
      ? await origen.prisma.firefliesSession.findMany({ where: { id: { in: sessionIds } } })
      : [];

    // Emails que aparecieron en esas sesiones — solo informativo en el resumen; el roster
    // interno se copia COMPLETO igual (ver comentario del header: es chico y habilita login).
    const emailsEnSesiones = new Set<string>();
    for (const s of sesiones) {
      for (const p of s.participants) emailsEnSesiones.add(p.toLowerCase());
      if (s.organizerEmail) emailsEnSesiones.add(s.organizerEmail.toLowerCase());
    }

    const equipoInterno = await origen.prisma.teamMember.findMany({});

    console.log(`\nCliente: ${cliente.name}`);
    console.log(`Proyectos (${proyectos.length}): ${proyectos.map((p) => p.name).join(", ")}`);
    console.log(`Sesiones con transcript: ${sesiones.length} (${sesiones.filter((s) => s.transcript).length} con contenido)`);
    console.log(`Links sesión↔proyecto: ${sessionProjects.length}`);
    console.log(`Equipo interno de Smarteam a copiar: ${equipoInterno.length} personas (roster completo, para que el filtro "Ventas en la sala" y tu login funcionen igual que en prod)`);
    console.log(`  de las cuales aparecen como participantes de estas sesiones: ${[...emailsEnSesiones].filter((e) => equipoInterno.some((m) => m.email.toLowerCase() === e)).length}`);

    if (!apply) {
      console.log("\nDry-run — nada se escribió. Agregá --apply para copiar esto a nexus_local.");
      return;
    }

    console.log("\nEscribiendo en local…");

    // El roster interno (TeamMember + AppUser INTERNAL) va por el helper compartido:
    // es exactamente lo mismo que hace `npm run db:local -- acceso`.
    await copiarRosterInterno(origen.prisma, destino.prisma);

    await destino.prisma.client.upsert({
      where: { id: cliente.id },
      create: asInput<Prisma.ClientUncheckedCreateInput>(cliente),
      update: asInput<Prisma.ClientUncheckedUpdateInput>(cliente),
    });
    for (const p of proyectos) {
      await destino.prisma.project.upsert({
        where: { id: p.id },
        create: asInput<Prisma.ProjectUncheckedCreateInput>(p),
        update: asInput<Prisma.ProjectUncheckedUpdateInput>(p),
      });
    }
    for (const s of sesiones) {
      await destino.prisma.firefliesSession.upsert({
        where: { id: s.id },
        create: asInput<Prisma.FirefliesSessionUncheckedCreateInput>(s),
        update: asInput<Prisma.FirefliesSessionUncheckedUpdateInput>(s),
      });
    }
    for (const sp of sessionProjects) {
      await destino.prisma.sessionProject.upsert({
        where: { id: sp.id },
        create: asInput<Prisma.SessionProjectUncheckedCreateInput>(sp),
        update: asInput<Prisma.SessionProjectUncheckedUpdateInput>(sp),
      });
    }

    console.log(`✓ Copiado. Corré tu Nexus apuntando a la local para probar:`);
    console.log(`  DATABASE_URL="${URL_LOCAL}" npm run dev`);
  } finally {
    await origen.close();
    await destino.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
