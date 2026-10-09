/**
 * scripts/escala-datos.ts — la escala como DATOS: migrarla, abrir el borrador, cambiarlo en bloque,
 * exportarlo y ver su bitácora (docs/escala/plan-escala-como-datos.md).
 *
 * Desde el 2026-10-08 la escala vive en la base (`EscalaVersion`) y el `.md` se genera desde ahí.
 * Así se trabaja una versión nueva:
 *
 *   1. `borrador --version 8.8.0`     abre el borrador desde la última publicada.
 *   2. `exportar --salida x.md`       baja el `.md` del borrador para editarlo.
 *   3. `importar x.md`                sube el `.md` editado: muestra qué cambió, criterio por criterio,
 *                                     y con `--apply` lo guarda en el borrador y en su bitácora.
 *   4. `scripts/publicar-escala.ts`   publica el borrador con las pruebas de siempre y lo congela.
 *
 * Comandos (en seco salvo `--apply`; las escrituras a producción piden ALLOW_PROD_WRITE):
 *   estado                                         las versiones, el borrador y su bitácora
 *   migrar [--version 8.7.0]                       pasa a datos la versión publicada (una vez)
 *   borrador --version 8.8.0 [--desde 8.7.0]       abre el borrador
 *   importar <archivo.md> [--nota "por qué"]       cambios en bloque al borrador
 *   exportar [--version 8.7.0] (--salida <ruta> | --al-repo)
 *                                                  el `.md` del borrador (o de una versión)
 *   cambios [--version 8.8.0]                      la bitácora
 *   descartar                                      borra el borrador y su bitácora
 *
 * Opción de todos los que escriben: `--por correo@smarteamcr.com` (por defecto, el correo de git).
 *
 * PowerShell, contra producción:
 *   $env:ALLOW_PROD_WRITE="1"; $env:SIN_RESPALDO="1"; npx tsx scripts/escala-datos.ts migrar --apply
 * `SIN_RESPALDO=1` porque esta PC no tiene `pg_dump`: migrar y abrir un borrador solo INSERTAN; con
 * `pg_dump` en el PATH se puede omitir y el guard respalda antes de escribir.
 */
import "dotenv/config";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import type { PrismaClient } from "@prisma/client";
import { resolverApply } from "./lib/guard";
import { createScriptDb } from "./lib/db";
import { rutaDelArchivo } from "@/lib/escala/documento/archivos";
import { huellaDe } from "@/lib/escala/documento/huella";
import { parsearEscala } from "@/lib/escala/documento/parsear";
import { ErrorDeFormato } from "@/lib/escala/documento/tipos";
import { pedazoQueCambia, resumenDeCambios, type CambioDeLaEscala } from "@/lib/escala/datos/diferencias";
import { escalaDeLosDatos, generarMarkdown } from "@/lib/escala/datos/generar";
import { importarEscala, primeraDiferencia } from "@/lib/escala/datos/importar";
import {
  crearBorrador,
  descartarBorrador,
  ErrorDelBorrador,
  guardarEnElBorrador,
  guardarPublicada,
  leerBorrador,
  leerVersion,
  listarVersiones,
  prepararImportacion,
  ultimaPublicada,
} from "@/lib/escala/datos/versiones";

const COMANDO = process.argv[2] ?? "estado";
const ESCRIBE = ["migrar", "borrador", "importar", "descartar"].includes(COMANDO);
const APPLY = ESCRIBE ? resolverApply({ tablas: ["EscalaVersion", "EscalaCambio"] }) : false;

function argumento(nombre: string): string | null {
  const i = process.argv.indexOf(nombre);
  return i !== -1 ? (process.argv[i + 1] ?? null) : null;
}

function correoDeGit(): string | null {
  const r = spawnSync("git", ["config", "user.email"], { encoding: "utf8" });
  return r.status === 0 && r.stdout.trim() ? r.stdout.trim() : null;
}

