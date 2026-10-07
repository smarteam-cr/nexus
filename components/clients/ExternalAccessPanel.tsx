"use client";

/**
 * ExternalAccessButton — el botón «Acceso» de la barra del documento y su pop-up: quién del cliente
 * puede entrar al proyecto y a qué.
 *
 * Todas las partes —kickoff, cronograma, requerimiento técnico, entrega, diagnóstico, planificación—
 * comparten el MISMO acceso (D.1.5): mismo token, misma contraseña, mismo verify; lo único que
 * cambia es a dónde aterriza quien entra (`?next=`). Qué está disponible lo decide la publicación de
 * cada una por separado. La lista sale de `lib/projects/publish-surfaces.ts`.
 *
 * ── EL REDISEÑO (2026-10-05, «Clientes · rediseño», tablero 9) ──────────────
 * El pop-up repetía seis veces el mismo link y el mismo aviso, con verdes, ámbar y naranja
 * compitiendo y el token crudo a la vista. Ahora:
 *   · «Para entrar»: el link UNA vez y la contraseña al lado. El botón azul copia un mensaje para el
 *     cliente con el link y lo publicado, SIN la contraseña (va por otro canal: lib/external/mensaje-de-acceso.ts).
 *   · «Lo que ve el cliente»: una fila por parte, con desde cuándo está publicada y, si todavía no
 *     se puede publicar, el porqué antes del clic (lib/projects/motivos-para-no-publicar.ts).
 *   · Abajo y discreto: quién lo generó, el último uso, «Cambiar link y contraseña» y «Revocar
 *     acceso» (los dos piden confirmación). El token, plegado en «Detalles técnicos».
 *
 * La contraseña se guarda en plano (accessPassword) además del hash: el CSE la ve, la copia, escribe
 * una propia o genera otra. Endpoints (app/api/projects/[projectId]/external-access/route.ts):
 *   - PATCH  → cambia SOLO la contraseña (mismo token / mismos links).
 *   - POST   → link y contraseña nuevos (caso «se filtró el link»).
 *   - DELETE → revoca el acceso.
 */
import { useState, useEffect, useCallback, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useToast } from "@/components/ui/Toast";
import { mostrarPreguntaDeTiempo } from "@/components/tiempos/PreguntasFlotantes";
import type { PreguntaParaResponder } from "@/lib/tiempos/tipos";
import { BOTON_DE_HERRAMIENTA, BotonBlanco, BotonTexto, ROTULO_DEL_SISTEMA } from "@/components/ui/sistema";
import { cn } from "@/lib/cn";
import { LARGO_MAXIMO_CONTRASENA, LARGO_MINIMO_CONTRASENA } from "@/lib/external/politica-de-contrasena";
import { linkDeLaParte, mensajeParaElCliente } from "@/lib/external/mensaje-de-acceso";
import { PUBLISH_SURFACES, publishSurface, type PublishSurfaceKey } from "@/lib/projects/publish-surfaces";

interface EstadoDeLaParte {
  /** Desde cuándo está publicada (ISO); null = sin publicar. */
  publicadaEl: string | null;
  /** Por qué todavía no se puede publicar; null = se puede (o ya está publicada). */
  motivo: string | null;
}

interface AccessState {
  exists: boolean;
  proyecto?: string;
  cliente?: string;
  accessToken?: string;
  accessPassword?: string | null;
  url?: string;
  enabledAt?: string;
  revokedAt?: string | null;
  lastUsedAt?: string | null;
  createdBy?: { name: string; email: string } | null;
  partes?: Partial<Record<PublishSurfaceKey, EstadoDeLaParte>>;
  /**
   * ¿A este proyecto se le puede publicar contenido a un cliente? Hoy solo lo apaga estar marcado
   * como INTERNO en HubSpot. Ausente = sí (respuesta vieja cacheada). El gate de verdad está en el
   * servidor (`guardPublicacionDeProyecto`, 409): esto deshabilita el control CON el motivo.
   */
  publicable?: boolean;
  motivoNoPublicable?: string | null;
}

