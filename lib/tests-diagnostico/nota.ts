/**
 * lib/tests-diagnostico/nota.ts — LA NOTA QUE DEJA EL TEST EN HUBSPOT. PURO.
 *
 * O4 etapa 1: HubSpot recibe lo mismo que hoy, para no romper nada. La nota del test viejo es la que leen «Llegaron por
 * el test» y la preventa (lib/exploraciones/llegadas.ts › `leerNotaDelTest`): el título «📊 Diagnóstico de Rendimiento —
 * Ventas · …» si se terminó (con el enlace al resultado) y «⏳ Diagnóstico SIN TERMINAR — Ventas» si se dejó a medias,
 * con las líneas «Quién:» y «Empresa:». «Diagnóstico de Rendimiento» es la nota del test en línea (decisión del 26 oct).
 * Esta nota tiene esa misma forma: el test de la prueba (`nota.test.ts`) la lee con `leerNotaDelTest`.
 */

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export interface DatosDeLaNota {
  areaNombre: string;
  nombre: string;
  email: string;
  empresa: string | null;
  dominio: string | null;
  industria: string | null;
  puesto: string | null;
  /** Cómo gestionan hoy a sus clientes (desde el 2026-10-28; va en su propia línea, después de «Quién:»). */
  usoDeCrm?: string | null;
  /** «Test web (8 preguntas)». */
  version: string;
}

const lineaDelCrm = (d: DatosDeLaNota) => (d.usoDeCrm ? `<p>Cómo gestionan hoy a sus clientes: ${esc(d.usoDeCrm)}</p>` : "");

/** La nota de un test TERMINADO, con el nivel estimado y el enlace al resultado. */
export function notaDelTestTerminado(d: DatosDeLaNota & { nivelNombre: string | null; recomendacion: string | null; url: string }): string {
  return [
    `<p><strong>📊 Diagnóstico de Rendimiento — ${esc(d.areaNombre)} · ${esc(d.nivelNombre ?? "sin nivel")} (estimado)</strong></p>`,
    `<p>Quién: ${esc(d.nombre)}, ${esc(d.email)}${d.puesto ? ` — ${esc(d.puesto)}` : ""}</p>`,
    lineaDelCrm(d),
    `<p>Empresa: ${[d.empresa, d.dominio, d.industria].filter(Boolean).map((x) => esc(x!)).join(" · ")}</p>`,
    `<p>Versión: ${esc(d.version)}</p>`,
    d.recomendacion ? `<p>Lo que más lo frena: ${esc(d.recomendacion)}</p>` : "",
    `<p>Resultado: <a href="${esc(d.url)}">${esc(d.url)}</a></p>`,
  ]
    .filter(Boolean)
    .join("");
}

/** La nota de un test que se dejó a medias: en qué pregunta quedó. */
export function notaDelTestSinTerminar(d: DatosDeLaNota & { paso: number; total: number }): string {
  return [
    `<p><strong>⏳ Diagnóstico SIN TERMINAR — ${esc(d.areaNombre)}</strong></p>`,
    `<p>Quién: ${esc(d.nombre)}, ${esc(d.email)}${d.puesto ? ` — ${esc(d.puesto)}` : ""}</p>`,
    lineaDelCrm(d),
    `<p>Empresa: ${[d.empresa, d.dominio, d.industria].filter(Boolean).map((x) => esc(x!)).join(" · ")}</p>`,
    `<p>Versión: ${esc(d.version)}</p>`,
    `<p>Llegó a la pregunta ${d.paso} de ${d.total}.</p>`,
  ]
    .filter(Boolean)
    .join("");
}
