/**
 * scripts/comparar-lectura-de-reuniones.ts — compara la lectura de seguimiento NUEVA con lo que dejó el post-proceso
 * viejo, sobre reuniones REALES, SIN ESCRIBIR NADA (memoria de la cuenta, etapa 2; docs/RUNBOOK.md «La lectura de cada
 * reunión»). Es el ensayo antes de prender la lectura en producción.
 *
 * Toma las reuniones más recientes con transcripción de un CLIENTE (sin Wherex: es el cliente de prueba de Nexus y
 * hizo churn) y corre `leerReunionDeSeguimiento(id, { soloLeer: true })`: la misma llamada que hará el job, sin la
 * corrida, sin la minuta, sin las propuestas y sin los vínculos. Imprime, por reunión: el largo del resumen, los
 * acuerdos, los compromisos por lado, las citas verificadas y descartadas, los pedidos fuera de alcance y los tokens,
 * contra la SessionMinute y las ActionItem que ya tiene.
 *
 * ⚠ LLAMA A CLAUDE (una vez por reunión: ≈US$0,08 cada una; 20 reuniones ≈ US$1,6). Lo corre Elías desde una PC.
 * La conexión nace de SOLO LECTURA: ni siquiera el medidor puede anotar las llamadas en LlmCall (cada intento queda en
 * un aviso de consola), así que el costo lo calcula y lo imprime este script.
 *
 * Uso:
 *   npx tsx scripts/comparar-lectura-de-reuniones.ts               # las 20 más recientes
 *   npx tsx scripts/comparar-lectura-de-reuniones.ts --max 5
 *   npx tsx scripts/comparar-lectura-de-reuniones.ts --sesion <id> # una sola reunión (de cualquier cliente o prospecto)
 *   npx tsx scripts/comparar-lectura-de-reuniones.ts --prefijo     # además, la misma reunión con el prefijo compartido
 *
 * `--prefijo` (2026-10-18, lib/ai/ahorro.ts `LECTURA_Y_HECHOS_COMPARTEN_PREFIJO`): lee cada reunión DOS veces, con el
 * pedido de siempre y con la reunión en el `system` cacheado (la conversación comprimida que leen los hechos), y pone
 * las dos al lado: acuerdos, compromisos, citas descartadas. Duplica el costo (≈US$0,16 por reunión).
 */
import "dotenv/config";
import "./lib/permitir-server-only";
import { createScriptDb } from "./lib/db";
import { describirDestino } from "./lib/guard";

/* ⛔ Ni por error: la conexión nace de solo lectura y con tope de tiempo (pg lee PGOPTIONS al abrir cada conexión). */
process.env.PGOPTIONS = [process.env.PGOPTIONS, "-c default_transaction_read_only=on -c statement_timeout=60000"].filter(Boolean).join(" ");

function arg(nombre: string): string | null {
  const i = process.argv.indexOf(nombre);
  return i > -1 ? (process.argv[i + 1] ?? null) : null;
}

const MODELO = "claude-sonnet-4-6";

