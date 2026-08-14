"use client";

/**
 * components/external/EntregaClientView.tsx
 *
 * El documento de ENTREGA tal como lo ve el cliente. Motor `LandingView` en modo lectura,
 * con el adaptador COMPARTIDO con el editor interno — el CSE revisa exactamente lo que el
 * cliente abre, que en un documento de cierre no es un lujo: es lo que le permite decir «te
 * mandé esto» sin haber tenido que abrir el enlace él mismo.
 *
 * ⚠ LA FECHA DE CORTE VA ARRIBA Y VISIBLE. Lo que el cliente lee es un SNAPSHOT congelado el
 * día que se publicó, y un número sin fecha de corte envejece en secreto: seis meses después
 * sigue diciendo lo mismo y el lector cree que es de hoy.
 */
import LandingView from "@/components/landing/LandingView";
import { buildEntregaConfig, buildEntregaSections } from "@/components/canvas/entrega-landing-adapter";
import type { EntregaViewData } from "@/lib/external/entrega-view";

function fecha(iso: string): string {
  return new Date(iso).toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" });
}

export default function EntregaClientView({ data }: { data: EntregaViewData }) {
  const keys = data.rows.map((s) => s.key);
  const config = buildEntregaConfig(keys);
  const built = buildEntregaSections(data.rows);
  const sections = data.rows.map((s, i) => ({
    key: s.key,
    data: built[i].data,
    titleOverride: s.titleOverride,
    eyebrowOverride: s.eyebrowOverride,
  }));

  return (
    <div>
      {data.publishedAt && (
        <p style={{ textAlign: "center", fontSize: 12, color: "var(--text-muted)", padding: "12px 16px 0", margin: 0 }}>
          Documento de entrega · datos al {fecha(data.publishedAt)}
        </p>
      )}
      <LandingView
        config={config}
        ctx={{
          clientName: data.clientName || data.projectName,
          clientLogoUrl: data.clientLogoUrl,
          clientLogoDarkUrl: data.clientLogoDarkUrl,
          clientLogoScale: data.clientLogoScale,
          smarteamLogoUrl: data.smarteamLogoUrl ?? null,
          brandLogos: data.brandLogos,
        }}
        sections={sections}
        mode="read"
      />
    </div>
  );
}
