/**
 * scripts/comparar-prompt-vivo.ts — ¿ES SEGURO RE-SEMBRAR ESTE AGENTE?
 *
 * SOLO LECTURA. Antes de correr cualquier seed que escriba `systemPrompt`, esto contesta la única
 * pregunta que importa:
 *
 *   ¿el prompt que está VIVO en la base coincide con alguna versión del archivo en git —o sea,
 *   salió de un seed y nadie lo tocó— o es una edición hecha a mano desde /agents que el re-seed
 *   borraría sin vuelta atrás?
 *
 * ── POR QUÉ EXISTE ──────────────────────────────────────────────────────────
 * Los prompts viven en la BASE, no en el código, justamente para poder calibrarlos desde /agents
 * sin deploy. Eso los vuelve la única parte del sistema donde un `git checkout` no sirve de red: si
 * un seed pisa una calibración, no hay dónde recuperarla. El repo ya arrastra ese miedo escrito en
 * varios lados («comparar el sha vivo contra el historial antes de re-sembrar») pero era un ritual
 * a mano, y un ritual a mano se saltea justo el día apurado.
 *
 * ⚠ LA TRAMPA QUE ESTE SCRIPT YA PISÓ, Y POR ESO LA EVITA: el archivo guarda el prompt como
 * template literal ESCAPADO (\`\`\` con backslashes) y la base guarda el valor EVALUADO. Comparar
 * los dos crudos reporta «editado a mano» por tres backslashes de diferencia — un falso positivo
 * que empuja exactamente a la decisión equivocada. Por eso se des-escapa antes de comparar.
 *
 * ── USO ─────────────────────────────────────────────────────────────────────
 *   npx tsx scripts/comparar-prompt-vivo.ts                 → todos los seeds que encuentra
 *   npx tsx scripts/comparar-prompt-vivo.ts <agentId>       → uno solo
 *
 * No escribe nada, así que no necesita ALLOW_PROD_WRITE.
 */
import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { createScriptDb } from "./lib/db";

const RAIZ = process.cwd();
const DIR_SCRIPTS = path.join(RAIZ, "scripts");

const sha = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 12);
const norm = (s: string) => s.replace(/\r\n/g, "\n").trim();

interface Objetivo {
  archivo: string;
  agentId: string;
  constante: string;
}

/**
 * Extrae el valor EVALUADO de `const X = \`…\`;` de un fuente TS.
 * Devuelve null si la constante no está o si el literal no cierra — nunca un valor a medias.
 */
