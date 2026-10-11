/**
 * lib/cs/ajustes-de-salud.ts — lo que una persona le hace al color de una cuenta (2026-10-09). PURO.
 *
 * Entrega 2 de docs/exito-del-cliente-cartera-plan.md (decisiones de Elías del 2026-10-07):
 *
 * · CORREGIR: la CSL o un super admin cambia el color que calculó Nexus, con una razón corta. Vale
 *   `DIAS_DE_LA_CORRECCION` días, o menos si Nexus ve una razón roja que no estaba al corregir. Al dejar de
 *   valer, le avisa a quien la puso («Para ti»). El color de Nexus se sigue viendo al lado.
 * · EN ESPERA DEL CLIENTE: la cuenta está frenada por el cliente (no responde, pidió pausa, debe algo). No
 *   cuenta como riesgo. Lo propone Nexus cuando un proyecto activo dice en HubSpot que el freno es del
 *   cliente; lo marca o lo quita la CSL. Si además hay una razón roja que no es ese freno, gana el rojo.
 *
 * Todo vive en `CorreccionDeSalud`, append-only: cada cambio es una fila y el estado es el último evento de
 * cada clase. Así queda el historial de quién corrigió qué y cuándo, sin columnas que se pisan.
 */

/** Cuántos días vale una corrección del color. */
export const DIAS_DE_LA_CORRECCION = 30;

/** Los colores que una persona puede poner. «Sin datos» no: es no saber, no una opinión. */
export const SALUDES_CORREGIBLES = ["en-riesgo", "en-friccion", "saludable"] as const;
export type SaludCorregible = (typeof SALUDES_CORREGIBLES)[number];

export const TIPOS_DE_AJUSTE = ["corregir", "quitar-correccion", "en-espera", "quitar-espera", "descartar-espera"] as const;
export type TipoDeAjuste = (typeof TIPOS_DE_AJUSTE)[number];

/** Una fila de `CorreccionDeSalud`, ya leída. */
export interface EventoDeAjuste {
  id: string;
  tipo: TipoDeAjuste;
  salud: string | null;
  nota: string | null;
  saludDeNexus: string | null;
  razonesDeNexus: string[];
  huella: string | null;
  porEmail: string;
  porNombre: string | null;
  /** ISO. */
  en: string;
}

export interface CorreccionGuardada {
  id: string;
  salud: SaludCorregible;
  nota: string;
  porEmail: string;
  porNombre: string | null;
  /** ISO. */
  en: string;
  /** AAAA-MM-DD: el último día que vale. */
  vence: string;
  /** Lo que decía Nexus al corregir. */
  saludDeNexus: string | null;
  /** Las razones rojas que Nexus ya veía al corregir: una que no esté acá la deja sin efecto. */
  razonesDeNexus: string[];
}

export interface EsperaGuardada {
  id: string;
  nota: string;
  porEmail: string;
  porNombre: string | null;
  /** ISO. */
  en: string;
}

/** Lo que una persona le hizo al color de la cuenta, hoy. */
export interface AjustesDeSalud {
  /** La última corrección que nadie quitó (puede haber vencido: eso lo decide `saludDeLaCuenta`). */
  correccion: CorreccionGuardada | null;
  espera: EsperaGuardada | null;
  /** La huella de la propuesta de «en espera» que se descartó. */
  esperaDescartada: string | null;
}

export const SIN_AJUSTES: AjustesDeSalud = { correccion: null, espera: null, esperaDescartada: null };

const DIA_MS = 86_400_000;

/** AAAA-MM-DD en Costa Rica (UTC-6, sin horario de verano). */
function diaCr(iso: string): string {
  return new Date(new Date(iso).getTime() - 6 * 3_600_000).toISOString().slice(0, 10);
}

/** El último día que vale una corrección hecha en `iso`. */
export function venceLaCorreccion(iso: string): string {
  const dia = diaCr(iso);
  return new Date(Date.parse(`${dia}T00:00:00Z`) + DIAS_DE_LA_CORRECCION * DIA_MS).toISOString().slice(0, 10);
}

function esCorregible(s: string | null): s is SaludCorregible {
  return !!s && (SALUDES_CORREGIBLES as readonly string[]).includes(s);
}

