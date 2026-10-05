/**
 * lib/clients/indice.ts — lo que el índice de clientes muestra además de la tabla de siempre
 * (rediseño del 2026-10-04, sistema «Nexus · interfaz interna»). PURO y CLIENT-SAFE: lo arma el
 * servidor (`indice-servidor.ts`) y lo pinta el navegador, y las dos puntas leen estas reglas.
 *
 * Tres cosas:
 *  · la ETAPA de la fila (la del proyecto de implementación, con su posición en la línea);
 *  · los AVISOS de «Necesitan atención», lo que hoy solo se ve entrando a cada ficha;
 *  · el «Qué sigue» del panel, que es el primero de esos avisos dicho como una frase.
 */
import type { EtapaParaLaUI } from "@/lib/lifecycle/etapa-ui";

// ── La etapa de la fila ──────────────────────────────────────────────────────

export interface EtapaDeFila {
  label: string;
  /** Posición en la línea de avance; null si la etapa está fuera de ella (Bloqueado, Continuidad). */
  posicion: { index: number; total: number } | null;
  /** Cuántos OTROS proyectos de implementación abiertos tiene la empresa («+1»). */
  otros: number;
}

/**
 * Con 2+ proyectos de implementación abiertos, cuál se muestra (decisión del 2026-10-04): el que
 * va MÁS ATRÁS, porque es donde todavía queda trabajo. Una etapa fuera de la línea (Bloqueado,
 * Continuidad) gana sobre cualquier posición: es justo la que hay que ver primero.
 *
 * `null` si ninguno tiene etapa que mostrar (un proyecto de CS sin handoff no tiene).
 */
export function elegirEtapa(etapas: readonly (EtapaParaLaUI | null)[]): EtapaDeFila | null {
  const conEtapa = etapas.filter((e): e is EtapaParaLaUI => e !== null);
  if (conEtapa.length === 0) return null;
  const orden = (e: EtapaParaLaUI) => (e.posicion ? e.posicion.index : 0);
  const elegida = [...conEtapa].sort((a, b) => orden(a) - orden(b))[0];
  return { label: elegida.label, posicion: elegida.posicion, otros: etapas.length - 1 };
}

// ── Necesitan atención ───────────────────────────────────────────────────────

export type TipoDeAviso = "propuesta" | "alta" | "sesiones";

export interface AvisoDeCartera {
  tipo: TipoDeAviso;
  clientId: string;
  empresa: string;
  projectId: string;
  proyecto: string;
  /** Lo que pasa, en una o dos frases. */
  detalle: string;
  /** El chip: qué es, en tres palabras. */
  chip: string;
  /** El botón de la tarjeta. */
  accion: string;
  href: string;
  /** Es algo que dejó un agente (va en azul con la chispa); lo demás pide atención (ámbar). */
  delAgente: boolean;
}

/** El orden de prioridad, que es también el del «Qué sigue» del índice. */
const PRIORIDAD: Record<TipoDeAviso, number> = { propuesta: 0, alta: 1, sesiones: 2 };

export function ordenarAvisos(avisos: readonly AvisoDeCartera[]): AvisoDeCartera[] {
  return [...avisos].sort((a, b) => PRIORIDAD[a.tipo] - PRIORIDAD[b.tipo] || a.empresa.localeCompare(b.empresa, "es"));
}

/**
 * El «Qué sigue» del panel del índice: el aviso más importante dicho como una frase, o «al día».
 * Devuelve también el enlace para que la frase se pueda seguir sin buscar la tarjeta.
 */
export function queSigueDelIndice(
  avisos: readonly AvisoDeCartera[],
  alcance: "tuyas" | "cartera",
): { texto: string; href: string | null; enlace: string | null } {
  const primero = ordenarAvisos(avisos)[0];
  if (!primero) {
    return {
      texto:
        alcance === "tuyas"
          ? "Tus cuentas están al día: no hay propuestas de cronograma, altas ni reuniones esperando."
          : "La cartera está al día: no hay propuestas de cronograma, altas ni reuniones esperando.",
      href: null,
      enlace: null,
    };
  }
  switch (primero.tipo) {
    case "propuesta":
      return {
        texto: `${primero.empresa} tiene una propuesta de cronograma esperando tu decisión. ${primero.detalle}`,
        href: primero.href,
        enlace: "Abrir su cronograma →",
      };
    case "alta":
      return {
        texto: `${primero.empresa}: el alta de «${primero.proyecto}» quedó a medio hacer y no cobra hasta terminarla.`,
        href: primero.href,
        enlace: "Retomarla →",
      };
    case "sesiones":
      return {
        texto: `Revisa las reuniones que la IA asignó a «${primero.proyecto}» de ${primero.empresa}: podrían ser de otro proyecto de la empresa.`,
        href: primero.href,
        enlace: "Revisarlas →",
      };
  }
}
