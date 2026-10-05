"use client";

/**
 * components/feedback/PanelDeFeedback.tsx — el panel de la derecha: «Dar feedback» y «Mis reportes».
 *
 * Diseño: tablero «Feedback · diseño» (Claude Design, 2026-10-04), tableros 1 a 5. Lo que ve la persona
 * al mandar depende de qué mandó: una mejora festeja (en toda la pantalla, components/feedback/Festejo),
 * una falla que le frena el trabajo recibe «Reportado como urgente» con su número, y lo demás el
 * «Recibido» verde de siempre.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Segmentado } from "@/components/ui/Segmentado";
import { Tabs } from "@/components/ui/Tabs";
import { ROTULO_DEL_SISTEMA } from "@/components/ui/sistema";
import { cn } from "@/lib/cn";
import type { PedidoParaMi, ReporteDeLista, ReporteDetalle } from "@/lib/feedback/queries";
import {
  describirNavegador,
  haceCuanto,
  numeroDeReporte,
  TIPO,
  TIPOS_DE_FEEDBACK,
  type TipoDeFeedback,
} from "@/lib/feedback/reglas";
import { Z } from "@/lib/ui/z";
import { subirCaptura } from "./captura";
import { erroresRecientes } from "./errores";
import type { Captura } from "./FeedbackProvider";
import { ChipDeEstado, Hilo, ICONO_CERRAR, ICONO_SENALAR, IconoDeTipo, MarcaNumerada, Trazo } from "./piezas";
import type { Marca } from "./Senalar";

export type Pestana = "dar" | "mis";

interface Props {
  enPestana: Pestana;
  onPestana: (p: Pestana) => void;
  reporteId: string | null;
  onReporte: (id: string | null) => void;
  captura: Captura;
  marcas: Marca[];
  onQuitarMarca: (n: number) => void;
  onSenalar: () => void;
  onQuitarCaptura: () => void;
  onVolverACapturar: () => void;
  respondiendo: PedidoParaMi | null;
  onRespondido: (pedidoId: string) => void;
  version: string | null;
  onFestejar: (ideas: number) => void;
  onCerrar: () => void;
}

/** Cómo se llama la pantalla: su título (el h1 de la cabecera) o el del documento. */
function nombreDeLaPantalla(): string {
  const h1 = document.querySelector("main h1, h1");
  const texto = (h1?.textContent ?? "").replace(/\s+/g, " ").trim();
  return (texto || document.title || "Nexus").slice(0, 200);
}