/** El estado de hoy: el último evento de cada clase (los eventos pueden venir en cualquier orden). */
export function ajustesDesdeEventos(eventos: readonly EventoDeAjuste[]): AjustesDeSalud {
  const orden = [...eventos].sort((a, b) => a.en.localeCompare(b.en) || a.id.localeCompare(b.id));
  let correccion: CorreccionGuardada | null = null;
  let espera: EsperaGuardada | null = null;
  let esperaDescartada: string | null = null;
  for (const e of orden) {
    if (e.tipo === "corregir" && esCorregible(e.salud)) {
      correccion = {
        id: e.id,
        salud: e.salud,
        nota: e.nota ?? "",
        porEmail: e.porEmail,
        porNombre: e.porNombre,
        en: e.en,
        vence: venceLaCorreccion(e.en),
        saludDeNexus: e.saludDeNexus,
        razonesDeNexus: e.razonesDeNexus,
      };
    } else if (e.tipo === "quitar-correccion") correccion = null;
    else if (e.tipo === "en-espera") {
      espera = { id: e.id, nota: e.nota ?? "", porEmail: e.porEmail, porNombre: e.porNombre, en: e.en };
      esperaDescartada = null;
    } else if (e.tipo === "quitar-espera") espera = null;
    else if (e.tipo === "descartar-espera") esperaDescartada = e.huella;
  }
  return { correccion, espera, esperaDescartada };
}

// ── «EN ESPERA DEL CLIENTE»: lo que propone Nexus ────────────────────────────────────────────

/**
 * Los motivos de bloqueo de HubSpot que dicen que el freno es del cliente (medido el 2026-10-07: «Atraso por
 * cliente» 15, «Cliente no responde» 4, «Cliente pidió pausa» 1). «Atraso por Smarteam» y «Proveedor» no: ahí
 * el riesgo es nuestro y la cuenta sigue en rojo o en amarillo.
 */
const MOTIVOS_DEL_CLIENTE = [/atraso por (el )?cliente/i, /cliente no responde/i, /cliente pidi[oó] (una )?pausa/i];

export function esMotivoDelCliente(motivo: string | null | undefined): boolean {
  return !!motivo && MOTIVOS_DEL_CLIENTE.some((r) => r.test(motivo));
}

/** Lo mínimo de un proyecto para proponer «en espera». */
export interface ProyectoParaEspera {
  id: string;
  nombre: string;
  activo: boolean;
  motivoBloqueo: string | null;
  detalleBloqueo?: string | null;
}

export interface PropuestaDeEspera {
  nota: string;
  /** Los hechos que la producen: lo descartado no vuelve hasta que cambien. */
  huella: string;
}

/** Nexus propone «en espera del cliente» cuando un proyecto activo dice que el freno es del cliente. */
export function propuestaDeEspera(proyectos: readonly ProyectoParaEspera[]): PropuestaDeEspera | null {
  const frenados = proyectos.filter((p) => p.activo && esMotivoDelCliente(p.motivoBloqueo));
  if (frenados.length === 0) return null;
  const p = frenados[0];
  const detalle = p.detalleBloqueo?.trim() ? `: ${p.detalleBloqueo.trim().replace(/[.\s]+$/, "")}` : "";
  const mas = frenados.length > 1 ? ` (y ${frenados.length - 1} ${frenados.length === 2 ? "proyecto más" : "proyectos más"})` : "";
  return {
    nota: `«${p.nombre}»: ${(p.motivoBloqueo ?? "").trim().toLowerCase()}${detalle}${mas}`,
    huella: frenados
      .map((x) => `${x.id}:${(x.motivoBloqueo ?? "").trim().toLowerCase()}`)
      .sort()
      .join("|"),
  };
}

/** ¿Se muestra la propuesta? Sin «en espera» marcado y sin descartar con la misma huella. */
export function sugerirEspera(propuesta: PropuestaDeEspera | null, a: AjustesDeSalud): boolean {
  return !!propuesta && !a.espera && a.esperaDescartada !== propuesta.huella;
}

// ── LO QUE SE PUEDE GUARDAR ──────────────────────────────────────────────────────────────────

/** Una nota corta: una línea que se lee en la lista. */
export const LARGO_DE_LA_NOTA = 280;
