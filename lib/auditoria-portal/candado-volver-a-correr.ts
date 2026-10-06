/**
 * lib/auditoria-portal/candado-volver-a-correr.ts — el candado de «Volver a correr». PURO y CLIENT-SAFE.
 *
 * «Volver a correr» crea una auditoría NUEVA del mismo portal. Lo ofrecen dos botones de la misma
 * ficha: el de la cabecera y el de «Qué sigue», y cada uno usa su propia instancia del hook
 * (components/auditoria/AccionesDeLaAuditoria.tsx › useVolverACorrer). Con un candado por instancia
 * (un useRef), apretar uno y después el otro creaba dos auditorías (2026-10-05).
 *
 * Por eso el candado es del MÓDULO, uno por auditoría que se está viendo, y avisa a quien escuche: los
 * dos botones se apagan juntos. Lo suelta quien lo tomó, si falla o al irse de la ficha.
 */
const tomados = new Set<string>();
const oyentes = new Set<() => void>();

function avisar(): void {
  for (const o of oyentes) o();
}

/** Toma el candado de esa auditoría. false = ya estaba tomado: no se crea otra. */
export function tomarCandado(auditId: string): boolean {
  if (tomados.has(auditId)) return false;
  tomados.add(auditId);
  avisar();
  return true;
}

export function soltarCandado(auditId: string): void {
  if (tomados.delete(auditId)) avisar();
}

export function candadoTomado(auditId: string): boolean {
  return tomados.has(auditId);
}

/** Para `useSyncExternalStore`: los dos botones se enteran cuando uno toma o suelta el candado. */
export function escucharElCandado(oyente: () => void): () => void {
  oyentes.add(oyente);
  return () => {
    oyentes.delete(oyente);
  };
}
