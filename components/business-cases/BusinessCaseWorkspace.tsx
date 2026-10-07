"use client";

/**
 * BusinessCaseWorkspace — la ficha de una propuesta (rediseño del 2026-10-05, sistema «Nexus ·
 * interfaz interna»).
 *
 * Antes era una página larga: contexto colapsable arriba, documento abajo y acciones sueltas en la
 * cabecera. Ahora es un lienzo de TRES PASOS —Contexto · Propuesta · Compartir— con la barra de
 * pasos a la izquierda (components/propuestas/PasosDeLaPropuesta.tsx) y «Qué sigue» donde se decide:
 *   1. Contexto  — lo que va a leer el agente, con el molde del contexto del handoff, y la preventa.
 *   2. Propuesta — generar, ajustar y revisar; «Antes de subir» muestra los frenos ANTES del botón.
 *   3. Compartir — el link, cuánto dura y qué pasó del lado del cliente.
 *
 * Este componente es el DUEÑO del estado que comparten los tres pasos (las versiones, la generación,
 * lo subido, el link y la preventa): por eso los tres quedan montados y solo se esconde el que no se
 * ve —cambiar de paso no corta una generación ni pierde lo que el editor tenía en vuelo—.
 *
 * El paso abierto queda en la dirección (`?paso=`): recargar o compartir el enlace abre el mismo.
 */
import { useState, useEffect, useCallback, useRef, type ReactNode } from "react";
import { fetchJson, ApiError } from "@/lib/api/fetch-json";
import { useToast } from "@/components/ui/Toast";
import { Button } from "@/components/ui/Button";
import { QueSigue } from "@/components/ui/sistema";
import CanvasDropdown from "@/components/business-cases/CanvasDropdown";
import SectionTools from "@/components/business-cases/SectionTools";
import DocumentAssist from "@/components/ai/DocumentAssist";
import DownloadPdfButton from "@/components/business-cases/DownloadPdfButton";
import { MarcoDelDocumento } from "@/components/clients/MarcoDelDocumento";
import type { VersionMeta } from "@/components/business-cases/bc-workspace-shared";
import LandingView, { type LandingSectionData } from "@/components/landing/LandingView";
import { catalogoLegible, TIPO_POR_DEFECTO } from "@/lib/landing/catalogo-de-secciones";
import { configForCanvas } from "@/components/landing/configs/templates";
import { hubsVendidosDe, SOLUCION_SECTION_KEY } from "@/lib/landing/hubs-solucion";
import { inversionDelDocumento } from "@/lib/landing/forma-de-pago";
import { useCanvasSections, type SectionWithBlocks } from "@/components/canvas/useCanvasSections";
import { defsForCanvas } from "@/components/landing/configs/templates.defs";
import { useEjecutarOperacionesDelChat } from "@/components/asistente/ejecutar-operaciones";
import { CAPACIDADES_POR_PIEZA } from "@/lib/canvas/capacidades-de-documento";
import { ChatDeSeccionDisponible } from "@/components/asistente/chat-de-seccion";
import { PIEZA_PROPUESTA_COMERCIAL, puedeConversar } from "@/lib/asistente/piezas";
import { notifyAgentDone, maybeRequestPermission } from "@/lib/notifications/client";
import { antesDeSubir, frenaLaSubida, type AvisoAntesDeSubir } from "@/lib/business-cases/antes-de-subir";
import { fechaDeVentas } from "@/lib/business-cases/estado-de-la-propuesta";
import { cn } from "@/lib/cn";
import ContextoDeLaPropuesta, { type CuentasDelContexto } from "@/components/propuestas/ContextoDeLaPropuesta";
import CompartirLaPropuesta from "@/components/propuestas/CompartirLaPropuesta";
import PasosDeLaPropuesta, { type EstadoDelPaso, type PasoDeLaPropuesta } from "@/components/propuestas/PasosDeLaPropuesta";
import type { PreventaDeLaPropuesta } from "@/components/propuestas/ColumnaPreventa";
import { useAccesoDeLaPropuesta } from "@/components/propuestas/useAccesoDeLaPropuesta";
import PanelLateral from "@/components/ui/PanelLateral";

const ROTULO = "text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-muted";
const BOTON_AZUL =
  "inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3.5 text-sm font-semibold text-primary-fg transition-colors hover:bg-primary-hover disabled:opacity-50";
const BOTON_BLANCO =
  "inline-flex h-8 items-center gap-1.5 rounded-lg border border-line bg-surface px-3 text-[13px] text-fg-secondary transition-colors hover:bg-surface-hover hover:text-fg disabled:opacity-50";

