"use client";

/**
 * components/siguiente-paso/DialogoDelSiguientePaso.tsx — fijar el siguiente paso de tu equipo sobre una empresa, un
 * negocio o un proyecto (2026-10-15, etapa 2 de docs/mi-dia-plan.md). Lo abren la cartera de «Para ti» y el panel de la
 * ficha del cliente. Se guarda en Nexus y se escribe en HubSpot (lib/siguiente-paso/escritura-server.ts).
 *
 * Desde el 2026-10-16 (fase 0.2) el siguiente paso es una TAREA del sprint del equipo: guardar cambia la que hoy es el
 * siguiente paso o crea una, y la lleva alguien de ese equipo.
 *
 * `hs_next_step` del negocio se ofrece como sugerencia («HubSpot dice»): se usa con un clic, nunca se escribe.
 */
import { useMemo, useState } from "react";
import { Field, Input, Modal, Segmentado, Select, Textarea } from "@/components/ui";
import { BotonAzul, BotonBlanco, BotonTexto, BotonUsar, FilaSugerida } from "@/components/ui/sistema";
import { useToast } from "@/components/ui/Toast";
import { fetchJson } from "@/lib/api/fetch-json";
import { fechaCorta } from "@/lib/ventas/negocios";
import { NOMBRE_DEL_EQUIPO, NOMBRE_DEL_OBJETO, estaVencido, type ObjetoDelPaso, type SiguientePasoVisto } from "@/lib/siguiente-paso/reglas";
import type { EquipoDelSiguientePaso } from "@/lib/siguiente-paso/propiedades";
import { hoyEnCostaRica, usePersonasDelPaso, type PersonasDelPaso } from "./personas";

export interface ObjetoParaElPaso {
  objeto: ObjetoDelPaso;
  objetoId: string;
  nombre: string;
  /** El pipeline y la etapa de un negocio, la empresa… una línea. */
  detalle?: string | null;
  /** Los vigentes de este objeto (de cualquier equipo). */
  pasos: SiguientePasoVisto[];
  /** `hs_next_step` del negocio. */
  sugerencia?: string | null;
}

interface PropsDelDialogo {
  objeto: ObjetoParaElPaso;
  equipoInicial?: EquipoDelSiguientePaso | null;
  /** `cambio` = se guardó o se dio por hecho algo: hay que volver a leer. */
  onCerrar: (cambio: boolean) => void;
}

export default function DialogoDelSiguientePaso(props: PropsDelDialogo) {
  const datos = usePersonasDelPaso();
  if (!datos) {
    return (
      <Modal open onClose={() => props.onCerrar(false)} title="Siguiente paso" size="md">
        <p className="text-[13px] text-fg-muted">Cargando…</p>
      </Modal>
    );
  }
  return <Formulario {...props} datos={datos} />;
}

