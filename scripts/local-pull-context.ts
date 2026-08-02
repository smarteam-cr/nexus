/**
 * scripts/local-pull-context.ts — copia contexto REAL de clientes a la base local (F3+, 2026-08-01).
 *
 * Por qué existe: el fixture ficticio (`seed-fixture.ts`) prueba que la plomería funciona,
 * pero NO sirve para validar si un agente entendió bien una conversación real — eso exige
 * comparar contra un transcript de verdad y a alguien que estuvo en la llamada. Este script
 * copia, de PRODUCCIÓN (solo LECTURA) a la base LOCAL, el contexto real de uno o VARIOS
 * clientes: sus proyectos, las sesiones con transcript, los links sesión↔proyecto, y el
 * equipo INTERNO de Smarteam (para que "¿hay Ventas en la sala?" —
 * lib/handoff/session-relevance.ts — se comporte igual en local que en prod, y para que
 * puedas loguearte con tu cuenta real en un Nexus apuntando a la base local).
 *
 * ⛔ El DESTINO es SIEMPRE la base local — hardcodeado, nunca sale de `DATABASE_URL` — y
 * pasa por el mismo candado sin excepción que `seed-fixture.ts` (assertLocalWriteOnly).
 * La FUENTE es prod: LEER no está gateado por el guard (ver doctrina en guard.ts) — pero
 * este script además exige que la fuente SEA prod (si no, algo está mal configurado y
 * copiar "prod→prod" o "local→local" no tiene sentido para su propósito).
 *
 * Alcance (deliberadamente acotado): Client, Project, FirefliesSession (CON transcript),
 * SessionProject, y el roster INTERNO completo (TeamMember + AppUser kind=INTERNAL — es
 * chico, ~16 personas, y sin él ni la clasificación de sesiones ni el login local funcionan).
 * NO copia: Cobranza, Timeline, Canvas/CanvasBlock existentes, AppUser EXTERNAL. La
 * generación (Handoff/Kickoff) crea sus propios canvases al correr — no hace falta traer
 * los de prod para probar que el agente los arma bien.
 *
 * IDEMPOTENTE: usa los mismos ids reales de prod (upsert) — correr de nuevo refresca el
 * contenido, no duplica nada. Y es ACUMULATIVO: traer un cliente no borra los anteriores,
 * así el ambiente local se va armando cliente a cliente (`db:local -- reset` lo vacía).
 *
 * Sobre el volumen (medido el 2026-08-01 contra prod): ~22 sesiones por cliente y ~31 kB
 * por transcript ⇒ 10 clientes ≈ 7 MB. Por eso NO hay tope de sesiones por cliente: al
 * tamaño real de esta base, capar sería complejidad sin beneficio.
 *
 * Uso:
 *   npm run db:local:pull -- --client "Wherex"                      # dry-run, 1 cliente
 *   npm run db:local:pull -- --client "Wherex,DISTELSA,Honda"       # varios, por nombre
 *   npm run db:local:pull -- --recientes 10                         # los 10 más activos
 *   npm run db:local:pull -- --recientes 10 --apply                 # …y escribirlo
 *   npm run db:local:pull -- --client "Wherex" --project <id>       # acotar a un proyecto
 */
import "dotenv/config";
import type {
  Client,
  FirefliesSession,
  Prisma,
  PrismaClient,
  Project,
  SessionProject,
} from "@prisma/client";
import { assertLocalWriteOnly, describirDestino, esHostProduccion } from "./lib/guard";
import { createScriptDbFor } from "./lib/db";
import { copiarRosterInterno } from "./lib/roster";

// Prisma tipa las columnas Json? como `JsonValue` (incluye `null`) al LEER, pero exige el
// sentinel `Prisma.JsonNull` al ESCRIBIR — fricción conocida de su generador, no un bug real:
// acá se copia la fila 1:1 entre dos clientes del MISMO schema, el valor siempre es válido
// en runtime. Un solo cast documentado en vez de sentinels campo por campo en 5 modelos.
const asInput = <T>(row: object): T => row as unknown as T;

const URL_LOCAL = "postgresql://postgres:postgres@localhost:5433/nexus_local";

const USO = [
  "Uso:",
  '  npx tsx scripts/local-pull-context.ts --client "nombre"              # uno',
  '  npx tsx scripts/local-pull-context.ts --client "uno,otro,tercero"    # varios',
  "  npx tsx scripts/local-pull-context.ts --recientes 10                 # los N más activos",
  "  …agregá --apply para escribir (por default es dry-run).",
  "  --project <id> solo vale con UN cliente.",
].join("\n");

function leerArg(nombre: string): string | undefined {
  const idx = process.argv.indexOf(`--${nombre}`);
  return idx >= 0 ? process.argv[idx + 1] : undefined;
}

