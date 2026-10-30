import "dotenv/config";
import "./lib/permitir-server-only";
import { imprimirDestino, resolverApply } from "./lib/guard";
import { prisma } from "@/lib/db/prisma";
import { alertasApagadasPorMarcha, cerrarAlertasApagadas, type AlertaApagada } from "@/lib/cs/proyecto-en-marcha-server";
import { crDateParts } from "@/lib/jobs/time";

/**
 * scripts/cerrar-alertas-de-proyectos-detenidos.ts — las alertas abiertas de los proyectos que no están en marcha
 * (2026-10-29).
 *
 * Desde ese deploy, las alertas de riesgo solo miran proyectos EN MARCHA (lib/cs/proyecto-en-marcha.ts): uno que no
 * arrancó (Kaizen: creado, sin kickoff ni fecha de arranque confirmada) o que está bloqueado sin que el freno sea nuestro
 * (Kamalio) no pinta riesgo, el vigía no lo tría y la cartera no muestra sus alertas. Las que ya estaban abiertas quedan
 * en la base, escondidas; este script las cierra, firmadas por el sistema y con su nota. Si el proyecto arranca o se
 * desbloquea, el vigía levanta lo que vea (un cierre del sistema no suprime la reaparición, lib/cs/alertas-reglas.ts).
 *
 * Cierra lo que apaga `alertaApagadaPorMarcha`, la misma regla de la cartera y del barrido del vigía: una queja, un aviso
 * del equipo y el riesgo de renovación o de cancelación se quedan, y una alerta de la cuenta se queda si a la cuenta le
 * queda otro proyecto en marcha.
 *
 * ⛔ ORDEN: después del deploy. Con el código viejo, el vigía de esa noche reabre lo que se cerró.
 *
 *   npx tsx scripts/cerrar-alertas-de-proyectos-detenidos.ts                      (simulacro: lista lo que cerraría)
 *   ALLOW_PROD_WRITE=1 npx tsx scripts/cerrar-alertas-de-proyectos-detenidos.ts --apply   (escribe, con respaldo de CsAlert)
 *
 * Re-ejecutable: lo ya cerrado no vuelve a aparecer.
 */
const APPLY = resolverApply({ tablas: ["CsAlert"] });

async function main() {
  imprimirDestino();
  console.log(APPLY ? "=== APPLY (escribe) ===" : "=== SIMULACRO (no escribe) ===");
  const apagadas = await alertasApagadasPorMarcha(crDateParts(new Date()).dateKey);

  console.log(`\nAlertas abiertas que la regla apaga: ${apagadas.length}.`);
  const porProyecto = new Map<string, AlertaApagada[]>();
  for (const a of apagadas) porProyecto.set(a.projectId, [...(porProyecto.get(a.projectId) ?? []), a]);
  for (const lista of porProyecto.values()) {
    const [a] = lista;
    console.log(`\n  ${a.cliente} · «${a.proyecto}» ${a.marcha.porque} (${a.marcha.estado})`);
    for (const x of lista) console.log(`    · ${x.category} · ${x.title}`);
  }
  if (apagadas.length === 0) {
    console.log("\n✓ Nada que cerrar.");
    return;
  }
  if (!APPLY) {
    console.log("\nPara aplicarlo: ALLOW_PROD_WRITE=1 npx tsx scripts/cerrar-alertas-de-proyectos-detenidos.ts --apply");
    return;
  }
  console.log(`\n✓ ${await cerrarAlertasApagadas(apagadas)} alerta(s) cerradas.`);
}

main()
  .catch((e) => {
    console.error("cerrar-alertas-de-proyectos-detenidos:", e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