/** Quién escribe: un correo del EQUIPO (el de git puede ser otro). */
async function quienEscribe(prisma: PrismaClient): Promise<string | null> {
  const candidato = argumento("--por") ?? correoDeGit();
  if (!candidato) return null;
  const miembro = await prisma.teamMember.findFirst({ where: { email: { equals: candidato, mode: "insensitive" } }, select: { email: true } });
  if (!miembro) console.log(`(«${candidato}» no es del equipo en Nexus. Usa --por tu@smarteamcr.com.)`);
  return miembro?.email ?? null;
}

function enSeco(comando: string) {
  console.log(`\nEN SECO: no se escribió nada. Para hacerlo:\n  $env:ALLOW_PROD_WRITE="1"; $env:SIN_RESPALDO="1"; npx tsx scripts/escala-datos.ts ${comando} --por ${argumento("--por") ?? "tu@smarteamcr.com"} --apply`);
}

function mostrarCambios(cambios: CambioDeLaEscala[], tope = 60) {
  const corto = (s: string | null) => (s === null ? "—" : s.length > 90 ? `${s.slice(0, 90)}…` : s).replace(/\n/g, " ⏎ ");
  for (const c of cambios.slice(0, tope)) {
    const signo = c.accion === "agregado" ? "+" : c.accion === "quitado" ? "−" : "~";
    if (c.accion === "cambiado") {
      const p = c.antes !== null && c.despues !== null ? pedazoQueCambia(c.antes, c.despues) : { antes: c.antes, despues: c.despues };
      console.log(`  ${signo} ${c.ancla} · ${c.campo}: ${corto(p.antes)}  ⇒  ${corto(p.despues)}`);
    }
    else console.log(`  ${signo} ${c.ancla}: ${corto(c.accion === "agregado" ? c.despues : c.antes)}`);
  }
  if (cambios.length > tope) console.log(`  … y ${cambios.length - tope} más`);
}

// ── Los comandos ──────────────────────────────────────────────────────────────

async function estado(prisma: PrismaClient) {
  const versiones = await listarVersiones(prisma);
  if (!versiones.length) console.log("Todavía no hay ninguna versión como datos. Corre `migrar`.");
  for (const v of versiones) {
    const cuando = v.publicadaEn ? ` · publicada el ${v.publicadaEn.toISOString().slice(0, 10)}` : "";
    const base = v.basadaEn ? ` · desde la ${v.basadaEn}` : "";
    console.log(`${v.estado === "borrador" ? "✎" : "■"} ${v.version} · ${v.estado}${cuando}${base} · revisión ${v.revision} · ${v.cambios} cambio(s) en la bitácora`);
  }
  const documento = await prisma.escalaDocumento.findFirst({ where: { documento: "escala" }, orderBy: { publicadaEn: "desc" }, select: { version: true, huella: true } });
  if (documento) {
    const datos = versiones.find((v) => v.version === documento.version);
    if (!datos) console.log(`⚠ La ${documento.version} publicada (la que ven las pantallas) todavía no está como datos: corre \`migrar\`.`);
    else if (datos.huella !== documento.huella) console.log(`⛔ La ${documento.version} como datos NO genera el texto publicado (huellas distintas).`);
    else console.log(`La ${documento.version} publicada y sus datos coinciden, byte por byte.`);
  }
}

