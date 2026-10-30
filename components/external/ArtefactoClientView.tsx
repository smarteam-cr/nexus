"use client";

/**
 * components/external/ArtefactoClientView.tsx — un documento de un PROYECTO tal como lo abre su enlace propio (etapa V4
 * de docs/artefactos-plan.md, 2026-10-29): para compartir pantalla con el cliente. Motor `LandingView` en lectura con el
 * adaptador DEL TIPO (components/artefactos/adaptadores.ts), el mismo de su editor: quien lo escribe ve lo que el cliente
 * abre. Las filas ya vienen sin lo interno (lib/external/artefacto-view.ts).
 */
import LandingView from "@/components/landing/LandingView";
import { adaptadorDelTipo } from "@/components/artefactos/adaptadores";
import type { ArtefactoViewData } from "@/lib/external/artefacto-view";

export default function ArtefactoClientView({ data }: { data: ArtefactoViewData }) {
  const adaptador = adaptadorDelTipo(data.tipo);
  // El chokepoint ya filtró los tipos que no se saben pintar: esto no debería pasar, y si pasa no se pinta nada ajeno.
  if (!adaptador) return null;
  const config = adaptador.config(data.rows.map((s) => s.key));
  const built = adaptador.sections(data.rows);
  const conFila = data.rows.map((s, i) => ({
    key: s.key,
    data: built[i]?.data ?? null,
    titleOverride: s.titleOverride ?? null,
    eyebrowOverride: s.eyebrowOverride ?? null,
  }));
  /* La portada y el cierre los arma el motor aunque su fila no venga: oculta, saldría con el texto de fábrica (como el PDF). */
  const enConfig = new Set(config.sections.map((s) => s.key));
  const filas = new Set(data.rows.map((s) => s.key));
  const ocultasFijas = data.ocultas
    .filter((k) => enConfig.has(k) && !filas.has(k))
    .map((key) => ({ key, data: null, titleOverride: null, eyebrowOverride: null, hidden: true }));
  const sections = [...conFila, ...ocultasFijas];
  const ctxDelTipo = adaptador.ctx?.(conFila) ?? {};
  return (
    <LandingView
      config={config}
      /* Sin `palette`: la de marca, como toda vista del cliente (también la de la planificación, que en el editor es la
         interna — igual que su superficie de siempre, app/external/planificacion). */
      ctx={{
        clientName: data.clientName,
        clientLogoUrl: data.clientLogoUrl,
        clientLogoDarkUrl: data.clientLogoDarkUrl,
        clientLogoScale: data.clientLogoScale,
        smarteamLogoUrl: data.smarteamLogoUrl,
        brandLogos: data.brandLogos,
        ...ctxDelTipo,
        // La línea base y la meta de los objetivos (sin esto, cada objetivo dice «Por validar»).
        ...(data.resultados && ctxDelTipo.diagnostico ? { diagnostico: { ...ctxDelTipo.diagnostico, resultados: data.resultados } } : {}),
      }}
      sections={sections}
      mode="read"
    />
  );
}
