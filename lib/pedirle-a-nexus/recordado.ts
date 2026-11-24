/**
 * lib/pedirle-a-nexus/recordado.ts — EL PEDIDO DE CADA LUGAR, RECORDADO mientras la página esté abierta (23 nov, la
 * coordinadora: cerrar el cajón «Nexus» no puede perder la propuesta que no se aplicó, como no la perdía el panel viejo).
 * Client-safe.
 *
 * Vive en el módulo, por documento y lugar (en La escala: la exploración y el Resumen o un área). Cerrar el cajón desmonta
 * el panel (components/exploraciones/PedirleANexus.tsx); al volver a abrirlo sobre la misma página está todo: lo pedido, la
 * propuesta, lo aplicado, lo descartado y el «Deshacer». Una respuesta que llega con el cajón cerrado también queda. No va a
 * la base: al recargar la página se empieza de cero.
 */
import type { Choque, DeshacerDeNexus, PropuestaDeNexus } from "./contrato";

export type EstadoDelCambio = "pendiente" | "aplicado" | "descartado";

export interface PedidoRecordado {
  /** Lo que se está escribiendo en la caja del chat. */
  pedido: string;
  /** Lo último que se le mandó a Nexus (24 nov: se ve en el hilo como el mensaje de la persona, y la caja queda vacía). */
  enviado: string | null;
  pidiendo: boolean;
  error: string | null;
  propuesta: PropuestaDeNexus | null;
  estados: Record<string, EstadoDelCambio>;
  aplicando: boolean;
  choques: Choque[];
  /** Lo último aplicado: su aviso, cómo deshacerlo y qué piezas tocó. */
  hecho: { aviso: string; deshacer: DeshacerDeNexus | null; claves: string[] } | null;
}

export const SIN_PEDIDO: PedidoRecordado = { pedido: "", enviado: null, pidiendo: false, error: null, propuesta: null, estados: {}, aplicando: false, choques: [], hecho: null };

const PEDIDOS = new Map<string, PedidoRecordado>();
export const AL_RECORDAR = "nexus:pedido-recordado";

/** El pedido recordado de un lugar (la misma referencia hasta que cambia: así lo pide `useSyncExternalStore`). */
export const leerRecordado = (clave: string): PedidoRecordado => PEDIDOS.get(clave) ?? SIN_PEDIDO;

/** Cambia el pedido de un lugar y avisa a quien lo esté mirando. */
export function recordar(clave: string, cambio: Partial<PedidoRecordado> | ((e: PedidoRecordado) => Partial<PedidoRecordado>)): void {
  const antes = leerRecordado(clave);
  PEDIDOS.set(clave, { ...antes, ...(typeof cambio === "function" ? cambio(antes) : cambio) });
  if (typeof window !== "undefined") window.dispatchEvent(new Event(AL_RECORDAR));
}

export function suscribirAlRecordado(avisar: () => void): () => void {
  window.addEventListener(AL_RECORDAR, avisar);
  return () => window.removeEventListener(AL_RECORDAR, avisar);
}

/**
 * Lo que muestra el hilo del pedido (components/exploraciones/PedirleANexus.tsx): el último pedido como mensaje de la
 * persona y, si no está pensando, la propuesta. ⛔ Mientras Nexus piensa se ve lo RECIÉN pedido y la propuesta de antes se
 * esconde; si el pedido falla (`enviado` vuelve a null), la propuesta de antes vuelve con su pedido.
 */
export function loQueSeVeEnElHilo(e: Pick<PedidoRecordado, "enviado" | "pidiendo" | "propuesta">): { pedido: string | null; conPropuesta: boolean } {
  return { pedido: e.enviado ?? e.propuesta?.pedido ?? null, conPropuesta: !!e.propuesta && !e.pidiendo };
}