/**
 * Las partes que este acceso destraba. El alias se conserva porque lo importan otros componentes;
 * la LISTA vive en `lib/projects/publish-surfaces.ts`.
 */
export type ExternalSurface = PublishSurfaceKey;

// Alphabet sin caracteres ambiguos (igual que el server) para la sugerencia del lado del cliente.
// El server re-valida y hashea: esto es solo una propuesta.
const PW_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
function suggestPassword(len = 12): string {
  const arr = new Uint32Array(len);
  crypto.getRandomValues(arr);
  let out = "";
  for (let i = 0; i < len; i++) out += PW_ALPHABET[arr[i] % PW_ALPHABET.length];
  return out;
}

/** «5 oct, 13:46» en la hora de Costa Rica (Intl mete espacios finos distintos en Node y Chrome). */
function fechaYHora(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  const fecha = d.toLocaleDateString("es-CR", { day: "numeric", month: "short", timeZone: "America/Costa_Rica" });
  const hora = d.toLocaleTimeString("es-CR", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "America/Costa_Rica" });
  return `${fecha}, ${hora}`.replace(/[  ]/g, " ").replace(/\./g, "");
}
function fechaCorta(iso: string): string {
  return new Date(iso)
    .toLocaleDateString("es-CR", { day: "numeric", month: "short", timeZone: "America/Costa_Rica" })
    .replace(/[  ]/g, " ")
    .replace(/\./g, "");
}

