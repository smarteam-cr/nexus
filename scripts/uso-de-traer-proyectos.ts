/**
 * scripts/uso-de-traer-proyectos.ts — cuántas veces se trajo la ficha de un cliente desde HubSpot cada día, y quién lo
 * disparó: el botón «Traer proyectos de HubSpot» o la ficha al abrirse (2026-10-29). SOLO LEE.
 *
 * Lee la fila `hubspot-traer-proyectos` de `CronJobState` que llena lib/hubspot/uso-de-traer-proyectos.ts (desde el
 * deploy del 29 oct; antes no había registro).
 *
 *   npx tsx scripts/uso-de-traer-proyectos.ts
 */
import "dotenv/config";
import "./lib/permitir-server-only";
import { prisma } from "@/lib/db/prisma";
import { FILA_DEL_USO, type UsoGuardado } from "@/lib/hubspot/uso-de-traer-proyectos";

async function main() {
  const fila = await prisma.cronJobState.findUnique({ where: { id: FILA_DEL_USO }, select: { lastResult: true } });
  const uso = fila?.lastResult as UsoGuardado | null | undefined;
  if (!uso || uso.version !== 1 || !Object.keys(uso.dias).length) {
    console.log("Todavía no hay nada registrado (el registro empieza con el deploy del 29 oct).");
    return;
  }
  console.log("día         · botón: completa / releyó / en curso / piso / error · al abrir la ficha: completa / en curso / piso / error");
  for (const [dia, c] of Object.entries(uso.dias).sort(([a], [b]) => a.localeCompare(b))) {
    const n = (k: keyof typeof c) => String(c[k] ?? 0);
    console.log(
      `${dia}  · ${[n("boton.corrio"), n("boton.releyo"), n("boton.en_vuelo"), n("boton.piso"), n("boton.error")].join(" / ")}` +
        `  · ${[n("fondo.corrio"), n("fondo.en_vuelo"), n("fondo.piso"), n("fondo.error")].join(" / ")}`,
    );
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
