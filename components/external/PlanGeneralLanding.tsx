"use client";

/**
 * components/external/PlanGeneralLanding.tsx — la página del plan general que ve el cliente (2026-11-19):
 * /external/plan/[token]. Recibe la FOTO publicada (lib/plan-general/foto.ts), ya filtrada por el chokepoint
 * (lib/external/plan-view.ts): un solo plan, sin proyectos ni detalle. Documento claro con hex literal, como el resto de
 * las páginas del cliente (ARCHITECTURE §1-WEB): nunca flipea con el tema de la app.
 */
import GanttDelPlan from "@/components/plan-general/GanttDelPlan";
import type { FotoDelPlan } from "@/lib/plan-general/foto";
import { logoHeightCalc, logoScaleStyle, resolveLogoScale } from "@/lib/ui/logo-scale";

const TINTA = "#0f1f3d";
const TINTA_SUAVE = "#6b7a90";
const ACENTO = "#e8590c";

export default function PlanGeneralLanding({
  clientName,
  clientLogoUrl,
  clientLogoScale,
  foto,
}: {
  clientName: string;
  clientLogoUrl: string | null;
  clientLogoScale: number | null;
  foto: FotoDelPlan | null;
}) {
  return (
    <section style={{ padding: "clamp(28px, 5vw, 56px) 16px 48px" }}>
      <div style={{ maxWidth: 1240, margin: "0 auto" }}>
        {clientLogoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={clientLogoUrl}
            alt={clientName}
            style={{
              ...logoScaleStyle(resolveLogoScale(clientLogoScale)),
              height: logoHeightCalc(40),
              width: "auto",
              maxWidth: logoHeightCalc(180),
              objectFit: "contain",
              display: "block",
              marginBottom: 18,
            }}
          />
        )}
        <p style={{ color: TINTA_SUAVE, fontSize: 13, fontWeight: 600, letterSpacing: "0.18em", textTransform: "uppercase", margin: 0 }}>
          Plan de trabajo · Smarteam
        </p>
        <h1 style={{ color: TINTA, fontSize: "clamp(24px, 3.4vw, 38px)", fontWeight: 700, lineHeight: 1.15, margin: "6px 0 28px" }}>
          Plan de trabajo de {clientName}
          {foto && foto.semanas > 0 && <span style={{ color: ACENTO }}>: {foto.semanas} semanas</span>}
        </h1>
        {foto && foto.grupos.length > 0 ? (
          <GanttDelPlan
            tema="cliente"
            arranque={foto.arranque}
            semanas={foto.semanas}
            grupos={foto.grupos.map((g, i) => ({
              // Por posición: dos loops con el mismo número no pueden pisarse las filas.
              key: String(i),
              loopNumero: g.loopNumero,
              nombre: g.nombre,
              filas: g.filas.map((f, i) => ({ key: String(i), ...f })),
            }))}
          />
        ) : (
          <p style={{ color: TINTA_SUAVE, fontSize: 15 }}>Estamos preparando tu plan de trabajo: pronto lo vas a ver aquí.</p>
        )}
      </div>
    </section>
  );
}