async function migrar(prisma: PrismaClient) {
  const pedida = argumento("--version");
  const fila = await prisma.escalaDocumento.findFirst({
    where: { documento: "escala", ...(pedida ? { version: pedida } : {}) },
    orderBy: { publicadaEn: "desc" },
    select: { version: true, texto: true, huella: true, publicadaEn: true, publicadaPorEmail: true },
  });
  if (!fila) throw new ErrorDelBorrador(pedida ? `No hay una escala ${pedida} publicada.` : "No hay ninguna escala publicada.");
  console.log(`La escala ${fila.version}, publicada el ${fila.publicadaEn.toISOString().slice(0, 10)}.`);

  const ya = await leerVersion(prisma, fila.version);
  if (ya) {
    console.log(ya.huella === fila.huella ? "= Ya está como datos y genera el mismo texto. No se toca." : "⛔ Ya está como datos, pero NO genera el texto publicado.");
    return;
  }

  // Las tres pruebas de la migración: ida y vuelta exacta, misma huella, misma escala para las pantallas.
  const datos = importarEscala(fila.texto);
  const generado = generarMarkdown(datos);
  const diferencia = primeraDiferencia(fila.texto, generado);
  if (diferencia || huellaDe(generado) !== fila.huella) {
    throw new ErrorDelBorrador(`Los datos no generan el texto publicado${diferencia ? ` (línea ${diferencia.linea})` : " (huella distinta)"}. No se migra.`);
  }
  if (JSON.stringify(escalaDeLosDatos(datos)) !== JSON.stringify(parsearEscala(fila.texto))) {
    throw new ErrorDelBorrador("Las pantallas leerían otra escala desde los datos. No se migra.");
  }
  const kb = Math.round(Buffer.byteLength(JSON.stringify(datos)) / 1024);
  console.log(`PASA  ida y vuelta: el .md generado es el publicado, byte por byte (huella ${fila.huella.slice(0, 12)}…)`);
  console.log(`PASA  las pantallas leen la misma escala desde los datos`);
  console.log(`+ EscalaVersion ${fila.version} · publicada · ${kb} KB de datos`);
  if (!APPLY) return enSeco("migrar");
  await guardarPublicada(prisma, { datos, por: fila.publicadaPorEmail, en: fila.publicadaEn });
  console.log(`\n✓ La ${fila.version} quedó como datos.`);
}

async function borrador(prisma: PrismaClient) {
  const version = argumento("--version");
  if (!version) throw new ErrorDelBorrador("Falta --version (la que va a ser: 8.8.0).");
  const desde = argumento("--desde");
  const abierto = await leerBorrador(prisma);
  if (abierto) throw new ErrorDelBorrador(`Ya hay un borrador abierto: la ${abierto.version}.`);
  const base = desde ? await leerVersion(prisma, desde) : await ultimaPublicada(prisma);
  if (!base) throw new ErrorDelBorrador(desde ? `No existe la ${desde}.` : "No hay ninguna versión publicada como datos: corre primero `migrar`.");
  console.log(`+ Borrador ${version}, desde la ${base.version}.`);
  if (!APPLY) return enSeco(`borrador --version ${version}${desde ? ` --desde ${desde}` : ""}`);
  const por = await quienEscribe(prisma);
  await crearBorrador(prisma, { version, desde, por });
  console.log(`\n✓ Borrador ${version} abierto. Bájalo con: npx tsx scripts/escala-datos.ts exportar --salida escala-${version}.md`);
}

async function importar(prisma: PrismaClient) {
  const archivo = process.argv[3];
  if (!archivo || archivo.startsWith("--")) throw new ErrorDelBorrador("Falta el archivo: importar <archivo.md>.");
  const actual = await leerBorrador(prisma);
  if (!actual) throw new ErrorDelBorrador("No hay ningún borrador abierto. Ábrelo con `borrador --version …`.");
  const texto = fs.readFileSync(archivo, "utf8");
  const { escala, cambios } = prepararImportacion(actual, texto);
  console.log(`Borrador ${actual.version} (revisión ${actual.revision}) ← ${archivo}`);
  console.log(`La escala se lee bien: ${escala.areas.length} áreas, ${escala.ediciones.length} ediciones.`);
  if (!cambios.length) {
    console.log("Sin cambios: el archivo dice lo mismo que el borrador.");
    return;
  }
  console.log(`${resumenDeCambios(cambios)}:`);
  mostrarCambios(cambios);
  if (!APPLY) return enSeco(`importar ${archivo}${argumento("--nota") ? ` --nota "${argumento("--nota")}"` : ""}`);
  const por = await quienEscribe(prisma);
  if (!por) throw new ErrorDelBorrador("Cada cambio de la bitácora lleva quién lo hizo: usa --por tu@smarteamcr.com.");
  const datos = importarEscala(texto);
  const r = await guardarEnElBorrador(prisma, { borrador: actual, datos, cambios, origen: "importacion", por, nota: argumento("--nota") });
  console.log(`\n✓ Guardado en el borrador (revisión ${r.revision}), ${cambios.length} cambio(s) en la bitácora.`);
}

