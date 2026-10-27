/**
 * scripts/tests-preguntas.ts — LOS BANCOS DE PREGUNTAS DEL TEST PÚBLICO, generados y aprobados desde la escala publicada
 * (área O, 2026-10-27).
 *
 * ── POR QUÉ EXISTE ──────────────────────────────────────────────────────────
 * El test público (`/external/test/<área>`) no se abre sin preguntas APROBADAS, y en producción `PreguntasDelTest` nace
 * vacía. Elías decidió (27 oct) abrirlo con los borradores que salen de la escala, tal como salen, para revisarlos ya en
 * producción: este script hace lo mismo que la pantalla (Escala › Tests › «Generar borradores» y «Aprobar» en cada
 * banco), con el mismo código (`borradoresDeLaEscala`, `problemasDelBanco`, `aprobarBanco`), para todos de una vez.
 * La de Marketing (4 preguntas) sale de las 8 de la web: las dimensiones de la capa base (`dimensionesDelBorrador`).
 *
 * ── LO QUE CUIDA ────────────────────────────────────────────────────────────
 *   · Corre contra la escala PUBLICADA (la última en "EscalaDocumento"). `--escala 9.0` aborta si la publicada es otra:
 *     así no se aprueban bancos de la escala de antes por correrlo antes de tiempo.
 *   · Se puede volver a correr: nada se duplica (un banco por área, versión y edición) y lo que está al día no se toca.
 *     Un banco que armó este script con otra versión de la escala se rearma y se vuelve a aprobar. Uno que editó una
 *     persona (Escala › Tests) NO se toca: se lista, y se aprueba en la pantalla.
 *   · No aprueba un banco con problemas (los mismos que frenan el botón «Aprobar»: preguntas que faltan, un nivel que no se
 *     puede elegir, un texto que nombra un nivel o muestra un código de la escala). Los lista.
 *
 * Uso:
 *   npx tsx scripts/tests-preguntas.ts                                  # simulacro: qué haría y 3 preguntas por área
 *   npx tsx scripts/tests-preguntas.ts --escala 9.0                     # ídem, abortando si la publicada no es la 9.0
 *   npx tsx scripts/tests-preguntas.ts --todas                          # además, TODAS las preguntas de cada banco
 *   ALLOW_PROD_WRITE=1 npx tsx scripts/tests-preguntas.ts --escala 9.0 --apply
 */
import "dotenv/config";
import "./lib/permitir-server-only";
import { imprimirDestino, resolverApply } from "./lib/guard";
import { prisma } from "@/lib/db/prisma";
import { leerEscalaVigente } from "@/lib/escala/documento/vigente";
import type { Escala } from "@/lib/escala/documento/tipos";
import { borradoresDeLaEscala, planDeLosBancos, type AccionDelPlan, type PlanDelBanco } from "@/lib/tests-diagnostico/banco";
import { aprobarBanco, crearBorradores, listarBancos, reemplazarBorrador } from "@/lib/tests-diagnostico/repositorio-server";
import { EDICION_GENERAL, ETIQUETA_DE_LA_VERSION, leerPreguntasDelBanco, NOMBRE_DEL_AREA, type PreguntaDelBanco } from "@/lib/tests-diagnostico/tipos";

const APPLY = resolverApply({ tablas: ["PreguntasDelTest"] });
/** Quién queda como autor: así una segunda corrida sabe qué bancos son suyos. */
const POR = "scripts/tests-preguntas.ts";

function argValue(flag: string): string | null {
  const i = process.argv.indexOf(flag);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : null;
}
const ESCALA_ESPERADA = argValue("--escala");
const TODAS = process.argv.includes("--todas");

const firma = (p: readonly PreguntaDelBanco[] | null) => JSON.stringify(leerPreguntasDelBanco(p ?? []));

const ROTULO: Record<AccionDelPlan["tipo"], string> = {
  crear: "se crea y se aprueba",
  rearmar: "se rearma y se vuelve a aprobar",
  aprobar: "se aprueba",
  "al-dia": "al día, no se toca",
  "de-una-persona": "lo editó una persona, no se toca",
};

