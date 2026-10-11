/**
 * lib/tareas/visibilidad.ts — QUÉ tareas y proyectos ve cada persona. Una sola regla por fila (docs/tareas-plan.md §3).
 *
 * Ves:
 *   - lo tuyo: eres responsable, la creaste, la pediste;
 *   - lo de tu sprint (`equipo` ∈ tus equipos), incluido «Por asignar», MENOS las privadas de otros y las de proyectos
 *     de espacios libres «solo miembros» donde no estás (esas cuentan como horas, sin título: filas opacas);
 *   - lo de los proyectos de los espacios que ves: el de tu equipo, los libres donde eres miembro y los libres que ve
 *     todo Smarteam.
 * El Super Admin ve todo. Pero el contexto del chat y «Para ti» se recortan igual a lo suyo: si no, le llegaría toda
 * la casa (eso lo decide quien llama, con `soloLoMio`).
 *
 * El CLIENTE de una fila que ves no se enmascara (decisión 16): al lado de un título que lo nombra, no protegería
 * nada. Lo que sí se protege es lo que no es la fila: lo hace `serializar.ts`.
 */
import type { Prisma } from "@prisma/client";
import type { Quien } from "./estados";

export interface QuienVe extends Quien {
  /** El sprint de casa de quien mira. */
  equipo: string;
}

/** Los espacios que ve una persona: el de su equipo, los libres donde es miembro y los libres abiertos a todos. */
export function espaciosVisiblesWhere(q: QuienVe): Prisma.EspacioDeTareasWhereInput {
  if (q.esSuperAdmin) return { archivadoAt: null };
  const yo = q.email.toLowerCase();
  const equipos = [...new Set([q.equipo, ...q.lidera])];
  return {
    archivadoAt: null,
    OR: [
      { tipo: "equipo", equipo: { in: equipos } },
      { tipo: "libre", visibilidad: "todos" },
      { tipo: "libre", miembros: { some: { email: yo } } },
    ],
  };
}

/** Los proyectos que ve: los de los espacios que ve, y aquellos de los que es responsable o que creó. */
export function proyectosVisiblesWhere(q: QuienVe): Prisma.ProyectoDeTareasWhereInput {
  if (q.esSuperAdmin) return {};
  const yo = q.email.toLowerCase();
  return {
    OR: [{ espacio: espaciosVisiblesWhere(q) }, { responsableEmail: yo }, { creadoPorEmail: yo }],
  };
}

/**
 * ¿Administra el proyecto? Dirección, su responsable, quien lo creó, el líder del equipo dueño del espacio, o un admin
 * del espacio libre. La misma regla para la pantalla (`puedeAdministrar`) y para el servidor.
 */
export function administraElProyecto(
  q: Pick<QuienVe, "email" | "esSuperAdmin" | "lidera">,
  p: { responsableEmail: string | null; creadoPorEmail: string | null; espacio: { tipo: string; equipo: string | null; miembros: readonly { email: string; rol: string }[] } },
): boolean {
  if (q.esSuperAdmin) return true;
  const yo = q.email.toLowerCase();
  if (p.responsableEmail === yo || p.creadoPorEmail === yo) return true;
  if (p.espacio.tipo === "equipo") return !!p.espacio.equipo && q.lidera.includes(p.espacio.equipo);
  return p.espacio.miembros.some((m) => m.email === yo && m.rol === "admin");
}

/**
 * Un proyecto de un espacio LIBRE de «solo miembros» donde la persona no está. Sus tareas en el sprint son opacas.
 */
function deEspacioPrivadoAjeno(yo: string): Prisma.TareaWhereInput {
  return {
    proyecto: {
      espacio: { tipo: "libre", visibilidad: "miembros", miembros: { none: { email: yo } } },
    },
  };
}

/** Las tareas que ve con título. */
export function tareasVisiblesWhere(q: QuienVe): Prisma.TareaWhereInput {
  if (q.esSuperAdmin) return { archivadaAt: null };
  const yo = q.email.toLowerCase();
  const equipos = [...new Set([q.equipo, ...q.lidera])];
  return {
    archivadaAt: null,
    OR: [
      { responsableEmail: yo },
      { creadaPorEmail: yo },
      { pedidaPorEmail: yo },
      {
        equipo: { in: equipos },
        privada: false,
        NOT: deEspacioPrivadoAjeno(yo),
      },
      { privada: false, proyecto: { espacio: espaciosVisiblesWhere(q) } },
    ],
  };
}

/**
 * Las filas OPACAS de un sprint: cuentan como horas en la Semana del equipo, sin título, cliente ni proyecto.
 * Son las privadas de otros y las de espacios privados donde no estás.
 */
export function tareasOpacasDelSprintWhere(q: QuienVe, equipo: string): Prisma.TareaWhereInput {
  if (q.esSuperAdmin) return { id: "__ninguna__" };
  const yo = q.email.toLowerCase();
  return {
    archivadaAt: null,
    equipo,
    responsableEmail: { not: yo },
    OR: [{ privada: true }, deEspacioPrivadoAjeno(yo)],
  };
}

/** Lo que es «tuyo» (para «Para ti», el chat y el aviso): nunca toda la casa, aunque seas Super Admin. */
export function tareasMiasWhere(email: string): Prisma.TareaWhereInput {
  const yo = email.toLowerCase();
  return { archivadaAt: null, OR: [{ responsableEmail: yo }, { pedidaPorEmail: yo }, { creadaPorEmail: yo }] };
}

/** ¿Ve esta fila? (para un pedido de una tarea suelta: el mismo criterio, evaluado en memoria). */
export function veLaTarea(
  t: {
    responsableEmail: string | null;
    creadaPorEmail: string | null;
    pedidaPorEmail: string | null;
    equipo: string | null;
    privada: boolean;
    archivadaAt: Date | null;
    espacio?: { tipo: string; visibilidad: string; equipo: string | null; miembros: readonly string[] } | null;
  },
  q: QuienVe,
): boolean {
  if (t.archivadaAt) return false;
  if (q.esSuperAdmin) return true;
  const yo = q.email.toLowerCase();
  if ([t.responsableEmail, t.creadaPorEmail, t.pedidaPorEmail].some((e) => e?.toLowerCase() === yo)) return true;
  if (t.privada) return false;
  const equipos = new Set([q.equipo, ...q.lidera]);
  const espacioPrivadoAjeno = !!t.espacio && t.espacio.tipo === "libre" && t.espacio.visibilidad === "miembros" && !t.espacio.miembros.includes(yo);
  if (t.equipo && equipos.has(t.equipo) && !espacioPrivadoAjeno) return true;
  if (t.espacio) {
    if (t.espacio.tipo === "equipo" && t.espacio.equipo && equipos.has(t.espacio.equipo)) return true;
    if (t.espacio.tipo === "libre" && (t.espacio.visibilidad === "todos" || t.espacio.miembros.includes(yo))) return true;
  }
  return false;
}
