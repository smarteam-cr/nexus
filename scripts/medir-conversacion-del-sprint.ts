/**
 * scripts/medir-conversacion-del-sprint.ts — cuánto cuesta leer la conversación de la reunión del sprint (2026-10-27,
 * decisión de Elías, pregunta 7 del roadmap: «unos US$0,014 por reunión»; lib/tareas/sprint.ts).
 *
 * Toma las últimas N lecturas de las series de sprint que tienen conversación grabada, arma el MISMO pedido que haría la
 * lectura (`pedidoDeLaConversacionParaMedir`) y cuenta sus tokens de entrada con la API de conteo (gratis). La salida se
 * estima como el botón «¿Faltó algo?» (`SALIDA_ESTIMADA_DE_LA_CONVERSACION`). Con `--llamar` además le hace la llamada de verdad a Haiku (unos
 * US$0,02 cada una) para medir la salida real, y no escribe lo que devuelve.
 *
 * ⛔ SOLO LECTURA: la base se abre en solo lectura (la llamada de `--llamar` no queda anotada en el medidor).
 *
 *   npx tsx scripts/medir-conversacion-del-sprint.ts            (las últimas 3, sin llamar al modelo)
 *   npx tsx scripts/medir-conversacion-del-sprint.ts --n=3 --llamar
 */
import "dotenv/config";
import "./lib/permitir-server-only";

process.env.PGOPTIONS = [process.env.PGOPTIONS, "-c default_transaction_read_only=on -c statement_timeout=60000"].filter(Boolean).join(" ");

const N = Number(process.argv.find((a) => a.startsWith("--n="))?.slice(4) ?? 3) || 3;
const LLAMAR = process.argv.includes("--llamar");

async function main() {
  const { prisma } = await import("@/lib/db/prisma");
  const { describirDestino } = await import("./lib/guard");
  const { getAnthropic } = await import("@/lib/anthropic");
  const { costoDeLlamada } = await import("@/lib/ai/precios");
  const { MODELO_DE_LA_CONVERSACION, SALIDA_ESTIMADA_DE_LA_CONVERSACION } = await import("@/lib/tareas/ia/conversacion");
  const { pedidoDeLaConversacionParaMedir } = await import("@/lib/tareas/lectura");
  console.log(`Base: ${describirDestino(process.env.DATABASE_URL)} · SOLO LECTURA · ${LLAMAR ? "CON llamada real a Haiku" : "sin llamar al modelo"}\n`);

  const fuentes = await prisma.fuenteDeTareas.findMany({ where: { equipo: { not: null } }, select: { id: true, equipo: true } });
  const lecturas = await prisma.lecturaDeReunion.findMany({
    where: { fuenteId: { in: fuentes.map((f) => f.id) }, sessionId: { not: null } },
    orderBy: { createdAt: "desc" },
    take: 30,
    select: { id: true, sessionId: true, equipo: true, createdAt: true },
  });

  // La conversación se lee SOLO por el chokepoint (`pedidoDeLaConversacionParaMedir` → `conversacionParaTareas`, como
  // quien pidió la lectura): las que no tienen conversación grabada vuelven null y se saltan.
  const costos: number[] = [];
  for (const l of lecturas) {
    if (costos.length >= N) break;
    const p = await pedidoDeLaConversacionParaMedir(l.id);
    if (!p) continue;
    // La API de conteo no acepta los parámetros de la respuesta (max_tokens, temperature).
    const conteo = await getAnthropic().messages.countTokens({ model: p.pedido.model, system: p.pedido.system, messages: p.pedido.messages, tools: p.pedido.tools, tool_choice: p.pedido.tool_choice });
    let entrada = conteo.input_tokens;
    let salida = SALIDA_ESTIMADA_DE_LA_CONVERSACION;
    let real = "";
    if (LLAMAR) {
      const r = await getAnthropic().messages.create(p.pedido);
      entrada = r.usage.input_tokens;
      salida = r.usage.output_tokens;
      const uso = r.content.find((c) => c.type === "tool_use");
      const tareas = uso && uso.type === "tool_use" ? ((uso.input as { tareas?: unknown[] }).tareas?.length ?? 0) : 0;
      real = ` · salida real · ${tareas} compromisos`;
    }
    const usd = costoDeLlamada(MODELO_DE_LA_CONVERSACION, { inputTokens: entrada, outputTokens: salida }) ?? 0;
    costos.push(usd);
    console.log(
      `· ${l.createdAt.toISOString().slice(0, 10)} ${l.equipo}: ${p.largo} caracteres, ${p.turnos} turnos${p.recortada ? " (recortada)" : ""} · ${entrada} tokens de entrada, ${salida} de salida${real} · US$${usd.toFixed(4)}`,
    );
  }
  if (!costos.length) console.log("Ninguna reunión de sprint tiene la conversación grabada.");
  else console.log(`\nPromedio: US$${(costos.reduce((a, b) => a + b, 0) / costos.length).toFixed(4)} por reunión (${costos.length} medidas).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    const { prisma } = await import("@/lib/db/prisma");
    await prisma.$disconnect();
  });
