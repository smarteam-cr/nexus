import "dotenv/config";
import "./lib/permitir-server-only";
import { imprimirDestino, resolverApply } from "./lib/guard";
import { prisma } from "@/lib/db/prisma";
import { CIERRE_DEL_SISTEMA, PREFIJO_DE_RENOVACION } from "@/lib/cs/alertas-reglas";
import { PREFIJO_DE_LA_LECTURA } from "@/lib/cs/alertas-de-la-lectura";
import { CATEGORIAS_QUE_PINTAN, citaDeLaEvidencia } from "@/lib/cs/cita-de-alerta";

/**
 * scripts/cerrar-alertas-sueltas.ts — el cierre en bloque de la fase 1.2 de docs/nexus-sistema-de-trabajo-plan.md
 * (2026-10-16): las alertas abiertas del vigía pasan a la lectura de la cuenta.
 *
 * Hasta el 2026-10-16 el vigía creaba una alerta nueva cada vez que veía lo mismo (la huella del agente iba en la llave):
 * 150 abiertas, 147 de las 162 de las últimas dos semanas sin tocar. Desde ese deploy hay UNA por cuenta (o proyecto) y
 * categoría, y la ficha muestra la lectura de la cuenta. Este script cierra las de antes, firmadas por el sistema: el
 * vigía vuelve a abrir, ya con la llave nueva, lo que siga viendo (un cierre del sistema no suprime la reaparición,
 * lib/cs/alertas-reglas.ts › `queHacerConLaRedeteccion`). Elías, 2026-10-16: «podemos borrar las alertas actuales».
 *
 * No toca:
 *   · los avisos de renovación de la regla (`renovacion:`): la regla los junta sola por fecha en su corrida diaria;
 *   · lo que levantó la lectura de cada reunión (`lectura:`): es una queja con la frase del cliente;
 *   · las quejas y los retrasos con la frase verificada: pintan el color de la cuenta y son un hecho, no ruido.
 *
 * Correrlo DESPUÉS del deploy de la fase 1.2: antes, el vigía de producción las volvería a crear con la llave vieja.
 *
 *   npx tsx scripts/cerrar-alertas-sueltas.ts                              (simulacro: solo lee)
 *   ALLOW_PROD_WRITE=1 npx tsx scripts/cerrar-alertas-sueltas.ts --apply   (escribe, con respaldo de CsAlert)
 */
const APPLY = resolverApply({ tablas: ["CsAlert"] });

const NOTA = "Se cerró al pasar a la lectura de la cuenta (2026-10-16): si el vigía lo sigue viendo, la vuelve a abrir.";

async function main() {
  imprimirDestino();
  console.log(APPLY ? "=== APPLY (escribe) ===" : "=== SIMULACRO (no escribe) ===");
  const abiertas = await prisma.csAlert.findMany({
    where: { status: { in: ["OPEN", "SEEN"] } },
    select: { id: true, clientId: true, category: true, dedupeKey: true, evidence: true, severity: true, client: { select: { name: true } } },
  });
  const quedan = { regla: 0, lectura: 0, conFrase: 0 };
  const aCerrar = abiertas.filter((a) => {
    if (a.dedupeKey.startsWith(PREFIJO_DE_RENOVACION)) return void quedan.regla++, false;
    if (a.dedupeKey.startsWith(PREFIJO_DE_LA_LECTURA)) return void quedan.lectura++, false;
    if (CATEGORIAS_QUE_PINTAN.has(a.category) && citaDeLaEvidencia(a.evidence)) return void quedan.conFrase++, false;
    return true;
  });

  console.log(`Alertas abiertas: ${abiertas.length}`);
  console.log(`  Se cierran (del vigía, sin frase verificada): ${aCerrar.length}`);
  console.log(`  Quedan: ${quedan.regla} avisos de renovación de la regla · ${quedan.lectura} de la lectura de reuniones · ${quedan.conFrase} con la frase del cliente`);
  const porCategoria = new Map<string, number>();
  for (const a of aCerrar) porCategoria.set(a.category, (porCategoria.get(a.category) ?? 0) + 1);
  console.log("\nPor categoría:");
  for (const [c, n] of [...porCategoria].sort((x, y) => y[1] - x[1])) console.log(`  · ${c}: ${n}`);
  const porCuenta = new Map<string, { nombre: string; n: number }>();
  for (const a of aCerrar) {
    const c = porCuenta.get(a.clientId) ?? { nombre: a.client?.name ?? a.clientId, n: 0 };
    c.n++;
    porCuenta.set(a.clientId, c);
  }
  console.log(`\nEn ${porCuenta.size} cuentas. Las que más tienen:`);
  for (const c of [...porCuenta.values()].sort((x, y) => y.n - x.n).slice(0, 10)) console.log(`  · ${c.nombre}: ${c.n}`);

  if (!aCerrar.length) {
    console.log("\n✓ Nada que cerrar.");
    return;
  }
  if (!APPLY) {
    console.log("\nPara cerrarlas: ALLOW_PROD_WRITE=1 npx tsx scripts/cerrar-alertas-sueltas.ts --apply");
    return;
  }
  const r = await prisma.csAlert.updateMany({
    where: { id: { in: aCerrar.map((a) => a.id) }, status: { in: ["OPEN", "SEEN"] } },
    data: { status: "RESOLVED", resolvedAt: new Date(), resolvedByEmail: CIERRE_DEL_SISTEMA, resolutionNote: NOTA },
  });
  const despues = await prisma.csAlert.count({ where: { status: { in: ["OPEN", "SEEN"] } } });
  console.log(`\n✓ ${r.count} alerta(s) cerradas. Abiertas ahora: ${despues}.`);
}

main()
  .catch((e) => {
    console.error("cerrar-alertas-sueltas:", e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
