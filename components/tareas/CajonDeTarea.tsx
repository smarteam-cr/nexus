"use client";

/**
 * components/tareas/CajonDeTarea.tsx — una tarea abierta en su cajón (`?t=<id>`, Drawer lg).
 *
 * Todo se guarda al cambiarlo (con la versión: si otra persona la cambió, 409 y se recarga). Lo que la persona no
 * puede hacer no se pinta (`tarea.acciones`, calculadas en el servidor con la misma regla que exige al guardar).
 */
import { useCallback, useEffect, useState } from "react";
import { CeldaSelect, Drawer, Field, Input, Interruptor, Segmentado, Textarea, type OpcionDeCelda } from "@/components/ui";
import { BotonAzul, BotonBlanco, BotonTexto, IconoDeSugerencia, ROTULO_DEL_SISTEMA } from "@/components/ui/sistema";
import { useToast } from "@/components/ui/Toast";
import DatePickerField from "@/components/ui/DatePickerField";
import { cn } from "@/lib/cn";
import { DURACIONES_DE_AGENDA } from "@/lib/tareas/reglas";
import { NOMBRE_DEL_ESTADO, NOMBRE_DEL_ORIGEN, type OrigenDeTarea } from "@/lib/tareas/estados";
import { diaYHora, rangoDeLaSemana, sumarSemanas } from "@/lib/tareas/semana";
import type { OpcionesDeTareas, TareaVista } from "@/lib/tareas/tipos";
import { apiTareas, ErrorDeApi } from "./api";
import { ChipDeAgenda, horas } from "./chips";
import { ComentariosDeLaTarea } from "./ComentariosDeLaTarea";
import { DependenciasDeLaTarea } from "./DependenciasDeLaTarea";
import { EtiquetasDeLaTarea } from "./EtiquetasDeLaTarea";
import { VinculosDeLaTarea } from "./VinculosDeLaTarea";
import { useAsistenteDeTareas } from "./AsistenteDeTareas";

type Historia = { id: string; tipo: string; texto: string; quien: string; cuando: string; detalle: string | null }[];

