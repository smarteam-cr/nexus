"use client";

/**
 * components/clients/ClientInfoPanel.tsx
 *
 * Panel "Información del cliente" (ex Canvas de Estrategia + ex drawer Contexto).
 *
 * Sub-tabs horizontales:
 *   - Documentos    → DocumentUpload (Supabase Storage del proyecto strategy)
 *   - Stakeholders  → SectionBlockList filtrado por key="stakeholders"
 *   - Retos         → idem key="retos_estrategicos"
 *   - Oportunidades → idem key="oportunidades"
 *
 * Internamente sigue siendo el Project con serviceType=__strategy__; cambian
 * los nombres de UI y las secciones del canvas se reducen a 3 (las otras 2
 * — handoff_ventas y perfil_cliente — se eliminaron en la migración).
 */
import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import CanvasLinearView from "@/components/canvas/CanvasLinearView";
import DocumentUpload from "./DocumentUpload";
import { LogoUploader } from "@/components/ui/LogoUploader";
import { ScaleSlider } from "@/components/ui/ScaleSlider";
import {
  LOGO_SCALE_DEFAULT, LOGO_SCALE_MAX, LOGO_SCALE_MIN, LOGO_SCALE_STEP,
  logoHeightCalc, logoScaleStyle, resolveLogoScale,
} from "@/lib/ui/logo-scale";

type SubTab = "docs" | "stakeholders" | "retos" | "oportunidades" | "marca";

const TABS: { key: SubTab; label: string }[] = [
  { key: "docs",          label: "Documentos" },
  { key: "stakeholders",  label: "Stakeholders" },
  { key: "retos",         label: "Retos estratégicos" },
  { key: "oportunidades", label: "Oportunidades" },
  { key: "marca",         label: "Marca" },
];

