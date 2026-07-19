/**
 * lib/agents/output-types.ts — catálogo ÚNICO de los tipos de output de agente.
 *
 * El form de /agents ofrecía 4 de los 6 valores del enum (un type inline
 * desactualizado): CARDS_AND_CHARTS y AUDIT_REPORT no se podían elegir sin
 * tocar código. Esta constante deriva del enum de Prisma y un check de tipos
 * OBLIGA a actualizarla cuando el enum crezca — no puede volver a quedarse atrás.
 */
import type { AgentOutputType } from "@prisma/client";

export interface OutputTypeMeta {
  value: AgentOutputType;
  label: string;
  hint: string;
  /** No ofrecer para agentes nuevos (se conserva por filas existentes). */
  deprecated?: boolean;
}

export const AGENT_OUTPUT_TYPES: readonly OutputTypeMeta[] = [
  { value: "CARDS", label: "Cards editables", hint: "Devuelve JSON y genera cards modificables en el canvas." },
  { value: "CARDS_AND_CHARTS", label: "Cards + Gráficos", hint: "Cards de texto + cards CHART con configuración de gráfico." },
  { value: "FLOWCHART", label: "Diagrama de flujo", hint: "JSON con nodos y aristas para un diagrama interactivo." },
  { value: "CARDS_AND_FLOWCHARTS", label: "Cards + Diagramas", hint: "Pesado: corre en background y se sigue por polling." },
  { value: "AUDIT_REPORT", label: "Reporte de auditoría", hint: "Informe estructurado del módulo de auditoría." },
  {
    value: "STREAM",
    label: "Texto libre (obsoleto)",
    hint: "El modal de streaming que lo consumía se eliminó — no usar en agentes nuevos.",
    deprecated: true,
  },
];

// Check de exhaustividad: si el enum de Prisma gana un valor, esto deja de compilar.
type Cubierto = (typeof AGENT_OUTPUT_TYPES)[number]["value"];
type _Exhaustivo = [AgentOutputType] extends [Cubierto] ? true : never;
const _check: _Exhaustivo = true;
void _check;
