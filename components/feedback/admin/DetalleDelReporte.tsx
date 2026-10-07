"use client";

/**
 * Lo que se ve de un reporte, igual en la Bandeja y en el panel de un tema de la hoja de ruta (2026-10-06): lo que
 * se leía en la escala, la captura con sus marcas, lo que se mandó con el reporte y la conversación. Las dos
 * pantallas usan estas mismas piezas, así un reporte se ve idéntico donde esté.
 */
import { useRef, useState } from "react";
import { ROTULO_DEL_SISTEMA } from "@/components/ui/sistema";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/cn";
import type { ReporteDetalle } from "@/lib/feedback/queries";
import { haceCuanto } from "@/lib/feedback/reglas";
import { EnlaceDeRuta, Hilo, MarcaNumerada } from "../piezas";

export async function postJson(url: string, body: unknown): Promise<{ ok: boolean; error?: string }> {
  try {
    const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const d = (await r.json().catch(() => null)) as { error?: string } | null;
    return r.ok ? { ok: true } : { ok: false, error: d?.error ?? "No se pudo guardar." };
  } catch {
    return { ok: false, error: "No hay conexión." };
  }
}

export function Captura({ detalle }: { detalle: ReporteDetalle | null }) {
  if (!detalle) return <div className="skeleton-shimmer h-[320px] rounded-xl border border-line" aria-hidden="true" />;
  if (!detalle.capturaUrl) {
    return (
      <div className="rounded-xl border border-dashed border-line bg-surface p-4 text-[13px] text-fg-muted">
        No mandó captura: queda solo la dirección de la pantalla.{" "}
        <EnlaceDeRuta ruta={detalle.ruta} className="font-semibold text-brand hover:text-brand-light">
          Ir a la pantalla
        </EnlaceDeRuta>
      </div>
    );
  }
  return (
    <figure className="overflow-hidden rounded-xl border border-line bg-surface">
      <a href={detalle.capturaUrl} target="_blank" rel="noreferrer" className="block border-b border-line">
        {/* eslint-disable-next-line @next/next/no-img-element -- enlace firmado de Storage */}
        <img src={detalle.capturaUrl} alt={`Captura de «${detalle.pantalla}»`} className="max-h-[420px] w-full object-cover object-top" />
      </a>
      <figcaption className="flex flex-wrap items-center gap-3 px-3.5 py-2.5 text-xs text-fg-muted">
        <span>
          Captura · {haceCuanto(detalle.creado)} · {detalle.pantalla}
        </span>
        {detalle.marcas.map((m) => (
          <span key={m.n} className="inline-flex items-center gap-1.5 text-fg-secondary">
            <MarcaNumerada n={m.n} className="h-4 w-4 text-[9px]" />
            {m.descripcion}
          </span>
        ))}
        <span className="flex-1" />
        <a href={detalle.capturaUrl} target="_blank" rel="noreferrer" className="font-semibold text-brand hover:text-brand-light">
          Abrir en tamaño real
        </a>
        <EnlaceDeRuta ruta={detalle.ruta} className="font-semibold text-brand hover:text-brand-light">
          Ir a la pantalla
        </EnlaceDeRuta>
      </figcaption>
    </figure>
  );
}

/**
 * Mandado desde la escala: qué criterio, lo que se leía al mandarlo y, si cambió, lo que dice hoy; con qué
 * versión, edición y perfil. Va arriba de la captura.
 */
