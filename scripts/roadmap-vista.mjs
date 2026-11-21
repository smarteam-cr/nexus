// Arma la vista publicable del roadmap: docs/roadmap-vista.html con docs/roadmap.md adentro.
// Uso: node scripts/roadmap-vista.mjs [salida]   (por defecto, .roadmap/roadmap.html, fuera de git)
// Después se publica ese archivo como artefacto, siempre en la misma dirección.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

const raiz = resolve(dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..");
const md = readFileSync(resolve(raiz, "docs/roadmap.md"), "utf8");
if (/<\/script/i.test(md)) throw new Error("roadmap.md no puede contener «</script»");
validarTemas(md);
validarLinea(md);
validarEjecutivo(md);
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

/**
 * El bloque «linea» (2026-11-19): la pestaña que abre primero. Arriba lo hecho, con fecha y del más viejo al más nuevo;
 * abajo lo que sigue, en orden de prioridad y SIN fechas (regla del roadmap: lo futuro no lleva tiempos). Las reglas, en
 * la skill regenerar-roadmap.
 */
function validarLinea(texto) {
  const t = texto.replace(/\r/g, "");
  const m = t.match(/```linea\n([\s\S]*?)\n```/);
  if (!m) throw new Error("Falta el bloque ```linea (la línea de tiempo) en roadmap.md");
  const d = JSON.parse(m[1]);
  const errores = [];
  const ISO = /^\d{4}-\d{2}-\d{2}$/;
  const PROD = ["si", "parcial", "apagado", "plan"];
  const ESTADOS = ["otra-sesion", "por-hacer", "te-toca", "espera"];
  const PASOS = ["hecho", "en-curso", "te-toca", "espera", "por-hacer"];
  const FECHA_EN_TEXTO = /\b\d{1,2} (de )?(ene|feb|mar|abr|may|jun|jul|ago|sep|oct|nov|dic)\b|\b20\d\d-\d\d|\b\d+ semanas?\b|\bpróxim[ao] (semana|mes)\b/i;
  const temas = new Set((JSON.parse(t.match(/```temas\n([\s\S]*?)\n```/)[1]).temas ?? []).map((x) => x.n));
  const dec = t.slice(t.indexOf("## Lo que decides tú"));
  const fin = dec.indexOf("\n## ", 5);
  const preguntas = new Set();
  for (const l of (fin > 0 ? dec.slice(0, fin) : dec).split("\n")) { const x = l.match(/^(\d+)\. /); if (x) preguntas.add(Number(x[1])); }
  if (!ISO.test(d.hoy ?? "")) errores.push("«hoy» tiene que ser una fecha AAAA-MM-DD");
  if (!/^[0-9a-f]{7,12}$/.test(d.produccion ?? "")) errores.push("«produccion» tiene que ser el sha corto que corre en producción");
  const ini = new Set();
  for (const i of d.iniciativas ?? []) {
    if (ini.has(i.id)) errores.push(`iniciativa repetida: ${i.id}`);
    ini.add(i.id);
    if (!i.nombre || !/^#[0-9a-f]{6}$/i.test(i.color ?? "") || !/^#[0-9a-f]{6}$/i.test(i.oscuro ?? "")) errores.push(`iniciativa ${i.id}: le falta nombre, color u oscuro (#rrggbb)`);
  }
  const usadas = new Set();
  const comun = (x, quien) => {
    if (!ini.has(x.iniciativa)) errores.push(`${quien}: iniciativa «${x.iniciativa}» no existe`);
    usadas.add(x.iniciativa);
    if (!x.titulo || x.titulo.length > 90) errores.push(`${quien}: título vacío o de más de 90 letras`);
    if (!x.que || x.que.length > 320) errores.push(`${quien}: «que» vacío o de más de 320 letras`);
    if (!x.paraQuien) errores.push(`${quien}: le falta «paraQuien»`);
    if (x.tema != null && !temas.has(x.tema)) errores.push(`${quien}: el tema ${x.tema} no está en el bloque temas`);
    for (const n of x.preguntas ?? []) if (!preguntas.has(n)) errores.push(`${quien}: la pregunta ${n} no está en «Lo que decides tú»`);
  };
  let antes = "";
  for (const h of d.hecho ?? []) {
    const quien = `hecho «${h.titulo}»`;
    comun(h, quien);
    if (!ISO.test(h.fecha ?? "")) errores.push(`${quien}: fecha AAAA-MM-DD`);
    if (h.hasta && (!ISO.test(h.hasta) || h.hasta < h.fecha)) errores.push(`${quien}: «hasta» inválido`);
    if (h.fecha < antes) errores.push(`${quien}: fuera de orden (lo hecho va del más viejo al más nuevo)`);
    if (h.fecha > d.hoy) errores.push(`${quien}: fecha después de hoy`);
    antes = h.fecha;
    if (!PROD.includes(h.prod)) errores.push(`${quien}: «prod» vale ${PROD.join(", ")}`);
    if (h.prod !== "si" && !h.prodNota) errores.push(`${quien}: «prod» ${h.prod} necesita «prodNota»`);
  }
  for (const s of d.sigue ?? []) {
    const quien = `sigue «${s.titulo}»`;
    comun(s, quien);
    if (s.fecha || s.hasta) errores.push(`${quien}: lo que sigue no lleva fecha`);
    if (FECHA_EN_TEXTO.test(`${s.titulo} ${s.que} ${s.esperaA ?? ""}`)) errores.push(`${quien}: menciona una fecha o un plazo; lo que sigue va sin tiempos`);
    if (!ESTADOS.includes(s.estado)) errores.push(`${quien}: «estado» vale ${ESTADOS.join(", ")}`);
    if (s.estado === "espera" && !s.esperaA) errores.push(`${quien}: en espera, ¿de qué? (falta «esperaA»)`);
    // Las ramas (20 nov): al abrir el punto, el hilo se divide en ramas paralelas y se une en el siguiente punto.
    if (s.ramas != null) {
      if (!Array.isArray(s.ramas) || s.ramas.length < 2) errores.push(`${quien}: «ramas» necesita al menos dos ramas`);
      for (const r of Array.isArray(s.ramas) ? s.ramas : []) {
        if (!r.titulo || r.titulo.length > 60) errores.push(`${quien}: una rama sin título o de más de 60 letras`);
        if (!Array.isArray(r.pasos) || !r.pasos.length) errores.push(`${quien}: la rama «${r.titulo}» no tiene pasos`);
        for (const p of r.pasos ?? []) {
          if (!p.texto || p.texto.length > 120) errores.push(`${quien} › ${r.titulo}: un paso sin texto o de más de 120 letras`);
          if (!PASOS.includes(p.estado)) errores.push(`${quien} › ${r.titulo}: estado «${p.estado}» (vale ${PASOS.join(", ")})`);
          if (p.pregunta != null && !preguntas.has(p.pregunta)) errores.push(`${quien} › ${r.titulo}: la pregunta ${p.pregunta} no está en «Lo que decides tú»`);
          if (FECHA_EN_TEXTO.test(p.texto ?? "")) errores.push(`${quien} › ${r.titulo}: «${p.texto}» menciona una fecha o un plazo`);
        }
      }
      if (!s.seUneEn) errores.push(`${quien}: con ramas, falta «seUneEn» (el punto del hilo donde se unen)`);
      else if (s.seUneEn === s.titulo || !(d.sigue ?? []).some((x) => x.titulo === s.seUneEn)) errores.push(`${quien}: «seUneEn» no nombra otro punto de «sigue»`);
    } else if (s.seUneEn) errores.push(`${quien}: «seUneEn» sin ramas`);
  }
  for (const id of ini) if (!usadas.has(id)) errores.push(`la iniciativa ${id} no tiene ningún hito`);
  if (errores.length) throw new Error("La línea de tiempo no cuadra:\n- " + errores.join("\n- "));
}

/**
 * El bloque «ejecutivo» (2026-11-21): lo primero que ve Elías. Una fila por iniciativa, corta a propósito («debería ser
 * muy ejecutivo… agrupar mucho los cambios relacionados, no cambio por cambio»): hasta 3 frases de lo hecho y hasta 3
 * cosas que siguen, sin fechas. Una iniciativa en curso trae sus ramas. Las reglas, en la skill regenerar-roadmap.
 */
function validarEjecutivo(texto) {
  const t = texto.replace(/\r/g, "");
  const m = t.match(/```ejecutivo\n([\s\S]*?)\n```/);
  if (!m) throw new Error("Falta el bloque ```ejecutivo (el resumen ejecutivo) en roadmap.md");
  const d = JSON.parse(m[1]);
  const errores = [];
  const ESTADOS = ["en-curso", "te-espera", "funciona", "propuesta"];
  const PASOS = ["hecho", "en-curso", "te-toca", "espera", "por-hacer"];
  const FECHA = /\b\d{1,2} (de )?(ene|feb|mar|abr|may|jun|jul|ago|sep|oct|nov|dic)\b|\b20\d\d-\d\d|\b\d+ semanas?\b|\bpróxim[ao] (semana|mes)\b/i;
  const linea = JSON.parse(t.match(/```linea\n([\s\S]*?)\n```/)[1]);
  const colores = new Set((linea.iniciativas ?? []).map((i) => i.id));
  const dec = t.slice(t.indexOf("## Lo que decides tú"));
  const fin = dec.indexOf("\n## ", 5);
  const preguntas = new Set();
  for (const l of (fin > 0 ? dec.slice(0, fin) : dec).split("\n")) { const x = l.match(/^(\d+)\. /); if (x) preguntas.add(Number(x[1])); }
  // Una frase: termina en punto y no trae otra adentro («… algo. Otra cosa …»).
  const unaFrase = (s) => !/[.!?]\s+[«(]?[A-ZÁÉÍÓÚÑ¿¡]/.test(s.trim().replace(/[.!?]$/, ""));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.corte ?? "")) errores.push("«corte» tiene que ser una fecha AAAA-MM-DD");
  if (!/^[0-9a-f]{7,12}$/.test(d.produccion ?? "")) errores.push("«produccion» tiene que ser el sha corto de producción");
  if (!Array.isArray(d.arriba) || d.arriba.length < 1 || d.arriba.length > 4) errores.push("«arriba» lleva de 1 a 4 líneas");
  for (const l of d.arriba ?? []) if (l.length > 260) errores.push(`«arriba»: una línea pasa de 260 letras (${l.length})`);
  const ini = d.iniciativas ?? [];
  if (ini.length < 4 || ini.length > 10) errores.push(`«iniciativas»: son ${ini.length}; el ejecutivo lleva de 4 a 10`);
  const ids = new Set();
  for (const i of ini) {
    const quien = `iniciativa «${i.nombre ?? i.id}»`;
    if (!i.id || ids.has(i.id)) errores.push(`${quien}: id vacío o repetido`);
    ids.add(i.id);
    if (!colores.has(i.color)) errores.push(`${quien}: «color» tiene que ser una iniciativa del bloque linea (${[...colores].join(", ")})`);
    if (!ESTADOS.includes(i.estado)) errores.push(`${quien}: «estado» vale ${ESTADOS.join(", ")}`);
    if (!i.donde || i.donde.length > 170 || !unaFrase(i.donde)) errores.push(`${quien}: «donde» es una sola frase de hasta 170 letras`);
    if (!Array.isArray(i.hecho) || !i.hecho.length || i.hecho.length > 3) errores.push(`${quien}: «hecho» lleva de 1 a 3 frases`);
    for (const h of i.hecho ?? []) {
      if (h.length > 220) errores.push(`${quien}: una frase de «hecho» pasa de 220 letras (${h.length})`);
      if (!unaFrase(h)) errores.push(`${quien}: «${h.slice(0, 50)}…» trae más de una frase; cada línea de «hecho» es una frase`);
    }
    if (!Array.isArray(i.sigue) || !i.sigue.length || i.sigue.length > 3) errores.push(`${quien}: «sigue» lleva de 1 a 3 cosas`);
    for (const s of i.sigue ?? []) {
      if (s.length > 160) errores.push(`${quien}: una línea de «sigue» pasa de 160 letras (${s.length})`);
      if (FECHA.test(s)) errores.push(`${quien}: «${s}» menciona una fecha o un plazo; lo que sigue va sin tiempos`);
    }
    if (i.teToca && i.teToca.length > 200) errores.push(`${quien}: «teToca» pasa de 200 letras`);
    for (const n of i.preguntas ?? []) if (!preguntas.has(n)) errores.push(`${quien}: la pregunta ${n} no está en «Lo que decides tú»`);
    if (i.estado === "en-curso" && !i.ramas) errores.push(`${quien}: en curso sin «ramas»`);
    if (i.ramas != null) {
      if (!Array.isArray(i.ramas) || i.ramas.length < 2 || i.ramas.length > 5) errores.push(`${quien}: «ramas» lleva de 2 a 5 ramas`);
      for (const r of Array.isArray(i.ramas) ? i.ramas : []) {
        if (!r.titulo || r.titulo.length > 60) errores.push(`${quien}: una rama sin título o de más de 60 letras`);
        if (!Array.isArray(r.pasos) || !r.pasos.length || r.pasos.length > 5) errores.push(`${quien} › ${r.titulo}: de 1 a 5 pasos`);
        for (const p of r.pasos ?? []) {
          if (!p.texto || p.texto.length > 90) errores.push(`${quien} › ${r.titulo}: un paso sin texto o de más de 90 letras`);
          if (!PASOS.includes(p.estado)) errores.push(`${quien} › ${r.titulo}: estado «${p.estado}» (vale ${PASOS.join(", ")})`);
          if (p.pregunta != null && !preguntas.has(p.pregunta)) errores.push(`${quien} › ${r.titulo}: la pregunta ${p.pregunta} no está en «Lo que decides tú»`);
          if (FECHA.test(p.texto ?? "")) errores.push(`${quien} › ${r.titulo}: «${p.texto}» menciona una fecha o un plazo`);
        }
      }
      if (!i.seUneEn || i.seUneEn.length > 90) errores.push(`${quien}: con ramas, «seUneEn» (dónde se unen) es obligatorio y de hasta 90 letras`);
    }
  }
  if (errores.length) throw new Error("El resumen ejecutivo no cuadra:\n- " + errores.join("\n- "));
}
