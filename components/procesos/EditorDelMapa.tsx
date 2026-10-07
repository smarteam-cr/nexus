"use client";

/**
 * components/procesos/EditorDelMapa.tsx — EDITAR EL MAPA DE UN PROCESO EN PANTALLA COMPLETA.
 *
 * Se abre desde el detalle del proceso («Editar el mapa», el botón de pantalla completa del mapa o
 * «Editar el paso»). Cubre todo Nexus (`PantallaCompleta` de components/ui) y quien lo abre le pide al
 * navegador la pantalla completa de la página entera en el mismo clic. Esc sale de la pantalla
 * completa del navegador; el editor sigue abierto hasta Guardar o Cancelar.
 *
 * Cada cosa que se hace es una operación (`lib/procesos/operaciones.ts`): el editor guarda la lista,
 * la aplica para mostrar cómo queda, deshacer quita la última y Guardar se la manda al servidor, que
 * la vuelve a aplicar con la misma función sobre la versión que estaba abierta. El chat de Nexus va a
 * proponer estas mismas operaciones.
 *
 * Lo que NO hace, a propósito:
 *  - guardar posiciones: el acomodo es automático; el carril dice quién hace el paso y las flechas el
 *    orden. Arrastrar un paso a otro carril cambia quién lo hace (y nada más).
 *  - escribir citas a mano: se eligen de lo que dijeron en las reuniones (las lecturas del agente) y el
 *    servidor las vuelve a buscar en la transcripción al guardar.
 *
 * Diseño: «Procesos» › Editor (Claude Design, sistema «Nexus · interfaz interna»).
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Background,
  BackgroundVariant,
  ControlButton,
  Controls,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  applyNodeChanges,
  useReactFlow,
  useViewport,
  type Edge,
  type Node,
  type OnNodesChange,
} from "@xyflow/react";
import { Field, Input, Segmentado, Select, Spinner, Textarea } from "@/components/ui";
import {
  PantallaCompleta,
  pedirPantallaCompletaDelNavegador,
  salirDePantallaCompletaDelNavegador,
  useEnPantallaCompletaDelNavegador,
} from "@/components/ui/PantallaCompleta";
import { ROTULO_DEL_SISTEMA } from "@/components/ui/sistema";
import { cn } from "@/lib/cn";
import { MEDIDAS } from "@/lib/procesos/layout";
import {
  CAMBIOS,
  ETIQUETA_DE_ORIGEN,
  TIPOS_DE_CARRIL,
  TIPOS_DE_PASO,
  type CambioDelPaso,
  type CitaDelPaso,
  type MapaDeProceso,
  type OrigenDelPaso,
  type PasoDelMapa,
  type TipoDeCarril,
  type TipoDePaso,
} from "@/lib/procesos/mapa";
import {
  aplicarOperaciones,
  ErrorDeOperacion,
  nuevoId,
  ORIGENES_DE,
  TOPES,
  type CambiosDelPaso,
  type OperacionDelMapa,
} from "@/lib/procesos/operaciones";
import {
  armarFlujo,
  COLORES_DE_REACT_FLOW,
  encuadre,
  ETIQUETA_DE_CARRIL,
  IconoEncuadrar,
  IconoPantallaCompleta,
  pieDeCita,
  tiposDeNodo,
  type CualVersion,
  type Elegido,
} from "./MapaPorCarriles";

/** Lo que devuelve el servidor al guardar. */
export interface MapaGuardado {
  mapa: MapaDeProceso;
  /** Citas nuevas que no aparecieron tal cual en su reunión: no quedaron. */
  citasDescartadas: number;
}

/** Un hecho de una reunión que se puede sumar como cita (GET …/procesos/[blockId]/hechos). */
interface Hecho {
  sesionId: string;
  sesionTitulo: string;
  fecha: string;
  cita: string;
  quien: string;
  accion: string;
}

type Herramienta = "elegir" | "paso" | "decision" | "inicioFin" | "dolor";
type Grupo = OperacionDelMapa[];
type Aviso = { tono: "error" | "aviso"; texto: string };
type Enfocar = "texto" | "dolor" | "nombreDeCarril" | "etiqueta" | null;

const VERSIONES = [
  { clave: "hoy" as const, etiqueta: "Hoy" },
  { clave: "despues" as const, etiqueta: "Después de la implementación" },
];
const CORTO: Record<OrigenDelPaso, string> = { dicho: "Lo dijo el cliente", acordado: "Acordado", propuesto: "Propuesto", supuesto: "Supuesto" };
const ETIQUETA_DE_TIPO: Record<TipoDePaso, string> = { inicio: "Inicio", paso: "Paso", decision: "Decisión", espera: "Espera", fin: "Fin" };
const ETIQUETA_DE_CAMBIO: Record<CambioDelPaso, string> = { igual: "Igual que hoy", cambia: "Cambia", nuevo: "Nuevo", automatico: "Lo hace un sistema" };
const TEXTO_NUEVO: Record<Exclude<Herramienta, "elegir" | "dolor">, string> = { paso: "Paso nuevo", decision: "¿Qué se decide?", inicioFin: "Inicio del proceso" };
const MOSTRAR_HECHOS = 60;

// ── Íconos de la barra de herramientas (los del diseño) ─────────────────────────

const TRAZO = { fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" } as const;
const ICONOS: Record<Herramienta | "carril", ReactNode> = {
  elegir: <path d="M5 3l14 8-6 2-2 6z" />,
  paso: <rect x="4" y="6" width="16" height="12" rx="2" />,
  decision: <path d="M12 3l9 9-9 9-9-9z" />,
  inicioFin: <rect x="3" y="7" width="18" height="10" rx="5" />,
  carril: <path d="M3 6h18M3 12h18M3 18h18" />,
  dolor: <path d="M12 9v4M12 17h.01M10.3 3.9L2 18a2 2 0 001.7 3h16.6a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z" />,
};

function BotonDeHerramienta({
  icono,
  texto,
  activo,
  deshabilitado,
  title,
  onClick,
}: {
  icono: ReactNode;
  texto: string;
  activo?: boolean;
  deshabilitado?: boolean;
  title?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={deshabilitado}
      title={title}
      aria-pressed={activo}
      className={cn(
        "flex flex-col items-center gap-[3px] rounded-lg pb-1.5 pt-2 text-[10.5px] transition-colors disabled:cursor-not-allowed disabled:opacity-40",
        activo ? "bg-info-surface font-semibold text-brand" : "text-fg-secondary hover:bg-surface-hover hover:text-fg",
      )}
    >
      <svg viewBox="0 0 24 24" width="16" height="16" style={TRAZO} aria-hidden="true">
        {icono}
      </svg>
      {texto}
    </button>
  );
}

// ── Un campo de texto que se aplica al soltarlo (no una operación por tecla) ───

function CampoDeTexto({
  etiqueta,
  valor,
  max,
  filas,
  placeholder,
  foco,
  onFocoTomado,
  onAplicar,
  deshabilitado,
}: {
  etiqueta: string;
  valor: string;
  max: number;
  /** Con filas, es un área de texto. */
  filas?: number;
  placeholder?: string;
  foco?: boolean;
  onFocoTomado?: () => void;
  /** Devuelve false si no se pudo aplicar: el campo vuelve a lo que había. */
  onAplicar: (texto: string) => boolean;
  deshabilitado?: boolean;
}) {
  const [borrador, setBorrador] = useState(valor);
  const [previo, setPrevio] = useState(valor);
  if (previo !== valor) {
    setPrevio(valor);
    setBorrador(valor);
  }
  const ref = useRef<HTMLInputElement & HTMLTextAreaElement>(null);
  useEffect(() => {
    if (!foco || !ref.current) return;
    ref.current.focus();
    ref.current.select();
    onFocoTomado?.();
  }, [foco, onFocoTomado]);
  const aplicar = () => {
    if (borrador.trim() === valor.trim()) {
      if (borrador !== valor) setBorrador(valor);
      return;
    }
    if (!onAplicar(borrador)) setBorrador(valor);
  };
  const comun = {
    ref,
    value: borrador,
    maxLength: max,
    placeholder,
    disabled: deshabilitado,
    onChange: (e: { target: { value: string } }) => setBorrador(e.target.value),
    onBlur: aplicar,
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !(filas && e.shiftKey)) {
        e.preventDefault();
        (e.target as HTMLElement).blur();
      } else if (e.key === "Escape") {
        e.preventDefault();
        setBorrador(valor);
        requestAnimationFrame(() => (e.target as HTMLElement).blur());
      }
    },
  };
  return (
    <Field label={etiqueta} labelClassName="text-xs font-normal text-fg-muted" className="space-y-1">
      {filas ? (
        <Textarea {...comun} rows={filas} className="rounded-lg px-2.5 py-[7px] text-[13px]" />
      ) : (
        <Input {...comun} className="bg-surface px-2.5 py-[7px] text-[13px]" />
      )}
    </Field>
  );
}

