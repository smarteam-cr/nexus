"use client";

/**
 * components/escala/comentarios/CambioDeTexto.tsx — cuando una versión nueva cambió el texto que se
 * comentó, se ve al lado del comentario: lo de entonces tachado y lo de hoy resaltado, palabra por
 * palabra. Si el identificador ya no existe, se dice.
 */
import { diferenciaPorPalabras } from "@/lib/escala/documento/diferencias";

export default function CambioDeTexto({
  antes,
  hoy,
  versionComentada,
  versionVigente,
}: {
  antes: string;
  /** null = el identificador ya no existe en la versión vigente. */
  hoy: string | null;
  versionComentada: string;
  versionVigente: string;
}) {
  if (hoy === antes) return null;
  if (hoy === null) {
    return (
      <div className="rounded-lg border border-warn-line bg-warn-surface px-3 py-2 text-xs leading-relaxed text-warn-ink">
        <p className="font-semibold">Esto ya no existe en la {versionVigente}.</p>
        <p className="mt-1 whitespace-pre-line opacity-90">En la {versionComentada} decía: {antes}</p>
      </div>
    );
  }
  const tramos = diferenciaPorPalabras(antes, hoy);
  return (
    <div className="rounded-lg border border-line bg-surface-muted px-3 py-2 text-xs leading-relaxed">
      <p className="font-semibold text-fg">
        El texto cambió desde este comentario <span className="font-normal text-fg-muted">(se hizo en la {versionComentada}; hoy rige la {versionVigente})</span>
      </p>
      <p className="mt-1.5 whitespace-pre-line text-fg-secondary">
        <span className="font-semibold text-fg-muted">En la {versionComentada} · </span>
        {tramos
          .filter((t) => t.tipo !== "agregado")
          .map((t, i) =>
            t.tipo === "quitado" ? (
              <del key={i} className="rounded bg-danger-surface px-0.5 text-danger-ink">
                {t.texto}
              </del>
            ) : (
              <span key={i}>{t.texto}</span>
            ),
          )}
      </p>
      <p className="mt-1 whitespace-pre-line text-fg">
        <span className="font-semibold text-fg-muted">Hoy · </span>
        {tramos
          .filter((t) => t.tipo !== "quitado")
          .map((t, i) =>
            t.tipo === "agregado" ? (
              <ins key={i} className="rounded bg-success-surface px-0.5 text-success-ink no-underline">
                {t.texto}
              </ins>
            ) : (
              <span key={i}>{t.texto}</span>
            ),
          )}
      </p>
    </div>
  );
}
