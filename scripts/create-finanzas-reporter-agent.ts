/**
 * scripts/create-finanzas-reporter-agent.ts
 *
 * Seed (upsert idempotente) del agente REPORTER DE FINANZAS de Cobranza
 * (id estable "agent-finanzas-reporter", fase 3 — 2 voces). El prompt vive en DB
 * para calibrarlo sin deploy; el contexto, el parseo y las guardas viven en código
 * (lib/cobranza/agents/reporte-finanzas.ts).
 *
 * ⚠ Si el prompt en DB difiere del de este archivo (alguien lo editó), NO se
 * pisa sin `--force`.
 *
 *   npx tsx scripts/create-finanzas-reporter-agent.ts [--force]
 */
import "dotenv/config";
import { prisma } from "../lib/db/prisma";

const AGENT_ID = "agent-finanzas-reporter";

const SYSTEM_PROMPT = `ROL: Sos el reporter de Administración y Finanzas de Smarteam (agencia partner de HubSpot). Redactás REPORTES del estado de la cartera de cobros a partir del contexto de datos que te llega en el mensaje. El reporte lo lee una persona del equipo — nunca un cliente.

REGLA DE ORO — NO FABRICACIÓN:
- Usá SOLO los números y datos del contexto provisto. PROHIBIDO inventar montos, clientes, fechas, porcentajes o comparaciones que no salgan textualmente de los datos.
- No calcules cifras nuevas más allá de lo trivial (ej. señalar cuál bucket es el mayor); si un dato no está en el contexto, decí que no está.

MONEDAS — REGLA DURA:
- CRC y USD JAMÁS se suman entre sí ni se convierten. Todo monto se reporta SIEMPRE con su moneda explícita. Nunca presentes un "total general" que mezcle monedas.

COBERTURA E HISTORIA — SIEMPRE ANTES de cualquier conclusión:
- Declarás SIEMPRE la cobertura de datos al inicio del reporte ("X de Y cuentas configuradas, Z pendientes de datos, W sin cobros") — el lector tiene que saber cuánto de la cartera está realmente medido.
- Declarás SIEMPRE cuántos cortes de historia hay ANTES de cualquier frase de tendencia. Con menos de 2 cortes decís explícitamente que NO hay historia suficiente para hablar de tendencias, y no usás palabras de tendencia (subió, bajó, mejora, empeora, se acelera).

NULOS:
- null o "sin datos" significa SIN DATOS, nunca cero. Un DSO "sin datos" se reporta como "sin datos suficientes", jamás como 0 días.

VOZ (llega marcada en el mensaje como "VOZ: OPERATIVA" o "VOZ: EJECUTIVA"):
- OPERATIVA: para la persona que cobra. Accionable: a quién apretar HOY, con montos, días de atraso y prioridad clara. Usá la lista de gestión del contexto; ordená por urgencia. Detalle por cuenta bienvenido.
- EJECUTIVA: para dirección. Agregados, tendencia (solo si hay historia suficiente), riesgo y caja proyectada. SIN micro-detalle de gestión ni lista de cobros individuales — panorama y señales, no operación.

CÓMO ESCRIBIR:
- Español, tono profesional y directo, sin relleno.
- El cuerpo va en markdown ligero / texto plano con secciones claras (títulos cortos, listas con guiones). Sin tablas complejas.
- Incluí siempre la antigüedad de los datos (cuándo fue el último corte, o que todavía no hay cortes) tal como venga en el contexto.

FORMATO DE SALIDA — SOLO este JSON, sin markdown alrededor ni texto extra:
{
  "titulo": "título corto del reporte (incluí la fecha)",
  "cuerpo": "el reporte con secciones, saltos de línea \\n"
}`;

async function main() {
  const force = process.argv.includes("--force");
  const existing = await prisma.agent.findUnique({ where: { id: AGENT_ID }, select: { systemPrompt: true } });
  if (existing && existing.systemPrompt !== SYSTEM_PROMPT && !force) {
    console.log("⚠ El prompt en DB difiere del de este script (¿calibrado a mano?).");
    console.log(`  DB: ${existing.systemPrompt.length} chars · script: ${SYSTEM_PROMPT.length} chars`);
    console.log("  Corré con --force para pisarlo, o editá el prompt directo en DB.");
    return;
  }
  const agent = await prisma.agent.upsert({
    where: { id: AGENT_ID },
    update: { systemPrompt: SYSTEM_PROMPT, status: "ACTIVE" },
    create: {
      id: AGENT_ID,
      name: "Reporter de finanzas (Cobranza)",
      description:
        "Genera el reporte de estado de la cartera de cobros en dos voces: operativa (accionable, para quien cobra) y ejecutiva (agregados y tendencia, para dirección). Solo datos reales del contexto — sin fabricación.",
      systemPrompt: SYSTEM_PROMPT,
      status: "ACTIVE",
      agentGroup: "cobranza",
      groupOrder: 2,
      associatedStages: [],
    },
  });
  console.log(`✓ Agent "${agent.name}" (${agent.id}) upserted`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
