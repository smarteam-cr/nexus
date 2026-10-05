/**
 * lib/escala/comentarios/reglas.ts — las reglas de los comentarios de la escala. PURO.
 *
 * Client-safe (sin Prisma ni zod): lo importan las rutas, las consultas y los componentes. Es el
 * único lugar que decide quién edita y quién borra.
 *
 * ── LAS DECISIONES ───────────────────────────────────────────────────────────
 * · Comentan, leen y responden TODOS los del equipo interno (Elías, 2026-09-27; lo sostuvo el
 *   2026-10-05: es una conversación sobre un documento de todos).
 * · Desde el 2026-10-05 un comentario de la escala es un reporte de Feedback (`lib/feedback/escala.ts`):
 *   se decide en la bandeja de /feedback, con las tres salidas de todo reporte, y lo decide cualquier
 *   super admin («Cualquier super admin», Elías). La escala ya no cambia estados: los muestra.
 * · El autor edita o borra lo suyo mientras siga sin revisar y sin respuestas. Después es evidencia:
 *   solo lo borra quien revisa.
 * · El responsable de la escala (por CORREO) sigue existiendo para lo que es suyo: publicar versiones
 *   y el frente «Escala» de «Para ti».
 * · Tipos y estados son texto en la base (no enum, INV4): los valores válidos son estos.
 */
import type { Cierre, Despues } from "@/lib/escala/documento/perfil";
import type { TipoDeAncla } from "@/lib/escala/documento/anclas";

/** Quién decide cómo evoluciona la escala (publica sus versiones). */
export const RESPONSABLES_DE_LA_ESCALA: readonly string[] = ["egonzalez@smarteamcr.com"];

const normal = (email: string) => email.trim().toLowerCase();

export function esResponsable(email: string | null | undefined): boolean {
  return !!email && RESPONSABLES_DE_LA_ESCALA.map(normal).includes(normal(email));
}

// ── Tipos ─────────────────────────────────────────────────────────────────────

export type TipoDeComentario = "no_se_entiende" | "no_calza" | "propuesta";

export const TIPOS_DE_COMENTARIO: readonly {
  clave: TipoDeComentario;
  etiqueta: string;
  /** La pregunta del campo principal del formulario. */
  pregunta: string;
  ayuda: string;
}[] = [
  {
    clave: "no_se_entiende",
    etiqueta: "No se entiende",
    pregunta: "¿Qué no se entiende?",
    ayuda: "Cita la parte que no se entiende y cuenta cómo la leíste.",
  },
  {
    clave: "no_calza",
    etiqueta: "No calza con un cliente",
    pregunta: "¿Qué pasó?",
    ayuda: "Qué viste en ese cliente que la escala no contempla, o que contradice.",
  },
  {
    clave: "propuesta",
    etiqueta: "Propuesta",
    pregunta: "¿Qué cambiarías?",
    ayuda: "Cómo lo escribirías, o qué agregarías o quitarías.",
  },
];

export function etiquetaDeTipo(tipo: string): string {
  return TIPOS_DE_COMENTARIO.find((t) => t.clave === tipo)?.etiqueta ?? tipo;
}

export type EstadoDeComentario = "abierto" | "respondido" | "cambio_pendiente" | "descartado";

/**
 * Los nombres son los del feedback, donde se decide: «Sin revisar», «Respondido», «En la hoja de
 * ruta» (la fila de «Cambios pendientes» del manual) y «No se hará».
 */
export const ESTADOS_DE_COMENTARIO: readonly { clave: EstadoDeComentario; etiqueta: string }[] = [
  { clave: "abierto", etiqueta: "Sin revisar" },
  { clave: "respondido", etiqueta: "Respondido" },
  { clave: "cambio_pendiente", etiqueta: "En la hoja de ruta" },
  { clave: "descartado", etiqueta: "No se hará" },
];

export function etiquetaDeEstado(estado: string): string {
  return ESTADOS_DE_COMENTARIO.find((e) => e.clave === estado)?.etiqueta ?? estado;
}

// ── Lo que viaja a la pantalla ────────────────────────────────────────────────

export interface Autor {
  email: string;
  nombre: string;
  foto: string | null;
}

export interface RespuestaVista {
  id: string;
  autor: Autor;
  cuerpo: string;
  /** ISO: viaja por JSON. */
  createdAt: string;
  editadoAt: string | null;
}