export function PanelDeFeedback(p: Props) {
  const [montado, setMontado] = useState(false);
  const [pantalla, setPantalla] = useState("");
  const [ruta, setRuta] = useState("/");
  const [reportes, setReportes] = useState<ReporteDeLista[] | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- se lee del DOM al abrir (mount guard del portal)
    setMontado(true);
    setPantalla(nombreDeLaPantalla());
    setRuta(`${window.location.pathname}${window.location.search}`);
  }, []);

  const cargarReportes = useCallback(async () => {
    try {
      const r = await fetch("/api/feedback", { cache: "no-store" });
      if (!r.ok) return;
      const d = (await r.json()) as { reportes?: ReporteDeLista[] };
      setReportes(d.reportes ?? []);
    } catch {
      /* sin red: la pestaña lo dice */
    }
  }, []);

  // La lista, una vez al abrir (después se vuelve a pedir al mandar o al volver de un reporte).
  useEffect(() => {
    let vivo = true;
    fetch("/api/feedback", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { reportes?: ReporteDeLista[] } | null) => {
        if (vivo && d) setReportes(d.reportes ?? []);
      })
      .catch(() => {});
    return () => {
      vivo = false;
    };
  }, []);

  const sinLeer = (reportes ?? []).some((r) => r.nuevo);

  if (!montado) return null;
  return createPortal(
    <aside
      data-feedback-ui=""
      aria-label="Feedback"
      className="fixed right-0 top-0 flex h-full w-[400px] max-w-[92vw] flex-col border-l border-line bg-surface"
      style={{ zIndex: Z.DRAWER }}
    >
      <div className="flex flex-col gap-2.5 px-4 pt-3.5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[15px] font-semibold leading-5 text-fg">Feedback</p>
            <p className="truncate text-xs text-fg-muted">Sobre «{pantalla}»</p>
          </div>
          <button
            type="button"
            onClick={p.onCerrar}
            aria-label="Cerrar el panel"
            className="flex h-7 w-7 items-center justify-center rounded-md text-fg-muted transition-colors hover:bg-surface-hover hover:text-fg"
          >
            <Trazo d={ICONO_CERRAR} />
          </button>
        </div>
        <Tabs<Pestana>
          aria-label="Secciones del panel"
          size="sm"
          value={p.enPestana}
          onChange={(k) => {
            p.onPestana(k);
            if (k === "mis") p.onReporte(null);
          }}
          items={[
            { key: "dar", label: "Dar feedback" },
            {
              key: "mis",
              label: (
                <>
                  Mis reportes
                  {sinLeer && <span aria-label="hay algo nuevo" className="ml-1 inline-block h-1.5 w-1.5 rounded-full bg-brand align-middle" />}
                </>
              ),
              count: reportes?.length,
            },
          ]}
        />
      </div>

      {p.enPestana === "dar" ? (
        <DarFeedback {...p} pantalla={pantalla} ruta={ruta} cuentaReportes={reportes?.length ?? null} onEnviado={() => void cargarReportes()} />
      ) : (
        <MisReportes
          reportes={reportes}
          reporteId={p.reporteId}
          onReporte={(id) => {
            p.onReporte(id);
            if (!id) void cargarReportes();
          }}
        />
      )}
    </aside>,
    document.body,
  );
}

// ── Dar feedback ──────────────────────────────────────────────────────────────

interface Enviado {
  numero: number;
  urgente: boolean;
  tipo: TipoDeFeedback;
  cuerpo: string;
  conCaptura: boolean;
  marcas: number;
  errores: { mensaje: string; hace: string }[];
}

