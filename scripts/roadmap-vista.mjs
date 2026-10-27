// Arma la vista publicable del roadmap: docs/roadmap-vista.html con docs/roadmap.md adentro.
// Uso: node scripts/roadmap-vista.mjs [salida]   (por defecto, .roadmap/roadmap.html, fuera de git)
// Después se publica ese archivo como artefacto, siempre en la misma dirección.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

const raiz = resolve(dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..");
const md = readFileSync(resolve(raiz, "docs/roadmap.md"), "utf8");
if (/<\/script/i.test(md)) throw new Error("roadmap.md no puede contener «</script»");
validarTemas(md);
const plantilla = readFileSync(resolve(raiz, "docs/roadmap-vista.html"), "utf8");
if (!plantilla.includes("@@ROADMAP_MD@@")) throw new Error("Falta el marcador @@ROADMAP_MD@@ en la plantilla");

const salida = resolve(raiz, process.argv[2] ?? ".roadmap/roadmap.html");
mkdirSync(dirname(salida), { recursive: true });
writeFileSync(salida, plantilla.replace("@@ROADMAP_MD@@", () => md), "utf8");
console.log(`Vista armada: ${salida}`);

/**
 * El bloque «temas» del Resumen (2026-10-27): de ahí sale la pestaña que Elías abre primero. Si algo no cuadra, no se
 * arma la vista: así el resumen no puede contradecir al resto del roadmap en silencio. Las reglas, en la skill
 * regenerar-roadmap.
 */
function validarTemas(texto) {
  const t = texto.replace(/\r/g, "");
  const m = t.match(/```temas\n([\s\S]*?)\n```/);
  if (!m) throw new Error("Falta el bloque ```temas en el Resumen de roadmap.md");
  const datos = JSON.parse(m[1]);
  const errores = [];
  const ESTADOS = ["en-curso", "propuesta", "funciona", "terminado"];
  const dec = t.slice(t.indexOf("## Lo que decides tú"));
  const fin = dec.indexOf("\n## ", 5);
  const preguntas = new Map();
  for (const l of (fin > 0 ? dec.slice(0, fin) : dec).split("\n")) {
    const x = l.match(/^(\d+)\. (✓)?/);
    if (x) preguntas.set(Number(x[1]), Boolean(x[2]));
  }
  const dueno = new Map();
  const ns = new Set();
  const largo = (campo, v, max, quien) => { if (v && v.length > max) errores.push(`${quien}: «${campo}» pasa de ${max} letras (${v.length})`); };
  for (const tema of datos.temas ?? []) {
    const quien = `tema ${tema.n} (${tema.nombre})`;
    if (ns.has(tema.n)) errores.push(`${quien}: número repetido`);
    ns.add(tema.n);
    if (!ESTADOS.includes(tema.estado)) errores.push(`${quien}: estado «${tema.estado}» (vale ${ESTADOS.join(", ")})`);
    if ((tema.estado === "en-curso" || tema.estado === "propuesta") && typeof tema.prioridad !== "number") errores.push(`${quien}: le falta la prioridad`);
    if (tema.estado !== "terminado" && !tema.sigue) errores.push(`${quien}: le falta «sigue»`);
    if (tema.estado === "terminado" && tema.sigue) errores.push(`${quien}: terminado con algo que sigue: entonces es «funciona»`);
    largo("resultado", tema.resultado, 160, quien);
    largo("sigue", tema.sigue, 220, quien);
    largo("teToca", tema.teToca, 200, quien);
    for (const h of tema.hecho ?? []) {
      if (!h.fecha || !h.texto) errores.push(`${quien}: un «hecho» sin fecha o sin texto`);
      largo("hecho", h.texto, 140, quien);
    }
    for (const n of tema.decisiones ?? []) {
      if (!preguntas.has(n)) errores.push(`${quien}: la pregunta ${n} no está en «Lo que decides tú»`);
      if (dueno.has(n)) errores.push(`la pregunta ${n} está en dos temas: ${dueno.get(n)} y ${tema.n}`);
      dueno.set(n, tema.n);
      if (tema.estado === "terminado" && preguntas.get(n) === false) errores.push(`${quien}: terminado con la pregunta ${n} sin responder`);
    }
  }
  for (const n of preguntas.keys()) if (!dueno.has(n)) errores.push(`la pregunta ${n} de «Lo que decides tú» no tiene tema`);
  if (errores.length) throw new Error("El resumen no cuadra:\n- " + errores.join("\n- "));
}
