/**
 * lib/clients/kind.ts — QUÉ ES una empresa. CLIENT-SAFE (sin Prisma).
 *
 * Fuente ÚNICA de la pregunta "¿esta empresa cuenta como cliente de CS?". Antes esa
 * pregunta se respondía con `isProspect: false` escrito a mano en ~15 queries: cada
 * listado nuevo tenía que acordarse de repetirlo, y no había forma de agregar una
 * categoría más (aliado, interno) sin tocar los 15. Ahora el filtro se importa.
 *
 * Regla: **ninguna query nueva escribe `kind` a mano** — usa `CS_CLIENT_WHERE`. Si mañana
 * aparece una categoría más (ej. EX_CLIENTE), se decide acá una vez y todos los listados
 * la heredan.
 */
import type { ClientKind } from "@prisma/client";

export const CLIENT_KINDS = ["CLIENTE", "PROSPECTO", "ALIADO", "INTERNO"] as const;

/**
 * Label + ayuda para la UI (selector de la ficha y pestañas del listado).
 *
 * ⚠ `contable` no es redundante con `label`/`plural`: esos son el ROTULO del control, y
 * «Somos Smarteam» no se puede contar («0 de 0 somos smarteam»). Derivar el singular
 * quitándole la "s" al plural funciona con tres de los cuatro y falla justo con el que esta
 * tanda vino a arreglar — o sea, el generador de mentiras silenciosas de siempre. Se escribe.
 */
export const CLIENT_KIND_META: Record<
  ClientKind,
  { label: string; plural: string; help: string; contable: { uno: string; varios: string } }
> = {
  CLIENTE: {
    label: "Cliente",
    plural: "Clientes",
    contable: { uno: "cliente", varios: "clientes" },
    help: "Nos compró o nos está comprando. Es la cartera: entra a los listados, al portafolio y a cobranza.",
  },
  PROSPECTO: {
    label: "Prospecto",
    plural: "Prospectos",
    contable: { uno: "prospecto", varios: "prospectos" },
    help: "Ventas la creó para una propuesta comercial. Todavía no compró.",
  },
  ALIADO: {
    label: "Aliado",
    plural: "Aliados",
    contable: { uno: "aliado", varios: "aliados" },
    help: "Aliado comercial o partner con el que trabajamos (ej. una agencia con la que se co-vende). No es cartera.",
  },
  /**
   * ⚠ Se llamaba «Interno / Internos», y ése era el nombre equivocado. A 40px de la barra de
   * filtros vive «Con trabajo interno», que es OTRA cosa: esto es una propiedad de la EMPRESA
   * (la empresa somos nosotros) y aquello una propiedad de sus PROYECTOS (trabajo que hacemos
   * de puertas adentro, para un cliente real). Con la misma raíz y contadores distintos —0 y
   * 2— los dos controles se leían como un contador roto, y la lectura natural («Internos son
   * los clientes con proyectos internos») era justo la incorrecta. Lo confirmó el usuario
   * leyéndolo así. El nombre nuevo no se parece a nada del otro eje: ésa es toda su gracia.
   */
  INTERNO: {
    label: "Somos Smarteam",
    plural: "Somos Smarteam",
    contable: { uno: "empresa nuestra", varios: "empresas nuestras" },
    help:
      "Empresas que SOMOS nosotros: Smarteam y sus entidades. No somos nuestro propio " +
      "cliente. No es lo mismo que un proyecto interno — eso lo marca cada proyecto y se " +
      "filtra con «Con trabajo interno».",
  },
};

/**
 * EL filtro de la cartera de CS: solo los clientes de verdad.
 *
 * Lo consumen los listados y métricas que ANTES decían `isProspect: false` — misma
 * semántica para los datos existentes (el backfill mapeó `isProspect:true` → PROSPECTO),
 * pero ahora además saca del medio a aliados e internos.
 */
export const CS_CLIENT_WHERE = { kind: "CLIENTE" } as const satisfies { kind: ClientKind };

/** ¿Esta empresa entra a la cartera de CS? Para chequeos en memoria (no en el where). */
export function esClienteDeCartera(kind: ClientKind): boolean {
  return kind === "CLIENTE";
}

/** Valida un `kind` que llega de la frontera HTTP. null si no es válido. */
export function parseClientKind(v: unknown): ClientKind | null {
  return typeof v === "string" && (CLIENT_KINDS as readonly string[]).includes(v)
    ? (v as ClientKind)
    : null;
}

// ── TAM (Total Addressable Market) por cliente ──────────────────────────────────
// Cuánto puede llegar a facturar esa cuenta en un año, en USD. Lo estima VENTAS a
// mano — Nexus no lo deriva de nada. Es el insumo del "potencial estimado" de la
// cartera (la suma de los TAM de los clientes de verdad).

/** Techo de cordura del TAM: 100M USD. Un dedazo de más ceros arruina el total de la cartera. */
export const TAM_MAX_USD = 100_000_000;

/**
 * Valida un TAM que llega de la frontera HTTP.
 *
 * Devuelve `{ ok: true, value }` con `null` = "sin estimar" (que NO es 0 — un cliente
 * con TAM 0 es una decisión de Ventas; uno sin estimar es trabajo pendiente, y por eso
 * la UI los cuenta aparte). Redondea a 2 decimales para calzar con `Decimal(12,2)`.
 */
export function parseTamUsd(v: unknown): { ok: true; value: number | null } | { ok: false; error: string } {
  if (v === null || v === "") return { ok: true, value: null };
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v.replace(/[\s,]/g, "")) : NaN;
  if (!Number.isFinite(n)) return { ok: false, error: "El TAM tiene que ser un número en dólares." };
  if (n < 0) return { ok: false, error: "El TAM no puede ser negativo." };
  if (n > TAM_MAX_USD) return { ok: false, error: `El TAM no puede pasar de ${TAM_MAX_USD.toLocaleString("en-US")} USD.` };
  return { ok: true, value: Math.round(n * 100) / 100 };
}

/** Formatea un TAM para la UI. `null` → "—" (sin estimar), nunca "$0". */
export function formatTamUsd(v: number | null | undefined): string {
  if (v === null || v === undefined) return "—";
  return `$${v.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}
