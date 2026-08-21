"use client";

/**
 * components/clients/CseEncargadoSelect.tsx — la celda "CSE encargado" del listado, editable.
 *
 * ── QUÉ CAMBIA AL ELEGIR ─────────────────────────────────────────────────────
 * Escribe `csl_encargado` en TODOS los proyectos del cliente que están en el pipeline de
 * Implementación de HubSpot — porque el encargado es de la CUENTA, no de un proyecto
 * (Elías, 2026-08-21). Los proyectos de Desarrollo/Sitios web NO se tocan: cuelgan como hijos
 * y tienen su propio encargado técnico. Todo eso lo decide el endpoint; acá solo se elige.
 *
 * ── POR QUÉ NO ES OPTIMISTA ──────────────────────────────────────────────────
 * La escritura va a HubSpot y vuelve por el espejo, así que puede tardar unos segundos y puede
 * fallar a la mitad (N proyectos, N PATCH independientes). Pintar el nombre nuevo antes de
 * tiempo mostraría como hecho algo que quizá quedó a medias — y esta columna es justamente la
 * que se mira para saber de quién es la cuenta. Se espera, y recién ahí `router.refresh()`.
 */
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { usePopoverDismiss } from "@/components/ui/usePopoverDismiss";

export interface OpcionDeEncargado {
  email: string;
  name: string;
}

export default function CseEncargadoSelect({
  clientId,
  clientName,
  nombres,
  opciones,
  puedeEditar,
}: {
  clientId: string;
  clientName: string;
  /** Los encargados de HOY, ya deduplicados y acotados al pipeline de CS por el servidor. */
  nombres: string[];
  /** El equipo activo. Vacío ⇒ se pinta como texto, sin desplegable. */
  opciones: OpcionDeEncargado[];
  puedeEditar: boolean;
}) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [guardando, setGuardando] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement | null>(null);
  usePopoverDismiss(abierto, () => setAbierto(false), ref);

  const etiqueta =
    nombres.length === 0 ? null : (
      <>
        {nombres[0]}
        {nombres.length > 1 && <span className="text-fg-muted"> +{nombres.length - 1}</span>}
      </>
    );

  /* Sin permiso —o sin equipo que ofrecer— la celda es exactamente lo que era antes: texto.
     Un desplegable deshabilitado invitaría a apretarlo para descubrir que no se puede. */
  if (!puedeEditar || opciones.length === 0) {
    return etiqueta ? (
      <span className="text-fg-secondary truncate block">{etiqueta}</span>
    ) : (
      <span className="text-fg-muted">—</span>
    );
  }

  async function asignar(email: string, name: string) {
    setGuardando(email);
    setError(null);
    try {
      const r = await fetch(`/api/clients/${clientId}/cse-encargado`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const j = (await r.json().catch(() => ({}))) as { error?: string };
      if (!r.ok) throw new Error(j.error ?? "no se pudo reasignar");
      setAbierto(false);
      /* El valor nuevo lo trae el servidor: la celda se repinta con lo que quedó en HubSpot,
         no con lo que pedimos. Si el espejo trajo otra cosa, se ve esa. */
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : `no se pudo reasignar a ${name}`);
    } finally {
      setGuardando(null);
    }
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={(e) => {
          /* ⛔ La fila entera navega al cliente: sin esto, elegir un encargado te saca de la
             lista a la ficha en el mismo clic. */
          e.stopPropagation();
          setAbierto((v) => !v);
        }}
        disabled={guardando !== null}
        aria-haspopup="listbox"
        aria-expanded={abierto}
        aria-label={`CSE encargado de ${clientName}${nombres.length ? `: ${nombres[0]}` : ""}`}
        className="w-full text-left truncate rounded px-1 py-0.5 -mx-1 text-fg-secondary hover:bg-surface-active disabled:opacity-60 transition-colors"
      >
        {guardando ? <span className="text-fg-muted">Guardando…</span> : (etiqueta ?? <span className="text-fg-muted">—</span>)}
      </button>

      {abierto && (
        <div
          role="listbox"
          onClick={(e) => e.stopPropagation()}
          className="absolute z-20 mt-1 max-h-64 w-56 overflow-y-auto rounded-lg border border-line bg-surface shadow-lg py-1"
        >
          {opciones.map((o) => {
            const esActual = nombres.includes(o.name);
            return (
              <button
                key={o.email}
                type="button"
                role="option"
                aria-selected={esActual}
                onClick={() => void asignar(o.email, o.name)}
                className={
                  "w-full text-left px-3 py-1.5 text-sm hover:bg-surface-active transition-colors " +
                  (esActual ? "font-semibold text-fg" : "text-fg-secondary")
                }
              >
                {o.name}
                {esActual && <span className="text-fg-muted"> · actual</span>}
              </button>
            );
          })}
        </div>
      )}

      {/* ⚠ El error se pinta EN LA CELDA y no en un toast: el fallo puede ser parcial («se
          reasignaron 2 de 5»), y esa frase tiene que quedar a la vista al lado del cliente que
          la sufrió, no desaparecer en cuatro segundos. */}
      {error && (
        <p className="absolute z-20 mt-1 w-64 rounded-lg border border-danger-line bg-danger-surface px-2 py-1.5 text-xs text-danger-ink">
          {error}
        </p>
      )}
    </div>
  );
}