export function ExternalAccessButton({ projectId }: { projectId: string }) {
  const [state, setState] = useState<AccessState | null>(null);
  const [open, setOpen] = useState(false);
  const [working, setWorking] = useState(false);
  const [confirming, setConfirming] = useState<"regenerate" | "revoke" | null>(null);
  const toast = useToast();

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}/external-access`);
      if (!res.ok) {
        setState({ exists: false });
        return;
      }
      setState(await res.json());
    } catch {
      setState({ exists: false });
    }
  }, [projectId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // ── Acciones ──────────────────────────────────────────────────────────────

  // POST: generar, o cambiar link y contraseña (token + contraseña nuevos).
  const generateAll = async () => {
    setWorking(true);
    setConfirming(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/external-access`, { method: "POST" });
      if (!res.ok) {
        toast.error("No se pudo generar el acceso.");
        return;
      }
      await refresh();
      toast.success("Listo: link y contraseña nuevos. Puedes cambiar la contraseña antes de mandarla.");
    } finally {
      setWorking(false);
    }
  };

  // PATCH: cambiar SOLO la contraseña. Devuelve el mensaje de error o null.
  const savePassword = async (password: string): Promise<string | null> => {
    const res = await fetch(`/api/projects/${projectId}/external-access`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      return d?.error ?? "No se pudo guardar la contraseña.";
    }
    await refresh();
    return null;
  };

  const revoke = async () => {
    setWorking(true);
    setConfirming(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/external-access`, { method: "DELETE" });
      if (!res.ok) {
        toast.error("No se pudo revocar el acceso.");
        return;
      }
      await refresh();
    } finally {
      setWorking(false);
    }
  };

  // Publicar / ocultar una parte. El cronograma se muestra COMPLETO al publicar: se confirma el
  // detalle de paso (best-effort; 404 si todavía no hay cronograma).
  const togglePublish = async (kind: ExternalSurface, publish: boolean) => {
    const endpoint = publishSurface(kind).endpoint;
    try {
      const res = await fetch(`/api/projects/${projectId}/${endpoint}`, { method: publish ? "POST" : "DELETE" });
      if (!res.ok) {
        // El motivo del servidor gana («todavía no tiene el documento de Entrega»…); la frase genérica es el respaldo.
        const motivo = await res
          .json()
          .then((b: { message?: string; error?: string } | null) => b?.message || null)
          .catch(() => null);
        toast.error(motivo || "No se pudo cambiar la publicación.");
        return;
      }
      if (kind === "cronograma" && publish) {
        await fetch(`/api/projects/${projectId}/timeline/confirm-detail`, { method: "POST" }).catch(() => {});
      }
      // «¿Cuánto tiempo le dedicaste?» la primera vez que se publica un documento (2026-10-05, lib/tiempos).
      if (publish) {
        const cuerpo = (await res.json().catch(() => null)) as { preguntaDeTiempo?: PreguntaParaResponder | null } | null;
        mostrarPreguntaDeTiempo(cuerpo?.preguntaDeTiempo);
      }
      await refresh();
    } catch {
      toast.error("Error de conexión.");
    }
  };

  const closeModal = () => {
    setOpen(false);
    setConfirming(null);
  };

  if (!state) {
    return (
      <button disabled className={`${BOTON_DE_HERRAMIENTA} opacity-50`}>
        Acceso
      </button>
    );
  }

  const isRevoked = state.exists && !!state.revokedAt;
  const isActive = state.exists && !state.revokedAt;

  /* «Acceso», con el estado en un punto (pedido de Elías, 2026-10-04): verde activo, ámbar revocado,
     sin punto si todavía no se generó. El detalle lo dice el `title` y el pop-up. */
  const punto = isActive ? "bg-success-ink" : isRevoked ? "bg-warn-ink" : null;
  const estado = isActive ? "activo" : isRevoked ? "revocado" : "sin generar";

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={BOTON_DE_HERRAMIENTA}
        title={`Acceso del cliente: ${estado}. Quién del cliente puede abrir el proyecto y qué ve`}
      >
        {punto ? (
          <span className={`h-2 w-2 flex-shrink-0 rounded-full ${punto}`} aria-hidden="true" />
        ) : (
          <IconoCandado className="h-[15px] w-[15px]" />
        )}
        Acceso
      </button>

      {open && (
        <Ventana onClose={closeModal}>
          <Cabecera estado={isActive ? "activo" : isRevoked ? "revocado" : "sin-generar"} state={state} onClose={closeModal} />
          {!state.exists ? (
            <SinAcceso state={state} working={working} onGenerate={generateAll} />
          ) : isRevoked ? (
            <Revocado state={state} working={working} onGenerate={generateAll} />
          ) : (
            <>
              <Activo state={state} onSavePassword={savePassword} onTogglePublish={togglePublish} />
              <Pie
                state={state}
                confirming={confirming}
                working={working}
                onAskRegenerate={() => setConfirming("regenerate")}
                onAskRevoke={() => setConfirming("revoke")}
                onCancel={() => setConfirming(null)}
                onConfirmRegenerate={generateAll}
                onConfirmRevoke={revoke}
              />
            </>
          )}
        </Ventana>
      )}
    </>
  );
}

// ── La ventana ───────────────────────────────────────────────────────────────

function Ventana({ onClose, children }: { onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const alTeclear = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", alTeclear);
    return () => document.removeEventListener("keydown", alTeclear);
  }, [onClose]);
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Acceso del cliente al proyecto"
        className="flex max-h-[90vh] w-full max-w-[640px] flex-col overflow-hidden rounded-xl border border-line bg-surface shadow-2xl"
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}

function Cabecera({ estado, state, onClose }: { estado: "activo" | "revocado" | "sin-generar"; state: AccessState; onClose: () => void }) {
  const chip =
    estado === "activo"
      ? { texto: "Activo", caja: "border-success-line bg-success-surface text-success-ink", punto: "bg-success" }
      : estado === "revocado"
        ? { texto: "Revocado", caja: "border-warn-line bg-warn-surface text-warn-ink", punto: "bg-warning" }
        : { texto: "Sin generar", caja: "border-line bg-surface text-fg-secondary", punto: "border-[1.5px] border-fg-muted" };
  const subtitulo = [state.proyecto, state.cliente].filter(Boolean).join(" · ");
  return (
    <div className="flex flex-shrink-0 items-start gap-3 border-b border-line px-6 pb-4 pt-5">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2.5">
          <h2 className="text-lg font-semibold leading-[26px] text-fg">Acceso del cliente</h2>
          <span className={cn("inline-flex items-center gap-[5px] rounded-full border px-2 py-px text-[11px] font-semibold", chip.caja)}>
            <span className={cn("h-1.5 w-1.5 rounded-full", chip.punto)} aria-hidden="true" />
            {chip.texto}
          </span>
        </div>
        {subtitulo && <p className="mt-0.5 text-[13px] text-fg-muted">{subtitulo}</p>}
      </div>
      <button type="button" aria-label="Cerrar" onClick={onClose} className="flex-shrink-0 p-1 text-fg-muted transition-colors hover:text-fg">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      </button>
    </div>
  );
}

// ── Sin acceso y revocado ────────────────────────────────────────────────────

const BOTON_AZUL_GRANDE =
  "inline-flex items-center gap-[7px] rounded-lg bg-primary px-3.5 py-[9px] text-sm font-semibold text-primary-fg transition-colors hover:bg-primary-hover disabled:opacity-50";

function SinAcceso({ state, working, onGenerate }: { state: AccessState; working: boolean; onGenerate: () => void }) {
  return (
    <div className="flex flex-col gap-4 overflow-y-auto px-6 pb-6 pt-5">
      <p className="text-sm text-fg-secondary">
        Todavía nadie del cliente puede entrar a este proyecto. Al generarlo, Nexus arma un link y una contraseña de 12 caracteres que puedes ver,
        cambiar o reemplazar acá.
      </p>
      <div className="flex flex-col gap-2 rounded-xl border border-dashed border-line bg-surface-muted px-3.5 py-3">
        <span className={ROTULO_DEL_SISTEMA}>Lo que podrá abrir</span>
        <div className="flex flex-wrap gap-1.5">
          {PUBLISH_SURFACES.map((s) => (
            <span key={s.key} className="rounded-full border border-line bg-surface px-2.5 py-0.5 text-xs text-fg-secondary">
              {s.nombre}
            </span>
          ))}
        </div>
        <span className="text-xs text-fg-muted">Generar el acceso no publica nada: cada parte se publica aparte.</span>
      </div>
      {state.publicable === false && state.motivoNoPublicable && <p className="text-xs text-warn-ink">{state.motivoNoPublicable}</p>}
      <button type="button" onClick={onGenerate} disabled={working} className={cn(BOTON_AZUL_GRANDE, "self-start")}>
        <IconoCandado className="h-[15px] w-[15px]" />
        {working ? "Generando…" : "Generar acceso"}
      </button>
    </div>
  );
}

function Revocado({ state, working, onGenerate }: { state: AccessState; working: boolean; onGenerate: () => void }) {
  const quien = state.createdBy?.name ?? state.createdBy?.email;
  return (
    <div className="flex flex-col gap-4 overflow-y-auto px-6 pb-6 pt-5">
      <p className="text-sm text-fg-secondary">El cliente ya no puede entrar. Lo publicado sigue publicado, pero nadie lo ve hasta que generes un acceso nuevo.</p>
      <div className="flex flex-col gap-0.5 text-xs text-fg-muted">
        <span>Revocado el {fechaYHora(state.revokedAt)}</span>
        <span>
          Generado el {fechaYHora(state.enabledAt)}
          {quien ? ` por ${quien}` : ""} · Último uso: {state.lastUsedAt ? fechaYHora(state.lastUsedAt) : "nunca"}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={onGenerate} disabled={working} className={BOTON_AZUL_GRANDE}>
          <IconoCandado className="h-[15px] w-[15px]" />
          {working ? "Generando…" : "Generar acceso nuevo"}
        </button>
        <span className="min-w-[160px] flex-1 text-xs text-fg-muted">Link y contraseña nuevos: los de antes no vuelven a funcionar.</span>
      </div>
    </div>
  );
}

// ── Activo ───────────────────────────────────────────────────────────────────

function Activo({
  state,
  onSavePassword,
  onTogglePublish,
}: {
  state: AccessState;
  onSavePassword: (pw: string) => Promise<string | null>;
  onTogglePublish: (kind: ExternalSurface, publish: boolean) => Promise<void>;
}) {
  const toast = useToast();
  const urlBase = state.url ?? "";
  const partes = PUBLISH_SURFACES.map((s) => ({ s, e: state.partes?.[s.key] ?? { publicadaEl: null, motivo: null } }));
  const publicadas = new Set(partes.filter((p) => p.e.publicadaEl).map((p) => p.s.key));
  const sinPublicar = partes.length - publicadas.size;
  const mensaje = mensajeParaElCliente({ proyecto: state.proyecto ?? "el proyecto", urlBase, publicadas });
  // `publicable === false` explícito: una respuesta vieja sin el campo no bloquea nada (el gate real vive en el servidor).
  const bloqueoGeneral = state.publicable === false ? state.motivoNoPublicable ?? "Este proyecto no admite publicación externa." : null;

  const copiar = async (texto: string, ok: string) => {
    try {
      await navigator.clipboard.writeText(texto);
      toast.success(ok);
    } catch {
      toast.error("No se pudo copiar. Selecciona el texto y cópialo a mano.");
    }
  };

  return (
    <div className="flex flex-col gap-6 overflow-y-auto px-6 pb-6 pt-5">
      <section aria-label="Para entrar" className="flex flex-col gap-2.5">
        <span className={ROTULO_DEL_SISTEMA}>Para entrar</span>
        <div className="rounded-xl border border-line bg-surface">
          <div className="grid grid-cols-[96px_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-0.5 px-3.5 py-3">
            <span className="text-xs text-fg-muted">Link</span>
            <span title={urlBase} className="truncate text-[13px] text-fg-secondary">
              {urlBase.replace(/^https?:\/\//, "")}
            </span>
            <BotonCopiar onClick={() => void copiar(urlBase, "Link copiado.")} />
            <span />
            <span className="col-span-2 text-xs text-fg-muted">Abre el kickoff. Para llevarlo directo a otra parte, copia el link de esa fila.</span>
          </div>
          <Contrasena guardada={state.accessPassword ?? null} onSave={onSavePassword} onCopiar={(t) => void copiar(t, "Contraseña copiada.")} />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" disabled={!mensaje} onClick={() => mensaje && void copiar(mensaje, "Mensaje copiado: la contraseña mándala aparte.")} className={BOTON_AZUL_GRANDE}>
            <IconoCopiar className="h-[15px] w-[15px]" />
            Copiar mensaje para el cliente
          </button>
          <span className="min-w-[200px] flex-1 text-xs text-fg-muted">
            {mensaje ? "El link, lo que ya está publicado y cómo entrar. La contraseña no va en el mensaje." : "Publica al menos una parte para armar el mensaje."}
          </span>
        </div>
      </section>

      <section aria-label="Lo que ve el cliente" className="flex flex-col gap-2.5">
        <div className="flex items-baseline justify-between gap-3">
          <span className={ROTULO_DEL_SISTEMA}>Lo que ve el cliente</span>
          <span className="text-xs text-fg-muted">
            {publicadas.size} de {partes.length} publicadas
          </span>
        </div>
        <div className="overflow-hidden rounded-xl border border-line bg-surface">
          {partes.map(({ s, e }, i) => (
            <FilaDeParte
              key={s.key}
              kind={s.key}
              nombre={s.nombre}
              url={linkDeLaParte(urlBase, s.key)}
              estado={e}
              bloqueo={bloqueoGeneral ?? e.motivo}
              primera={i === 0}
              onCopiar={(u) => void copiar(u, `Link de ${s.nombre} copiado.`)}
              onTogglePublish={onTogglePublish}
            />
          ))}
          {sinPublicar > 0 && (
            <div className="flex items-center gap-2 border-t border-line bg-surface-muted px-3.5 py-2.5 text-xs text-fg-muted">
              <span className="h-2 w-2 flex-shrink-0 rounded-full border-[1.5px] border-fg-muted" aria-hidden="true" />
              {sinPublicar === 1 ? "En la que está sin publicar" : `En las ${sinPublicar} sin publicar`}, quien entra con el link ve «no disponible».
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function FilaDeParte({
  kind,
  nombre,
  url,
  estado,
  bloqueo,
  primera,
  onCopiar,
  onTogglePublish,
}: {
  kind: ExternalSurface;
  nombre: string;
  url: string;
  estado: EstadoDeLaParte;
  /** Por qué no se puede publicar; null = se puede. */
  bloqueo: string | null;
  primera: boolean;
  onCopiar: (url: string) => void;
  onTogglePublish: (kind: ExternalSurface, publish: boolean) => Promise<void>;
}) {
  const [cambiando, setCambiando] = useState(false);
  const publicada = !!estado.publicadaEl;
  const cambiar = async () => {
    setCambiando(true);
    try {
      await onTogglePublish(kind, !publicada);
    } finally {
      setCambiando(false);
    }
  };
  /* El requerimiento técnico lo abre el desarrollador, no el cliente: mismo link y misma
     contraseña, otro destinatario. */
  const meta = publicada
    ? `Publicado el ${fechaCorta(estado.publicadaEl!)}`
    : ["Sin publicar", kind === "desarrollo" ? "lo abre el desarrollador" : null, bloqueo ? bloqueo.replace(/\.$/, "") : null].filter(Boolean).join(" · ");
  return (
    <div className={cn("flex items-center gap-3 px-3.5 py-2.5", !primera && "border-t border-line")}>
      <span
        className={cn("h-2 w-2 flex-shrink-0 rounded-full", publicada ? "bg-success" : "border-[1.5px] border-fg-muted")}
        aria-hidden="true"
      />
      <div className="flex min-w-0 flex-1 flex-col gap-px">
        <span className="text-sm font-medium text-fg">{nombre}</span>
        <span className="text-xs text-fg-muted">{meta}</span>
      </div>
      {publicada ? (
        <div className="flex flex-shrink-0 items-center gap-0.5">
          <button
            type="button"
            onClick={() => onCopiar(url)}
            aria-label={`Copiar el link directo a ${nombre}`}
            title="Copiar el link que lleva directo acá"
            className="inline-flex rounded-md p-1.5 text-fg-muted transition-colors hover:bg-surface-hover hover:text-fg"
          >
            <IconoEnlace className="h-[15px] w-[15px]" />
          </button>
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Ver ${nombre} como el cliente`}
            title="Ver como el cliente (te pide la contraseña)"
            className="inline-flex rounded-md p-1.5 text-fg-muted transition-colors hover:bg-surface-hover hover:text-fg"
          >
            <IconoOjo className="h-[15px] w-[15px]" />
          </a>
          {/* Ocultar nunca se bloquea: si el proyecto pasó a no publicable después, hay que poder bajarlo. */}
          <BotonTexto onClick={() => void cambiar()} disabled={cambiando} className="px-2 font-medium">
            {cambiando ? "…" : "Ocultar"}
          </BotonTexto>
        </div>
      ) : (
        <BotonBlanco onClick={() => void cambiar()} disabled={cambiando || !!bloqueo} title={bloqueo ?? undefined} className="flex-shrink-0">
          {cambiando ? "Publicando…" : "Publicar"}
        </BotonBlanco>
      )}
    </div>
  );
}

