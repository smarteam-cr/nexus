/**
 * lib/contexto/frontera-del-cronograma.ts — EL DETECTOR DE LA FRONTERA. Puro, client-safe.
 *
 * ── QUÉ HACE ─────────────────────────────────────────────────────────────────
 * Los títulos de las tareas, sus notas y los nombres de fase los lee el CLIENTE. El material del
 * «Contexto del cronograma» (reuniones y notas) es INTERNO. La defensa principal es el rótulo
 * (`FRONTERA_DEL_MATERIAL`, en ./material-cronograma.ts); esto es la red: marca un texto que
 * dice de dónde salió («confirmadas en kick-off»), trae un monto, una fecha, un plazo o un correo,
 * o copia una frase entera del material. Solo AVISA: el CSE decide.
 *
 * ── PRIMERO LA PRECISIÓN ─────────────────────────────────────────────────────
 * Un aviso que salta sobre textos legítimos se aprende a ignorar en una semana. Por eso:
 *  · sin material no hay huellas y no corre nada (`activa: false`): un proyecto que no eligió
 *    reuniones ni pegó notas no ve ningún aviso nuevo;
 *  · la COPIA se mide con ventanas de palabras seguidas, por campo, calibradas contra el A/B de CAV
 *    (2026-09-23):
 *      - NOTAS: 10 palabras, con al menos 5 de 4+ letras. La nota que copió el centinela S4
 *        compartía 12; las legítimas llegaron hasta 8 («tarjetas dinámicas y objetos
 *        personalizados para mantener la»).
 *      - TÍTULOS y NOMBRES de fase: también 10 (recalibrado en la revisión del paso D1). Con 8,
 *        «Organización de carpetas en Google Drive para activos visuales» (9 palabras, todas de la
 *        reunión) salía como fuga y «Organizar carpetas en Google Drive para activos visuales» no:
 *        el mismo trabajo, sin nada interno, separado por una palabra. En un título, lo que lo hace
 *        fuga es lo que trae —un monto, una fecha, un plazo, un correo, la cita de la fuente—, y eso
 *        lo marcan las reglas de arriba con cualquier largo. La copia solo marca el título largo
 *        como una oración (10 palabras seguidas del material): eso ya no es el nombre de una tarea.
 *        En los 113 títulos de las dos corridas la racha más larga compartida fue de 4.
 *  · sin regla de canales: «WhatsApp» puede ser una tarea legítima.
 *
 * ⚠ Da falsos negativos a propósito (una paráfrasis, un nombre de persona suelto): eso queda para
 * el rótulo y para la mirada del CSE.
 *
 * Lo usan los previews del detalle (`marcarFugas`), «Pedir cambio con IA» (`fugasDeLaPropuesta`),
 * el revisor de fases (`fugaEn` sobre los nombres) y el chat del cronograma (`lineasConFrontera`):
 * un solo detector.
 */

export type CampoDeFrontera = "titulo" | "nota";

/**
 * Las ventanas de la COPIA, por campo. Ver el docblock: cambiarlas es recalibrar contra CAV. Hoy
 * valen lo mismo, pero siguen separadas: los títulos se recalibraron una vez y pueden volver a
 * moverse sin tocar las notas.
 */
export const VENTANA_DE_COPIA: Readonly<Record<CampoDeFrontera, { palabras: number; conContenido: number }>> = {
  nota: { palabras: 10, conContenido: 5 },
  titulo: { palabras: 10, conContenido: 5 },
};

export interface HuellasDeFrontera {
  /** `false` sin material: el detector no corre. */
  activa: boolean;
  /** Las rachas del material, ya normalizadas, por campo. */
  ngramas: Record<CampoDeFrontera, Set<string>>;
}

export const MOTIVOS_DE_FUGA = {
  cita: "dice de dónde salió",
  monto: "trae un monto",
  fecha: "trae una fecha",
  plazo: "trae un plazo",
  correo: "trae un correo",
  copia: "copia una frase de una reunión o nota",
} as const;

