/**
 * lib/feedback/reglas.ts — las reglas del feedback, puras y client-safe (2026-10-04).
 *
 * El botón «Feedback» del pie del menú guarda un reporte desde cualquier pantalla interna: algo falla,
 * una mejora o algo que no se entiende. Lo revisa dirección en /feedback. Acá viven los valores que la
 * base guarda como TEXT (INV4: sumar uno no exige un ALTER TYPE) y lo que se deriva de ellos.
 *
 * ── LAS DECISIONES QUE SOSTIENE ESTE ARCHIVO ─────────────────────────────────
 * · Un reporte NO es un tema. Llega a la hoja de ruta solo cuando una persona lo lleva desde la bandeja:
 *   nada entra solo (Elías, 2026-10-04: «¿cómo llega un ítem ahí?»).
 * · Un tema nuevo entra en «Por decidir», salvo que al crearlo se elija otra columna.
 * · El estado que ve quien reportó SIGUE AL TEMA: si el tema pasa a «Listo», su reporte también.
 * · Revisa el feedback el rol SUPER_ADMIN («la parte que voy a ver yo, o los super admins»).
 */

export const TIPOS_DE_FEEDBACK = ["falla", "mejora", "duda"] as const;
export type TipoDeFeedback = (typeof TIPOS_DE_FEEDBACK)[number];

export interface DefinicionDeTipo {
  nombre: string;
  /** La pregunta arriba del texto. */
  etiqueta: string;
  ejemplo: string;
  /** El botón de mandar: la acción con su objeto. */
  boton: string;
  /** Trazo del ícono (24×24, sin relleno). */
  icono: string;
}

export const TIPO: Record<TipoDeFeedback, DefinicionDeTipo> = {
  falla: {
    nombre: "Algo falla",
    etiqueta: "¿Qué pasó y qué esperabas?",
    ejemplo: "Por ejemplo: guardé la fecha y al recargar volvió a la anterior.",
    boton: "Mandar el problema",
    icono: "M12 4l9 16H3z M12 10v4 M12 17v.5",
  },
  mejora: {
    nombre: "Una mejora",
    etiqueta: "¿Qué cambiarías y para qué te serviría?",
    ejemplo: "Por ejemplo: ver la próxima reunión en la lista me ahorraría abrir cada ficha.",
    boton: "Mandar la mejora",
    icono: "M9 18h6 M10 21h4 M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z",
  },
  duda: {
    nombre: "No se entiende",
    etiqueta: "¿Qué no se entiende?",
    ejemplo: "Por ejemplo: no sé qué quiere decir «Validación de uso» ni cuándo se pasa ahí.",
    boton: "Mandar la duda",
    icono: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z M9.5 9.5a2.5 2.5 0 0 1 5 .5c0 1.5-2.5 2-2.5 3.5 M12 17v.5",
  },
};

export function esTipoDeFeedback(x: unknown): x is TipoDeFeedback {
  return typeof x === "string" && (TIPOS_DE_FEEDBACK as readonly string[]).includes(x);
}

/** Qué se decidió con un reporte. */
export const ESTADOS_DE_REPORTE = ["sin_revisar", "en_hoja", "respondido", "no_se_hara"] as const;
export type EstadoDeReporte = (typeof ESTADOS_DE_REPORTE)[number];

/** Las columnas de la hoja de ruta, en orden. */
export const COLUMNAS = ["decidir", "planeado", "curso", "listo"] as const;
export type Columna = (typeof COLUMNAS)[number];

export interface DefinicionDeColumna {
  nombre: string;
  ayuda: string;
  /** Lo que se lee en «Mover a…». */
  corta: string;
  marca: "○" | "●" | "✓";
  /** Color de la marca (token): solo la marca, nunca el texto. */
  tono: "muted" | "warning" | "brand" | "success";
}

export const COLUMNA: Record<Columna, DefinicionDeColumna> = {
  decidir: {
    nombre: "Por decidir",
    ayuda: "Temas que creaste y todavía no decidiste si se hacen.",
    corta: "guardar para después",
    marca: "○",
    tono: "muted",
  },
  planeado: { nombre: "Planeado", ayuda: "Decidiste hacerlos; todavía no empezaron.", corta: "se hace", marca: "●", tono: "warning" },
  curso: { nombre: "En curso", ayuda: "Los estás haciendo.", corta: "lo estás haciendo", marca: "●", tono: "brand" },
  listo: {
    nombre: "Listo",
    ayuda: "Ya están en producción. Se avisó a quien los pidió.",
    corta: "avisa a quien lo pidió",
    marca: "✓",
    tono: "success",
  },
};

export function esColumna(x: unknown): x is Columna {
  return typeof x === "string" && (COLUMNAS as readonly string[]).includes(x);
}

/** De dónde salió un tema. */
export const ORIGENES_DE_TEMA = ["reporte", "sugerencia", "mano"] as const;
export type OrigenDeTema = (typeof ORIGENES_DE_TEMA)[number];

export const MAX_CUERPO = 4000;
export const MAX_MARCAS = 3;
/** Los «Listo» se muestran en la hoja de ruta durante este tiempo; después quedan en el historial. */
export const DIAS_DE_LISTO_A_LA_VISTA = 28;

