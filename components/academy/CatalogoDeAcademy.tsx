"use client";

/**
 * components/academy/CatalogoDeAcademy.tsx — el catálogo de listas de HubSpot Academy (Q1 del roadmap, 2026-10-27).
 *
 * Una tabla por rol (líderes, Ventas, Marketing, Servicio) con el nombre, el hub, la duración y el enlace. La líder de
 * Customer Success y dirección suman, cambian y archivan; el resto del equipo lo consulta. Lo que hay acá es lo que
 * «Tu ruta en HubSpot Academy» del kickoff sugiere por los hubs vendidos (lib/kickoff/academy.ts).
 *
 * UI interna: primitivas y tokens, tuteo.
 */
import { useState } from "react";
import { cn } from "@/lib/cn";
import { Alert, Button, EmptyState, Field, Input, Modal, PageHeader, Select } from "@/components/ui";
import { useToast } from "@/components/ui/Toast";
import { ROTULO_DEL_SISTEMA } from "@/components/ui/sistema";
import {
  HUBS_DE_ACADEMY,
  ROLES_DE_ACADEMY,
  duracionEnPalabras,
  etiquetaDeHub,
  porQueNoSeGuarda,
  type ListaDelCatalogo,
} from "@/lib/kickoff/academy";

interface Borrador {
  id: string | null;
  nombre: string;
  enlace: string;
  hub: string;
  rol: string;
  duracion: string;
  descripcion: string;
}

const NUEVO: Borrador = { id: null, nombre: "", enlace: "", hub: "general", rol: "lideres", duracion: "", descripcion: "" };

