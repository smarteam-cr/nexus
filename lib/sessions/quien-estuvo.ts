/**
 * lib/sessions/quien-estuvo.ts — «QUIÉN ESTUVO», arriba de cada sesión (2026-11-27). PURO y client-safe.
 *
 * Elías, con la de Líneas Hospitalarias: ver muy arriba de la sesión quiénes participaron, en un desplegable. La única
 * reunión que Nexus le ofrecía era un sync de Smarteam con HubSpot sin nadie del cliente, y nada lo decía. Una línea
 * plegable («Estuvieron 2 de 3 · nadie del cliente») y, al abrirla, cada persona con su lado (Smarteam, el cliente u
 * otro, con su dominio), su respuesta a la invitación y, si fue por Meet, si entró y cuántos minutos.
 *
 * De dónde sale cada cosa: los invitados y su respuesta, de `ParticipanteDeReunion` (la sync del calendario, U1); la
 * entrada y los minutos, de la API de Meet (U3, lib/google/conferencias.ts), que también deja filas `meet:users/…` de
 * quien entró sin correo, con su nombre. Una reunión por Zoom o Teams solo tiene invitados: se dice así, sin inventar la
 * asistencia. Una reunión agregada a mano (sin filas) usa sus participantes.
 *
 * ⚠ Google pide no usar la asistencia de Meet para medir desempeño: esto dice quién estuvo en ESA reunión, para leerla.
 * Ningún número de acá va a una evaluación.
 */
import { PREFIJO_SIN_CORREO } from "@/lib/google/conferencias-reglas";
import type { Plataforma } from "@/lib/google/plataforma-del-evento";
import { avisoDePlataforma } from "@/lib/google/plataforma-del-evento";

export type LadoDeLaPersona = "smarteam" | "cliente" | "otro";
export type RespuestaALaInvitacion = "ACEPTO" | "TENTATIVA" | "RECHAZO" | "SIN_RESPONDER";

/** Una fila de `ParticipanteDeReunion`, con lo que hace falta. */
export interface FilaDeQuienEstuvo {
  correo: string;
  esDelEquipo: boolean;
  respuesta: RespuestaALaInvitacion | null;
  entro: Date | null;
  minutos: number | null;
  nombre: string | null;
}

export interface PersonaDeLaReunion {
  /** null = entró a Meet sin correo (una fila `meet:users/…`). */
  correo: string | null;
  nombre: string | null;
  cargo: string | null;
  lado: LadoDeLaPersona;
  /** El dominio, para decir de dónde es alguien del lado «otro» (hubspot.com). */
  dominio: string | null;
  respuesta: RespuestaALaInvitacion | null;
  /** true = entró; false = Meet dice que la reunión ocurrió y no entró; null = no se sabe (o no fue por Meet). */
  entro: boolean | null;
  minutos: number | null;
  organizo: boolean;
}

export interface QuienEstuvo {
  personas: PersonaDeLaReunion[];
  /** La línea plegada: «Estuvieron 2 de 3 · nadie del cliente». */
  resumen: string;
  /** ¿Hay asistencia de verdad (Meet dijo quién entró)? Sin ella, solo invitados. */
  conAsistencia: boolean;
  /** Nadie del lado del cliente: ni invitado (sin asistencia) ni entró (con asistencia). */
  nadieDelCliente: boolean;
  /** «Fue por Zoom: solo sabemos a quién se invitó». null = de Meet. */
  nota: string | null;
}

export interface EntradaDeQuienEstuvo {
  filas: readonly FilaDeQuienEstuvo[];
  /** Los participantes de la sesión: los de una agregada a mano, o los de una sin filas todavía. */
  participantes: readonly string[];
  organizador: string | null;
  /** null = de Meet. */
  plataforma: Plataforma | null;
  /** `FirefliesSession.estadoDeConferencia`: OCURRIO / NO_OCURRIO = Meet dijo quién entró. */
  estadoDeConferencia: "OCURRIO" | "NO_OCURRIO" | "SIN_ACCESO" | null;
  /** Nombre por correo, del equipo. */
  equipo: ReadonlyMap<string, string>;
  /** Nombre y cargo por correo, de los contactos de HubSpot del DUEÑO de la reunión (nunca de otro cliente). */
  contactos: ReadonlyMap<string, { nombre: string; cargo: string | null }>;
  /** Los dominios del equipo (en minúsculas). */
  dominiosDelEquipo: ReadonlySet<string>;
  /** Los dominios del dueño de la reunión (`Client.emailDomains`, en minúsculas). Vacío sin dueño. */
  dominiosDelCliente: ReadonlySet<string>;
}

