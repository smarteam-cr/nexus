"use client";

/**
 * components/versiones/HistorialDeVersiones.tsx — el popup «Historial de versiones», el mismo para todo documento
 * (Elías, 21 nov; DECISIONS «Historial de versiones»; diseño https://claude.ai/artifact/JJaPSprnzCnu9otYFJBp8i).
 *
 * A la izquierda las versiones por día, con cómo nacieron, quién y a qué hora, y las marcas «Actual» y «Lo que ve el
 * cliente». A la derecha la vista previa de la elegida, que arma cada documento (`vista`). Abajo «Usar esta versión»,
 * con su confirmación: vuelve como borrador y nunca publica.
 *
 * Cada documento le da: cómo listar (`cargar`), cómo verla (`vista`) y cómo usarla (`usar`; sin él, no se puede: falta
 * el permiso). Lo que el documento ya hacía (traer una sección) va dentro de su `vista`.
 */
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Button, Modal, Skeleton } from "@/components/ui";
import { Alert } from "@/components/ui/Alert";
import type { VersionDelHistorial } from "@/lib/versiones/historial";

export interface VersionParaElPopup extends VersionDelHistorial {
  quien: string | null;
}

export interface HistorialDeVersionesProps {
  open: boolean;
  onClose: () => void;
  /** «Resumen de La escala · Cafetalera Río Claro» */
  documento: string;
  cargar: () => Promise<VersionParaElPopup[]>;
  /** La vista previa de la elegida. `actual`: la que está en pantalla (para marcar lo distinto). */
  vista: (v: VersionParaElPopup, o: { actual: VersionParaElPopup | null; alCambiar: () => void }) => ReactNode;
  /** Usa la versión: null si salió bien, o el error. Sin esto no hay botón. */
  usar?: (id: string) => Promise<string | null>;
  /** Sin `usar`, por qué (default: falta el permiso). El cronograma, por ahora, solo se mira. */
  porQueNoSeUsa?: string;
  /** Después de usar una (o de traer una sección): el documento se vuelve a cargar. */
  alCambiar: () => void;
  /** Por qué no se puede usar ahora (Nexus lo está rehaciendo): el botón se apaga con este texto. */
  frenado?: string | null;
  /** Qué ve el cliente después de usarla: «hasta que alguien publique» o «hasta que alguien lo suba». */
  verboDePublicar?: string;
  /** El documento se comparte EN VIVO (el Requerimiento técnico): el cliente ve el cambio en cuanto se usa. */
  enVivo?: boolean;
}

