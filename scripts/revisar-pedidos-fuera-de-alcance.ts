/**
 * scripts/revisar-pedidos-fuera-de-alcance.ts — revisa los pedidos fuera de alcance que quedaron mal
 * ubicados (Memoria de la cuenta · Etapa 0, 2026-10-09; decisión 8: fuera de alcance es de un
 * proyecto, y nada cambia sin que una persona lo elija).
 *
 * Lista tres grupos:
 *   1. Pedidos SIN PROYECTO de un cliente (kind CLIENTE), agrupados por cliente: la reunión de la que
 *      salieron, los proyectos a los que esa reunión está vinculada (solo los vínculos incluidos y de
 *      ESE cliente, `belongsToClient`), los proyectos activos del cliente (sin «Información del
 *      cliente») y una propuesta: «asignar a X» si hay un solo candidato; si no, «lo ubica el CSE».
 *   2. Pedidos de una empresa que NO es cliente (prospecto, aliado, interno): propuesta «Descartar: es
 *      un prospecto y no hay nada vendido con qué comparar».
 *   3. Pedidos con un estado distinto de «Por revisar» que nadie decidió (`decididoAt` null): los
 *      escribió el modelo con el código viejo.
 *
 * SIMULACRO por defecto (solo lee). Cada flag aplica UN grupo, siempre por `cambiarSolicitud` (deja el
 * historial con quién y cuándo) y nunca confirma nada (así no sale ningún aviso):
 *   --asignar                solo los del grupo 1 con candidato único → ese proyecto
 *   --descartar-prospectos   los del grupo 2 → «Descartada», con la nota del porqué
 *   --reabrir-los-de-la-ia   los del grupo 3 → «Por revisar», con la nota de qué había marcado la IA
 * Con cualquier flag hace falta --firma <correo del equipo> (queda en el historial) y --apply; --apply
 * exige ALLOW_PROD_WRITE=1 (el guard) y respalda la tabla antes de escribir. Además deja un JSON con
 * cómo estaba cada pedido que cambia, en backups/<fecha>-revisar-pedidos-fuera-de-alcance/.
 *
 *   npx tsx scripts/revisar-pedidos-fuera-de-alcance.ts
 *   npx tsx scripts/revisar-pedidos-fuera-de-alcance.ts --asignar --firma tu@smarteamcr.com
 *   ALLOW_PROD_WRITE=1 npx tsx scripts/revisar-pedidos-fuera-de-alcance.ts --asignar --firma tu@smarteamcr.com --apply
 */
import "dotenv/config";
import "./lib/permitir-server-only";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { prisma } from "@/lib/db/prisma";
import { belongsToClient } from "@/lib/sessions/project-sources";
import { proyectoClasificableWhere } from "@/lib/projects/scope";
import { estadoDeSolicitud, urlDeSolicitudes, ROTULO_DE_SOLICITUD } from "@/lib/sessions/solicitudes-fuera-de-alcance";
import { cambiarSolicitud } from "@/lib/sessions/solicitudes-server";
import { describirDestino, resolverApply } from "./lib/guard";

const MAX_NOTA = 2000;

type Pedido = {
  id: string;
  clientId: string;
  projectId: string | null;
  sessionId: string | null;
  pedido: string;
  estado: string;
  nota: string | null;
  decididoAt: Date | null;
  client: { name: string; kind: string };
  session: { title: string; date: Date } | null;
};

type Propuesta = { pedido: Pedido; proyecto: { id: string; name: string } | null; porque: string };