/** La contraseña: se ve, se copia y se cambia ahí mismo (escribiendo o con «Generar otra»). */
function Contrasena({
  guardada,
  onSave,
  onCopiar,
}: {
  guardada: string | null;
  onSave: (pw: string) => Promise<string | null>;
  onCopiar: (pw: string) => void;
}) {
  const [input, setInput] = useState(guardada ?? "");
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  // Re-sembrar cuando cambia la guardada (tras guardar o tras cambiar link y contraseña).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- re-siembra del borrador con lo que vino del servidor
    setInput(guardada ?? "");
  }, [guardada]);

  const trimmed = input.trim();
  const cambiada = input !== (guardada ?? "");
  // La constante es la misma que valida el servidor (A-10): el panel no habilita un «Guardar» que daría 400.
  const validLen = trimmed.length >= LARGO_MINIMO_CONTRASENA && trimmed.length <= LARGO_MAXIMO_CONTRASENA && !/\s/.test(trimmed);

  const guardar = async () => {
    setError(null);
    setGuardando(true);
    const err = await onSave(trimmed);
    setGuardando(false);
    if (err) setError(err);
  };

  return (
    <div className="grid grid-cols-[96px_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 border-t border-line px-3.5 py-3">
      <label htmlFor="acceso-contrasena" className="text-xs text-fg-muted">
        Contraseña
      </label>
      <input
        id="acceso-contrasena"
        value={input}
        onChange={(e) => {
          setInput(e.target.value);
          setError(null);
        }}
        placeholder={guardada ? "" : "No se ve: genera otra"}
        spellCheck={false}
        className={cn(
          "min-w-0 rounded-lg border px-2.5 py-1.5 text-[15px] font-semibold tabular-nums tracking-[.06em] text-fg placeholder:font-normal placeholder:tracking-normal placeholder:text-fg-muted focus:outline-none",
          cambiada ? "border-brand bg-surface" : "border-transparent bg-transparent hover:border-line focus:border-brand",
        )}
      />
      <div className="flex items-center gap-1.5">
        {cambiada ? (
          <>
            <BotonTexto onClick={() => setInput(guardada ?? "")} disabled={guardando}>
              Deshacer
            </BotonTexto>
            <BotonBlanco onClick={() => void guardar()} disabled={!validLen || guardando}>
              {guardando ? "Guardando…" : "Guardar"}
            </BotonBlanco>
          </>
        ) : (
          <>
            <button type="button" onClick={() => setInput(suggestPassword())} className="rounded px-1.5 py-1 text-xs font-medium text-brand transition-colors hover:text-brand-light">
              Generar otra
            </button>
            <BotonCopiar onClick={() => input && onCopiar(input)} disabled={!input} />
          </>
        )}
      </div>
      <span />
      <span className={cn("col-span-2 text-xs", error ? "text-danger-ink" : cambiada && trimmed && !validLen ? "text-warn-ink" : "text-fg-muted")}>
        {error
          ? error
          : cambiada
            ? (
              <>
                El cliente sigue entrando con la anterior hasta que guardes. {LARGO_MINIMO_CONTRASENA}–{LARGO_MAXIMO_CONTRASENA} caracteres, sin espacios.
              </>
            )
            : "Mándasela por otro canal (WhatsApp o una llamada), no en el mismo correo del link."}
      </span>
    </div>
  );
}

