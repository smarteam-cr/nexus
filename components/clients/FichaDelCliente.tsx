"use client";

/**
 * components/clients/FichaDelCliente.tsx — la ficha del cliente (lib/clients/ficha.ts).
 *
 * Un formulario, no un canvas: cada campo es un texto con formato mínimo («- » viñetas,
 * **negrita**) que el CSE edita, y un solo botón que CONFIRMA y escribe en HubSpot. Si la IA dejó
 * una propuesta, aparece debajo de cada campo que cambiaría, con «Usar» y «Descartar»: la IA
 * propone, el CSE confirma — nada llega a HubSpot sin ese botón.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CAMPOS_DE_LA_FICHA,
  GRUPOS_DE_FICHA,
  OPCIONES_DE_APERTURA,
  camposQueCambiaron,
  etiquetaDeApertura,
  valoresVacios,
  type CampoDeFicha,
  type ClaveDeFicha,
  type FichaGuardada,
  type ValoresDeFicha,
} from "@/lib/clients/ficha";

interface Respuesta {
  ficha: FichaGuardada;
  hubspotUrl: string | null;
  sinCambios?: boolean;
  error?: string;
}

function fecha(iso: string | null | undefined): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("es-CR", { day: "numeric", month: "short", year: "numeric" });
}

export default function FichaDelCliente({ clientId }: { clientId: string }) {
  const [ficha, setFicha] = useState<FichaGuardada | null>(null);
  const [hubspotUrl, setHubspotUrl] = useState<string | null>(null);
  const [borrador, setBorrador] = useState<ValoresDeFicha>(valoresVacios());
  const [descartadas, setDescartadas] = useState<Set<ClaveDeFicha>>(new Set());
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const aplicar = useCallback((r: Respuesta) => {
    setFicha(r.ficha);
    setHubspotUrl(r.hubspotUrl);
    setBorrador(r.ficha.valores);
    setDescartadas(new Set());
  }, []);

  useEffect(() => {
    let vivo = true;
    fetch(`/api/clients/${clientId}/ficha`)
      .then(async (r) => ({ ok: r.ok, j: (await r.json().catch(() => ({}))) as Respuesta }))
      .then(({ ok, j }) => {
        if (!vivo) return;
        if (!ok) setError(j.error ?? "No se pudo cargar la ficha.");
        else aplicar(j);
      })
      .catch(() => vivo && setError("No se pudo cargar la ficha."))
      .finally(() => vivo && setCargando(false));
    return () => {
      vivo = false;
    };
  }, [clientId, aplicar]);

  const cambios = useMemo(() => (ficha ? camposQueCambiaron(ficha.valores, borrador) : []), [ficha, borrador]);

  /** Lo que la IA propone y todavía difiere de lo que hay en pantalla. */
  const propuestas = useMemo(() => {
    const p = ficha?.propuesta?.valores ?? {};
    return CAMPOS_DE_LA_FICHA.filter((c) => {
      const v = p[c.clave];
      return typeof v === "string" && v.trim() && v.trim() !== borrador[c.clave].trim() && !descartadas.has(c.clave);
    }).map((c) => c.clave);
  }, [ficha, borrador, descartadas]);

  const hubspotPendiente = !!ficha?.confirmadaAt && ficha.hubspot?.estado !== "sincronizada" && ficha.hubspot?.estado !== "sin_empresa";

  async function enviar(body: object) {
    setGuardando(true);
    setError(null);
    setAviso(null);
    try {
      const r = await fetch(`/api/clients/${clientId}/ficha`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = (await r.json().catch(() => ({}))) as Respuesta;
      if (!r.ok) {
        setError(j.error ?? "No se pudo guardar la ficha.");
        return;
      }
      aplicar(j);
      if (j.sinCambios) setAviso("No había cambios: la ficha ya estaba al día.");
    } catch {
      setError("No se pudo guardar la ficha. Revisa tu conexión y vuelve a intentar.");
    } finally {
      setGuardando(false);
    }
  }

  if (cargando) return <div className="h-40 rounded-xl border border-line" />;
  if (!ficha) return <p className="text-sm text-danger-ink">{error ?? "No se pudo cargar la ficha."}</p>;

  const set = (clave: ClaveDeFicha, valor: string) => setBorrador((b) => ({ ...b, [clave]: valor }));
  const usarTodas = () =>
    setBorrador((b) => {
      const n = { ...b };
      for (const k of propuestas) n[k] = ficha.propuesta!.valores[k]!;
      return n;
    });

  return (
    <div className="space-y-5 pb-24">
      <EstadoDeLaFicha ficha={ficha} hubspotUrl={hubspotUrl} />
      <p className="text-xs text-fg-muted -mt-2">
        En los textos, «- » al inicio de la línea arma viñetas y **así** queda en negrita: en HubSpot se ve con formato.
      </p>

      {propuestas.length > 0 && ficha.propuesta && (
        <div className="rounded-xl border border-info-line bg-info-surface px-4 py-3 flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <p className="text-sm font-medium text-info-ink">
              {ficha.propuesta.origen || "La IA"} propone cambios en {propuestas.length}{" "}
              {propuestas.length === 1 ? "campo" : "campos"}
            </p>
            <p className="text-xs text-fg-muted mt-0.5">
              Revísalos abajo. Nada llega a HubSpot hasta que confirmes la ficha.
              {ficha.propuesta.fuentes.length > 0 && ` Fuentes: ${ficha.propuesta.fuentes.join(" · ")}.`}
            </p>
          </div>
          <div className="flex gap-2 flex-shrink-0">
            <button
              type="button"
              onClick={usarTodas}
              className="text-xs font-medium px-3 py-1.5 rounded-lg border border-brand/30 bg-brand/15 text-brand hover:bg-brand/25 transition-colors"
            >
              Usar todas
            </button>
            <button
              type="button"
              disabled={guardando}
              onClick={() => void enviar({ descartarPropuesta: true })}
              className="text-xs px-3 py-1.5 rounded-lg border border-line text-fg-muted hover:text-fg transition-colors"
            >
              Descartar la propuesta
            </button>
          </div>
        </div>
      )}

      {GRUPOS_DE_FICHA.map((g) => (
        <section key={g.clave} className="rounded-xl border border-line bg-surface p-5 space-y-5">
          <header>
            <h3 className="text-sm font-semibold text-fg flex items-center gap-2">
              {g.titulo}
              {g.clave === "interno" && (
                <span className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded-full border border-warn-line bg-warn-surface text-warn-ink">
                  Solo el equipo
                </span>
              )}
            </h3>
            <p className="text-xs text-fg-muted mt-0.5">{g.bajada}</p>
          </header>
          {CAMPOS_DE_LA_FICHA.filter((c) => c.grupo === g.clave).map((c) => (
            <Campo
              key={c.clave}
              campo={c}
              valor={borrador[c.clave]}
              cambiado={cambios.includes(c.clave)}
              propuesta={propuestas.includes(c.clave) ? ficha.propuesta!.valores[c.clave]! : null}
              onChange={(v) => set(c.clave, v)}
              onUsar={() => set(c.clave, ficha.propuesta!.valores[c.clave]!)}
              onDescartar={() => setDescartadas((d) => new Set(d).add(c.clave))}
            />
          ))}
        </section>
      ))}

      {/* La barra de confirmar: fija abajo para que el botón esté siempre a mano en una ficha larga. */}
      <div className="sticky bottom-0 -mx-1 px-1">
        <div className="rounded-xl border border-line bg-surface shadow-lg px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
          <p className="text-xs text-fg-muted min-w-0">
            {error ? (
              <span className="text-danger-ink">{error}</span>
            ) : aviso ? (
              aviso
            ) : cambios.length ? (
              `${cambios.length} ${cambios.length === 1 ? "campo cambiado" : "campos cambiados"} sin confirmar.`
            ) : hubspotPendiente ? (
              "La ficha está confirmada pero no quedó en HubSpot. Confirma de nuevo para reintentar."
            ) : propuestas.length ? (
              "Hay una propuesta de la IA por revisar: usa o descarta cada campo."
            ) : ficha.confirmadaAt ? (
              "Todo confirmado."
            ) : (
              "Completa lo que sepas y confirma: se guarda en Nexus y en la empresa de HubSpot."
            )}
          </p>
          <div className="flex gap-2 flex-shrink-0">
            {cambios.length > 0 && (
              <button
                type="button"
                disabled={guardando}
                onClick={() => setBorrador(ficha.valores)}
                className="text-xs px-3 py-2 rounded-lg border border-line text-fg-muted hover:text-fg transition-colors"
              >
                Deshacer cambios
              </button>
            )}
            <button
              type="button"
              disabled={guardando || (!cambios.length && !hubspotPendiente && !!ficha.confirmadaAt)}
              onClick={() => void enviar({ valores: borrador })}
              className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-primary-fg hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {guardando ? "Guardando…" : hubspotPendiente && !cambios.length ? "Reintentar en HubSpot" : "Confirmar y guardar en HubSpot"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function EstadoDeLaFicha({ ficha, hubspotUrl }: { ficha: FichaGuardada; hubspotUrl: string | null }) {
  const h = ficha.hubspot;
  let tono = "border-line bg-surface-muted text-fg-muted";
  let texto = "Todavía sin confirmar. La completa la IA al generar el diagnóstico, o tú a mano.";
  if (ficha.confirmadaAt) {
    const quien = `Confirmada por ${ficha.confirmadaPor ?? "el equipo"} el ${fecha(ficha.confirmadaAt)}.`;
    if (h?.estado === "sincronizada") {
      tono = "border-success-line bg-success-surface text-success-ink";
      texto = `${quien} Guardada en la empresa de HubSpot.`;
    } else if (h?.estado === "sin_empresa") {
      texto = `${quien} Queda solo en Nexus: el cliente no tiene empresa vinculada en HubSpot.`;
    } else {
      tono = "border-danger-line bg-danger-surface text-danger-ink";
      texto = `${quien} ${h?.error ?? "No quedó en HubSpot."}`;
    }
  }
  return (
    <div className={`rounded-xl border px-4 py-2.5 text-xs flex items-center justify-between gap-3 flex-wrap ${tono}`}>
      <span className="min-w-0">{texto}</span>
      {hubspotUrl && (
        <a href={hubspotUrl} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 flex-shrink-0">
          Abrir la empresa en HubSpot
        </a>
      )}
    </div>
  );
}

function Campo({
  campo,
  valor,
  cambiado,
  propuesta,
  onChange,
  onUsar,
  onDescartar,
}: {
  campo: CampoDeFicha;
  valor: string;
  cambiado: boolean;
  propuesta: string | null;
  onChange: (v: string) => void;
  onUsar: () => void;
  onDescartar: () => void;
}) {
  const destino =
    campo.destino.tipo === "nota" ? "Va en la nota de HubSpot" : "Propiedad de la empresa en HubSpot";
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={`ficha-${campo.clave}`} className="text-sm font-medium text-fg">
          {campo.etiqueta}
          {cambiado && <span className="ml-2 text-[10px] font-semibold uppercase tracking-wider text-brand">Cambiado</span>}
        </label>
        <span className="text-[10px] text-fg-muted flex-shrink-0">{destino}</span>
      </div>
      <p className="text-xs text-fg-muted">{campo.ayuda}</p>
      {campo.destino.tipo === "lista" ? (
        <select
          id={`ficha-${campo.clave}`}
          value={valor}
          onChange={(e) => onChange(e.target.value)}
          className="w-full max-w-xs rounded-lg border border-line bg-surface px-3 py-2 text-sm text-fg focus:outline-none focus:border-brand"
        >
          <option value="">Elige una opción</option>
          {OPCIONES_DE_APERTURA.map((o) => (
            <option key={o.valor} value={o.valor}>
              {o.etiqueta}
            </option>
          ))}
        </select>
      ) : (
        <AreaDeTexto id={`ficha-${campo.clave}`} valor={valor} onChange={onChange} />
      )}
      {propuesta !== null && (
        <div className="rounded-lg border border-info-line bg-info-surface px-3 py-2 space-y-2">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-info-ink">Propuesta de la IA</p>
          <p className="text-sm text-fg whitespace-pre-wrap">
            {campo.destino.tipo === "lista" ? etiquetaDeApertura(propuesta) : propuesta}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onUsar}
              className="text-xs font-medium px-2.5 py-1 rounded-md border border-brand/30 bg-brand/15 text-brand hover:bg-brand/25 transition-colors"
            >
              Usar
            </button>
            <button
              type="button"
              onClick={onDescartar}
              className="text-xs px-2.5 py-1 rounded-md border border-line text-fg-muted hover:text-fg transition-colors"
            >
              Descartar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Crece con el contenido: una ficha con 10 campos no puede tener 10 barras de scroll. */
function AreaDeTexto({ id, valor, onChange }: { id: string; valor: string; onChange: (v: string) => void }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    // + el borde: scrollHeight no lo cuenta y, sin él, cada campo muestra una barra de 2 px.
    const borde = el.offsetHeight - el.clientHeight;
    el.style.height = `${Math.max(el.scrollHeight + borde, 64)}px`;
  }, [valor]);
  return (
    <textarea
      id={id}
      ref={ref}
      value={valor}
      onChange={(e) => onChange(e.target.value)}
      rows={2}
      className="w-full resize-none rounded-lg border border-line bg-surface px-3 py-2 text-sm text-fg leading-relaxed focus:outline-none focus:border-brand"
    />
  );
}
