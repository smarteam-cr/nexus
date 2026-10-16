/**
 * lib/notas/reglas.ts — las notas de la cuenta (etapa 5 de docs/mi-dia-plan.md). PURO y CLIENT-SAFE.
 *
 * Una nota guarda lo que pasó por WhatsApp, una llamada, un correo o en persona, que no quedó en una reunión de Meet. Se
 * escribe en HubSpot como nota de la empresa (y del negocio o el proyecto) y entra a la memoria interna de la cuenta.
 * Después de una reunión con el cliente, Nexus SUGIERE la nota con lo acordado (esas reuniones no quedan en el registro
 * de HubSpot): una persona la usa, la cambia o la descarta.
 *
 * Lo que escribe la base vive en lib/notas/escritura-server.ts; esto solo decide qué se escribe y cómo se lee.
 */

export const CANALES = ["whatsapp", "llamada", "correo", "en_persona", "reunion", "otro"] as const;
export type CanalDeLaNota = (typeof CANALES)[number];

/** Los canales que se eligen al anotar a mano. «Reunión» es el de la nota sugerida (una reunión a mano va por «Agregar reunión»). */
export const CANALES_A_MANO = ["whatsapp", "llamada", "correo", "en_persona", "otro"] as const satisfies readonly CanalDeLaNota[];

export const ETIQUETA_DEL_CANAL: Record<CanalDeLaNota, string> = {
  whatsapp: "WhatsApp",
  llamada: "Llamada",
  correo: "Correo",
  en_persona: "En persona",
  reunion: "Reunión",
  otro: "Otro",
};

export type OrigenDeLaNota = "persona" | "reunion" | "chat";
export type EstadoDeLaNota = "vigente" | "descartada" | "archivada";
export type EstadoEnHubspot = "pendiente" | "escrita" | "error" | "sin_hubspot" | "no_va";

/** Cuántos caracteres admite una nota (HubSpot acepta mucho más; esto es para que siga siendo una nota). */
export const MAX_TEXTO_DE_LA_NOTA = 4000;
/** Cuántas veces se reintenta escribir en HubSpot (lo reintenta el job `contactos-y-tickets`). */
export const MAX_INTENTOS_EN_HUBSPOT = 5;
/** Cuántos días pide revisión la nota sugerida después de una reunión (la regla de todo lo propuesto). */
export const DIAS_DE_LA_SUGERENCIA = 30;
/**
 * Desde qué día de reunión Nexus sugiere la nota: el día en que salió (2026-10-16). Las reuniones de antes no la
 * piden: aparecerían de golpe decenas de sugerencias de hace semanas, y «Uso de Nexus» las contaría como vencidas.
 */
export const SUGERENCIAS_DESDE = "2026-10-16";

/** ¿La reunión (su día en Costa Rica, AAAA-MM-DD) tiene nota sugerida? Desde que salió la función. */
export function reunionConNotaSugerida(diaDeLaReunion: string): boolean {
  return diaDeLaReunion >= SUGERENCIAS_DESDE;
}

export const esCanal = (x: unknown): x is CanalDeLaNota => typeof x === "string" && (CANALES as readonly string[]).includes(x);

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/** «16 oct 2026», de un día de calendario `AAAA-MM-DD` (o un ISO: se toma el día). Armado a mano: igual en servidor y navegador. */
export function diaEnPalabras(iso: string): string {
  const [a, m, d] = iso.slice(0, 10).split("-").map(Number);
  if (!a || !m || !d) return iso;
  return `${d} ${MESES[m - 1]} ${a}`;
}

/** El día de calendario en Costa Rica (UTC-6, sin horario de verano). */
export function diaDeCostaRica(f: Date): string {
  return new Date(f.getTime() - 6 * 3_600_000).toISOString().slice(0, 10);
}

/** La hora que lleva la nota en HubSpot: el mediodía de Costa Rica de ese día (así no cae en el día de antes). */
export function horaEnHubspot(diaISO: string): string {
  return `${diaISO.slice(0, 10)}T18:00:00.000Z`;
}

const escapar = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/**
 * El cuerpo de la nota en HubSpot (HTML). Arriba, el canal, el día y quién la escribió (el dueño de HubSpot puede no
 * existir: el nombre siempre va en el texto); abajo, el texto tal cual, con sus saltos de línea.
 */