export interface ComentarioVisto {
  id: string;
  /** El número del reporte de Feedback, el que se cita: «F-128». */
  numero: number;
  ancla: string;
  tipoDeAncla: TipoDeAncla;
  area: string;
  dimension: string;
  versionEscala: string;
  /** El texto del ancla cuando se comentó. */
  textoAnclado: string;
  tipo: TipoDeComentario;
  cuerpo: string;
  decisionQueCambiaria: string | null;
  cliente: { id: string | null; nombre: string } | null;
  perfil: { cierre: Cierre | null; despues: Despues | null };
  /**
   * Desde qué edición por industria se comentó (null = la escala general). Un mismo identificador
   * se lee con un texto en la general y con otro en una edición: `textoAnclado` es el de ESTA.
   */
  edicion: { slug: string; nombre: string } | null;
  /**
   * Lo que dice HOY su ancla, leída como la leyó quien comentó (con su edición); null = ahí ya no
   * existe. Lo calcula el servidor contra la versión publicada: la pantalla solo lo compara.
   */
  textoDeHoy: string | null;
  /** «Ventas · Carrito y recompra · Funcional», con los nombres de su edición; null si ya no existe. */
  ruta: string | null;
  autor: Autor;
  estado: EstadoDeComentario;
  estadoCambiado: { at: string; por: Autor | null } | null;
  /** La fila de «Cambios pendientes» (solo si está en la hoja de ruta). */
  cambio: { que: string; caso: string; decision: string } | null;
  /** El tema de la hoja de ruta donde está (solo si está en la hoja de ruta). */
  tema: { titulo: string; columna: string } | null;
  /** El motivo de «No se hará». */
  motivoDescarte: string | null;
  createdAt: string;
  editadoAt: string | null;
  respuestas: RespuestaVista[];
}

/** Cuántos comentarios tiene cada ancla (o cada área): todos y los abiertos. */
export type Conteo = { total: number; abiertos: number };
export type ConteosPorClave = Record<string, Conteo>;

// ── Permisos ──────────────────────────────────────────────────────────────────

const mismo = (a: string, b: string) => normal(a) === normal(b);

/** Lo que hace falta saber de un comentario para decidir: sirve igual con la fila de la base. */
export interface Autoria {
  autorEmail: string;
  estado: string;
  respuestas: number;
}

export function autoriaDe(c: ComentarioVisto): Autoria {
  return { autorEmail: c.autor.email, estado: c.estado, respuestas: c.respuestas.length };
}

/** El autor, mientras siga sin revisar y nadie haya respondido. */
export function puedeEditarComentario(c: Autoria, miEmail: string): boolean {
  return mismo(c.autorEmail, miEmail) && c.estado === "abierto" && c.respuestas === 0;
}

/** Lo mismo que editar, más quien revisa el feedback (para sacar lo que no corresponde). */
export function puedeBorrarComentario(c: Autoria, miEmail: string, esRevisor: boolean): boolean {
  return puedeEditarComentario(c, miEmail) || esRevisor;
}

// ── La fila del manual ────────────────────────────────────────────────────────

/**
 * Lo que se propone para la fila de «Cambios pendientes» al pasar un comentario: el responsable la
 * revisa y la completa (sobre todo «qué decisión cambiaría», que es obligatoria).
 */
export function filaSugerida(
  c: Pick<ComentarioVisto, "ancla" | "tipo" | "cuerpo" | "cliente" | "decisionQueCambiaria" | "cambio"> & Partial<Pick<ComentarioVisto, "edicion">>,
): {
  que: string;
  caso: string;
  decision: string;
} {
  if (c.cambio) return c.cambio;
  // Si se comentó desde una edición, el cambio es de esa edición: se dice junto al identificador
  // (las columnas del manual son fijas, así que va dentro de «Qué cambiaría»).
  const donde = c.edicion ? `\`${c.ancla}\` (edición ${c.edicion.nombre})` : `\`${c.ancla}\``;
  return {
    que: c.tipo === "propuesta" ? `${donde} — ${c.cuerpo}` : `${donde} — `,
    caso: c.tipo === "no_calza" && c.cliente ? `${c.cliente.nombre}: ${c.cuerpo}` : "",
    decision: c.decisionQueCambiaria ?? "",
  };
}
