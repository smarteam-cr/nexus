/**
 * scripts/fallas-de-hubspot.ts — cuántos 401 y 429 de HubSpot hubo cada día (U6). SOLO LEE.
 *
 * Lee la fila `hubspot-transporte` de `CronJobState` que llena lib/hubspot/registro-de-fallas.ts. Es la medida del
 * criterio de éxito de U6 (docs/integracion-hubspot-plan.md): «vistos» es lo que respondió HubSpot (el número de
 * antes: sin el transporte cada 429 llegaba al llamador), «fallas» es lo que llegó al llamador con el transporte
 * puesto (la meta: 7 días seguidos en 0). Solo cuenta la app: los scripts no se registran.
 *
 * Uso: npx tsx scripts/fallas-de-hubspot.ts [--dias 14]
 * (en un worktree sin .env: `DOTENV_CONFIG_PATH=<repo>/.env npx tsx scripts/fallas-de-hubspot.ts`)
 */
import { createScriptDb } from "./lib/db";
import { FILA_DEL_REGISTRO, diasSeguidosEnCero, type RegistroGuardado } from "../lib/hubspot/registro-de-fallas";
import { crDateParts } from "../lib/jobs/time";

function argDias(): number {
  const i = process.argv.indexOf("--dias");
  const n = i >= 0 ? Number.parseInt(process.argv[i + 1] ?? "", 10) : 14;
  return Number.isFinite(n) && n > 0 ? n : 14;
}

async function main() {
  const { prisma, close } = createScriptDb();
  try {
    const fila = await prisma.cronJobState.findUnique({ where: { id: FILA_DEL_REGISTRO }, select: { lastResult: true } });
    const registro = fila?.lastResult as RegistroGuardado | null | undefined;
    if (!registro || registro.version !== 1) {
      console.log("Todavía no hay nada registrado (el registro empieza con el deploy de U6).");
      return;
    }
    const dias = Object.keys(registro.dias).sort().slice(-argDias());
    console.log(`Último guardado: ${registro.at}\n`);
    console.log("día          pedidos  vistos401  renov.  fallas401  vistos429  espera(s)  fallas429  cupoMín");
    for (const dia of dias) {
      const c = registro.dias[dia];
      const columnas = [
        dia.padEnd(12),
        String(c.pedidos ?? 0).padStart(7),
        String(c.vistos401).padStart(10),
        String(c.renovaciones).padStart(7),
        String(c.fallas401).padStart(10),
        String(c.vistos429).padStart(10),
        (c.esperaMs / 1000).toFixed(1).padStart(10),
        String(c.fallas429).padStart(10),
        String(c.cupoMinimo ?? "-").padStart(8),
      ];
      console.log(columnas.join(" "));
    }
    const racha = diasSeguidosEnCero(registro.dias, crDateParts(new Date()).dateKey);
    console.log("");
    console.log(`Días seguidos hasta hoy sin ninguna falla que llegara al llamador: ${racha} (meta de U6: 7).`);
    console.log("Un día sin fila es un día sin pedidos a HubSpot.");
  } finally {
    await close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