/** Revisa el feedback (bandeja, hoja de ruta, personas) el rol SUPER_ADMIN. */
export function esRevisorDeFeedback(role: string | null | undefined): boolean {
  return role === "SUPER_ADMIN";
}

/** El número que se cita: «F-128». */
export function numeroDeReporte(n: number): string {
  return `F-${n}`;
}

/** Un reporte que le frena el trabajo a alguien llega como urgente. */
export function esUrgente(r: { tipo: string; meFrena: boolean }): boolean {
  return r.tipo === "falla" && r.meFrena;
}

export interface EstadoVisible {
  texto: string;
  marca: "○" | "●" | "✓" | "✕";
  tono: "muted" | "warning" | "brand" | "success";
  /** Verde = cerrado bien (listo o respondido). */
  verde: boolean;
}

/**
 * Lo que ve quien reportó. El estado SIGUE AL TEMA: si el reporte está en la hoja de ruta, manda la
 * columna del tema; si no, lo que se decidió con el reporte.
 */
export function estadoParaElAutor(r: { estado: string; tema?: { columna: string } | null }): EstadoVisible {
  if (r.estado === "en_hoja" && r.tema && esColumna(r.tema.columna)) {
    const c = r.tema.columna;
    if (c === "listo") return { texto: "Listo", marca: "✓", tono: "success", verde: true };
    if (c === "curso") return { texto: "En curso", marca: "●", tono: "brand", verde: false };
    if (c === "planeado") return { texto: "Planeado", marca: "●", tono: "warning", verde: false };
    return { texto: "En la hoja de ruta", marca: "○", tono: "muted", verde: false };
  }
  if (r.estado === "respondido") return { texto: "Respondido", marca: "✓", tono: "success", verde: true };
  if (r.estado === "no_se_hara") return { texto: "No se hará", marca: "✕", tono: "muted", verde: false };
  return { texto: "Recibido", marca: "○", tono: "muted", verde: false };
}

/** «Chrome 129 · Windows» desde el user agent. Sin librerías: lo justo para leerlo en la bandeja. */
export function describirNavegador(ua: string): string {
  const so = /Windows/i.test(ua)
    ? "Windows"
    : /Android/i.test(ua)
      ? "Android"
      : /iPhone|iPad|iPod/i.test(ua)
        ? "iOS"
        : /Mac OS X|Macintosh/i.test(ua)
          ? "macOS"
          : /Linux/i.test(ua)
            ? "Linux"
            : "";
  const busca = (re: RegExp, nombre: string) => {
    const m = ua.match(re);
    return m ? `${nombre} ${m[1]}` : null;
  };
  const nav =
    busca(/Edg\/(\d+)/, "Edge") ??
    busca(/OPR\/(\d+)/, "Opera") ??
    busca(/Firefox\/(\d+)/, "Firefox") ??
    busca(/Chrome\/(\d+)/, "Chrome") ??
    (/Safari/i.test(ua) ? busca(/Version\/(\d+)/, "Safari") : null) ??
    "Navegador desconocido";
  return so ? `${nav} · ${so}` : nav;
}

/** ¿Este pedido de opinión se muestra en esta dirección, hoy? */
export function pedidoAplica(
  p: { estado: string; ruta: string; hasta: Date | string | null },
  ruta: string,
  hoy: Date = new Date(),
): boolean {
  if (p.estado !== "abierto") return false;
  if (p.hasta) {
    const hasta = new Date(p.hasta);
    // Vale hasta el final del día que se eligió.
    hasta.setHours(23, 59, 59, 999);
    if (hasta.getTime() < hoy.getTime()) return false;
  }
  const base = p.ruta.replace(/\/+$/, "") || "/";
  if (base === "/") return true;
  return ruta === base || ruta.startsWith(`${base}/`) || ruta.startsWith(`${base}?`);
}

/** «hace 12 min», «ayer», «29 sep»: lo que se lee en una lista. */
export function haceCuanto(fecha: Date | string, ahora: Date = new Date()): string {
  const d = new Date(fecha);
  const min = Math.round((ahora.getTime() - d.getTime()) / 60000);
  if (min < 1) return "recién";
  if (min < 60) return `hace ${min} min`;
  const horas = Math.round(min / 60);
  if (horas < 24 && d.getDate() === ahora.getDate()) return `hace ${horas} h`;
  const ayer = new Date(ahora);
  ayer.setDate(ahora.getDate() - 1);
  if (d.toDateString() === ayer.toDateString()) return "ayer";
  return fechaCorta(d);
}

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/** «29 sep». */
export function fechaCorta(fecha: Date | string): string {
  const d = new Date(fecha);
  return `${d.getDate()} ${MESES[d.getMonth()]}`;
}

/** «una idea», «cuarta idea»: cómo se dice cuántas ideas lleva alguien en el festejo (sin nombres). */
export function lineaDeIdeas(n: number): string {
  if (n <= 1) return "Es tu primera idea en 30 días.";
  const ORDINAL = ["", "primera", "segunda", "tercera", "cuarta", "quinta", "sexta", "séptima", "octava", "novena", "décima"];
  return n < ORDINAL.length ? `Es tu ${ORDINAL[n]} idea en 30 días.` : `Llevas ${n} ideas en 30 días.`;
}