// ── El panel de la derecha ──────────────────────────────────────────────────────

const ENLACE_AZUL = "self-start text-xs font-semibold text-brand transition-colors hover:text-brand-light disabled:opacity-50";
const ENLACE_GRIS = "text-[11.5px] text-fg-muted transition-colors hover:text-fg";

function ElegirCita({
  hechos,
  delProceso,
  yaEstan,
  onElegir,
  onVolver,
}: {
  hechos: Hecho[];
  delProceso: boolean;
  yaEstan: Set<string>;
  onElegir: (h: Hecho) => void;
  onVolver: () => void;
}) {
  const [busqueda, setBusqueda] = useState("");
  const q = busqueda.trim().toLowerCase();
  const disponibles = hechos.filter((h) => !yaEstan.has(`${h.sesionId}|${h.cita}`));
  const filtrados = q
    ? disponibles.filter((h) => [h.cita, h.quien, h.sesionTitulo, h.accion].some((t) => t.toLowerCase().includes(q)))
    : disponibles;
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <span className={ROTULO_DEL_SISTEMA}>Elige lo que dijeron</span>
        <button type="button" onClick={onVolver} className={ENLACE_GRIS}>
          Volver al paso
        </button>
      </div>
      <Input
        autoFocus
        value={busqueda}
        onChange={(e) => setBusqueda(e.target.value)}
        placeholder="Buscar por palabra, persona o reunión"
        aria-label="Buscar en lo que dijeron"
        className="bg-surface px-2.5 py-[7px] text-[13px]"
      />
      <p className="text-xs leading-relaxed text-fg-muted">
        {delProceso ? "Lo que dijeron en las reuniones sobre este proceso" : "Lo que dijeron en las reuniones del cliente (este mapa es de antes y no sabe cuáles son de este proceso)"}
        {` · ${filtrados.length}`}
      </p>
      <ul className="-mx-1 flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-1 pb-1">
        {filtrados.slice(0, MOSTRAR_HECHOS).map((h, i) => (
          <li key={`${h.sesionId}-${i}`}>
            <button
              type="button"
              onClick={() => onElegir(h)}
              className="flex w-full flex-col gap-1 rounded-lg border border-line bg-surface px-3 py-2.5 text-left transition-colors hover:border-info-line hover:bg-info-surface"
            >
              <span className="text-[13px] leading-[1.45] text-fg">«{h.cita}»</span>
              <span className="text-[11.5px] text-fg-muted">{pieDeCita(h)}</span>
            </button>
          </li>
        ))}
        {filtrados.length === 0 && <li className="text-[13px] text-fg-muted">{q ? "Nada coincide con la búsqueda." : "No hay más hechos para sumar."}</li>}
        {filtrados.length > MOSTRAR_HECHOS && (
          <li className="text-xs text-fg-muted">
            Se ven {MOSTRAR_HECHOS} de {filtrados.length}: busca para acotar.
          </li>
        )}
      </ul>
      <p className="text-xs leading-relaxed text-fg-muted">Al guardar, Nexus busca cada cita nueva en la transcripción de su reunión: si no aparece tal cual, no queda.</p>
    </div>
  );
}

