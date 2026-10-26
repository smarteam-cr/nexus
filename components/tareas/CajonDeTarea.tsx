"use client";

/**
 * components/tareas/CajonDeTarea.tsx — una tarea abierta en su cajón (`?t=<id>`, Drawer lg).
 *
 * Todo se guarda solo (con la versión: si otra persona la cambió, 409 y se recarga) y el pie lo DICE
 * (lib/tareas/guardado.ts): «Sin guardar…» mientras escribes, «Guardando…», «Guardado» o «No se pudo guardar ·
 * Reintentar». El título y las notas se mandan a los 0,9 s de dejar de escribir, al salir del campo y al cerrar el
 * cajón; lo demás, al elegirlo. Los pedidos van en fila, uno detrás del otro, para que cada uno lleve la versión que dejó
 * el anterior. Lo que la persona no puede hacer no se pinta (`tarea.acciones`, calculadas en el servidor con la misma
 * regla que exige al guardar).
 *
 * Una PROPUESTA que puedes decidir (2026-10-20, decisión de Elías) abre corta: qué propone Nexus, para quién, cuándo
 * vence y de dónde salió, con «Usar», «Más adelante» y «Descartar» abajo, en el pie. El resto del formulario espera
 * detrás de «Cambiar otros detalles». Arriba, el nombre de la tarea para una persona («Honda Costa Rica – Configurar
 * los informes…»), no «T-9»: el número va en la línea de abajo.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { CeldaSelect, Drawer, Field, Input, Interruptor, Segmentado, Textarea, type OpcionDeCelda } from "@/components/ui";
import { BotonAzul, BotonBlanco, BotonTexto, IconoDeSugerencia, ROTULO_DEL_SISTEMA } from "@/components/ui/sistema";
import { useToast } from "@/components/ui/Toast";
import DatePickerField from "@/components/ui/DatePickerField";
import { cn } from "@/lib/cn";
import { DURACIONES_DE_AGENDA } from "@/lib/tareas/reglas";
import { ESPERA_AL_ESCRIBIR_MS, TEXTO_DEL_GUARDADO, estadoDelGuardado } from "@/lib/tareas/guardado";
import { conEstadoAlInstante } from "@/lib/tareas/fila-de-cambios";
import { NOMBRE_DEL_ESTADO, NOMBRE_DEL_ORIGEN, type OrigenDeTarea } from "@/lib/tareas/estados";
import { textoDeQuienesEstuvieron } from "@/lib/tareas/origen";
import { diaYHora, rangoDeLaSemana, sumarSemanas } from "@/lib/tareas/semana";
import { tareaParaUnaPersona } from "@/lib/tareas/titulo-corto";
import type { CrmDelCliente, OpcionesDeTareas, TareaVista } from "@/lib/tareas/tipos";
import { apiTareas, ErrorDeApi } from "./api";
import { ChipDeAgenda, horas } from "./chips";
import { ComentariosDeLaTarea } from "./ComentariosDeLaTarea";
import { DependenciasDeLaTarea } from "./DependenciasDeLaTarea";
import { EtiquetasDeLaTarea } from "./EtiquetasDeLaTarea";
import { VinculosDeLaTarea } from "./VinculosDeLaTarea";
import { useAsistenteDeTareas } from "./AsistenteDeTareas";

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
/** «16 oct» de un AAAA-MM-DD. */
const diaCorto = (ymd: string) => `${Number(ymd.slice(8, 10))} ${MESES[Number(ymd.slice(5, 7)) - 1]}`;