export function cuerpoParaHubspot(n: { canal: CanalDeLaNota; fecha: string; texto: string; autor: string; proyecto?: string | null; reunion?: string | null }): string {
  const cabecera = [ETIQUETA_DEL_CANAL[n.canal], diaEnPalabras(n.fecha)].join(" · ");
  const de = [n.reunion ? `reunión «${n.reunion}»` : null, n.proyecto ? `proyecto «${n.proyecto}»` : null].filter(Boolean).join(" · ");
  const parrafos = n.texto
    .trim()
    .split(/\n{2,}/)
    .map((p) => `<p>${escapar(p).replace(/\n/g, "<br>")}</p>`)
    .join("");
  return `<p><strong>${escapar(cabecera)}</strong> — ${escapar(n.autor)}, desde Nexus${de ? ` (${escapar(de)})` : ""}</p>${parrafos}`;
}

/** Los textos de una lista de la minuta (`[{ text }]` o `["…"]`), sin los vacíos. */
export function textosDeLaMinuta(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((x) => (typeof x === "string" ? x : x && typeof x === "object" && typeof (x as { text?: unknown }).text === "string" ? (x as { text: string }).text : ""))
    .map((t) => t.trim())
    .filter(Boolean);
}

/** Una minuta, con lo que hace falta para sugerir la nota. */
export interface MinutaParaLaNota {
  titulo: string;
  /** AAAA-MM-DD. */
  fecha: string;
  resumen: string | null;
  acuerdos: readonly string[];
  decisiones: readonly string[];
}

/**
 * La nota que Nexus sugiere después de una reunión: lo acordado y lo decidido de su minuta, o su resumen si la minuta
 * no trae ninguno. null = la minuta no dice nada. Es un BORRADOR: la persona la cambia antes de usarla.
 */
export function notaSugeridaDeLaMinuta(m: MinutaParaLaNota): string | null {
  const lista = (xs: readonly string[]) => xs.map((x) => x.trim()).filter(Boolean);
  const acuerdos = lista(m.acuerdos);
  const decisiones = lista(m.decisiones);
  const bloques: string[] = [];
  if (acuerdos.length) bloques.push(["Acuerdos:", ...acuerdos.map((x) => `- ${x}`)].join("\n"));
  if (decisiones.length) bloques.push(["Decisiones:", ...decisiones.map((x) => `- ${x}`)].join("\n"));
  if (!bloques.length) {
    const resumen = (m.resumen ?? "").trim();
    if (!resumen) return null;
    bloques.push(resumen);
  }
  const texto = [`Reunión «${m.titulo.trim()}» del ${diaEnPalabras(m.fecha)}.`, ...bloques].join("\n\n");
  return texto.length > MAX_TEXTO_DE_LA_NOTA ? `${texto.slice(0, MAX_TEXTO_DE_LA_NOTA - 1).trimEnd()}…` : texto;
}

/** El estado en HubSpot, en palabras, para la pantalla. */
export function estadoEnHubspotEnPalabras(e: EstadoEnHubspot, intentos: number): string {
  switch (e) {
    case "escrita":
      return "En HubSpot";
    case "pendiente":
      return "Escribiéndose en HubSpot";
    case "error":
      return intentos >= MAX_INTENTOS_EN_HUBSPOT ? "No se pudo escribir en HubSpot" : "Sin escribir en HubSpot: se reintenta";
    case "sin_hubspot":
      return "Solo en Nexus: la empresa no está en HubSpot";
    case "no_va":
      return "No va a HubSpot";
  }
}

/** Una nota que se lee en HubSpot (la escribió alguien allá o Nexus). */
export interface NotaDeHubspot {
  id: string;
  texto: string;
  /** ms. */
  ts: number;
}

/** Las notas del registro de HubSpot que NO escribió Nexus: las de Nexus ya están en la lista con su canal y su autor. */
export function notasDeHubspotSinLasDeNexus(notas: readonly NotaDeHubspot[], idsDeNexus: ReadonlySet<string>): NotaDeHubspot[] {
  return notas.filter((n) => !idsDeNexus.has(n.id));
}