function PanelDelPaso({
  mapa,
  cual,
  paso,
  soloLectura,
  hechos,
  delProceso,
  errorDeHechos,
  foco,
  onFocoTomado,
  hacer,
  onCitaCambiada,
}: {
  mapa: MapaDeProceso;
  cual: CualVersion;
  paso: PasoDelMapa;
  soloLectura: boolean;
  hechos: Hecho[] | null;
  delProceso: boolean;
  errorDeHechos: string | null;
  foco: Enfocar;
  onFocoTomado: () => void;
  hacer: (grupo: Grupo) => boolean;
  onCitaCambiada: (texto: string) => void;
}) {
  const [eligiendo, setEligiendo] = useState<{ reemplaza?: CitaDelPaso } | null>(null);
  const version = mapa[cual];
  const editar = (cambios: CambiosDelPaso) => hacer([{ tipo: "paso.editar", version: cual, pasoId: paso.id, cambios }]);
  const yaEstan = new Set(paso.citas.map((c) => `${c.sesionId}|${c.cita}`));
  const disponibles = hechos ? hechos.filter((h) => !yaEstan.has(`${h.sesionId}|${h.cita}`)).length : 0;
  const pideCita: OrigenDelPaso = cual === "hoy" ? "dicho" : "acordado";

  if (eligiendo && hechos) {
    return (
      <ElegirCita
        hechos={hechos}
        delProceso={delProceso}
        yaEstan={yaEstan}
        onVolver={() => setEligiendo(null)}
        onElegir={(h) => {
          const cita: CitaDelPaso = { sesionId: h.sesionId, sesionTitulo: h.sesionTitulo, fecha: h.fecha, cita: h.cita, ...(h.quien ? { quien: h.quien } : {}) };
          const grupo: Grupo = [];
          if (eligiendo.reemplaza) grupo.push({ tipo: "cita.quitar", version: cual, pasoId: paso.id, sesionId: eligiendo.reemplaza.sesionId, cita: eligiendo.reemplaza.cita });
          grupo.push({ tipo: "cita.agregar", version: cual, pasoId: paso.id, cita });
          // Una cita de lo que dijeron hace que el paso deje de ser supuesto (se puede volver a cambiar).
          const sube = !eligiendo.reemplaza && paso.origen !== pideCita;
          if (sube) grupo.push({ tipo: "paso.editar", version: cual, pasoId: paso.id, cambios: { origen: pideCita } });
          if (hacer(grupo)) {
            setEligiendo(null);
            if (sube) onCitaCambiada(`El paso pasa a «${CORTO[pideCita]}». Puedes volver a cambiarlo.`);
          }
        }}
      />
    );
  }

  const origenes = ORIGENES_DE[cual].map((o) => ({
    clave: o,
    etiqueta: CORTO[o],
    title: ETIQUETA_DE_ORIGEN[o] + (o === pideCita && paso.citas.length === 0 ? " · suma una cita primero" : ""),
    deshabilitada: o === pideCita && paso.citas.length === 0,
  }));
  const deHoy = mapa.hoy.pasos;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto">
      <div className="flex flex-col gap-0.5">
        <span className={ROTULO_DEL_SISTEMA}>Paso elegido</span>
        <span className="text-[15px] font-semibold leading-snug text-fg">{paso.texto}</span>
      </div>
      {soloLectura ? (
        <div className="flex flex-col gap-1.5 text-[13px] text-fg-secondary">
          <span>Lo hace: {version.carriles.find((c) => c.id === paso.carril)?.nombre ?? paso.carril}</span>
          {paso.herramienta && <span>Con: {paso.herramienta}</span>}
          {cual === "hoy" && paso.dolor && <span className="text-warn-ink">Dolor: {paso.dolor}</span>}
          {cual === "despues" && paso.enHubspot && <span>En HubSpot: {paso.enHubspot}</span>}
        </div>
      ) : (
        <>
          <CampoDeTexto
            etiqueta="Qué pasa"
            valor={paso.texto}
            max={TOPES.texto}
            foco={foco === "texto"}
            onFocoTomado={onFocoTomado}
            onAplicar={(texto) => editar({ texto })}
          />
          <div className="grid grid-cols-2 gap-2.5">
            <Field label="Quién lo hace" labelClassName="text-xs font-normal text-fg-muted" className="space-y-1">
              <Select value={paso.carril} onChange={(e) => editar({ carril: e.target.value })} className="bg-surface px-2 py-[7px] text-[13px] text-fg">
                {version.carriles.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre}
                  </option>
                ))}
              </Select>
            </Field>
            <CampoDeTexto etiqueta="Con qué" valor={paso.herramienta} max={TOPES.herramienta} placeholder="Excel, correo…" onAplicar={(herramienta) => editar({ herramienta })} />
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            <Field label="Tipo" labelClassName="text-xs font-normal text-fg-muted" className="space-y-1">
              <Select value={paso.tipo} onChange={(e) => editar({ tipo: e.target.value as TipoDePaso })} className="bg-surface px-2 py-[7px] text-[13px] text-fg">
                {TIPOS_DE_PASO.map((t) => (
                  <option key={t} value={t}>
                    {ETIQUETA_DE_TIPO[t]}
                  </option>
                ))}
              </Select>
            </Field>
            {cual === "despues" && (
              <Field label="Qué cambia" labelClassName="text-xs font-normal text-fg-muted" className="space-y-1">
                <Select
                  value={paso.cambio}
                  onChange={(e) => editar({ cambio: e.target.value as CambioDelPaso })}
                  className="bg-surface px-2 py-[7px] text-[13px] text-fg"
                >
                  {paso.cambio === "" && <option value="">Sin decir</option>}
                  {CAMBIOS.map((c) => (
                    <option key={c} value={c}>
                      {ETIQUETA_DE_CAMBIO[c]}
                    </option>
                  ))}
                </Select>
              </Field>
            )}
          </div>
          {cual === "hoy" ? (
            <CampoDeTexto
              etiqueta="Dolor (opcional)"
              valor={paso.dolor}
              max={TOPES.dolor}
              filas={2}
              placeholder="Qué falla o cuesta en este paso"
              foco={foco === "dolor"}
              onFocoTomado={onFocoTomado}
              onAplicar={(dolor) => editar({ dolor })}
            />
          ) : (
            <>
              <CampoDeTexto
                etiqueta="Dónde vive en HubSpot (opcional)"
                valor={paso.enHubspot}
                max={TOPES.enHubspot}
                placeholder="Un pipeline, un workflow, un formulario…"
                onAplicar={(enHubspot) => editar({ enHubspot })}
              />
              {deHoy.length > 0 && (
                <details className="group rounded-lg border border-line bg-surface">
                  <summary className="cursor-pointer list-none px-2.5 py-[7px] text-xs text-fg-muted marker:hidden">
                    Reemplaza a{paso.reemplaza.length ? ` (${paso.reemplaza.length})` : ""} <span className="text-fg-muted group-open:hidden">▸</span>
                    <span className="hidden text-fg-muted group-open:inline">▾</span>
                  </summary>
                  <ul className="flex max-h-44 flex-col gap-1 overflow-y-auto border-t border-line px-2.5 py-2">
                    {deHoy.map((h) => {
                      const marcado = paso.reemplaza.includes(h.id);
                      return (
                        <li key={h.id}>
                          <label className="flex cursor-pointer items-start gap-2 text-[12.5px] leading-snug text-fg-secondary">
                            <input
                              type="checkbox"
                              checked={marcado}
                              onChange={() => editar({ reemplaza: marcado ? paso.reemplaza.filter((r) => r !== h.id) : [...paso.reemplaza, h.id] })}
                              className="mt-0.5 accent-brand"
                            />
                            {h.texto}
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                </details>
              )}
            </>
          )}
        </>
      )}

      <div className="flex flex-col gap-2">
        <span className="text-xs text-fg-muted">De dónde sale</span>
        {soloLectura ? (
          <span className="text-[13px] font-medium text-fg">{ETIQUETA_DE_ORIGEN[paso.origen]}</span>
        ) : (
          <Segmentado
            opciones={origenes}
            valor={paso.origen}
            onCambio={(origen) => editar({ origen })}
            etiqueta="De dónde sale el paso"
            className="self-start [&>button]:px-3 [&>button]:py-[5px] [&>button]:text-[12.5px]"
          />
        )}
        {paso.citas.map((c) => (
          <div key={`${c.sesionId}|${c.cita}`} className="flex flex-col gap-1 rounded-lg border border-line bg-surface px-3 py-2.5">
            <span className="text-[13px] leading-[1.45] text-fg">«{c.cita}»</span>
            <span className="text-[11.5px] text-fg-muted">{pieDeCita(c)}</span>
            {!soloLectura && (
              <div className="flex gap-3">
                <button type="button" onClick={() => setEligiendo({ reemplaza: c })} disabled={!hechos} className="text-[11.5px] font-semibold text-brand transition-colors hover:text-brand-light disabled:opacity-50">
                  Cambiar cita
                </button>
                <button
                  type="button"
                  onClick={() => hacer([{ tipo: "cita.quitar", version: cual, pasoId: paso.id, sesionId: c.sesionId, cita: c.cita }])}
                  className={ENLACE_GRIS}
                >
                  Quitar
                </button>
              </div>
            )}
          </div>
        ))}
        {!soloLectura && (
          <>
            {errorDeHechos ? (
              <span className="text-xs text-danger-ink">{errorDeHechos}</span>
            ) : !hechos ? (
              <span className="text-xs text-fg-muted">Buscando lo que dijeron en las reuniones…</span>
            ) : paso.citas.length < TOPES.citasPorPaso && disponibles > 0 ? (
              <button type="button" onClick={() => setEligiendo({})} className={ENLACE_AZUL}>
                + Sumar {paso.citas.length ? "otra cita" : "una cita"} de {disponibles === 1 ? "1 hecho" : `los ${disponibles} hechos`}{" "}
                {delProceso ? "de este proceso" : "de las reuniones"}
              </button>
            ) : null}
            <span className="text-xs leading-[1.45] text-fg-muted">
              «{CORTO[pideCita]}» pide una cita de una reunión: se elige de lo que dijeron, nunca se escribe a mano. Sin cita, el paso queda como{" "}
              {cual === "hoy" ? "supuesto" : "propuesto"}.
            </span>
          </>
        )}
        {soloLectura && paso.citas.length === 0 && <span className="text-[12.5px] text-warn-ink">Sin cita de una reunión.</span>}
      </div>
      <span className="flex-1" />
      {!soloLectura && (
        <button
          type="button"
          onClick={() => hacer([{ tipo: "paso.quitar", version: cual, pasoId: paso.id }])}
          className="self-start text-[12.5px] text-danger-ink transition-colors hover:underline"
        >
          Quitar el paso
        </button>
      )}
    </div>
  );
}

