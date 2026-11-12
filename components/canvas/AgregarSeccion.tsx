"use client";

/**
 * components/canvas/AgregarSeccion.tsx — «+ Agregar sección», al pie de un documento del proyecto (2026-11-12, Elías).
 *
 * El mismo lugar que el de la propuesta comercial (BusinessCaseWorkspace), con dos caminos:
 *   1. **Del catálogo de este documento**: las secciones de su tipo que no tiene (en un «Diagnóstico esencial», las del
 *      completo). La IA las escribe al generar: la plantilla respeta lo que agregó una persona
 *      (lib/canvas/secciones-agregadas.ts). La lista la da el servidor (`canvas-sections/agregables`).
 *   2. **Una sección propia**: nombre y forma (tabla, texto con tarjetas…). La escribe la persona; la IA no la llena.
 *
 * Va FUERA del `.stl` del documento: es del equipo, con la interfaz de Nexus (tokens), no parte de lo que ve el cliente.
 * `seMuestra` filtra lo que el editor de ese documento sabe pintar: una sección que su motor no resuelve no se ofrece.
 */
import { useCallback, useEffect, useState } from "react";
import { Button, Input, Selector } from "@/components/ui";
import { catalogoLegible, TIPO_POR_DEFECTO } from "@/lib/landing/catalogo-de-secciones";
import type { SeccionAgregable } from "@/lib/canvas/secciones-agregadas";

export default function AgregarSeccion({
  projectId,
  canvasId,
  cuantasSecciones,
  seMuestra,
  onAgregarDelCatalogo,
  onAgregarPropia,
}: {
  projectId: string;
  canvasId: string;
  /** Cambia cuando el documento gana o pierde una sección: la lista del catálogo se vuelve a pedir. */
  cuantasSecciones: number;
  /** ¿El editor de este documento sabe pintar esta key? */
  seMuestra: (key: string) => boolean;
  onAgregarDelCatalogo: (key: string) => Promise<unknown>;
  onAgregarPropia: (nombre: string, tipo: string) => Promise<unknown>;
}) {
  const [abierto, setAbierto] = useState(false);
  // null = todavía no se sabe; "error" = no se pudo leer (nunca decir «ya tiene todas» sin saberlo).
  const [catalogo, setCatalogo] = useState<SeccionAgregable[] | null | "error">(null);
  const [nombre, setNombre] = useState("");
  const [tipo, setTipo] = useState(TIPO_POR_DEFECTO);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const tipos = catalogoLegible();

  const leer = useCallback(async () => {
    const r = await fetch(`/api/projects/${projectId}/canvas-sections/agregables?canvasId=${encodeURIComponent(canvasId)}`).catch(() => null);
    const j = (r?.ok ? await r.json().catch(() => null) : null) as { secciones?: SeccionAgregable[] } | null;
    setCatalogo(Array.isArray(j?.secciones) ? j!.secciones : "error");
  }, [projectId, canvasId]);

  useEffect(() => {
    if (abierto) void leer();
  }, [abierto, leer, cuantasSecciones]);

  const delCatalogo = (Array.isArray(catalogo) ? catalogo : []).filter((s) => seMuestra(s.key));

  const agregar = async (key: string) => {
    setOcupado(key);
    try {
      await onAgregarDelCatalogo(key);
      await leer();
    } finally {
      setOcupado(null);
    }
  };

  const crearPropia = async () => {
    const v = nombre.trim();
    if (!v) return;
    setOcupado("propia");
    try {
      await onAgregarPropia(v, tipo);
      setNombre("");
      setTipo(TIPO_POR_DEFECTO);
      setAbierto(false);
    } finally {
      setOcupado(null);
    }
  };

  if (!abierto) {
    return (
      <div className="px-6 pb-6 pt-4">
        <button
          type="button"
          onClick={() => setAbierto(true)}
          className="w-full rounded-xl border border-dashed border-line py-3 text-sm text-fg-muted transition-colors hover:border-brand hover:text-brand"
        >
          + Agregar sección
        </button>
      </div>
    );
  }

  return (
    <div className="px-6 pb-6 pt-4">
      <div className="space-y-4 rounded-xl border border-line bg-surface p-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-fg">Agregar una sección</h2>
          <Button size="xs" variant="ghost" onClick={() => setAbierto(false)}>
            Cerrar
          </Button>
        </div>

        <section className="space-y-2">
          <h3 className="text-xs font-semibold text-fg-secondary">Del catálogo de este documento</h3>
          {catalogo === null ? (
            <p className="text-xs text-fg-muted">Buscando las secciones que le faltan…</p>
          ) : catalogo === "error" ? (
            <p className="text-xs text-fg-muted">
              No se pudo leer la lista de secciones.{" "}
              <button type="button" onClick={() => void leer()} className="text-brand underline">
                Volver a intentar
              </button>
            </p>
          ) : delCatalogo.length === 0 ? (
            <p className="text-xs text-fg-muted">Este documento ya tiene todas las secciones de su catálogo.</p>
          ) : (
            <ul className="divide-y divide-line rounded-lg border border-line">
              {delCatalogo.map((s) => (
                <li key={s.key} className="flex items-start gap-3 px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-fg">{s.nombre}</p>
                    {s.tip && <p className="text-xs text-fg-muted">{s.tip}</p>}
                    <p className="mt-0.5 text-xs text-fg-secondary">
                      {s.ocultaPorLaPlantilla
                        ? "Ya la tenías, oculta por la plantilla: vuelve a verse con lo que tenía."
                        : s.laEscribeLaIa
                          ? "La IA la escribe la próxima vez que generes. También puedes llenarla tú."
                          : "Se llena a mano: la IA no la escribe."}
                    </p>
                  </div>
                  <Button size="xs" variant="secondary" disabled={!!ocupado} onClick={() => void agregar(s.key)}>
                    {ocupado === s.key ? "Agregando…" : "Agregar"}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="space-y-2">
          <h3 className="text-xs font-semibold text-fg-secondary">Una sección propia</h3>
          <p className="text-xs text-fg-muted">La escribes tú: la IA no la llena al generar, y regenerar no la toca.</p>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              value={nombre}
              maxLength={60}
              onChange={(e) => setNombre(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void crearPropia();
                if (e.key === "Escape") setAbierto(false);
              }}
              placeholder="Nombre de la sección (ej. Riesgos del arranque)"
              aria-label="Nombre de la sección propia"
              className="min-w-64 flex-1"
            />
            <Selector
              etiqueta="Qué forma tiene la sección"
              placeholder="Forma de la sección"
              valor={tipo}
              opciones={tipos.map((t) => ({ value: t.tipo, label: t.nombre, hint: t.queEs }))}
              onElegir={(v) => setTipo(v)}
            />
            <Button size="sm" disabled={!nombre.trim() || !!ocupado} onClick={() => void crearPropia()}>
              {ocupado === "propia" ? "Creando…" : "Crear"}
            </Button>
          </div>
        </section>
      </div>
    </div>
  );
}
