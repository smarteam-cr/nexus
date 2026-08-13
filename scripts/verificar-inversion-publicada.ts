/**
 * scripts/verificar-inversion-publicada.ts — SOLO LECTURA. Corré esto ANTES de deployar.
 *
 * ── QUÉ VERIFICA Y POR QUÉ ES UN SCRIPT Y NO UN TEST ────────────────────────
 * El 2026-08-12 la sección de Inversión dejó de tener rama de "dos tarjetas": el shape viejo
 * de HubSpot se PROYECTA a la tabla de factura al renderizar. Y `configForSnapshot` resuelve
 * por KEY contra la config VIVA, así que toda propuesta YA PUBLICADA estrena el renderer.
 *
 * Que eso sea seguro depende de un hecho sobre los DATOS, no sobre el código: los montos
 * viejos son texto libre ("A definir en propuesta formal", "A confirmar con descuento
 * negociado") ⇒ el parser estricto los da "sucio" ⇒ no suman ⇒ no aparece ningún total que el
 * prospecto no haya visto. `inversion.test.ts` congela los montos que hay HOY; este script
 * mira los que hay EL DÍA DEL DEPLOY, que es lo único que gobierna lo que el cliente ve.
 *
 * Salida esperada: CERO propuestas con total nuevo. Si aparece alguna, se mira a mano antes
 * de subir — no es necesariamente un error (puede ser un precio real que ahora se suma bien),
 * pero es una decisión de negocio, no un efecto colateral.
 *
 *   npx tsx scripts/verificar-inversion-publicada.ts
 *
 * No escribe nada, así que NO pide `ALLOW_PROD_WRITE`.
 */
import { createScriptDb } from "./lib/db";
import { adoptarShapeNuevo, esInversionLegacy, gruposDeInversion } from "../lib/landing/inversion";
import { formatRango } from "../lib/landing/money";

interface SnapSection {
  key?: string;
  blocks?: Array<{ data?: unknown }>;
}

async function main() {
  const { prisma: db, close } = createScriptDb();
  try {
    const publicadas = await db.businessCase.findMany({
      where: { publishedAt: { not: null } },
      select: { name: true, publishedAt: true, publishedSnapshot: true },
      orderBy: { publishedAt: "desc" },
    });

    console.log(`Propuestas publicadas: ${publicadas.length}\n`);
    const conTotalNuevo: string[] = [];
    let legacyProyectadas = 0;

    for (const bc of publicadas) {
      const snap = bc.publishedSnapshot as { sections?: SnapSection[] } | null;
      const sec = snap?.sections?.find((s) => s?.key === "inversion");
      const data = sec?.blocks?.[0]?.data as Record<string, unknown> | undefined;
      if (!data) continue;

      const eraLegacy = esInversionLegacy(data);
      // ANTES: la rama de tarjetas nunca mostraba un total. DESPUÉS: se proyecta y se suma.
      const despues = gruposDeInversion(eraLegacy ? adoptarShapeNuevo(data) : data);
      const antes = eraLegacy ? null : gruposDeInversion(data);

      if (eraLegacy) {
        legacyProyectadas++;
        const nuevos = [
          despues.servicios.total && `servicios ${formatRango(despues.servicios.total, despues.moneda)}`,
          despues.licencias.total && `licencias ${formatRango(despues.licencias.total, despues.moneda)}`,
          despues.granTotal && `GRAN TOTAL ${formatRango(despues.granTotal, despues.moneda)}`,
        ].filter(Boolean);
        if (nuevos.length) {
          conTotalNuevo.push(`${bc.name} → ${nuevos.join(" · ")}`);
        } else {
          console.log(`  ok  ${bc.name} — proyectada, sin total nuevo`);
        }
      } else if (antes) {
        // Shape nuevo: el total ya se mostraba. Solo reportamos que no cambió de forma.
        const igual = JSON.stringify(antes.granTotal) === JSON.stringify(despues.granTotal);
        console.log(`  ok  ${bc.name} — shape nuevo, total ${igual ? "sin cambios" : "⚠ DISTINTO"}`);
      }
    }

    console.log(
      `\nLegacy proyectadas: ${legacyProyectadas} · con total NUEVO: ${conTotalNuevo.length}`,
    );
    if (conTotalNuevo.length) {
      console.log(
        "\n⚠ Estas propuestas le van a mostrar al cliente un total que antes no existía:",
      );
      for (const l of conTotalNuevo) console.log(`   - ${l}`);
      console.log("\nMiralas a mano antes de deployar.");
      process.exitCode = 1;
    } else {
      console.log("✅ Ninguna propuesta publicada gana un total. Seguro para deployar.");
    }
  } finally {
    await close();
  }
}

main();