function PanelDeLaFlecha({
  mapa,
  cual,
  de,
  a,
  soloLectura,
  foco,
  onFocoTomado,
  hacer,
}: {
  mapa: MapaDeProceso;
  cual: CualVersion;
  de: string;
  a: string;
  soloLectura: boolean;
  foco: boolean;
  onFocoTomado: () => void;
  hacer: (grupo: Grupo) => boolean;
}) {
  const v = mapa[cual];
  const flecha = v.flechas.find((f) => f.de === de && f.a === a);
  if (!flecha) return null;
  const desde = v.pasos.find((p) => p.id === de);
  const hasta = v.pasos.find((p) => p.id === a);
  return (
    <div className="flex flex-1 flex-col gap-4">
      <div className="flex flex-col gap-0.5">
        <span className={ROTULO_DEL_SISTEMA}>Flecha elegida</span>
        <span className="text-[15px] font-semibold leading-snug text-fg">
          De «{desde?.texto ?? de}» a «{hasta?.texto ?? a}»
        </span>
      </div>
      {soloLectura ? (
        flecha.etiqueta && <span className="text-[13px] text-fg-secondary">Dice: {flecha.etiqueta}</span>
      ) : (
        <>
          <CampoDeTexto
            etiqueta="Qué dice la flecha (opcional)"
            valor={flecha.etiqueta}
            max={TOPES.etiqueta}
            placeholder="Sí, No, Si falta un documento…"
            foco={foco}
            onFocoTomado={onFocoTomado}
            onAplicar={(etiqueta) => hacer([{ tipo: "flecha.editar", version: cual, de, a, etiqueta }])}
          />
          {desde?.tipo === "decision" && <p className="text-xs leading-relaxed text-fg-muted">Sale de una decisión: di qué camino es («Sí», «No»).</p>}
          <span className="flex-1" />
          <button
            type="button"
            onClick={() => hacer([{ tipo: "flecha.quitar", version: cual, de, a }])}
            className="self-start text-[12.5px] text-danger-ink transition-colors hover:underline"
          >
            Quitar la flecha
          </button>
        </>
      )}
    </div>
  );
}

function PanelDelCarril({
  mapa,
  cual,
  carrilId,
  soloLectura,
  foco,
  onFocoTomado,
  hacer,
}: {
  mapa: MapaDeProceso;
  cual: CualVersion;
  carrilId: string;
  soloLectura: boolean;
  foco: boolean;
  onFocoTomado: () => void;
  hacer: (grupo: Grupo) => boolean;
}) {
  const v = mapa[cual];
  const i = v.carriles.findIndex((c) => c.id === carrilId);
  const carril = v.carriles[i];
  if (!carril) return null;
  const pasos = v.pasos.filter((p) => p.carril === carrilId).length;
  const tipos = TIPOS_DE_CARRIL.map((t) => ({ clave: t, etiqueta: ETIQUETA_DE_CARRIL[t] }));
  return (
    <div className="flex flex-1 flex-col gap-4">
      <div className="flex flex-col gap-0.5">
        <span className={ROTULO_DEL_SISTEMA}>Carril elegido</span>
        <span className="text-[15px] font-semibold leading-snug text-fg">{carril.nombre}</span>
        <span className="text-xs text-fg-muted">{pasos === 0 ? "Sin pasos todavía" : pasos === 1 ? "1 paso" : `${pasos} pasos`}</span>
      </div>
      {!soloLectura && (
        <>
          <CampoDeTexto
            etiqueta="Quién es"
            valor={carril.nombre}
            max={TOPES.nombreDeCarril}
            placeholder="El aspirante, Marketing, HubSpot…"
            foco={foco}
            onFocoTomado={onFocoTomado}
            onAplicar={(nombre) => hacer([{ tipo: "carril.editar", version: cual, carrilId, nombre }])}
          />
          <div className="flex flex-col gap-1.5">
            <span className="text-xs text-fg-muted">Qué es</span>
            <Segmentado
              opciones={tipos}
              valor={carril.tipo}
              onCambio={(tipo: TipoDeCarril) => hacer([{ tipo: "carril.editar", version: cual, carrilId, tipoDeCarril: tipo }])}
              etiqueta="Qué es el carril"
              className="self-start [&>button]:px-3 [&>button]:py-[5px] [&>button]:text-[12.5px]"
            />
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={i === 0}
              onClick={() => hacer([{ tipo: "carril.mover", version: cual, carrilId, hacia: "arriba" }])}
              className="rounded-lg border border-line bg-surface px-3 py-1.5 text-[12.5px] text-fg-secondary transition-colors hover:bg-surface-hover hover:text-fg disabled:opacity-40"
            >
              ↑ Subir
            </button>
            <button
              type="button"
              disabled={i === v.carriles.length - 1}
              onClick={() => hacer([{ tipo: "carril.mover", version: cual, carrilId, hacia: "abajo" }])}
              className="rounded-lg border border-line bg-surface px-3 py-1.5 text-[12.5px] text-fg-secondary transition-colors hover:bg-surface-hover hover:text-fg disabled:opacity-40"
            >
              ↓ Bajar
            </button>
          </div>
          <span className="flex-1" />
          {pasos > 0 ? (
            <p className="text-xs leading-relaxed text-fg-muted">Para quitar el carril, primero mueve o quita sus pasos.</p>
          ) : (
            <button
              type="button"
              onClick={() => hacer([{ tipo: "carril.quitar", version: cual, carrilId }])}
              className="self-start text-[12.5px] text-danger-ink transition-colors hover:underline"
            >
              Quitar el carril
            </button>
          )}
        </>
      )}
    </div>
  );
}

function PanelSinElegir({ soloLectura, cambios }: { soloLectura: boolean; cambios: number }) {
  const pistas = soloLectura
    ? ["Toca un paso para ver de dónde sale.", "Arrastra el fondo para recorrer el mapa; la rueda acerca y aleja."]
    : [
        "Toca un paso para editarlo, o elige una herramienta a la izquierda y toca un carril para poner uno nuevo.",
        "Arrastra un paso a otro carril para cambiar quién lo hace.",
        "Une dos pasos tirando del punto azul del paso elegido.",
        "Toca el nombre de un carril para renombrarlo o moverlo.",
        "El orden lo dan las flechas: el mapa se acomoda solo.",
      ];
  return (
    <div className="flex flex-col gap-3">
      <span className={ROTULO_DEL_SISTEMA}>{soloLectura ? "Cómo se lee" : "Cómo se edita"}</span>
      <ul className="flex flex-col gap-2">
        {pistas.map((p) => (
          <li key={p} className="text-[13px] leading-relaxed text-fg-secondary">
            {p}
          </li>
        ))}
      </ul>
      {!soloLectura && (
        <p className="text-xs text-fg-muted">
          {cambios === 0 ? "Sin cambios todavía." : cambios === 1 ? "1 cambio sin guardar." : `${cambios} cambios sin guardar.`} Deshacer: Ctrl+Z · Rehacer: Ctrl+Y ·
          Quitar lo elegido: Supr.
        </p>
      )}
    </div>
  );
}

