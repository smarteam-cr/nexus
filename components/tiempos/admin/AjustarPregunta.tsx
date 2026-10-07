"use client";

/**
 * components/tiempos/admin/AjustarPregunta.tsx — «Ajustar» de una pregunta de tiempo en Feedback › Encuestas (2026-10-05).
 *
 * El panel lateral con todo lo que decide una pregunta: a quién (rol, frente o persona), en qué tareas (tipo de fase,
 * quién la hace, proyectos) o qué documentos, el texto y sus opciones de un clic, cuándo se ve lo que supone la carga
 * y cada cuánto (muestreo y tope por día). Guarda con PATCH /api/tiempos/encuestas/[momento]; el servidor valida.
 */
import { useMemo, useState } from "react";
import { Drawer } from "@/components/ui/Drawer";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Segmentado } from "@/components/ui/Segmentado";
import { BotonAzul, BotonTexto, ROTULO_DEL_SISTEMA } from "@/components/ui/sistema";
import { useToast } from "@/components/ui/Toast";
import { fetchJson } from "@/lib/api/fetch-json";
import { cn } from "@/lib/cn";
import { ROLE_OPTIONS } from "@/components/team/roles-ui";
import { FRENTES } from "@/lib/para-ti/frentes";
import {
  DOCUMENTOS,
  META_PARA_CALIBRAR,
  PARTIES,
  TIPOS_DE_FASE,
  formatoMinutos,
  type ConfigDeEncuesta,
  type ModoDeEstimacion,
  type ModoDeMuestreo,
} from "@/lib/tiempos/reglas";
import type { DatosDeTiempos, FilaDeEncuesta } from "@/lib/tiempos/tipos";

const AYUDA_ESTIMACION: Record<ModoDeEstimacion, string> = {
  despues: "Aparece después de responder, para comparar. Es la que mejor calibra: no empuja la respuesta.",
  lado: "Se ve junto a las opciones. Ojo: empuja a elegir ese número, y la respuesta deja de servir para corregirlo.",
  no: "No se muestra. La carga la sigue usando igual.",
};

function Casilla({ marcada, onCambio, children, deshabilitada }: { marcada: boolean; onCambio: (v: boolean) => void; children: React.ReactNode; deshabilitada?: boolean }) {
  return (
    <label className={cn("flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-1 text-[13px] text-fg-secondary hover:bg-surface-hover", deshabilitada && "cursor-default opacity-50")}>
      <input type="checkbox" checked={marcada} disabled={deshabilitada} onChange={(e) => onCambio(e.target.checked)} className="h-3.5 w-3.5 accent-[var(--color-primary)]" />
      {children}
    </label>
  );
}

function alternar<T>(lista: readonly T[], x: T, si: boolean): T[] {
  return si ? (lista.includes(x) ? [...lista] : [...lista, x]) : lista.filter((y) => y !== x);
}

function Bloque({ titulo, ayuda, children }: { titulo: string; ayuda?: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2 border-t border-line pt-4 first:border-t-0 first:pt-0">
      <div>
        <p className={ROTULO_DEL_SISTEMA}>{titulo}</p>
        {ayuda && <p className="mt-0.5 text-xs text-fg-muted">{ayuda}</p>}
      </div>
      {children}
    </section>
  );
}

/** Una lista larga con buscador: personas o proyectos. */
function ListaConBuscador({
  items,
  elegidos,
  onCambio,
  placeholder,
}: {
  items: { clave: string; texto: string; detalle?: string }[];
  elegidos: readonly string[];
  onCambio: (v: string[]) => void;
  placeholder: string;
}) {
  const [q, setQ] = useState("");
  const visibles = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (t ? items.filter((i) => i.texto.toLowerCase().includes(t)) : items).slice(0, 60);
  }, [items, q]);
  return (
    <div className="space-y-1.5">
      <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder} aria-label={placeholder} />
      <div className="max-h-48 overflow-y-auto rounded-lg border border-line p-1">
        {visibles.length === 0 ? (
          <p className="px-1.5 py-1 text-xs text-fg-muted">Nada con ese nombre.</p>
        ) : (
          visibles.map((i) => (
            <Casilla key={i.clave} marcada={elegidos.includes(i.clave)} onCambio={(v) => onCambio(alternar(elegidos, i.clave, v))}>
              <span className="min-w-0 truncate">{i.texto}</span>
              {i.detalle && <span className="ml-auto shrink-0 text-xs text-fg-muted">{i.detalle}</span>}
            </Casilla>
          ))
        )}
      </div>
      {elegidos.length > 0 && <p className="text-xs text-fg-muted">{elegidos.length} elegidos</p>}
    </div>
  );
}

