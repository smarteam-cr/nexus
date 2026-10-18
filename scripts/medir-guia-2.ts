/**
 * scripts/medir-guia-2.ts — cuánto cuesta «Regenerar pregunta» y un turno de «Mejorar con el asistente» (validaciones 69 y
 * 71, 2026-10-18), con Distribuidora Larce. NO ESCRIBE la exploración ni el hilo.
 *
 *   · Regenerar: el MISMO pedido que el botón (lib/exploraciones/guia-pregunta-pedido.ts) para las 3 primeras preguntas
 *     de la guía de la próxima sesión. Muestra la de hoy y la nueva. No guarda nada.
 *   · Un turno del asistente: el MISMO pedido del chat de la cuenta (el prompt de Nexus, el contexto de la cuenta, sus
 *     herramientas y la guía en el mensaje) con «agrega dos preguntas sobre el presupuesto y cambia la 1 por una más
 *     corta». Si el modelo propone cambios, se hace la segunda vuelta como el bucle (con «queda en la lista» de
 *     respuesta) sin preparar ni aplicar nada: un turno real son esas dos llamadas.
 *
 * ── QUÉ ESCRIBE ──────────────────────────────────────────────────────────────────────────────
 *   · Nada, salvo la telemetría de `LlmCall` que anota el cliente de Anthropic, a nombre de --por (presupuesto humano).
 *
 * ── CÓMO SE CORRE ────────────────────────────────────────────────────────────────────────────
 * ⚠ LLAMA A CLAUDE: 3 llamadas cortas (regenerar) y 2 del chat. Unos US$0,15 en total.
 *
 *   npx tsx scripts/medir-guia-2.ts --por egonzalez@smarteamcr.com
 *   npx tsx scripts/medir-guia-2.ts --por … --id <exploracionId>
 */
import "dotenv/config";
import "./lib/permitir-server-only";
import type Anthropic from "@anthropic-ai/sdk";

process.env.DB_POOL_MAX ??= "2";

const LARCE = "cmvbcuvcs016706t1xcny5pss";

function arg(nombre: string): string | null {
  const i = process.argv.indexOf(nombre);
  if (i > -1) return process.argv[i + 1] ?? null;
  const conIgual = process.argv.find((a) => a.startsWith(`${nombre}=`));
  return conIgual ? conIgual.slice(nombre.length + 1) : null;
}
const POR = (arg("--por") ?? "").trim().toLowerCase();
const ID = arg("--id") ?? LARCE;

