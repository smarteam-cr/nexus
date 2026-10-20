/**
 * scripts/medir-seguimiento-de-cuentas.ts — SOLO LECTURA. Lo que ve cada persona en Éxito del cliente › «Seguimiento de
 * cuentas» (2026-10-19, lib/mi-dia/seguimiento.ts): cuántas cuentas, cuántas sin sesión agendada en 30 días, cuántas sin
 * siguiente paso, de cuántas no se pudo leer el calendario y cuántas no tienen temas. Con el filtro de entrada (el CSE,
 * las suyas) y con «Todos».
 *
 *   npx tsx scripts/medir-seguimiento-de-cuentas.ts "Juan Carlos Armijos" "Heiver Gomez" "Caroline Bersot" "Liliana Moreno" "Valentina Sandoval"
 *
 * No escribe nada: lee la base, la copia de HubSpot y el calendario de cada persona, como la página. Con `--detalle`
 * imprime cada cuenta con su próxima sesión, su paso y sus temas (nombres de clientes: no lo pegues fuera del equipo).
 */
import "dotenv/config";
import "./lib/permitir-server-only";
import { prisma } from "@/lib/db/prisma";
import { SELECT_MIEMBRO_PARA_ALCANCE } from "@/lib/para-ti/alcance-server";
import { cargarSeguimientoDeCuentas } from "@/lib/mi-dia/seguimiento-server";
import { conteosDelSeguimiento, filtrarSeguimiento } from "@/lib/mi-dia/seguimiento";
import { crDateParts } from "@/lib/jobs/time";

async function main() {
  const detalle = process.argv.includes("--detalle");
  const nombres = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  if (nombres.length === 0) throw new Error('Pasa los nombres: npx tsx scripts/medir-seguimiento-de-cuentas.ts "Heiver Gomez"');
  const ahora = new Date();
  const hoyISO = crDateParts(ahora).dateKey;
  for (const nombre of nombres) {
    const tm = await prisma.teamMember.findFirst({
      where: { name: { contains: nombre, mode: "insensitive" }, deactivatedAt: null },
      select: SELECT_MIEMBRO_PARA_ALCANCE,
    });
    if (!tm) {
      console.log(`\n── ${nombre}: no está en el equipo`);
      continue;
    }
    const t0 = Date.now();
    const s = await cargarSeguimientoDeCuentas(tm, { ahora, hoyISO });
    const ms = Date.now() - t0;
    const deEntrada = filtrarSeguimiento(s.filas, s.filtros);
    const a = conteosDelSeguimiento(deEntrada);
    const todas = conteosDelSeguimiento(s.filas);
    const sinTemas = deEntrada.filter((f) => f.temas.length === 0).length;
    console.log(`\n── ${tm.name} (${tm.roleEnum}${s.lider ? ", ve toda la cartera" : ""}) · cargó en ${(ms / 1000).toFixed(1)} s`);
    console.log(
      `   De entrada (${s.filtros.cse ? "sus cuentas" : "todas"}): ${a.total} cuentas · ${a.sinSesion} sin sesión agendada · ${a.sinPaso} sin siguiente paso · ${a.sinCalendario} con el calendario sin leer · ${sinTemas} sin temas`,
    );
    if (s.filtros.cse) console.log(`   Con «Todos los CSE»: ${todas.total} cuentas · ${todas.sinSesion} sin sesión · ${todas.sinPaso} sin siguiente paso`);
    if (detalle) {
      for (const f of deEntrada) {
        const sesion = f.proximaSesion ? `${f.proximaSesion.inicio.slice(0, 10)} ${f.proximaSesion.titulo}` : f.calendarioLeido ? "SIN SESIÓN" : "calendario sin leer";
        const paso = f.paso ? (f.paso.tipo === "accion" ? `T-${f.paso.numero} ${f.paso.titulo}` : `reunión ${f.paso.dia}`) : "SIN PASO";
        console.log(`   · ${f.nombre} | ${sesion} | ${paso}`);
        for (const t of f.temas) console.log(`       – ${t.texto}  [${t.origen} · ${t.fecha.slice(0, 10)}]`);
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
