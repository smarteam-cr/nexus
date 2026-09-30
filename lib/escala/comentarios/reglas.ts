/**
 * lib/escala/comentarios/reglas.ts — las reglas de los comentarios de la escala. PURO.
 *
 * Client-safe (sin Prisma ni zod): lo importan las rutas, las consultas y los componentes. Es el
 * único lugar que decide quién cambia el estado, quién edita y quién borra.
 *
 * ── LAS DECISIONES (Elías, 2026-09-27) ───────────────────────────────────────
 * · Comentan y leen todos los comentarios TODOS los del equipo interno.
 * · El ESTADO lo cambia solo el responsable de la escala («hoy Elías González», dice el manual de
 *   operación). Va fijo por CORREO y no por rol ni por la matriz de /team: SUPER_ADMIN también lo
 *   son otras personas, y la matriz es delegable. Sumar a alguien es una línea de acá.
 * · Cuando el responsable responde un comentario abierto, pasa a «respondido».
 * · El autor edita o borra lo suyo mientras siga abierto y sin respuestas. Después es evidencia:
 *   solo cambia de estado.
 * · Tipos y estados son texto en la base (no enum, INV4): los valores válidos son estos.
 */
import type { Cierre, Despues } from "@/lib/escala/documento/perfil";
import type { TipoDeAncla } from "@/lib/escala/documento/anclas";

/** Quién decide cómo evoluciona la escala. */
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

export const ESTADOS_DE_COMENTARIO: readonly { clave: EstadoDeComentario; etiqueta: string }[] = [
  { clave: "abierto", etiqueta: "Abierto" },
  { clave: "respondido", etiqueta: "Respondido" },
  { clave: "cambio_pendiente", etiqueta: "Cambio pendiente" },
  { clave: "descartado", etiqueta: "Descartado" },
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
  /** La fila de «Cambios pendientes» (solo si pasó a cambio pendiente). */
  cambio: { que: string; caso: string; decision: string } | null;
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

/** El autor, mientras esté abierto y nadie haya respondido. */
export function puedeEditarComentario(c: Autoria, miEmail: string): boolean {
  return mismo(c.autorEmail, miEmail) && c.estado === "abierto" && c.respuestas === 0;
}

/** Lo mismo que editar, más el responsable (para sacar lo que no corresponde). */
export function puedeBorrarComentario(c: Autoria, miEmail: string): boolean {
  return puedeEditarComentario(c, miEmail) || esResponsable(miEmail);
}

export function puedeEditarRespuesta(autorEmail: string, miEmail: string): boolean {
  return mismo(autorEmail, miEmail);
}

export function puedeBorrarRespuesta(autorEmail: string, miEmail: string): boolean {
  return mismo(autorEmail, miEmail) || esResponsable(miEmail);
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
