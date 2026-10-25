/**
 * scripts/escala-borrador-9-0.ts — abre el BORRADOR 9.0.0 de la escala desde la 8.9.1 publicada y le aplica el
 * catálogo (lib/escala/nueve/catalogo.ts): lo pendiente para la 9.0 (docs/escala/pendiente-9-0.md) y los cambios
 * de engagement avanzado (docs/escala-engagement-avanzado-plan.md). Decisión de Elías del 24 oct: se escribe ya
 * como borrador y se publica después de probar la 8.9.1 con 5 a 8 clientes (nunca Wherex).
 *
 * La 8.9.1 publicada no se toca: el borrador es una versión aparte (`EscalaVersion` en `borrador`). Cada punto del
 * catálogo se guarda por separado en la bitácora (`EscalaCambio`), con una nota que cita el punto que lo pide. Al
 * final entra la parte «Lo que falta decidir», con las preguntas para Elías; mientras esté, no se publica.
 *
 *   npx tsx scripts/escala-borrador-9-0.ts                  # simulacro: aplica en memoria y corre las pruebas
 *   npx tsx scripts/escala-borrador-9-0.ts --informe        # además reescribe docs/escala/borrador-9-0.md
 *   $env:ALLOW_PROD_WRITE="1"; npx tsx scripts/escala-borrador-9-0.ts --apply [--por correo@smarteamcr.com]
 *
 * Con --apply: si no hay borrador, lo abre (9.0.0 desde la 8.9.1); si ya hay uno que no es el 9.0.0 o que ya tiene
 * cambios, frena (no pisa el trabajo de nadie: `scripts/escala-datos.ts descartar` lo saca, a sabiendas).
 */
import "dotenv/config";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { resolverApply } from "./lib/guard";
import { createScriptDb } from "./lib/db";
import { leerRetirados } from "@/lib/escala/documento/parsear";
import { validarEscala } from "@/lib/escala/documento/validar";
import { cambiosEntre } from "@/lib/escala/datos/diferencias";
import { escalaDeLosDatos, generarMarkdown } from "@/lib/escala/datos/generar";
import { conVersion, crearBorrador, guardarEnElBorrador, huellaDeLosDatos, leerBorrador, ultimaPublicada } from "@/lib/escala/datos/versiones";
import { comprobarQueSeLee } from "@/lib/escala/nueve/aplicar";
import { CATALOGO } from "@/lib/escala/nueve/catalogo";
import { aplicarConDetalle, conLoQueFaltaDecidir, informeEnMarkdown, notaDeLaBitacora, parteLoQueFaltaDecidir } from "@/lib/escala/nueve/informe";

const VERSION = "9.0.0";
const DESDE = "8.9.1";
const APPLY = resolverApply({ tablas: ["EscalaVersion", "EscalaCambio"] });
const INFORME = process.argv.includes("--informe");

function argumento(nombre: string): string | null {
  const i = process.argv.indexOf(nombre);
  return i !== -1 ? (process.argv[i + 1] ?? null) : null;
}

/** El correo de git, si no se pasa --por (y solo vale si es del equipo). */
function correoDeGit(): string | null {
  const r = spawnSync("git", ["config", "user.email"], { encoding: "utf8" });
  return r.status === 0 ? r.stdout.trim() || null : null;
}

