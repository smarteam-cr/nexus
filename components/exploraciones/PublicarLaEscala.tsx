"use client";

/**
 * PublicarLaEscala — «Publicar» de La escala (16 nov; Elías: «hay que publicarlo actualizado»). Desde el 27 nov va en su
 * propia franja debajo del estado del diagnóstico, como «Subir al cliente» del kickoff: con cambios sin publicar, el aviso y
 * el botón; al día, una línea corta («Acceso» quedó en la fila del título).
 *
 * El cliente ve la FOTO publicada (lib/exploraciones/escala-publicada.ts), no lo que se está editando: un nivel arrastrado
 * o un texto a medio corregir no le llega hasta que alguien publica. Este botón dice si lo de hoy es distinto de lo
 * publicado y lo publica. Sin acceso creado no se ve: crear el acceso publica la primera vez (AccesoALaEscala.tsx).
 * Datos: GET y PATCH de /api/sales/exploraciones/[id]/acceso. Vuelve a mirar con cada cambio de la exploración, cuando la
 * página interna se pone al día o «Acceso» cambia el enlace (`ESCALA_AL_DIA`) y al volver a la pestaña; los avisos que
 * llegan juntos (una edición dispara dos) se juntan en una sola lectura: cada una arma la página entera del cliente.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useToast } from "@/components/ui";
import { BOTON_DE_HERRAMIENTA, BotonAzul } from "@/components/ui/sistema";
import type { EstadoDelAcceso } from "@/lib/exploraciones/acceso-a-la-escala";
import { diaYHora } from "@/lib/exploraciones/fechas";
import { useLienzo } from "./contexto";
import { avisarQueSePublico, ESCALA_AL_DIA } from "./escala-al-dia";

/** Cuánto se esperan los avisos que llegan juntos antes de leer. */
const JUNTAR_MS = 600;

export default function PublicarLaEscala() {
  const { exp, puedeEditar } = useLienzo();
  const toast = useToast();
  const [estado, setEstado] = useState<EstadoDelAcceso | null>(null);
  const [publicando, setPublicando] = useState(false);

  const leer = useCallback(async (): Promise<EstadoDelAcceso | null> => {
    const r = await fetch(`/api/sales/exploraciones/${exp.id}/acceso`, { cache: "no-store" }).catch(() => null);
    return r?.ok ? ((await r.json().catch(() => null)) as EstadoDelAcceso | null) : null;
  }, [exp.id]);

  const espera = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pedir = useCallback(() => {
    if (espera.current) clearTimeout(espera.current);
    espera.current = setTimeout(() => void leer().then((j) => j && setEstado(j)), JUNTAR_MS);
  }, [leer]);

  useEffect(() => {
    pedir();
  }, [pedir, exp.version]);
  useEffect(() => {
    window.addEventListener(ESCALA_AL_DIA, pedir);
    window.addEventListener("focus", pedir);
    return () => {
      window.removeEventListener(ESCALA_AL_DIA, pedir);
      window.removeEventListener("focus", pedir);
      if (espera.current) clearTimeout(espera.current);
    };
  }, [pedir]);

  // Sin un enlace vivo no hay a quién publicarle: «Acceso» lo crea y publica la primera vez.
  if (!estado || estado.estado !== "activo" || !estado.abre) return null;

  const publicar = async () => {
    setPublicando(true);
    const r = await fetch(`/api/sales/exploraciones/${exp.id}/acceso`, { method: "PATCH" }).catch(() => null);
    const j = (await r?.json().catch(() => null)) as (EstadoDelAcceso & { error?: string }) | null;
    setPublicando(false);
    if (!r?.ok || !j) {
      toast.error(j?.error ?? "No se pudo publicar.");
      return;
    }
    setEstado(j);
    avisarQueSePublico();
    toast.success(j.areas === 0 ? "Publicado: el cliente ya no ve ningún equipo." : "Publicado: el cliente ya ve esta versión.");
  };

  const cuando = estado.publicadaEn ? diaYHora(estado.publicadaEn) : null;
  if (!estado.sinPublicar)
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-fg-muted" title={estado.publicadaPor ? `Lo publicó ${estado.publicadaPor}` : undefined}>
        <span className="h-2 w-2 rounded-full bg-success-ink" aria-hidden="true" />
        Publicado{cuando ? ` el ${cuando}` : ""}: el cliente ve esta versión
      </span>
    );
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 rounded-[10px] border border-line bg-surface px-3.5 py-2.5">
      <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
        <span className="text-[13px] text-fg-secondary">
          {cuando ? `Hay cambios que el cliente no ve: tiene la versión del ${cuando}.` : "El cliente todavía no ve nada: falta publicar."}
        </span>
        {estado.areas === 0 && <span className="text-xs text-fg-muted">Sin equipos elegidos: publicar le quita la página al cliente.</span>}
        {estado.noSePublica && <span className="text-xs font-semibold text-warn-ink">{estado.noSePublica}</span>}
      </span>
      {puedeEditar ? (
        <BotonAzul disabled={publicando || !!estado.noSePublica} onClick={() => void publicar()}>
          {publicando ? "Publicando…" : "Publicar"}
        </BotonAzul>
      ) : (
        <span className={BOTON_DE_HERRAMIENTA} aria-disabled="true">
          Sin publicar
        </span>
      )}
    </div>
  );
}