const DIA = new Intl.DateTimeFormat("es-CR", { weekday: "long", day: "numeric", month: "short" });
const HORA = new Intl.DateTimeFormat("es-CR", { hour: "2-digit", minute: "2-digit", hour12: false });
const FECHA = new Intl.DateTimeFormat("es-CR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false });

function diaDe(iso: string | null, hoy = new Date()): string {
  if (!iso) return "Ahora";
  const d = new Date(iso);
  const mismoDia = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  if (mismoDia(d, hoy)) return "Hoy";
  const ayer = new Date(hoy);
  ayer.setDate(hoy.getDate() - 1);
  if (mismoDia(d, ayer)) return "Ayer";
  const t = DIA.format(d);
  return t.charAt(0).toUpperCase() + t.slice(1);
}

export function fechaDeLaVersion(v: Pick<VersionDelHistorial, "en">): string {
  return v.en ? FECHA.format(new Date(v.en)) : "ahora";
}

function Icono({ tipo }: { tipo: VersionDelHistorial["tipo"] }) {
  const comun = { width: 14, height: 14, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };
  if (tipo === "ia" || tipo === "nexus")
    return (
      <svg {...comun} strokeWidth={1.8}>
        <path d="M10 3l1.6 4.4L16 9l-4.4 1.6L10 15l-1.6-4.4L4 9l4.4-1.6z" />
        <path d="M18 13l.9 2.1L21 16l-2.1.9L18 19l-.9-2.1L15 16l2.1-.9z" />
      </svg>
    );
  if (tipo === "edicion")
    return (
      <svg {...comun}>
        <path d="M4 20h4L19 9l-4-4L4 16z" />
      </svg>
    );
  if (tipo === "publicado" || tipo === "presentado")
    return (
      <svg {...comun}>
        <path d="M12 16V4" />
        <path d="M7 9l5-5 5 5" />
        <path d="M5 20h14" />
      </svg>
    );
  if (tipo === "restaurado")
    return (
      <svg {...comun}>
        <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
        <path d="M3 3v5h5" />
      </svg>
    );
  if (tipo === "congelado")
    return (
      <svg {...comun}>
        <rect x="5" y="11" width="14" height="9" rx="2" />
        <path d="M8 11V8a4 4 0 0 1 8 0v3" />
      </svg>
    );
  return (
    <svg {...comun}>
      <circle cx="12" cy="12" r="8" />
    </svg>
  );
}

const COLOR_DEL_TIPO: Record<VersionDelHistorial["tipo"], string> = {
  ia: "text-brand",
  edicion: "text-fg-secondary",
  publicado: "text-success-ink",
  presentado: "text-success-ink",
  restaurado: "text-fg-secondary",
  congelado: "text-fg-secondary",
  guardada: "text-fg-muted",
  nexus: "text-brand",
};

export function MarcaActual() {
  return (
    <span className="inline-flex h-[22px] items-center gap-1.5 rounded-full bg-info-surface px-2.5 text-[11px] font-semibold text-info-ink">
      <span className="h-1.5 w-1.5 rounded-full bg-brand" aria-hidden />
      Actual
    </span>
  );
}

export function MarcaDelCliente() {
  return (
    <span className="inline-flex h-[22px] items-center gap-1.5 rounded-full bg-success-surface px-2.5 text-[11px] font-semibold text-success-ink">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
        <circle cx="12" cy="12" r="3" />
      </svg>
      Lo que ve el cliente
    </span>
  );
}

function clave(v: VersionDelHistorial): string {
  return v.id ?? "actual";
}

export default function HistorialDeVersiones(p: HistorialDeVersionesProps) {
  const { open, cargar } = p;
  const [versiones, setVersiones] = useState<VersionParaElPopup[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [elegida, setElegida] = useState<string | null>(null);
  const [confirmar, setConfirmar] = useState(false);
  const [usando, setUsando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  const aplicar = useCallback((vs: VersionParaElPopup[]) => {
    setVersiones(vs);
    setError(null);
    setElegida((e) => (e && vs.some((v) => clave(v) === e) ? e : vs[0] ? clave(vs[0]) : null));
  }, []);
  const fallo = (e: unknown) => setError(e instanceof Error ? e.message : "No se pudo cargar el historial.");

  /** Vuelve a pedir la lista (después de usar una versión o de traer una sección). */
  const traer = useCallback(async () => {
    try {
      aplicar(await cargar());
    } catch (e) {
      fallo(e);
    }
  }, [cargar, aplicar]);

  useEffect(() => {
    if (!open) return;
    let vivo = true;
    cargar()
      .then((vs) => vivo && aplicar(vs))
      .catch((e: unknown) => vivo && fallo(e));
    return () => {
      vivo = false;
    };
  }, [open, cargar, aplicar]);

  // Lo de la vez anterior (la pregunta abierta, el «Listo») no sobrevive a cerrar el popup.
  const cerrar = () => {
    setConfirmar(false);
    setAviso(null);
    p.onClose();
  };

  const actual = versiones?.find((v) => v.esActual) ?? null;
  const v = versiones?.find((x) => clave(x) === elegida) ?? null;
  const verbo = p.verboDePublicar ?? "alguien publique";

  const alCambiar = () => {
    p.alCambiar();
    void traer();
  };

  const usar = async () => {
    if (!v?.id || !p.usar) return;
    setUsando(true);
    const err = await p.usar(v.id);
    setUsando(false);
    setConfirmar(false);
    if (err) {
      setAviso(null);
      setError(err);
      return;
    }
    setError(null);
    setAviso(
      `Listo: volvió la del ${fechaDeLaVersion(v)}. ${p.enVivo ? "El cliente ya la ve: este documento se comparte en vivo." : v.esLoQueVeElCliente ? "Es la misma que ve el cliente." : `El cliente no la ve hasta que ${verbo}.`}`,
    );
    setElegida("actual");
    p.alCambiar();
    await traer();
  };

  // Agrupadas por día, en el orden en que llegan (la más nueva primero).
  const grupos: { dia: string; items: VersionParaElPopup[] }[] = [];
  for (const x of versiones ?? []) {
    const dia = diaDe(x.en);
    const g = grupos[grupos.length - 1];
    if (g && g.dia === dia) g.items.push(x);
    else grupos.push({ dia, items: [x] });
  }

  return (
    <Modal open={open} onClose={cerrar} size="pantalla" cuerpoSinRelleno>
      <div className="flex h-full min-h-0 flex-col">
        <div className="flex items-start justify-between gap-4 border-b border-line px-6 pb-3.5 pt-[18px]">
          <div className="flex flex-col gap-1">
            <h2 className="text-base font-semibold text-fg">Historial de versiones</h2>
            <p className="text-[13px] text-fg-muted">{p.documento}. Elige una para verla; nada cambia hasta que la uses.</p>
          </div>
          <button type="button" aria-label="Cerrar" onClick={cerrar} className="flex h-8 w-8 items-center justify-center rounded-[10px] text-fg-muted hover:bg-surface-hover">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col md:flex-row">
          {/* La lista */}
          <div className="flex max-h-[38vh] w-full flex-shrink-0 flex-col gap-3 overflow-y-auto border-b border-line bg-surface-muted px-3 pb-4 pt-3.5 md:max-h-none md:w-[372px] md:border-b-0 md:border-r">
            {!versiones && !error && (
              <div className="flex flex-col gap-2 px-2">
                <Skeleton className="h-3 w-12" />
                <Skeleton className="h-[72px] w-full" rounded="lg" />
                <Skeleton className="h-[72px] w-full" rounded="lg" />
                <Skeleton className="h-[72px] w-full" rounded="lg" />
              </div>
            )}
            {grupos.map((g) => (
              <div key={g.dia} className="flex flex-col gap-1.5">
                <div className="px-2 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-fg-muted">{g.dia}</div>
                {g.items.map((x) => {
                  const sel = clave(x) === elegida;
                  return (
                    <button
                      key={clave(x)}
                      type="button"
                      onClick={() => {
                        setElegida(clave(x));
                        setConfirmar(false);
                      }}
                      aria-pressed={sel}
                      className={
                        "flex w-full flex-col gap-1 rounded-xl border px-3 py-2.5 text-left transition-colors " +
                        (sel ? "border-info-line bg-surface ring-[3px] ring-brand/25" : "border-transparent hover:bg-surface-hover")
                      }
                    >
                      <span className="flex items-center justify-between gap-2">
                        <span className={`flex items-center gap-1.5 text-[13px] font-semibold ${COLOR_DEL_TIPO[x.tipo]}`}>
                          <Icono tipo={x.tipo} />
                          {x.etiqueta}
                        </span>
                        {x.en && <span className="text-xs text-fg-muted">{HORA.format(new Date(x.en))}</span>}
                      </span>
                      {x.quien && <span className="text-xs text-fg-secondary">{x.quien}</span>}
                      {x.nota && <span className="text-xs leading-[17px] text-fg-muted">{x.nota}</span>}
                      {(x.esActual || x.esLoQueVeElCliente || x.soloLectura) && (
                        <span className="flex flex-wrap gap-1.5 pt-0.5">
                          {x.esActual && <MarcaActual />}
                          {x.esLoQueVeElCliente && <MarcaDelCliente />}
                          {x.soloLectura && (
                            <span className="inline-flex h-[22px] items-center rounded-full bg-surface-hover px-2.5 text-[11px] font-semibold text-fg-secondary">Solo para leer</span>
                          )}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            ))}
            {versiones && (
              <p className="px-2 pt-1 text-xs leading-[17px] text-fg-muted">
                Se guardan las últimas 30. Las que vio el cliente no se borran nunca. Lo escrito a mano se guarda como versión cuando algo lo va a reemplazar.
              </p>
            )}
          </div>

          {/* La vista previa */}
          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            {v && (
              <div className="flex flex-col gap-1.5 border-b border-line px-6 pb-3 pt-3.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-fg-muted">Vista previa</span>
                  <span className="text-[13px] font-semibold text-fg">
                    {v.en ? fechaDeLaVersion(v) : "Ahora"} · {v.etiqueta}
                    {v.quien ? ` · ${v.quien}` : ""}
                  </span>
                  {v.esActual && <MarcaActual />}
                  {v.esLoQueVeElCliente && <MarcaDelCliente />}
                </div>
              </div>
            )}
            <div className="min-h-0 flex-1 overflow-y-auto bg-surface px-6 py-5">
              {error && (
                <Alert variant="danger" title="No se pudo">
                  {error}
                </Alert>
              )}
              {aviso && (
                <Alert variant="success" title="Versión en uso">
                  {aviso}
                </Alert>
              )}
              {v && <div className={error || aviso ? "mt-4" : ""}>{p.vista(v, { actual, alCambiar })}</div>}
            </div>

            {v && (
              <div className="flex flex-wrap items-center justify-between gap-4 border-t border-line bg-surface px-6 py-3.5">
                {v.esActual ? (
                  <>
                    <p className="text-xs text-fg-muted">Esta es la versión que tienes en pantalla.</p>
                    <Button variant="secondary" onClick={cerrar}>
                      Cerrar
                    </Button>
                  </>
                ) : v.soloLectura || !v.id ? (
                  <>
                    <p className="text-xs text-fg-muted">Esta es solo para leer: no se puede volver a ella.</p>
                    <Button variant="secondary" onClick={cerrar}>
                      Cerrar
                    </Button>
                  </>
                ) : confirmar ? (
                  <>
                    <p className="max-w-[560px] text-[13px] leading-[18px] text-fg">
                      ¿Usar la del <b>{fechaDeLaVersion(v)}</b>? La actual queda guardada en el historial.{" "}
                      {p.enVivo ? <b>Este documento se comparte en vivo: el cliente lo ve en cuanto la uses.</b> : `El cliente no ve el cambio hasta que ${verbo}.`}
                    </p>
                    <div className="flex gap-2">
                      <Button variant="secondary" onClick={() => setConfirmar(false)} disabled={usando}>
                        Cancelar
                      </Button>
                      <Button variant="primary" onClick={() => void usar()} loading={usando} disabled={!!p.frenado}>
                        Sí, usar esta versión
                      </Button>
                    </div>
                  </>
                ) : (
                  <>
                    <p className="max-w-[440px] text-xs leading-[17px] text-fg-muted">
                      {p.frenado ??
                        (!p.usar
                          ? (p.porQueNoSeUsa ?? "No tienes permiso para cambiar este documento.")
                          : p.enVivo
                            ? "Este documento se comparte en vivo: el cliente ve la versión que uses en cuanto la uses. La actual queda guardada aquí."
                            : `Vuelve como borrador. El cliente sigue viendo «Lo que ve el cliente» hasta que ${verbo}. La actual queda guardada aquí.`)}
                    </p>
                    <div className="flex gap-2">
                      <Button variant="secondary" onClick={cerrar}>
                        Cerrar
                      </Button>
                      {p.usar && (
                        <Button variant="primary" onClick={() => setConfirmar(true)} disabled={!!p.frenado}>
                          Usar esta versión
                        </Button>
                      )}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}

/** El botón que abre el historial, el mismo en todo documento. */
export function BotonDelHistorial({ onClick, disabled, title }: { onClick: () => void; disabled?: boolean; title?: string }) {
  return (
    <Button size="sm" variant="secondary" onClick={onClick} disabled={disabled} title={title}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
        <path d="M3 3v5h5" />
        <path d="M12 7v5l3 2" />
      </svg>
      Historial
    </Button>
  );
}