export function CajonDeTarea({
  id,
  lunesDeHoy,
  opciones,
  onCerrar,
  onCambio,
  onAgendar,
  onDecidir,
}: {
  id: string | null;
  lunesDeHoy: string;
  opciones: OpcionesDeTareas | null;
  onCerrar: () => void;
  /** Algo cambió: la lista de atrás se refresca. */
  onCambio: () => void;
  onAgendar: (t: TareaVista) => void;
  onDecidir: (t: TareaVista, usarClienteSugerido: boolean) => void;
}) {
  const toast = useToast();
  const asistente = useAsistenteDeTareas();
  const [tarea, setTarea] = useState<TareaVista | null>(null);
  const [historia, setHistoria] = useState<Historia>([]);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [titulo, setTitulo] = useState("");
  const [notas, setNotas] = useState("");
  const [proyectosHubspot, setProyectosHubspot] = useState<{ id: string; nombre: string; interno: boolean }[]>([]);
  const [noSeHara, setNoSeHara] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    if (!id) return;
    try {
      const r = await apiTareas.una(id);
      setTarea(r.tarea);
      setHistoria(r.historia);
      setTitulo(r.tarea.titulo);
      setNotas(r.tarea.notas ?? "");
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo abrir la tarea.");
    }
  }, [id]);

  useEffect(() => {
    setTarea(null);
    setNoSeHara(null);
    void cargar();
  }, [cargar]);

  useEffect(() => {
    const clientId = tarea?.cliente?.id;
    if (!clientId) {
      setProyectosHubspot([]);
      return;
    }
    let vivo = true;
    apiTareas
      .opciones(clientId)
      .then((o) => vivo && setProyectosHubspot(o.proyectosHubspot ?? []))
      .catch(() => vivo && setProyectosHubspot([]));
    return () => {
      vivo = false;
    };
  }, [tarea?.cliente?.id]);

  async function cambiar(body: Record<string, unknown>) {
    if (!tarea) return;
    setGuardando(true);
    try {
      const r = await apiTareas.cambiar(tarea.id, { ...body, version: tarea.version });
      setTarea(r.tarea);
      setTitulo(r.tarea.titulo);
      setNotas(r.tarea.notas ?? "");
      onCambio();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo guardar.");
      if (e instanceof ErrorDeApi && e.status === 409) await cargar();
      throw e;
    } finally {
      setGuardando(false);
    }
  }
  const editar = (cambios: Record<string, unknown>) => cambiar({ accion: "editar", cambios }).catch(() => undefined);

  async function quitarBloque() {
    if (!tarea) return;
    setGuardando(true);
    try {
      const r = (await apiTareas.agendar(tarea.id, { modo: "quitar" })) as { tarea: TareaVista; quitados?: number; sinPermiso?: boolean };
      setTarea(r.tarea);
      onCambio();
      if (r.sinPermiso || !r.quitados) toast.info("Lo sacamos de la tarea. Si sigue en tu calendario, bórralo a mano en Google Calendar.");
      else toast.success("Quitamos el bloque de tu calendario.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo quitar el bloque.");
    } finally {
      setGuardando(false);
    }
  }

  const t = tarea;
  const acc = t?.acciones;
  const puedeEditar = !!acc?.editar && !guardando;
  const personas: OpcionDeCelda[] = (opciones?.personas ?? []).map((p) => ({ value: p.email, label: p.nombre, hint: p.email }));
  const empresas: OpcionDeCelda[] = [{ value: "", label: "Sin cliente" }, ...(opciones?.empresas ?? []).map((e) => ({ value: e.id, label: e.nombre, hint: e.kind === "INTERNO" ? "Interno" : e.kind === "PROSPECTO" ? "Prospecto" : e.kind === "ALIADO" ? "Aliado" : undefined }))];
  const proyectos: OpcionDeCelda[] = [{ value: "", label: "Sin proyecto" }, ...(opciones?.proyectos ?? []).map((p) => ({ value: p.id, label: p.nombre, hint: p.espacio }))];
  const semanas = [
    { value: lunesDeHoy, label: `Esta semana (${rangoDeLaSemana(lunesDeHoy)})` },
    ...[1, 2, 3, 4].map((n) => ({ value: sumarSemanas(lunesDeHoy, n), label: rangoDeLaSemana(sumarSemanas(lunesDeHoy, n)) })),
    { value: "", label: "Más adelante (sin semana)" },
  ];
  if (t?.semana && !semanas.some((s) => s.value === t.semana)) semanas.unshift({ value: t.semana, label: `Semana del ${rangoDeLaSemana(t.semana)}` });

  return (
    <Drawer
      open={!!id}
      onClose={onCerrar}
      size="lg"
      title={t ? `T-${t.numero}` : "Tarea"}
      description={t ? NOMBRE_DEL_ESTADO[t.estado] : undefined}
      footer={
        t && asistente ? (
          <BotonTexto
            onClick={() => {
              asistente.abrir({ chip: { tipo: "tarea", id: t.id, etiqueta: `T-${t.numero} «${t.titulo}»` } });
              onCerrar();
            }}
          >
            Preguntarle al asistente
          </BotonTexto>
        ) : undefined
      }
    >
      {error && <p className="text-sm text-danger-ink">{error}</p>}
      {!t && !error && <p className="text-sm text-fg-muted">Abriendo…</p>}
      {t && acc && (
        <div className="space-y-5">
          {t.estado === "propuesta" && acc.decidir && (
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-info-line bg-info-surface px-3 py-2.5">
              <p className="min-w-0 flex-1 text-[13px] text-brand">Es una propuesta: cámbiala acá y úsala cuando esté como quieres.</p>
              <BotonAzul disabled={guardando} onClick={() => onDecidir(t, !!t.sugerencias?.cliente)}>
                Usar
              </BotonAzul>
            </div>
          )}

          {/* Una tarea de HubSpot: de dónde viene, dónde abrirla y si quedó algo sin escribir allá. */}
          {t.hubspot && (
            <div className="space-y-1 rounded-lg border border-line bg-surface px-3 py-2.5 text-[13px]">
              <p className="text-fg-secondary">
                {t.hubspot.rotulo}: el título, el estado, el vencimiento, la prioridad y el responsable se escriben allá.
              </p>
              <p className="flex flex-wrap gap-x-3 gap-y-1">
                {t.hubspot.url && (
                  <a href={t.hubspot.url} target="_blank" rel="noreferrer" className="text-xs text-brand hover:text-brand-light">
                    Abrir la tarea en HubSpot
                  </a>
                )}
                {t.hubspot.registro && (
                  <a href={t.hubspot.registro.url} target="_blank" rel="noreferrer" className="text-xs text-brand hover:text-brand-light">
                    {t.hubspot.registro.texto}
                  </a>
                )}
              </p>
              {t.hubspot.error && <p className="text-xs text-warn-ink">{t.hubspot.error} Se vuelve a intentar en 15 minutos.</p>}
            </div>
          )}

          {/* El contexto que escribió Nexus al generarla: arriba, una vez, con su marca. No se edita (lo tuyo va en Notas). */}
          {(t.contexto || t.contextoOculto) && (
            <div className="rounded-lg border border-line bg-surface-muted px-3 py-2.5">
              <p className={cn(ROTULO_DEL_SISTEMA, "flex items-center gap-1.5")}>
                {!t.hubspot && <IconoDeSugerencia className="h-3.5 w-3.5 text-brand" />}
                {t.hubspot ? "Notas de la tarea en HubSpot" : "Contexto · lo escribió Nexus"}
              </p>
              {t.contexto ? (
                <p className="mt-1 whitespace-pre-line text-[13px] leading-relaxed text-fg-secondary">{t.contexto}</p>
              ) : (
                <p className="mt-1 text-[13px] italic text-fg-muted">{t.contextoOculto}</p>
              )}
            </div>
          )}

          <Field label="Qué hay que hacer">
            <Input
              value={titulo}
              disabled={!puedeEditar}
              onChange={(e) => setTitulo(e.target.value)}
              onBlur={() => titulo.trim() && titulo.trim() !== t.titulo && void editar({ titulo: titulo.trim() })}
            />
          </Field>

          {(acc.empezar || acc.terminar || acc.reabrir) && (
            <div className="space-y-1.5">
              <p className={ROTULO_DEL_SISTEMA}>Estado</p>
              <Segmentado
                etiqueta="Estado de la tarea"
                valor={t.estado === "pendiente" || t.estado === "en_curso" || t.estado === "hecha" ? t.estado : null}
                opciones={[
                  { clave: "pendiente", etiqueta: "Pendiente" },
                  { clave: "en_curso", etiqueta: "En curso" },
                  { clave: "hecha", etiqueta: "Hecha" },
                ]}
                onCambio={(hacia) => void cambiar({ accion: "estado", hacia }).catch(() => undefined)}
              />
              {acc.noSeHara && noSeHara === null && (
                <BotonTexto className="px-0" onClick={() => setNoSeHara("")}>
                  Ya no se hará…
                </BotonTexto>
              )}
              {noSeHara !== null && (
                <div className="flex flex-wrap items-end gap-2">
                  <Field label="¿Por qué ya no se hará?" className="min-w-[240px] flex-1">
                    <Input value={noSeHara} onChange={(e) => setNoSeHara(e.target.value)} autoFocus />
                  </Field>
                  <BotonBlanco disabled={!noSeHara.trim() || guardando} onClick={() => void cambiar({ accion: "estado", hacia: "no_se_hara", motivo: noSeHara.trim() }).then(() => setNoSeHara(null)).catch(() => undefined)}>
                    Guardar
                  </BotonBlanco>
                  <BotonTexto onClick={() => setNoSeHara(null)}>Cancelar</BotonTexto>
                </div>
              )}
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Para">
              <CeldaSelect
                etiqueta="Responsable"
                opciones={personas}
                seleccion={t.responsable ? [t.responsable.email] : []}
                vacio="Por asignar"
                puedeEditar={(acc.reasignar || acc.tomar) && !guardando}
                onElegir={(email) => cambiar({ accion: "asignar", para: email })}
                minimoParaBuscar={6}
              />
            </Field>
            <Field label="Semana">
              <CeldaSelect
                etiqueta="Semana"
                opciones={semanas}
                seleccion={[t.semana ?? ""]}
                puedeEditar={acc.moverDeSemana && !guardando}
                onElegir={(v) => cambiar({ accion: "semana", destino: v || null })}
                minimoParaBuscar={99}
              />
            </Field>
            <Field label="Vence">
              <DatePickerField value={t.venceEl ?? ""} readOnly={!puedeEditar} onChange={(v) => void editar({ venceEl: v || null })} placeholder="Sin fecha" />
            </Field>
            <Field label="Prioridad">
              <Segmentado
                etiqueta="Prioridad"
                valor={t.prioridad}
                deshabilitado={!puedeEditar}
                opciones={[
                  { clave: "alta", etiqueta: "Alta" },
                  { clave: "media", etiqueta: "Media" },
                  { clave: "baja", etiqueta: "Baja" },
                ]}
                onCambio={(p) => void editar({ prioridad: p })}
              />
            </Field>
          </div>

          <div className="space-y-1.5">
            <p className={ROTULO_DEL_SISTEMA}>Cuánto toma · {horas(t.minutosEstimados)}</p>
            <div className="flex flex-wrap gap-1.5">
              {DURACIONES_DE_AGENDA.map((m) => (
                <button
                  key={m}
                  type="button"
                  disabled={!puedeEditar}
                  onClick={() => void editar({ minutosEstimados: m })}
                  className={cn(
                    "rounded-full border px-2.5 py-[3px] text-xs transition-colors",
                    t.minutosEstimados === m ? "border-info-line bg-info-surface font-semibold text-brand" : "border-line bg-surface text-fg-secondary hover:bg-surface-hover",
                  )}
                >
                  {horas(m)}
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Para quién">
              <CeldaSelect
                etiqueta="Cliente"
                opciones={empresas}
                seleccion={t.cliente ? [t.cliente.id] : []}
                vacio="Sin clasificar"
                sugerencia={!t.cliente ? t.sugerencias?.cliente?.id : undefined}
                puedeEditar={puedeEditar}
                onElegir={(v) => editar({ clientId: v || null })}
              />
            </Field>
            <Field label="Proyecto de HubSpot">
              <CeldaSelect
                etiqueta="Proyecto de HubSpot"
                opciones={[{ value: "", label: "Ninguno" }, ...proyectosHubspot.map((p) => ({ value: p.id, label: p.nombre, hint: p.interno ? "Interno" : undefined }))]}
                seleccion={t.proyectoHubspot ? [t.proyectoHubspot.id] : []}
                vacio={t.cliente ? "Ninguno" : "Elige primero el cliente"}
                puedeEditar={puedeEditar && !!t.cliente}
                onElegir={(v) => editar({ projectId: v || null })}
              />
            </Field>
            <Field label="Proyecto">
              <CeldaSelect
                etiqueta="Proyecto de tareas"
                opciones={proyectos}
                seleccion={t.proyecto ? [t.proyecto.id] : []}
                vacio="Sin proyecto"
                puedeEditar={puedeEditar}
                onElegir={(v) => editar({ proyectoId: v || null })}
              />
            </Field>
            {t.responsable?.email && acc.editar && (
              <Field label="Solo para mí" hint="En la semana del equipo cuenta como horas, sin título.">
                <Interruptor activo={t.privada} onCambio={(v) => void editar({ privada: v })} deshabilitado={!puedeEditar} etiqueta="Solo para mí" />
              </Field>
            )}
          </div>

          <Field label="Notas">
            <Textarea rows={3} value={notas} disabled={!puedeEditar} onChange={(e) => setNotas(e.target.value)} onBlur={() => notas !== (t.notas ?? "") && void editar({ notas: notas || null })} />
          </Field>

          {(t.estado === "pendiente" || t.estado === "en_curso") && t.semana && (
            <div className="space-y-1.5">
              <p className={ROTULO_DEL_SISTEMA}>Agenda</p>
              <div className="flex flex-wrap items-center gap-2">
                <ChipDeAgenda t={t} />
                {acc.agendar && t.agenda.estado !== "agendada" && (
                  <BotonBlanco onClick={() => onAgendar(t)} disabled={guardando}>
                    Agendar
                  </BotonBlanco>
                )}
                {t.agenda.tienesBloque && acc.agendar && (
                  <BotonTexto onClick={() => void quitarBloque()} disabled={guardando}>
                    Quitar el bloque
                  </BotonTexto>
                )}
              </div>
            </div>
          )}

          {/* Una tuya (`cambiarPrivada` = eres su responsable) en «Más adelante»: se agenda cuando tiene semana. */}
          {(t.estado === "pendiente" || t.estado === "en_curso") && !t.semana && acc.cambiarPrivada && !t.agenda.tienesBloque && (
            <p className="text-[13px] text-fg-muted">Para agendarla en tu calendario, ponla en una semana.</p>
          )}

          {/* Un bloque en TU calendario se quita aunque la tarea ya no sea tuya o esté en «Más adelante». */}
          {t.agenda.tienesBloque && !((t.estado === "pendiente" || t.estado === "en_curso") && t.semana && acc.agendar) && (
            <div className="flex items-center justify-between gap-2 rounded-lg border border-line px-3 py-2 text-[13px] text-fg-secondary">
              <span>Esta tarea tiene un bloque en tu calendario.</span>
              <BotonTexto onClick={() => void quitarBloque()} disabled={guardando}>
                Quitar el bloque
              </BotonTexto>
            </div>
          )}

          {t.salioDe && (
            <div className="space-y-1.5">
              <p className={ROTULO_DEL_SISTEMA}>Salió de</p>
              {t.salioDe.visible ? (
                <div className="rounded-lg border border-line bg-surface-muted px-3 py-2.5 text-[13px]">
                  <p className="font-medium text-fg">{t.salioDe.titulo}</p>
                  {t.salioDe.cita && <p className="mt-1 italic text-fg-secondary">«{t.salioDe.cita}»</p>}
                </div>
              ) : (
                <p className="text-[13px] text-fg-muted">{t.salioDe.texto}</p>
              )}
            </div>
          )}

          {t.mismaQue && (
            <p className="text-[13px] text-fg-secondary">
              {t.estado === "fusionada" ? "Quedó como" : "Nexus cree que es"} T-{t.mismaQue.numero}
              {t.mismaQue.titulo ? ` «${t.mismaQue.titulo}»` : " (una tarea que no ves)"}
            </p>
          )}

          <EtiquetasDeLaTarea etiquetas={t.etiquetas} editable={puedeEditar} onCambiar={(etiquetas) => void editar({ etiquetas })} />

          <DependenciasDeLaTarea
            t={t}
            puedeEditar={puedeEditar}
            onCambio={(x) => {
              setTarea(x);
              onCambio();
            }}
          />

          <VinculosDeLaTarea key={`v-${t.id}`} tareaId={t.id} puedeEditar={puedeEditar} />

          <ComentariosDeLaTarea key={t.id} tareaId={t.id} />

          <div className="space-y-1.5">
            <p className={ROTULO_DEL_SISTEMA}>Historia</p>
            <p className="text-xs text-fg-muted">
              {NOMBRE_DEL_ORIGEN[t.origen as OrigenDeTarea] ?? t.origen}
              {t.pedidaPor ? ` · la pidió ${t.pedidaPor.nombre}` : ""}
            </p>
            <ul className="space-y-1">
              {historia.map((h) => (
                <li key={h.id} className="text-xs text-fg-secondary">
                  <span className="text-fg">{h.quien}</span> · {h.texto.toLowerCase()}
                  {h.detalle ? ` (${h.detalle})` : ""} ·{" "}
                  <span className="text-fg-muted">
                    {diaYHora(h.cuando)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </Drawer>
  );
}