/** Lo que se copia de UN cliente — se arma completo antes de escribir nada. */
type Plan = {
  cliente: Client;
  proyectos: Project[];
  sesiones: FirefliesSession[];
  sessionProjects: SessionProject[];
};

/**
 * Resuelve los nombres pedidos contra prod. Acumula TODOS los problemas antes de abortar:
 * en un pull de 8 clientes, enterarse de a un error por corrida es inaceptable.
 */
async function resolverPorNombre(prisma: PrismaClient, nombres: string[]): Promise<Client[]> {
  const encontrados: Client[] = [];
  const problemas: string[] = [];

  for (const nombre of nombres) {
    const matches = await prisma.client.findMany({
      where: { name: { contains: nombre, mode: "insensitive" } },
    });
    if (matches.length === 0) {
      problemas.push(`  ✗ "${nombre}" — ningún cliente contiene ese texto.`);
    } else if (matches.length > 1) {
      problemas.push(
        `  ✗ "${nombre}" — matchea ${matches.length}; sé más específico:\n` +
          matches.map((c) => `      · ${c.name}`).join("\n"),
      );
    } else {
      encontrados.push(matches[0]);
    }
  }

  if (problemas.length) {
    console.error(`\nNo pude resolver ${problemas.length} de ${nombres.length} nombres:`);
    console.error(problemas.join("\n"));
    process.exit(1);
  }
  return encontrados;
}

/**
 * Los N clientes de CARTERA con la sesión más reciente — "armame un ambiente parecido al
 * real sin que tenga que nombrarlos uno por uno". Ordena por última sesión y no por
 * cantidad: un cliente con 80 sesiones de hace un año no sirve para probar lo de hoy.
 */
async function clientesRecientes(prisma: PrismaClient, n: number): Promise<string[]> {
  const filas = await prisma.$queryRaw<{ clientId: string }[]>`
    SELECT p."clientId" AS "clientId", MAX(f."date") AS ultima
    FROM "SessionProject" sp
    JOIN "Project" p ON p.id = sp."projectId"
    JOIN "FirefliesSession" f ON f.id = sp."sessionId"
    JOIN "Client" c ON c.id = p."clientId"
    WHERE c.kind = 'CLIENTE'
    GROUP BY p."clientId"
    ORDER BY ultima DESC
    LIMIT ${n}
  `;
  return filas.map((f) => f.clientId);
}