async function exportar(prisma: PrismaClient) {
  const pedida = argumento("--version");
  const fuente = pedida ? await leerVersion(prisma, pedida) : ((await leerBorrador(prisma)) ?? (await ultimaPublicada(prisma)));
  if (!fuente) throw new ErrorDelBorrador(pedida ? `No existe la ${pedida}.` : "No hay ninguna versión como datos.");
  const alRepo = process.argv.includes("--al-repo");
  const salida = alRepo ? rutaDelArchivo("escala") : argumento("--salida");
  if (!salida) throw new ErrorDelBorrador("¿Adónde? Usa --salida <ruta> o --al-repo.");
  const md = generarMarkdown(fuente.datos);
  const previo = fs.existsSync(salida) ? fs.readFileSync(salida, "utf8").replace(/\r\n?/g, "\n") : null;
  if (previo === md) {
    console.log(`= ${salida} ya dice exactamente la ${fuente.version}. No se toca.`);
    return;
  }
  fs.mkdirSync(path.dirname(path.resolve(salida)), { recursive: true });
  fs.writeFileSync(salida, md, "utf8");
  const d = previo === null ? null : primeraDiferencia(previo, md);
  console.log(`✓ ${salida} ← la ${fuente.version} (${fuente.estado})${d ? `; lo que había era otro texto desde la línea ${d.linea}` : ""}.`);
}

async function cambios(prisma: PrismaClient) {
  const pedida = argumento("--version");
  const version = pedida ? await leerVersion(prisma, pedida) : await leerBorrador(prisma);
  if (!version) throw new ErrorDelBorrador(pedida ? `No existe la ${pedida}.` : "No hay ningún borrador abierto (usa --version).");
  const filas = await prisma.escalaCambio.findMany({ where: { versionId: version.id }, orderBy: { createdAt: "asc" } });
  console.log(`La ${version.version} (${version.estado}): ${filas.length} cambio(s).`);
  let lote: string | null = null;
  for (const f of filas) {
    if (f.lote !== lote || !f.lote) {
      lote = f.lote;
      console.log(`\n${f.createdAt.toISOString().slice(0, 16).replace("T", " ")} · ${f.autorEmail} · ${f.origen}${f.nota ? ` · ${f.nota}` : ""}`);
    }
    mostrarCambios([{ ancla: f.ancla, tipoDeAncla: f.tipoDeAncla as CambioDeLaEscala["tipoDeAncla"], accion: f.accion as CambioDeLaEscala["accion"], campo: f.campo, antes: f.antes, despues: f.despues }]);
  }
}

async function descartar(prisma: PrismaClient) {
  const actual = await leerBorrador(prisma);
  if (!actual) {
    console.log("No hay ningún borrador abierto.");
    return;
  }
  const n = await prisma.escalaCambio.count({ where: { versionId: actual.id } });
  console.log(`− Borrador ${actual.version} y sus ${n} cambio(s) de la bitácora. ⚠ No tiene vuelta atrás.`);
  if (!APPLY) return enSeco("descartar");
  await descartarBorrador(prisma);
  console.log(`\n✓ Descartado.`);
}

const COMANDOS: Record<string, (prisma: PrismaClient) => Promise<void>> = { estado, migrar, borrador, importar, exportar, cambios, descartar };

async function main() {
  const comando = COMANDOS[COMANDO];
  if (!comando) {
    console.error(`Comando desconocido: ${COMANDO}. Usa ${Object.keys(COMANDOS).join(" | ")}.`);
    process.exit(1);
  }
  const { prisma, close } = createScriptDb();
  try {
    await comando(prisma);
  } catch (e) {
    if (e instanceof ErrorDelBorrador || e instanceof ErrorDeFormato) {
      console.error(`⛔ ${e.message}`);
      process.exitCode = 1;
      return;
    }
    if ((e as { code?: string }).code === "P2021") {
      console.error("⛔ Faltan las tablas: corre primero scripts/sql/2026-10-08-escala-como-datos.sql.");
      process.exitCode = 1;
      return;
    }
    throw e;
  } finally {
    await close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
