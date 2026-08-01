"use client";

import { useState } from "react";
import {
  EXPLICACION_DEL_PASO,
  MIENTRAS_TANTO,
  parseEstadoDeAlta,
  siguientePaso,
} from "@/lib/projects/alta";

/**
 * components/projects/AltaTrabada.tsx — EL CARTEL del alta que quedó a medio hacer.
 *
 * ── POR QUÉ EXISTE ───────────────────────────────────────────────────────────
 * Dar de alta un proyecto son dos escrituras en dos sistemas, con red en el medio. Cuando la
 * segunda falla, el proyecto queda en cuarentena: se ve y se abre, pero no cobra, no suma a
 * la cartera y no se le publica nada al cliente. Sin este cartel, esa cuarentena sería
 * indistinguible de un bug — el proyecto aparece, se abre, y simplemente no está en cobranza.
 *
 * ── EN DOS LUGARES, A PROPÓSITO ──────────────────────────────────────────────
 * El rail de la ficha del cliente y el widget del proyecto. El del rail es el que importa: el
 * widget vive DENTRO de un proyecto ya abierto, así que solo con ése un alta trabada se
 * descubre de casualidad — hay que entrar justo al proyecto que falló.
 *
 * El texto no vive acá sino en `lib/projects/alta.ts`: dos carteles con textos casi iguales se
 * desincronizan, y el que se corrige nunca es el que la persona está mirando.
 */

export interface AltaTrabadaProps {
  projectId: string;
  /** `Project.altaEstado`. Si el alta terminó (o nunca hubo una), el componente no pinta nada. */
  altaEstado: string | null | undefined;
  /** `Project.altaError` — el motivo del último intento fallido, si lo hubo. */
  altaError?: string | null;
  /** `Project.altaUltimoIntentoAt` en ISO. */
  altaUltimoIntentoAt?: string | null;
  /** `Project.altaIntentos`. Se muestra recién a partir del segundo: uno solo no dice nada. */
  altaIntentos?: number | null;
  /** ¿Esta persona puede dar de alta? Sin la celda, ve el cartel pero no el botón. */
  puedeReintentar?: boolean;
  /** Qué hacer cuando el alta TERMINA. Por defecto, recargar. */
  onTermino?: () => void;
  /** `compacto` en el rail (una línea + botón); `completo` en el widget. */
  variante?: "compacto" | "completo";
}

function haceCuanto(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.floor(ms / 60000);
  if (min < 1) return "recién";
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `hace ${h} h`;
  return `hace ${Math.floor(h / 24)} d`;
}

export default function AltaTrabada({
  projectId,
  altaEstado,
  altaError,
  altaUltimoIntentoAt,
  altaIntentos,
  puedeReintentar = true,
  onTermino,
  variante = "completo",
}: AltaTrabadaProps) {
  const [corriendo, setCorriendo] = useState(false);
  const [fallo, setFallo] = useState<string | null>(null);

  /* El estado llega como string suelto (viaja por JSON y por props de server component), así
     que se valida contra la tabla en vez de castearse: un valor que nadie declaró tiene que
     comportarse como "no hay alta", no reventar el rail entero del cliente. */
  const paso = siguientePaso(parseEstadoDeAlta(altaEstado));
  // El alta terminó, o el proyecto nunca pasó por el alta única (los ~100 de siempre).
  if (!paso) return null;

  const { titulo, detalle } = EXPLICACION_DEL_PASO[paso];

  async function reintentar() {
    setCorriendo(true);
    setFallo(null);
    try {
      const r = await fetch(`/api/projects/${projectId}/alta/retry`, { method: "POST" });
      const data = (await r.json()) as { termino?: boolean; error?: string | null };
      if (!r.ok) {
        setFallo(data.error || "No se pudo reintentar.");
        return;
      }
      if (data.termino) {
        /* Terminó: la pantalla entera tiene que releerse. El proyecto acaba de entrar en
           cobranza, en la cartera y en el ciclo de vida — media docena de bloques que se
           cargaron creyendo que estaba en cuarentena. Recargar es lo honesto. */
        if (onTermino) onTermino();
        else window.location.reload();
        return;
      }
      /* No terminó: el motor dejó el motivo escrito en la fila. Se muestra el que devolvió
         en vez de recargar, para que la persona lea qué pasó sin perder el contexto. */
      setFallo(data.error || "Sigue sin poder completarse. Probá de nuevo en un momento.");
    } catch {
      setFallo("No se pudo hablar con el servidor.");
    } finally {
      setCorriendo(false);
    }
  }

  const boton = puedeReintentar ? (
    <button
      type="button"
      onClick={reintentar}
      disabled={corriendo}
      className="flex-shrink-0 px-2.5 py-1 text-xs font-medium rounded-lg border border-warn-line text-warn-ink hover:bg-warn-line/20 disabled:opacity-50 transition-colors"
    >
      {corriendo ? "Reintentando…" : "Reintentar"}
    </button>
  ) : null;

  if (variante === "compacto") {
    return (
      <div className="px-6 py-2 flex items-center gap-2 flex-wrap border-b border-warn-line bg-warn-surface">
        <span className="text-xs font-medium text-warn-ink">Sin terminar de crear · {titulo}</span>
        <span className="text-xs text-warn-ink/70" title={`${detalle} ${MIENTRAS_TANTO}`}>
          · no cobra ni se publica
        </span>
        {fallo && <span className="text-xs text-warn-ink/70">· {fallo}</span>}
        <span className="ml-auto" />
        {boton}
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-warn-line bg-warn-surface p-4 space-y-2">
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-warn-ink">{titulo}</p>
          <p className="mt-1 text-xs text-warn-ink/80 leading-relaxed">{detalle}</p>
          <p className="mt-1 text-xs text-warn-ink/70 leading-relaxed">{MIENTRAS_TANTO}</p>
        </div>
        {boton}
      </div>

      {(altaError || fallo || altaUltimoIntentoAt) && (
        <div className="pt-2 border-t border-warn-line/60 space-y-1">
          {(fallo || altaError) && (
            /* El error crudo se muestra igual, abajo y en chico: no le sirve a quien solo
               quiere saber si esperar, pero es LO ÚNICO que sirve cuando hay que avisar. */
            <p className="text-xs text-warn-ink/70 break-words">Último error: {fallo || altaError}</p>
          )}
          {altaUltimoIntentoAt && (
            <p className="text-xs text-warn-ink/60">
              Último intento {haceCuanto(altaUltimoIntentoAt)}
              {typeof altaIntentos === "number" && altaIntentos > 1 ? ` · ${altaIntentos} intentos` : ""}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
