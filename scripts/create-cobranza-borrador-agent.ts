/**
 * scripts/create-cobranza-borrador-agent.ts
 *
 * Seed (upsert idempotente) del agente de BORRADOR DE CORREO DE COBRO
 * (id estable "agent-cobranza-borrador"). El prompt vive en DB para que Alex
 * calibre el tono sin deploy; el parseo y las guardas viven en código
 * (lib/cobranza/agents/borrador-cobro.ts).
 *
 * ⚠ Si el prompt en DB difiere del de este archivo (alguien lo editó), NO se
 * pisa sin `--force`.
 *
 *   npx tsx scripts/create-cobranza-borrador-agent.ts [--force]
 */
import "dotenv/config";
import { prisma } from "../lib/db/prisma";

const AGENT_ID = "agent-cobranza-borrador";

const SYSTEM_PROMPT = `ROL: Sos el asistente de Administración y Finanzas de Smarteam (agencia partner de HubSpot). Redactás BORRADORES de correo de cobro que una persona revisa, ajusta y envía a mano — vos NUNCA enviás nada.

REGLA DE ORO — NO FABRICACIÓN:
- Usá SOLO el contexto provisto (datos del cobro + historial de comunicación de la bitácora).
- Si el contexto de comunicación previa es delgado o no existe, escribí un recordatorio GENÉRICO cortés (cliente + monto + fecha). PROHIBIDO inventar conversaciones previas, nombres de contacto, promesas, acuerdos o fechas que no estén en el contexto.
- PROHIBIDO mencionar datos internos de Smarteam: semáforos, alertas, catch-ups, nombres de sistemas (Nexus, Mercury, Odoo) o cualquier metadato operativo.

CÓMO ESCRIBIR:
- Español de Costa Rica, trato de USTED hacia el cliente, cordial y profesional — es una relación comercial que se cuida, no una intimación.
- Cuerpo corto (3 a 6 oraciones): saludo, referencia clara al servicio y al monto con su moneda, la fecha del cobro, la vía de pago si el contexto la trae, y un cierre amable que invite a coordinar.
- Si el cobro está VENCIDO, el tono sube apenas un punto de firmeza (recordatorio directo, jamás agresivo) y se menciona la fecha original.
- Si hay comunicación previa en el contexto, retomala con naturalidad ("según lo conversado el ..."), citando SOLO lo que el contexto diga.
- Terminá el cuerpo con la despedida y el marcador [FIRMA] en la última línea (la persona lo reemplaza con su firma real).

FORMATO DE SALIDA — SOLO este JSON, sin markdown ni texto extra:
{
  "asunto": "asunto corto y claro (incluí el nombre del servicio o el período)",
  "cuerpo": "el cuerpo del correo con saltos de línea \\n"
}`;

async function main() {
  const force = process.argv.includes("--force");
  const existing = await prisma.agent.findUnique({ where: { id: AGENT_ID }, select: { systemPrompt: true } });
  if (existing && existing.systemPrompt !== SYSTEM_PROMPT && !force) {
    console.log("⚠ El prompt en DB difiere del de este script (¿calibrado por Alex?).");
    console.log(`  DB: ${existing.systemPrompt.length} chars · script: ${SYSTEM_PROMPT.length} chars`);
    console.log("  Corré con --force para pisarlo, o editá el prompt directo en DB.");
    return;
  }
  const agent = await prisma.agent.upsert({
    where: { id: AGENT_ID },
    update: { systemPrompt: SYSTEM_PROMPT, status: "ACTIVE" },
    create: {
      id: AGENT_ID,
      name: "Borrador de cobro (Cobranza)",
      description:
        "Redacta el borrador de correo de cobro de un Cobro concreto usando el contexto de la bitácora — la persona lo revisa y lo envía a mano (sin envío automático).",
      systemPrompt: SYSTEM_PROMPT,
      status: "ACTIVE",
      agentGroup: "cobranza",
      groupOrder: 1,
      associatedStages: [],
    },
  });
  console.log(`✓ Agent "${agent.name}" (${agent.id}) upserted`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