/** Las opciones de un contacto o un negocio de HubSpot; el elegido sigue aunque ya no esté en la lista (se cerró, se fue). */
function opcionesDelCrm(lista: CrmDelCliente["contactos"], elegido: string | null, vacio: string): OpcionDeCelda[] {
  const opciones: OpcionDeCelda[] = [{ value: "", label: vacio }, ...lista.map((x) => ({ value: x.id, label: x.nombre, hint: x.detalle ?? undefined }))];
  if (elegido && !lista.some((x) => x.id === elegido)) opciones.push({ value: elegido, label: "El que está en HubSpot", hint: "Ya no está en la copia de Nexus" });
  return opciones;
}

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
  const [titulo, setTitulo] = useState("");
  const [notas, setNotas] = useState("");
  const [proyectosHubspot, setProyectosHubspot] = useState<{ id: string; nombre: string; interno: boolean }[]>([]);
  // Los contactos y negocios de HubSpot del cliente de la tarea: el seguimiento comercial se asocia a uno (D4).
  const [crm, setCrm] = useState<CrmDelCliente>({ contactos: [], negocios: [] });
  const [noSeHara, setNoSeHara] = useState<string | null>(null);
  // Una propuesta abre corta; «Cambiar otros detalles» muestra el formulario entero.
  const [detalles, setDetalles] = useState(false);
  // El guardado: cuántos pedidos esperan respuesta, si el último falló y si ya se guardó algo desde que se abrió.
  const [enVuelo, setEnVuelo] = useState(0);
  const [fallo, setFallo] = useState(false);
  const [guardadoAlguna, setGuardadoAlguna] = useState(false);
  const tareaRef = useRef<TareaVista | null>(null);
  const cola = useRef<Promise<unknown>>(Promise.resolve());
  // Cuántos cambios del cajón esperan su turno: la respuesta de uno que tiene otro detrás no se pinta (taparía al de atrás).
  const enCola = useRef(0);
  const ultimoFallido = useRef<Record<string, unknown> | null>(null);
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Lo último que se mandó del título y las notas: salir del campo justo después de la espera no lo manda dos veces.
  const ultimoEnviado = useRef<{ id: string; titulo: string; notas: string } | null>(null);
  const guardando = enVuelo > 0;

  const ponerTarea = useCallback((x: TareaVista | null) => {
    tareaRef.current = x;
    setTarea(x);
  }, []);

  const cargar = useCallback(async () => {
    if (!id) return;
    try {
      const r = await apiTareas.una(id);
      ponerTarea(r.tarea);
      setHistoria(r.historia);
      setTitulo(r.tarea.titulo);
      setNotas(r.tarea.notas ?? "");
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo abrir la tarea.");
    }
  }, [id, ponerTarea]);

  useEffect(() => {
    ponerTarea(null);
    setNoSeHara(null);
    setDetalles(false);
    setFallo(false);
    setGuardadoAlguna(false);
    ultimoFallido.current = null;
    void cargar();
  }, [cargar, ponerTarea]);

  useEffect(() => {
    const clientId = tarea?.cliente?.id;
    if (!clientId) {
      setProyectosHubspot([]);
      setCrm({ contactos: [], negocios: [] });
      return;
    }
    let vivo = true;
    apiTareas
      .opciones(clientId)
      .then((o) => {
        if (!vivo) return;
        setProyectosHubspot(o.proyectosHubspot ?? []);
        setCrm(o.crm ?? { contactos: [], negocios: [] });
      })
      .catch(() => {
        if (!vivo) return;
        setProyectosHubspot([]);
        setCrm({ contactos: [], negocios: [] });
      });
    return () => {
      vivo = false;
    };
  }, [tarea?.cliente?.id]);

  /**
   * Un cambio, en fila detrás de los anteriores: cada uno toma la versión que dejó el que respondió antes. La tarea sobre
   * la que se pidió se fija al pedirlo, así lo que queda en fila al cerrar el cajón igual se guarda.
   */
  function cambiar(body: Record<string, unknown>): Promise<void> {
    const objetivo = tareaRef.current ? { id: tareaRef.current.id, version: tareaRef.current.version } : null;
    if (!objetivo) return Promise.resolve();
    // El estado cambia al instante (el Segmentado no espera al servidor); si el servidor dice que no, se vuelve a cargar.
    const hacia = body.accion === "estado" && (body.hacia === "pendiente" || body.hacia === "en_curso" || body.hacia === "hecha") ? body.hacia : null;
    if (hacia && tareaRef.current) ponerTarea(conEstadoAlInstante(tareaRef.current, hacia));
    enCola.current++;
    const correr = async () => {
      const version = tareaRef.current?.id === objetivo.id ? tareaRef.current.version : objetivo.version;
      setEnVuelo((n) => n + 1);
      try {
        const r = await apiTareas.cambiar(objetivo.id, { ...body, version });
        objetivo.version = r.tarea.version;
        // Solo si el cajón sigue en esta tarea (otra abierta mientras tanto no se pisa) y no hay otro cambio detrás.
        if (tareaRef.current?.id === objetivo.id) {
          if (enCola.current === 1) ponerTarea(r.tarea);
          else ponerTarea({ ...tareaRef.current, version: Math.max(tareaRef.current.version, r.tarea.version) });
          setGuardadoAlguna(true);
          setFallo(false);
        }
        ultimoFallido.current = null;
        onCambio();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "No se pudo guardar.");
        if (tareaRef.current?.id === objetivo.id) {
          setFallo(true);
          ultimoFallido.current = body;
          if ((e instanceof ErrorDeApi && e.status === 409) || hacia) await cargar();
        }
        throw e;
      } finally {
        enCola.current--;
        setEnVuelo((n) => n - 1);
      }
    };
    const p = cola.current.then(correr, correr);
    cola.current = p.catch(() => undefined);
    return p;
  }
  const editar = (cambios: Record<string, unknown>) => cambiar({ accion: "editar", cambios }).catch(() => undefined);

  /** El título y las notas que todavía no se mandaron, en un solo pedido. */
  function guardarTexto() {
    if (temporizador.current) clearTimeout(temporizador.current);
    temporizador.current = null;
    const t0 = tareaRef.current;
    if (!t0 || !t0.acciones.editar) return;
    const previo = ultimoEnviado.current?.id === t0.id ? ultimoEnviado.current : { id: t0.id, titulo: t0.titulo, notas: t0.notas ?? "" };
    const cambios: Record<string, unknown> = {};
    if (titulo.trim() && titulo.trim() !== previo.titulo) cambios.titulo = titulo.trim();
    if (notas !== previo.notas) cambios.notas = notas || null;
    if (!Object.keys(cambios).length) return;
    ultimoEnviado.current = { id: t0.id, titulo: titulo.trim() || previo.titulo, notas };
    // Si falla, el próximo intento compara contra lo que de verdad quedó.
    void cambiar({ accion: "editar", cambios }).catch(() => {
      ultimoEnviado.current = null;
    });
  }

  const pendientes = tarea?.acciones.editar ? Number(!!titulo.trim() && titulo.trim() !== tarea.titulo) + Number(notas !== (tarea.notas ?? "")) : 0;
  const estadoGuardado = estadoDelGuardado({ pendientes, enVuelo, error: fallo, guardadoAlguna });

  // Mientras escribes: se manda a los 0,9 s de la última tecla.
  useEffect(() => {
    if (!pendientes) return;
    temporizador.current = setTimeout(guardarTexto, ESPERA_AL_ESCRIBIR_MS);
    return () => {
      if (temporizador.current) clearTimeout(temporizador.current);
    };
    // guardarTexto lee el texto de este render: se rearma con cada tecla.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [titulo, notas]);

  /** Cerrar el cajón manda lo que quedó escrito. */
  function cerrarCajon() {
    guardarTexto();
    onCerrar();
  }

  /** Cerrar lo que Nexus propone cerrar: «Ya no se hará» una abierta, «Descartar» una propuesta, con su motivo. */
  async function cerrarSugerida() {
    const t0 = tareaRef.current;
    if (!t0?.cerrar) return;
    if (t0.cerrar.accion === "no_se_hara") {
      await cambiar({ accion: "estado", hacia: "no_se_hara", motivo: t0.cerrar.motivo }).catch(() => undefined);
      return;
    }
    setEnVuelo((n) => n + 1);
    try {
      await apiTareas.decidir(t0.id, t0.version, { tipo: "rechazar", motivo: t0.cerrar.motivo });
      toast.success("Descartada, con su motivo.");
      onCambio();
      onCerrar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo descartar.");
    } finally {
      setEnVuelo((n) => n - 1);
    }
  }

  /** «Usar» una propuesta: lo escrito primero (usarla con la versión de antes daría «otra persona la cambió»). */
  async function usarPropuesta() {
    guardarTexto();
    await cola.current;
    const ultima = tareaRef.current;
    if (ultima) onDecidir(ultima, !!ultima.sugerencias?.cliente);
  }

  /** «Más adelante» o «Descartar» una propuesta, desde el pie del cajón. */
  async function decidirPropuesta(tipo: "mas_adelante" | "rechazar") {
    guardarTexto();
    await cola.current;
    const t0 = tareaRef.current;
    if (!t0) return;
    setEnVuelo((n) => n + 1);
    try {
      await apiTareas.decidir(t0.id, t0.version, { tipo });
      toast.success(tipo === "rechazar" ? "Descartada." : "Quedó para más adelante.");
      onCambio();
      onCerrar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo guardar la decisión.");
    } finally {
      setEnVuelo((n) => n - 1);
    }
  }

  function reintentar() {
    const body = ultimoFallido.current;
    if (body) void cambiar(body).catch(() => undefined);
    else guardarTexto();
  }

  async function quitarBloque() {
    if (!tarea) return;
    setEnVuelo((n) => n + 1);
    try {
      const r = (await apiTareas.agendar(tarea.id, { modo: "quitar" })) as { tarea: TareaVista; quitados?: number; sinPermiso?: boolean };
      ponerTarea(r.tarea);
      onCambio();
      // Un evento que ya existía y se unió a la tarea no se borra: sigue en tu calendario, como debe (P3).
      if (soloUnido) toast.success("La tarea ya no está unida a ese evento. El evento sigue en tu calendario.");
      else if (r.sinPermiso || !r.quitados) toast.info("Lo sacamos de la tarea. Si sigue en tu calendario, bórralo a mano en Google Calendar.");
      else toast.success("Quitamos el bloque de tu calendario.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo quitar el bloque.");
    } finally {
      setEnVuelo((n) => n - 1);
    }
  }

  const t = tarea;
  const acc = t?.acciones;
  const esPropuesta = !!t && t.estado === "propuesta" && !!acc?.decidir;
  const corta = esPropuesta && !detalles;
  // No se deshabilita mientras guarda: los pedidos van en fila y escribir no tiene que perder el foco.
  const puedeEditar = !!acc?.editar;
  // Lo tuyo en el calendario es un evento que ya existía y se unió a la tarea (P3): quitarlo solo lo desune, no lo borra.
  const soloUnido = !!t && t.agenda.bloques.length > 0 && t.agenda.bloques.every((b) => b.asociado);
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
      onClose={cerrarCajon}
      size="lg"
      title={t ? tareaParaUnaPersona({ titulo: t.titulo, tituloCorto: t.tituloCorto, empresa: t.cliente?.nombre ?? null, ambito: t.ambito?.nombre ?? null }) : "Tarea"}
      description={t ? `T-${t.numero} · ${esPropuesta ? "Nexus te la propone" : NOMBRE_DEL_ESTADO[t.estado]}` : undefined}
      footer={
        t ? (
          <>
            {acc?.editar || acc?.decidir || acc?.terminar || guardadoAlguna || fallo ? (
              <p className="mr-auto flex min-w-0 items-center gap-1.5 text-xs" aria-live="polite" data-guardado={estadoGuardado}>
                {estadoGuardado === "guardado" && (
                  <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 text-success-ink" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
                    <path d="M5 12l5 5L20 7" />
                  </svg>
                )}
                <span className={estadoGuardado === "error" ? "text-danger-ink" : estadoGuardado === "sin_guardar" ? "text-warn-ink" : "text-fg-muted"}>{TEXTO_DEL_GUARDADO[estadoGuardado]}</span>
                {estadoGuardado === "error" && <BotonTexto onClick={reintentar}>Reintentar</BotonTexto>}
              </p>
            ) : (
              <p className="mr-auto text-xs text-fg-muted">Solo lectura: no la puedes cambiar.</p>
            )}
            {esPropuesta && (
              <>
                <BotonTexto disabled={guardando} onClick={() => void decidirPropuesta("rechazar")}>
                  Descartar
                </BotonTexto>
                <BotonBlanco disabled={guardando} onClick={() => void decidirPropuesta("mas_adelante")}>
                  Más adelante
                </BotonBlanco>
                <BotonAzul disabled={guardando} onClick={() => void usarPropuesta()}>
                  Usar
                </BotonAzul>
              </>
            )}
            {asistente && !esPropuesta && (
              <BotonTexto
                onClick={() => {
                  asistente.abrir({ chip: { tipo: "tarea", id: t.id, etiqueta: `T-${t.numero} «${t.titulo}»` } });
                  cerrarCajon();
                }}
              >
                Preguntarle al asistente
              </BotonTexto>
            )}
          </>
        ) : undefined
      }
    >
      {error && <p className="text-sm text-danger-ink">{error}</p>}
      {!t && !error && <p className="text-sm text-fg-muted">Abriendo…</p>}
      {t && acc && corta && (
        <div className="space-y-4">
          <div className="space-y-2.5 rounded-lg border border-info-line bg-info-surface px-3.5 py-3">
            <p className={cn(ROTULO_DEL_SISTEMA, "flex items-center gap-1.5 text-brand")}>
              <IconoDeSugerencia className="h-3.5 w-3.5" />
              Nexus te propone esta tarea
            </p>
            <Field label="Qué hay que hacer">
              <Input value={titulo} disabled={!puedeEditar} onChange={(e) => setTitulo(e.target.value)} onBlur={guardarTexto} />
            </Field>
            {t.contexto && <p className="line-clamp-4 whitespace-pre-line text-[13px] leading-relaxed text-fg-secondary">{t.contexto}</p>}
          </div>
          <dl className="grid grid-cols-3 gap-3 text-[13px]">
            <div>
              <dt className="text-xs text-fg-muted">Para</dt>
              <dd className="text-fg">{t.responsable?.nombre ?? "Por asignar"}</dd>
            </div>
            <div>
              <dt className="text-xs text-fg-muted">Vence</dt>
              <dd className="text-fg">{t.venceEl ? diaCorto(t.venceEl) : "Sin fecha"}</dd>
            </div>
            <div>
              <dt className="text-xs text-fg-muted">Cliente</dt>
              <dd className="text-fg">{t.cliente?.nombre ?? t.sugerencias?.cliente?.nombre ?? "Sin cliente"}</dd>
            </div>
          </dl>
          {t.salioDe?.visible && (
            <p className="text-xs leading-[17px] text-fg-muted">
              Salió de «{t.salioDe.titulo}»{t.salioDe.cita ? ` · «${t.salioDe.cita}»` : ""}
            </p>
          )}
          <BotonTexto className="px-0" onClick={() => setDetalles(true)}>
            Cambiar otros detalles
          </BotonTexto>
        </div>
      )}
      {t && acc && !corta && (
        <div className="space-y-5">

          {/* «Ya pasó» (lib/tareas/aligerar.ts): Nexus propone cerrarla; la cierra quien la mira, con el motivo escrito. */}
          {t.cerrar && (
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-info-line bg-info-surface px-3 py-2.5">
              <IconoDeSugerencia className="h-4 w-4 flex-shrink-0 text-brand" />
              <p className="min-w-0 flex-1 text-[13px] text-brand">Nexus sugiere cerrarla. {t.cerrar.motivo}</p>
              <BotonBlanco disabled={guardando} onClick={() => void cerrarSugerida()}>
                {t.cerrar.accion === "descartar" ? "Descartar" : "Ya no se hará"}
              </BotonBlanco>
            </div>
          )}

          {/* Una tarea de HubSpot: de dónde viene, dónde abrirla y si quedó algo sin escribir allá. */}
          {t.hubspot && (
            <div className="space-y-1 rounded-lg border border-line bg-surface px-3 py-2.5 text-[13px]">
              <p className="text-fg-secondary">
                {t.hubspot.nacioEnNexus
                  ? "También está en HubSpot: el título, el estado, el vencimiento, la prioridad y el responsable viajan en los dos sentidos. «Ya no se hará» no existe allá: si ya no va, ciérrala también en HubSpot."
                  : `${t.hubspot.rotulo}: el título, el estado, el vencimiento, la prioridad y el responsable se escriben allá.`}
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
                {!(t.hubspot && !t.hubspot.nacioEnNexus) && <IconoDeSugerencia className="h-3.5 w-3.5 text-brand" />}
                {t.hubspot && !t.hubspot.nacioEnNexus ? "Notas de la tarea en HubSpot" : "Contexto · lo escribió Nexus"}
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
              onBlur={guardarTexto}
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
            {/* El seguimiento comercial (D4): con un contacto o un negocio de HubSpot, la tarea vive también allá. */}
            {t.origen !== "hubspot" && t.clase !== "reunion" && (
              <>
                <Field label="Contacto de HubSpot">
                  <CeldaSelect
                    etiqueta="Contacto de HubSpot"
                    opciones={opcionesDelCrm(crm.contactos, t.crm?.contactoId ?? null, "Ninguno")}
                    seleccion={t.crm?.contactoId ? [t.crm.contactoId] : []}
                    vacio={t.cliente ? "Ninguno" : "Elige primero el cliente"}
                    puedeEditar={puedeEditar && !!t.cliente && !t.hubspot}
                    onElegir={(v) => editar({ hubspotContactId: v || null })}
                  />
                </Field>
                <Field label="Negocio de HubSpot">
                  <CeldaSelect
                    etiqueta="Negocio de HubSpot"
                    opciones={opcionesDelCrm(crm.negocios, t.crm?.negocioId ?? null, "Ninguno")}
                    seleccion={t.crm?.negocioId ? [t.crm.negocioId] : []}
                    vacio={t.cliente ? "Ninguno" : "Elige primero el cliente"}
                    puedeEditar={puedeEditar && !!t.cliente && !t.hubspot}
                    onElegir={(v) => editar({ hubspotDealId: v || null })}
                  />
                </Field>
                {(t.crm?.contactoId || t.crm?.negocioId) && !t.hubspot && (t.crm.aviso || (acc.agendar && t.agenda.estado !== "agendada")) && (
                  <div className="space-y-1.5 sm:col-span-2">
                    {t.crm.aviso && <p className="text-xs text-warn-ink">{t.crm.aviso}</p>}
                    {acc.agendar && t.agenda.estado !== "agendada" && (
                      <div className="flex flex-wrap items-center gap-2 text-[13px] text-fg-secondary">
                        <span>Es un seguimiento: ¿le reservas un rato en tu calendario?</span>
                        <BotonBlanco onClick={() => onAgendar(t)} disabled={guardando}>
                          Agendar
                        </BotonBlanco>
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
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
            <Textarea rows={3} value={notas} disabled={!puedeEditar} onChange={(e) => setNotas(e.target.value)} onBlur={guardarTexto} />
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
                    {soloUnido ? "Desunir el evento" : "Quitar el bloque"}
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
              <span>{soloUnido ? "Esta tarea está unida a un evento de tu calendario." : "Esta tarea tiene un bloque en tu calendario."}</span>
              <BotonTexto onClick={() => void quitarBloque()} disabled={guardando}>
                {soloUnido ? "Desunir el evento" : "Quitar el bloque"}
              </BotonTexto>
            </div>
          )}

          {/* Una reunión planeada que ya se hizo (P3 etapa 2): su sesión de Meet, con lo que dejó. */}
          {t.reunionHechaId && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line px-3 py-2 text-[13px] text-fg-secondary">
              <span>La reunión ya se hizo.</span>
              <a href={`/sessions/${encodeURIComponent(t.reunionHechaId)}#lo-que-dejo`} className="text-xs text-brand hover:text-brand-light">
                Ver lo que dejó
              </a>
            </div>
          )}

          {t.salioDe && (
            <div className="space-y-1.5">
              <p className={ROTULO_DEL_SISTEMA}>Salió de</p>
              {t.salioDe.visible ? (
                <div className="rounded-lg border border-line bg-surface-muted px-3 py-2.5 text-[13px]">
                  <p className="font-medium text-fg">{t.salioDe.titulo}</p>
                  {t.salioDe.estuvieron && <p className="mt-0.5 text-xs text-fg-muted">{textoDeQuienesEstuvieron(t.salioDe.estuvieron)}</p>}
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
              ponerTarea(x);
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
