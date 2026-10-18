/**
 * lib/para-ti/importa.ts — «Lo que importa hoy» (2026-10-16, fase 1.1 de docs/nexus-sistema-de-trabajo-plan.md). PURO.
 *
 * De todo lo que es para hoy (y lo que dejó un agente), como mucho CINCO cosas, UNA POR CUENTA: la de más peso. Lo demás
 * de esa cuenta va adentro («+N en esta cuenta») y lo que no entra en las cinco queda en «También para hoy». El número del
 * menú cuenta esas cinco y el correo de la mañana usa las mismas. *Por qué:* «Para ti» tenía 26 fuentes sin orden de
 * importancia ni tope, y un hecho salía en hasta seis lugares; una lista que nunca baja se deja de mirar.
 *
 * El orden (Elías, 2026-10-16): cliente en riesgo o queja verificada > cuenta sin acción o sin reunión > decisión que
 * frena (cronograma, etapa) > revisar una reunión > lo interno > encuestas y limpieza. El peso sale de la FUENTE
 * (`PESO_DE_LA_FUENTE`); un pendiente puede traer el suyo. Lo que falló (rojo) sube.
 */
import type { Pendiente } from "./tipos";

/** Cuántas cosas, como mucho, en «Lo que importa hoy». */
export const MAX_LO_QUE_IMPORTA = 5;

/** Los escalones del orden. Una fuente nueva sin peso cae en «lo interno». */
export const PESOS = {
  riesgo: 90,
  servicio: 80,
  decision: 70,
  reunion: 60,
  interno: 40,
  limpieza: 20,
} as const;

/** El peso de cada fuente (por su clave, o por el principio de su clave). */
export const PESO_DE_LA_FUENTE: Record<string, number> = {
  // Cliente en riesgo o queja verificada.
  "cs-vigia": PESOS.riesgo,
  "cs-tus-cuentas": PESOS.riesgo,
  "cs-relaciones-cartera": PESOS.riesgo,
  "cs-relacion-hubspot": PESOS.riesgo - 5,
  // Cuenta sin acción o sin reunión (las reglas de servicio, fase 2.1).
  "cuenta-sin-accion": PESOS.servicio,
  "cs-sin-encargado": PESOS.servicio - 5,
  // Una decisión que frena.
  "cronograma-propuesta": PESOS.decision,
  "cs-cronogramas-trabados": PESOS.decision,
  "etapa-sugerida": PESOS.decision - 5,
  alta: PESOS.decision,
  presentaciones: PESOS.decision - 10,
  // Revisar una reunión.
  "reuniones-por-revisar-lo-que-dejaron": PESOS.reunion,
  "reuniones-sin-revisar": PESOS.reunion,
  "pedidos-fuera-de-alcance": PESOS.reunion,
  // Land and Expand: después de una entrega, seguir con un servicio recurrente (SmartLoop, etapa 6).
  "recurrencia-sugerida": PESOS.reunion - 5,
  // Lo interno.
  tareas: PESOS.interno + 5,
  preventa: PESOS.interno + 5,
  negocios: PESOS.interno + 5,
  "ventas-pedidos": PESOS.interno,
  finanzas: PESOS.interno,
  "marketing-revisar": PESOS.interno,
  "sistema-jobs": PESOS.interno,
  // Encuestas y limpieza.
  tiempos: PESOS.limpieza,
  "hubspot-limpieza": PESOS.limpieza,
  "cs-correccion-caduco": PESOS.limpieza + 5,
  "escala-comentarios": PESOS.limpieza + 5,
  "documentacion-comentarios": PESOS.limpieza + 5,
};

/** El peso de un pendiente: el suyo, el de su fuente, o el de «lo interno». Lo que falló sube un escalón. */
export function pesoDe(p: Pendiente): number {
  const base =
    p.peso ??
    PESO_DE_LA_FUENTE[p.fuente] ??
    Object.entries(PESO_DE_LA_FUENTE).find(([k]) => p.fuente.startsWith(`${k}-`) || p.fuente.startsWith(k))?.[1] ??
    PESOS.interno;
  return base + (p.error ? 15 : 0) + (p.delAgente ? 2 : 0);
}

const CUENTA_EN_EL_ENLACE = /^\/(?:clients|customer-success)\/([a-z0-9]{20,40})(?:[/?#]|$)/i;

/** La cuenta de un pendiente: la suya, o la del enlace (`/clients/<id>…`). null = no es de una cuenta. */
export function cuentaDe(p: Pendiente): string | null {
  if (p.clientId !== undefined) return p.clientId;
  return CUENTA_EN_EL_ENLACE.exec(p.href)?.[1] ?? null;
}

function antes(a: Pendiente, b: Pendiente): number {
  const peso = pesoDe(b) - pesoDe(a);
  if (peso !== 0) return peso;
  const da = a.desde ? Date.parse(a.desde) : Number.POSITIVE_INFINITY;
  const db = b.desde ? Date.parse(b.desde) : Number.POSITIVE_INFINITY;
  if (da !== db) return da - db;
  return a.titulo.localeCompare(b.titulo, "es");
}

export interface LoQueImporta {
  /** Como mucho cinco, una por cuenta, con lo demás de su cuenta en `otrosEnLaCuenta`. */
  importa: Pendiente[];
  /** Lo que no entró en las cinco (de otras cuentas o sin cuenta). */
  tambien: Pendiente[];
}

/** Elige lo que importa entre los candidatos (lo de hoy y lo que dejó un agente). */
export function elegirLoQueImporta(candidatos: readonly Pendiente[], max = MAX_LO_QUE_IMPORTA): LoQueImporta {
  const orden = [...candidatos].sort(antes);
  const porCuenta = new Map<string, Pendiente>();
  const importa: Pendiente[] = [];
  const tambien: Pendiente[] = [];
  for (const p of orden) {
    const cuenta = cuentaDe(p);
    const yaEsta = cuenta ? porCuenta.get(cuenta) : undefined;
    if (yaEsta) {
      yaEsta.otrosEnLaCuenta = [...(yaEsta.otrosEnLaCuenta ?? []), p];
      continue;
    }
    if (importa.length < max) {
      const elegido = { ...p, otrosEnLaCuenta: [] as Pendiente[] };
      importa.push(elegido);
      if (cuenta) porCuenta.set(cuenta, elegido);
    } else {
      tambien.push(p);
    }
  }
  return { importa: importa.map((p) => (p.otrosEnLaCuenta?.length ? p : { ...p, otrosEnLaCuenta: undefined })), tambien };
}