function dominioDe(correo: string): string | null {
  const i = correo.lastIndexOf("@");
  return i > 0 ? correo.slice(i + 1).toLowerCase() : null;
}

/** El orden de la lista: quien organizó, después el cliente, Smarteam y los demás; dentro, quien entró primero. */
const ORDEN_DEL_LADO: Record<LadoDeLaPersona, number> = { cliente: 0, smarteam: 1, otro: 2 };

/** PURA. Quién estuvo en UNA reunión. */
export function armarQuienEstuvo(e: EntradaDeQuienEstuvo): QuienEstuvo {
  const deMeet = !e.plataforma || e.plataforma === "MEET";
  const conAsistencia = deMeet && (e.estadoDeConferencia === "OCURRIO" || e.estadoDeConferencia === "NO_OCURRIO");
  const organizador = e.organizador?.trim().toLowerCase() || null;

  const ladoDe = (correo: string, esDelEquipo: boolean): LadoDeLaPersona => {
    const d = dominioDe(correo);
    if (esDelEquipo || e.equipo.has(correo) || (d && e.dominiosDelEquipo.has(d))) return "smarteam";
    if (e.contactos.has(correo) || (d && e.dominiosDelCliente.has(d))) return "cliente";
    return "otro";
  };

  const porCorreo = new Map<string, PersonaDeLaReunion>();
  const sinCorreo: PersonaDeLaReunion[] = [];
  for (const f of e.filas) {
    if (f.correo.startsWith(PREFIJO_SIN_CORREO)) {
      sinCorreo.push({ correo: null, nombre: f.nombre, cargo: null, lado: "otro", dominio: null, respuesta: null, entro: f.entro ? true : null, minutos: f.minutos, organizo: false });
      continue;
    }
    const correo = f.correo.trim().toLowerCase();
    const contacto = e.contactos.get(correo);
    porCorreo.set(correo, {
      correo,
      nombre: e.equipo.get(correo) ?? contacto?.nombre ?? f.nombre,
      cargo: contacto?.cargo ?? null,
      lado: ladoDe(correo, f.esDelEquipo),
      dominio: dominioDe(correo),
      respuesta: f.respuesta,
      entro: !conAsistencia ? null : f.entro ? true : false,
      minutos: conAsistencia ? f.minutos : null,
      organizo: correo === organizador,
    });
  }
  // Sin filas (agregada a mano, o la sync todavía no las escribió): los participantes de la sesión, sin respuesta.
  for (const crudo of [...e.participantes, ...(organizador ? [organizador] : [])]) {
    const correo = crudo.trim().toLowerCase();
    if (!correo || porCorreo.has(correo)) continue;
    const contacto = e.contactos.get(correo);
    porCorreo.set(correo, {
      correo,
      nombre: e.equipo.get(correo) ?? contacto?.nombre ?? (correo.includes("@") ? null : crudo.trim()),
      cargo: contacto?.cargo ?? null,
      lado: correo.includes("@") ? ladoDe(correo, false) : "otro",
      dominio: dominioDe(correo),
      respuesta: null,
      entro: conAsistencia ? false : null,
      minutos: null,
      organizo: correo === organizador,
    });
  }

  const personas = [...porCorreo.values(), ...sinCorreo].sort(
    (a, b) =>
      Number(b.organizo) - Number(a.organizo) ||
      ORDEN_DEL_LADO[a.lado] - ORDEN_DEL_LADO[b.lado] ||
      Number(b.entro === true) - Number(a.entro === true) ||
      (a.nombre ?? a.correo ?? "").localeCompare(b.nombre ?? b.correo ?? ""),
  );

  const invitados = [...porCorreo.values()];
  const delCliente = (p: PersonaDeLaReunion) => p.lado === "cliente";
  // Sin dominios del dueño ni contactos (una reunión sin dueño, o una ficha sin dominios), no hay con qué reconocer a
  // alguien del cliente: no se afirma «nadie del cliente» (la misma regla que el buscador, `sinNadieDelCliente`).
  const sePuedeSaber = e.dominiosDelCliente.size > 0 || e.contactos.size > 0;
  const delClienteEn = (lista: readonly PersonaDeLaReunion[]) => {
    const n = lista.filter(delCliente).length;
    return n > 0 ? ` · ${n} del cliente` : sePuedeSaber ? " · nadie del cliente" : "";
  };
  let resumen: string;
  let nadieDelCliente: boolean;
  if (conAsistencia) {
    const entraron = personas.filter((p) => p.entro === true);
    nadieDelCliente = sePuedeSaber && !entraron.some(delCliente);
    const deCuantos = Math.max(invitados.length, entraron.length);
    resumen =
      entraron.length === 0
        ? `No entró nadie de ${deCuantos} ${deCuantos === 1 ? "invitado" : "invitados"}`
        : `${entraron.length === 1 ? "Estuvo" : "Estuvieron"} ${entraron.length} de ${deCuantos}`;
    resumen += delClienteEn(entraron);
  } else {
    nadieDelCliente = sePuedeSaber && !invitados.some(delCliente);
    const n = invitados.length;
    resumen = `${n} ${n === 1 ? "invitado" : "invitados"}` + delClienteEn(invitados);
  }

  const aviso = avisoDePlataforma(e.plataforma);
  const nota = aviso
    ? `${aviso}: solo sabemos a quién se invitó, no quién entró.`
    : conAsistencia
      ? null
      : e.estadoDeConferencia === "SIN_ACCESO"
        ? "La organizó alguien de afuera y nadie del equipo entró: Meet no dice quién estuvo."
        : "Meet todavía no dice quién entró: por ahora, los invitados.";
  return { personas, resumen, conAsistencia, nadieDelCliente, nota };
}