// ── El pie: quién, cuándo y lo que no tiene vuelta atrás ─────────────────────

function Pie({
  state,
  confirming,
  working,
  onAskRegenerate,
  onAskRevoke,
  onCancel,
  onConfirmRegenerate,
  onConfirmRevoke,
}: {
  state: AccessState;
  confirming: "regenerate" | "revoke" | null;
  working: boolean;
  onAskRegenerate: () => void;
  onAskRevoke: () => void;
  onCancel: () => void;
  onConfirmRegenerate: () => void;
  onConfirmRevoke: () => void;
}) {
  const [detalles, setDetalles] = useState(false);
  const quien = state.createdBy?.name ?? state.createdBy?.email;
  return (
    <div className="flex flex-shrink-0 flex-col gap-1.5 border-t border-line bg-surface-muted px-6 pb-3.5 pt-3">
      <span className="text-xs text-fg-muted">
        Generado el {fechaYHora(state.enabledAt)}
        {quien ? `, por ${quien}` : ""} · Último uso: {state.lastUsedAt ? fechaYHora(state.lastUsedAt) : "nunca"}
      </span>
      {confirming ? (
        <Confirmar
          mensaje={
            confirming === "regenerate"
              ? "El link de hoy deja de funcionar y hay que mandarle al cliente el nuevo. Para cambiar solo la contraseña, usa «Generar otra»."
              : "El cliente deja de poder entrar ahora mismo. Lo publicado no se borra, y puedes generar un acceso nuevo después."
          }
          accion={confirming === "regenerate" ? "Sí, cambiar los dos" : "Sí, revocar"}
          working={working}
          onCancel={onCancel}
          onConfirm={confirming === "regenerate" ? onConfirmRegenerate : onConfirmRevoke}
        />
      ) : (
        <div className="flex flex-wrap items-center gap-1">
          <button
            type="button"
            aria-expanded={detalles}
            onClick={() => setDetalles((d) => !d)}
            className="inline-flex items-center gap-1 py-1 text-xs text-fg-muted transition-colors hover:text-fg"
          >
            <svg className={cn("h-3 w-3 transition-transform", detalles && "rotate-90")} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
              <path d="M9 5l7 7-7 7" />
            </svg>
            Detalles técnicos
          </button>
          <span className="flex-1" />
          <button type="button" onClick={onAskRegenerate} disabled={working} className="px-2 py-1 text-xs font-medium text-fg-secondary transition-colors hover:text-fg disabled:opacity-50">
            Cambiar link y contraseña
          </button>
          <button type="button" onClick={onAskRevoke} disabled={working} className="py-1 pl-2 text-xs font-medium text-destructive transition-colors hover:text-destructive-hover disabled:opacity-50">
            Revocar acceso
          </button>
        </div>
      )}
      {detalles && !confirming && (
        <div className="flex items-start gap-3 text-xs">
          <span className="w-12 flex-shrink-0 text-fg-muted">Token</span>
          <span className="min-w-0 flex-1 break-all text-[11px] text-fg-secondary">{state.accessToken ?? "—"}</span>
        </div>
      )}
    </div>
  );
}