function DarFeedback(
  p: Props & { pantalla: string; ruta: string; cuentaReportes: number | null; onEnviado: () => void },
) {
  const [tipo, setTipo] = useState<TipoDeFeedback>(p.respondiendo ? "mejora" : "falla");
  const [cuerpo, setCuerpo] = useState("");
  const [frena, setFrena] = useState<"si" | "no">("no");
  const [detalles, setDetalles] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enviado, setEnviado] = useState<Enviado | null>(null);

  const errores = useMemo(() => erroresRecientes(), []);
  const navegador = useMemo(() => (typeof navigator === "undefined" ? "" : describirNavegador(navigator.userAgent)), []);
  const ventana = typeof window === "undefined" ? "" : `${window.innerWidth} × ${window.innerHeight}`;
  const def = TIPO[tipo];
  const vacio = cuerpo.trim().length < 3;

  const mandar = async () => {
    if (vacio || enviando) return;
    setEnviando(true);
    setError(null);
    let capturaPath: string | undefined;
    if (p.captura.blob) {
      const subida = await subirCaptura(p.captura.blob);
      if (subida.ok) capturaPath = subida.path;
      // Si la captura no sube, el reporte sale igual con la dirección: no se pierde lo que escribió.
    }
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tipo,
          cuerpo,
          meFrena: tipo === "falla" && frena === "si",
          pantalla: p.pantalla,
          ruta: p.ruta,
          navegador,
          ventana,
          version: p.version ?? undefined,
          errores: errores.length ? errores : undefined,
          capturaPath,
          marcas: p.marcas.length ? p.marcas.map((m) => ({ n: m.n, descripcion: m.descripcion })) : undefined,
          pedidoId: p.respondiendo?.id,
        }),
      });
      const d = (await res.json().catch(() => null)) as { error?: string; reporte?: { numero: number; urgente: boolean }; ideasEn30Dias?: number } | null;
      if (!res.ok || !d?.reporte) {
        setError(d?.error ?? "No se pudo mandar. Vuelve a intentarlo.");
        return;
      }
      setEnviado({
        numero: d.reporte.numero,
        urgente: d.reporte.urgente,
        tipo,
        cuerpo,
        conCaptura: !!capturaPath,
        marcas: p.marcas.length,
        errores,
      });
      if (p.respondiendo) p.onRespondido(p.respondiendo.id);
      if (tipo === "mejora") p.onFestejar(d.ideasEn30Dias ?? 0);
      p.onEnviado();
    } catch {
      setError("No hay conexión. Revisa tu internet e inténtalo de nuevo.");
    } finally {
      setEnviando(false);
    }
  };

  if (enviado) {
    return (
      <Recibido
        enviado={enviado}
        ruta={p.ruta}
        onMisReportes={() => p.onPestana("mis")}
        onOtro={() => {
          setEnviado(null);
          setCuerpo("");
          setFrena("no");
          setTipo("mejora");
          p.onVolverACapturar();
        }}
      />
    );
  }

  return (
    <>
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 pb-5 pt-[18px]">
        {p.respondiendo && (
          <div className="space-y-0.5 rounded-[10px] border border-line bg-surface-muted px-3 py-2.5">
            <p className={ROTULO_DEL_SISTEMA}>Respondes a {p.respondiendo.deQuien}</p>
            <p className="text-[13px] text-fg">{p.respondiendo.pregunta}</p>
          </div>
        )}

        <div className="space-y-2">
          <p className={ROTULO_DEL_SISTEMA}>Qué tipo de feedback</p>
          <Segmentado
            etiqueta="Qué tipo de feedback"
            valor={tipo}
            onCambio={setTipo}
            opciones={TIPOS_DE_FEEDBACK.map((t) => ({ clave: t, etiqueta: TIPO[t].nombre }))}
          />
        </div>

        <label className="block space-y-1.5">
          <span className="block text-[13px] font-semibold text-fg">{def.etiqueta}</span>
          <textarea
            value={cuerpo}
            onChange={(e) => setCuerpo(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                void mandar();
              }
            }}
            placeholder={def.ejemplo}
            rows={5}
            autoFocus
            className="w-full resize-y rounded-lg border border-line bg-surface px-3 py-2.5 text-sm leading-[1.45] text-fg placeholder:text-fg-muted focus:border-brand focus:outline-none"
          />
          <span className="block text-xs text-fg-muted">Con tus palabras: no hace falta que sea técnico.</span>
        </label>

        {tipo === "falla" && (
          <div className="space-y-2">
            <p className="text-[13px] font-semibold text-fg">¿Te frena el trabajo?</p>
            <Segmentado
              etiqueta="¿Te frena el trabajo?"
              valor={frena}
              onCambio={setFrena}
              opciones={[
                { clave: "si", etiqueta: "Sí, no puedo seguir" },
                { clave: "no", etiqueta: "Puedo seguir" },
              ]}
            />
            {frena === "si" && <p className="text-xs text-warn-ink">Dirección recibe el aviso en el momento, sin esperar a revisar la bandeja.</p>}
          </div>
        )}

        <div className="space-y-2">
          <div className="flex items-baseline justify-between gap-2">
            <p className={ROTULO_DEL_SISTEMA}>La pantalla</p>
            <span className="text-[11px] text-fg-muted">
              {p.captura.estado === "lista"
                ? `Automática · ${p.captura.hora}${p.marcas.length ? ` · ${p.marcas.length} ${p.marcas.length === 1 ? "marca" : "marcas"}` : ""}`
                : p.captura.estado === "tomando"
                  ? "Capturando…"
                  : "Sin captura"}
            </span>
          </div>
          {p.captura.estado === "lista" && p.captura.url ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element -- es un blob local, no una imagen a optimizar */}
              <img src={p.captura.url} alt="Captura de la pantalla" className="h-[196px] w-full rounded-lg border border-line bg-surface object-cover object-top" />
              {p.marcas.map((m) => (
                <div key={m.n} className="flex items-center gap-2 rounded-lg border border-line px-2 py-1.5">
                  <MarcaNumerada n={m.n} />
                  <span className="min-w-0 flex-1 truncate text-[13px] text-fg-secondary">{m.descripcion}</span>
                  <button
                    type="button"
                    onClick={() => p.onQuitarMarca(m.n)}
                    aria-label={`Quitar la marca ${m.n}`}
                    className="flex p-0.5 text-fg-muted hover:text-fg"
                  >
                    <Trazo d={ICONO_CERRAR} className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
              <div className="flex flex-wrap items-center gap-1">
                <button
                  type="button"
                  onClick={p.onSenalar}
                  disabled={p.marcas.length >= 3}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-2.5 py-1.5 text-[13px] font-medium text-fg-secondary transition-colors hover:bg-surface-hover hover:text-fg disabled:opacity-50"
                >
                  <Trazo d={ICONO_SENALAR} className="h-3.5 w-3.5" />
                  {p.marcas.length ? "Señalar otra cosa" : "Señalar algo"}
                </button>
                <button type="button" onClick={p.onQuitarCaptura} className="rounded px-2 py-1.5 text-[13px] text-fg-muted hover:text-fg">
                  Quitar la captura
                </button>
              </div>
              <p className="text-xs text-fg-muted">La captura la ven solo tú y dirección. Si muestra algo delicado, quítala.</p>
            </>
          ) : p.captura.estado === "tomando" ? (
            <div className="skeleton-shimmer h-[196px] w-full rounded-lg border border-line" aria-hidden="true" />
          ) : (
            <div className="space-y-1.5 rounded-lg border border-dashed border-line bg-surface-muted p-3.5">
              <p className="text-[13px] text-fg-muted">
                {p.captura.estado === "fallo" ? "No se pudo capturar esta pantalla: se manda solo su dirección." : "Sin captura: se manda solo la dirección de la pantalla."}
              </p>
              <button type="button" onClick={p.onVolverACapturar} className="text-[13px] font-semibold text-brand hover:text-brand-light">
                Volver a capturar
              </button>
            </div>
          )}
        </div>

        <div className="space-y-2">
          <button
            type="button"
            onClick={() => setDetalles((d) => !d)}
            aria-expanded={detalles}
            className="flex items-center gap-1.5 text-left text-[13px] font-semibold text-fg-secondary hover:text-fg"
          >
            <Trazo d="M9 6l6 6-6 6" className={cn("h-3 w-3 transition-transform", detalles && "rotate-90")} />
            Va con tu reporte: pantalla, navegador y versión
          </button>
          {detalles && (
            <dl className="grid grid-cols-[116px_minmax(0,1fr)] gap-x-2.5 gap-y-1.5 rounded-lg border border-line bg-surface-muted px-3 py-2.5 text-xs">
              <dt className="text-fg-muted">Pantalla</dt>
              <dd className="break-words text-fg-secondary">{p.pantalla}</dd>
              <dt className="text-fg-muted">Dirección</dt>
              <dd className="break-all text-fg-secondary">{p.ruta}</dd>
              <dt className="text-fg-muted">Navegador</dt>
              <dd className="text-fg-secondary">
                {navegador} · ventana {ventana}
              </dd>
              <dt className="text-fg-muted">Versión de Nexus</dt>
              <dd className="text-fg-secondary">{p.version ?? "local"}</dd>
              <dt className="text-fg-muted">Errores de la pantalla</dt>
              <dd className={errores.length ? "break-words text-warn-ink" : "text-fg-secondary"}>
                {errores.length ? errores.map((e) => `«${e.mensaje}» (${e.hace})`).join(" · ") : "Ninguno"}
              </dd>
            </dl>
          )}
        </div>

        {error && <p className="rounded-lg border border-danger-line bg-danger-surface px-3 py-2 text-[13px] text-danger-ink">{error}</p>}
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-line px-4 py-3">
        <button type="button" onClick={() => p.onPestana("mis")} className="text-[13px] text-fg-muted hover:text-fg">
          Mis reportes{p.cuentaReportes !== null ? ` · ${p.cuentaReportes}` : ""}
        </button>
        <button
          type="button"
          onClick={() => void mandar()}
          disabled={vacio || enviando || p.captura.estado === "tomando"}
          title="Ctrl + Enter"
          className="rounded-lg bg-primary px-3.5 py-2 text-sm font-semibold text-primary-fg transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
        >
          {enviando ? "Mandando…" : def.boton}
        </button>
      </div>
    </>
  );
}

