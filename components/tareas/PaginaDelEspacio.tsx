"use client";

/**
 * components/tareas/PaginaDelEspacio.tsx — un espacio y sus proyectos (docs/tareas-plan.md §5.3 y §9.2).
 *
 * Sus proyectos como tarjetas (avance, responsable, para quién) que llevan a la página de cada uno, «+ Proyecto» y, en
 * uno libre, «Miembros» (sumar y quitar, si lo administras) y archivarlo cuando no le quedan proyectos activos.
 */
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ConfirmDialog, Drawer, PageHeader, Select } from "@/components/ui";
import { BotonAzul, BotonBlanco, BotonTexto, ROTULO_DEL_SISTEMA } from "@/components/ui/sistema";
import { useToast } from "@/components/ui/Toast";
import { SHELL_DEFAULT } from "@/lib/ui/page-shell";
import { NOMBRE_DEL_ESTADO_DE_PROYECTO } from "@/lib/tareas/estados";
import type { DatosDelEspacio, PersonaVista } from "@/lib/tareas/tipos";
import { apiTareas } from "./api";
import { Chip } from "./chips";
import { BotonDelAsistente } from "./AsistenteDeTareas";

export default function PaginaDelEspacio({ inicial, yo }: { inicial: DatosDelEspacio; yo: string }) {
  const router = useRouter();
  const toast = useToast();
  const [datos, setDatos] = useState(inicial);
  const [nuevo, setNuevo] = useState("");
  const [responsable, setResponsable] = useState(yo);
  const [creando, setCreando] = useState(false);
  const [verMiembros, setVerMiembros] = useState(false);
  const [archivar, setArchivar] = useState(false);
  const e = datos.espacio;

  async function crearProyecto() {
    if (!nuevo.trim() || creando) return;
    setCreando(true);
    try {
      const r = await apiTareas.crearProyecto({ nombre: nuevo.trim(), espacioId: e.id, responsableEmail: responsable });
      router.push(`/tareas/proyectos/${r.id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo crear el proyecto.");
      setCreando(false);
    }
  }

  const activos = datos.proyectos.filter((p) => p.estado === "activo" || p.estado === "en_pausa" || p.estado === "propuesta");
  const cerrados = datos.proyectos.filter((p) => p.estado === "terminado");

  return (
    <div className={SHELL_DEFAULT}>
      <div className="space-y-5 pb-12">
        <PageHeader
          title={e.nombre}
          crumbs={[{ label: "Mis tareas", href: "/tareas" }, { label: e.nombre }]}
          description={`${e.tipo === "equipo" ? "Espacio del equipo" : "Espacio libre"} · ${e.miembros.length === 1 ? "1 persona" : `${e.miembros.length} personas`} · ${e.visibilidad === "todos" ? "lo ve todo Smarteam" : "lo ven sus miembros"}`}
          action={
            <div className="flex flex-wrap items-center gap-2">
              <BotonBlanco onClick={() => setVerMiembros(true)}>Miembros</BotonBlanco>
              <BotonDelAsistente />
            </div>
          }
        />

        <section className="space-y-2">
          <p className={ROTULO_DEL_SISTEMA}>Proyectos · {activos.length}</p>
          {activos.length === 0 ? (
            <p className="rounded-xl border border-dashed border-line px-4 py-6 text-[13px] text-fg-muted">Todavía no tiene proyectos activos.</p>
          ) : (
            <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {activos.map((p) => (
                <li key={p.id}>
                  <Link href={`/tareas/proyectos/${p.id}`} className="block h-full space-y-2 rounded-xl border border-line bg-surface px-4 py-3 transition-colors hover:bg-surface-hover">
                    <p className="text-sm font-medium text-fg">{p.nombre}</p>
                    <div className="h-1.5 overflow-hidden rounded-full bg-surface-hover">
                      <div className="h-full rounded-full bg-brand" style={{ width: `${p.avance.total ? Math.round((p.avance.hechas / p.avance.total) * 100) : 0}%` }} />
                    </div>
                    <p className="text-xs text-fg-muted">
                      {p.avance.hechas} de {p.avance.total} hechas · {p.responsable?.nombre ?? "Sin responsable"}
                    </p>
                    <span className="flex flex-wrap gap-1">
                      {p.estado !== "activo" && <Chip tono={p.estado === "propuesta" ? "azul" : "neutro"}>{p.estado === "propuesta" ? "Sugerido" : NOMBRE_DEL_ESTADO_DE_PROYECTO[p.estado]}</Chip>}
                      {p.ambito.ambito !== "sin_clasificar" && <Chip>{p.ambito.etiqueta}</Chip>}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="space-y-2 rounded-xl border border-line bg-surface px-4 py-3">
          <p className={ROTULO_DEL_SISTEMA}>Nuevo proyecto</p>
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={nuevo}
              onChange={(ev) => setNuevo(ev.target.value)}
              onKeyDown={(ev) => ev.key === "Enter" && void crearProyecto()}
              maxLength={120}
              placeholder="Nombre del proyecto"
              aria-label="Nombre del proyecto nuevo"
              className="h-9 min-w-0 flex-1 rounded-lg border border-line bg-surface px-3 text-[13px] text-fg outline-none placeholder:text-fg-muted"
            />
            <Select value={responsable} onChange={(ev) => setResponsable(ev.target.value)} aria-label="Responsable" className="h-9 w-56 py-1 text-[13px]">
              {e.miembros.map((m) => (
                <option key={m.email} value={m.email}>
                  {m.email === yo ? `${m.nombre} (tú)` : m.nombre}
                </option>
              ))}
            </Select>
            <BotonAzul onClick={() => void crearProyecto()} disabled={!nuevo.trim() || creando}>
              {creando ? "Creando…" : "Crear"}
            </BotonAzul>
          </div>
        </section>

        {cerrados.length > 0 && (
          <details className="rounded-xl border border-line px-4 py-2.5 text-[13px]">
            <summary className="cursor-pointer text-fg-secondary">{cerrados.length === 1 ? "1 terminado" : `${cerrados.length} terminados`}</summary>
            <ul className="mt-2 space-y-1">
              {cerrados.map((p) => (
                <li key={p.id}>
                  <Link href={`/tareas/proyectos/${p.id}`} className="text-fg hover:underline">
                    {p.nombre}
                  </Link>
                </li>
              ))}
            </ul>
          </details>
        )}

        {e.tipo === "libre" && e.puedeAdministrar && (
          <div className="border-t border-line pt-4">
            <BotonTexto onClick={() => setArchivar(true)} disabled={activos.length > 0} title={activos.length ? "Termina sus proyectos antes de archivarlo." : undefined}>
              Archivar el espacio
            </BotonTexto>
          </div>
        )}
      </div>

      <MiembrosDelEspacio abierto={verMiembros} datos={datos} yo={yo} onCerrar={() => setVerMiembros(false)} onCambio={setDatos} />
      <ConfirmDialog
        open={archivar}
        title={`¿Archivar «${e.nombre}»?`}
        description="Deja de verse en Tus espacios. Sus proyectos terminados y sus tareas no se borran."
        confirmLabel="Archivar"
        variant="default"
        onCancel={() => setArchivar(false)}
        onConfirm={async () => {
          try {
            await apiTareas.cambiarEspacio(e.id, { accion: "archivar", version: e.version });
            toast.success("Espacio archivado.");
            router.push("/tareas");
          } catch (err) {
            toast.error(err instanceof Error ? err.message : "No se pudo archivar.");
            setArchivar(false);
          }
        }}
      />
    </div>
  );
}

function MiembrosDelEspacio({
  abierto,
  datos,
  yo,
  onCerrar,
  onCambio,
}: {
  abierto: boolean;
  datos: DatosDelEspacio;
  yo: string;
  onCerrar: () => void;
  onCambio: (d: DatosDelEspacio) => void;
}) {
  const toast = useToast();
  const [personas, setPersonas] = useState<PersonaVista[] | null>(null);
  const [sumar, setSumar] = useState("");
  const e = datos.espacio;
  const editable = e.tipo === "libre" && e.puedeAdministrar;

  async function cargarPersonas() {
    if (personas) return;
    try {
      setPersonas((await apiTareas.opciones()).personas);
    } catch {
      setPersonas([]);
    }
  }

  async function cambiar(body: { accion: "sumar" | "quitar"; email: string }) {
    try {
      onCambio(await apiTareas.cambiarEspacio(e.id, body));
      setSumar("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo guardar.");
    }
  }

  const disponibles = (personas ?? []).filter((p) => !e.miembros.some((m) => m.email === p.email));

  return (
    <Drawer open={abierto} onClose={onCerrar} size="md" title="Miembros" description={e.tipo === "equipo" ? "Salen del área de cada persona." : "Se asignan tareas entre sí directo."}>
      <ul className="divide-y divide-line rounded-lg border border-line">
        {e.miembros.map((m) => (
          <li key={m.email} className="flex items-center gap-2 px-3 py-2 text-[13px]">
            <span className="min-w-0 flex-1 truncate text-fg">
              {m.nombre}
              {m.email === yo ? " (tú)" : ""}
            </span>
            {m.rol === "admin" && <Chip>Admin</Chip>}
            {editable && (
              <BotonTexto onClick={() => void cambiar({ accion: "quitar", email: m.email })}>Quitar</BotonTexto>
            )}
          </li>
        ))}
      </ul>
      {editable && (
        <div className="mt-4 flex items-center gap-2" onFocus={() => void cargarPersonas()}>
          <Select value={sumar} onChange={(ev) => setSumar(ev.target.value)} onMouseDown={() => void cargarPersonas()} aria-label="Sumar a alguien" className="h-9 min-w-0 flex-1 py-1 text-[13px]">
            <option value="">Sumar a alguien del equipo…</option>
            {disponibles.map((p) => (
              <option key={p.email} value={p.email}>
                {p.nombre}
              </option>
            ))}
          </Select>
          <BotonBlanco onClick={() => sumar && void cambiar({ accion: "sumar", email: sumar })} disabled={!sumar}>
            Sumar
          </BotonBlanco>
        </div>
      )}
    </Drawer>
  );
}