// ── El editor ───────────────────────────────────────────────────────────────────

function Editor({
  clientId,
  blockId,
  mapaInicial,
  inicial,
  soloLectura,
  onCerrar,
  onGuardado,
}: {
  clientId: string;
  blockId: string;
  mapaInicial: MapaDeProceso;
  inicial: { cual: CualVersion; pasoId?: string };
  soloLectura: boolean;
  onCerrar: () => void;
  onGuardado: (r: MapaGuardado) => void;
}) {
  const [base, setBase] = useState(mapaInicial);
  const [historia, setHistoria] = useState<Grupo[]>([]);
  const [rehacer, setRehacer] = useState<Grupo[]>([]);
  const [cual, setCual] = useState<CualVersion>(inicial.cual);
  const [elegido, setElegido] = useState<Elegido | null>(inicial.pasoId ? { que: "paso", id: inicial.pasoId } : null);
  const [herramienta, setHerramienta] = useState<Herramienta>("elegir");
  const [enfocar, setEnfocar] = useState<Enfocar>(null);
  const [aviso, setAviso] = useState<Aviso | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [saliendo, setSaliendo] = useState(false);
  const [conflicto, setConflicto] = useState<{ mapa: MapaDeProceso; motivo: string } | null>(null);
  const [hechos, setHechos] = useState<Hecho[] | null>(null);
  const [delProceso, setDelProceso] = useState(true);
  const [errorDeHechos, setErrorDeHechos] = useState<string | null>(null);
  const enPantallaCompleta = useEnPantallaCompletaDelNavegador();
  const [arrastrando, setArrastrando] = useState(false);

  const historiaRef = useRef(historia);
  const rehacerRef = useRef(rehacer);
  // Lo que cuenta la persona: cada acción (sumar una cita y subir el origen es UNA, aunque sean dos operaciones).
  const cambios = historia.length;

  // El mapa como queda con lo hecho. Si algo no calza (no debería: cada grupo se probó al hacerlo), se ve la base.
  const actual = useMemo(() => {
    try {
      return aplicarOperaciones(base, historia.flat());
    } catch {
      return base;
    }
  }, [base, historia]);
  const actualRef = useRef(actual);
  // Las acciones leen lo último sin esperar a que se vuelvan a crear (cada evento llega después del render).
  useLayoutEffect(() => {
    historiaRef.current = historia;
    rehacerRef.current = rehacer;
    actualRef.current = actual;
  }, [historia, rehacer, actual]);

  /** Prueba el grupo sobre el mapa de ahora; si calza, queda en la historia. */
  const hacer = useCallback((grupo: Grupo): boolean => {
    try {
      aplicarOperaciones(actualRef.current, grupo);
    } catch (e) {
      if (e instanceof ErrorDeOperacion) {
        setAviso({ tono: "error", texto: e.message });
        return false;
      }
      throw e;
    }
    setHistoria((h) => [...h, grupo]);
    setRehacer([]);
    setAviso(null);
    return true;
  }, []);

  const deshacer = useCallback(() => {
    const h = historiaRef.current;
    if (h.length === 0) return;
    setHistoria(h.slice(0, -1));
    setRehacer((r) => [...r, h[h.length - 1]]);
    setAviso(null);
  }, []);
  const volverAHacer = useCallback(() => {
    const r = rehacerRef.current;
    if (r.length === 0) return;
    const g = r[r.length - 1];
    try {
      aplicarOperaciones(actualRef.current, g);
    } catch {
      setRehacer([]);
      return;
    }
    setHistoria((h) => [...h, g]);
    setRehacer(r.slice(0, -1));
    setAviso(null);
  }, []);

  // Lo elegido puede dejar de existir (se deshizo o se quitó): entonces no hay nada elegido.
  const v = actual[cual];
  const elegidoVivo: Elegido | null =
    elegido === null
      ? null
      : elegido.que === "paso"
        ? v.pasos.some((p) => p.id === elegido.id)
          ? elegido
          : null
        : elegido.que === "carril"
          ? v.carriles.some((c) => c.id === elegido.id)
            ? elegido
            : null
          : v.flechas.some((f) => f.de === elegido.de && f.a === elegido.a)
            ? elegido
            : null;
  const pasoElegido = elegidoVivo?.que === "paso" ? v.pasos.find((p) => p.id === elegidoVivo.id) : undefined;

  const colocando = herramienta !== "elegir";

  const agregarCarril = useCallback(() => {
    const id = nuevoId("c");
    if (hacer([{ tipo: "carril.agregar", version: cual, carril: { id, nombre: "Carril nuevo", tipo: "equipo" } }])) {
      setElegido({ que: "carril", id });
      setHerramienta("elegir");
      setEnfocar("nombreDeCarril");
    }
  }, [hacer, cual]);

  // Los hechos de las reuniones para sumar citas: una vez, al abrir.
  useEffect(() => {
    if (soloLectura) return;
    let vivo = true;
    fetch(`/api/clients/${clientId}/procesos/${blockId}/hechos`, { cache: "no-store" })
      .then(async (r) => {
        const j = (await r.json().catch(() => null)) as { hechos?: Hecho[]; delProceso?: boolean; error?: string } | null;
        if (!vivo) return;
        if (!r.ok || !j?.hechos) throw new Error(j?.error ?? "No se pudo leer lo que dijeron en las reuniones.");
        setHechos(j.hechos);
        setDelProceso(j.delProceso !== false);
      })
      .catch((e: unknown) => vivo && setErrorDeHechos(e instanceof Error ? e.message : "No se pudo leer lo que dijeron en las reuniones."));
    return () => {
      vivo = false;
    };
  }, [clientId, blockId, soloLectura]);

  // Cerrar la pestaña con cambios sin guardar pide confirmación.
  useEffect(() => {
    if (cambios === 0) return;
    const avisar = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", avisar);
    return () => window.removeEventListener("beforeunload", avisar);
  }, [cambios]);

  const salir = () => {
    if (cambios > 0 && !soloLectura) setSaliendo(true);
    else onCerrar();
  };

  const quitarElegido = useCallback(() => {
    if (!elegidoVivo || soloLectura) return;
    if (elegidoVivo.que === "paso") hacer([{ tipo: "paso.quitar", version: cual, pasoId: elegidoVivo.id }]);
    else if (elegidoVivo.que === "flecha") hacer([{ tipo: "flecha.quitar", version: cual, de: elegidoVivo.de, a: elegidoVivo.a }]);
    else hacer([{ tipo: "carril.quitar", version: cual, carrilId: elegidoVivo.id }]);
  }, [elegidoVivo, soloLectura, hacer, cual]);

  // Atajos: deshacer, rehacer, quitar lo elegido y Esc (soltar la herramienta o lo elegido).
  useEffect(() => {
    const alTeclear = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const escribiendo = !!t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable);
      if (escribiendo) return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === "z" && !soloLectura) {
        e.preventDefault();
        if (e.shiftKey) volverAHacer();
        else deshacer();
      } else if (mod && e.key.toLowerCase() === "y" && !soloLectura) {
        e.preventDefault();
        volverAHacer();
      } else if ((e.key === "Delete" || e.key === "Backspace") && !soloLectura) {
        e.preventDefault();
        quitarElegido();
      } else if (e.key === "Escape") {
        if (herramienta !== "elegir") setHerramienta("elegir");
        else setElegido(null);
      }
    };
    window.addEventListener("keydown", alTeclear);
    return () => window.removeEventListener("keydown", alTeclear);
  }, [soloLectura, deshacer, volverAHacer, quitarElegido, herramienta]);

  const guardar = async () => {
    const ops = historiaRef.current.flat();
    if (ops.length === 0 || guardando) return;
    if (ops.length > 300) {
      setAviso({ tono: "error", texto: "Son demasiados cambios para guardarlos de una vez (hasta 300). Deshaz algunos y guarda por partes." });
      return;
    }
    setGuardando(true);
    setAviso(null);
    try {
      const r = await fetch(`/api/clients/${clientId}/procesos/${blockId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accion: "operaciones", version: base.version ?? 0, operaciones: ops }),
      });
      const j = (await r.json().catch(() => null)) as (Partial<MapaGuardado> & { error?: string }) | null;
      if (r.ok && j?.mapa) {
        onGuardado({ mapa: j.mapa, citasDescartadas: j.citasDescartadas ?? 0 });
        return;
      }
      if (r.status === 409 && j?.mapa) {
        // Otra persona (o el agente) guardó antes: se prueban mis cambios encima de su versión.
        try {
          aplicarOperaciones(j.mapa, ops);
          setBase(j.mapa);
          setRehacer([]);
          setAviso({ tono: "aviso", texto: "Alguien guardó este mapa mientras editabas. Pusimos tus cambios encima de su versión: revísalos y vuelve a guardar." });
        } catch (e) {
          setConflicto({ mapa: j.mapa, motivo: e instanceof Error ? e.message : "no calzan" });
        }
        return;
      }
      setAviso({ tono: "error", texto: j?.error ?? "No se pudo guardar el mapa." });
    } catch {
      setAviso({ tono: "error", texto: "No se pudo guardar el mapa: revisa la conexión y vuelve a intentar." });
    } finally {
      setGuardando(false);
    }
  };

  // ── Lienzo ────────────────────────────────────────────────────────────────────
  // Lo elegido se arma de nuevo en cada render: para el mapa cuenta su contenido, no su identidad.
  const claveDelElegido = elegidoVivo ? JSON.stringify(elegidoVivo) : "";
  const elegidoEstable = useMemo(() => (claveDelElegido ? (JSON.parse(claveDelElegido) as Elegido) : null), [claveDelElegido]);
  const opcionesDelEditor = useMemo(
    () => ({ elegido: elegidoEstable, colocando, soloLectura, onAgregarCarril: soloLectura ? undefined : agregarCarril }),
    [elegidoEstable, colocando, soloLectura, agregarCarril],
  );
  const flujo = useMemo(() => armarFlujo(actual, cual, { conMarcas: false, editor: opcionesDelEditor }), [actual, cual, opcionesDelEditor]);
  const [nodes, setNodes] = useState<Node[]>(flujo.nodes);
  const [previos, setPrevios] = useState(flujo.nodes);
  if (previos !== flujo.nodes && !arrastrando) {
    setPrevios(flujo.nodes);
    setNodes(flujo.nodes);
  }

  const colocarPaso = (carril: string, despuesDe: string | null) => {
    if (herramienta === "elegir" || herramienta === "dolor") return;
    const id = nuevoId("p");
    const tipo: TipoDePaso = herramienta === "paso" ? "paso" : herramienta === "decision" ? "decision" : despuesDe ? "fin" : "inicio";
    const texto = herramienta === "inicioFin" && tipo === "fin" ? "Fin del proceso" : TEXTO_NUEVO[herramienta];
    if (hacer([{ tipo: "paso.agregar", version: cual, paso: { id, carril, texto, tipo }, despuesDe }])) {
      setElegido({ que: "paso", id });
      setHerramienta("elegir");
      setEnfocar("texto");
    }
  };

  const alTocarNodo = (e: React.MouseEvent, node: Node) => {
    if (node.type === "agregarCarril") return;
    if (node.type === "carril") {
      const carril = node.id.slice("carril-".length);
      if (colocando && herramienta !== "dolor" && !soloLectura) {
        colocarPaso(carril, pasoElegido?.id ?? null);
        return;
      }
      if ((e.target as HTMLElement).closest("[data-rotulo-de-carril]")) setElegido({ que: "carril", id: carril });
      else setElegido(null);
      return;
    }
    const pasoId = node.type === "dolor" ? (node.parentId ?? "") : node.id;
    const paso = v.pasos.find((p) => p.id === pasoId);
    if (!paso) return;
    if (herramienta === "dolor") {
      setElegido({ que: "paso", id: pasoId });
      setHerramienta("elegir");
      setEnfocar("dolor");
      return;
    }
    if (colocando && !soloLectura) {
      colocarPaso(paso.carril, paso.id);
      return;
    }
    setElegido({ que: "paso", id: pasoId });
  };

  const alSoltarPaso = (node: Node) => {
    setArrastrando(false);
    const paso = v.pasos.find((p) => p.id === node.id);
    if (!paso || soloLectura) {
      setNodes(flujo.nodes);
      return;
    }
    const centro = node.position.y + MEDIDAS.paso.alto / 2;
    const banda = flujo.bandas.find((b) => centro >= b.y && centro < b.y + b.alto);
    if (banda && banda.carril.id !== paso.carril && v.carriles.some((c) => c.id === banda.carril.id)) {
      hacer([{ tipo: "paso.editar", version: cual, pasoId: paso.id, cambios: { carril: banda.carril.id } }]);
      setElegido({ que: "paso", id: paso.id });
    }
    // Sin cambio de carril, el paso vuelve a su lugar: el acomodo es automático.
    setNodes(flujo.nodes);
  };

  const alTerminarDeUnir = (event: MouseEvent | TouchEvent, desde: string | undefined) => {
    if (!desde || soloLectura) return;
    const punto = "changedTouches" in event ? event.changedTouches[0] : event;
    if (!punto) return;
    let destino: string | null = null;
    for (const el of document.elementsFromPoint(punto.clientX, punto.clientY)) {
      const nodo = el.closest<HTMLElement>(".react-flow__node");
      if (!nodo) continue;
      const id = nodo.dataset.id ?? "";
      if (nodo.classList.contains("react-flow__node-paso")) destino = id;
      else if (nodo.classList.contains("react-flow__node-dolor")) destino = id.slice("dolor-".length);
      if (destino) break;
    }
    if (!destino || destino === desde) return;
    const yaEsta = v.flechas.some((f) => f.de === desde && f.a === destino);
    if (yaEsta) {
      setElegido({ que: "flecha", de: desde, a: destino });
      return;
    }
    if (hacer([{ tipo: "flecha.agregar", version: cual, de: desde, a: destino }])) {
      setElegido({ que: "flecha", de: desde, a: destino });
      if (v.pasos.find((p) => p.id === desde)?.tipo === "decision") setEnfocar("etiqueta");
    }
  };

  const pista = soloLectura
    ? "Toca un paso para ver de dónde sale. Arrastra el fondo para recorrer el mapa."
    : herramienta === "dolor"
      ? "Toca el paso que duele. Esc para cancelar."
      : colocando
        ? pasoElegido
          ? `Toca el carril donde va el paso nuevo: queda después de «${pasoElegido.texto}». Esc para cancelar.`
          : "Toca el carril donde va el paso nuevo (o el paso que va antes). Esc para cancelar."
        : "Arrastra un paso a otro carril para cambiar quién lo hace. Une dos pasos tirando del punto azul.";

  const herramientas: { clave: Herramienta; texto: string }[] = [
    { clave: "elegir", texto: "Elegir" },
    { clave: "paso", texto: "Paso" },
    { clave: "decision", texto: "Decisión" },
    { clave: "inicioFin", texto: "Inicio o fin" },
  ];

  const tomarFoco = useCallback(() => setEnfocar(null), []);

  return (
    <div className="flex h-full flex-col">
      {/* Cabecera */}
      <header className="flex h-[52px] flex-none items-center gap-4 border-b border-line bg-surface px-4">
        <button type="button" onClick={salir} className="flex items-center gap-1 text-xs text-fg-muted transition-colors hover:text-fg">
          <svg viewBox="0 0 24 24" width="14" height="14" style={TRAZO} aria-hidden="true">
            <path d="M15 19l-7-7 7-7" />
          </svg>
          Volver
        </button>
        <span className="h-4 w-px bg-line" aria-hidden="true" />
        <span className="min-w-0 truncate text-sm font-semibold text-fg">
          {soloLectura ? actual.nombre : `Editar · ${actual.nombre}`}
        </span>
        <Segmentado
          opciones={VERSIONES}
          valor={cual}
          onCambio={(c) => {
            setCual(c);
            setElegido(null);
            setHerramienta("elegir");
          }}
          etiqueta="Qué mapa editar"
          className="flex-none [&>button]:px-3 [&>button]:py-[5px]"
        />
        <span className="flex-1" />
        {!soloLectura && (
          <>
            <button
              type="button"
              onClick={deshacer}
              disabled={historia.length === 0 || guardando}
              title="Ctrl+Z"
              className="px-1.5 py-1 text-[12.5px] text-fg-muted transition-colors hover:text-fg disabled:opacity-40"
            >
              Deshacer
            </button>
            <button
              type="button"
              onClick={volverAHacer}
              disabled={rehacer.length === 0 || guardando}
              title="Ctrl+Y"
              className="px-1.5 py-1 text-[12.5px] text-fg-muted transition-colors hover:text-fg disabled:opacity-40"
            >
              Rehacer
            </button>
          </>
        )}
        <button
          type="button"
          onClick={salir}
          disabled={guardando}
          className="rounded-lg border border-line bg-surface px-3 py-1.5 text-[13px] text-fg-secondary transition-colors hover:bg-surface-hover hover:text-fg disabled:opacity-50"
        >
          {soloLectura ? "Cerrar" : "Cancelar"}
        </button>
        {!soloLectura && (
          <button
            type="button"
            onClick={() => void guardar()}
            disabled={cambios === 0 || guardando}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-[7px] text-[13px] font-semibold text-primary-fg transition-colors hover:bg-primary-hover disabled:opacity-50"
          >
            {guardando && <Spinner className="h-3.5 w-3.5" />}
            {guardando ? "Guardando…" : "Guardar"}
          </button>
        )}
      </header>

      {saliendo && (
        <div role="alertdialog" aria-label="Cambios sin guardar" className="flex flex-none items-center gap-3 border-b border-warn-line bg-warn-surface px-4 py-2.5">
          <p className="min-w-0 flex-1 text-[13px] text-warn-ink">
            {cambios === 1 ? "Tienes 1 cambio sin guardar." : `Tienes ${cambios} cambios sin guardar.`} Si sales, se pierden.
          </p>
          <button
            type="button"
            autoFocus
            onClick={() => setSaliendo(false)}
            className="rounded-lg border border-line bg-surface px-3 py-1.5 text-[13px] text-fg-secondary transition-colors hover:bg-surface-hover hover:text-fg"
          >
            Seguir editando
          </button>
          <button type="button" onClick={onCerrar} className="px-1.5 py-1 text-[13px] font-medium text-danger-ink transition-colors hover:underline">
            Salir sin guardar
          </button>
        </div>
      )}
      {conflicto && (
        <div role="alert" className="flex flex-none items-center gap-3 border-b border-danger-line bg-danger-surface px-4 py-2.5">
          <p className="min-w-0 flex-1 text-[13px] text-danger-ink">
            Otra persona guardó este mapa y tus cambios ya no calzan con su versión ({conflicto.motivo}).
          </p>
          <button
            type="button"
            onClick={() => {
              setBase(conflicto.mapa);
              setHistoria([]);
              setRehacer([]);
              setConflicto(null);
              setAviso(null);
            }}
            className="rounded-lg border border-line bg-surface px-3 py-1.5 text-[13px] text-fg-secondary transition-colors hover:bg-surface-hover hover:text-fg"
          >
            Ver su versión y empezar de nuevo
          </button>
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        {/* Herramientas */}
        {!soloLectura && (
          <nav aria-label="Herramientas" className="flex w-16 flex-none flex-col gap-1 border-r border-line bg-surface px-1.5 py-3">
            {herramientas.map((h) => (
              <BotonDeHerramienta key={h.clave} icono={ICONOS[h.clave]} texto={h.texto} activo={herramienta === h.clave} onClick={() => setHerramienta(h.clave)} />
            ))}
            <BotonDeHerramienta icono={ICONOS.carril} texto="Carril" onClick={agregarCarril} title="Agrega un carril al final" />
            <BotonDeHerramienta
              icono={ICONOS.dolor}
              texto="Dolor"
              activo={herramienta === "dolor"}
              deshabilitado={cual !== "hoy"}
              title={cual !== "hoy" ? "El dolor es del mapa de hoy" : "Anota qué falla o cuesta en un paso"}
              onClick={() => {
                if (pasoElegido) {
                  setHerramienta("elegir");
                  setEnfocar("dolor");
                } else setHerramienta("dolor");
              }}
            />
          </nav>
        )}

        {/* Lienzo: uno por versión, así cada una arranca encuadrada */}
        <ReactFlowProvider key={cual}>
          <LienzoDelEditor
            nodes={nodes}
            edges={flujo.edges}
            ancho={flujo.ancho}
            alto={flujo.alto}
            soloLectura={soloLectura}
            colocando={colocando}
            enPantallaCompleta={enPantallaCompleta}
            pista={pista}
            aviso={aviso}
            onCerrarAviso={() => setAviso(null)}
            onNodesChange={(c) => setNodes((ns) => applyNodeChanges(c, ns))}
            onNodeClick={alTocarNodo}
            onEdgeClick={(e) => setElegido({ que: "flecha", de: e.source, a: e.target })}
            onPaneClick={() => {
              if (!colocando) setElegido(null);
            }}
            onDragStart={() => setArrastrando(true)}
            onDragStop={alSoltarPaso}
            onUnir={alTerminarDeUnir}
          />
        </ReactFlowProvider>

        {/* Panel de lo elegido */}
        <aside className="flex w-[340px] flex-none flex-col gap-4 overflow-hidden border-l border-line bg-surface-muted p-5">
          {pasoElegido ? (
            <PanelDelPaso
              key={`${cual}-${pasoElegido.id}`}
              mapa={actual}
              cual={cual}
              paso={pasoElegido}
              soloLectura={soloLectura}
              hechos={hechos}
              delProceso={delProceso}
              errorDeHechos={errorDeHechos}
              foco={enfocar}
              onFocoTomado={tomarFoco}
              hacer={hacer}
              onCitaCambiada={(texto) => setAviso({ tono: "aviso", texto })}
            />
          ) : elegidoVivo?.que === "flecha" ? (
            <PanelDeLaFlecha
              key={`${cual}-${elegidoVivo.de}-${elegidoVivo.a}`}
              mapa={actual}
              cual={cual}
              de={elegidoVivo.de}
              a={elegidoVivo.a}
              soloLectura={soloLectura}
              foco={enfocar === "etiqueta"}
              onFocoTomado={tomarFoco}
              hacer={hacer}
            />
          ) : elegidoVivo?.que === "carril" ? (
            <PanelDelCarril
              key={`${cual}-${elegidoVivo.id}`}
              mapa={actual}
              cual={cual}
              carrilId={elegidoVivo.id}
              soloLectura={soloLectura}
              foco={enfocar === "nombreDeCarril"}
              onFocoTomado={tomarFoco}
              hacer={hacer}
            />
          ) : (
            <PanelSinElegir soloLectura={soloLectura} cambios={cambios} />
          )}
        </aside>
      </div>
    </div>
  );
}

function BotonesDelEditor({ enPantallaCompleta }: { enPantallaCompleta: boolean }) {
  const { fitView } = useReactFlow();
  const texto = enPantallaCompleta ? "Salir de la pantalla completa (Esc)" : "Pantalla completa";
  return (
    <>
      <ControlButton onClick={() => void fitView({ padding: 0.06, duration: 200 })} title="Ver el mapa entero" aria-label="Ver el mapa entero">
        <IconoEncuadrar />
      </ControlButton>
      <ControlButton
        onClick={() => (enPantallaCompleta ? salirDePantallaCompletaDelNavegador() : pedirPantallaCompletaDelNavegador())}
        title={texto}
        aria-label={texto}
      >
        <IconoPantallaCompleta salir={enPantallaCompleta} />
      </ControlButton>
    </>
  );
}

function Zoom() {
  const { zoom } = useViewport();
  return <span className="flex-none whitespace-nowrap tabular-nums text-fg-muted">{Math.round(zoom * 100)} %</span>;
}

function LienzoDelEditor({
  nodes,
  edges,
  ancho,
  alto,
  soloLectura,
  colocando,
  enPantallaCompleta,
  pista,
  aviso,
  onCerrarAviso,
  onNodesChange,
  onNodeClick,
  onEdgeClick,
  onPaneClick,
  onDragStart,
  onDragStop,
  onUnir,
}: {
  nodes: Node[];
  edges: Edge[];
  ancho: number;
  alto: number;
  soloLectura: boolean;
  colocando: boolean;
  enPantallaCompleta: boolean;
  pista: string;
  aviso: Aviso | null;
  onCerrarAviso: () => void;
  onNodesChange: OnNodesChange;
  onNodeClick: (e: React.MouseEvent, n: Node) => void;
  onEdgeClick: (e: Edge) => void;
  onPaneClick: () => void;
  onDragStart: () => void;
  onDragStop: (n: Node) => void;
  onUnir: (e: MouseEvent | TouchEvent, desde: string | undefined) => void;
}) {
  const caja = useRef<HTMLDivElement>(null);
  const [tam, setTam] = useState<{ ancho: number; alto: number } | null>(null);
  useLayoutEffect(() => {
    if (caja.current) setTam({ ancho: caja.current.clientWidth, alto: caja.current.clientHeight });
  }, []);
  // El encuadre de arranque: el mapa entero si se lee; si no, desde la izquierda, con «+ Agregar carril» a la vista.
  const vista = tam ? encuadre({ ancho: tam.ancho, alto: tam.alto }, ancho, alto + 56, 24) : null;
  return (
    <div ref={caja} className={cn("relative min-w-0 flex-1 bg-surface", colocando && "[&_.react-flow__pane]:cursor-crosshair")} style={COLORES_DE_REACT_FLOW}>
      {vista && (
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={tiposDeNodo}
          onNodesChange={onNodesChange}
          onNodeClick={onNodeClick}
          onEdgeClick={(_e, edge) => onEdgeClick(edge)}
          onPaneClick={onPaneClick}
          onNodeDragStart={(_e, n) => n.type === "paso" && onDragStart()}
          onNodeDragStop={(_e, n) => n.type === "paso" && onDragStop(n)}
          onConnectEnd={(e, estado) => onUnir(e, estado.fromNode?.id)}
          defaultViewport={{ x: vista.x, y: vista.y, zoom: vista.zoom }}
          minZoom={0.3}
          maxZoom={1.6}
          nodesDraggable={!soloLectura}
          nodesConnectable={!soloLectura}
          elementsSelectable={false}
          deleteKeyCode={null}
          selectionKeyCode={null}
          multiSelectionKeyCode={null}
          zoomOnDoubleClick={false}
          connectionRadius={0}
          proOptions={{ hideAttribution: true }}
        >
          <Background variant={BackgroundVariant.Dots} gap={16} size={1} color="var(--color-line)" />
          <Controls showInteractive={false} showFitView={false} position="top-right">
            <BotonesDelEditor enPantallaCompleta={enPantallaCompleta} />
          </Controls>
          <Panel position="bottom-left">
            <div
              role="status"
              className={cn(
                "flex max-w-[640px] items-center gap-2.5 rounded-[10px] border px-3 py-2 text-xs",
                aviso?.tono === "error"
                  ? "border-danger-line bg-danger-surface text-danger-ink"
                  : aviso
                    ? "border-info-line bg-info-surface text-brand"
                    : "border-line bg-surface text-fg-secondary",
              )}
            >
              <span className="min-w-0">{aviso?.texto ?? pista}</span>
              {aviso && (
                <button type="button" onClick={onCerrarAviso} className="flex-none font-semibold underline-offset-2 hover:underline">
                  Entendido
                </button>
              )}
              <span className="h-3.5 w-px flex-none bg-line" aria-hidden="true" />
              <Zoom />
            </div>
          </Panel>
        </ReactFlow>
      )}
    </div>
  );
}

/**
 * El editor sobre toda la pantalla. Lo monta el detalle del proceso; para que el navegador pase a
 * pantalla completa, quien lo abre llama `pedirPantallaCompletaDelNavegador()` en el mismo clic.
 */
export default function EditorDelMapa(props: {
  clientId: string;
  blockId: string;
  mapa: MapaDeProceso;
  inicial: { cual: CualVersion; pasoId?: string };
  soloLectura: boolean;
  onCerrar: () => void;
  onGuardado: (r: MapaGuardado) => void;
}) {
  return (
    <PantallaCompleta etiqueta={`${props.soloLectura ? "Mapa" : "Editar el mapa"} de ${props.mapa.nombre}`}>
      <Editor
        clientId={props.clientId}
        blockId={props.blockId}
        mapaInicial={props.mapa}
        inicial={props.inicial}
        soloLectura={props.soloLectura}
        onCerrar={props.onCerrar}
        onGuardado={props.onGuardado}
      />
    </PantallaCompleta>
  );
}