function extraerPrompt(src: string, constante: string): string | null {
  const i = src.indexOf(`const ${constante} = \``);
  if (i < 0) return null;
  const ini = src.indexOf("`", i) + 1;
  let j = ini;
  while (j < src.length) {
    j = src.indexOf("`", j);
    if (j < 0) return null;
    if (src[j - 1] !== "\\" && /^\s*;/.test(src.slice(j + 1, j + 5))) break;
    j++;
  }
  if (j < 0 || j >= src.length) return null;
  return src
    .slice(ini, j)
    .replace(/\\`/g, "`")
    .replace(/\\\$\{/g, "${")
    .replace(/\\\\/g, "\\");
}

/**
 * Descubre los seeds en vez de transcribirlos: cualquier `scripts/*.ts` que escriba
 * `systemPrompt: <CONST>` y declare un `AGENT_ID`-like con un string literal.
 * ⚠ Descubrir y no listar es lo que hace que un seed NUEVO quede cubierto solo — una lista escrita
 * a mano envejece justo cuando alguien suma el seed que va a pisar algo.
 */
function descubrirObjetivos(): Objetivo[] {
  const out: Objetivo[] = [];
  const vistos = new Set<string>();
  for (const archivo of fs.readdirSync(DIR_SCRIPTS).filter((f) => f.endsWith(".ts"))) {
    const rel = `scripts/${archivo}`;
    const src = fs.readFileSync(path.join(DIR_SCRIPTS, archivo), "utf8");

    // Constantes de id declaradas arriba: `const AGENT_ID_X = "..."` → nombre ⇒ valor.
    const idPorNombre = new Map<string, string>();
    for (const m of src.matchAll(/const\s+(\w*AGENT_ID\w*)\s*=\s*"([^"]+)"/g)) idPorNombre.set(m[1], m[2]);
    if (idPorNombre.size === 0) continue;

    /* ⚠ EMPAREJAR POR CERCANÍA, NO POR PRODUCTO CARTESIANO. Un seed con DOS agentes y DOS prompts
       (seed-analysis-agents.ts) daba 4 pares, dos de ellos inventados — y esos dos salían siempre
       como «⛔ edición humana», porque comparaban el prompt de un agente contra el otro. Un
       detector que grita en falso se aprende a ignorar, que es peor que no tenerlo. */
    for (const m of src.matchAll(/systemPrompt:\s*([A-Z_][A-Z0-9_]*)\s*,/g)) {
      const constante = m[1];
      if (!extraerPrompt(src, constante)) continue;
      const antes = src.slice(0, m.index ?? 0);
      // El `id:` más cercano hacia atrás — el del mismo objeto literal.
      const ids = [...antes.matchAll(/\bid:\s*(?:(\w*AGENT_ID\w*)|"([^"]+)")/g)];
      const ultimo = ids[ids.length - 1];
      const agentId = ultimo ? (ultimo[1] ? idPorNombre.get(ultimo[1]) : ultimo[2]) : null;
      // Sin `id:` cercano, el archivo siembra UN solo agente: vale el único declarado.
      const resuelto = agentId ?? (idPorNombre.size === 1 ? [...idPorNombre.values()][0] : null);
      if (!resuelto) continue;
      const clave = `${rel}|${resuelto}|${constante}`;
      if (vistos.has(clave)) continue;
      vistos.add(clave);
      out.push({ archivo: rel, agentId: resuelto, constante });
    }
  }
  return out;
}

function versionesEnGit(archivo: string, constante: string): Array<{ sha: string; largo: number; huella: string; asunto: string }> {
  const shas = execSync(`git log --format=%H --all -- ${archivo}`, { encoding: "utf8" })
    .split("\n")
    .map((x) => x.trim())
    .filter(Boolean);
  const out: Array<{ sha: string; largo: number; huella: string; asunto: string }> = [];
  for (const s of shas) {
    let p: string | null = null;
    try {
      p = extraerPrompt(execSync(`git show ${s}:${archivo}`, { encoding: "utf8", maxBuffer: 20e6 }), constante);
    } catch {
      continue; // el archivo no existía en ese commit
    }
    if (!p) continue;
    const pn = norm(p);
    out.push({
      sha: s,
      largo: pn.length,
      huella: sha(pn),
      asunto: execSync(`git log -1 --format=%s ${s}`, { encoding: "utf8" }).trim().slice(0, 48),
    });
  }
  return out;
}

async function main() {
  const filtro = process.argv.slice(2).find((a) => !a.startsWith("--")) ?? null;
  const objetivos = descubrirObjetivos().filter((o) => !filtro || o.agentId === filtro);

  if (objetivos.length === 0) {
    console.log(filtro ? `No se encontró ningún seed para el agente "${filtro}".` : "No se encontró ningún seed que escriba systemPrompt.");
    process.exit(1);
  }

  const { prisma, close } = createScriptDb();
  const seguros: string[] = [];
  const peligrosos: string[] = [];
  try {
    for (const o of objetivos) {
      console.log("\n" + "=".repeat(80));
      console.log(`${o.agentId}   ←   ${o.archivo}  (${o.constante})`);
      console.log("=".repeat(80));

      const vivo = await prisma.agent.findUnique({
        where: { id: o.agentId },
        select: { name: true, status: true, systemPrompt: true, updatedAt: true },
      });
      if (!vivo) {
        console.log("  ⚠ NO EXISTE en la base — el seed lo CREA. Correrlo es seguro.");
        seguros.push(o.agentId);
        continue;
      }
      const pVivo = norm(vivo.systemPrompt ?? "");
      console.log(`  ${vivo.name}  ·  ${vivo.status}`);
      console.log(`  VIVO    ${String(pVivo.length).padStart(6)} chars  sha ${sha(pVivo)}  editado ${vivo.updatedAt.toISOString().slice(0, 16).replace("T", " ")}`);

      const enArchivo = extraerPrompt(fs.readFileSync(path.join(RAIZ, o.archivo), "utf8"), o.constante);
      const pArchivo = enArchivo ? norm(enArchivo) : null;
      if (pArchivo) {
        const igual = sha(pArchivo) === sha(pVivo);
        console.log(`  ARCHIVO ${String(pArchivo.length).padStart(6)} chars  sha ${sha(pArchivo)}${igual ? "  ← YA ESTÁ AL DÍA (correrlo es no-op)" : ""}`);
        /* «Seguro» no es lo mismo que «esperado». Un archivo mucho más corto que el vivo puede ser
           deliberado (el prompt se mudó al código y el campo quedó como nota — es el caso del
           kickoff) o puede ser un stub que alguien dejó sin querer. El script no puede distinguirlos,
           así que lo dice en vez de dejar pasar un encogimiento de 8.672 a 390 chars en silencio. */
        if (!igual && pArchivo.length < pVivo.length * 0.5) {
          console.log(`  ⚠ el archivo es ${Math.round((1 - pArchivo.length / pVivo.length) * 100)}% MÁS CORTO que lo vivo — mirá el contenido antes de correrlo.`);
        }
      }

      const versiones = versionesEnGit(o.archivo, o.constante);
      console.log(`\n  ${versiones.length} versión(es) del prompt en git:`);
      let coincide: { sha: string; asunto: string } | null = null;
      for (const v of versiones) {
        const igual = v.huella === sha(pVivo);
        if (igual && !coincide) coincide = { sha: v.sha, asunto: v.asunto };
        console.log(`    ${v.sha.slice(0, 8)}  ${String(v.largo).padStart(6)} chars  sha ${v.huella}  ${igual ? "★ = VIVO" : "        "}  ${v.asunto}`);
      }

      console.log("");
      if (coincide) {
        console.log(`  ✅ SEGURO: el vivo es exactamente la versión ${coincide.sha.slice(0, 8)} (${coincide.asunto}).`);
        console.log("     Salió de un seed; nadie lo editó desde /agents. Re-sembrar no pierde nada.");
        seguros.push(o.agentId);
      } else {
        console.log("  ⛔ CUIDADO: el vivo NO coincide con ninguna versión de git.");
        console.log("     Es una edición hecha a mano desde /agents. Re-sembrar la borra sin vuelta atrás.");
        console.log("     Copiá el prompt vivo al archivo ANTES de correr el seed.");
        peligrosos.push(o.agentId);
      }
    }

    console.log("\n" + "=".repeat(80));
    console.log(`RESUMEN: ${seguros.length} seguro(s) · ${peligrosos.length} con edición humana viva`);
    if (peligrosos.length > 0) console.log(`  ⛔ NO re-sembrar sin mirar: ${peligrosos.join(", ")}`);
    console.log("=".repeat(80));
  } finally {
    await close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