function Recibido({ enviado, ruta, onMisReportes, onOtro }: { enviado: Enviado; ruta: string; onMisReportes: () => void; onOtro: () => void }) {
  const urgente = enviado.urgente;
  const titulo = enviado.tipo === "mejora" ? "Recibida tu idea" : enviado.tipo === "duda" ? "Recibida tu duda" : "Recibido";
  const texto =
    enviado.tipo === "mejora"
      ? "Dirección la revisa. Las mejoras que más personas piden suben primero en la hoja de ruta."
      : enviado.tipo === "duda"
        ? "Te responden en «Mis reportes». Cuando contesten, te llega el aviso en «Para ti»."
        : "Dirección lo revisa y te contesta en «Mis reportes». Cuando cambie, te llega el aviso en «Para ti».";
  return (
    <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 pb-5 pt-[18px]">
      {urgente ? (
        <>
          <div className="space-y-2 rounded-xl border border-warn-line bg-warn-surface p-4">
            <p className="flex items-center gap-2 text-[15px] font-semibold text-warn-ink">
              <IconoDeTipo tipo="falla" className="h-[18px] w-[18px]" />
              Reportado como urgente
            </p>
            <p className="text-[13px] leading-[1.5] text-warn-ink">
              Dirección ya recibió el aviso: no espera a revisar la bandeja. Te contesta en «Mis reportes» apenas lo vea.
            </p>
          </div>
          <div className="flex items-center justify-between gap-3 rounded-xl border border-line p-3">
            <div className="min-w-0 space-y-0.5">
              <p className={ROTULO_DEL_SISTEMA}>Número de reporte</p>
              <p className="text-[13px] text-fg-secondary">Si un cliente está esperando, avisa directo y da este número.</p>
            </div>
            <span className="flex-shrink-0 text-lg font-bold tabular-nums text-fg">{numeroDeReporte(enviado.numero)}</span>
          </div>
          <div className="space-y-1.5 rounded-xl border border-line p-3">
            <p className={ROTULO_DEL_SISTEMA}>Ya quedó guardado</p>
            {[
              enviado.conCaptura
                ? `La captura de la pantalla${enviado.marcas ? `, con ${enviado.marcas} ${enviado.marcas === 1 ? "marca" : "marcas"}` : ""}`
                : "La dirección de la pantalla (sin captura)",
              `Dónde estabas: ${ruta}`,
              enviado.errores.length ? `El error que dio la pantalla: «${enviado.errores[enviado.errores.length - 1].mensaje}»` : null,
            ]
              .filter((x): x is string => !!x)
              .map((t) => (
                <p key={t} className="flex items-start gap-2 text-[13px] text-fg-secondary">
                  <span className="flex-shrink-0 font-bold text-success">✓</span>
                  <span className="min-w-0 break-words">{t}</span>
                </p>
              ))}
            <p className="text-xs text-fg-muted">No hace falta que lo vuelvas a reportar.</p>
          </div>
        </>
      ) : (
        <div className="space-y-1.5 rounded-xl border border-success-line bg-success-surface p-4">
          <p className="flex items-center gap-2 text-[15px] font-semibold text-success-ink">
            <Trazo d="M5 13l4 4L19 7" className="h-[18px] w-[18px]" />
            {titulo}
          </p>
          <p className="text-[13px] text-success-ink">{texto}</p>
        </div>
      )}
      <div className="space-y-1.5 rounded-xl border border-line p-3">
        <p className={ROTULO_DEL_SISTEMA}>Lo que mandaste</p>
        <p className="whitespace-pre-wrap break-words text-[13px] text-fg">{enviado.cuerpo}</p>
        <p className="text-xs text-fg-muted">
          {TIPO[enviado.tipo].nombre} · {numeroDeReporte(enviado.numero)} · {enviado.conCaptura ? "con captura" : "sin captura"}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-1">
        <button
          type="button"
          onClick={onMisReportes}
          className="rounded-lg border border-line bg-surface px-3 py-[7px] text-[13px] font-semibold text-fg-secondary transition-colors hover:bg-surface-hover hover:text-fg"
        >
          Ver mis reportes
        </button>
        <button type="button" onClick={onOtro} className="rounded px-2 py-[7px] text-[13px] text-fg-muted hover:text-fg">
          Dar otro feedback
        </button>
      </div>
    </div>
  );
}