async function main() {
  const { prisma, close } = createScriptDb();
  try {
    const base = await ultimaPublicada(prisma);
    if (!base) throw new Error("No hay ninguna versión de la escala publicada como datos.");
    if (base.version !== DESDE) throw new Error(`El catálogo se escribió sobre la ${DESDE} y la última publicada es la ${base.version}: revísalo antes.`);
    const especificacion = await prisma.escalaDocumento.findFirst({ where: { documento: "especificacion" }, orderBy: { publicadaEn: "desc" }, select: { texto: true, version: true } });
    const textoEspec = especificacion?.texto ?? fs.readFileSync(path.join(process.cwd(), "docs/escala/especificacion_calculo_escala.md"), "utf8");
    const retiradosPrevios = leerRetirados(textoEspec);

    const datosBase = conVersion(base.datos, VERSION);
    const { estado, detalle, pasos } = aplicarConDetalle(datosBase, retiradosPrevios, CATALOGO);
    const parte = parteLoQueFaltaDecidir(VERSION, estado, CATALOGO);
    const final = conLoQueFaltaDecidir(estado.datos, parte);
    comprobarQueSeLee(final);

    // Las pruebas de publicar, con los retirados de este borrador ya anotados en la especificación (como al publicar).
    const espec = textoEspec.replace(/(Identificadores retirados, que no se vuelven a usar: )/, `$1${estado.retirados.map((x) => "`" + x + "`").join(", ")}, `);
    const md = generarMarkdown(final);
    const pruebas = validarEscala(escalaDeLosDatos(final), { anterior: escalaDeLosDatos(base.datos), especificacion: espec, calculo: { texto: md } });

    const porEstado = new Map<string, number>();
    for (const e of CATALOGO) porEstado.set(e.estado, (porEstado.get(e.estado) ?? 0) + 1);
    console.log(`${APPLY ? "APLICANDO" : "SIMULACRO (sin --apply no se escribe nada)"} · borrador ${VERSION} desde la ${base.version}\n`);
    console.log(`${CATALOGO.length} puntos: ${[...porEstado].map(([k, n]) => `${n} ${k}`).join(", ")}`);
    console.log(`${Object.keys(estado.alias).length} criterios nuevos · ${estado.retirados.length} retirados · ${estado.consecuencias.length} cosas que las ediciones tienen que reescribir`);
    console.log("Pruebas (con los retirados anotados en la especificación):");
    for (const p of pruebas) {
      console.log(`  ${p.ok ? "PASA " : "FALLA"} ${p.nombre}`);
      for (const d of p.detalle.slice(0, 5)) console.log(`        ${d}`);
    }
    console.log("  (la 3 falla hasta rehacer el ejemplo de Priorización de Leads de la especificación: está en «Lo que falta decidir»)");

    if (INFORME) {
      const ruta = path.join(process.cwd(), "docs/escala/borrador-9-0.md");
      fs.writeFileSync(ruta, informeEnMarkdown(VERSION, estado, detalle));
      console.log(`\n✓ ${path.relative(process.cwd(), ruta)}`);
    }
    if (!APPLY) return;

    // Quien firma la bitácora tiene que ser del equipo (como en scripts/escala-datos.ts): la bitácora no se corrige.
    const candidato = argumento("--por") ?? correoDeGit();
    const miembro = candidato ? await prisma.teamMember.findFirst({ where: { email: { equals: candidato, mode: "insensitive" } }, select: { email: true } }) : null;
    if (!miembro) throw new Error(`${candidato ? `«${candidato}» no es del equipo en Nexus.` : "Falta quién escribe."} Usa --por tu@smarteamcr.com.`);
    const por = miembro.email;
    let borrador = await leerBorrador(prisma);
    if (borrador && (borrador.version !== VERSION || borrador.revision > 0 || borrador.basadaEn !== DESDE)) {
      throw new Error(
        `Ya hay un borrador abierto (la ${borrador.version}, desde la ${borrador.basadaEn ?? "—"}, revisión ${borrador.revision}). No se pisa: revísalo o descártalo con scripts/escala-datos.ts.`,
      );
    }
    if (!borrador) borrador = await crearBorrador(prisma, { version: VERSION, desde: DESDE, por });
    console.log(`\nBorrador ${borrador.version} abierto. Guardando punto por punto…`);

    // «Lo que falta decidir» va PRIMERO: si la corrida se corta a la mitad, el borrador ya no se puede publicar.
    const conParte = conLoQueFaltaDecidir(borrador.datos, parte);
    let r = await guardarEnElBorrador(prisma, {
      borrador,
      datos: conParte,
      cambios: cambiosEntre(borrador.datos, conParte),
      origen: "importacion",
      por,
      nota: "9.0 · Lo que falta decidir: las preguntas para Elías, lo que falta escribir y lo que espera la prueba. Sale antes de publicar.",
    });
    borrador = { ...borrador, revision: r.revision, datos: conParte };
    let antes = conParte;
    let guardados = 0;
    for (let i = 0; i < CATALOGO.length; i++) {
      const despues = conLoQueFaltaDecidir(pasos[i], parte);
      const cambios = cambiosEntre(antes, despues);
      if (cambios.length === 0) continue;
      r = await guardarEnElBorrador(prisma, { borrador, datos: despues, cambios, origen: "importacion", por, nota: notaDeLaBitacora(CATALOGO[i]) });
      borrador = { ...borrador, revision: r.revision, datos: despues };
      antes = despues;
      guardados++;
    }
    if (huellaDeLosDatos(antes) !== huellaDeLosDatos(final)) throw new Error("El borrador guardado no quedó igual al del simulacro: revísalo antes de seguir.");
    console.log(`✓ «Lo que falta decidir» y ${guardados} puntos guardados en la bitácora. Revisión ${r.revision}. Se ve en /escala/borrador.`);
  } finally {
    await close();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
