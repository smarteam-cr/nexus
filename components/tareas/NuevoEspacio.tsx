"use client";

/**
 * components/tareas/NuevoEspacio.tsx — crear un espacio libre («Evento SmartAgro», docs/tareas-plan.md §5.3).
 *
 * Nombre, quién lo ve (sus miembros · todo Smarteam) y sus miembros. Quien lo crea queda como admin y el espacio nace
 * con su primer proyecto, del mismo nombre. A cada miembro le llega un aviso.
 */
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Field, Input, Modal, Segmentado } from "@/components/ui";
import { BotonAzul, BotonTexto, ROTULO_DEL_SISTEMA } from "@/components/ui/sistema";
import { useToast } from "@/components/ui/Toast";
import type { PersonaVista } from "@/lib/tareas/tipos";
import { apiTareas } from "./api";

export function NuevoEspacio({ yo, onCerrar }: { yo: string; onCerrar: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const [nombre, setNombre] = useState("");
  const [visibilidad, setVisibilidad] = useState<"miembros" | "todos">("miembros");
  const [personas, setPersonas] = useState<PersonaVista[]>([]);
  const [elegidas, setElegidas] = useState<Set<string>>(new Set());
  const [busca, setBusca] = useState("");
  const [creando, setCreando] = useState(false);

  useEffect(() => {
    apiTareas
      .opciones()
      .then((o) => setPersonas(o.personas.filter((p) => p.email !== yo)))
      .catch(() => undefined);
  }, [yo]);

  async function crear() {
    if (!nombre.trim() || creando) return;
    setCreando(true);
    try {
      const r = await apiTareas.crearEspacio({ nombre: nombre.trim(), visibilidad, miembros: [...elegidas] });
      toast.success(`Listo: «${nombre.trim()}» ya tiene su primer proyecto.`);
      router.push(`/tareas/espacios/${r.espacioId}`);
      onCerrar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo crear el espacio.");
    } finally {
      setCreando(false);
    }
  }

  const filtradas = personas.filter((p) => !busca || p.nombre.toLowerCase().includes(busca.toLowerCase()));

  return (
    <Modal
      open
      onClose={onCerrar}
      size="lg"
      title="Nuevo espacio"
      description="Para un trabajo que junta a personas de varios equipos (un evento, una campaña). Nace con su primer proyecto."
      footer={
        <div className="flex w-full items-center justify-end gap-2">
          <BotonTexto onClick={onCerrar}>Cancelar</BotonTexto>
          <BotonAzul onClick={() => void crear()} disabled={!nombre.trim() || creando}>
            {creando ? "Creando…" : "Crear el espacio"}
          </BotonAzul>
        </div>
      }
    >
      <div className="space-y-4">
        <Field label="Nombre">
          <Input autoFocus value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={80} placeholder="Evento SmartAgro 2026" />
        </Field>
        <div className="space-y-1.5">
          <p className={ROTULO_DEL_SISTEMA}>¿Quién lo ve?</p>
          <Segmentado
            opciones={[
              { clave: "miembros", etiqueta: "Solo sus miembros" },
              { clave: "todos", etiqueta: "Todo Smarteam" },
            ]}
            valor={visibilidad}
            onCambio={setVisibilidad}
            etiqueta="Quién lo ve"
          />
        </div>
        <div className="space-y-1.5">
          <p className={ROTULO_DEL_SISTEMA}>Miembros · {elegidas.size + 1}</p>
          <p className="text-xs text-fg-muted">Tú quedas como admin. Sus miembros se asignan tareas entre sí directo.</p>
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar a alguien del equipo"
            aria-label="Buscar a alguien del equipo"
            className="h-8 w-full rounded-md border border-line bg-surface px-2.5 text-[13px] text-fg outline-none placeholder:text-fg-muted"
          />
          <ul className="max-h-56 divide-y divide-line overflow-y-auto rounded-md border border-line">
            {filtradas.map((p) => (
              <li key={p.email}>
                <label className="flex cursor-pointer items-center gap-2.5 px-3 py-2 text-[13px] text-fg hover:bg-surface-hover">
                  <input
                    type="checkbox"
                    checked={elegidas.has(p.email)}
                    onChange={(e) =>
                      setElegidas((s) => {
                        const n = new Set(s);
                        if (e.target.checked) n.add(p.email);
                        else n.delete(p.email);
                        return n;
                      })
                    }
                  />
                  <span className="min-w-0 flex-1 truncate">{p.nombre}</span>
                </label>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Modal>
  );
}