export function CatalogoDeAcademy({
  listasIniciales,
  puedeEditar,
  contenedor,
}: {
  listasIniciales: ListaDelCatalogo[];
  puedeEditar: boolean;
  contenedor: string;
}) {
  const [listas, setListas] = useState(listasIniciales);
  const [borrador, setBorrador] = useState<Borrador | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const toast = useToast();

  const activas = listas.filter((l) => l.activa);
  const archivadas = listas.filter((l) => !l.activa);

  const reemplazar = (l: ListaDelCatalogo) => setListas((xs) => (xs.some((x) => x.id === l.id) ? xs.map((x) => (x.id === l.id ? l : x)) : [...xs, l]));

  const guardar = async () => {
    if (!borrador) return;
    const duracionMinutos = borrador.duracion.trim() ? Number(borrador.duracion) : null;
    const datos = {
      nombre: borrador.nombre,
      enlace: borrador.enlace,
      hub: borrador.hub,
      rol: borrador.rol,
      duracionMinutos,
      descripcion: borrador.descripcion.trim() || null,
    };
    const motivo = porQueNoSeGuarda(datos);
    if (motivo) return setError(motivo);
    setGuardando(true);
    try {
      const r = await fetch(borrador.id ? `/api/academy/${borrador.id}` : "/api/academy", {
        method: borrador.id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(datos),
      });
      const j = (await r.json().catch(() => null)) as { lista?: ListaDelCatalogo; error?: string } | null;
      if (!r.ok || !j?.lista) return setError(j?.error ?? "No se pudo guardar. Vuelve a intentarlo.");
      reemplazar(j.lista);
      setBorrador(null);
      toast.success(borrador.id ? "Lista actualizada." : "Lista sumada al catálogo.");
    } catch {
      setError("Error de conexión.");
    } finally {
      setGuardando(false);
    }
  };

  const archivar = async (l: ListaDelCatalogo, activa: boolean) => {
    const r = await fetch(`/api/academy/${l.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ activa }) }).catch(() => null);
    const j = r ? ((await r.json().catch(() => null)) as { lista?: ListaDelCatalogo; error?: string } | null) : null;
    if (!r?.ok || !j?.lista) return toast.error(j?.error ?? "No se pudo cambiar. Vuelve a intentarlo.");
    reemplazar(j.lista);
  };

  const abrir = (l?: ListaDelCatalogo) => {
    setError(null);
    setBorrador(
      l
        ? { id: l.id, nombre: l.nombre, enlace: l.enlace, hub: l.hub, rol: l.rol, duracion: l.duracionMinutos != null ? String(l.duracionMinutos) : "", descripcion: l.descripcion ?? "" }
        : { ...NUEVO },
    );
  };

  const tabla = (filas: ListaDelCatalogo[], archivada: boolean) => (
    <div className="overflow-x-auto rounded-lg border border-line bg-surface">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-line text-left text-xs text-fg-muted">
            <th className="px-3 py-2 font-medium">Lista</th>
            <th className="px-3 py-2 font-medium">Hub</th>
            <th className="px-3 py-2 font-medium">Duración</th>
            {puedeEditar && <th className="px-3 py-2" />}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {filas.map((l) => (
            <tr key={l.id} className={archivada ? "text-fg-muted" : undefined}>
              <td className="px-3 py-2">
                <a href={l.enlace} target="_blank" rel="noopener noreferrer" className="font-medium text-brand hover:underline">
                  {l.nombre}
                </a>
                {l.descripcion && <p className="text-xs text-fg-muted">{l.descripcion}</p>}
              </td>
              <td className="px-3 py-2 text-fg-secondary">{etiquetaDeHub(l.hub)}</td>
              <td className="px-3 py-2 text-fg-secondary">{duracionEnPalabras(l.duracionMinutos) || "—"}</td>
              {puedeEditar && (
                <td className="px-3 py-2 text-right whitespace-nowrap">
                  {!archivada && (
                    <Button size="xs" variant="ghost" onClick={() => abrir(l)}>
                      Editar
                    </Button>
                  )}
                  <Button size="xs" variant="ghost" onClick={() => void archivar(l, archivada)}>
                    {archivada ? "Volver a usar" : "Archivar"}
                  </Button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className={cn(contenedor, "space-y-6")}>
      <PageHeader
        title="HubSpot Academy"
        crumbs={[{ label: "Éxito del cliente", href: "/customer-success" }, { label: "HubSpot Academy" }]}
        description="Las listas de reproducción de HubSpot Academy que le asignamos a cada cliente en su kickoff. La sección «Tu ruta en HubSpot Academy» sugiere las de los hubs vendidos, por rol; el CSE ajusta."
        action={
          puedeEditar ? (
            <Button variant="primary" size="sm" onClick={() => abrir()}>
              Sumar una lista
            </Button>
          ) : undefined
        }
      />

      {!activas.length ? (
        <EmptyState
          title="El catálogo está vacío"
          description={
            puedeEditar
              ? "Suma las listas de HubSpot Academy que usa el equipo: nombre, enlace, hub, para quién es y cuánto dura."
              : "La líder de Customer Success suma las listas. Mientras tanto, el kickoff no sugiere ninguna."
          }
        />
      ) : (
        ROLES_DE_ACADEMY.map((r) => {
          const filas = activas.filter((l) => l.rol === r.value);
          if (!filas.length) return null;
          return (
            <section key={r.value} className="space-y-2">
              <h2 className="text-sm font-semibold text-fg">
                {r.label}
                <span className="ml-2 font-normal text-fg-muted">{filas.length}</span>
              </h2>
              {tabla(filas, false)}
            </section>
          );
        })
      )}

      {archivadas.length > 0 && (
        <section className="space-y-2">
          <p className={ROTULO_DEL_SISTEMA}>Archivadas · los kickoffs que ya las tienen las conservan</p>
          {tabla(archivadas, true)}
        </section>
      )}

      <Modal
        open={!!borrador}
        onClose={() => setBorrador(null)}
        title={borrador?.id ? "Editar la lista" : "Sumar una lista"}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setBorrador(null)}>
              Cancelar
            </Button>
            <Button variant="primary" loading={guardando} onClick={() => void guardar()}>
              Guardar
            </Button>
          </div>
        }
      >
        {borrador && (
          <div className="space-y-4">
            <Field label="Nombre" required>
              <Input value={borrador.nombre} onChange={(e) => setBorrador({ ...borrador, nombre: e.target.value })} placeholder="Ventas con HubSpot para principiantes" />
            </Field>
            <Field label="Enlace" required hint="El de la lista en academy.hubspot.com (https://…).">
              <Input value={borrador.enlace} onChange={(e) => setBorrador({ ...borrador, enlace: e.target.value })} placeholder="https://academy.hubspot.com/…" />
            </Field>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Para quién">
                <Select value={borrador.rol} onChange={(e) => setBorrador({ ...borrador, rol: e.target.value })}>
                  {ROLES_DE_ACADEMY.map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Hub">
                <Select value={borrador.hub} onChange={(e) => setBorrador({ ...borrador, hub: e.target.value })}>
                  {HUBS_DE_ACADEMY.map((h) => (
                    <option key={h.value} value={h.value}>
                      {h.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Duración (minutos)">
                <Input inputMode="numeric" value={borrador.duracion} onChange={(e) => setBorrador({ ...borrador, duracion: e.target.value.replace(/[^\d]/g, "") })} placeholder="90" />
              </Field>
            </div>
            <Field label="Para qué sirve (opcional)">
              <Input value={borrador.descripcion} onChange={(e) => setBorrador({ ...borrador, descripcion: e.target.value })} />
            </Field>
            {error && <Alert variant="danger">{error}</Alert>}
          </div>
        )}
      </Modal>
    </div>
  );
}