/**
 * PURA. La lista de «Participantes» de la página con el lado de cada uno tomado de «Quién estuvo»: una sola regla de
 * quién es del cliente en la misma página. Quien no está en «Quién estuvo» queda como venía.
 */
export function conElLadoDe<T extends { email: string; lado: LadoDeLaPersona }>(lista: readonly T[], q: QuienEstuvo): T[] {
  const ladoDe = new Map(q.personas.filter((p) => p.correo).map((p) => [p.correo as string, p.lado]));
  return lista.map((i) => {
    const lado = ladoDe.get(i.email.trim().toLowerCase());
    return lado ? { ...i, lado } : i;
  });
}

/** «Aceptó», «Quizás», «No va», «Sin responder». null = el calendario no lo dijo. */
export function textoDeLaRespuesta(r: RespuestaALaInvitacion | null): string | null {
  switch (r) {
    case "ACEPTO":
      return "Aceptó";
    case "TENTATIVA":
      return "Quizás";
    case "RECHAZO":
      return "No va";
    case "SIN_RESPONDER":
      return "Sin responder";
    default:
      return null;
  }
}

/**
 * PURA. ¿No hay nadie del cliente entre los participantes? Para el buscador, sin leer las filas de invitados: alguien es
 * del cliente si su dominio es uno de los del dueño. Con `dominiosDelCliente` vacío (sin dueño, o una ficha sin
 * dominios) no se afirma nada: devuelve false.
 */
export function sinNadieDelCliente(participantes: readonly string[], dominiosDelCliente: ReadonlySet<string>): boolean {
  if (dominiosDelCliente.size === 0) return false;
  return !participantes.some((p) => {
    const d = dominioDe(p.trim().toLowerCase());
    return d !== null && dominiosDelCliente.has(d);
  });
}
