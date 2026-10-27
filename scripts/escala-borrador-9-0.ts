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
 * Con --apply: si no hay borrador, lo abre (9.0.0 desde la 8.9.1); si ya hay uno que no es el 9.0.0, frena.
 * Si el 9.0.0 ya tiene cambios, CONTINÚA desde donde quedó (2026-10-26, noche 3: N4, N6 y N7 se sumaron al final del
 * catálogo): busca la última entrada del catálogo con la que el borrador queda igual —sin «Lo que falta decidir»— y
 * guarda solo las que siguen, cada una con su nota, más «Lo que falta decidir» al día. Si el borrador no es igual a
 * ningún punto del catálogo, o si su bitácora tiene un cambio que no hizo este script (alguien lo cambió a mano, también
 * en «Lo que falta decidir»), frena: no pisa el trabajo de nadie (`scripts/escala-datos.ts descartar` lo saca, a sabiendas).
 *
 * ⚠ El --apply va DESPUÉS del deploy de la rama que trae lo que escribe: la marca «tráfico suficiente» (N4) solo la lee
 * ese código, y con el de antes Escala › Borrador no abre para nadie. El script lo mira solo: pide el commit que corre
 * en producción (/api/health) y frena si ese código no la lee. Si no lo puede mirar (sin red, o sin ese commit en el
 * repo local: `git fetch`), pide `--desplegado` para seguir, como confirmación de quien lo corre.
 *
 * Con --cerrar (2026-10-27, Elías: «publica»): después del catálogo aplica el CIERRE (lib/escala/nueve/cierre.ts), una
 * decisión provisional por cada pendiente, cada una con su nota en la bitácora, y al final saca «Lo que falta decidir».
 * Las pruebas del simulacro corren entonces contra la especificación del repo (la 1.4.0, con los retirados de la 9.0).
 * Un borrador ya cerrado no se vuelve a abrir: sin --cerrar, frena; con --cerrar, suma solo las correcciones del cierre
 * (`CORRECCIONES`) que todavía no tiene, sin volver a poner «Lo que falta decidir».
 *
 *   $env:ALLOW_PROD_WRITE="1"; $env:SIN_RESPALDO="1"; npx tsx scripts/escala-borrador-9-0.ts --cerrar --apply --por correo@smarteamcr.com
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
import type { EscalaDatos } from "@/lib/escala/datos/tipos";
import { comprobarQueSeLee } from "@/lib/escala/nueve/aplicar";
import { CATALOGO } from "@/lib/escala/nueve/catalogo";
import { aplicarConDetalle, conLoQueFaltaDecidir, informeEnMarkdown, notaDeLaBitacora, parteLoQueFaltaDecidir, sinLoQueFaltaDecidir } from "@/lib/escala/nueve/informe";
import { CIERRE, CORRECCIONES, entradasDelCierre, FINAL, NOTA_DE_LA_SALIDA, notaDelCierre } from "@/lib/escala/nueve/cierre";
import { tieneLoQueFaltaDecidir } from "@/lib/escala/datos/reglas";

const VERSION = "9.0.0";
const DESDE = "8.9.1";
const APPLY = resolverApply({ tablas: ["EscalaVersion", "EscalaCambio"] });
const INFORME = process.argv.includes("--informe");
const CERRAR = process.argv.includes("--cerrar");
/** Lo que se aplica: el catálogo y, con --cerrar, las decisiones del cierre. */
const ENTRADAS = CERRAR ? [...CATALOGO, ...entradasDelCierre()] : [...CATALOGO];
const DECISIONES = [...CIERRE, FINAL, ...CORRECCIONES];
const notaDe = (i: number) => (i < CATALOGO.length ? notaDeLaBitacora(CATALOGO[i]) : notaDelCierre(DECISIONES[i - CATALOGO.length]));
const URL_DE_SALUD = process.env.NEXUS_HEALTH_URL ?? "https://nexus.smarteamcr.com/api/health";
/** Lo que tiene que leer el código de producción antes de escribir el borrador (la etiqueta de la marca de N4). */
const LO_QUE_TIENE_QUE_LEER = { archivo: "lib/escala/documento/parsear.ts", texto: "· tráfico suficiente" };

