/**
 * lib/escala/documento/perfil.ts — qué criterios aplican a un perfil de negocio. PURO.
 *
 * El perfil responde dos preguntas de la escala («El perfil de negocio», Parte 2): cómo se cierra
 * la venta y qué pasa después. `aplica` es el PORT EXACTO de `aplica()` en
 * `docs/escala/pruebas_escala.py` y `perfil.test.ts` lo compara contra el Python sobre el archivo
 * real, perfil por perfil. Hasta la 7.6.1 «vende sin vendedor» era una regla de TEXTO; desde la
 * 7.7.0 es una marca más («venta sin vendedor»), como «recompra».
 *
 * Desde el borrador 9.0.0 hay una tercera pregunta, el tráfico del sitio o la app, con su marca
 * «tráfico suficiente» (N4, docs/escala-engagement-avanzado-plan.md). Es OPCIONAL en el tipo: una
 * versión que no la trae, y quien no la responde, no filtra por ella. Un criterio lleva una sola
 * marca, así que ninguno queda con dos condiciones.
 *
 * En la pantalla cada pregunta puede quedar SIN elegir («Todas»): esa pregunta no filtra. Con las
 * dos elegidas el resultado es idéntico al del Python.
 */
import { CIERRES, DESPUES, TRAFICOS, type Cierre, type Criterio, type Despues, type Dimension, type Nivel, type Trafico } from "./tipos";

// Las respuestas del perfil son gramática del documento (una edición trae su «perfil habitual»):
// viven en `tipos.ts` y se reexportan acá, que es de donde las importa la pantalla.
export { CIERRES, DESPUES, TRAFICOS };
export type { Cierre, Despues, Trafico };

/** Un perfil, con cada pregunta opcional: `null` = «Todas», no filtra. */
export interface Perfil {
  cierre: Cierre | null;
  despues: Despues | null;
  /** La tercera pregunta (desde el borrador 9.0.0). Sin ella, o `null`, no filtra. */
  trafico?: Trafico | null;
}

export const SIN_PERFIL: Perfil = { cierre: null, despues: null };

/** ¿Este criterio cuenta para este perfil? Port de `aplica(c, venta, rel, trafico)`. */
export function aplica(c: Pick<Criterio, "perfil">, perfil: Perfil): boolean {
  const { cierre, despues } = perfil;
  const trafico = perfil.trafico ?? null;
  if (c.perfil === "venta con equipo" && cierre === "transaccional") return false;
  if (c.perfil === "venta sin vendedor" && cierre === "con equipo") return false;
  if (c.perfil === "cliente recurrente" && despues === "única") return false;
  if (c.perfil === "recompra" && despues !== null && despues !== "recompra") return false;
  if (c.perfil === "relación continua" && despues !== null && despues !== "continua") return false;
  if (c.perfil === "tráfico suficiente" && trafico === "insuficiente") return false;
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
// Sin tildes ni espacios: `?cierre=equipo&despues=unica&trafico=suficiente`.

const CIERRE_EN_URL: Record<Cierre, string> = { "con equipo": "equipo", transaccional: "transaccional", mixta: "mixta" };
const DESPUES_EN_URL: Record<Despues, string> = { única: "unica", recompra: "recompra", continua: "continua" };

export function perfilDesdeUrl(params: { cierre?: string | null; despues?: string | null; trafico?: string | null }): Perfil {
  const cierre = (Object.keys(CIERRE_EN_URL) as Cierre[]).find((k) => CIERRE_EN_URL[k] === params.cierre) ?? null;
  const despues = (Object.keys(DESPUES_EN_URL) as Despues[]).find((k) => DESPUES_EN_URL[k] === params.despues) ?? null;
  const trafico = TRAFICOS.find((t) => t === params.trafico) ?? null;
  return trafico ? { cierre, despues, trafico } : { cierre, despues };
}

export function perfilParaUrl(perfil: Perfil): { cierre?: string; despues?: string; trafico?: string } {
  return {
    ...(perfil.cierre ? { cierre: CIERRE_EN_URL[perfil.cierre] } : {}),
    ...(perfil.despues ? { despues: DESPUES_EN_URL[perfil.despues] } : {}),
    ...(perfil.trafico ? { trafico: perfil.trafico } : {}),
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

export const ETIQUETA_DE_TRAFICO: Record<Trafico, string> = {
  suficiente: "Tráfico suficiente",
  insuficiente: "Poco tráfico",
};

/** «Con equipo · Recompra», o null si no hay perfil elegido. */
export function describirPerfil(perfil: Perfil): string | null {
  const partes = [
    perfil.cierre ? ETIQUETA_DE_CIERRE[perfil.cierre] : null,
    perfil.despues ? ETIQUETA_DE_DESPUES[perfil.despues] : null,
    perfil.trafico ? ETIQUETA_DE_TRAFICO[perfil.trafico] : null,
  ].filter(Boolean);
  return partes.length ? partes.join(" · ") : null;
}

/** Para qué perfiles vale una marca, en una línea (lo que dice la regla de `aplica`). */
export function explicarMarca(marca: Criterio["perfil"]): string | null {
  switch (marca) {
    case "venta con equipo":
      return "Solo aplica donde una persona trabaja la venta: no cuenta en la venta transaccional.";
    case "venta sin vendedor":
      return "Solo aplica donde la venta se cierra sin que una persona la trabaje (transaccional o mixta): no cuenta en la venta con equipo.";
    case "cliente recurrente":
      return "Solo aplica si el cliente vuelve (recompra o relación continua): no cuenta en la relación única.";
    case "recompra":
      return "Solo aplica si el cliente vuelve a comprar sin contrato: no cuenta en la relación única ni en la continua.";
    case "relación continua":
      return "Solo aplica a la relación continua: suscripción, contrato o servicio.";
    case "tráfico suficiente":
      return "Solo aplica si el sitio o la app tiene el tráfico que pide la escala: no cuenta donde hay poco tráfico.";
    default:
      return null;
  }
}
