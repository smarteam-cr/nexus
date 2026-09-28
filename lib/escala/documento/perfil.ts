/**
 * lib/escala/documento/perfil.ts — qué criterios aplican a un perfil de negocio. PURO.
 *
 * El perfil responde dos preguntas de la escala («El perfil de negocio», Parte 2): cómo se cierra
 * la venta y qué pasa después. `aplica` es el PORT EXACTO de `aplica()` en
 * `docs/escala/pruebas_escala.py` —incluida su regla de texto para «vende sin vendedor»— y
 * `perfil.test.ts` lo compara contra el Python sobre el archivo real, perfil por perfil.
 *
 * En la pantalla cada pregunta puede quedar SIN elegir («Todas»): esa pregunta no filtra. Con las
 * dos elegidas el resultado es idéntico al del Python.
 */
import type { Criterio, Dimension, Nivel } from "./tipos";

export type Cierre = "con equipo" | "transaccional" | "mixta";
export type Despues = "única" | "recompra" | "continua";

export const CIERRES: readonly Cierre[] = ["con equipo", "transaccional", "mixta"];
export const DESPUES: readonly Despues[] = ["única", "recompra", "continua"];

/** Un perfil, con cada pregunta opcional: `null` = «Todas», no filtra. */
export interface Perfil {
  cierre: Cierre | null;
  despues: Despues | null;
}

export const SIN_PERFIL: Perfil = { cierre: null, despues: null };

/** ¿Este criterio cuenta para este perfil? Port de `aplica(c, venta, rel)`. */
export function aplica(c: Pick<Criterio, "perfil" | "texto">, perfil: Perfil): boolean {
  const { cierre, despues } = perfil;
  if (c.perfil === "venta con equipo" && cierre === "transaccional") return false;
  if (c.perfil === "cliente recurrente" && despues === "única") return false;
  if (c.perfil === "relación continua" && despues !== null && despues !== "continua") return false;
  if (c.texto.includes("vende sin vendedor") && cierre === "con equipo") return false;
  return true;
}

/** Los criterios de un nivel que aplican. */
export function criteriosQueAplican(nivel: Nivel, perfil: Perfil): Criterio[] {
  return nivel.criterios.filter((c) => aplica(c, perfil));
}

/**
 * ¿La dimensión aplica? No, si se queda sin criterios de DECISIÓN (los de riesgo no deciden) que
 * apliquen en Funcional: la escala dice que entonces no aplica a ese perfil y no entra en la
 * cuenta de su capa. Hoy es el caso de Priorización de Leads en la venta transaccional.
 */
export function dimensionAplica(dim: Dimension, perfil: Perfil): boolean {
  const funcional = dim.niveles.find((n) => n.letra === "F");
  if (!funcional) return false;
  return funcional.criterios.some((c) => !c.riesgo && aplica(c, perfil));
}

// ── En la URL ─────────────────────────────────────────────────────────────────
// Sin tildes ni espacios: `?cierre=equipo&despues=unica`.

const CIERRE_EN_URL: Record<Cierre, string> = { "con equipo": "equipo", transaccional: "transaccional", mixta: "mixta" };
const DESPUES_EN_URL: Record<Despues, string> = { única: "unica", recompra: "recompra", continua: "continua" };

export function perfilDesdeUrl(params: { cierre?: string | null; despues?: string | null }): Perfil {
  const cierre = (Object.keys(CIERRE_EN_URL) as Cierre[]).find((k) => CIERRE_EN_URL[k] === params.cierre) ?? null;
  const despues = (Object.keys(DESPUES_EN_URL) as Despues[]).find((k) => DESPUES_EN_URL[k] === params.despues) ?? null;
  return { cierre, despues };
}

export function perfilParaUrl(perfil: Perfil): { cierre?: string; despues?: string } {
  return {
    ...(perfil.cierre ? { cierre: CIERRE_EN_URL[perfil.cierre] } : {}),
    ...(perfil.despues ? { despues: DESPUES_EN_URL[perfil.despues] } : {}),
  };
}

// ── En palabras ───────────────────────────────────────────────────────────────

export const ETIQUETA_DE_CIERRE: Record<Cierre, string> = {
  "con equipo": "Con equipo",
  transaccional: "Transaccional",
  mixta: "Mixta",
};

export const ETIQUETA_DE_DESPUES: Record<Despues, string> = {
  única: "Relación única",
  recompra: "Recompra",
  continua: "Relación continua",
};

/** «Con equipo · Recompra», o null si no hay perfil elegido. */
export function describirPerfil(perfil: Perfil): string | null {
  const partes = [
    perfil.cierre ? ETIQUETA_DE_CIERRE[perfil.cierre] : null,
    perfil.despues ? ETIQUETA_DE_DESPUES[perfil.despues] : null,
  ].filter(Boolean);
  return partes.length ? partes.join(" · ") : null;
}

/** Para qué perfiles vale una marca, en una línea (lo que dice la regla de `aplica`). */
export function explicarMarca(marca: Criterio["perfil"]): string | null {
  switch (marca) {
    case "venta con equipo":
      return "Solo aplica donde una persona trabaja la venta: no cuenta en la venta transaccional.";
    case "cliente recurrente":
      return "Solo aplica si el cliente vuelve (recompra o relación continua): no cuenta en la relación única.";
    case "relación continua":
      return "Solo aplica a la relación continua: suscripción, contrato o servicio.";
    default:
      return null;
  }
}