export default function BusinessCaseWorkspace({
  bcId,
  clientId,
  clientName,
  clientLogoUrl,
  clientLogoDarkUrl,
  clientLogoScale,
  smarteamLogoUrl,
  brandLogos,
  publishedAt,
  templateId,
  onAbrirChat,
  language,
  pasoInicial,
  puedeEditar,
  tratoUrl,
}: {
  bcId: string;
  /** Para subir el logo del cliente desde el hero (POST /api/clients/[id]/logo). */
  clientId?: string | null;
  clientName: string;
  clientLogoUrl: string | null;
  /** Segundo archivo del logo, para el fondo oscuro del hero. Ver lib/ui/logo-scale.ts. */
  clientLogoDarkUrl?: string | null;
  /** Tamaño base del logo en % (Client.logoScale). Lo pisa `hero.logoScale` del documento. */
  clientLogoScale?: number | null;
  /** Logo de marca Smarteam (config global) — el hero lo pinta en la brand-row. */
  smarteamLogoUrl?: string | null;
  /** Logos de plataforma por nombre lowercase (brandLogoMap) — brands de texto con logo. */
  brandLogos?: Record<string, string>;
  status: string;
  publishedAt: string | null;
  /** Template del caso (por su tipo). Ausente/null = hubspot_v1 (legacy). */
  templateId?: string | null;
  /**
   * Abre el cajón del asistente. Lo pasa `PropuestaConChat`, que es quien lo monta.
   * ⚠ Opcional a propósito: sin chat, ni el botón «Asistente» ni el «Cambiar» de cada sección aparecen.
   */
  onAbrirChat?: () => void;
  /** Idioma persistente del caso (BusinessCase.language). Fallback: __lang del hero. */
  language?: string | null;
  /** El paso con el que abre (de `?paso=`, o el que corresponde a su estado). */
  pasoInicial: PasoDeLaPropuesta;
  puedeEditar: boolean;
  /** El trato de HubSpot de la propuesta, si tiene. */
  tratoUrl: string | null;
}) {
  const toast = useToast();
  const [paso, setPasoState] = useState<PasoDeLaPropuesta>(pasoInicial);
  const [versions, setVersions] = useState<VersionMeta[]>([]);
  const [versionsLoaded, setVersionsLoaded] = useState(false);
  const [canvasId, setCanvasId] = useState<string>("");
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [published, setPublished] = useState(!!publishedAt);
  const [subidaEn, setSubidaEn] = useState<string | null>(publishedAt);
  const [dirty, setDirty] = useState(!publishedAt);
  const [accessNonce, setAccessNonce] = useState(0);
  // Títulos marcados en los casos de uso (los reporta el Contexto; null = no montado). Solo para el aviso al subir.
  const [ucSelectedTitles, setUcSelectedTitles] = useState<string[] | null>(null);
  const [clientLogo, setClientLogo] = useState<string | null>(clientLogoUrl);
  const [cuentas, setCuentas] = useState<CuentasDelContexto | null>(null);
  const [preventa, setPreventa] = useState<PreventaDeLaPropuesta | null>(null);
  const [preventaOcupada, setPreventaOcupada] = useState(false);
  const { acceso, linkVivo, ajustar, revocar } = useAccesoDeLaPropuesta(bcId, accessNonce);

  const setPaso = useCallback((p: PasoDeLaPropuesta) => {
    setPasoState(p);
    // En la dirección, sin navegar: recargar abre el mismo paso.
    const url = new URL(window.location.href);
    url.searchParams.set("paso", p);
    window.history.replaceState(window.history.state, "", url);
  }, []);

  const loadMeta = useCallback(
    async (preferCanvasId?: string) => {
      try {
        const m = await fetchJson<{ activeCanvasId: string | null; versions: VersionMeta[] }>(`/api/business-cases/${bcId}/canvas-meta`);
        setVersions(m.versions);
        setCanvasId((prev) =>
          preferCanvasId ?? (prev && m.versions.some((v) => v.canvasId === prev) ? prev : (m.activeCanvasId ?? "")),
        );
      } catch (e) {
        toast.error(e instanceof ApiError ? e.message : "No se pudo cargar la propuesta.");
      } finally {
        setVersionsLoaded(true);
      }
    },
    [bcId, toast],
  );
  useEffect(() => {
    void loadMeta();
  }, [loadMeta]);

  const cargarPreventa = useCallback(async () => {
    try {
      setPreventa(await fetchJson<PreventaDeLaPropuesta>(`/api/business-cases/${bcId}/preventa`));
    } catch {
      setPreventa({ exploracionId: null, usada: null, disponibles: [] });
    }
  }, [bcId]);
  useEffect(() => {
    void cargarPreventa();
  }, [cargarPreventa]);

  const usarPreventa = useCallback(
    async (exploracionId: string | null) => {
      setPreventaOcupada(true);
      try {
        await fetchJson(`/api/business-cases/${bcId}/preventa`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ exploracionId }),
        });
        toast.success(exploracionId ? "La propuesta ya usa la preventa. La próxima versión la lee." : "La propuesta dejó de usar la preventa.");
        await cargarPreventa();
      } catch (e) {
        toast.error(e instanceof ApiError ? e.message : "No se pudo cambiar la preventa.");
      } finally {
        setPreventaOcupada(false);
      }
    },
    [bcId, cargarPreventa, toast],
  );

  // poll:false → la generación del BC se sigue aparte (abajo); sin polling del canvas (evita parpadeo).
  const hook = useCanvasSections(`/api/business-cases/${bcId}`, canvasId, () => setDirty(true), { poll: false });
  /* ⭐ El chat aplica por los MISMOS verbos que la edición a mano. Las defs salen por PLANTILLA: una
     def ausente hace que el ejecutor rechace campos que sí existen. */
  useEjecutarOperacionesDelChat(hook, defsForCanvas(templateId, hook.sections), CAPACIDADES_POR_PIEZA[PIEZA_PROPUESTA_COMERCIAL]);
  const sectionByKey = new Map<string, SectionWithBlocks>(hook.sections.map((s) => [s.key, s]));
  const sectionsData: LandingSectionData[] = hook.sections.map((s) => ({
    key: s.key,
    data: s.blocks[0]?.data ?? null,
    brief: s.agentBriefOverride,
    titleOverride: s.titleOverride,
    eyebrowOverride: s.eyebrowOverride,
    hidden: s.hidden,
  }));
  const hasContent = hook.sections.some((s) => s.blocks.some((b) => !blockBlank(b.data)));

  // Idioma: el campo persistente del caso; si es null (casos viejos), el `__lang` del hero. Ausente = español.
  const proposalLang = language ?? (sectionByKey.get("hero")?.blocks[0]?.data as { __lang?: string } | null)?.__lang ?? null;
  // Los Hubs VENDIDOS, para el asistente de licencias de «Inversión» (el motor no cruza datos entre secciones).
  const hubsVendidos = hubsVendidosDe(sectionByKey.get(SOLUCION_SECTION_KEY)?.blocks[0]?.data);
  // Config del template en el ORDEN del canvas, intersecada con sus secciones reales (ver configForCanvas).
  const landingConfig = configForCanvas(templateId, hook.sections);

  const onSectionChange = (key: string, data: unknown) => {
    const sec = sectionByKey.get(key);
    const block = sec?.blocks[0];
    if (sec && block) hook.saveBlock(sec.id, block.id, { data });
  };
  const onBriefChange = (key: string, brief: string) => {
    const sec = sectionByKey.get(key);
    if (sec) hook.setBrief(sec.id, brief);
  };
  const onTitleChange = (key: string, title: string) => {
    const sec = sectionByKey.get(key);
    if (sec) hook.renameSection(sec.id, title);
  };
  const onEyebrowChange = (key: string, eyebrow: string) => {
    const sec = sectionByKey.get(key);
    if (sec) hook.setEyebrow(sec.id, eyebrow);
  };
  // Ocultar o mostrar una sección: no borra el contenido, lo saca de lo que ve el cliente.
  const toggleHidden = async (sectionId: string, hidden: boolean) => {
    try {
      await hook.setHidden(sectionId, hidden);
      setDirty(true);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo ocultar o mostrar la sección.");
    }
  };

  /**
   * ── LA GENERACIÓN NO CUELGA DEL REQUEST (2026-08-21) ──────────────────────
   * El POST arranca la corrida y vuelve en el acto (202 + runId); el desenlace llega por el GET de
   * status. Esperar el POST cruzaba el `proxy_read_timeout` de 60 s en más de la mitad de las
   * generaciones. Como el estado vive en el `AgentRun`, recargar a mitad de una generación la RETOMA.
   */
  const [genPhase, setGenPhase] = useState<string | null>(null);
  const genIdRef = useRef(0); // identidad de la corrida seguida: descarta ticks de una vieja
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  type GenStatus = { status: string | null; phase: string | null; canvasId: string | null; version: number | null; error: string | null };

  const detenerSeguimiento = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  /** Sigue la corrida hasta su desenlace. Es el ÚNICO lugar que apaga «generando». */
  const seguirGeneracion = useCallback(() => {
    detenerSeguimiento();
    const genId = ++genIdRef.current;
    setGenerating(true);
    setGenError(null);
    const notifyUrl = `/business-cases/${bcId}?paso=propuesta`;
    const tick = async () => {
      try {
        const s = await fetchJson<GenStatus>(`/api/business-cases/${bcId}/generate/status`);
        if (genId !== genIdRef.current) return;
        if (s.status === "RUNNING") {
          if (s.phase) setGenPhase(s.phase);
          return;
        }
        detenerSeguimiento();
        setGenPhase(null);
        setGenerating(false);
        if (s.status === "DONE") {
          toast.success(s.version ? `La Propuesta ${s.version} está lista. Revísala antes de subirla.` : "La propuesta está lista.");
          // El cambio de canvasId (loadMeta → setCanvasId) dispara el refetch del editor por efecto.
          await loadMeta(s.canvasId ?? undefined);
          setDirty(true);
          void notifyAgentDone({ group: "business-case", clientName, ok: true, url: notifyUrl });
        } else if (s.status === "ERROR") {
          setGenError(s.error ?? "La generación falló.");
          void notifyAgentDone({ group: "business-case", clientName, ok: false, url: notifyUrl });
        }
      } catch {
        /* el seguimiento nunca rompe la generación: el trabajo corre en el servidor */
      }
    };
    void tick();
    pollRef.current = setInterval(tick, 2000);
  }, [bcId, clientName, detenerSeguimiento, loadMeta, toast]);

  useEffect(() => detenerSeguimiento, [detenerSeguimiento]);

  // Al abrir: si quedó una generación en curso (recarga, otra pestaña), se retoma.
  useEffect(() => {
    let vivo = true;
    void (async () => {
      try {
        const s = await fetchJson<GenStatus>(`/api/business-cases/${bcId}/generate/status`);
        if (vivo && s.status === "RUNNING") {
          setGenPhase(s.phase ?? "Generando…");
          seguirGeneracion();
        }
      } catch {
        /* sin estado legible, el botón queda normal */
      }
    })();
    return () => {
      vivo = false;
    };
  }, [bcId, seguirGeneracion]);

  const generate = async () => {
    if (generating) return;
    maybeRequestPermission(); // gesto del usuario → ofrecer activar los avisos del navegador (una vez)
    setGenerating(true);
    setGenError(null);
    setGenPhase("Preparando…");
    setPaso("propuesta");
    try {
      // El arrastre de portada, marcas y orden lo arma el servidor leyendo el canvas: esperar lo que está en vuelo.
      await hook.flushPending();
      await fetchJson<{ runId: string }>(`/api/business-cases/${bcId}/generate`, { method: "POST" });
      seguirGeneracion();
    } catch (e) {
      // Un fallo ACÁ es del arranque (ya hay una en curso, permisos, red): la corrida ni existe.
      setGenerating(false);
      setGenPhase(null);
      toast.error(e instanceof ApiError ? e.message : "No se pudo arrancar la generación.");
    }
  };

  const publish = async () => {
    if (publishing) return;
    // Aviso (no frena) si «Casos de uso» del documento difiere de lo marcado en el contexto.
    if (ucSelectedTitles !== null) {
      const sec = sectionByKey.get("casos_de_uso");
      const inSection = ((sec?.blocks[0]?.data as { items?: { title?: string }[] } | null)?.items ?? [])
        .map((i) => (i.title ?? "").trim())
        .filter(Boolean)
        .sort();
      const inChecklist = ucSelectedTitles.map((t) => t.trim()).filter(Boolean).sort();
      if (JSON.stringify(inSection) !== JSON.stringify(inChecklist)) {
        toast.info("Ojo: los casos de uso del documento no son los marcados en el contexto. Se sube lo que ves en la sección.");
      }
    }
    setPublishing(true);
    try {
      // Esperar los guardados en vuelo: sin esto, subir justo después de tipear podía leer la base antes del último cambio.
      await hook.flushPending();
      await fetchJson(`/api/business-cases/${bcId}/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ canvasId }),
      });
      setPublished(true);
      setSubidaEn(new Date().toISOString());
      setDirty(false);
      setAccessNonce((n) => n + 1);
      toast.success("Subida. El cliente ya ve esta propuesta.");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo subir al cliente.");
    } finally {
      setPublishing(false);
    }
  };

  const hasCanvas = !!canvasId;
  const activeVersion = versions.find((v) => v.canvasId === canvasId)?.version;
  const isTemplate = activeVersion === 0;
  const generadas = versions.filter((v) => v.version > 0);
  const ultima = generadas.reduce((m, v) => Math.max(m, v.version), 0);
  const unpublished = !published || dirty;

  const deleteCanvas = async (cid: string) => {
    try {
      const r = await fetchJson<{ activeCanvasId: string | null }>(`/api/business-cases/${bcId}/canvases/${cid}`, { method: "DELETE" });
      toast.success("Propuesta borrada.");
      await loadMeta(r.activeCanvasId ?? undefined);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo borrar la propuesta.");
    }
  };

  /* Lo marcado en «Casos de uso» → la sección `casos_de_uso` del canvas que se está VIENDO (se sube
     el canvas elegido, no «el activo»). SOLO al tocar uno: al cargar pisaría ediciones a mano. */
  const syncUseCasesIntoSection = (items: { title: string; detail: string; price: string }[]) => {
    if (isTemplate) {
      toast.info("Guardado. Se aplica a las propuestas generadas (estás viendo la Plantilla).");
      return;
    }
    const sec = sectionByKey.get("casos_de_uso");
    const block = sec?.blocks[0];
    if (sec && block) {
      hook.saveBlock(sec.id, block.id, { data: { items } });
      toast.info("Sección «Casos de uso» actualizada desde el catálogo.");
    } else {
      toast.info("Guardado. Esta propuesta no tiene la sección «Casos de uso»: genera otra para incluirla.");
    }
  };

  // ── Antes de subir: los mismos frenos que el servidor, a la vista antes del botón ─────────────
  const avisos: AvisoAntesDeSubir[] =
    hasCanvas && !hook.loading && !isTemplate
      ? antesDeSubir(hook.sections.map((s) => ({ key: s.key, hidden: s.hidden, data: s.blocks[0]?.data ?? null })))
      : [];
  const frena = frenaLaSubida(avisos);

  // ── En qué está cada paso (la barra de la izquierda) ───────────────────────────────────────
  const totalContexto = cuentas ? cuentas.hubspot + cuentas.meet + cuentas.manuales + cuentas.preventa : 0;
  const compartida = published && linkVivo;
  const aprobacion = acceso?.approval ?? null;
  const estados: Record<PasoDeLaPropuesta, EstadoDelPaso> = {
    contexto:
      !cuentas || cuentas.cargando
        ? { nota: "Cargando…", tono: "vacio" }
        : { nota: `${totalContexto} fuente${totalContexto === 1 ? " alimenta" : "s alimentan"}`, tono: cuentas.hayMaterial ? "listo" : "pendiente" },
    propuesta: generating
      ? { nota: `Generando la Propuesta ${ultima + 1}`, tono: "trabajando" }
      : genError
        ? { nota: `La Propuesta ${ultima + 1} falló`, tono: "fallo" }
        : !versionsLoaded
          ? { nota: "Cargando…", tono: "vacio" }
          : ultima === 0
            ? { nota: "Sin generar", tono: "vacio" }
            : !published
              ? { nota: `Propuesta ${ultima} · sin subir`, tono: "pendiente" }
              : dirty
                ? { nota: "Cambios sin subir", tono: "pendiente" }
                : { nota: "Subida, al día", tono: "listo" },
    compartir: !compartida
      ? { nota: "Sin compartir", tono: "vacio" }
      : aprobacion
        ? aprobacion.desactualizada
          ? { nota: "Aprobó otra versión", tono: "pendiente" }
          : { nota: `✓ Aprobada el ${fechaDeVentas(aprobacion.approvedAt)}`, tono: "listo" }
        : acceso?.lastUsedAt
          ? { nota: `La abrió el ${fechaDeVentas(acceso.lastUsedAt)}`, tono: "listo" }
          : { nota: "Todavía no la abre", tono: "pendiente" },
  };
  const sinUsar = preventa && !preventa.exploracionId ? preventa.disponibles.length : 0;

  // ── Qué sigue, por paso ─────────────────────────────────────────────────────────────────
  const queSigue = (): { titulo: string; texto: string; accion?: ReactNode } => {
    if (paso === "contexto") {
      if (cuentas && !cuentas.cargando && !cuentas.hayMaterial)
        return { titulo: "Suma contexto", texto: "Sin ninguna fuente con contenido el agente no tiene de qué escribir. Pega una nota, elige una reunión con transcripción o usa la preventa." };
      if (sinUsar > 0)
        return {
          titulo: "¿Usas la preventa?",
          texto: `${clientName} tiene ${sinUsar === 1 ? "una preventa sin usar" : `${sinUsar} preventas sin usar`}. Úsala para que el agente lea lo confirmado allí, o genera sin ella: las dos cosas valen.`,
        };
      if (ultima === 0)
        return { titulo: "Genera la propuesta", texto: "Tarda alrededor de un minuto, y puedes irte a otra pantalla: te avisamos al terminar." };
      return { titulo: "El contexto está listo", texto: `Si lo cambiaste, genera otra: nace la Propuesta ${ultima + 1} y la ${ultima} queda como está.` };
    }
    if (paso === "propuesta") {
      if (generating) return { titulo: "Espera a que termine", texto: "Lo que tiene el cliente no cambia mientras tanto. Si recargas o te vas, la generación sigue y se retoma acá." };
      if (genError) return { titulo: "Vuelve a generar", texto: "Suele pasar con contextos muy largos. Si vuelve a fallar, saca del contexto lo que no es de esta venta." };
      if (ultima === 0)
        return {
          titulo: "Primero, el contexto",
          texto: "Todavía no hay ninguna propuesta generada. Revisa qué va a leer el agente y genérala desde ahí.",
          accion: (
            <button type="button" onClick={() => setPaso("contexto")} className={BOTON_BLANCO}>
              Ir al contexto
            </button>
          ),
        };
      if (frena) return { titulo: "Arregla lo que frena", texto: "Lo rojo de «Antes de subir» no deja subirla. Se arregla en el documento, abajo." };
      if (unpublished) return { titulo: published ? "Vuelve a subirla" : "Revísala y súbela", texto: published ? "Tus cambios llegan al cliente cuando la vuelves a subir. El link no cambia." : "Cuando la subas nace el link para el cliente, en el paso Compartir." };
      return {
        titulo: "Compártela",
        texto: "El cliente ya ve esta versión. Copia el link y mira si la abre.",
        accion: (
          <button type="button" onClick={() => setPaso("compartir")} className={BOTON_BLANCO}>
            Ir a Compartir
          </button>
        ),
      };
    }
    if (!compartida) return { titulo: "Súbela al cliente", texto: "El link nace al subirla, en el paso Propuesta." };
    if (aprobacion?.desactualizada)
      return { titulo: "Confírmalo con el cliente", texto: "Cuéntale qué cambió desde que la aprobó. Si está de acuerdo, quita la aprobación y que la apruebe de nuevo." };
    if (aprobacion)
      return { titulo: "Marca el trato como ganado", texto: "En HubSpot. Con el trato ganado nace el proyecto, y las etiquetas de esta propuesta pasan al handoff." };
    if (acceso?.lastUsedAt)
      return { titulo: "Espera la aprobación", texto: `La abrió el ${fechaDeVentas(acceso.lastUsedAt)}. Si en unos días no responde, reenvíale el link: es el mismo.` };
    return { titulo: "Mándale el link", texto: "Todavía no la abre. Copia el link y mándaselo por correo o por WhatsApp." };
  };
  const sigue = queSigue();
  const cajaQueSigue = (
    <QueSigue accion={sigue.accion}>
      <span className="block text-[15px] font-semibold leading-5">{sigue.titulo}</span>
      <span className="mt-1 block text-[13px] leading-[19px] text-fg-secondary">{sigue.texto}</span>
    </QueSigue>
  );

  const botonGenerar = (
    <div className="flex flex-wrap items-center justify-end gap-3">
      <span className="text-xs text-fg-muted">
        {ultima === 0 ? "Crea la Propuesta 1." : `Crea la Propuesta ${ultima + 1}. La ${ultima} queda como está.`}
      </span>
      <button
        type="button"
        onClick={() => void generate()}
        disabled={!puedeEditar || generating || (!!cuentas && !cuentas.cargando && !cuentas.hayMaterial)}
        className={BOTON_AZUL}
      >
        {generating ? "Generando…" : "Generar la propuesta"}
      </button>
    </div>
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
      <PasosDeLaPropuesta
        paso={paso}
        onPaso={setPaso}
        estados={estados}
        tratoUrl={tratoUrl}
        preventa={preventa ? { usadaId: preventa.exploracionId, sinUsar } : null}
      />

      {/* ── 1 · Contexto ─────────────────────────────────────────────────────────────── */}
      <div hidden={paso !== "contexto"} className="min-w-0 flex-1">
        <div className="flex flex-col xl:flex-row">
          <main className="min-w-0 flex-1 bg-surface-muted px-6 pb-10 pt-6">
            <ContextoDeLaPropuesta
              bcId={bcId}
              empresa={clientName}
              puedeEditar={puedeEditar}
              preventa={preventa}
              preventaOcupada={preventaOcupada}
              onUsarPreventa={(id) => void usarPreventa(id)}
              onCuentas={setCuentas}
              onAfterChange={() => setDirty(true)}
              onUseCasesSync={syncUseCasesIntoSection}
              onUseCasesState={setUcSelectedTitles}
              pie={botonGenerar}
            />
          </main>
          <PanelLateral etiqueta="Qué sigue" ancho="xl:w-[300px]" breakpoint="xl" className="p-5" gap="gap-5">
            {cajaQueSigue}
            {cuentas && !cuentas.cargando && (
              <div className="flex flex-col gap-2">
                <span className={ROTULO}>Lo que va a leer</span>
                <ul className="flex flex-col gap-1.5 text-[13px] text-fg-secondary">
                  <li className="flex justify-between">
                    <span>HubSpot</span>
                    <span>
                      {cuentas.hubspot} de {cuentas.hubspotTotal}
                    </span>
                  </li>
                  <li className="flex justify-between">
                    <span>Google Meet</span>
                    <span>{cuentas.meet}</span>
                  </li>
                  <li className="flex justify-between">
                    <span>Fuentes manuales</span>
                    <span>{cuentas.manuales}</span>
                  </li>
                  <li className="flex justify-between">
                    <span>Preventa</span>
                    <span>{cuentas.preventa ? "✓" : "—"}</span>
                  </li>
                </ul>
                {cuentas.meetSinTranscripcion > 0 && (
                  <span className="text-xs leading-[17px] text-fg-muted">
                    {cuentas.meetSinTranscripcion === 1 ? "Una reunión elegida no tiene" : `${cuentas.meetSinTranscripcion} reuniones elegidas no tienen`} transcripción: se ve en la lista, pero el agente no la puede leer.
                  </span>
                )}
              </div>
            )}
            <div className="flex flex-col gap-1.5">
              <span className={ROTULO}>Con o sin preventa</span>
              <span className="text-[13px] leading-[19px] text-fg-secondary">
                La preventa ayuda, pero no es un requisito. Una propuesta usa una sola preventa; una preventa puede tener varias propuestas.
              </span>
            </div>
          </PanelLateral>
        </div>
      </div>

      {/* ── 2 · Propuesta ────────────────────────────────────────────────────────────── */}
      <div hidden={paso !== "propuesta"} className="min-w-0 flex-1 bg-surface-muted px-6 pb-10 pt-6">
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="text-[22px] font-bold leading-7 text-fg">Propuesta</h2>
              {generadas.length > 0 && <CanvasDropdown versions={versions} canvasId={canvasId} onSwitch={setCanvasId} onDelete={deleteCanvas} />}
              {!isTemplate && ultima > 0 && (
                <span
                  className={cn(
                    "rounded-full border px-2.5 py-0.5 text-xs font-semibold",
                    unpublished ? "border-warn-line bg-warn-surface text-warn-ink" : "border-success-line bg-success-surface text-success-ink",
                  )}
                >
                  {!published ? "Sin subir" : dirty ? "Cambios sin subir" : "Subida, al día"}
                </span>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {onAbrirChat && !isTemplate && puedeConversar(PIEZA_PROPUESTA_COMERCIAL, hasContent) && (
                <button type="button" onClick={onAbrirChat} className={BOTON_BLANCO}>
                  <svg className="h-[15px] w-[15px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                  </svg>
                  Asistente
                </button>
              )}
              {hasCanvas && !isTemplate && <DownloadPdfButton bcId={bcId} canvasId={canvasId} />}
              {puedeEditar && ultima > 0 && (
                <button type="button" onClick={() => void generate()} disabled={generating} className={BOTON_BLANCO}>
                  Generar otra
                </button>
              )}
              {puedeEditar && !isTemplate && hasCanvas && (
                <button
                  type="button"
                  onClick={() => void publish()}
                  disabled={publishing || generating || frena || !unpublished}
                  title={frena ? "Arregla lo que frena en «Antes de subir»" : !unpublished ? "El cliente ya ve esta versión" : undefined}
                  className={BOTON_AZUL}
                >
                  {publishing ? "Subiendo…" : published ? "Volver a subir" : "Subir al cliente"}
                </button>
              )}
            </div>
          </div>

          {genError && !generating && (
            <section role="alert" className="flex flex-wrap items-start gap-3 rounded-xl border border-danger-line bg-danger-surface px-4 py-3">
              <span className="flex min-w-60 flex-1 flex-col gap-1">
                <span className="text-sm font-semibold text-danger-ink">La Propuesta {ultima + 1} no se pudo generar.</span>
                <span className="text-[13px] leading-[19px] text-fg-secondary">
                  {genError}
                  {ultima > 0 ? ` La Propuesta ${ultima} no se tocó.` : ""}
                </span>
              </span>
              {puedeEditar && (
                <button type="button" onClick={() => void generate()} className={BOTON_BLANCO}>
                  Volver a generar
                </button>
              )}
            </section>
          )}

          {generating && (
            <section aria-live="polite" className="flex flex-col gap-1.5 rounded-xl border border-info-line bg-info-surface px-4 py-3">
              <span className="text-sm font-semibold text-brand">Generando la Propuesta {ultima + 1}</span>
              <span className="text-[13px] text-fg-secondary">{genPhase ?? "Generando…"}</span>
              <span className="text-xs leading-[17px] text-fg-muted">
                Suele tardar alrededor de un minuto. Puedes irte a otra pantalla o cerrar esta: la generación sigue y te avisamos al terminar.
              </span>
            </section>
          )}

          {!isTemplate && ultima > 0 && (
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              {cajaQueSigue}
              <section aria-label="Antes de subir" className="flex flex-col gap-2 rounded-xl border border-line bg-surface p-3.5">
                <span className={ROTULO}>Antes de subir</span>
                {hook.loading || !hasCanvas ? (
                  <span className="text-[13px] text-fg-muted">Revisando…</span>
                ) : (
                  <ul className="flex flex-col gap-1.5">
                    {avisos.map((a, i) => (
                      <li
                        key={i}
                        className={cn(
                          "flex gap-2 text-[13px] leading-[19px]",
                          a.nivel === "frena" ? "text-danger-ink" : a.nivel === "aviso" ? "text-warn-ink" : "text-fg-secondary",
                        )}
                      >
                        <span aria-hidden className="flex-shrink-0">
                          {a.nivel === "ok" ? "✓" : "●"}
                        </span>
                        {a.texto}
                      </li>
                    ))}
                  </ul>
                )}
                <span className="text-xs text-fg-muted">
                  Lo ámbar no frena la subida; lo rojo sí.
                  {published && subidaEn ? ` El cliente ve lo que subiste el ${fechaDeVentas(subidaEn)}.` : ""}
                </span>
              </section>
            </div>
          )}

          {hook.error && (
            <div className="flex items-center gap-3 rounded-xl border border-danger-line bg-danger-surface px-4 py-3 text-danger-ink">
              <span className="flex-1 text-sm font-medium">{hook.error}</span>
              <button type="button" onClick={hook.clearError} className="text-xs font-semibold hover:underline">
                Cerrar
              </button>
            </div>
          )}

          {/* El chat del documento: «Cambiar» de cada sección. ⛔ En la Plantilla NO: ahí se editan las guías del agente. */}
          <ChatDeSeccionDisponible cuando={!!onAbrirChat && !isTemplate && puedeConversar(PIEZA_PROPUESTA_COMERCIAL, hasContent)} />
          {!isTemplate && hasCanvas && !hook.loading && (
            <DocumentAssist
              url={`/api/business-cases/${bcId}/assist`}
              extraBody={{ canvasId }}
              dialogTitle="Mejorar la propuesta con IA"
              chips={["Hazlo más orientado a valor de negocio", "Refuerza el ROI con datos del contexto", "Resume las secciones largas"]}
              placeholder='Ej: "haz los dolores más específicos de esta industria"'
              labelFor={(key) => hook.sections.find((s) => s.key === key)?.label ?? key}
              onApplySection={(key, data) => {
                const s = hook.sections.find((x) => x.key === key);
                if (!s) return;
                const card = s.blocks.find((b) => b.blockType === "CARD");
                return hook.upsertCardData(s.id, card?.id ?? null, data);
              }}
              onApplied={() => setDirty(true)}
            />
          )}

          {versionsLoaded && ultima === 0 && !generating && !hasCanvas ? (
            <section className="flex flex-col items-center gap-2.5 rounded-xl border border-dashed border-line bg-surface px-6 py-12 text-center">
              <span className="text-[15px] font-semibold text-fg">Todavía no hay ninguna propuesta</span>
              <span className="max-w-md text-[13px] leading-[19px] text-fg-muted">Se genera desde el contexto, con lo que va a leer el agente a la vista.</span>
            </section>
          ) : (
            <MarcoDelDocumento loVeElCliente={!isTemplate}>
              {!hasCanvas || hook.loading ? (
                <div className="p-8 text-center text-sm text-fg-muted">{hasCanvas ? "Cargando…" : "Preparando…"}</div>
              ) : (
                <LandingView
                  config={landingConfig}
                  ctx={{
                    clientName,
                    lang: proposalLang,
                    propuesta: { hubsVendidos, inversion: inversionDelDocumento(sectionsData) },
                    clientLogoUrl: clientLogo,
                    clientLogoDarkUrl,
                    clientLogoScale,
                    smarteamLogoUrl,
                    brandLogos,
                    imageUploadUrl: `/api/business-cases/${bcId}/images`,
                    clientLogoUploadUrl: clientId ? `/api/clients/${clientId}/logo` : null,
                    onClientLogoChange: (url) => {
                      setClientLogo(url);
                      setDirty(true);
                      toast.success("Logo del cliente actualizado.");
                    },
                  }}
                  sections={sectionsData}
                  mode="edit"
                  showBriefs={isTemplate}
                  onSectionChange={onSectionChange}
                  onBriefChange={onBriefChange}
                  onTitleChange={onTitleChange}
                  onEyebrowChange={onEyebrowChange}
                  onToggleHidden={(key, hidden) => {
                    const sec = sectionByKey.get(key);
                    if (sec) void toggleHidden(sec.id, hidden);
                  }}
                  onReorder={(orderedKeys) => {
                    const ids = orderedKeys.map((k) => sectionByKey.get(k)?.id).filter((sid): sid is string => !!sid);
                    if (ids.length) {
                      hook.reorderSections(ids);
                      setDirty(true);
                    }
                  }}
                  renderOverlay={(key) => <SectionTools section={sectionByKey.get(key)} hook={hook} isTemplate={isTemplate} templateId={templateId} />}
                />
              )}
              {/* Agregar una sección propia, al pie del documento (nace al final). En la Plantilla no. */}
              {hasCanvas && !hook.loading && !isTemplate && puedeEditar && (
                <AgregarSeccion
                  onAdd={(label, tipo) =>
                    void hook.addSection(label, tipo).then((ok) => {
                      if (ok) setDirty(true);
                    })
                  }
                />
              )}
            </MarcoDelDocumento>
          )}
        </div>
      </div>

      {/* ── 3 · Compartir ────────────────────────────────────────────────────────────── */}
      <div hidden={paso !== "compartir"} className="min-w-0 flex-1">
        <div className="flex flex-col xl:flex-row">
          <main className="min-w-0 flex-1 bg-surface-muted px-6 pb-10 pt-6">
            <CompartirLaPropuesta
              acceso={acceso}
              linkVivo={linkVivo}
              publicada={published}
              publicadaEn={subidaEn}
              onIrAPropuesta={() => setPaso("propuesta")}
              ajustar={ajustar}
              revocar={revocar}
              onRevocada={() => setPublished(false)}
            />
          </main>
          <PanelLateral etiqueta="Qué sigue" ancho="xl:w-[300px]" breakpoint="xl" className="p-5" gap="gap-5">
            {cajaQueSigue}
            <div className="flex flex-col gap-1.5">
              <span className={ROTULO}>Cómo la aprueba</span>
              <span className="text-[13px] leading-[19px] text-fg-secondary">
                Al final de la propuesta hay un botón «Aprobar propuesta». Deja su correo y su nombre; no necesita cuenta. Te llega acá y en la lista.
              </span>
            </div>
          </PanelLateral>
        </div>
      </div>
    </div>
  );
}

/**
 * Agregar una sección propia: un botón que se abre a un nombre y un TIPO. Los tipos salen del
 * catálogo —el MISMO conjunto que puede crear el chat—: si el menú y el chat ofrecieran cosas
 * distintas, «crea una tabla» significaría dos cosas según por dónde lo pidas.
 */
function AgregarSeccion({ onAdd }: { onAdd: (label: string, tipo: string) => void }) {
  const [abierto, setAbierto] = useState(false);
  const [nombre, setNombre] = useState("");
  const [tipo, setTipo] = useState(TIPO_POR_DEFECTO);
  const tipos = catalogoLegible();

  const enviar = () => {
    const v = nombre.trim();
    if (!v) return;
    onAdd(v, tipo);
    setNombre("");
    setTipo(TIPO_POR_DEFECTO);
    setAbierto(false);
  };

  return (
    <div className="border-t border-line px-6 pb-6 pt-4">
      {abierto ? (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-line bg-surface p-3">
          <input
            autoFocus
            value={nombre}
            maxLength={60}
            onChange={(e) => setNombre(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") enviar();
              if (e.key === "Escape") setAbierto(false);
            }}
            placeholder="Nombre de la sección (ej. Demo de la automatización)"
            className="min-w-64 flex-1 rounded-lg border border-line bg-surface px-3 py-1.5 text-sm text-fg outline-none focus:border-brand"
          />
          {/* El `title` de cada opción dice qué pinta: elegir un tipo sin saber qué dibuja es elegir a ciegas. */}
          <select
            value={tipo}
            onChange={(e) => setTipo(e.target.value)}
            aria-label="Qué clase de sección"
            className="rounded-lg border border-line bg-surface px-2 py-1.5 text-sm text-fg outline-none focus:border-brand"
          >
            {tipos.map((t) => (
              <option key={t.tipo} value={t.tipo} title={t.queEs}>
                {t.nombre}
              </option>
            ))}
          </select>
          <Button size="sm" onClick={enviar} disabled={!nombre.trim()}>
            Agregar
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setAbierto(false)}>
            Cancelar
          </Button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAbierto(true)}
          className="w-full rounded-xl border border-dashed border-line py-3 text-sm text-fg-muted transition-colors hover:border-brand hover:text-brand"
        >
          + Agregar una sección propia
        </button>
      )}
    </div>
  );
}

/** Un `data` estructurado está «en blanco» si todos sus textos y listas lo están. */
function blockBlank(v: unknown): boolean {
  if (v == null) return true;
  if (typeof v === "string") return v.trim() === "";
  if (Array.isArray(v)) return v.every(blockBlank);
  if (typeof v === "object") return Object.values(v as Record<string, unknown>).every(blockBlank);
  return false;
}