/** ¿El código que corre en producción lee lo que se va a escribir? true / false, o null si no se pudo mirar. */
async function produccionLoLee(): Promise<{ lee: boolean | null; detalle: string }> {
  let sha: string | null = null;
  try {
    const r = await fetch(URL_DE_SALUD, { signal: AbortSignal.timeout(10_000) });
    sha = ((await r.json()) as { sha?: string }).sha ?? null;
  } catch (e) {
    return { lee: null, detalle: `no se pudo pedir ${URL_DE_SALUD}: ${e instanceof Error ? e.message : String(e)}` };
  }
  if (!sha || !/^[0-9a-f]{7,40}$/i.test(sha)) return { lee: null, detalle: `${URL_DE_SALUD} no dijo qué commit corre` };
  const r = spawnSync("git", ["show", `${sha}:${LO_QUE_TIENE_QUE_LEER.archivo}`], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0) return { lee: null, detalle: `el commit de producción (${sha.slice(0, 8)}) no está en este repo: corre git fetch` };
  return { lee: r.stdout.includes(LO_QUE_TIENE_QUE_LEER.texto), detalle: `producción corre ${sha.slice(0, 8)}` };
}

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
    const { estado, detalle, pasos } = aplicarConDetalle(datosBase, retiradosPrevios, ENTRADAS);
    const parte = parteLoQueFaltaDecidir(VERSION, estado, CATALOGO);
    const final = CERRAR ? sinLoQueFaltaDecidir(estado.datos, parte) : conLoQueFaltaDecidir(estado.datos, parte);
    comprobarQueSeLee(final);

    // Las pruebas de publicar, con los retirados de este borrador ya anotados en la especificación (como al publicar).
    // Al cerrar, contra la especificación del repo, que ya los trae (y el ejemplo de Priorización de Leads rehecho).
    const espec = CERRAR
      ? fs.readFileSync(path.join(process.cwd(), "docs/escala/especificacion_calculo_escala.md"), "utf8").replace(/\r\n?/g, "\n")
      : textoEspec.replace(/(Identificadores retirados, que no se vuelven a usar: )/, `$1${estado.retirados.map((x) => "`" + x + "`").join(", ")}, `);
    const md = generarMarkdown(final);
    const pruebas = validarEscala(escalaDeLosDatos(final), { anterior: escalaDeLosDatos(base.datos), especificacion: espec, calculo: { texto: md } });

    const porEstado = new Map<string, number>();
    for (const e of CATALOGO) porEstado.set(e.estado, (porEstado.get(e.estado) ?? 0) + 1);
    console.log(`${APPLY ? "APLICANDO" : "SIMULACRO (sin --apply no se escribe nada)"} · borrador ${VERSION} desde la ${base.version}\n`);
    console.log(`${CATALOGO.length} puntos: ${[...porEstado].map(([k, n]) => `${n} ${k}`).join(", ")}`);
    if (CERRAR) console.log(`Cierre: ${CIERRE.length} decisiones provisionales (${CIERRE.filter((d) => d.ops.length).length} cambian el texto) y la entrada del historial; sale «Lo que falta decidir».`);
    console.log(`${Object.keys(estado.alias).length} criterios nuevos · ${estado.retirados.length} retirados · ${estado.consecuencias.length} cosas que las ediciones tienen que reescribir`);
    console.log("Pruebas (con los retirados anotados en la especificación):");
    for (const p of pruebas) {
      console.log(`  ${p.ok ? "PASA " : "FALLA"} ${p.nombre}`);
      for (const d of p.detalle.slice(0, 5)) console.log(`        ${d}`);
    }
    if (!CERRAR) console.log("  (la 3 falla hasta rehacer el ejemplo de Priorización de Leads de la especificación: está en «Lo que falta decidir»)");

    // El `.md` que quedaría, para leerlo antes de escribir nada (no toca el repo salvo que se le pida esa ruta).
    const salida = argumento("--md");
    if (salida) {
      fs.writeFileSync(salida, md);
      console.log(`\n✓ El .md del simulacro: ${salida}`);
    }
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
    const prod = await produccionLoLee();
    if (prod.lee === false) {
      throw new Error(
        `${prod.detalle}, y ese código no lee la marca «tráfico suficiente»: con el borrador escrito, Escala › Borrador no abriría. Despliega primero la rama que la trae.`,
      );
    }
    if (prod.lee === null && !process.argv.includes("--desplegado")) {
      throw new Error(`No se pudo mirar qué corre en producción (${prod.detalle}). Si ya está desplegada la rama que trae la marca «tráfico suficiente», vuelve a correrlo con --desplegado.`);
    }
    console.log(prod.lee ? `✓ ${prod.detalle}, que lee lo que se escribe.` : "⚠ No se pudo mirar producción: sigue por --desplegado.");
    let borrador = await leerBorrador(prisma);
    if (borrador && (borrador.version !== VERSION || borrador.basadaEn !== DESDE)) {
      throw new Error(
        `Ya hay un borrador abierto (la ${borrador.version}, desde la ${borrador.basadaEn ?? "—"}, revisión ${borrador.revision}). No se pisa: revísalo o descártalo con scripts/escala-datos.ts.`,
      );
    }
    if (!borrador) borrador = await crearBorrador(prisma, { version: VERSION, desde: DESDE, por });
    // Un borrador ya cerrado (sin «Lo que falta decidir») no se vuelve a abrir.
    const cerrado = borrador.revision > 0 && !tieneLoQueFaltaDecidir(generarMarkdown(borrador.datos));
    if (cerrado && !CERRAR) throw new Error(`El borrador ${borrador.version} ya está cerrado (no tiene «Lo que falta decidir»): sin --cerrar se volvería a abrir.`);
    // Desde dónde sigue: la última entrada con la que el borrador queda igual (0 = recién abierto, nada aplicado).
    const huellaDelBorrador = huellaDeLosDatos(sinLoQueFaltaDecidir(borrador.datos, parte));
    const desde = [datosBase, ...pasos].map((d) => huellaDeLosDatos(sinLoQueFaltaDecidir(d, parte))).lastIndexOf(huellaDelBorrador);
    if (desde === -1) {
      throw new Error(
        `El borrador ${borrador.version} (revisión ${borrador.revision}) no es igual a ningún punto del catálogo: alguien lo cambió a mano. No se pisa: revísalo antes de seguir.`,
      );
    }
    // La comparación deja afuera «Lo que falta decidir», que este script reescribe entera. Lo que alguien haya cambiado
    // ahí (o en cualquier parte) queda en la bitácora con otro origen u otra nota: con eso, frena.
    const ajenos = await prisma.escalaCambio.count({
      // Con OR y el nulo a la vista: un NOT sobre una nota vacía no cuenta la fila en SQL.
      where: { versionId: borrador.id, OR: [{ origen: { not: "importacion" } }, { nota: null }, { NOT: { nota: { startsWith: "9.0 · " } } }] },
    });
    if (ajenos > 0) {
      throw new Error(
        `El borrador ${borrador.version} tiene ${ajenos} cambio(s) en la bitácora que no hizo este script (el editor o una importación a mano): «Lo que falta decidir» se reescribiría entera. No se pisa: revísalo antes de seguir.`,
      );
    }
    console.log(
      desde === 0
        ? `\nBorrador ${borrador.version} abierto. Guardando punto por punto…`
        : `\nEl borrador ${borrador.version} ya tiene ${desde} de los ${ENTRADAS.length} puntos (revisión ${borrador.revision}). Se suman los que siguen…`,
    );

    if (cerrado && huellaDeLosDatos(borrador.datos) === huellaDeLosDatos(final)) {
      console.log(`✓ El borrador ${borrador.version} ya está cerrado e igual al del simulacro (revisión ${borrador.revision}). Nada que guardar.`);
      return;
    }
    // «Lo que falta decidir» va PRIMERO: si la corrida se corta a la mitad, el borrador ya no se puede publicar.
    // Un borrador ya cerrado sigue cerrado: las correcciones del cierre se guardan sin volver a poner la parte.
    const conLa = (d: EscalaDatos) => (cerrado ? sinLoQueFaltaDecidir(d, parte) : conLoQueFaltaDecidir(d, parte));
    const conParte = conLa(borrador.datos);
    const cambiosDeLaParte = cambiosEntre(borrador.datos, conParte);
    let r = cambiosDeLaParte.length === 0 ? { revision: borrador.revision } : await guardarEnElBorrador(prisma, {
      borrador,
      datos: conParte,
      cambios: cambiosDeLaParte,
      origen: "importacion",
      por,
      nota: "9.0 · Lo que falta decidir: las preguntas para Elías, lo que falta escribir y lo que espera la prueba. Sale antes de publicar.",
    });
    borrador = { ...borrador, revision: r.revision, datos: conParte };
    let antes = conParte;
    let guardados = 0;
    for (let i = desde; i < ENTRADAS.length; i++) {
      const despues = conLa(pasos[i]);
      const cambios = cambiosEntre(antes, despues);
      if (cambios.length === 0) continue;
      r = await guardarEnElBorrador(prisma, { borrador, datos: despues, cambios, origen: "importacion", por, nota: notaDe(i) });
      borrador = { ...borrador, revision: r.revision, datos: despues };
      antes = despues;
      guardados++;
    }
    // Al cerrar, lo último: sale «Lo que falta decidir» (con eso el borrador se puede publicar).
    if (CERRAR && !cerrado) {
      const sinParte = sinLoQueFaltaDecidir(antes, parte);
      r = await guardarEnElBorrador(prisma, { borrador, datos: sinParte, cambios: cambiosEntre(antes, sinParte), origen: "importacion", por, nota: NOTA_DE_LA_SALIDA });
      borrador = { ...borrador, revision: r.revision, datos: sinParte };
      antes = sinParte;
    }
    if (huellaDeLosDatos(antes) !== huellaDeLosDatos(final)) throw new Error("El borrador guardado no quedó igual al del simulacro: revísalo antes de seguir.");
    console.log(
      CERRAR
        ? `✓ ${guardados} puntos guardados en la bitácora y «Lo que falta decidir» afuera. Revisión ${r.revision}. Sigue: npx tsx scripts/publicar-escala.ts (en seco).`
        : `✓ «Lo que falta decidir» y ${guardados} puntos guardados en la bitácora. Revisión ${r.revision}. Se ve en /escala/borrador.`,
    );
  } finally {
    await close();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
