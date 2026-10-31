/**
 * lib/cs/prioridad-de-cuenta.ts — las cuentas que la CSL marca como prioritarias (más seguimiento). PURO (2026-10-29).
 *
 * Pedido de Elías del 29 oct: «que Alex y los super admins puedan marcar manualmente, desde el listado y adentro, qué
 * cuentas son prioritarias o necesitan más seguimiento. Por ejemplo, las que tienen SmartLoop, las de ticket grande o
 * las que tienen interlocutores difíciles».
 *
 * · La marca la ponen y la quitan quienes tienen `customerSuccess.marcarPrioridad` (la CSL y los super admin), con un
 *   motivo corto y, si quieren, una línea más.
 * · NO cambia el color: el color dice cómo va la cuenta y lo calcula Nexus. La marca ORDENA: dentro del mismo color, la
 *   prioritaria va primero (en «A quién llamar», en las alertas y en la Cartera). Una prioritaria en riesgo va antes que
 *   una no prioritaria en riesgo.
 * · Vive en `PrioridadDeCuenta`, append-only como `CorreccionDeSalud`: cada cambio es una fila y la marca de hoy es el
 *   último evento. Queda quién la puso y cuándo.
 * · «Otro motivo» crea un motivo para todo el equipo (2026-10-30, pedido de Elías: «debe crearlo para que aparezca para
 *   los demás»). Vive en `MotivoDePrioridad`, y la marca lo apunta con `motivoDelEquipoId` guardando `motivo = "otro"`.
 *   Lo escrito que solo cambia en mayúsculas o espacios es el mismo motivo (`claveDelMotivo`), también frente a los fijos.
 *   Las marcas anteriores con «otro» y el motivo en la línea se siguen leyendo igual; al editarlas se elige el motivo.
 */

export const MOTIVOS_DE_PRIORIDAD = ["smartloop", "ticket-grande", "interlocutores-dificiles", "otro"] as const;
export type MotivoDePrioridad = (typeof MOTIVOS_DE_PRIORIDAD)[number];

export const NOMBRE_DEL_MOTIVO: Record<MotivoDePrioridad, string> = {
  smartloop: "SmartLoop",
  "ticket-grande": "Ticket grande",
  "interlocutores-dificiles": "Interlocutores difíciles",
  otro: "Otro motivo",
};

/** El largo de la línea opcional. */
export const LARGO_DE_LA_NOTA_DE_PRIORIDAD = 140;

/** El largo del nombre de un motivo nuevo: va en un menú y en una columna angosta. */
export const LARGO_DEL_MOTIVO = 60;

/** Un motivo creado por el equipo con «Otro motivo»: desde que alguien lo escribe, lo ven todos. */
export interface MotivoDelEquipo {
  id: string;
  nombre: string;
}

/** Sin espacios de más: así se guarda el nombre. */
export function limpiarNombreDelMotivo(nombre: string): string {
  return nombre.trim().replace(/\s+/g, " ");
}

/** Lo que hace que dos motivos sean el mismo: solo cambian en mayúsculas o espacios. */
export function claveDelMotivo(nombre: string): string {
  return limpiarNombreDelMotivo(nombre).toLowerCase();
}

/** El motivo fijo que se llama así, si hay: escribir «smartloop» en «Otro motivo» no crea un segundo SmartLoop. */
export function motivoFijoLlamado(nombre: string): MotivoDePrioridad | null {
  const clave = claveDelMotivo(nombre);
  return MOTIVOS_DE_PRIORIDAD.find((m) => claveDelMotivo(NOMBRE_DEL_MOTIVO[m]) === clave) ?? null;
}

/** Lo escrito en «Otro motivo» sirve: la misma regla en la ventana y en la frontera. */
export function motivoEscritoValido(nombre: string | null | undefined): boolean {
  return limpiarNombreDelMotivo(nombre ?? "").length >= 3 && motivoFijoLlamado(nombre ?? "") !== "otro";
}

export const TIPOS_DE_PRIORIDAD = ["marcar", "quitar"] as const;
export type TipoDePrioridad = (typeof TIPOS_DE_PRIORIDAD)[number];

/** Una fila de `PrioridadDeCuenta`, ya leída. */
export interface EventoDePrioridad {
  id: string;
  tipo: TipoDePrioridad;
  motivo: string | null;
  motivoDelEquipo?: MotivoDelEquipo | null;
  nota: string | null;
  porEmail: string;
  porNombre: string | null;
  /** ISO. */
  en: string;
}

export interface PrioridadGuardada {
  motivo: MotivoDePrioridad;
  motivoDelEquipo?: MotivoDelEquipo | null;
  nota: string | null;
  porEmail: string;
  porNombre: string | null;
  /** ISO. */
  en: string;
}

export function esMotivoDePrioridad(m: string | null | undefined): m is MotivoDePrioridad {
  return !!m && (MOTIVOS_DE_PRIORIDAD as readonly string[]).includes(m);
}

