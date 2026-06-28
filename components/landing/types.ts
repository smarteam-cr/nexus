/**
 * components/landing/types.ts
 *
 * Tipos del MOTOR de landing por secciones estructuradas. Cada tipo de sección
 * define el shape de `data` que el agente IA llena (y que se guarda en
 * CanvasBlock.data), su componente de render/edición, su JSON Schema (para el
 * tool use del agente) y un `empty` para el template vacío.
 *
 * El render de una landing se decide por la CONFIG (lista ordenada de SectionDef,
 * matcheada por `key` contra CanvasSection.key) — NO por el enum BlockType.
 */
import type { FC } from "react";

// ── Datos estructurados por sección (lo que llena el agente) ─────────────────

// 1) Hero — logos (cliente×Smarteam×HubSpot) + titular + subtítulo + tags (chips).
export interface HeroData { headline: string; subhead: string; tags: string[] }

// 2) Diagnóstico — 3 a 6 dolores concretos.
export interface PainItem { title: string; detail: string }
export interface PainData { items: PainItem[] }

// 3) Antes vs. después — dos listas (Hoy / Con HubSpot + Smarteam).
export interface BeforeAfterData { before: string[]; after: string[] }

// 4) Solución — 4 campos rotulados (texto por campo).
export interface SolutionData { hubs: string; integraciones: string; casosDeUso: string; usuarios: string }

// 5) ROI — 4 métricas (valor + qué mejora).
export interface Metric { value: string; label: string }
export interface RoiData { metrics: Metric[] }

// 6) Timeline — fases con semanas.
export interface Phase { name: string; detail: string; duration: string }
export interface PlanData { phases: Phase[] }

// 7) Inversión — 2 líneas fijas (licencias HubSpot / implementación Smarteam).
export interface InvestmentLine { monto: string; detalle: string }
export interface InvestmentData { licenciasHubspot: InvestmentLine; implementacion: InvestmentLine; nota: string }

// 8) Partner — 4 campos (2 con default fijo).
export interface PartnerData { credencial: string; experiencia: string; referenciaSectorial: string; equipo: string }

// 9) CTA final.
export interface CtaData { headline: string; subhead: string; buttonLabel: string }

// ── Contrato del motor ───────────────────────────────────────────────────────

/** Datos del business case (no editables) que el motor pasa a cada sección. */
export interface LandingContext {
  clientName: string;
  clientLogoUrl?: string | null;
}

/** Props que recibe TODA sección. `onChange` emite el nuevo `data` (estado local
 *  del workspace, que persiste con debounce vía saveBlock). En modo lectura no hay
 *  handlers. */
export interface SectionProps<T> {
  data: T;
  ctx: LandingContext;
  editable?: boolean;
  onChange?: (data: T) => void;
}

/** Definición de una sección dentro de un LandingConfig. No genérico (cada sección
 *  trae su propio data shape); `Component`/`empty` usan `any` para que asignar
 *  componentes concretos (FC<SectionProps<HeroData>>, …) no choque con la varianza. */
export interface SectionDef {
  key: string;                 // matchea CanvasSection.key
  label: string;               // rótulo interno + TÍTULO grande de la sección (no-selfTitled)
  eyebrow?: string;            // categoría/framing chico arriba del título (estilo kickoff)
  theme: "dark" | "light" | "soft";
  backdrop?: boolean;          // grid+glow del hero (dark)
  selfTitled?: boolean;        // el componente trae su propio encabezado (hero/partner/cta);
                               // si no, el motor renderiza un eyebrow con `label`
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Component: FC<SectionProps<any>>;
  schema: Record<string, unknown>; // JSON Schema → tool use del agente
  agentHint: string;           // qué debe redactar el agente (instrucción base; el override la gana)
  brief?: string;              // guía del spec (descripción + regla "Fuente:") — ayuda editable
                               // en el editor; el agente la lee al generar (override por sección la gana)
  empty: unknown;              // data inicial (template vacío)
}

export interface LandingConfig {
  type: string;                // "business-case" | "kickoff" | ...
  sections: SectionDef[];      // orden de render
}

/** Una sección con su `data` lista para render (desde el hook o el snapshot). */
export interface RenderSection {
  key: string;
  data: unknown;
}
