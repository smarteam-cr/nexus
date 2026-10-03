/**
 * lib/canvas/diagnostico-contrato.ts — el ORDEN del diagnóstico es el de FUNDAUNA (2026-10-02).
 *
 * El contrato del diagnóstico es el informe que hizo Caroline Bersot para FUNDAUNA, y su orden es
 * parte del contrato: situación → objetivos → problema → desafío y política → cómo opera → … →
 * alcance. Un canvas nuevo nace en ese orden (`DIAGNOSTICO_CANVAS`), pero uno viejo conserva el suyo
 * —el reconcile respeta el orden vivo y solo inserta lo que falta—, así que al REGENERARLO se lo
 * lleva al contrato: las canónicas en su orden, después lo que no es del contrato (las secciones
 * retiradas, que quedan ocultas, y las que creó el equipo a mano) en el orden que traían, y el
 * cierre siempre último.
 *
 * Módulo PURO: lo usa el runner y se testea sin base.
 */

const CIERRE = "cierre";

export function ordenDelContrato(existentes: readonly string[], canon: readonly string[]): string[] {
  const presentes = new Set(existentes);
  const canonicas = canon.filter((k) => presentes.has(k) && k !== CIERRE);
  const enCanon = new Set(canon);
  const resto = existentes.filter((k) => !enCanon.has(k) && k !== CIERRE);
  return [...canonicas, ...resto, ...(presentes.has(CIERRE) ? [CIERRE] : [])];
}
