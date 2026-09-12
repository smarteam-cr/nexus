"use client";

/**
 * components/documentacion/EncabezadoDePagina.tsx — ícono, título, estado y acciones de la página.
 *
 * Junta en una sola fila lo que antes estaba disperso: el ícono (que abre una GRILLA, no una lista
 * de cuarenta renglones), el título editable en el lugar, si el guardado va al día, por qué está
 * en solo lectura cuando lo está, y el menú de acciones.
 *
 * El título no usa el control de versión del contenido a propósito: renombrar en una pestaña no
 * tiene por qué hacer fallar el autoguardado de la otra — son dos cambios que no chocan.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { fetchJson } from "@/lib/api/fetch-json";
import { Breadcrumbs, Menu, useToast, type MenuItemDef } from "@/components/ui";
import type { EstadoDeGuardado } from "@/lib/documentacion/tipos";
import SelectorDeIcono from "./SelectorDeIcono";
import HistorialDePagina from "./HistorialDePagina";

/** Lo que se muestra mientras se escribe. El conflicto y el error los explica el aviso de arriba. */
const TEXTO_DEL_ESTADO: Partial<Record<EstadoDeGuardado, string>> = {
  guardado: "Guardado",
  pendiente: "Sin guardar",
  guardando: "Guardando…",
};

interface Props {
  paginaId: string;
  slug: string;
  titulo: string;
  icono: string | null;
  migas: { label: string; href: string }[];
  bloqueada: boolean;
  fija: boolean;
  editable: boolean;
  puedeAdministrar: boolean;
  estado: EstadoDeGuardado;
}

export default function EncabezadoDePagina({
  paginaId,
  slug,
  titulo,
  icono,
  migas,
  bloqueada,
  fija,
  editable,
  puedeAdministrar,
  estado,
}: Props) {
  const router = useRouter();
  const toast = useToast();
  const [editandoTitulo, setEditandoTitulo] = useState(false);
  const [historialAbierto, setHistorialAbierto] = useState(false);

  async function pedir(url: string, init: RequestInit, exito: string, despues?: () => void) {
    try {
      await fetchJson(url, init);
      toast.success(exito);
      despues?.();
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo completar la acción.");
    }
  }

  const guardarMeta = (datos: { titulo?: string; icono?: string | null }, exito: string) =>
    pedir(
      `/api/documentacion/paginas/${paginaId}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(datos),
      },
      exito,
    );

  const acciones: MenuItemDef[] = [
    { key: "historial", label: "Historial de cambios", onSelect: () => setHistorialAbierto(true) },
    {
      key: "enlace",
      label: "Copiar el enlace",
      onSelect: () => {
        void navigator.clipboard?.writeText(`${window.location.origin}/documentacion/${slug}`);
        toast.success("Enlace copiado.");
      },
    },
  ];
  if (puedeAdministrar) {
    acciones.push({
      key: "bloquear",
      label: bloqueada ? "Desbloquear la página" : "Bloquear la página",
      separatorBefore: true,
      onSelect: () =>
        void pedir(
          `/api/documentacion/paginas/${paginaId}/bloquear`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ bloqueada: !bloqueada }),
          },
          bloqueada ? "Página desbloqueada." : "Página bloqueada.",
        ),
    });
  }
  if (editable && !fija) {
    acciones.push({
      key: "archivar",
      label: "Archivar",
      danger: true,
      onSelect: () =>
        void pedir(
          `/api/documentacion/paginas/${paginaId}/archivar`,
          { method: "POST" },
          "Archivada. Queda en la papelera.",
          () => router.push("/documentacion"),
        ),
    });
  }

  return (
    <header className="mb-6">
      {migas.length > 0 && <Breadcrumbs crumbs={migas} className="mb-2" />}

      {/* El ícono va ARRIBA del título y no al lado: es la jerarquía de una página, no una viñeta
          del renglón. Además deja el título alineado con el texto del contenido. */}
      <div className="mb-1 -ml-1">
        <SelectorDeIcono
          icono={icono}
          editable={editable}
          onElegir={(valor) => void guardarMeta({ icono: valor }, "Ícono cambiado.")}
        />
      </div>

      <div className="flex items-start gap-1">
        {editandoTitulo ? (
          <input
            autoFocus
            defaultValue={titulo}
            className="min-w-0 flex-1 rounded-lg border border-line bg-surface px-2 py-1 text-3xl font-semibold text-fg"
            onBlur={(e) => {
              setEditandoTitulo(false);
              const nuevo = e.target.value.trim();
              if (nuevo && nuevo !== titulo) void guardarMeta({ titulo: nuevo }, "Título cambiado.");
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
              if (e.key === "Escape") {
                e.currentTarget.value = titulo;
                e.currentTarget.blur();
              }
            }}
          />
        ) : (
          <h1
            className={
              editable
                ? "min-w-0 flex-1 cursor-text rounded-lg px-2 py-1 text-3xl font-semibold text-fg transition-colors hover:bg-surface-hover"
                : "min-w-0 flex-1 px-2 py-1 text-3xl font-semibold text-fg"
            }
            onClick={() => editable && setEditandoTitulo(true)}
            title={editable ? "Clic para renombrar" : undefined}
          >
            {titulo}
          </h1>
        )}

        <div className="flex shrink-0 items-center gap-2 pt-2">
          {editable && TEXTO_DEL_ESTADO[estado] && (
            <span className="text-2xs text-fg-muted" aria-live="polite">
              {TEXTO_DEL_ESTADO[estado]}
            </span>
          )}

          {!editable && (
            <span
              className="rounded-md border border-line bg-surface-muted px-2 py-0.5 text-2xs text-fg-muted"
              title={
                bloqueada
                  ? "Está bloqueada: la edita el liderazgo."
                  : "Tu rol puede leer la documentación; escribirla es del liderazgo."
              }
            >
              {bloqueada ? "🔒 Bloqueada" : "Solo lectura"}
            </span>
          )}

          <Menu
            trigger="…"
            items={acciones}
            align="end"
            panelWidth="w-56"
            triggerClassName="rounded-md px-2 py-1 text-fg-muted transition-colors hover:bg-surface-hover hover:text-fg"
            triggerTitle="Más acciones"
            aria-label="Acciones de la página"
          />
        </div>
      </div>

      <HistorialDePagina
        paginaId={paginaId}
        abierto={historialAbierto}
        puedeRestaurar={editable}
        onCerrar={() => setHistorialAbierto(false)}
      />
    </header>
  );
}
