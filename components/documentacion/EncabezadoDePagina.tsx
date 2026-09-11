"use client";

/**
 * components/documentacion/EncabezadoDePagina.tsx — ícono, título y migas de una página.
 *
 * El título se edita en el lugar (clic y escribir), como en Notion. No usa el control de versión
 * del contenido a propósito: renombrar en una pestaña no tiene por qué hacer fallar el
 * autoguardado de la otra — son dos cambios que no chocan.
 *
 * El candado se muestra SIEMPRE que la página esté bloqueada, aunque quien mira no pueda
 * sacarlo: que el editor esté en solo lectura tiene que tener una explicación a la vista.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { fetchJson } from "@/lib/api/fetch-json";
import { Breadcrumbs, Menu, useToast, type MenuItemDef } from "@/components/ui";

/** Un puñado de íconos para elegir sin salir de la página. */
const ICONOS = ["📄", "🧭", "📈", "💼", "📣", "🎧", "⚙️", "🗺️", "✅", "⚠️", "💡", "🔧"];

interface Props {
  paginaId: string;
  titulo: string;
  icono: string | null;
  migas: { label: string; href: string }[];
  bloqueada: boolean;
  editable: boolean;
  puedeAdministrar: boolean;
}

export default function EncabezadoDePagina({
  paginaId,
  titulo,
  icono,
  migas,
  bloqueada,
  editable,
  puedeAdministrar,
}: Props) {
  const router = useRouter();
  const toast = useToast();
  const [editandoTitulo, setEditandoTitulo] = useState(false);

  async function guardar(datos: { titulo?: string; icono?: string | null }, exito: string) {
    try {
      await fetchJson(`/api/documentacion/paginas/${paginaId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(datos),
      });
      toast.success(exito);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo guardar.");
    }
  }

  const iconos: MenuItemDef[] = ICONOS.map((emoji) => ({
    key: emoji,
    label: <span className="text-base">{emoji}</span>,
    onSelect: () => void guardar({ icono: emoji }, "Ícono cambiado."),
  }));
  if (icono) {
    iconos.push({
      key: "sin-icono",
      label: "Sin ícono",
      separatorBefore: true,
      onSelect: () => void guardar({ icono: null }, "Ícono sacado."),
    });
  }

  return (
    <header className="mb-6">
      {migas.length > 0 && <Breadcrumbs crumbs={migas} className="mb-2" />}

      <div className="flex items-start gap-2">
        {editable ? (
          <Menu
            trigger={<span className="text-2xl leading-none">{icono ?? "📄"}</span>}
            items={iconos}
            panelWidth="w-44"
            triggerClassName="rounded px-1 hover:bg-surface-hover"
            triggerTitle="Cambiar el ícono"
            aria-label="Cambiar el ícono"
          />
        ) : (
          <span className="px-1 text-2xl leading-none" aria-hidden="true">
            {icono ?? "📄"}
          </span>
        )}

        {editandoTitulo ? (
          <input
            autoFocus
            defaultValue={titulo}
            className="min-w-0 flex-1 rounded border border-line bg-surface px-2 py-1 text-2xl font-semibold text-fg"
            onBlur={(e) => {
              setEditandoTitulo(false);
              const nuevo = e.target.value.trim();
              if (nuevo && nuevo !== titulo) void guardar({ titulo: nuevo }, "Título cambiado.");
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
                ? "min-w-0 flex-1 cursor-text rounded px-1 text-2xl font-semibold text-fg hover:bg-surface-hover"
                : "min-w-0 flex-1 px-1 text-2xl font-semibold text-fg"
            }
            onClick={() => editable && setEditandoTitulo(true)}
            title={editable ? "Clic para renombrar" : undefined}
          >
            {titulo}
          </h1>
        )}

        {bloqueada && (
          <span
            className="mt-1 shrink-0 rounded border border-warn-line bg-warn-surface px-2 py-0.5 text-2xs text-warn-ink"
            title={
              puedeAdministrar
                ? "Bloqueada. Podés desbloquearla desde el menú «…» del árbol."
                : "Bloqueada: la edita el liderazgo."
            }
          >
            🔒 Bloqueada
          </span>
        )}
      </div>
    </header>
  );
}