/** La marca de hoy: el último evento (pueden venir en cualquier orden). null = no es prioritaria. */
export function prioridadDesdeEventos(eventos: readonly EventoDePrioridad[]): PrioridadGuardada | null {
  const orden = [...eventos].sort((a, b) => a.en.localeCompare(b.en) || a.id.localeCompare(b.id));
  let hoy: PrioridadGuardada | null = null;
  for (const e of orden) {
    if (e.tipo === "quitar") hoy = null;
    else if (e.tipo === "marcar" && esMotivoDePrioridad(e.motivo)) {
      hoy = { motivo: e.motivo, motivoDelEquipo: e.motivoDelEquipo ?? null, nota: e.nota?.trim() || null, porEmail: e.porEmail, porNombre: e.porNombre, en: e.en };
    }
  }
  return hoy;
}

/** Cómo se dice el motivo: «SmartLoop», «Ticket grande · renueva 3 hubs», «Cambio de sponsor». */
export function motivoEnPalabras(p: Pick<PrioridadGuardada, "motivo" | "nota" | "motivoDelEquipo">): string {
  if (p.motivoDelEquipo) return p.nota ? `${p.motivoDelEquipo.nombre} · ${p.nota}` : p.motivoDelEquipo.nombre;
  if (p.motivo === "otro") return p.nota ? p.nota : NOMBRE_DEL_MOTIVO.otro;
  return p.nota ? `${NOMBRE_DEL_MOTIVO[p.motivo]} · ${p.nota}` : NOMBRE_DEL_MOTIVO[p.motivo];
}

/** Quién la marcó, en palabras: el nombre, o el correo si no hay nombre. */
export function quienLaMarco(p: Pick<PrioridadGuardada, "porNombre" | "porEmail">): string {
  return p.porNombre?.trim() || p.porEmail;
}

/** Para ordenar: la prioritaria primero (0), las demás después (1). */
export function rangoDePrioridad(c: { prioritaria?: unknown }): number {
  return c.prioritaria ? 0 : 1;
}

/** Lo que muestra una fila de la cartera: el motivo en palabras y quién la marcó. */
export interface PrioridadVisible {
  motivo: MotivoDePrioridad;
  motivoDelEquipo: MotivoDelEquipo | null;
  nota: string | null;
  enPalabras: string;
  quien: string;
}

export function prioridadVisible(p: PrioridadGuardada | null | undefined): PrioridadVisible | null {
  return p ? { motivo: p.motivo, motivoDelEquipo: p.motivoDelEquipo ?? null, nota: p.nota, enPalabras: motivoEnPalabras(p), quien: quienLaMarco(p) } : null;
}

/** Las marcas del servidor con lo que se guardó en esta pantalla encima (null = se quitó). */
export function marcasConLoGuardado(
  delServidor: Readonly<Record<string, PrioridadVisible>>,
  guardadas: Readonly<Record<string, PrioridadVisible | null>>,
): Record<string, PrioridadVisible> {
  const marcas = { ...delServidor };
  for (const [clientId, p] of Object.entries(guardadas)) {
    if (p) marcas[clientId] = p;
    else delete marcas[clientId];
  }
  return marcas;
}

/** Los motivos del equipo con los que se usaron en esta pantalla: Seguimiento no recarga y el menú ya tiene que traerlos. */
export function motivosConLosUsados(delServidor: readonly MotivoDelEquipo[], usados: readonly MotivoDelEquipo[]): MotivoDelEquipo[] {
  const porId = new Map([...delServidor, ...usados].map((m) => [m.id, m]));
  return [...porId.values()].sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
}

const DEL_EQUIPO = "equipo:";

/** La opción de la lista de la ventana para un motivo del equipo. */
export function opcionDelEquipo(m: MotivoDelEquipo): string {
  return `${DEL_EQUIPO}${m.id}`;
}

/**
 * Qué opción de la ventana corresponde a la marca de hoy. Una marca anterior con «otro» cae en «Otro motivo» con el nombre
 * vacío: su línea no pasa sola a ser un motivo de todo el equipo.
 */
export function opcionDeLaMarca(p: PrioridadVisible | null): string {
  if (!p) return "smartloop";
  return p.motivoDelEquipo ? opcionDelEquipo(p.motivoDelEquipo) : p.motivo;
}

/** Lo que manda la ventana según la opción elegida: un motivo fijo, uno del equipo o uno nuevo. */
export function marcaDeLaVentana(opcion: string, motivoNuevo: string, nota: string) {
  const linea = nota.trim() || null;
  const base = { accion: "marcar" as const, nota: linea };
  if (opcion.startsWith(DEL_EQUIPO)) return { ...base, motivo: "otro" as const, motivoDelEquipoId: opcion.slice(DEL_EQUIPO.length) };
  if (esMotivoDePrioridad(opcion) && opcion !== "otro") return { ...base, motivo: opcion };
  return { ...base, motivo: "otro" as const, motivoNuevo };
}

/** Las marcas de todas las cuentas, por id: lo que recibe la columna «Prioritaria» de los listados. */
export function prioridadesVisibles(porCliente: ReadonlyMap<string, PrioridadGuardada>): Record<string, PrioridadVisible> {
  const marcas: Record<string, PrioridadVisible> = {};
  for (const [clientId, p] of porCliente) {
    const visible = prioridadVisible(p);
    if (visible) marcas[clientId] = visible;
  }
  return marcas;
}
