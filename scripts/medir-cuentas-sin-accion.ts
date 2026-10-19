/**
 * scripts/medir-cuentas-sin-accion.ts — SOLO LECTURA. Cuántas cuentas sin acción o sin reunión le salen a cada persona
 * en «Para ti» y dónde las ve (2026-10-19).
 *
 * Para cada persona: las cuentas que la regla marca (lib/mi-dia/servicio.ts, por la fuente «Cuenta sin acción»), cuántas
 * de esas aparecen en «Lo que importa hoy» (con «+N en esta cuenta» y «Estabilizar»), en «También para hoy», en «Tus
 * cuentas» y en la cartera de Customer Success (la vista «Sin acción o reunión»), y cuántas tienen una reunión y les falta
 * el siguiente paso (Nexus lo sugiere). A quien lidera Customer Success, además, «<CSE> tiene N cuentas…».
 *
 *   npx tsx scripts/medir-cuentas-sin-accion.ts "Juan Carlos Armijos" "Heiver Gomez" "Caroline Bersot" "Alexander Vanegas"
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
import { cuentasSinServicio, paraAtender } from "@/lib/mi-dia/cartera-cs";
import { FUENTE_CUENTA_SIN_ACCION } from "@/lib/mi-dia/servicio";
import { crDateParts } from "@/lib/jobs/time";
import type { Pendiente } from "@/lib/para-ti/tipos";

const CUENTA = /^\/clients\/([^/?#]+)/;

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
    const todos: Pendiente[] = [...m.importa, ...m.importa.flatMap((p) => p.otrosEnLaCuenta ?? []), ...m.tambien, ...m.semana, ...m.luego];
    const sinAccion = todos.filter((p) => p.fuente === FUENTE_CUENTA_SIN_ACCION);
    const conSugerencia = sinAccion.filter((p) => p.siguientePaso);
    const enImporta = m.importa.filter((p) => p.fuente === FUENTE_CUENTA_SIN_ACCION).length;
    const enOtros = m.importa.flatMap((p) => p.otrosEnLaCuenta ?? []).filter((p) => p.fuente === FUENTE_CUENTA_SIN_ACCION).length;
    const enTambien = m.tambien.filter((p) => p.fuente === FUENTE_CUENTA_SIN_ACCION).length;
    const estabilizar = m.importa.find((p) => p.fuente === "estabilizar");
    console.log(`\n── ${tm.name} (${a.rol}, inicio «${variante}»)`);
    console.log(`   Regla «Cuenta sin acción»: ${sinAccion.length} cuentas (${sinAccion.filter((p) => p.titulo.includes("sin acción ni reunión")).length} sin ninguna de las dos; ${conSugerencia.length} con reunión y sin el siguiente paso, con la sugerencia).`);
    console.log(`   En «Lo que importa hoy»: ${enImporta} · dentro de «+N en esta cuenta»: ${enOtros} · en «También para hoy»: ${enTambien} = ${enImporta + enOtros + enTambien}`);
    if (estabilizar) console.log(`   «${estabilizar.titulo}»: ${estabilizar.enlaces?.length ?? 0} enlaces`);
    for (const p of m.importa.filter((x) => x.fuente === "cs-estabilizar").concat(m.tambien.filter((x) => x.fuente === "cs-estabilizar"))) {
      console.log(`   «${p.titulo}»: ${p.enlaces?.length ?? 0} enlaces`);
    }
    const idsSinAccion = new Set(sinAccion.map((p) => p.clientId ?? CUENTA.exec(p.href)?.[1] ?? ""));
    if (variante === "cse" || variante === "csl" || variante === "dev") {
      const cuentas = await cuentasDelInicio(variante, a, { ahora, hoyISO });
      const faltan = cuentas.filter((c) => (c.servicio?.falta.length ?? 0) > 0);
      console.log(`   «Tus cuentas»: ${cuentas.length} cuentas, ${faltan.length} sin acción o reunión.`);
      if (tieneCarteraDeCs(variante)) {
        const cartera = await cargarCarteraDeCs(variante, a, { ahora, hoyISO });
        if (cartera) {
          const vista = cuentasSinServicio(cartera.empresas);
          const ids = new Set(vista.map((e) => e.clientId));
          const faltanEnLaVista = [...idsSinAccion].filter((id) => !ids.has(id));
          console.log(`   Cartera: ${cartera.empresas.length} empresas; vista «Sin acción o reunión»: ${vista.length}. De las ${idsSinAccion.size} de la regla, faltan en la vista: ${faltanEnLaVista.length}.`);
          const atender = new Set(paraAtender(cartera.empresas, hoyISO).map((x) => x.empresa.clientId));
          const sinServicioFueraDeAtender = vista.filter((e) => !atender.has(e.clientId)).length;
          console.log(`   «Para atender» (a donde llevaba «Ver las N»): ${atender.size}; de las ${vista.length} sin acción o reunión, no estaban ahí: ${sinServicioFueraDeAtender}.`);
        }
      }
    }
    for (const p of conSugerencia.slice(0, 50)) console.log(`     · ${p.titulo} → «${p.siguientePaso!.titulo}» (${p.siguientePaso!.fecha})`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
