/**
 * scripts/publicar-escala.ts — publica en Nexus una versión de la Escala de Rendimiento.
 *
 * Nexus es la fuente de la escala: la sección la lee de la base, no del repo (la imagen de
 * producción no lleva ningún .md). Una versión nueva entra así:
 *
 *   1. Reemplazas los archivos en `docs/escala/` (escala, especificación, manual, pruebas).
 *   2. Corres este script EN SECO: lee los tres documentos, los valida, corre el
 *      `pruebas_escala.py` que llegó con la versión y te muestra qué cambia contra la publicada
 *      y cuántos comentarios quedan con un texto distinto al que comentaron.
 *   3. Si todo pasa, lo corres con `--apply` y queda publicada. La sección cambia sola, sin deploy
 *      (salvo que la versión nueva traiga un formato que este lector no conoce: eso lo avisa acá).
 *
 * ── LO QUE CUIDA ─────────────────────────────────────────────────────────────
 * · El texto se guarda con saltos de línea LF, venga de la máquina que venga: la huella (sha256)
 *   es del contenido, no de si el archivo salió de Windows.
 * · SOLO INSERTA. Una versión publicada no se pisa: si el archivo dice la misma versión que una
 *   publicada y el texto es otro, se frena («sube la versión»). Si es idéntico, no escribe nada.
 * · Nada se publica si falla una prueba: las de Nexus (lo que la pantalla necesita, con la misma
 *   regla de perfil de la escala) y las de `pruebas_escala.py`, que son las del dueño de la escala.
 * · La prueba 5 (nada desaparece) se corre contra la versión PUBLICADA, no contra la del repo.
 *
 * Uso (PowerShell):
 *   npx tsx scripts/publicar-escala.ts                                         (en seco)
 *   $env:ALLOW_PROD_WRITE="1"; $env:SIN_RESPALDO="1"; npx tsx scripts/publicar-escala.ts --apply
 *
 * `SIN_RESPALDO=1` porque la tabla es de solo inserción (no hay nada que pisar) y esta PC no tiene
 * `pg_dump`; con `pg_dump` en el PATH se puede omitir y el guard respalda antes de escribir.
 *
 * Opciones: `--sin-python` (no corre pruebas_escala.py: solo si de verdad no hay Python),
 *           `--por correo@smarteamcr.com` (quién publica; por defecto, el correo de git),
 *           `--ediciones-revisadas` (una edición dice con sus palabras algo cuyo texto general
 *           cambió en esta versión y el suyo no: se miró y sigue diciendo lo mismo).
 */
import "dotenv/config";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { resolverApply } from "./lib/guard";
import { createScriptDb } from "./lib/db";
import { leerArchivoDeLaEscala, rutaDelArchivo, RUTA_DE_LAS_PRUEBAS } from "@/lib/escala/documento/archivos";
import { compararEscalas } from "@/lib/escala/documento/diferencias";
import { DOCUMENTOS_DE_LA_ESCALA, type DocumentoDeLaEscala } from "@/lib/escala/documento/documentos";
import { leerEncabezado, parsearEscala, todosLosCriterios } from "@/lib/escala/documento/parsear";
import { ErrorDeFormato, type Escala } from "@/lib/escala/documento/tipos";
import { tieneRequeridos, validarEscala } from "@/lib/escala/documento/validar";
import { huellaDe } from "@/lib/escala/documento/huella";

const APPLY = resolverApply({ tablas: ["EscalaDocumento"] });
const SIN_PYTHON = process.argv.includes("--sin-python");
/** Lo que una edición dice con sus palabras y quedó viejo frena la publicación, salvo que se haya mirado. */
const EDICIONES_REVISADAS = process.argv.includes("--ediciones-revisadas");

function argumento(nombre: string): string | null {
  const i = process.argv.indexOf(nombre);
  return i !== -1 ? (process.argv[i + 1] ?? null) : null;
}

function correoDeGit(): string | null {
  const r = spawnSync("git", ["config", "user.email"], { encoding: "utf8" });
  return r.status === 0 && r.stdout.trim() ? r.stdout.trim() : null;
}

