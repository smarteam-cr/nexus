/**
 * scripts/comparar-pendientes-de-reuniones.ts — qué pendientes propondría HOY la lectura de seguimiento sobre reuniones
 * reales, SIN ESCRIBIR NADA (2026-10-19; DECISIONS «Pocos pendientes y esenciales de las reuniones con clientes»).
 *
 * Por reunión: corre `leerReunionDeSeguimiento(id, { soloLeer: true })` (la misma llamada del job) y arma las
 * propuestas con las mismas funciones puras que la lectura (`elegirLoEsencial` + `armarPropuestasDeSeguimiento` + el
 * tope por persona). Imprime cada compromiso con su lado, si es esencial y el título, y las propuestas que quedarían.
 * Con `--salida <archivo.json>` guarda todo, para comparar antes y después de un cambio del pedido.
 *
 * ⚠ LLAMA A CLAUDE (una vez por reunión, ≈US$0,08). La conexión nace de SOLO LECTURA. Sin CSE: lo del cliente queda
 * «Por asignar» (no cambia cuántas cosas son). Los descartes de la cuenta sí se leen (solo lectura).
 *
 *   npx tsx scripts/comparar-pendientes-de-reuniones.ts --sesion id1,id2 --salida C:\temp\antes.json
 */
import "dotenv/config";
import "./lib/permitir-server-only";
import { writeFileSync } from "node:fs";

process.env.PGOPTIONS = [process.env.PGOPTIONS, "-c default_transaction_read_only=on -c statement_timeout=60000"].filter(Boolean).join(" ");

const arg = (n: string) => {
  const i = process.argv.indexOf(n);
  return i >= 0 ? (process.argv[i + 1] ?? null) : null;
};

async function main() {
  const ids = (arg("--sesion") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (!ids.length || ids.length > 10) throw new Error("Pasa de 1 a 10 reuniones con --sesion id1,id2 (cada una cuesta una llamada).");
  const { prisma } = await import("@/lib/db/prisma");
  const { leerReunionDeSeguimiento } = await import("@/lib/sessions/post-process");
  const { miembrosActivos } = await import("@/lib/tareas/servidor");
  const { armarPropuestasDeSeguimiento, elegirLoEsencial } = await import("@/lib/tareas/seguimiento");
  const { cupoPorPersona } = await import("@/lib/tareas/cupo");
  const { descartesDeLaCuenta } = await import("@/lib/tareas/lectura");
  const { MAX_PROPUESTAS_POR_PERSONA_POR_REUNION_CON_CLIENTE } = await import("@/lib/tareas/reglas");
  const { costoDeLlamada } = await import("@/lib/ai/precios");
  const miembros = await miembrosActivos();

  const salida: unknown[] = [];
  let costo = 0;
  const tot = { compromisos: 0, smarteam: 0, cliente: 0, esenciales: 0, propuestas: 0 };
  for (const id of ids) {
    const s = await prisma.firefliesSession.findUnique({ where: { id }, select: { title: true, date: true, participants: true } });
    const r = await leerReunionDeSeguimiento(id, { soloLeer: true, formaDelPedido: "propia" });
    if (r.status !== "ok" || !r.salida) {
      console.log(`«${s?.title}»: ${r.status} ${"reason" in r ? (r.reason ?? "") : ""}`);
      continue;
    }
    if (r.tokens) costo += costoDeLlamada("claude-sonnet-4-6", { inputTokens: r.tokens.entrada, outputTokens: r.tokens.salida }) ?? 0;
    const cliente = r.clientId ? await prisma.client.findUnique({ where: { id: r.clientId }, select: { name: true } }) : null;
    const compromisos = r.salida.compromisos;
    const { quedan, menores, aSmarteam } = elegirLoEsencial(compromisos);
    const descartes = r.clientId ? await descartesDeLaCuenta(r.clientId) : { temas: [] };
    const armado = armarPropuestasDeSeguimiento({
      compromisos: quedan,
      descartados: descartes.temas,
      lectura: { id: "simulacro", equipo: "cs" },
      reunion: { id, inicio: s!.date, participantes: s!.participants.map((p) => p.toLowerCase()) },
      miembros,
      cseDelProyecto: null,
      cseDeLaCuenta: null,
      ...(r.ruta === "prospecto" ? { responsableDeLaPreventa: null } : {}),
      clientId: r.clientId ?? "",
      empresa: cliente?.name ?? null,
      projectId: null,
      ruta: r.ruta === "prospecto" ? "prospecto" : "completa",
    });
    const cupo = cupoPorPersona(new Map(), MAX_PROPUESTAS_POR_PERSONA_POR_REUNION_CON_CLIENTE);
    const propuestas = armado.propuestas.filter((p) => p.porAsignar || !p.responsableEmail || cupo.tomar(p.responsableEmail));
    tot.compromisos += compromisos.length;
    tot.smarteam += compromisos.filter((c) => c.quien === "SMARTEAM").length;
    tot.cliente += compromisos.filter((c) => c.quien === "CLIENTE").length;
    tot.esenciales += quedan.length;
    tot.propuestas += propuestas.length;
    console.log(`\n«${s?.title}» · ${cliente?.name} · ${compromisos.length} compromisos → ${propuestas.length} propuestas (${menores.length} menores fuera · ${aSmarteam} pasaron a Smarteam · ${armado.yaDescartados} ya descartados)`);
    for (const c of compromisos) console.log(`   [${c.quien === "SMARTEAM" ? "smarteam" : "cliente "}${c.esencial === false ? " · menor" : ""}${c.frenaElPlan ? " · frena" : ""}] ${c.titulo ?? c.tituloDeSeguimiento ?? c.que}`);
    console.log("   ⇒");
    for (const p of propuestas) console.log(`   · ${p.titulo}  →  ${p.responsableEmail ?? `por asignar (${p.equipo})`}`);
    salida.push({ id, titulo: s?.title, cliente: cliente?.name, compromisos, propuestas: propuestas.map((p) => ({ titulo: p.titulo, para: p.responsableEmail, lado: p.sugerido.lado })) });
  }
  console.log(`\nTotal: ${tot.compromisos} compromisos (${tot.smarteam} de Smarteam, ${tot.cliente} del cliente) · ${tot.esenciales} esenciales · ${tot.propuestas} propuestas · ≈US$${costo.toFixed(2)}`);
  const archivo = arg("--salida");
  if (archivo) writeFileSync(archivo, JSON.stringify({ tot, reuniones: salida }, null, 2));
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