function Confirmar({
  mensaje,
  accion,
  working,
  onCancel,
  onConfirm,
}: {
  mensaje: string;
  accion: string;
  working: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-4 rounded-xl border border-danger-line bg-danger-surface px-4 py-3.5">
      <span className="min-w-[220px] flex-1 text-[13px] leading-[1.45] text-danger-ink">{mensaje}</span>
      <div className="flex flex-shrink-0 items-center gap-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={working}
          className="rounded-lg border border-line bg-surface px-3 py-1.5 text-[13px] text-fg-secondary transition-colors hover:bg-surface-hover disabled:opacity-50"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={working}
          className="rounded-lg bg-destructive px-3 py-[7px] text-[13px] font-semibold text-destructive-fg transition-colors hover:bg-destructive-hover disabled:opacity-50"
        >
          {working ? "Un momento…" : accion}
        </button>
      </div>
    </div>
  );
}

// ── Piezas chicas ────────────────────────────────────────────────────────────

function BotonCopiar({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center gap-[5px] rounded-md border border-line bg-surface px-2.5 py-1 text-xs font-medium text-fg-secondary transition-colors hover:bg-surface-hover hover:text-fg disabled:opacity-40"
    >
      <IconoCopiar className="h-[13px] w-[13px]" />
      Copiar
    </button>
  );
}

function IconoCopiar({ className }: { className: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15V6a2 2 0 012-2h9" />
    </svg>
  );
}

function IconoCandado({ className }: { className: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 018 0v4" />
    </svg>
  );
}

function IconoEnlace({ className }: { className: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
      <path d="M10 14a4 4 0 005.66 0l3-3a4 4 0 00-5.66-5.66l-1 1" />
      <path d="M14 10a4 4 0 00-5.66 0l-3 3a4 4 0 005.66 5.66l1-1" />
    </svg>
  );
}

function IconoOjo({ className }: { className: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}
