/**
 * lib/documentacion/comentarios.ts — las reglas de los comentarios de Documentación. PURO.
 *
 * Client-safe (sin Prisma ni zod): lo importan las rutas, las consultas y los componentes. Es el
 * único lugar que decide quién resuelve, quién edita y quién borra, y cómo se vuelve a encontrar
 * el texto comentado.
 *
 * ── DOS DECISIONES ───────────────────────────────────────────────────────────
 * · Resuelven SOLO `SUPER_ADMIN` y `CSL` (Elías, 2026-09-13). El rol va fijo acá y no en la matriz
 *   de permisos: la matriz se edita desde /team y no garantiza esa regla.
 * · El comentario se ancla FUERA del contenido: id del bloque + texto citado. El editor descarta su
 *   propia marca de comentario al pasar la página a JSON. Si el bloque cambia de id (una siembra, una
 *   versión restaurada), `buscarCita` encuentra el texto; si ya no está, el hilo queda «sin ubicar».
 */

export const ROLES_QUE_RESUELVEN = ["SUPER_ADMIN", "CSL"] as const;

/** Letras de contexto que se guardan antes y después de la cita. */
export const LARGO_DE_CONTEXTO = 30;

/** Quién escribió algo, listo para mostrar. */
export interface Autor {
  email: string;
  nombre: string;
  foto: string | null;
}

export interface ComentarioVisto {
  id: string;
  autor: Autor;
  cuerpo: string;
  /** ISO: viaja por JSON. */
  createdAt: string;
  editadoAt: string | null;
}

export interface HiloVisto {
  id: string;
  paginaId: string;
  bloqueId: string;
  /** El texto marcado. Vacío = el bloque entero. */
  cita: string;
  antes: string;
  despues: string;
  autor: Autor;
  resueltoAt: string | null;
  resueltoPor: Autor | null;
  createdAt: string;
  comentarios: ComentarioVisto[];
}

/** Un hilo abierto en la lista de TODA la base, con la página donde está. */
export interface HiloAbiertoDeLaBase {
  hilo: HiloVisto;
  pagina: { slug: string; titulo: string; icono: string | null };
}

/** ¿Este rol resuelve y reabre hilos? */
export function puedeResolver(rol: string | null | undefined): boolean {
  return (ROLES_QUE_RESUELVEN as readonly string[]).includes(rol ?? "");
}

const mismoEmail = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** Editar un comentario es solo de quien lo escribió. */
export function puedeEditarComentario(miEmail: string, autorEmail: string): boolean {
  return mismoEmail(miEmail, autorEmail);
}

/** Borrar: quien lo escribió, y quien resuelve (para limpiar lo que no corresponde). */
export function puedeBorrarComentario(miEmail: string, rol: string | null | undefined, autorEmail: string): boolean {
  return mismoEmail(miEmail, autorEmail) || puedeResolver(rol);
}

/** Las letras que rodean un pedazo de texto: se guardan con la cita para desempatar. */
export function contextoDe(texto: string, desde: number, hasta: number): { antes: string; despues: string } {
  return {
    antes: texto.slice(Math.max(0, desde - LARGO_DE_CONTEXTO), desde),
    despues: texto.slice(hasta, hasta + LARGO_DE_CONTEXTO),
  };
}

function sufijoComun(a: string, b: string): number {
  let n = 0;
  while (n < a.length && n < b.length && a[a.length - 1 - n] === b[b.length - 1 - n]) n++;
  return n;
}

function prefijoComun(a: string, b: string): number {
  let n = 0;
  while (n < a.length && n < b.length && a[n] === b[n]) n++;
  return n;
}

/**
 * Dónde está la cita dentro de un texto, o -1. Si aparece más de una vez, gana la que tiene
 * alrededor las mismas letras que había cuando se comentó: «el cliente» se repite en cualquier
 * página, y el comentario tiene que volver a SU «el cliente».
 */
export function buscarCita(texto: string, ancla: { cita: string; antes: string; despues: string }): number {
  const { cita, antes, despues } = ancla;
  if (!cita) return -1;
  let mejor = -1;
  let mejorPuntaje = -1;
  for (let i = texto.indexOf(cita); i !== -1; i = texto.indexOf(cita, i + 1)) {
    const previo = texto.slice(Math.max(0, i - antes.length), i);
    const siguiente = texto.slice(i + cita.length, i + cita.length + despues.length);
    const puntaje = sufijoComun(previo, antes) + prefijoComun(siguiente, despues);
    if (puntaje > mejorPuntaje) {
      mejor = i;
      mejorPuntaje = puntaje;
    }
  }
  return mejor;
}

/** «recién», «hace 5 min», «hace 3 h», «ayer», «hace 4 días» y, pasado un mes, la fecha. */
export function haceCuanto(fecha: string | Date, ahora: Date = new Date()): string {
  const d = typeof fecha === "string" ? new Date(fecha) : fecha;
  const segundos = Math.max(0, Math.round((ahora.getTime() - d.getTime()) / 1000));
  if (segundos < 60) return "recién";
  const minutos = Math.floor(segundos / 60);
  if (minutos < 60) return `hace ${minutos} min`;
  const horas = Math.floor(minutos / 60);
  if (horas < 24) return `hace ${horas} h`;
  const dias = Math.floor(horas / 24);
  if (dias === 1) return "ayer";
  if (dias < 30) return `hace ${dias} días`;
  return d.toLocaleDateString("es-CR", { day: "numeric", month: "short", year: "numeric" });
}