// ── Mis reportes ──────────────────────────────────────────────────────────────

function MisReportes({ reportes, reporteId, onReporte }: { reportes: ReporteDeLista[] | null; reporteId: string | null; onReporte: (id: string | null) => void }) {
  if (reporteId) return <HiloDelReporte id={reporteId} onVolver={() => onReporte(null)} />;
  return (
    <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 pb-5 pt-[18px]">
      <div className="space-y-0.5">
        <p className={ROTULO_DEL_SISTEMA}>Tus reportes{reportes ? ` · ${reportes.length}` : ""}</p>
        <p className="text-xs text-fg-muted">Lo más reciente arriba. Te contestan acá mismo.</p>
      </div>
      {reportes === null ? (
        <div className="space-y-2" aria-hidden="true">
          {[0, 1, 2].map((i) => (
            <div key={i} className="skeleton-shimmer h-[86px] rounded-[10px] border border-line" />
          ))}
        </div>
      ) : reportes.length === 0 ? (
        <div className="rounded-[10px] border border-dashed border-line bg-surface-muted p-4 text-[13px] text-fg-muted">
          Todavía no mandaste nada. Lo que mandes desde «Dar feedback» aparece acá, con lo que te contesten.
        </div>
      ) : (
        <div className="space-y-2">
          {reportes.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => onReporte(r.id)}
              className="flex w-full flex-col gap-1.5 rounded-[10px] border border-line bg-surface p-3 text-left transition-colors hover:bg-surface-hover"
            >
              <span className="flex w-full items-center justify-between gap-2">
                <span className="inline-flex min-w-0 items-center gap-1.5 text-xs text-fg-muted">
                  <IconoDeTipo tipo={r.tipo} />
                  <span className="truncate">
                    {TIPO[r.tipo].nombre} · {r.pantalla} · {haceCuanto(r.creado)}
                  </span>
                </span>
                <ChipDeEstado estado={r.estado} />
              </span>
              <span className="line-clamp-2 text-[13px] font-semibold leading-[1.4] text-fg">{r.cuerpo}</span>
              {r.nuevo && (
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand">
                  <span className="h-1.5 w-1.5 rounded-full bg-brand" />
                  Hay algo nuevo
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function HiloDelReporte({ id, onVolver }: { id: string; onVolver: () => void }) {
  const [reporte, setReporte] = useState<ReporteDetalle | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);

  const cargar = useCallback(async () => {
    try {
      const r = await fetch(`/api/feedback/${id}`, { cache: "no-store" });
      const d = (await r.json().catch(() => null)) as { reporte?: ReporteDetalle; error?: string } | null;
      if (!r.ok || !d?.reporte) {
        setError(d?.error ?? "No se pudo abrir el reporte.");
        return;
      }
      setReporte(d.reporte);
    } catch {
      setError("No hay conexión.");
    }
  }, [id]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const responder = async () => {
    if (!texto.trim() || enviando) return;
    setEnviando(true);
    try {
      const r = await fetch(`/api/feedback/${id}/mensajes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cuerpo: texto }),
      });
      if (r.ok) {
        setTexto("");
        await cargar();
      } else {
        const d = (await r.json().catch(() => null)) as { error?: string } | null;
        setError(d?.error ?? "No se pudo mandar la respuesta.");
      }
    } finally {
      setEnviando(false);
    }
  };

  return (
    <>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 pb-5 pt-[18px]">
        <button type="button" onClick={onVolver} className="inline-flex items-center gap-1 text-[13px] font-semibold text-brand hover:text-brand-light">
          <Trazo d="M15 18l-6-6 6-6" className="h-3.5 w-3.5" />
          Mis reportes
        </button>
        {error && <p className="rounded-lg border border-danger-line bg-danger-surface px-3 py-2 text-[13px] text-danger-ink">{error}</p>}
        {!reporte && !error && (
          <div className="space-y-2" aria-hidden="true">
            <div className="skeleton-shimmer h-4 w-40 rounded" />
            <div className="skeleton-shimmer h-[120px] rounded-lg border border-line" />
          </div>
        )}
        {reporte && (
          <>
            <div className="space-y-2">
              <p className="inline-flex items-center gap-1.5 text-xs text-fg-muted">
                <IconoDeTipo tipo={reporte.tipo} />
                {reporte.escala ? reporte.escala.tipo : TIPO[reporte.tipo].nombre} · {reporte.pantalla} · {numeroDeReporte(reporte.numero)}
              </p>
              <p className="whitespace-pre-wrap break-words text-[15px] font-semibold leading-5 text-fg">{reporte.cuerpo}</p>
              {/* Lo comentado desde la escala (2026-10-05): sobre qué criterio, con su texto. */}
              {reporte.escala && (
                <div className="space-y-1 rounded-lg border border-line bg-surface-muted px-3 py-2">
                  <p className="text-xs text-fg-muted">
                    <span className="font-semibold tabular-nums text-fg-secondary">{reporte.escala.ancla}</span> ·{" "}
                    {reporte.escala.ruta ?? "ya no existe en la versión vigente"}
                  </p>
                  <p className="text-[13px] leading-snug text-fg-secondary">«{reporte.escala.textoAnclado}»</p>
                  <a href={reporte.ruta} className="text-xs font-semibold text-brand hover:text-brand-light">
                    Ver en la escala
                  </a>
                </div>
              )}
              <p className="flex flex-wrap items-center gap-2">
                <ChipDeEstado estado={reporte.estadoVisible} />
                {reporte.tema && <span className="text-xs text-fg-muted">En «{reporte.tema.titulo}»</span>}
              </p>
              {reporte.motivoCierre && <p className="text-xs text-fg-secondary">Motivo: {reporte.motivoCierre}</p>}
              {reporte.capturaUrl && (
                <a href={reporte.capturaUrl} target="_blank" rel="noreferrer" className="block w-40">
                  {/* eslint-disable-next-line @next/next/no-img-element -- enlace firmado de Storage */}
                  <img src={reporte.capturaUrl} alt="La captura que mandaste" className="h-20 w-40 rounded-md border border-line object-cover object-top" />
                </a>
              )}
            </div>
            <div className="space-y-3 border-t border-line pt-3.5">
              {reporte.mensajes.length === 0 ? (
                <p className="text-xs text-fg-muted">Todavía no hay respuestas. Te llega el aviso en «Para ti» cuando contesten.</p>
              ) : (
                <Hilo mensajes={reporte.mensajes} yoReporte haceCuanto={(iso) => haceCuanto(iso)} />
              )}
            </div>
          </>
        )}
      </div>
      {reporte && (
        <div className="space-y-2 border-t border-line px-4 py-3">
          <textarea
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            rows={2}
            placeholder="Escribe una respuesta…"
            aria-label="Responder"
            className="w-full resize-y rounded-lg border border-line bg-surface px-2.5 py-2 text-[13px] text-fg placeholder:text-fg-muted focus:border-brand focus:outline-none"
          />
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => void responder()}
              disabled={!texto.trim() || enviando}
              className="rounded-lg bg-primary px-3.5 py-[7px] text-[13px] font-semibold text-primary-fg transition-colors hover:bg-primary-hover disabled:opacity-50"
            >
              {enviando ? "Mandando…" : "Responder"}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