async function main() {
  if (!POR.includes("@")) {
    console.error("Falta --por <tu correo>: las llamadas a Claude se anotan a tu nombre, contra el presupuesto humano.");
    process.exit(1);
  }
  const { prisma } = await import("@/lib/db/prisma");
  const { getAnthropic } = await import("@/lib/anthropic");
  const { conContextoDeIA } = await import("@/lib/ai/contexto-de-corrida");
  const { costoDeLlamada } = await import("@/lib/ai/precios");
  const { contextoParaLaGuia, AGENTE_DE_LA_EXPLORACION } = await import("@/lib/exploraciones/agente");
  const { preguntasDeLaProxima, ORIGEN_DE_REGENERAR } = await import("@/lib/exploraciones/guia-ajustes-server");
  const { pedidoDeUnaPregunta, leerUnaPregunta } = await import("@/lib/exploraciones/guia-pregunta-pedido");
  const { claveDePregunta } = await import("@/lib/exploraciones/ajustes-de-la-guia");
  const { guiaParaElChat } = await import("@/lib/operaciones/guia-server");
  const { PROMPT_DE_NEXUS, contextoDeLaCuenta } = await import("@/lib/nexus-chat/prompt");
  const { herramientasDelChat } = await import("@/lib/nexus-chat/herramientas-server");
  const { loQueSeSabeDeLaCuenta } = await import("@/lib/nexus-chat/lecturas-server");
  const { comoInformacion } = await import("@/lib/nexus-chat/bucle");
  const { MODELO_DEL_ASISTENTE } = await import("@/lib/asistente/turno");
  const { SLUG_DEL_CHAT_DE_NEXUS } = await import("@/lib/nexus-chat/constantes");

  const costo = (m: Anthropic.Messages.Message) =>
    costoDeLlamada(m.model, {
      inputTokens: m.usage.input_tokens,
      outputTokens: m.usage.output_tokens,
      cacheReadTokens: m.usage.cache_read_input_tokens ?? 0,
      cacheCreationTokens: m.usage.cache_creation_input_tokens ?? 0,
    }) ?? 0;
  const tokens = (m: Anthropic.Messages.Message) =>
    `${m.usage.input_tokens} entrada · ${m.usage.cache_creation_input_tokens ?? 0} caché escrita · ${m.usage.cache_read_input_tokens ?? 0} caché leída · ${m.usage.output_tokens} salida`;

  try {
    const base = await contextoParaLaGuia(ID);
    const { preguntas } = preguntasDeLaProxima(base);
    console.log(`\n${base.fila.client.name} · próxima sesión: la ${base.ctx.proxima.numero} · ${preguntas.length} preguntas\n`);

    // 1. Regenerar.
    let totalRegenerar = 0;
    const deRegenerar = preguntas.filter((p) => p.tipo !== "abierto").slice(0, 3);
    for (const p of deRegenerar) {
      const entrada = {
        ctx: base.ctx,
        objetivo: { para: p.apunta?.para ?? p.para, nombre: p.para, ...(p.paso ? { paso: p.paso } : {}), motivo: p.motivo ?? null, actual: p.pregunta, repreguntas: p.repreguntas },
        otras: preguntas.filter((x) => x !== p).map((x) => x.pregunta),
      };
      const r = await conContextoDeIA(
        { agentSlug: AGENTE_DE_LA_EXPLORACION, agentRunId: null, clientId: base.fila.clientId, triggeredByEmail: POR, origen: `${ORIGEN_DE_REGENERAR}:medir` },
        () => getAnthropic().messages.create(pedidoDeUnaPregunta(entrada)),
      );
      const l = leerUnaPregunta(r, entrada, base.ctx.saber);
      totalRegenerar += costo(r);
      console.log(`[${claveDePregunta(p)}] hoy: ${p.pregunta}`);
      console.log(`   nueva: ${l.ok ? l.pregunta : `(no sirvió: ${l.motivo})`}`);
      console.log(`   ${tokens(r)} · US$${costo(r).toFixed(4)}\n`);
    }
    console.log(`Regenerar: US$${(totalRegenerar / Math.max(1, deRegenerar.length)).toFixed(4)} por pregunta (promedio de ${deRegenerar.length}).\n`);

    // 2. Un turno del asistente, abierto desde la guía.
    const persona = await prisma.teamMember.findFirst({ where: { email: POR } });
    const saber = await loQueSeSabeDeLaCuenta(base.fila.clientId);
    if (!persona || !saber) throw new Error("No encontré a la persona o la cuenta.");
    const contexto = contextoDeLaCuenta({
      ahora: new Date(),
      persona: { nombre: persona.name, email: persona.email, rol: String(persona.roleEnum), equipos: persona.area ? [persona.area] : [] },
      cuenta: saber.cuenta,
      proyectos: saber.proyectos,
      memoria: saber.memoria,
    });
    const guia = await guiaParaElChat(ID);
    const mensaje = `[LA PERSONA ABRIÓ EL CHAT DESDE LA GUÍA — lo escribe Nexus, no la persona]\n${comoInformacion(guia)}\n\nAgrega dos preguntas sobre el presupuesto y cambia la 1 por una más corta.`;
    const tools = herramientasDelChat();
    const llamar = (messages: Anthropic.Messages.MessageParam[]) =>
      conContextoDeIA({ agentSlug: SLUG_DEL_CHAT_DE_NEXUS, agentRunId: null, clientId: base.fila.clientId, triggeredByEmail: POR, origen: "nexus-chat:medir-guia" }, () =>
        getAnthropic().messages.create({
          model: MODELO_DEL_ASISTENTE,
          max_tokens: 8_000,
          system: [
            { type: "text", text: PROMPT_DE_NEXUS, cache_control: { type: "ephemeral" } },
            { type: "text", text: `TU CONTEXTO\n\n${contexto}`, cache_control: { type: "ephemeral" } },
          ],
          tools,
          messages,
        }),
      );
    const msgs: Anthropic.Messages.MessageParam[] = [{ role: "user", content: mensaje }];
    const r1 = await llamar(msgs);
    let totalTurno = costo(r1);
    console.log(`Turno, vuelta 1: ${tokens(r1)} · US$${costo(r1).toFixed(4)}`);
    const usos = r1.content.filter((b): b is Anthropic.Messages.ToolUseBlock => b.type === "tool_use");
    for (const u of usos) console.log(`   propone ${u.name}: ${JSON.stringify(u.input).slice(0, 200)}`);
    if (r1.stop_reason === "tool_use" && usos.length) {
      msgs.push(
        { role: "assistant", content: r1.content },
        { role: "user", content: usos.map((u) => ({ type: "tool_result" as const, tool_use_id: u.id, content: "Queda en la lista para que la persona lo aplique (NO está aplicado)." })) },
      );
      const r2 = await llamar(msgs);
      totalTurno += costo(r2);
      console.log(`Turno, vuelta 2: ${tokens(r2)} · US$${costo(r2).toFixed(4)}`);
      console.log(`   contesta: ${r2.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("").slice(0, 400)}`);
    }
    console.log(`\nUn turno del asistente: US$${totalTurno.toFixed(4)} (la primera vez escribe la caché del prompt; los turnos siguientes la leen).`);
  } finally {
    await prisma.$disconnect().catch(() => {});
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