function fecha(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** La nota nueva se SUMA a la que haya: lo que escribió el CSE no se pisa. */
function conNota(previa: string | null, nueva: string): string {
  return (previa?.trim() ? `${previa.trim()}\n— ${nueva}` : nueva).slice(0, MAX_NOTA);
}

async function main() {
  const asignar = process.argv.includes("--asignar");
  const descartarProspectos = process.argv.includes("--descartar-prospectos");
  const reabrir = process.argv.includes("--reabrir-los-de-la-ia");
  const algunFlag = asignar || descartarProspectos || reabrir;
  const i = process.argv.indexOf("--firma");
  const firma = i >= 0 ? (process.argv[i + 1] ?? "").trim().toLowerCase() : "";

  if (algunFlag && !firma.includes("@")) {
    console.error("⛔ Con --asignar, --descartar-prospectos o --reabrir-los-de-la-ia hace falta --firma <correo del equipo>.");
    process.exit(1);
  }
  if (firma) {
    const delEquipo = await prisma.teamMember.findFirst({
      where: { email: { equals: firma, mode: "insensitive" } },
      select: { id: true },
    });
    if (!delEquipo) {
      console.error(`⛔ «${firma}» no es un correo del equipo.`);
      process.exit(1);
    }
  }
  const apply = algunFlag ? resolverApply({ tablas: ["PedidoFueraDeAlcance"] }) : false;
  if (process.argv.includes("--apply") && !algunFlag) {
    console.error("⛔ --apply sin ningún flag no aplica nada: elige --asignar, --descartar-prospectos o --reabrir-los-de-la-ia.");
    process.exit(1);
  }
  console.log(
    `Base: ${describirDestino(process.env.DATABASE_URL)} · ${apply ? `APLICAR, a nombre de ${firma}` : "SIMULACRO (solo lee)"}\n`,
  );

  const pedidos: Pedido[] = await prisma.pedidoFueraDeAlcance.findMany({
    select: {
      id: true,
      clientId: true,
      projectId: true,
      sessionId: true,
      pedido: true,
      estado: true,
      nota: true,
      decididoAt: true,
      client: { select: { name: true, kind: true } },
      session: { select: { title: true, date: true } },
    },
    orderBy: [{ clientId: "asc" }, { createdAt: "asc" }],
  });

  // ── 1. Sin proyecto, de un cliente ──────────────────────────────────────────
  const sinProyecto = pedidos.filter((p) => p.projectId === null && p.client.kind === "CLIENTE");
  const propuestas: Propuesta[] = [];
  const porCliente = new Map<string, Pedido[]>();
  for (const p of sinProyecto) porCliente.set(p.clientId, [...(porCliente.get(p.clientId) ?? []), p]);

  console.log(`── 1. Pedidos sin proyecto de un cliente: ${sinProyecto.length}`);
  for (const [clientId, delCliente] of porCliente) {
    const activos = await prisma.project.findMany({
      where: proyectoClasificableWhere({ clientId }),
      select: { id: true, name: true },
      orderBy: { createdAt: "asc" },
    });
    const idsActivos = new Set(activos.map((a) => a.id));
    console.log(`\n· ${delCliente[0].client.name} — ${urlDeSolicitudes(clientId)}`);
    console.log(`  Proyectos activos: ${activos.length ? activos.map((a) => a.name).join(", ") : "ninguno"}`);
    for (const p of delCliente) {
      /* Los vínculos de su reunión: solo los incluidos (la X de una persona saca) y solo si la reunión
         es de ESTE cliente (invariante 1). Un vínculo a un proyecto inactivo no es candidato. */
      const vinculos = p.sessionId
        ? await prisma.sessionProject.findMany({
            where: { sessionId: p.sessionId, included: true, project: { clientId } },
            select: {
              project: { select: { id: true, name: true } },
              session: { select: { resolvedClientId: true, manualClientId: true } },
            },
          })
        : [];
      const vinculados = vinculos
        .filter((v) => belongsToClient(v.session, clientId))
        .map((v) => v.project)
        .filter((proj) => idsActivos.has(proj.id));
      let propuesta: Propuesta;
      if (vinculados.length === 1) {
        propuesta = { pedido: p, proyecto: vinculados[0], porque: "su reunión está vinculada solo a ese proyecto" };
      } else if (vinculados.length === 0 && activos.length === 1) {
        propuesta = { pedido: p, proyecto: activos[0], porque: "es el único proyecto activo del cliente" };
      } else {
        propuesta = {
          pedido: p,
          proyecto: null,
          porque:
            vinculados.length > 1
              ? `su reunión está vinculada a ${vinculados.length} proyectos`
              : activos.length === 0
                ? "el cliente no tiene proyectos activos"
                : `el cliente tiene ${activos.length} proyectos activos y la reunión no está vinculada a ninguno`,
        };
      }
      propuestas.push(propuesta);
      const reunion = p.session ? `«${p.session.title}» (${fecha(p.session.date)})` : "sin reunión";
      console.log(`  - «${p.pedido.slice(0, 90)}» · ${ROTULO_DE_SOLICITUD[estadoDeSolicitud(p.estado)]} · reunión ${reunion}`);
      console.log(`    Vínculos de la reunión: ${vinculados.length ? vinculados.map((v) => v.name).join(", ") : "ninguno"}`);
      console.log(
        `    Propuesta: ${propuesta.proyecto ? `asignar a «${propuesta.proyecto.name}»` : "lo ubica el CSE"} (${propuesta.porque})`,
      );
    }
  }
  const asignables = propuestas.filter((x) => x.proyecto !== null);

  // ── 2. De una empresa que no es cliente ─────────────────────────────────────
  const deProspectos = pedidos.filter((p) => p.client.kind !== "CLIENTE");
  console.log(`\n── 2. Pedidos de una empresa que no es cliente: ${deProspectos.length}`);
  for (const p of deProspectos) {
    console.log(
      `  - ${p.client.name} (${p.client.kind}) · «${p.pedido.slice(0, 90)}» · ${ROTULO_DE_SOLICITUD[estadoDeSolicitud(p.estado)]}`,
    );
  }
  const aDescartar = deProspectos.filter((p) => estadoDeSolicitud(p.estado) !== "DESCARTADO");
  if (deProspectos.length) console.log("  Propuesta: Descartar: es un prospecto y no hay nada vendido con qué comparar.");

  // ── 3. Con un estado que escribió la IA sin revisión ────────────────────────
  const deLaIa = pedidos.filter((p) => estadoDeSolicitud(p.estado) !== "PEDIDO" && p.decididoAt === null);
  console.log(`\n── 3. Pedidos con un estado que nadie decidió (lo escribió la IA): ${deLaIa.length}`);
  for (const p of deLaIa) {
    console.log(`  - ${p.client.name} · «${p.pedido.slice(0, 90)}» · ${ROTULO_DE_SOLICITUD[estadoDeSolicitud(p.estado)]}`);
  }

  console.log("\n── Lo que cambiaría cada flag");
  console.log(`  --asignar                ${asignables.length} pedido(s) a su proyecto`);
  console.log(`  --descartar-prospectos   ${aDescartar.length} pedido(s) a «Descartada»`);
  console.log(`  --reabrir-los-de-la-ia   ${deLaIa.length} pedido(s) a «Por revisar»`);

  if (!apply) {
    if (algunFlag) console.log("\nSimulacro: no se escribió nada. Agrega --apply (con ALLOW_PROD_WRITE=1) para aplicar.");
    return;
  }

  // ── Aplicar: primero el JSON de cómo estaba cada pedido que cambia ─────────
  const tocados = new Map<string, Pedido>();
  if (asignar) for (const x of asignables) tocados.set(x.pedido.id, x.pedido);
  if (descartarProspectos) for (const p of aDescartar) tocados.set(p.id, p);
  if (reabrir) for (const p of deLaIa) tocados.set(p.id, p);
  const hoy = fecha(new Date());
  const carpeta = join("backups", `${hoy}-revisar-pedidos-fuera-de-alcance`);
  mkdirSync(carpeta, { recursive: true });
  const ruta = join(carpeta, `antes.${Date.now()}.json`);
  writeFileSync(ruta, JSON.stringify({ firma, guardadoEn: new Date().toISOString(), pedidos: [...tocados.values()] }, null, 2));
  console.log(`\nRespaldo del antes: ${ruta}`);

  let cambiados = 0;
  if (asignar) {
    for (const x of asignables) {
      await cambiarSolicitud({
        clientId: x.pedido.clientId,
        id: x.pedido.id,
        cambio: { projectId: x.proyecto!.id },
        actorEmail: firma,
      });
      cambiados++;
    }
  }
  if (descartarProspectos) {
    for (const p of aDescartar) {
      await cambiarSolicitud({
        clientId: p.clientId,
        id: p.id,
        cambio: {
          estado: "DESCARTADO",
          nota: conNota(p.nota, `Prospecto: no había nada vendido con qué compararlo (revisión del ${hoy})`),
        },
        actorEmail: firma,
      });
      cambiados++;
    }
  }
  if (reabrir) {
    for (const p of deLaIa) {
      /* Si también se descartó como prospecto en esta corrida, ya no es «de la IA»: no se reabre. */
      if (descartarProspectos && aDescartar.some((d) => d.id === p.id)) continue;
      await cambiarSolicitud({
        clientId: p.clientId,
        id: p.id,
        cambio: {
          estado: "PEDIDO",
          nota: conNota(p.nota, `Lo había marcado «${ROTULO_DE_SOLICITUD[estadoDeSolicitud(p.estado)]}» la IA, sin revisión`),
        },
        actorEmail: firma,
      });
      cambiados++;
    }
  }
  console.log(`✓ ${cambiados} cambio(s) aplicado(s), a nombre de ${firma}.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