async function main() {
  const clienteQuery = leerArg("client");
  const recientesRaw = leerArg("recientes");
  const projectId = leerArg("project");
  const apply = process.argv.includes("--apply");

  if (!clienteQuery && !recientesRaw) {
    console.error(USO);
    process.exit(1);
  }

  const nombres = (clienteQuery ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const recientes = recientesRaw ? Number(recientesRaw) : 0;
  if (recientesRaw && (!Number.isInteger(recientes) || recientes < 1)) {
    console.error(`⛔ --recientes espera un entero ≥ 1 (recibí "${recientesRaw}").`);
    process.exit(1);
  }
  // `--project` acota DENTRO de un cliente: con varios no se sabe de cuál es ese id.
  if (projectId && (nombres.length > 1 || recientes)) {
    console.error("⛔ --project solo vale con UN cliente (--client \"nombre\").");
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
    // ── 1. Qué clientes ────────────────────────────────────────────────────────
    const porNombre = nombres.length ? await resolverPorNombre(origen.prisma, nombres) : [];
    const idsRecientes = recientes ? await clientesRecientes(origen.prisma, recientes) : [];
    const porActividad = idsRecientes.length
      ? await origen.prisma.client.findMany({ where: { id: { in: idsRecientes } } })
      : [];

    // Unión sin duplicados: pedir "--recientes 5 --client Wherex" cuando Wherex ya está
    // entre los 5 no lo copia dos veces.
    const clientes = [...porNombre, ...porActividad].filter(
      (c, i, arr) => arr.findIndex((o) => o.id === c.id) === i,
    );
    if (clientes.length === 0) {
      console.error("No hay clientes que copiar (¿ninguno tiene sesiones vinculadas?).");
      process.exit(1);
    }

    // ── 2. Qué se lleva cada uno ───────────────────────────────────────────────
    const planes: Plan[] = [];
    const sinProyectos: string[] = [];

    for (const cliente of clientes) {
      const proyectos = await origen.prisma.project.findMany({
        where: projectId ? { id: projectId, clientId: cliente.id } : { clientId: cliente.id },
      });
      if (proyectos.length === 0) {
        // Con UN cliente pedido a dedo es un error (pediste algo que no se puede traer);
        // en un lote es ruido esperable — se informa y el resto sigue.
        if (clientes.length === 1) {
          console.error(
            projectId
              ? `El proyecto ${projectId} no existe o no es de "${cliente.name}".`
              : `"${cliente.name}" no tiene proyectos.`,
          );
          process.exit(1);
        }
        sinProyectos.push(cliente.name);
        continue;
      }

      const sessionProjects = await origen.prisma.sessionProject.findMany({
        where: { projectId: { in: proyectos.map((p) => p.id) } },
      });
      const sessionIds = [...new Set(sessionProjects.map((sp) => sp.sessionId))];
      const sesiones = sessionIds.length
        ? await origen.prisma.firefliesSession.findMany({ where: { id: { in: sessionIds } } })
        : [];

      planes.push({ cliente, proyectos, sesiones, sessionProjects });
    }

    if (planes.length === 0) {
      console.error("Ninguno de los clientes pedidos tiene proyectos — no hay nada que copiar.");
      process.exit(1);
    }

    const equipoInterno = await origen.prisma.teamMember.findMany({});

    // ── 3. Resumen ─────────────────────────────────────────────────────────────
    console.log(`\nClientes a copiar: ${planes.length}`);
    for (const p of planes) {
      const conTexto = p.sesiones.filter((s) => s.transcript).length;
      console.log(
        `  · ${p.cliente.name} — ${p.proyectos.length} proyecto(s), ` +
          `${p.sesiones.length} sesión(es) (${conTexto} con transcript), ` +
          `${p.sessionProjects.length} link(s)`,
      );
    }
    if (sinProyectos.length) {
      console.log(`\nSin proyectos (se saltan): ${sinProyectos.join(", ")}`);
    }

    const totalSesiones = new Set(planes.flatMap((p) => p.sesiones.map((s) => s.id))).size;
    const pesoKb = Math.round(
      planes.flatMap((p) => p.sesiones).reduce((acc, s) => acc + (s.transcript?.length ?? 0), 0) / 1024,
    );
    console.log(`\nTotal: ${totalSesiones} sesiones únicas · ~${pesoKb} kB de transcripts`);
    console.log(
      `Equipo interno de Smarteam: ${equipoInterno.length} personas (roster completo — es lo que ` +
        `hace que el filtro "Ventas en la sala" y tu login funcionen igual que en prod)`,
    );

    if (!apply) {
      console.log("\nDry-run — nada se escribió. Agregá --apply para copiar esto a nexus_local.");
      return;
    }

    // ── 4. Escritura ───────────────────────────────────────────────────────────
    console.log("\nEscribiendo en local…");

    // El roster interno (TeamMember + AppUser INTERNAL) va por el helper compartido:
    // es exactamente lo mismo que hace `npm run db:local -- acceso`. UNA sola vez para
    // todo el lote — no depende de qué clientes se traigan.
    await copiarRosterInterno(origen.prisma, destino.prisma);

    // Las sesiones se deduplican a nivel LOTE: una misma sesión puede estar linkeada a
    // proyectos de dos clientes distintos (eso es justamente lo que INV1 vigila en prod)
    // y sin esto se escribiría dos veces.
    const sesionesEscritas = new Set<string>();

    for (const plan of planes) {
      await destino.prisma.client.upsert({
        where: { id: plan.cliente.id },
        create: asInput<Prisma.ClientUncheckedCreateInput>(plan.cliente),
        update: asInput<Prisma.ClientUncheckedUpdateInput>(plan.cliente),
      });
      for (const p of plan.proyectos) {
        await destino.prisma.project.upsert({
          where: { id: p.id },
          create: asInput<Prisma.ProjectUncheckedCreateInput>(p),
          update: asInput<Prisma.ProjectUncheckedUpdateInput>(p),
        });
      }
      for (const s of plan.sesiones) {
        if (sesionesEscritas.has(s.id)) continue;
        sesionesEscritas.add(s.id);
        await destino.prisma.firefliesSession.upsert({
          where: { id: s.id },
          create: asInput<Prisma.FirefliesSessionUncheckedCreateInput>(s),
          update: asInput<Prisma.FirefliesSessionUncheckedUpdateInput>(s),
        });
      }
      for (const sp of plan.sessionProjects) {
        await destino.prisma.sessionProject.upsert({
          where: { id: sp.id },
          create: asInput<Prisma.SessionProjectUncheckedCreateInput>(sp),
          update: asInput<Prisma.SessionProjectUncheckedUpdateInput>(sp),
        });
      }
      console.log(`  ✓ ${plan.cliente.name}`);
    }

    console.log(`\n✓ Copiado. Arrancá tu Nexus local con:  npm run dev`);
  } finally {
    await origen.close();
    await destino.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
