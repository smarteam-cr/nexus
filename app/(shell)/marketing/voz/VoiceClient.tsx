"use client";

/**
 * Voz de marca (/marketing/voz) — el tono que lee el agente antes de escribir (rediseño del 2026-10-04, sistema
 * «Nexus · interfaz interna»). Al lado, contado, todo lo que lee en cada tanda: la voz es una de cinco piezas y
 * desde acá se llega a las otras.
 */
import Link from "next/link";
import { useState, useEffect, useCallback } from "react";
import { fetchJson, ApiError } from "@/lib/api/fetch-json";
import { useToast } from "@/components/ui/Toast";
import { Button, PageHeader, SkeletonPanel, SkeletonText } from "@/components/ui";
import { BotonTexto } from "@/components/ui/sistema";
import { Rotulo } from "@/components/marketing/piezas";
import type { ResumenInsumos } from "@/lib/marketing/queries";

export default function VoiceClient({ canEdit, resumen }: { canEdit: boolean; resumen: ResumenInsumos }) {
  const toast = useToast();
  const [valor, setValor] = useState("");
  const [guardado, setGuardado] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const d = await fetchJson<{ brandVoice: string }>("/api/marketing/voice");
      setValor(d.brandVoice);
      setGuardado(d.brandVoice);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo cargar la voz de marca.");
    } finally {
      setLoading(false);
    }
  }, [toast]);
  useEffect(() => {
    load();
  }, [load]);

  const cambio = valor.trim() !== guardado.trim();

  const guardar = async () => {
    if (!valor.trim() || busy) return;
    setBusy(true);
    try {
      const d = await fetchJson<{ brandVoice: string }>("/api/marketing/voice", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brandVoice: valor.trim() }),
      });
      setGuardado(d.brandVoice);
      setValor(d.brandVoice);
      toast.success("Voz de marca guardada. La próxima tanda ya la usa.");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo guardar.");
    } finally {
      setBusy(false);
    }
  };

  const campana = resumen.temasEnCampana;
  const insumos: Array<{ titulo: string; dato: string; href: string | null }> = [
    { titulo: "Voz de marca", dato: "El tono: este texto.", href: null },
    {
      titulo: "Temas",
      dato: `${resumen.temasActivos} ${resumen.temasActivos === 1 ? "activo" : "activos"}${
        campana.length > 0 ? ` · ${campana.map((c) => `«${c}»`).join(", ")} en campaña` : ""
      }`,
      href: "/marketing/temas",
    },
    {
      titulo: "Audiencia",
      dato: `ICP de ${resumen.icpItems} ítems · ${resumen.personasActivas} buyer ${resumen.personasActivas === 1 ? "persona" : "personas"}`,
      href: "/marketing/icp",
    },
    {
      titulo: "Fuentes",
      dato: `${resumen.fuentesActivas} ${resumen.fuentesActivas === 1 ? "perfil" : "perfiles"} de LinkedIn · ${resumen.postsEnVentana} posts de los últimos 3 meses`,
      href: "/marketing/fuentes",
    },
    {
      titulo: "Generación",
      dato:
        resumen.genEmpresaTarget === null
          ? "Cuánto pide cada tanda"
          : `Cada tanda pide ${resumen.genEmpresaTarget} de empresa y ${resumen.genPersonaTarget ?? 0} de perfil personal`,
      href: "/marketing/generacion",
    },
  ];

  return (
    <>
      <PageHeader
        title="Voz de marca"
        description={`El agente lee este texto antes de escribir cada publicación e idea de SEM: de acá sale el tono.${canEdit ? "" : " Tu rol puede verlo pero no editarlo."}`}
      />
      <div className="flex flex-wrap items-start gap-5">
        <section aria-label="Texto de la voz de marca" className="flex min-w-0 flex-[999_1_520px] flex-col gap-3">
          {loading ? (
            <SkeletonPanel minH="min-h-[260px]" bodyClassName="p-4">
              <SkeletonText lines={6} />
            </SkeletonPanel>
          ) : (
            <label className="flex flex-col gap-1.5">
              <Rotulo>Cómo habla Smarteam</Rotulo>
              <textarea
                value={valor}
                onChange={(e) => setValor(e.target.value)}
                rows={10}
                readOnly={!canEdit}
                className="w-full resize-y rounded-xl border border-line bg-surface px-3.5 py-3 text-sm leading-[22px] text-fg focus:border-brand focus:outline-none"
              />
            </label>
          )}
          {canEdit && (
            <div className="flex flex-wrap items-center gap-2.5">
              <Button variant="primary" onClick={guardar} disabled={busy || loading || !valor.trim() || !cambio}>
                {busy ? "Guardando…" : "Guardar"}
              </Button>
              {cambio ? (
                <BotonTexto onClick={() => setValor(guardado)}>Descartar los cambios</BotonTexto>
              ) : (
                <span className="text-xs text-fg-muted">Sin cambios por guardar · la próxima tanda lee lo que esté guardado</span>
              )}
            </div>
          )}
        </section>

        <aside aria-label="Lo que lee el agente" className="flex flex-[1_1_300px] flex-col gap-3 rounded-xl border border-line bg-surface-muted p-5 lg:max-w-[340px]">
          <Rotulo>Lo que lee el agente en cada tanda</Rotulo>
          {insumos.map((it) =>
            it.href ? (
              <Link key={it.titulo} href={it.href} className="flex flex-col gap-0.5 rounded-lg border border-line bg-surface px-3 py-2.5 transition-colors hover:bg-surface-hover">
                <span className="flex items-center gap-2">
                  <span className="flex-1 text-[13px] font-semibold text-fg">{it.titulo}</span>
                  <span aria-hidden="true" className="text-fg-muted">
                    ›
                  </span>
                </span>
                <span className="text-xs leading-[17px] text-fg-muted">{it.dato}</span>
              </Link>
            ) : (
              <div key={it.titulo} className="flex flex-col gap-0.5 rounded-lg border border-line bg-surface px-3 py-2.5">
                <span className="flex items-center gap-2">
                  <span className="flex-1 text-[13px] font-semibold text-fg">{it.titulo}</span>
                  <span className="text-[11px] text-fg-muted">esta página</span>
                </span>
                <span className="text-xs leading-[17px] text-fg-muted">{it.dato}</span>
              </div>
            ),
          )}
        </aside>
      </div>
    </>
  );
}