/** 7.0.10 > 7.0.9: por números, no por texto. */
function compararVersiones(a: string, b: string): number {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

function python(): string | null {
  for (const p of ["python", "python3"]) {
    try {
      if (spawnSync(p, ["--version"], { encoding: "utf8" }).status === 0) return p;
    } catch {
      /* siguiente */
    }
  }
  return null;
}

async function main() {
  const fallas: string[] = [];
  const titulo = (t: string) => console.log(`\n── ${t} ${"─".repeat(Math.max(0, 70 - t.length))}`);

  // 1 · Los archivos del repo
  const textos = {} as Record<DocumentoDeLaEscala, string>;
  for (const d of DOCUMENTOS_DE_LA_ESCALA) {
    try {
      // Saltos de línea LF: la misma versión tiene que dar la misma huella en Windows (CRLF), en
      // la otra PC o en Linux. Si no, republicar la misma versión «cambiaría el texto».
      textos[d.clave] = leerArchivoDeLaEscala(d.clave).replace(/\r\n?/g, "\n");
    } catch {
      console.error(`⛔ Falta ${rutaDelArchivo(d.clave)}.`);
      process.exit(1);
    }
  }

  let escala: Escala;
  try {
    escala = parsearEscala(textos.escala);
  } catch (e) {
    console.error(`⛔ El lector no entiende la escala: ${e instanceof ErrorDeFormato ? e.message : String(e)}`);
    console.error("   Si el formato cambió a propósito, hay que actualizar lib/escala/documento/parsear.ts (y deployar) antes de publicar.");
    process.exit(1);
  }
  const criterios = todosLosCriterios(escala);
  titulo(`Escala ${escala.version} (${escala.fecha ?? "sin fecha"})`);
  console.log(
    `${escala.areas.length} áreas · ${escala.areas.flatMap((a) => a.dimensiones).length} dimensiones · ${criterios.length} criterios` +
      ` (${criterios.filter((c) => c.riesgo).length} de riesgo, ${criterios.filter((c) => c.habito).length} hábitos, ${criterios.filter((c) => c.perfil).length} con perfil,` +
      ` ${criterios.filter((c) => c.requiere?.length).length} que requieren otro)`,
  );
  for (const ed of escala.ediciones) {
    const dims = ed.areas.flatMap((a) => a.dimensiones);
    console.log(
      `Edición «${ed.nombre}»: ${dims.length} dimensiones con texto propio · ${dims.reduce((s, d) => s + d.propios.length, 0)} criterios propios · ` +
        `${dims.reduce((s, d) => s + Object.keys(d.textos).length, 0)} reescritos · ${dims.reduce((s, d) => s + d.noAplican.length, 0)} que no aplican`,
    );
  }

  const { prisma, close } = createScriptDb();
  try {
    // 2 · Lo publicado
    let publicadas: { documento: string; version: string; huella: string; texto: string }[];
    try {
      publicadas = await prisma.escalaDocumento.findMany({
        orderBy: { publicadaEn: "desc" },
        select: { documento: true, version: true, huella: true, texto: true },
      });
    } catch (e) {
      console.error(`⛔ No pude leer "EscalaDocumento": ¿falta aplicar scripts/sql/2026-09-27-escala-lector-y-comentarios.sql? (${String(e).slice(0, 160)})`);
      process.exit(1);
    }
    const anteriorFila = publicadas.find((p) => p.documento === "escala" && p.version !== escala.version) ?? null;
    let anterior: Escala | null = null;
    if (anteriorFila) {
      try {
        anterior = parsearEscala(anteriorFila.texto);
      } catch (e) {
        // Una versión publicada que este lector ya no entiende no frena la publicación de la nueva:
        // se pierde la comparación (y la prueba 5 de Nexus), y se dice.
        console.log(`⚠ La versión publicada (${anteriorFila.version}) no se puede leer con este lector: ${e instanceof Error ? e.message : String(e)}`);
        console.log("  No se compara contra ella. La prueba 5 de pruebas_escala.py sí corre contra su texto.");
      }
    }
    console.log(anterior ? `Publicada hoy en Nexus: la ${anterior.version}.` : "Todavía no hay ninguna versión publicada en Nexus (o no se puede leer).");

    // 3 · Las pruebas de Nexus
    titulo("Pruebas de Nexus");
    for (const r of validarEscala(escala, { anterior, especificacion: textos.especificacion, manual: textos.manual })) {
      console.log(`${r.ok ? "PASA " : "FALLA"} ${r.nombre}`);
      for (const d of r.detalle.slice(0, 12)) console.log(`        ${d}`);
      if (r.detalle.length > 12) console.log(`        … y ${r.detalle.length - 12} más`);
      if (!r.ok) fallas.push(r.nombre);
    }

    // 4 · Las pruebas del dueño de la escala
    titulo("pruebas_escala.py");
    if (SIN_PYTHON) {
      console.log("⚠ Saltadas a pedido (--sin-python): las pruebas 2 y 3 (el cálculo) no se corrieron.");
    } else {
      const py = python();
      if (!py) {
        console.error("⛔ No encontré Python. Instálalo, o corre con --sin-python sabiendo que el cálculo no se prueba.");
        fallas.push("pruebas_escala.py (sin Python)");
      } else {
        const args = [RUTA_DE_LAS_PRUEBAS, rutaDelArchivo("escala"), rutaDelArchivo("especificacion")];
        let temporal: string | null = null;
        if (anteriorFila) {
          temporal = path.join(os.tmpdir(), `escala-publicada-${anteriorFila.version}.md`);
          fs.writeFileSync(temporal, anteriorFila.texto, "utf8");
          args.push(temporal);
        }
        const r = spawnSync(py, args, { encoding: "utf8", env: { ...process.env, PYTHONIOENCODING: "utf-8" } });
        if (temporal) fs.rmSync(temporal, { force: true });
        process.stdout.write((r.stdout ?? "").replace(/\r/g, "").replace(/^(?=.)/gm, "  "));
        if (r.status !== 0) {
          console.error((r.stderr ?? "").trim());
          fallas.push("pruebas_escala.py");
        }
        // El Python viaja con cada versión: si uno viejo no sabe de ediciones, «pasaría» sin mirarlas.
        const sinMirar = escala.ediciones.filter((ed) => !(r.stdout ?? "").includes(`Edición «${ed.nombre}»`));
        if (sinMirar.length) {
          console.error(`⛔ pruebas_escala.py no dijo nada de ${sinMirar.map((ed) => `«${ed.nombre}»`).join(", ")}: no está leyendo las ediciones.`);
          fallas.push("pruebas_escala.py (no lee las ediciones)");
        }
        // Lo mismo con los requeridos: un Python que no conoce la marca saltaría esos criterios enteros.
        if (tieneRequeridos(escala) && !(r.stdout ?? "").includes("9 · Requeridos coherentes")) {
          console.error("⛔ pruebas_escala.py no corrió la prueba 9: no está leyendo los criterios que requieren otro.");
          fallas.push("pruebas_escala.py (no lee los requeridos)");
        }
      }
    }

    // 5 · Qué cambia
    if (anterior) {
      titulo(`Qué cambia de la ${anterior.version} a la ${escala.version}`);
      const c = compararEscalas(anterior, escala);
      console.log(`${c.nuevos.length} nuevos · ${c.retirados.length} retirados · ${c.cambiados.length} con otro texto`);
      for (const id of c.nuevos.slice(0, 20)) console.log(`  + ${id}`);
      for (const id of c.retirados.slice(0, 20)) console.log(`  − ${id}`);
      for (const x of c.cambiados.slice(0, 20)) console.log(`  ~ ${x.id}`);
      if (c.requeridos.length) {
        console.log(`${c.requeridos.length} con otros requeridos:`);
        for (const x of c.requeridos.slice(0, 30)) console.log(`  → ${x.id}: ${x.antes.join(", ") || "ninguno"} ⇒ ${x.despues.join(", ") || "ninguno"}`);
      }
      // Lo que cambia de texto o deja de existir, en la escala general o leído con alguna edición.
      const tocados = [
        ...new Set([...c.cambiados.map((x) => x.id), ...c.retirados, ...c.ediciones.flatMap((ed) => [...ed.cambiados.map((x) => x.id), ...ed.retirados])]),
      ];
      if (tocados.length) {
        const comentarios = await prisma.escalaComentario.count({ where: { ancla: { in: tocados } } });
        console.log(`${comentarios} comentario(s) van a mostrar que su texto cambió (o que ya no existe).`);
      }
      // Las ediciones: qué cambia leído con cada una, y lo que una edición dice con sus palabras y
      // quedó atrás porque el texto general cambió y el suyo no.
      for (const ed of c.ediciones) {
        if (ed.nueva) {
          console.log(`Edición «${ed.nombre}»: nueva (${ed.propiosDeLaEdicion} textos propios).`);
          continue;
        }
        console.log(`Edición «${ed.nombre}»: ${ed.nuevos.length} nuevos · ${ed.retirados.length} retirados · ${ed.cambiados.length} con otro texto.`);
        for (const id of ed.nuevos.slice(0, 20)) console.log(`  + ${id}`);
        for (const id of ed.retirados.slice(0, 20)) console.log(`  − ${id}`);
        for (const x of ed.cambiados.slice(0, 20)) console.log(`  ~ ${x.id}`);
        for (const x of ed.requeridos.slice(0, 20)) console.log(`  → ${x.id}: ${x.antes.join(", ") || "ninguno"} ⇒ ${x.despues.join(", ") || "ninguno"}`);
        if (ed.viejos.length) {
          console.log(`  ⚠ ${ed.viejos.length} que la edición dice con sus palabras y cuyo texto general cambió sin que el suyo se tocara:`);
          for (const id of ed.viejos) console.log(`    ? ${id}`);
          if (EDICIONES_REVISADAS) {
            console.log("    Revisados a mano (--ediciones-revisadas): siguen diciendo lo mismo.");
          } else {
            console.error("    Míralos: si siguen diciendo lo mismo, publica con --ediciones-revisadas; si no, actualiza la edición.");
            fallas.push(`edición «${ed.nombre}» con textos que quedaron viejos`);
          }
        }
      }
      for (const nombre of c.edicionesRetiradas) console.log(`Edición «${nombre}»: ya no está.`);
    }

    // 6 · Qué se escribe
    titulo("Qué se publica");
    const aInsertar: { documento: DocumentoDeLaEscala; version: string; escalaVersion: string; archivo: string; texto: string; huella: string }[] = [];
    for (const d of DOCUMENTOS_DE_LA_ESCALA) {
      const texto = textos[d.clave];
      const cabecera = leerEncabezado(texto);
      const version = d.clave === "escala" ? escala.version : cabecera.version;
      const escalaVersion = d.clave === "escala" ? escala.version : cabecera.escala;
      if (!version || !escalaVersion) {
        console.error(`⛔ ${d.archivo} no dice su versión (o con qué escala va) en el encabezado.`);
        fallas.push(`encabezado de ${d.archivo}`);
        continue;
      }
      const huella = huellaDe(texto);
      const igual = publicadas.find((p) => p.documento === d.clave && p.version === version);
      if (igual) {
        if (igual.huella === huella) {
          console.log(`= ${d.archivo} ${version}: ya está publicada, igual. No se toca.`);
        } else {
          console.error(`⛔ ${d.archivo} dice ${version}, que ya está publicada con OTRO texto. Una versión publicada no cambia: sube la versión.`);
          fallas.push(`${d.archivo} ${version} con otro texto`);
        }
        continue;
      }
      const ultima = publicadas.find((p) => p.documento === d.clave);
      if (ultima && compararVersiones(version, ultima.version) < 0) {
        console.error(`⛔ ${d.archivo} ${version} es anterior a la publicada (${ultima.version}).`);
        fallas.push(`${d.archivo} ${version} es anterior`);
        continue;
      }
      console.log(`+ ${d.archivo} ${version} (con la escala ${escalaVersion})`);
      aInsertar.push({ documento: d.clave, version, escalaVersion, archivo: d.archivo, texto, huella });
    }

    if (fallas.length) {
      console.error(`\n⛔ No se publica: ${fallas.join(" · ")}.`);
      process.exit(1);
    }
    if (aInsertar.length === 0) {
      console.log("\nNada nuevo que publicar.");
      return;
    }
    if (!APPLY) {
      console.log("\nEN SECO: no se escribió nada. Para publicar:");
      console.log('  $env:ALLOW_PROD_WRITE="1"; $env:SIN_RESPALDO="1"; npx tsx scripts/publicar-escala.ts --apply');
      return;
    }

    // Quién publica: un correo del EQUIPO (el de git puede ser otro: se descarta si no está en Nexus).
    const candidato = argumento("--por") ?? correoDeGit();
    const miembro = candidato
      ? await prisma.teamMember.findFirst({ where: { email: { equals: candidato, mode: "insensitive" } }, select: { email: true } })
      : null;
    const por = miembro?.email ?? null;
    if (candidato && !por) console.log(`(«${candidato}» no es del equipo en Nexus: queda sin autor. Usa --por tu@smarteamcr.com.)`);
    await prisma.$transaction(
      aInsertar.map((x) => prisma.escalaDocumento.create({ data: { ...x, publicadaPorEmail: por } })),
    );
    console.log(`\n✓ Publicado: ${aInsertar.map((x) => `${x.archivo} ${x.version}`).join(" · ")}${por ? ` (por ${por})` : ""}.`);
  } finally {
    await close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