export default function AjustarPregunta({
  encuesta,
  datos,
  onCerrar,
  onGuardada,
}: {
  encuesta: FilaDeEncuesta;
  datos: Pick<DatosDeTiempos, "personas" | "proyectos">;
  onCerrar: () => void;
  onGuardada: () => void;
}) {
  const toast = useToast();
  const [c, setC] = useState<ConfigDeEncuesta>(() => structuredClone(encuesta.config));
  const [proyectosModo, setProyectosModo] = useState<"todos" | "algunos">(encuesta.config.tareas.proyectos.length > 0 ? "algunos" : "todos");
  const [guardando, setGuardando] = useState(false);
  const esTarea = encuesta.momento === "TAREA_HECHA";
  const esDocumento = encuesta.momento === "DOCUMENTO_PUBLICADO";
  const set = (cambio: Partial<ConfigDeEncuesta>) => setC((x) => ({ ...x, ...cambio }));

  const guardar = async () => {
    const config: ConfigDeEncuesta = {
      ...c,
      tareas: { ...c.tareas, proyectos: proyectosModo === "todos" ? [] : c.tareas.proyectos },
      opciones: c.opciones.map((o) => ({ texto: o.texto.trim(), minutos: o.minutos })),
    };
    if (proyectosModo === "algunos" && config.tareas.proyectos.length === 0) {
      toast.error("Elige al menos un proyecto, o vuelve a «Todos».");
      return;
    }
    setGuardando(true);
    try {
      await fetchJson(`/api/tiempos/encuestas/${encuesta.momento}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ config }),
      });
      toast.success("Guardado. Vale desde la próxima pregunta.");
      onGuardada();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo guardar.");
    } finally {
      setGuardando(false);
    }
  };

  const nadie = c.aQuien.roles.length + c.aQuien.frentes.length + c.aQuien.personas.length === 0;

  return (
    <Drawer
      open
      onClose={onCerrar}
      size="lg"
      title={`Ajustar «${encuesta.nombre}»`}
      description={encuesta.cuando}
      footer={
        <div className="flex items-center justify-end gap-2">
          <BotonTexto onClick={onCerrar}>Cancelar</BotonTexto>
          <BotonAzul onClick={() => void guardar()} disabled={guardando}>
            {guardando ? "Guardando…" : "Guardar"}
          </BotonAzul>
        </div>
      }
    >
      <div className="space-y-5">
        <Bloque titulo="A quién" ayuda="Le llega a quien cumpla una de las tres: su rol, uno de los frentes que lleva o su nombre en la lista.">
          <div className="grid grid-cols-2 gap-x-2">
            {ROLE_OPTIONS.map((r) => (
              <Casilla key={r.value} marcada={c.aQuien.roles.includes(r.value)} onCambio={(v) => set({ aQuien: { ...c.aQuien, roles: alternar(c.aQuien.roles, r.value, v) } })}>
                {r.label}
              </Casilla>
            ))}
          </div>
          <p className="pt-1 text-xs font-medium text-fg-secondary">Frentes</p>
          <div className="grid grid-cols-2 gap-x-2">
            {FRENTES.filter((f) => f.activo).map((f) => (
              <Casilla key={f.clave} marcada={c.aQuien.frentes.includes(f.clave)} onCambio={(v) => set({ aQuien: { ...c.aQuien, frentes: alternar(c.aQuien.frentes, f.clave, v) } })}>
                {f.nombre}
              </Casilla>
            ))}
          </div>
          <p className="pt-1 text-xs font-medium text-fg-secondary">Personas</p>
          <ListaConBuscador
            items={datos.personas.map((p) => ({ clave: p.email, texto: p.nombre, detalle: p.rol }))}
            elegidos={c.aQuien.personas}
            onCambio={(personas) => set({ aQuien: { ...c.aQuien, personas } })}
            placeholder="Buscar a alguien"
          />
          {nadie && <p className="text-xs text-warn-ink">Así no le llega a nadie.</p>}
        </Bloque>

        {esTarea && (
          <Bloque titulo="En qué tareas" ayuda="Solo en las que hace Smarteam pesan en la carga de Customer Success. Las del cliente no se preguntan por defecto.">
            <p className="text-xs font-medium text-fg-secondary">Tipo de fase</p>
            <div className="grid grid-cols-2 gap-x-2">
              {TIPOS_DE_FASE.map((t) => (
                <Casilla key={t.clave} marcada={c.tareas.tipos.includes(t.clave)} onCambio={(v) => set({ tareas: { ...c.tareas, tipos: alternar(c.tareas.tipos, t.clave, v) } })}>
                  {t.nombre}
                </Casilla>
              ))}
            </div>
            <p className="pt-1 text-xs font-medium text-fg-secondary">Quién la hace</p>
            <div className="grid grid-cols-2 gap-x-2">
              {PARTIES.map((p) => (
                <Casilla key={p.clave} marcada={c.tareas.parties.includes(p.clave)} onCambio={(v) => set({ tareas: { ...c.tareas, parties: alternar(c.tareas.parties, p.clave, v) } })}>
                  {p.nombre}
                </Casilla>
              ))}
            </div>
            <p className="pt-1 text-xs font-medium text-fg-secondary">Proyectos</p>
            <Segmentado<"todos" | "algunos">
              etiqueta="Proyectos"
              valor={proyectosModo}
              onCambio={setProyectosModo}
              opciones={[
                { clave: "todos", etiqueta: "Todos" },
                { clave: "algunos", etiqueta: "Solo algunos" },
              ]}
            />
            {proyectosModo === "algunos" && (
              <ListaConBuscador
                items={datos.proyectos.map((p) => ({ clave: p.id, texto: p.nombre }))}
                elegidos={c.tareas.proyectos}
                onCambio={(proyectos) => set({ tareas: { ...c.tareas, proyectos } })}
                placeholder="Buscar un proyecto con cronograma"
              />
            )}
          </Bloque>
        )}

        {esDocumento && (
          <Bloque titulo="Qué documentos" ayuda="Solo la primera vez que se publica cada uno: republicar una corrección no vuelve a preguntar.">
            <div className="grid grid-cols-2 gap-x-2">
              {DOCUMENTOS.map((d) => (
                <Casilla key={d.clave} marcada={c.documentos.includes(d.clave)} onCambio={(v) => set({ documentos: alternar(c.documentos, d.clave, v) })}>
                  {d.nombre}
                </Casilla>
              ))}
            </div>
          </Bloque>
        )}

        <Bloque titulo="La pregunta" ayuda="Las respuestas se guardan siempre en minutos. «Otro…» va siempre al final, para escribir el número.">
          <Field label="Texto">
            <Input value={c.pregunta} onChange={(e) => set({ pregunta: e.target.value })} maxLength={160} />
          </Field>
          <div className="space-y-1.5">
            {c.opciones.map((o, i) => (
              <div key={i} className="flex items-center gap-2">
                <Input
                  value={o.texto}
                  onChange={(e) => set({ opciones: c.opciones.map((x, j) => (j === i ? { ...x, texto: e.target.value } : x)) })}
                  aria-label={`Texto de la opción ${i + 1}`}
                  className="flex-1"
                />
                <Input
                  type="number"
                  min={1}
                  value={String(o.minutos)}
                  onChange={(e) => set({ opciones: c.opciones.map((x, j) => (j === i ? { ...x, minutos: Math.max(1, Math.round(Number(e.target.value) || 0)) } : x)) })}
                  aria-label={`Minutos de la opción ${i + 1}`}
                  className="w-24"
                />
                <span className="w-16 text-xs tabular-nums text-fg-muted">{formatoMinutos(o.minutos)}</span>
                <BotonTexto disabled={c.opciones.length <= 2} onClick={() => set({ opciones: c.opciones.filter((_, j) => j !== i) })} title="Quitar esta opción">
                  Quitar
                </BotonTexto>
              </div>
            ))}
            {c.opciones.length < 8 && (
              <BotonTexto onClick={() => set({ opciones: [...c.opciones, { texto: "", minutos: 60 }] })}>+ Opción</BotonTexto>
            )}
          </div>
        </Bloque>

        <Bloque titulo="Lo que supone la carga">
          <Segmentado<ModoDeEstimacion>
            etiqueta="Cuándo se ve lo que supone la carga"
            valor={c.estimacion}
            onCambio={(estimacion) => set({ estimacion })}
            opciones={[
              { clave: "despues", etiqueta: "Después de responder" },
              { clave: "lado", etiqueta: "Al lado" },
              { clave: "no", etiqueta: "No mostrarla" },
            ]}
          />
          <p className="text-xs text-fg-muted">{AYUDA_ESTIMACION[c.estimacion]}</p>
        </Bloque>

        <Bloque titulo="Cada cuánto" ayuda="La misma tarea cae siempre igual: desmarcarla y volver a marcarla no cambia nada.">
          <div className="space-y-1">
            {(
              [
                ["todas", "Todas", "Cada una trae su pregunta, hasta el tope del día"],
                ["uno_de", `1 de cada ${c.muestreo.cadaN}`, "Siempre la misma proporción"],
                ["calibrar", `Todas hasta tener ${META_PARA_CALIBRAR} por tipo; después, 1 de cada ${c.muestreo.cadaN}`, "Junta rápido lo que falta para calibrar y después solo mantiene el número al día"],
              ] as [ModoDeMuestreo, string, string][]
            ).map(([modo, nombre, detalle]) => (
              <label key={modo} className={cn("flex cursor-pointer gap-2.5 rounded-lg border p-2.5", c.muestreo.modo === modo ? "border-info-line bg-info-surface" : "border-line")}>
                <input type="radio" name="muestreo" checked={c.muestreo.modo === modo} onChange={() => set({ muestreo: { ...c.muestreo, modo } })} className="mt-0.5 accent-[var(--color-primary)]" />
                <span className="flex flex-col">
                  <span className="text-[13px] font-medium text-fg">{nombre}</span>
                  <span className="text-xs text-fg-muted">{detalle}</span>
                </span>
              </label>
            ))}
          </div>
          {c.muestreo.modo !== "todas" && (
            <Field label="Una de cada" hint="Entre 2 y 20.">
              <Input type="number" min={2} max={20} value={String(c.muestreo.cadaN)} onChange={(e) => set({ muestreo: { ...c.muestreo, cadaN: Math.min(20, Math.max(2, Math.round(Number(e.target.value) || 2))) } })} className="w-24" />
            </Field>
          )}
          <div className="flex flex-wrap items-end gap-3">
            <Field label="Como mucho por persona y por día">
              <Input
                type="number"
                min={1}
                max={50}
                disabled={c.topePorDia === null}
                value={c.topePorDia === null ? "" : String(c.topePorDia)}
                onChange={(e) => set({ topePorDia: Math.min(50, Math.max(1, Math.round(Number(e.target.value) || 1))) })}
                className="w-24"
              />
            </Field>
            <Casilla marcada={c.topePorDia === null} onCambio={(v) => set({ topePorDia: v ? null : 3 })}>
              Sin tope
            </Casilla>
          </div>
        </Bloque>
      </div>
    </Drawer>
  );
}