function imprimirPlan(escala: Escala, plan: readonly PlanDelBanco[]) {
  const nombreDeEdicion = (slug: string) => (slug === EDICION_GENERAL ? "general" : (escala.ediciones.find((e) => e.slug === slug)?.nombre ?? slug));
  console.log(`\nEscala publicada: ${escala.version} · ${escala.ediciones.length} ediciones · ${plan.length} bancos\n`);
  for (const p of plan) {
    const accion = p.accion.tipo === "rearmar" ? `${ROTULO.rearmar} (era de la ${p.accion.desde})` : p.accion.tipo === "de-una-persona" ? `${ROTULO["de-una-persona"]}${p.accion.aprobado ? " (ya aprobado)" : " (SIN aprobar: apruébalo en Escala › Tests)"}` : ROTULO[p.accion.tipo];
    const marca = p.problemas.length ? "⛔" : "·";
    console.log(`${marca} ${NOMBRE_DEL_AREA[p.area].padEnd(9)} ${ETIQUETA_DE_LA_VERSION[p.version].padEnd(32)} ${nombreDeEdicion(p.edicion).padEnd(22)} ${String(p.preguntas.length).padStart(2)} preguntas · ${p.problemas.length ? "NO se aprueba" : accion}`);
    for (const x of p.problemas) console.log(`      ${x}`);
  }

  // Los totales por área y versión (todas las ediciones).
  console.log("\nTotales:");
  for (const area of [...new Set(plan.map((p) => p.area))]) {
    for (const version of [...new Set(plan.map((p) => p.version))]) {
      const de = plan.filter((p) => p.area === area && p.version === version);
      if (!de.length) continue;
      const preguntas = de.reduce((n, p) => n + p.preguntas.length, 0);
      console.log(`  ${NOMBRE_DEL_AREA[area].padEnd(9)} ${ETIQUETA_DE_LA_VERSION[version].padEnd(32)} ${de.length} bancos · ${preguntas} preguntas`);
    }
  }
  const conProblemas = plan.filter((p) => p.problemas.length).length;
  const aEscribir = plan.filter((p) => !p.problemas.length && ["crear", "rearmar", "aprobar"].includes(p.accion.tipo)).length;
  console.log(`\n  ${aEscribir} bancos para aprobar · ${conProblemas} con problemas · ${plan.length - aEscribir - conProblemas} sin cambios`);

  // Tres preguntas de ejemplo por área (la web de la escala general), para revisar la redacción; con --todas, todo.
  console.log(TODAS ? "\nTodas las preguntas de cada banco, como las ve el cliente:" : "\nTres preguntas por área (test web, escala general), como las ve el cliente (--todas para ver cada banco):");
  for (const p of TODAS ? plan : plan.filter((x) => x.version === "web" && x.edicion === EDICION_GENERAL)) {
    console.log(`\n── ${NOMBRE_DEL_AREA[p.area]}${TODAS ? ` · ${ETIQUETA_DE_LA_VERSION[p.version]} · ${nombreDeEdicion(p.edicion)}` : ""} ──`);
    for (const q of TODAS ? p.preguntas : p.preguntas.slice(0, 3)) {
      console.log(`\n  ${q.texto}  [${q.dimensionId}]`);
      if (q.ayuda) console.log(`  (${q.ayuda})`);
      for (const o of q.opciones) console.log(`    ${o.nivel} · ${o.texto}`);
      console.log("    · No lo sé");
    }
  }
}

async function main() {
  imprimirDestino("tests-preguntas");
  const vigente = await leerEscalaVigente();
  if (!("escala" in vigente)) throw new Error(vigente.estado === "sin-tablas" ? "Falta el SQL de la escala en esta base." : "No hay escala publicada.");
  const escala = vigente.escala;
  if (vigente.aviso) console.log(`⚠ ${vigente.aviso}`);
  if (ESCALA_ESPERADA && !(escala.version === ESCALA_ESPERADA || escala.version.startsWith(`${ESCALA_ESPERADA}.`))) {
    throw new Error(`La escala publicada es la ${escala.version}, no la ${ESCALA_ESPERADA}. Publícala primero y vuelve a correrlo.`);
  }

  const bancos = await listarBancos();
  // Las preguntas ya leídas: así se comparan igual que lo guardado (textos recortados).
  const borradores = borradoresDeLaEscala(escala).map((f) => ({ ...f, preguntas: leerPreguntasDelBanco(f.preguntas) }));
  const plan = planDeLosBancos(escala, borradores, bancos, POR);
  imprimirPlan(escala, plan);

  if (!APPLY) {
    console.log("\nSimulacro: no se escribió nada. Para aplicarlo: ALLOW_PROD_WRITE=1 npx tsx scripts/tests-preguntas.ts --escala <versión> --apply");
    return;
  }

  // 1. Crear los que faltan (ON CONFLICT DO NOTHING: si otro los creó en el medio, no se duplica).
  const nuevos = plan.filter((p) => p.accion.tipo === "crear" && !p.problemas.length);
  const creados = await crearBorradores(
    nuevos.map((p) => ({ area: p.area, version: p.version, edicion: p.edicion, escalaVersion: escala.version, preguntas: p.preguntas })),
    POR,
  );
  // 2. Rearmar y aprobar, sobre lo que hay guardado AHORA (si una persona lo editó en el medio, no se pisa).
  const ahora = await listarBancos();
  let aprobados = 0;
  const saltados: string[] = [];
  for (const p of plan) {
    if (p.problemas.length || !["crear", "rearmar", "aprobar"].includes(p.accion.tipo)) continue;
    const nombre = `${NOMBRE_DEL_AREA[p.area]} · ${p.version} · ${p.edicion}`;
    const b = ahora.find((x) => x.area === p.area && x.version === p.version && x.edicion === p.edicion);
    if (!b) {
      saltados.push(`${nombre}: no quedó guardado`);
      continue;
    }
    if (firma(b.preguntas) !== firma(p.preguntas)) {
      // Solo si sigue siendo el que se leyó: una edición de una persona en el medio no se pisa.
      const antes = bancos.find((x) => x.id === b.id)?.preguntas;
      if (b.editadoPor !== POR || !antes || firma(antes) !== firma(b.preguntas) || !(await reemplazarBorrador(b.id, b.preguntas, p.preguntas, POR))) {
        saltados.push(`${nombre}: lo editó una persona mientras corría`);
        continue;
      }
    }
    if (await aprobarBanco(b.id, p.preguntas, escala.version, POR)) aprobados++;
    else saltados.push(`${nombre}: cambió mientras se aprobaba`);
  }
  console.log(`\nAplicado: ${creados} bancos creados, ${aprobados} aprobados.`);
  for (const s of saltados) console.log(`  ⚠ ${s}`);
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