export function LoQueSeLeia({ detalle }: { detalle: ReporteDetalle | null }) {
  if (!detalle) return <div className="skeleton-shimmer h-[180px] rounded-xl border border-line" aria-hidden="true" />;
  const e = detalle.escala;
  if (!e) return null;
  const cambio = e.textoDeHoy !== null && e.textoDeHoy !== e.textoAnclado;
  const hechos: { k: string; v: string }[] = [
    { k: "Versión de la escala", v: e.versionVigente && e.versionVigente !== e.version ? `${e.version} (hoy rige la ${e.versionVigente})` : e.version },
    { k: "Edición", v: e.edicion ?? "La escala general" },
    { k: "Perfil en la pantalla", v: e.perfil ?? "Sin filtrar" },
  ];
  return (
    <div className="space-y-2">
      <p className={ROTULO_DEL_SISTEMA}>Sobre la escala</p>
      <div className="space-y-3 rounded-xl border border-line bg-surface px-4 py-3.5">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-fg-muted">
          <span className="rounded-full border border-line bg-surface px-[7px] text-[11px] font-semibold tabular-nums leading-[18px] text-fg-secondary">{e.ancla}</span>
          {e.ruta ?? "Ya no existe en la versión vigente"}
          <span className="flex-1" />
          <EnlaceDeRuta ruta={detalle.ruta} className="font-semibold text-brand hover:text-brand-light">
            Ver en la escala
          </EnlaceDeRuta>
        </p>
        <p className="text-sm leading-relaxed text-fg">«{e.textoAnclado}»</p>
        {e.textoDeHoy === null ? (
          <p className="rounded-lg border border-warn-line bg-warn-surface px-3 py-2 text-xs text-warn-ink">Ese texto ya no existe en la versión vigente.</p>
        ) : (
          cambio && (
            <p className="rounded-lg border border-warn-line bg-warn-surface px-3 py-2 text-xs leading-relaxed text-warn-ink">
              <span className="font-semibold">Hoy dice: </span>
              {e.textoDeHoy}
            </p>
          )
        )}
        <dl className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-2.5 border-t border-line pt-3">
          {hechos.map((h) => (
            <div key={h.k} className="min-w-0 space-y-0.5">
              <dt className="text-xs text-fg-muted">{h.k}</dt>
              <dd className="break-words text-[13px] text-fg-secondary">{h.v}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}

export function LoQueSeMando({ detalle }: { detalle: ReporteDetalle | null }) {
  if (!detalle) return null;
  const hechos: { k: string; v: string; alerta?: boolean }[] = [
    { k: "Pantalla", v: detalle.pantalla },
    { k: "Dirección", v: detalle.ruta },
    { k: "Navegador", v: [detalle.navegador, detalle.ventana].filter(Boolean).join(" · ") || "Sin dato" },
    { k: "Versión de Nexus", v: detalle.version ?? "Sin dato" },
    {
      k: "Errores de la pantalla",
      v: detalle.errores.length ? detalle.errores.map((e) => `«${e.mensaje}» (${e.hace})`).join(" · ") : "Ninguno",
      alerta: detalle.errores.length > 0,
    },
    { k: "Marcas", v: detalle.marcas.length ? detalle.marcas.map((m) => `${m.n} · ${m.descripcion}`).join(" · ") : "Ninguna" },
  ];
  return (
    <div className="space-y-2">
      <p className={ROTULO_DEL_SISTEMA}>Lo que se mandó con el reporte</p>
      <dl className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-2.5 rounded-xl border border-line bg-surface px-4 py-3.5">
        {hechos.map((h) => (
          <div key={h.k} className="min-w-0 space-y-0.5">
            <dt className="text-xs text-fg-muted">{h.k}</dt>
            <dd className={cn("break-words text-[13px]", h.alerta ? "text-warn-ink" : "text-fg-secondary")}>{h.v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export function Conversacion({
  detalle,
  nombre,
  onEnviado,
  onResponderYCerrar,
}: {
  detalle: ReporteDetalle | null;
  nombre: string;
  onEnviado: () => Promise<void>;
  onResponderYCerrar: (texto: string) => Promise<boolean>;
}) {
  const toast = useToast();
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const campo = useRef<HTMLTextAreaElement>(null);
  if (!detalle) return null;
  const abierto = detalle.estado === "sin_revisar" || detalle.estado === "en_hoja";

  const responder = async () => {
    if (!texto.trim() || enviando) return;
    setEnviando(true);
    const r = await postJson(`/api/feedback/${detalle.id}/mensajes`, { cuerpo: texto });
    setEnviando(false);
    if (!r.ok) {
      toast.error(r.error ?? "No se pudo mandar.");
      return;
    }
    setTexto("");
    await onEnviado();
  };

  return (
    <div className="space-y-2.5" id="feedback-conversacion">
      <p className={ROTULO_DEL_SISTEMA}>Conversación</p>
      {detalle.mensajes.length === 0 ? (
        <p className="text-[13px] text-fg-muted">Todavía no le respondiste a {nombre}.</p>
      ) : (
        <div className="rounded-xl border border-line bg-surface p-4">
          <Hilo mensajes={detalle.mensajes} yoReporte={false} haceCuanto={(iso) => haceCuanto(iso)} />
        </div>
      )}
      <div className="space-y-2.5 rounded-xl border border-line bg-surface p-3">
        <textarea
          ref={campo}
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          rows={3}
          placeholder={`Responderle a ${nombre}… (por ejemplo, para pedirle más detalle)`}
          aria-label="Respuesta"
          className="w-full resize-y border-0 bg-transparent text-sm leading-[1.45] text-fg placeholder:text-fg-muted focus:outline-none"
        />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs text-fg-muted">Le llega como aviso en «Para ti».</span>
          <span className="flex items-center gap-1">
            {abierto && detalle.estado === "sin_revisar" && (
              <button
                type="button"
                disabled={!texto.trim() || enviando}
                onClick={async () => {
                  setEnviando(true);
                  const ok = await onResponderYCerrar(texto);
                  setEnviando(false);
                  if (ok) setTexto("");
                }}
                className="rounded px-2 py-[7px] text-[13px] text-fg-secondary hover:text-fg disabled:opacity-50"
              >
                Responder y cerrar
              </button>
            )}
            <button
              type="button"
              disabled={!texto.trim() || enviando}
              onClick={() => void responder()}
              className="rounded-lg border border-line bg-surface px-3 py-[7px] text-[13px] font-semibold text-fg-secondary transition-colors hover:bg-surface-hover hover:text-fg disabled:opacity-50"
            >
              Responder
            </button>
          </span>
        </div>
      </div>
    </div>
  );
}