export default function ClientInfoPanel({
  projectId,
  canvasId,
}: {
  projectId: string;
  canvasId: string;
  // domain/company siguen aceptándose por compatibilidad del caller, pero ya no
  // se usan acá (la sub-pestaña Sesiones que los consumía fue eliminada).
  domain?: string;
  company?: string;
}) {
  const params = useParams();
  const clientId = (params?.id as string) ?? "";
  const [tab, setTab] = useState<SubTab>("docs");

  return (
    <div className="px-6 py-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white">Información del cliente</h2>
          <p className="text-sm text-gray-400 mt-0.5">
            Documentos y contexto estratégico del cliente.
          </p>
        </div>
        {clientId && (
          <a
            href={`/print/canvas/${clientId}/${canvasId}?print=1&projectId=${projectId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors bg-gray-900 border-gray-800 text-gray-300 hover:bg-gray-800 hover:border-gray-700"
            title="Abre una vista imprimible de las secciones del canvas"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
            </svg>
            Exportar PDF
          </a>
        )}
      </div>

      {/* Sub-tabs horizontales */}
      <div className="flex gap-0 border-b border-gray-800">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === t.key
                ? "border-brand text-white"
                : "border-transparent text-gray-500 hover:text-gray-300 hover:border-gray-700"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Contenido del sub-tab activo */}
      <div className="pt-2">
        {tab === "docs" && <DocumentUpload projectId={projectId} />}

        {tab === "stakeholders" && (
          <CanvasLinearView projectId={projectId} canvasId={canvasId} onlyKey="stakeholders" />
        )}

        {tab === "retos" && (
          <CanvasLinearView projectId={projectId} canvasId={canvasId} onlyKey="retos_estrategicos" />
        )}

        {tab === "oportunidades" && (
          <CanvasLinearView projectId={projectId} canvasId={canvasId} onlyKey="oportunidades" />
        )}

        {tab === "marca" && <ClientLogoSection clientId={clientId} projectId={projectId} />}
      </div>
    </div>
  );
}

// ── Logo del cliente (sub-tab "Marca") ────────────────────────────────────────

function ClientLogoSection({ clientId, projectId }: { clientId: string; projectId: string }) {
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [logoDarkUrl, setLogoDarkUrl] = useState<string | null>(null);
  const [scale, setScale] = useState<number | null>(null);
  // Lo que se está arrastrando AHORA. Separado de `scale` (lo guardado) para que las
  // muestras crezcan bajo el dedo sin una request por píxel.
  const [preview, setPreview] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/projects/${projectId}/client-logo`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        setLogoUrl(d?.logoUrl ?? null);
        setLogoDarkUrl(d?.logoDarkUrl ?? null);
        setScale(typeof d?.logoScale === "number" ? d.logoScale : null);
      })
      .catch(() => setLogoUrl(null))
      .finally(() => setLoading(false));
  }, [projectId]);

  const guardarEscala = (pct: number | null) => {
    setScale(pct);
    void fetch(`/api/clients/${clientId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ logoScale: pct }),
    }).catch(() => {});
  };

  // Delinea, no rellena: espeja la tarjeta real (rounded-xl + border) en vez de un
  // rectángulo opaco. Es lo que pide lib/ui/skeleton-vocab.test.ts (T1 anti-slab).
  if (loading) return <div className="h-28 rounded-xl border border-line max-w-md" />;

  const efectivo = resolveLogoScale(preview ?? scale);
  const estilo = { ...logoScaleStyle(efectivo), height: logoHeightCalc(30) };
  // Los px concretos: un "200%" no dice nada si no sabés de qué parte. Un logo cuadrado a
  // 200% son 60×60 — chico al lado de una banda de 102px de ancho, y ver el número lo
  // explica sin que haya que deducirlo.
  const altoPx = Math.round((30 * efectivo) / 100);

  return (
    <section className="rounded-xl bg-surface border border-line p-5 max-w-md space-y-5">
      <div>
        <h3 className="text-sm font-semibold text-fg mb-1">Logo del cliente</h3>
        <p className="text-xs text-fg-muted mb-4">
          Aparece en las páginas que ve el cliente (kickoff y cronograma) y en este workspace.
        </p>
        <LogoUploader
          currentUrl={logoUrl}
          endpoint={`/api/clients/${clientId}/logo`}
          label="Logo del cliente"
          hint="PNG, JPG, WebP o SVG · máx 4MB."
        />
      </div>

      {logoUrl && (
        <>
          <ScaleSlider
            value={scale}
            base={LOGO_SCALE_DEFAULT}
            min={LOGO_SCALE_MIN}
            max={LOGO_SCALE_MAX}
            step={LOGO_SCALE_STEP}
            label="Tamaño del logo"
            resetLabel="Volver al normal"
            onPreview={setPreview}
            onCommit={(pct) => {
              setPreview(null);
              guardarEscala(pct);
            }}
          />

          {/* Las DOS muestras juntas son el argumento: el mismo archivo sobre los dos
              fondos en los que Nexus lo va a pintar. Sin versión oscura, la de la derecha
              muestra la silueta blanca que produce el filtro — que es exactamente lo que
              hay que ver para entender por qué conviene subir un segundo archivo. */}
          <div>
            <div className="flex items-baseline justify-between mb-2">
              <p className="text-xs font-medium text-fg-secondary">Cómo se va a ver</p>
              <p className="text-[11px] tabular-nums text-fg-muted">{altoPx} px de alto</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Muestra titulo="Cronograma" fondo="#ffffff">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={logoUrl} alt="" style={estilo} className="w-auto max-w-full object-contain" />
              </Muestra>
              <Muestra titulo="Portada" fondo="#051849">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={logoDarkUrl ?? logoUrl}
                  alt=""
                  style={{
                    ...estilo,
                    // Espeja `.stl-brand-logo`: sin versión oscura, el hero blanquea el
                    // archivo. Con ella, se muestra tal cual.
                    ...(logoDarkUrl ? {} : { filter: "brightness(0) invert(1)", opacity: 0.92 }),
                  }}
                  className="w-auto max-w-full object-contain"
                />
              </Muestra>
            </div>
            {!logoDarkUrl && (
              <p className="text-[11px] text-fg-muted mt-2">
                Sobre fondo oscuro el logo se pinta en blanco y pierde sus colores. Subí una
                versión para fondo oscuro si querés conservarlos.
              </p>
            )}
          </div>

          <div className="pt-1 border-t border-line">
            <h4 className="text-xs font-semibold text-fg mt-4 mb-1">Versión para fondo oscuro</h4>
            <p className="text-[11px] text-fg-muted mb-3">
              Opcional. Se usa en la portada de los documentos, que va sobre azul oscuro. Si no
              la subís, Nexus pinta el logo principal en blanco.
            </p>
            <LogoUploader
              currentUrl={logoDarkUrl}
              // El `?variant=dark` viaja tal cual al POST y al DELETE: `LogoUploader` pasa
              // el endpoint verbatim, así que no hubo que tocarlo.
              endpoint={`/api/clients/${clientId}/logo?variant=dark`}
              responseKey="logoDarkUrl"
              label="Versión oscura"
              uploadLabel="Subir versión para fondo oscuro"
              emptyLabel="Sin versión oscura"
              hint="PNG, JPG, WebP o SVG · máx 4MB."
            />
          </div>
        </>
      )}
    </section>
  );
}

/** Recuadro de vista previa con un fondo fijo (no sigue el tema de Nexus: muestra el
 *  fondo REAL de la superficie del documento). */
function Muestra({ titulo, fondo, children }: { titulo: string; fondo: string; children: React.ReactNode }) {
  return (
    <div>
      <div
        // Alto suficiente para el TOPE (30px base × 400% = 120px) más aire. La caja
        // anterior daba 56px útiles: a 200% el logo medía 60 y se RECORTABA, así que la
        // vista previa era incapaz de mostrar los tamaños grandes que decía mostrar.
        className="rounded-lg border border-line flex items-center justify-center p-3 h-36 overflow-hidden"
        style={{ background: fondo }}
      >
        {children}
      </div>
      <p className="text-[11px] text-fg-muted mt-1 text-center">{titulo}</p>
    </div>
  );
}