async function main() {
  const max = Math.max(1, Number(arg("--max") ?? 20));
  const sola = arg("--sesion");
  const conPrefijo = process.argv.includes("--prefijo");
  console.log(`Base: ${describirDestino(process.env.DATABASE_URL ?? "")} (solo lectura)\n`);
  const { prisma: db, close } = createScriptDb();
  try {
    const { leerReunionDeSeguimiento } = await import("@/lib/sessions/post-process");
    const { costoDeLlamada } = await import("@/lib/ai/precios");
    const { duenoDeLaSesion } = await import("@/lib/sessions/project-sources");

    // Las candidatas: con transcripción, con dueño, de las más recientes a las más viejas. El tipo de empresa se mira
    // después (en JS): Prisma no filtra por la empresa de un id suelto.
    const filas = await db.firefliesSession.findMany({
      where: sola ? { id: sola } : { date: { lte: new Date() }, transcript: { not: null }, OR: [{ resolvedClientId: { not: null } }, { manualClientId: { not: null } }] },
      select: { id: true, title: true, date: true, resolvedClientId: true, manualClientId: true },
      orderBy: { date: "desc" },
      take: sola ? 1 : 300,
    });
    const duenos = [...new Set(filas.map((f) => duenoDeLaSesion(f)).filter((x): x is string => !!x))];
    const clientes = new Map((await db.client.findMany({ where: { id: { in: duenos } }, select: { id: true, name: true, kind: true } })).map((c) => [c.id, c]));

    let leidas = 0;
    let costo = 0;
    const totales = { compromisosCliente: 0, compromisosSmarteam: 0, descartados: 0, pedidos: 0, minutasViejas: 0, actionItemsViejos: 0 };
    for (const f of filas) {
      if (leidas >= (sola ? 1 : max)) break;
      const dueno = duenoDeLaSesion(f);
      const cliente = dueno ? clientes.get(dueno) : undefined;
      if (!cliente) continue;
      if (!sola && (cliente.kind !== "CLIENTE" || /wherex/i.test(cliente.name))) continue;

      const r = await leerReunionDeSeguimiento(f.id, { soloLeer: true, formaDelPedido: "propia" });
      if (r.status === "sin_texto" || r.status === "omitida") {
        if (sola) console.log(`«${f.title}»: ${r.reason}`);
        continue;
      }
      leidas++;
      const [minuta, acciones] = await Promise.all([
        db.sessionMinute.findUnique({ where: { sessionId: f.id }, select: { summary: true, agreements: true, status: true } }),
        db.actionItem.findMany({ where: { sessionId: f.id }, select: { ladoResponsable: true } }),
      ]);
      const largoDe = (x: unknown) => (Array.isArray(x) ? x.length : 0);
      console.log(`━━ ${cliente.name} · «${f.title}» · ${f.date.toISOString().slice(0, 10)} · ${f.id}`);
      if (r.status === "error") {
        console.log(`   ✗ la lectura falló: ${r.reason}\n`);
        continue;
      }
      const s = r.salida!;
      const deCliente = s.compromisos.filter((c) => c.quien === "CLIENTE");
      const deSmarteam = s.compromisos.filter((c) => c.quien === "SMARTEAM");
      const usd = r.tokens ? (costoDeLlamada(MODELO, { inputTokens: r.tokens.entrada, outputTokens: r.tokens.salida }) ?? 0) : 0;
      costo += usd;
      console.log(
        `   NUEVA  · ruta ${r.ruta} · resumen ${s.minuta.summary.length} caracteres · ${s.minuta.agreements.length} acuerdos · ${s.minuta.decisions.length} decisiones · ${s.minuta.risks.length} riesgos`,
      );
      console.log(
        `          compromisos: ${deCliente.length} del cliente (${deCliente.filter((c) => c.frenaElPlan).length} frenan el plan), ${deSmarteam.length} de Smarteam · ` +
          `citas: ${s.compromisos.length + s.fueraDeAlcance.length} verificadas, ${(r.descartadosPorCita?.compromisos ?? 0) + (r.descartadosPorCita?.pedidos ?? 0)} descartadas · ` +
          `${s.fueraDeAlcance.length} pedido(s) fuera de alcance · ${r.tokens?.entrada ?? 0}+${r.tokens?.salida ?? 0} tokens (≈US$${usd.toFixed(3)})`,
      );
      if (conPrefijo) {
        const c = await leerReunionDeSeguimiento(f.id, { soloLeer: true, formaDelPedido: "compartida" });
        if (c.status !== "ok" || !c.salida) console.log(`   COMPARTIDA · ✗ ${c.status}: ${"reason" in c ? c.reason : ""}`);
        else {
          const sc = c.salida;
          const usdC = c.tokens ? (costoDeLlamada(MODELO, { inputTokens: c.tokens.entrada, outputTokens: c.tokens.salida }) ?? 0) : 0;
          costo += usdC;
          console.log(
            `   COMPARTIDA · resumen ${sc.minuta.summary.length} caracteres · ${sc.minuta.agreements.length} acuerdos · ${sc.minuta.decisions.length} decisiones · ` +
              `compromisos ${sc.compromisos.filter((x) => x.quien === "CLIENTE").length} del cliente y ${sc.compromisos.filter((x) => x.quien === "SMARTEAM").length} de Smarteam · ` +
              `${(c.descartadosPorCita?.compromisos ?? 0) + (c.descartadosPorCita?.pedidos ?? 0)} descartadas por la cita · ${sc.fueraDeAlcance.length} pedido(s) · ${c.tokens?.entrada ?? 0}+${c.tokens?.salida ?? 0} tokens sin caché`,
          );
        }
      }
      for (const c of s.compromisos.slice(0, 6)) {
        console.log(`          · [${c.quien}${c.frenaElPlan ? ", frena" : ""}${c.fecha ? `, ${c.fecha}` : ""}] ${c.quien === "CLIENTE" ? (c.tituloDeSeguimiento ?? `Seguimiento: ${c.que}`) : c.que}`);
      }
      console.log(
        `   VIEJA  · ${minuta ? `minuta ${minuta.status}: resumen ${minuta.summary.length} caracteres · ${largoDe(minuta.agreements)} acuerdos` : "sin minuta"} · ` +
          `${acciones.length} ActionItem (${acciones.filter((a) => a.ladoResponsable === "CLIENTE").length} del cliente, ${acciones.filter((a) => a.ladoResponsable === "SMARTEAM").length} de Smarteam)\n`,
      );
      totales.compromisosCliente += deCliente.length;
      totales.compromisosSmarteam += deSmarteam.length;
      totales.descartados += (r.descartadosPorCita?.compromisos ?? 0) + (r.descartadosPorCita?.pedidos ?? 0);
      totales.pedidos += s.fueraDeAlcance.length;
      if (minuta) totales.minutasViejas++;
      totales.actionItemsViejos += acciones.length;
    }
    console.log(
      `Total: ${leidas} reunión(es) · ${totales.compromisosCliente} compromisos del cliente y ${totales.compromisosSmarteam} de Smarteam · ` +
        `${totales.descartados} descartados por la cita · ${totales.pedidos} pedidos · ≈US$${costo.toFixed(2)}`,
    );
    console.log(`Lo de antes: ${totales.minutasViejas} con minuta · ${totales.actionItemsViejos} ActionItem.`);
    console.log("No se escribió nada. Para prender la lectura: docs/RUNBOOK.md «La lectura de cada reunión».");
  } finally {
    await close();
  }
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(async () => {
    const { prisma } = await import("@/lib/db/prisma");
    await prisma.$disconnect().catch(() => undefined);
  });
