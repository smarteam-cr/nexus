"use client";

/**
 * components/clients/ClientInfoPanel.tsx
 *
 * Panel "Información del cliente" (ex Canvas de Estrategia + ex drawer Contexto).
 *
 * Sub-tabs horizontales:
 *   - Ficha      → FichaDelCliente (lib/clients/ficha.ts): LA información del cliente, una sola,
 *                  que leen los agentes y se guarda en la empresa de HubSpot al confirmarla.
 *   - Documentos → DocumentUpload (Supabase Storage del proyecto strategy)
 *   - Marca      → logo del cliente
 *
 * Stakeholders, Retos y Oportunidades eran sub-tabs sueltas sobre bloques del canvas client-info
 * y se fueron el 2026-09-27: los tres son campos de la ficha. En prod había 1 bloque (vacío)
 * entre los 188 clientes, así que no hubo nada que migrar.
 *
 * Desde el rediseño de la ficha (2026-10-04, sistema «Nexus · interfaz interna») las subpestañas
 * son un segmentado y el contexto de la cuenta —qué sigue, licencias, la empresa— va en el panel
 * de la derecha (`PanelDeLaCuenta`, por portal).
 */
import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { useParams } from "next/navigation";
import { Segmentado } from "@/components/ui/Segmentado";
import PanelDeLaCuenta from "./PanelDeLaCuenta";
import DocumentUpload from "./DocumentUpload";
import FichaDelCliente from "./FichaDelCliente";
import LicenciasDelCliente from "./LicenciasDelCliente";
import { LogoUploader } from "@/components/ui/LogoUploader";
import { ScaleSlider } from "@/components/ui/ScaleSlider";
import { usePantallaDelRecorrido } from "@/components/recorridos/contexto";
import {
  LOGO_SCALE_DEFAULT, LOGO_SCALE_MAX, LOGO_SCALE_MIN, LOGO_SCALE_STEP,
  logoHeightCalc, logoScaleStyle, resolveLogoScale,
} from "@/lib/ui/logo-scale";

type SubTab = "ficha" | "licencias" | "docs" | "marca";

const TABS: { key: SubTab; label: string }[] = [
  { key: "ficha", label: "Ficha" },
  // Licencias de HubSpot y sus renovaciones (2026-10-02, pedido de Liliana Moreno).
  { key: "licencias", label: "Licencias" },
  { key: "docs",  label: "Documentos" },
  { key: "marca", label: "Marca" },
];

export default function ClientInfoPanel({
  projectId,
  canvasId,
  slotDelPanel = null,
  clientId: clientIdDado,
  enLaPreventa = false,
}: {
  projectId: string;
  canvasId: string;
  /** El panel de la derecha de la ficha (null con el panel oculto). */
  slotDelPanel?: HTMLElement | null;
  /** La empresa, cuando el panel no vive en /clients/[id] (la preventa). Sin él, sale de la dirección. */
  clientId?: string;
  /**
   * Montado dentro de una preventa (2026-10-06): la MISMA información de la empresa, sin Licencias (un
   * prospecto todavía no compró nada), sin el margen de la ficha (lo pone el lienzo) y sin ofrecer el
   * recorrido de la ficha (la preventa tiene el suyo).
   */
  enLaPreventa?: boolean;
  // domain/company siguen aceptándose por compatibilidad del caller, pero ya no
  // se usan acá (la sub-pestaña Sesiones que los consumía fue eliminada).
  domain?: string;
  company?: string;
}) {
  const params = useParams();
  const clientId = clientIdDado ?? (params?.id as string) ?? "";
  const [tab, setTab] = useState<SubTab>("ficha");
  // Mientras está abierta, el botón «Recorrido» de la cabecera ofrece el de esta pantalla.
  usePantallaDelRecorrido(enLaPreventa ? null : "ficha-informacion");
  const pestanas = enLaPreventa ? TABS.filter((t) => t.key !== "licencias") : TABS;

  return (
    <div className={enLaPreventa ? "space-y-5" : "space-y-5 px-8 pb-10 pt-6"}>
      {slotDelPanel && clientId && createPortal(<PanelDeLaCuenta clientId={clientId} tabActual={tab} onIrA={setTab} />, slotDelPanel)}

      {/* El título y, a su derecha, las sub-pestañas y el PDF (diseño de la ficha, 2026-10-04). */}
      <div data-recorrido="info.vistas" className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <div className="min-w-0">
          <h2 className="text-[22px] font-bold leading-tight text-fg">Información del cliente</h2>
          <p className="mt-0.5 text-[13px] text-fg-muted">
            {enLaPreventa
              ? "La misma de la ficha del cliente: la leen los agentes y se comparte con la empresa en HubSpot."
              : "La ficha que leen los agentes, las licencias, los documentos y la marca del cliente."}
          </p>
        </div>
        <span className="flex-1" />
        <Segmentado
          etiqueta="Qué mirar de la cuenta"
          opciones={pestanas.map((t) => ({ clave: t.key, etiqueta: t.label }))}
          valor={tab}
          onCambio={setTab}
        />
        {clientId && (
          <a
            href={`/print/canvas/${clientId}/${canvasId}?print=1&projectId=${projectId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 rounded px-1 py-1 text-xs text-fg-muted transition-colors hover:text-fg"
            title="Abre una vista imprimible de las secciones del canvas"
          >
            Exportar PDF
          </a>
        )}
      </div>

      {/* Contenido del sub-tab activo */}
      <div>
        {tab === "ficha" && clientId && <FichaDelCliente clientId={clientId} />}
        {tab === "licencias" && !enLaPreventa && clientId && <LicenciasDelCliente clientId={clientId} />}

        {tab === "docs" && <DocumentUpload projectId={projectId} />}

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
          hint="PNG, JPG, WebP o SVG · máx 300 KB."
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
                Sobre fondo oscuro el logo se pinta en blanco y pierde sus colores. Sube una
                versión para fondo oscuro si quieres conservarlos.
              </p>
            )}
          </div>

          <div className="pt-1 border-t border-line">
            <h4 className="text-xs font-semibold text-fg mt-4 mb-1">Versión para fondo oscuro</h4>
            <p className="text-[11px] text-fg-muted mb-3">
              Opcional. Se usa en la portada de los documentos, que va sobre azul oscuro. Si no
              la subes, Nexus pinta el logo principal en blanco.
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
              hint="PNG, JPG, WebP o SVG · máx 300 KB."
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