/** Minúsculas, sin tildes, lo que no es letra ni número pasa a espacio. */
export function normalizarParaFrontera(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function rachas(palabras: readonly string[], largo: number, conContenido: number): string[] {
  const out: string[] = [];
  for (let i = 0; i + largo <= palabras.length; i++) {
    const ventana = palabras.slice(i, i + largo);
    if (ventana.filter((p) => p.length >= 4).length >= conContenido) out.push(ventana.join(" "));
  }
  return out;
}

/** Las huellas del material INTERNO (lo que entró al prompt). Cada texto por separado. */
export function huellasDeFrontera(textos: readonly string[]): HuellasDeFrontera {
  const ngramas: Record<CampoDeFrontera, Set<string>> = { nota: new Set(), titulo: new Set() };
  let activa = false;
  for (const t of textos) {
    if (!t || !t.trim()) continue;
    activa = true;
    const palabras = normalizarParaFrontera(t).split(" ").filter(Boolean);
    for (const campo of ["nota", "titulo"] as const) {
      const { palabras: largo, conContenido } = VENTANA_DE_COPIA[campo];
      for (const r of rachas(palabras, largo, conContenido)) ngramas[campo].add(r);
    }
  }
  return { activa, ngramas };
}

/* Sobre el texto NORMALIZADO (sin tildes ni signos): «kick-off» llega como «kick off». */
const CITA =
  /\b(?:segun|(?:acordad|confirmad|definid|mencionad|conversad)[oa]s?)\s+(?:(?:en|por|con)\s+)?(?:(?:el|la|los|las|lo)\s+)?(?:reunion(?:es)?|kick\s?off|kickoff|sesion(?:es)?|llamada|notas?|minuta|transcripcion)\b/;
const MESES =
  "enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre|" +
  "ene|feb|mar|abr|may|jun|jul|ago|sept?|oct|nov|dic";
const FECHA = new RegExp(`\\b\\d{1,2}\\s+(?:de\\s+)?(?:${MESES})\\b`);
/* Con días también (2026-09-24): «90 días», «30 días hábiles» son plazos igual que «12 semanas». */
const PLAZO = /\b\d+\s+(?:semanas?|mes|meses|dias?)\b/;
/* Sobre el texto ORIGINAL (la normalización se come los signos). */
const FECHA_NUMERICA = /\b\d{4}-\d{2}-\d{2}\b|\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/;
const MONTO = /(?:US\$|\$|₡|€|\bUSD|\bCRC|\bCLP|\bCOP|\bMXN|\bEUR)\s?\d|\d[\d.,]*\s?(?:usd|d[oó]lares|pesos|colones|euros)\b/i;
const CORREO = /[\w.+-]+@[\w-]+\.[\w.]+/;

/**
 * El primer motivo por el que `texto` cruza la frontera, o `null`. `campo` elige la ventana de la
 * copia: "titulo" para títulos de tarea y nombres de fase, "nota" para las notas.
 */
export function fugaEn(
  texto: string | null | undefined,
  h: HuellasDeFrontera,
  campo: CampoDeFrontera = "nota",
): string | null {
  if (!h.activa || !texto || !texto.trim()) return null;
  const n = normalizarParaFrontera(texto);
  if (CITA.test(n)) return MOTIVOS_DE_FUGA.cita;
  if (MONTO.test(texto)) return MOTIVOS_DE_FUGA.monto;
  if (FECHA.test(n) || FECHA_NUMERICA.test(texto)) return MOTIVOS_DE_FUGA.fecha;
  if (PLAZO.test(n)) return MOTIVOS_DE_FUGA.plazo;
  if (CORREO.test(texto)) return MOTIVOS_DE_FUGA.correo;
  const { palabras: largo, conContenido } = VENTANA_DE_COPIA[campo];
  const palabras = n.split(" ").filter(Boolean);
  if (rachas(palabras, largo, conContenido).some((r) => h.ngramas[campo].has(r))) return MOTIVOS_DE_FUGA.copia;
  return null;
}

export interface FugaDeTarea {
  campo: "titulo" | "nota";
  motivo: string;
  /**
   * Cuando el título Y la nota cruzan: el motivo de la NOTA. El chip muestra primero el título (lo
   * primero que lee el cliente); al corregirlo, la marca pasa a la nota en vez de irse
   * (`fugaTrasEditar`). Sin esto, editar el título borraba el chip y la nota con la fecha o la cita
   * llegaba al Gantt del cliente sin aviso (revisión del paso D3, 2026-09-24).
   */
  motivoDeLaNota?: string;
}

/**
 * Marca cada tarea: primero el título, después la nota —y si cruzan los dos, la del título lleva
 * también el motivo de la nota—. `fuga: null` si ninguno cruza.
 */
export function marcarFugas<T extends { title: string; notes?: string | null }>(
  tareas: readonly T[],
  h: HuellasDeFrontera,
): Array<T & { fuga: FugaDeTarea | null }> {
  return tareas.map((t) => {
    const enTitulo = fugaEn(t.title, h, "titulo");
    const enNota = fugaEn(t.notes ?? null, h, "nota");
    if (enTitulo) {
      return { ...t, fuga: { campo: "titulo", motivo: enTitulo, ...(enNota ? { motivoDeLaNota: enNota } : {}) } };
    }
    return { ...t, fuga: enNota ? { campo: "nota", motivo: enNota } : null };
  });
}

/**
 * Las operaciones del CHAT cuyo texto lee el cliente, y el campo que lo lleva. El chat escribe
 * títulos de tarea y nombres de fase; nada más de lo que emite llega al cronograma publicado.
 */
const CAMPO_QUE_LEE_EL_CLIENTE: Readonly<Record<string, "titulo" | "nombre">> = {
  "tarea.crear": "titulo",
  "tarea.renombrar": "titulo",
  "fase.crear": "nombre",
  "fase.renombrar": "nombre",
};

/** El sufijo de la línea marcada. `motivo` sale de `MOTIVOS_DE_FUGA`. */
export const avisoDeFronteraEnLaLinea = (motivo: string) => ` — ⚠ revisa: lo lee el cliente y ${motivo}`;

/**
 * LAS LÍNEAS DEL ACUERDO DEL CHAT, con el aviso de la frontera (paso C, 2026-09-23). Desde que el
 * chat del cronograma lee las reuniones y las notas elegidas, un título que propone puede repetir
 * una frase del material, o traer un monto, una fecha o un correo. La regla va en el rótulo del
 * bloque; esto es la red, y solo AVISA: la línea termina en «⚠ revisa…» y el CSE la desmarca o
 * pide otro título antes de Aplicar.
 *
 * ⛔ Devuelve EXACTAMENTE una línea por operación, en el mismo orden: `leerAcuerdo` descarta las
 * líneas que no son una por operación y el botón queda apagado (lib/asistente/acuerdo.ts). Solo
 * les agrega un sufijo a las de `tarea.crear`, `tarea.renombrar`, `fase.crear` y `fase.renombrar`
 * cuyo texto cruza la frontera. Sin huellas (sin material), o con largos distintos, las devuelve
 * tal cual.
 */
export function lineasConFrontera(
  lineas: readonly string[],
  operaciones: readonly { op?: unknown; titulo?: unknown; nombre?: unknown }[],
  h: HuellasDeFrontera | null,
): string[] {
  if (!h || !h.activa || lineas.length !== operaciones.length) return [...lineas];
  return lineas.map((linea, i) => {
    const o = operaciones[i];
    const campo = typeof o?.op === "string" ? CAMPO_QUE_LEE_EL_CLIENTE[o.op] : undefined;
    if (!campo) return linea;
    const texto = o[campo];
    const motivo = typeof texto === "string" ? fugaEn(texto, h, "titulo") : null;
    return motivo ? `${linea}${avisoDeFronteraEnLaLinea(motivo)}` : linea;
  });
}

interface TareaConTexto {
  title?: unknown;
  notes?: unknown;
}
interface FaseConTexto {
  name?: unknown;
  notes?: unknown;
  tasks?: readonly TareaConTexto[] | null;
}

const recortarCita = (s: string) => (s.length > 60 ? `${s.slice(0, 57).trimEnd()}…` : s);

/**
 * Los AVISOS de una propuesta de cambios: revisa solo el texto NUEVO o CAMBIADO (lo que ya estaba
 * en el cronograma, igual tras normalizar, no se vuelve a marcar) — títulos, notas de tarea,
 * nombres de fase y notas de fase.
 */
export function fugasDeLaPropuesta(
  propuesta: { phases?: readonly FaseConTexto[] | null } | null | undefined,
  actuales: readonly FaseConTexto[],
  h: HuellasDeFrontera,
): string[] {
  if (!h.activa || !propuesta?.phases) return [];
  const yaEstaban = new Set<string>();
  const anotar = (v: unknown) => {
    if (typeof v === "string" && v.trim()) yaEstaban.add(normalizarParaFrontera(v));
  };
  for (const f of actuales) {
    anotar(f.name);
    anotar(f.notes);
    for (const t of f.tasks ?? []) {
      anotar(t.title);
      anotar(t.notes);
    }
  }

  const avisos: string[] = [];
  const revisar = (texto: unknown, campo: CampoDeFrontera, de: unknown, que: string, corrigelo: string) => {
    if (typeof texto !== "string" || !texto.trim()) return;
    if (yaEstaban.has(normalizarParaFrontera(texto))) return;
    const motivo = fugaEn(texto, h, campo);
    if (!motivo) return;
    const cita = recortarCita(typeof de === "string" && de.trim() ? de.trim() : texto.trim());
    avisos.push(
      `“${cita}”: ${que} ${motivo} — el cliente lee títulos, notas y nombres de fase; ${corrigelo} o descarta ` +
        `ese cambio antes de aplicar.`,
    );
  };
  for (const f of propuesta.phases) {
    revisar(f.name, "titulo", f.name, "el nombre de la fase", "corrígelo");
    revisar(f.notes, "nota", f.name, "la nota de la fase", "corrígela");
    for (const t of f.tasks ?? []) {
      revisar(t.title, "titulo", t.title, "el título", "corrígelo");
      revisar(t.notes, "nota", t.title, "la nota", "corrígela");
    }
  }
  return avisos;
}
