/**
 * scripts/medir-cuentas-sin-accion.ts — SOLO LECTURA. Qué ve arriba cada persona de Customer Success en «Para ti»
 * (2026-10-19; los tres bloques de lib/para-ti/foco.ts y la regla única del siguiente paso de lib/mi-dia/servicio.ts).
 *
 * Para cada persona: cuántas cosas ve arriba y en cada bloque (reuniones con sus cuentas, cuentas sin siguiente paso,
 * pendientes sin seguimiento), cuántas bajan a «También para hoy» y a «Esta semana», cuántas cuentas tienen una reunión
 * agendada como siguiente paso, y en la cartera de Customer Success, cuántas están «Sin siguiente paso». A quien lidera,
 * por CSE.
 *
 *   npx tsx scripts/medir-cuentas-sin-accion.ts "Juan Carlos Armijos" "Heiver Gomez" "Caroline Bersot" "Liliana Moreno" "Alexander Vanegas"
 *
 * No escribe nada: lee la base, el calendario de cada persona y la copia de HubSpot, como la página.
 */
import "dotenv/config";
import "./lib/permitir-server-only";
import { prisma } from "@/lib/db/prisma";
import { alcanceDe } from "@/lib/para-ti/alcance-server";
import { medirParaTi } from "@/lib/para-ti/medir-server";
import { varianteDelInicio } from "@/lib/mi-dia/inicio";
import { cuentasDelInicio } from "@/lib/mi-dia/inicio-server";
import { cargarCarteraDeCs, tieneCarteraDeCs } from "@/lib/mi-dia/cartera-cs-server";
import { cuentasSinServicio } from "@/lib/mi-dia/cartera-cs";
import { crDateParts } from "@/lib/jobs/time";

async function main() {
  const nombres = process.argv.slice(2);
  if (nombres.length === 0) throw new Error('Pasa los nombres: npx tsx scripts/medir-cuentas-sin-accion.ts "Juan Carlos Armijos"');
  const ahora = new Date();
  const hoyISO = crDateParts(ahora).dateKey;
  for (const nombre of nombres) {
    const tm = await prisma.teamMember.findFirst({ where: { name: { contains: nombre, mode: "insensitive" }, deactivatedAt: null } });
    if (!tm) {
      console.log(`\n── ${nombre}: no está en el equipo`);
      continue;
    }
    const a = await alcanceDe(tm);
    const variante = varianteDelInicio({ rol: a.rol, frentes: a.frentes, tieneVentas: false });
    const m = await medirParaTi(a, ahora);
    console.log(`\n── ${tm.name} (${a.rol}, inicio «${variante}»)`);
    console.log(`   Arriba: ${m.importa.length} · «También para hoy»: ${m.tambien.length} · «Esta semana»: ${m.semana.length}`);
    for (const b of m.foco?.bloques ?? []) {
      const grupos = [...new Set(b.items.map((x) => x.grupo).filter(Boolean))];
      console.log(`   ${b.titulo}: se ven ${b.items.length} de ${b.total}${grupos.length ? ` (${grupos.length} grupos: ${grupos.join(", ")})` : ""}`);
      for (const it of b.items.slice(0, 12)) console.log(`     · ${it.grupo ? `[${it.grupo}] ` : ""}${it.titulo} — ${it.detalle.slice(0, 90)}`);
    }
    if (!m.foco) for (const it of m.importa) console.log(`     · ${it.titulo}`);
    if (variante === "cse" || variante === "csl" || variante === "dev") {
      const cuentas = await cuentasDelInicio(variante, a, { ahora, hoyISO });
      const conReunion = cuentas.filter((c) => c.servicio?.paso?.tipo === "reunion");
      const sinPaso = cuentas.filter((c) => c.servicio && !c.servicio.paso);
      console.log(`   «Tus cuentas»: ${cuentas.length}; con la reunión como siguiente paso: ${conReunion.length}; sin siguiente paso: ${sinPaso.length}.`);
      if (tieneCarteraDeCs(variante)) {
        const cartera = await cargarCarteraDeCs(variante, a, { ahora, hoyISO });
        if (cartera) console.log(`   Cartera: ${cartera.empresas.length} empresas; vista «Sin siguiente paso»: ${cuentasSinServicio(cartera.empresas).length}.`);
      }
    }
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