function Formulario({ objeto: o, equipoInicial, onCerrar, datos }: PropsDelDialogo & { datos: PersonasDelPaso }) {
  const toast = useToast();
  const hoy = useMemo(() => hoyEnCostaRica(), []);
  const equipos = datos.equipos;
  const vigenteDe = (e: EquipoDelSiguientePaso | null) => (e ? (o.pasos.find((p) => p.equipo === e) ?? null) : null);
  // Lo que arranca escrito: lo vigente del equipo (la fecha, solo si no pasó); sin vigente, a cargo de quien escribe.
  const valoresDe = (e: EquipoDelSiguientePaso | null) => {
    const v = vigenteDe(e);
    const delEquipo = datos.personas.filter((p) => !!e && p.equipos.includes(e));
    const soyDelEquipo = delEquipo.some((p) => p.email === datos.yo);
    return {
      que: v?.que ?? "",
      fecha: v?.fecha && !estaVencido(v, hoy) ? v.fecha : "",
      // Lo lleva alguien del equipo: quien lo lleva hoy, quien escribe si es del equipo, o la primera persona.
      responsable: v?.responsableEmail ?? (soyDelEquipo ? datos.yo : (delEquipo[0]?.email ?? "")),
    };
  };
  const [elegido, setElegido] = useState<EquipoDelSiguientePaso | null>(() =>
    equipoInicial && equipos.includes(equipoInicial) ? equipoInicial : (equipos[0] ?? null),
  );
  const [form, setForm] = useState(() => valoresDe(elegido));
  const { que, fecha, responsable } = form;
  const setQue = (v: string) => setForm((f) => ({ ...f, que: v }));
  const setFecha = (v: string) => setForm((f) => ({ ...f, fecha: v }));
  const setResponsable = (v: string) => setForm((f) => ({ ...f, responsable: v }));
  const cambiarEquipo = (e: EquipoDelSiguientePaso) => {
    setElegido(e);
    setForm(valoresDe(e));
  };
  const vigente = vigenteDe(elegido);
  const [guardando, setGuardando] = useState(false);

  const personas = datos.personas.filter((p) => elegido && p.equipos.includes(elegido));

  const guardar = async () => {
    if (!elegido) return;
    if (!que.trim()) {
      toast.error("Escribe qué sigue.");
      return;
    }
    if (fecha && fecha < hoy) {
      toast.error("La fecha no puede ser anterior a hoy.");
      return;
    }
    setGuardando(true);
    try {
      const r = await fetchJson<{ hubspotEstado: string; estado: string; numero: number }>("/api/siguiente-paso", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ objeto: o.objeto, objetoId: o.objetoId, equipo: elegido, que: que.trim(), fecha: fecha || null, responsableEmail: responsable || null }),
      });
      const nombre = personas.find((p) => p.email === responsable)?.nombre ?? "esa persona";
      if (r.estado === "propuesta") toast.info(`Le llegó a ${nombre.split(" ")[0]} como sugerencia (T-${r.numero}): será el siguiente paso cuando la tome.`);
      else if (r.hubspotEstado === "error") toast.info("Quedó en Nexus. HubSpot no respondió: se vuelve a intentar en la próxima hora.");
      else if (r.hubspotEstado === "sin_hubspot") toast.success("Quedó en Nexus. Esta empresa no está en HubSpot.");
      else toast.success("Quedó guardado en Nexus y en HubSpot.");
      onCerrar(true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo guardar.");
      setGuardando(false);
    }
  };

  const hecho = async () => {
    if (!vigente) return;
    setGuardando(true);
    try {
      await fetchJson(`/api/siguiente-paso/${encodeURIComponent(vigente.id)}/hecho`, { method: "POST" });
      toast.success("Listo: la tarea quedó hecha y HubSpot se pone al día.");
      onCerrar(true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo dar por hecho.");
      setGuardando(false);
    }
  };

  const sinEquipo = equipos.length === 0;
  return (
    <Modal
      open
      onClose={() => onCerrar(false)}
      title="Siguiente paso"
      description={`${NOMBRE_DEL_OBJETO[o.objeto]} · ${o.nombre}${o.detalle ? ` · ${o.detalle}` : ""}`}
      size="md"
      footer={
        <div className="flex w-full items-center gap-2">
          {vigente && (
            <BotonTexto onClick={hecho} disabled={guardando} title="La tarea queda hecha; en HubSpot queda la que sigue o nada">
              Ya se hizo
            </BotonTexto>
          )}
          <span className="ml-auto" />
          <BotonBlanco onClick={() => onCerrar(false)} disabled={guardando}>
            Cancelar
          </BotonBlanco>
          {!sinEquipo && (
            <BotonAzul onClick={guardar} disabled={guardando}>
              {guardando ? "Guardando…" : "Guardar en HubSpot"}
            </BotonAzul>
          )}
        </div>
      }
    >
      {sinEquipo ? (
        <p className="text-[13px] text-fg-secondary">Tu equipo no lleva siguiente paso: lo escriben Ventas, Customer Success y Dev.</p>
      ) : (
        <div className="space-y-4">
          {equipos.length > 1 && (
            <Segmentado
              etiqueta="Equipo"
              opciones={equipos.map((e) => ({ clave: e, etiqueta: NOMBRE_DEL_EQUIPO[e] }))}
              valor={elegido}
              onCambio={cambiarEquipo}
            />
          )}

          {vigente ? (
            <p className="text-[13px] text-fg-secondary">
              Hoy dice: «{vigente.que}»
              {vigente.fecha && (
                <span className={estaVencido(vigente, hoy) ? "text-warn-ink" : ""}>
                  {" · "}
                  {estaVencido(vigente, hoy) ? `venció el ${fechaCorta(vigente.fecha)}` : `para el ${fechaCorta(vigente.fecha)}`}
                </span>
              )}
              {vigente.responsableNombre && ` · ${vigente.responsableNombre}`}.{" "}
              {vigente.tareaNumero ? `Es la tarea T-${vigente.tareaNumero}: lo que guardes la cambia.` : "Lo que guardes lo cambia."}
            </p>
          ) : (
            <p className="text-[13px] text-fg-secondary">
              {elegido ? `${NOMBRE_DEL_EQUIPO[elegido]} todavía no tiene un siguiente paso acá.` : ""} Queda como una tarea de su equipo y se escribe en
              HubSpot, con el mismo nombre en empresas, negocios y proyectos.
            </p>
          )}

          {o.sugerencia && elegido === "ventas" && o.sugerencia.trim() !== que.trim() && (
            <ul>
              <FilaSugerida origen="El siguiente paso que tiene el negocio en HubSpot" acciones={<BotonUsar onClick={() => setQue(o.sugerencia!.trim())} />}>
                HubSpot dice: «{o.sugerencia.trim()}»
              </FilaSugerida>
            </ul>
          )}

          <Field label="Qué sigue">
            <Textarea rows={3} value={que} maxLength={500} placeholder="Ej.: Enviar la propuesta con los dos escenarios" onChange={(ev) => setQue(ev.target.value)} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Para cuándo">
              <Input type="date" value={fecha} min={hoy} onChange={(ev) => setFecha(ev.target.value)} />
            </Field>
            <Field label="Quién lo lleva">
              <Select value={responsable} onChange={(ev) => setResponsable(ev.target.value)}>
                {personas.length === 0 && <option value="">Nadie del equipo</option>}
                {personas.map((p) => (
                  <option key={p.email} value={p.email}>
                    {p.email === datos.yo ? `${p.nombre} (yo)` : p.nombre}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        </div>
      )}
    </Modal>
  );
}
