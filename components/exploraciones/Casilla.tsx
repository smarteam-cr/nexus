"use client";

/**
 * Casilla — una casilla del lienzo: lo confirmado, el editor y lo que propuso el agente para ella.
 *
 * Se edita entera («Editar» → «Guardar»): una casilla es una idea completa (las metas, quién decide)
 * y guardarla a medias en cada tecla dejaría versiones raras en la historia. En una lista, cada ítem
 * se ve como una tarjeta y se abre de a uno. Lo propuesto se usa o se descarta desde la propia casilla.
 */
import { Children, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Badge, Button, Field, Input, Segmentado, Select, Textarea } from "@/components/ui";
import {
  CAMPOS_DE_LA_TARJETA,
  CANALES_DE_CONEXION,
  CLASES_DE_OBJECION,
  definicionDe,
  esDeCifras,
  ETIQUETA_DEL_CANAL,
  ETIQUETA_DEL_MODELO,
  MODELOS_DE_NEGOCIO,
  ETIQUETA_DE_LA_OBJECION,
  ETIQUETA_DEL_ROL,
  metaEnCifras,
  QUE_HACE_EL_ROL,
  ROLES_EN_LA_DECISION,
  separarOrigen,
  type Apertura,
  type Cifras,
  type ClaveDeCasilla,
  type EstrategiaDeConexion,
  type Hito,
  type Meta,
  type Objecion,
  type Persona,
  type Reto,
  type Radiografia,
  type SiguientePaso,
  type ValoresDeCasillas,
} from "@/lib/exploraciones/casillas";
import { cn } from "@/lib/cn";
import { useLienzo } from "./contexto";
import { Propuestas } from "./Propuestas";
import { PerdidaCalculada } from "./PerdidaCalculada";
import { definicionEnElMarco } from "@/lib/exploraciones/marco";
import { claveDeItemDeLista } from "@/lib/exploraciones/contenido";
import { diaCorto } from "@/lib/exploraciones/fechas";
import { particularidadesRecientes, PRIMERAS_A_LA_VISTA, rotuloDelResto } from "@/lib/exploraciones/lineas-del-resumen";
import { aplicarSugerenciaDeOrden, MINIMO_PARA_SUGERIR, tieneOrden, type SugerenciaDeOrden } from "@/lib/exploraciones/orden-de-las-listas";
import { EQUIPOS } from "@/lib/exploraciones/equipos";
import { SortableItems } from "@/components/landing/sortable";
import { BotonAzul, BotonBlanco, BotonTexto, IconoDeSugerencia } from "@/components/ui/sistema";

const APERTURA: { clave: Apertura["valor"]; etiqueta: string }[] = [
  { clave: "si", etiqueta: "Sí, quiere acompañamiento" },
  { clave: "no", etiqueta: "Solo implementación" },
  { clave: "no_se", etiqueta: "No se sabe todavía" },
];

function fechaLegible(iso: string): string {
  const [a, m, d] = iso.split("-").map(Number);
  return new Date(a, m - 1, d).toLocaleDateString("es-CR", { weekday: "short", day: "numeric", month: "short" });
}

/** La radiografía: qué hace, su sector y cómo vende, sus herramientas y lo que le pasó hace poco. */
export function VistaDeRadiografia({ r }: { r: Radiografia }) {
  return (
    <div className="space-y-3 text-sm">
      {r.resumen && <p className="leading-relaxed text-fg-secondary">{r.resumen}</p>}
      {(r.sector || r.modelos?.length) && (
        <div className="flex flex-wrap items-center gap-1.5">
          {r.sector && <Badge size="xs" variant="primary">{r.sector}</Badge>}
          {r.modelos?.map((m) => (
            <Badge key={m} size="xs">
              {ETIQUETA_DEL_MODELO[m]}
            </Badge>
          ))}
        </div>
      )}
      {!!r.stack?.length && (
        <div className="space-y-1">
          <p className="text-2xs font-semibold uppercase tracking-wide text-fg-muted">Herramientas que se le ven</p>
          <p className="text-fg-secondary">{r.stack.join(" · ")}</p>
        </div>
      )}
      {!!r.hitos?.length && (
        <div className="space-y-1.5">
          <p className="text-2xs font-semibold uppercase tracking-wide text-fg-muted">Noticias e hitos recientes</p>
          <ul className="space-y-1.5">
            {r.hitos.map((h, i) => (
              <li key={i} className="flex gap-2">
                <span className="w-16 flex-shrink-0 text-xs tabular-nums text-fg-muted">{h.fecha ?? "—"}</span>
                <a href={h.url} target="_blank" rel="noreferrer" className="text-fg-secondary hover:text-brand hover:underline">
                  {h.texto}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/** La estrategia de conexión: el canal, el ángulo y el mensaje, listo para copiar. */
function VistaDeConexion({ e }: { e: EstrategiaDeConexion }) {
  const [copiado, setCopiado] = useState(false);
  const texto = [e.mensaje, e.cta].filter(Boolean).join("\n\n");
  return (
    <div className="space-y-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="primary" size="xs">
          {ETIQUETA_DEL_CANAL[e.canal]}
        </Badge>
        <p className="font-medium text-fg">{e.pitch}</p>
      </div>
      <div className="space-y-2 rounded-xl border border-line bg-surface-muted p-4">
        <p className="whitespace-pre-wrap leading-relaxed text-fg-secondary">{e.mensaje}</p>
        {e.cta && <p className="font-medium text-fg">{e.cta}</p>}
      </div>
      <Button
        size="xs"
        variant="secondary"
        onClick={() =>
          void navigator.clipboard?.writeText(texto).then(() => {
            setCopiado(true);
            setTimeout(() => setCopiado(false), 2000);
          })
        }
      >
        {copiado ? "Copiado" : "Copiar el mensaje"}
      </Button>
    </div>
  );
}

/**
 * Negocio o Embudo (2026-11-20): cada campo con su cifra, y los que faltan a la vista («Sin dato»): así se ve de un
 * vistazo qué preguntar para poder calcular cuánto pierde.
 */
function VistaDeCifras({ clave, valor }: { clave: "negocio" | "embudo"; valor: Cifras }) {
  return (
    <dl className="grid gap-x-4 gap-y-1.5 text-sm sm:grid-cols-[minmax(0,11rem)_minmax(0,1fr)]">
      {CAMPOS_DE_LA_TARJETA[clave].map((c) => {
        const t = valor[c.clave]?.trim();
        return (
          <div key={c.clave} className="contents">
            <dt className="text-fg-muted">{c.etiqueta}</dt>
            <dd className={t ? "font-medium text-fg" : "text-fg-muted"}>{t || "Sin dato"}</dd>
          </div>
        );
      })}
    </dl>
  );
}

// ── Vista de lo confirmado ────────────────────────────────────────────────────

export function Vista({ clave, valor }: { clave: ClaveDeCasilla; valor: unknown }) {
  const { escala } = useLienzo();
  const tipo = definicionDe(clave).tipo;
  const nombreDim = (id?: string) => (id ? escala.areas.flatMap((a) => a.dimensiones).find((d) => d.id === id)?.nombre : undefined);

  switch (tipo) {
    case "texto":
      return <p className="whitespace-pre-wrap text-sm text-fg-secondary">{valor as string}</p>;
    case "lista":
      return (
        <ul className="list-disc space-y-1 pl-5 text-sm text-fg-secondary">
          {(valor as string[]).map((t, i) => {
            // Una hipótesis de valor trae al final de dónde sale («· De: …»): se pinta aparte, más tenue.
            const { idea, origen } = separarOrigen(t);
            return (
              <li key={i}>
                {idea}
                {origen && <span className="text-xs text-fg-muted"> · De: {origen}</span>}
              </li>
            );
          })}
        </ul>
      );
    case "metas":
      return (
        <ul className="space-y-2">
          {(valor as Meta[]).map((m, i) => (
            <li key={i} className="flex items-start justify-between gap-3 text-sm">
              <span className="text-fg-secondary">
                <span className="font-medium text-fg">{m.que}</span>
                {(m.actual || m.objetivo || m.para) && (
                  <span className="text-fg-muted">
                    {" — "}
                    {[m.actual && `de ${m.actual}`, m.objetivo && `a ${m.objetivo}`, m.para && `para ${m.para}`].filter(Boolean).join(" ")}
                  </span>
                )}
              </span>
              <Badge variant={metaEnCifras(m) ? "success" : "warning"} size="xs">
                {metaEnCifras(m) ? "En cifras" : "Sin cifra"}
              </Badge>
            </li>
          ))}
        </ul>
      );
    case "retos":
      return (
        <ul className="list-disc space-y-1 pl-5 text-sm text-fg-secondary">
          {(valor as Reto[]).map((r, i) => (
            <li key={i}>
              {r.texto}
              {nombreDim(r.dimensionId) && <span className="text-fg-muted"> · {nombreDim(r.dimensionId)}</span>}
            </li>
          ))}
        </ul>
      );
    case "autoridad":
      return (
        <ul className="space-y-1.5 text-sm">
          {(valor as Persona[]).map((p, i) => (
            <li key={i} className="flex flex-wrap items-center gap-2">
              <span className="font-medium text-fg">{p.nombre}</span>
              {p.cargo && <span className="text-fg-muted">{p.cargo}</span>}
              <Badge variant={p.rol === "firma" ? "primary" : "default"} size="xs">
                {ETIQUETA_DEL_ROL[p.rol]}
              </Badge>
              {p.nota && <span className="text-xs text-fg-secondary">{p.nota}</span>}
            </li>
          ))}
        </ul>
      );
    case "objeciones":
      return (
        <ul className="space-y-2 text-sm">
          {(valor as Objecion[]).map((o, i) => (
            <li key={i} className="space-y-0.5">
              <p className="flex flex-wrap items-center gap-2">
                <span className="text-fg">{o.texto}</span>
                <Badge variant="default" size="xs">
                  {ETIQUETA_DE_LA_OBJECION[o.clase]}
                </Badge>
                {!o.respuesta && (
                  <Badge variant="warning" size="xs">
                    Sin responder
                  </Badge>
                )}
              </p>
              {o.respuesta && <p className="text-xs text-fg-muted">Se respondió: {o.respuesta}</p>}
            </li>
          ))}
        </ul>
      );
    case "siguientePaso": {
      const s = valor as SiguientePaso;
      return (
        <p className="text-sm text-fg-secondary">
          <span className="font-medium text-fg">{s.que}</span>
          {s.fecha ? <span> · {fechaLegible(s.fecha)}</span> : <Badge variant="warning" size="xs" className="ml-2">Sin fecha</Badge>}
          {s.conQuien && <span className="text-fg-muted"> · con {s.conQuien}</span>}
        </p>
      );
    }
    case "radiografia":
      return <VistaDeRadiografia r={valor as Radiografia} />;
    case "conexion":
      return <VistaDeConexion e={valor as EstrategiaDeConexion} />;
    case "cifras":
      return esDeCifras(clave) ? <VistaDeCifras clave={clave} valor={valor as Cifras} /> : null;
    case "apertura": {
      const a = valor as Apertura;
      return (
        <p className="text-sm text-fg-secondary">
          <span className="font-medium text-fg">{APERTURA.find((x) => x.clave === a.valor)?.etiqueta}</span>
          {a.porQue && <span> — {a.porQue}</span>}
        </p>
      );
    }
  }
}

// ── Editores ──────────────────────────────────────────────────────────────────
//
// Pedido de Elías (2026-10-02): «agregar metas debe ser más sencillo; lo propuesto por el agente se ve
// mejor». Una lista no se edita como un formulario gigante: cada ítem se ve como una tarjeta (igual
// que lo propuesto) con «Editar» y «Quitar», y solo el que se está editando abre sus campos. Los
// textos crecen con lo escrito: nada queda cortado detrás de una barra de desplazamiento.

/** Un cuadro de texto que crece con lo escrito. */
function TextoQueCrece({
  value,
  onChange,
  minFilas = 2,
  className,
  ...resto
}: {
  value: string;
  onChange: (v: string) => void;
  minFilas?: number;
  placeholder?: string;
  "aria-label"?: string;
  autoFocus?: boolean;
  onBlur?: () => void;
  onKeyDown?: (e: KeyboardEvent<HTMLTextAreaElement>) => void;
  className?: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight + 2}px`;
  }, [value]);
  return (
    <Textarea
      ref={ref}
      rows={minFilas}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={cn("overflow-hidden leading-relaxed", className)}
      {...resto}
    />
  );
}

/**
 * La lista de una casilla (22 nov, noche, Elías: «las cartas cuestan leerlas y editarlas»). Se ve como una lista simple,
 * una línea por punto:
 *   · un clic en el texto lo edita en el lugar (Enter o salir del campo lo deja; vacío, se quita);
 *   · el ⠿ lo mueve arrastrando, o con el teclado (Enter levanta, flechas mueven, Enter suelta);
 *   · lo que no es el texto (las cifras de una meta, la dimensión de un reto, el papel de una persona) se ve en la misma
 *     línea y se abre en un desplegable debajo de ella;
 *   · se agrega al final, escribiendo y con Enter. Lo escrito ahí sin Enter también entra al salir del campo (revisión
 *     del 22 nov): si no, «Guardar» lo perdía sin aviso.
 * El orden ES lo guardado: el Resumen muestra los 4 primeros. Con `rotuloDelResto`, la lista lo dice con un subtítulo
 * («Más metas») debajo del cuarto. `arriba`: lo que sugiere Nexus para ordenarla (SugerenciasDelOrden).
 */
function EditorDeItems<T>({
  items,
  onCambio,
  nuevo,
  estaVacio,
  texto,
  conTexto,
  detalle,
  agregar,
  rotuloDelResto: rotulo,
  arriba,
  abrirAlAgregar = false,
}: {
  items: T[];
  onCambio: (v: T[]) => void;
  nuevo: () => T;
  estaVacio: (x: T) => boolean;
  /** El texto de la línea, el que se edita en el lugar. */
  texto: (x: T) => string;
  conTexto: (x: T, t: string) => T;
  /** Lo demás del punto: cómo se ve en la línea (`ver`, que abre el desplegable) y sus campos. */
  detalle?: { ver: (x: T) => ReactNode; campos: (x: T, set: (cambio: Partial<T>) => void) => ReactNode };
  agregar: string;
  rotuloDelResto?: string | null;
  arriba?: ReactNode;
  /** Al agregar, abre el desplegable del punto nuevo: lo que le falta para guardarse (el enlace de un hito) queda a la vista. */
  abrirAlAgregar?: boolean;
}) {
  const [editando, setEditando] = useState<number | null>(null);
  const [abierto, setAbierto] = useState<number | null>(null);
  const [nuevoTexto, setNuevoTexto] = useState("");

  const set = (i: number, x: T) => onCambio(items.map((y, j) => (j === i ? x : y)));
  const quitar = (i: number) => {
    onCambio(items.filter((_, j) => j !== i));
    setEditando(null);
    setAbierto(null);
  };
  const dejar = (i: number) => {
    if (items[i] !== undefined && estaVacio(items[i])) quitar(i);
    else setEditando(null);
  };
  const sumar = () => {
    const t = nuevoTexto.trim();
    if (!t) return;
    onCambio([...items, conTexto(nuevo(), t)]);
    setNuevoTexto("");
    if (abrirAlAgregar && detalle) setAbierto(items.length);
  };
  const alTeclear = (i: number) => (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.key === "Enter" && !e.shiftKey) || e.key === "Escape") {
      e.preventDefault();
      dejar(i);
    }
  };
  // El subtítulo del resto va DENTRO de la lista, después del cuarto: se mueve solo cuando se reordena.
  const conElCorte = (nodos: ReactNode) => {
    const xs = Children.toArray(nodos);
    if (!rotulo || xs.length <= PRIMERAS_A_LA_VISTA) return xs;
    return [
      ...xs.slice(0, PRIMERAS_A_LA_VISTA),
      <li key="corte" role="presentation" className="pb-1 pt-4 text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-muted">
        {rotulo}
      </li>,
      ...xs.slice(PRIMERAS_A_LA_VISTA),
    ];
  };

  return (
    <div className="space-y-3">
      {arriba}
      {items.length > 0 && (
        <SortableItems
          items={items}
          onReorder={(v) => {
            onCambio(v);
            setEditando(null);
            setAbierto(null);
          }}
          elemento="li"
          itemClassName="group flex items-start gap-2 border-b border-line py-2 last:border-b-0"
          claseDelHandle="mt-0.5 flex-none cursor-grab touch-none select-none rounded px-1 text-sm leading-5 text-fg-muted hover:bg-surface-hover hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand active:cursor-grabbing"
          container={(nodos) => <ol className="rounded-xl border border-line bg-surface px-3">{conElCorte(nodos)}</ol>}
        >
          {(x, i, handle) => (
            <>
              {handle ?? <span aria-hidden className="w-[22px] flex-none" />}
              <div className="min-w-0 flex-1">
                {editando === i ? (
                  <TextoQueCrece
                    minFilas={1}
                    autoFocus
                    aria-label={`Punto ${i + 1}`}
                    value={texto(x)}
                    onChange={(t) => set(i, conTexto(x, t))}
                    onBlur={() => dejar(i)}
                    onKeyDown={alTeclear(i)}
                    className="py-1 text-sm"
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => setEditando(i)}
                    className="-mx-1 block w-full rounded px-1 text-left text-sm leading-[1.5] text-fg transition-colors hover:bg-surface-hover"
                    title="Editar"
                  >
                    {texto(x).trim() || <span className="text-fg-muted">Sin texto</span>}
                  </button>
                )}
                {detalle && (
                  <button
                    type="button"
                    aria-expanded={abierto === i}
                    onClick={() => setAbierto(abierto === i ? null : i)}
                    className="mt-1 flex flex-wrap items-center gap-1.5 text-left text-xs text-fg-secondary"
                  >
                    {detalle.ver(x)}
                    <span className="text-brand">{abierto === i ? "▴" : "▾"}</span>
                  </button>
                )}
                {detalle && abierto === i && <div className="mt-2 space-y-3 rounded-lg bg-surface-muted p-3">{detalle.campos(x, (cambio) => set(i, { ...x, ...cambio }))}</div>}
              </div>
              <button
                type="button"
                // Sin esto, el punto que se está editando pierde el foco primero: si quedó vacío se quita solo, y el clic
                // cae sobre el que subió a su lugar (revisión del 22 nov: un clic borraba dos).
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => quitar(i)}
                aria-label={`Quitar «${texto(x).slice(0, 40)}»`}
                title="Quitar"
                className="mt-0.5 flex-none rounded px-1.5 text-sm leading-5 text-fg-muted opacity-0 transition-opacity hover:bg-surface-hover hover:text-fg focus:opacity-100 group-hover:opacity-100"
              >
                ×
              </button>
            </>
          )}
        </SortableItems>
      )}
      <div className="flex items-center gap-2">
        <Input
          value={nuevoTexto}
          onChange={(e) => setNuevoTexto(e.target.value)}
          onBlur={sumar}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              sumar();
            }
          }}
          autoFocus={items.length === 0}
          placeholder={`${agregar} y Enter`}
          aria-label={agregar}
        />
        <BotonBlanco disabled={!nuevoTexto.trim()} onClick={sumar}>
          Agregar
        </BotonBlanco>
      </div>
    </div>
  );
}

/**
 * «La IA propone, tú ordenas» (22 nov, noche): arriba de la lista, a pedido, Nexus sugiere qué juntar y qué subir a los 4
 * primeros. Lee lo GUARDADO de la casilla (POST …/list-order); cada sugerencia se usa o se descarta en la lista que se
 * está editando, y nada queda hasta «Guardar». Una que nombra un punto que ya cambió no se puede usar.
 */
function SugerenciasDelOrden<T>({ clave, lista, onCambio }: { clave: ClaveDeCasilla; lista: T[]; onCambio: (v: T[]) => void }) {
  const { exp, puedeEditar } = useLienzo();
  const [estado, setEstado] = useState<"nada" | "pidiendo" | "listas" | "error">("nada");
  const [sugerencias, setSugerencias] = useState<SugerenciaDeOrden[]>([]);
  const [error, setError] = useState<string | null>(null);
  if (!tieneOrden(clave) || !puedeEditar || lista.length < MINIMO_PARA_SUGERIR) return null;

  const pedir = async () => {
    setEstado("pidiendo");
    setError(null);
    try {
      const r = await fetch(`/api/sales/exploraciones/${exp.id}/list-order`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clave }) });
      const j = (await r.json().catch(() => ({}))) as { sugerencias?: SugerenciaDeOrden[]; error?: string };
      if (!r.ok) throw new Error(j.error ?? "No se pudo pedir.");
      setSugerencias(j.sugerencias ?? []);
      setEstado("listas");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo pedir.");
      setEstado("error");
    }
  };
  const quitarla = (id: string) => setSugerencias((xs) => xs.filter((x) => x.id !== id));
  const usar = (s: SugerenciaDeOrden) => {
    const nueva = aplicarSugerenciaDeOrden(clave, lista, s);
    if (nueva) onCambio(nueva);
    quitarla(s.id);
  };

  return (
    <div className="space-y-2 rounded-lg border border-info-line bg-info-surface px-3.5 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="flex min-w-0 flex-1 items-center gap-1.5 text-[13px] text-fg-secondary">
          <IconoDeSugerencia className="h-[14px] w-[14px] flex-none text-brand" />
          {estado === "listas"
            ? sugerencias.length
              ? "Nexus sugiere esto. Lo que uses cambia la lista; queda al guardar."
              : "Nexus no ve nada que juntar ni subir."
            : "La IA propone, tú ordenas: Nexus puede sugerir qué juntar y qué subir a los 4 primeros."}
        </p>
        {estado !== "listas" && (
          <BotonBlanco disabled={estado === "pidiendo"} onClick={() => void pedir()}>
            {estado === "pidiendo" ? "Leyendo la lista…" : "Sugerir"}
          </BotonBlanco>
        )}
      </div>
      {error && <p className="text-xs text-warn-ink">{error}</p>}
      {sugerencias.map((s) => {
        const sePuede = aplicarSugerenciaDeOrden(clave, lista, s) !== null;
        return (
          <div key={s.id} className="space-y-1.5 rounded-lg border border-line bg-surface px-3 py-2.5">
            {s.tipo === "juntar" ? (
              <>
                <p className="text-xs font-semibold text-fg-secondary">Juntar {s.textos.length} puntos en uno</p>
                <ul className="list-disc space-y-0.5 pl-4 text-xs text-fg-muted">
                  {s.textos.map((t) => (
                    <li key={t}>{t}</li>
                  ))}
                </ul>
                <p className="text-sm text-fg">→ {s.texto}</p>
              </>
            ) : (
              <>
                <p className="text-xs font-semibold text-fg-secondary">Subir a los primeros</p>
                <p className="text-sm text-fg">{s.textoDelPunto}</p>
              </>
            )}
            {s.porque && <p className="text-xs text-fg-muted">Por qué: {s.porque}</p>}
            <div className="flex flex-wrap items-center justify-end gap-2">
              {!sePuede && <span className="mr-auto text-xs text-fg-muted">Ya no se puede: cambiaste esos puntos, o tienen cifras, dimensión o equipo distintos.</span>}
              <BotonTexto onClick={() => quitarla(s.id)}>Descartar</BotonTexto>
              <BotonAzul disabled={!sePuede} onClick={() => usar(s)}>
                Usar
              </BotonAzul>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** El equipo del cliente de una meta o un reto, como chip de la línea. */
function ChipDelEquipo({ equipo }: { equipo?: keyof typeof EQUIPOS }) {
  return equipo ? <Badge size="xs">{EQUIPOS[equipo].nombre}</Badge> : null;
}

const vacioDeTexto = (s: string | undefined) => !s || !s.trim();

function Editor({ clave, borrador, setBorrador }: { clave: ClaveDeCasilla; borrador: unknown; setBorrador: (v: unknown) => void }) {
  const { escala, exp } = useLienzo();
  const tipo = definicionDe(clave).tipo;
  const dimsEnJuego = escala.areas.filter((a) => exp.estado.areas.includes(a.id)).flatMap((a) => a.dimensiones.filter((d) => d.aplica));
  const nombreDim = (id?: string) => (id ? dimsEnJuego.find((d) => d.id === id)?.nombre : undefined);

  switch (tipo) {
    case "texto":
      return <TextoQueCrece minFilas={5} aria-label={definicionDe(clave).etiqueta} value={(borrador as string) ?? ""} onChange={setBorrador} />;
    case "lista": {
      type Fila = { t: string };
      const filas = ((borrador as string[]) ?? []).map((t) => ({ t }));
      const alCambiar = (v: Fila[]) => setBorrador(v.map((f) => f.t));
      return (
        <EditorDeItems<Fila>
          items={filas}
          onCambio={alCambiar}
          nuevo={() => ({ t: "" })}
          estaVacio={(f) => vacioDeTexto(f.t)}
          texto={(f) => f.t}
          conTexto={(_f, t) => ({ t })}
          agregar="Agregar otro"
          rotuloDelResto={rotuloDelResto(clave)}
          arriba={<SugerenciasDelOrden clave={clave} lista={(borrador as string[]) ?? []} onCambio={setBorrador} />}
        />
      );
    }
    case "metas":
      return (
        <EditorDeItems<Meta>
          items={(borrador as Meta[]) ?? []}
          onCambio={setBorrador}
          nuevo={() => ({ que: "" })}
          estaVacio={(m) => vacioDeTexto(m.que)}
          texto={(m) => m.que}
          conTexto={(m, que) => ({ ...m, que })}
          detalle={{
            ver: (m) => (
              <>
                <ChipDelEquipo equipo={m.equipo} />
                {(m.actual || m.objetivo || m.para) && (
                  <span>{[m.actual && `Hoy: ${m.actual}`, m.objetivo && `Meta: ${m.objetivo}`, m.para && `Para: ${m.para}`].filter(Boolean).join(" · ")}</span>
                )}
                <Badge variant={metaEnCifras(m) ? "success" : "warning"} size="xs">
                  {metaEnCifras(m) ? "En cifras" : "Sin cifra"}
                </Badge>
              </>
            ),
            campos: (m, set) => (
              <div className="grid gap-3 sm:grid-cols-3">
                <Field label="Hoy">
                  <Input value={m.actual ?? ""} onChange={(e) => set({ actual: e.target.value })} placeholder="4 de cada 10" />
                </Field>
                <Field label="Meta">
                  <Input value={m.objetivo ?? ""} onChange={(e) => set({ objetivo: e.target.value })} placeholder="7 de cada 10" />
                </Field>
                <Field label="Para cuándo">
                  <Input value={m.para ?? ""} onChange={(e) => set({ para: e.target.value })} placeholder="Diciembre" />
                </Field>
              </div>
            ),
          }}
          agregar="Agregar una meta"
          rotuloDelResto={rotuloDelResto(clave)}
          arriba={<SugerenciasDelOrden clave={clave} lista={(borrador as Meta[]) ?? []} onCambio={setBorrador} />}
        />
      );
    case "retos":
      return (
        <EditorDeItems<Reto>
          items={(borrador as Reto[]) ?? []}
          onCambio={setBorrador}
          nuevo={() => ({ texto: "" })}
          estaVacio={(r) => vacioDeTexto(r.texto)}
          texto={(r) => r.texto}
          conTexto={(r, texto) => ({ ...r, texto })}
          detalle={{
            ver: (r) => (
              <>
                <ChipDelEquipo equipo={r.equipo} />
                <span className="text-fg-muted">{nombreDim(r.dimensionId) ?? "Sin dimensión"}</span>
              </>
            ),
            campos: (r, set) => (
              <Field label="Dimensión de la escala" hint="Opcional: de qué parte de la operación sale.">
                <Select value={r.dimensionId ?? ""} onChange={(e) => set({ dimensionId: e.target.value || undefined })}>
                  <option value="">Sin dimensión</option>
                  {dimsEnJuego.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.nombre}
                    </option>
                  ))}
                </Select>
              </Field>
            ),
          }}
          agregar={clave === "obstaculos" ? "Agregar un obstáculo" : "Agregar un reto"}
          rotuloDelResto={rotuloDelResto(clave)}
          arriba={<SugerenciasDelOrden clave={clave} lista={(borrador as Reto[]) ?? []} onCambio={setBorrador} />}
        />
      );
    case "autoridad":
      return (
        <EditorDeItems<Persona>
          items={(borrador as Persona[]) ?? []}
          onCambio={setBorrador}
          nuevo={() => ({ nombre: "", rol: "decide" })}
          estaVacio={(p) => vacioDeTexto(p.nombre)}
          texto={(p) => p.nombre}
          conTexto={(p, nombre) => ({ ...p, nombre })}
          detalle={{
            ver: (p) => (
              <>
                {p.cargo && <span>{p.cargo}</span>}
                <Badge variant={p.rol === "firma" ? "primary" : "default"} size="xs">
                  {ETIQUETA_DEL_ROL[p.rol]}
                </Badge>
                {p.nota && <span className="text-fg-muted">· {p.nota}</span>}
              </>
            ),
            campos: (p, set) => (
              <>
                <Field label="Cargo">
                  <Input value={p.cargo ?? ""} onChange={(e) => set({ cargo: e.target.value })} />
                </Field>
                <div className="space-y-1.5">
                  <p className="text-xs font-medium text-fg-secondary">Papel en la decisión</p>
                  <Segmentado
                    etiqueta="Papel en la decisión"
                    opciones={ROLES_EN_LA_DECISION.map((r) => ({ clave: r, etiqueta: ETIQUETA_DEL_ROL[r] }))}
                    valor={p.rol}
                    onCambio={(rol) => set({ rol })}
                  />
                  <p className="text-xs text-fg-muted">{QUE_HACE_EL_ROL[p.rol]}</p>
                </div>
                <Field label="Nota" hint="Cómo le afecta, qué le preocupa.">
                  <TextoQueCrece value={p.nota ?? ""} onChange={(nota) => set({ nota })} />
                </Field>
              </>
            ),
          }}
          agregar="Agregar una persona"
          rotuloDelResto={rotuloDelResto(clave)}
        />
      );
    case "objeciones":
      return (
        <EditorDeItems<Objecion>
          items={(borrador as Objecion[]) ?? []}
          onCambio={setBorrador}
          nuevo={() => ({ texto: "", clase: "otra" })}
          estaVacio={(o) => vacioDeTexto(o.texto)}
          texto={(o) => o.texto}
          conTexto={(o, texto) => ({ ...o, texto })}
          detalle={{
            ver: (o) => (
              <>
                <Badge size="xs">{ETIQUETA_DE_LA_OBJECION[o.clase]}</Badge>
                {o.respuesta ? (
                  <span>Se respondió: {o.respuesta}</span>
                ) : (
                  <Badge variant="warning" size="xs">
                    Sin responder
                  </Badge>
                )}
              </>
            ),
            campos: (o, set) => (
              <>
                <Field label="De qué tipo es">
                  <Select value={o.clase} onChange={(e) => set({ clase: e.target.value as Objecion["clase"] })}>
                    {CLASES_DE_OBJECION.map((c) => (
                      <option key={c} value={c}>
                        {ETIQUETA_DE_LA_OBJECION[c]}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Cómo se respondió" hint="Si no se respondió, déjalo vacío: queda abierta.">
                  <TextoQueCrece value={o.respuesta ?? ""} onChange={(respuesta) => set({ respuesta })} />
                </Field>
              </>
            ),
          }}
          agregar="Agregar una objeción"
        />
      );
    case "siguientePaso": {
      const s = (borrador as SiguientePaso) ?? { que: "" };
      return (
        <div className="space-y-3">
          <Field label="Qué sigue">
            <TextoQueCrece value={s.que} onChange={(que) => setBorrador({ ...s, que })} />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Fecha">
              <Input type="date" value={s.fecha ?? ""} onChange={(e) => setBorrador({ ...s, fecha: e.target.value || undefined })} />
            </Field>
            <Field label="Con quién">
              <Input value={s.conQuien ?? ""} onChange={(e) => setBorrador({ ...s, conQuien: e.target.value })} />
            </Field>
          </div>
        </div>
      );
    }
    case "radiografia": {
      const r = (borrador as Radiografia) ?? {};
      const set = (cambio: Partial<Radiografia>) => setBorrador({ ...r, ...cambio });
      const modelos = r.modelos ?? [];
      return (
        <div className="space-y-4">
          <Field label="Qué hace la empresa">
            <TextoQueCrece minFilas={3} value={r.resumen ?? ""} onChange={(resumen) => set({ resumen })} />
          </Field>
          <Field label="Sector">
            <Input value={r.sector ?? ""} onChange={(e) => set({ sector: e.target.value })} placeholder="Software financiero" />
          </Field>
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-fg-secondary">Cómo vende</p>
            <div className="flex flex-wrap gap-1.5">
              {MODELOS_DE_NEGOCIO.map((m) => {
                const activo = modelos.includes(m);
                return (
                  <button
                    key={m}
                    type="button"
                    aria-pressed={activo}
                    onClick={() => set({ modelos: activo ? modelos.filter((x) => x !== m) : [...modelos, m] })}
                    className={cn(
                      "rounded-full border px-3 py-1 text-xs transition-colors",
                      activo ? "border-info-line bg-info-surface font-medium text-brand" : "border-line text-fg-secondary hover:bg-surface-hover",
                    )}
                  >
                    {ETIQUETA_DEL_MODELO[m]}
                  </button>
                );
              })}
            </div>
          </div>
          <Field label="Herramientas que se le ven" hint="Separadas por comas: su CRM, su tienda, su chat, su ERP.">
            <Input
              value={(r.stack ?? []).join(", ")}
              onChange={(e) => set({ stack: e.target.value.split(",").map((x) => x.trimStart()) })}
              placeholder="HubSpot, Shopify, WhatsApp Business"
            />
          </Field>
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-fg-secondary">Noticias e hitos recientes</p>
            <EditorDeItems<Hito>
              items={r.hitos ?? []}
              onCambio={(hitos) => set({ hitos })}
              nuevo={() => ({ texto: "", url: "" })}
              estaVacio={(h) => vacioDeTexto(h.texto)}
              texto={(h) => h.texto}
              conTexto={(h, texto) => ({ ...h, texto })}
              detalle={{
                ver: (h) =>
                  h.url?.trim() ? (
                    <span className="text-fg-muted">{[h.fecha, h.url].filter(Boolean).join(" · ")}</span>
                  ) : (
                    <Badge variant="warning" size="xs">
                      Falta el enlace: sin él no se guarda
                    </Badge>
                  ),
                campos: (h, setH) => (
                  <div className="grid gap-3 sm:grid-cols-[8rem_1fr]">
                    <Field label="Cuándo">
                      <Input value={h.fecha ?? ""} onChange={(e) => setH({ fecha: e.target.value || undefined })} placeholder="2026-03" />
                    </Field>
                    <Field label="Enlace">
                      <Input value={h.url} onChange={(e) => setH({ url: e.target.value })} placeholder="https://…" />
                    </Field>
                  </div>
                ),
              }}
              agregar="Agregar un hito"
              abrirAlAgregar
            />
          </div>
        </div>
      );
    }
    case "conexion": {
      const c = (borrador as EstrategiaDeConexion) ?? { canal: "email" as const, pitch: "", mensaje: "" };
      const set = (cambio: Partial<EstrategiaDeConexion>) => setBorrador({ ...c, ...cambio });
      return (
        <div className="space-y-4">
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-fg-secondary">Canal</p>
            <Segmentado
              etiqueta="Canal"
              opciones={CANALES_DE_CONEXION.map((k) => ({ clave: k, etiqueta: ETIQUETA_DEL_CANAL[k] }))}
              valor={c.canal}
              onCambio={(canal) => set({ canal })}
            />
          </div>
          <Field label="El ángulo" hint="Por qué le importaría hablar, en una o dos frases.">
            <TextoQueCrece value={c.pitch} onChange={(pitch) => set({ pitch })} />
          </Field>
          <Field label="Mensaje de ejemplo">
            <TextoQueCrece minFilas={5} value={c.mensaje} onChange={(mensaje) => set({ mensaje })} />
          </Field>
          <Field label="Llamado a la acción">
            <Input value={c.cta ?? ""} onChange={(e) => set({ cta: e.target.value })} placeholder="Agenda 30 minutos en mi calendario: [enlace]" />
          </Field>
        </div>
      );
    }
    case "cifras": {
      if (!esDeCifras(clave)) return null;
      const v = (borrador as Cifras) ?? {};
      return (
        <div className="grid gap-3 sm:grid-cols-2">
          {CAMPOS_DE_LA_TARJETA[clave].map((c) => (
            <Field key={c.clave} label={c.etiqueta} hint={c.ayuda}>
              <Input value={v[c.clave] ?? ""} onChange={(e) => setBorrador({ ...v, [c.clave]: e.target.value })} placeholder={c.ejemplo} />
            </Field>
          ))}
        </div>
      );
    }
    case "apertura": {
      const a = (borrador as Apertura) ?? null;
      return (
        <div className="space-y-3">
          <Segmentado etiqueta="Apertura a la asesoría" opciones={APERTURA} valor={a?.valor ?? null} onCambio={(v) => setBorrador({ ...(a ?? {}), valor: v })} />
          <Field label="Por qué lo dices">
            <TextoQueCrece value={a?.porQue ?? ""} onChange={(porQue) => setBorrador({ ...(a ?? { valor: "no_se" }), porQue })} />
          </Field>
        </div>
      );
    }
  }
}

/** Saca las filas vacías y los textos en blanco antes de guardar: el servidor valida estricto. */
function limpiar(clave: ClaveDeCasilla, v: unknown): unknown {
  const tipo = definicionDe(clave).tipo;
  const sinVacios = <T extends object>(o: T) =>
    Object.fromEntries(Object.entries(o).filter(([, x]) => !(typeof x === "string" && x.trim() === ""))) as T;
  switch (tipo) {
    case "texto":
      return typeof v === "string" ? v.trim() : "";
    case "lista":
      return ((v as string[]) ?? []).map((t) => t.trim()).filter(Boolean);
    case "metas":
      return ((v as Meta[]) ?? []).filter((m) => m.que?.trim()).map((m) => sinVacios(m));
    case "retos":
      return ((v as Reto[]) ?? []).filter((r) => r.texto?.trim()).map((r) => sinVacios(r));
    case "autoridad":
      return ((v as Persona[]) ?? []).filter((p) => p.nombre?.trim()).map((p) => sinVacios(p));
    case "objeciones":
      return ((v as Objecion[]) ?? []).filter((o) => o.texto?.trim()).map((o) => sinVacios(o));
    case "siguientePaso":
      return v && (v as SiguientePaso).que?.trim() ? sinVacios(v as SiguientePaso) : undefined;
    case "apertura":
      return v && (v as Apertura).valor ? sinVacios(v as Apertura) : undefined;
    case "radiografia": {
      const r = (v as Radiografia) ?? {};
      const limpia: Radiografia = sinVacios({
        ...r,
        stack: (r.stack ?? []).map((x) => x.trim()).filter(Boolean),
        hitos: (r.hitos ?? []).filter((h) => h.texto?.trim() && h.url?.trim()).map((h) => sinVacios(h)),
      });
      if (!limpia.stack?.length) delete limpia.stack;
      if (!limpia.hitos?.length) delete limpia.hitos;
      if (!limpia.modelos?.length) delete limpia.modelos;
      return Object.keys(limpia).length ? limpia : undefined;
    }
    case "conexion": {
      const c = v as EstrategiaDeConexion | undefined;
      return c && c.pitch?.trim() && c.mensaje?.trim() ? sinVacios(c) : undefined;
    }
    case "cifras": {
      const limpias = Object.fromEntries(
        Object.entries((v as Cifras) ?? {})
          .map(([k, x]) => [k, typeof x === "string" ? x.trim() : ""])
          .filter(([, x]) => x),
      ) as Cifras;
      return Object.keys(limpias).length ? limpias : undefined;
    }
  }
}

/**
 * Las particularidades en el Resumen (22 nov, Elías): las `n` más recientes, cada una con el día en que entró, y
 * «Ver todas (N)» para la lista completa. Las que entraron antes del 22 nov no tienen fecha registrada: van sin fecha.
 */
function VistaDeLasRecientes({ lista, n }: { lista: string[]; n: number }) {
  const { exp } = useLienzo();
  const [todas, setTodas] = useState(false);
  const fechas = exp.estado.contenido.fechasDeLasParticularidades;
  const claveDe = (t: string) => claveDeItemDeLista("particularidades", t);
  const visibles = particularidadesRecientes(lista, fechas, claveDe, todas ? undefined : n);
  return (
    <div className="space-y-1.5">
      <ul className="space-y-1.5">
        {visibles.map((p, i) => (
          <li key={i} className="flex items-baseline gap-3 text-sm text-fg-secondary">
            <span className="min-w-0 flex-1">{p.texto}</span>
            {p.fecha && <span className="flex-shrink-0 text-xs tabular-nums text-fg-muted">{diaCorto(p.fecha)}</span>}
          </li>
        ))}
      </ul>
      {lista.length > n && (
        <button type="button" onClick={() => setTodas((v) => !v)} className="text-xs font-semibold text-brand hover:text-brand-light">
          {todas ? "Ver solo las más recientes" : `Ver todas (${lista.length})`}
        </button>
      )}
    </div>
  );
}

/** ¿El borrador quedó vacío? Entonces guardar = borrar la casilla. */
function vacio(v: unknown): boolean {
  return v === undefined || v === "" || (Array.isArray(v) && v.length === 0);
}

const igual = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/**
 * `sinTitulo`: dentro de un cajón que ya muestra el nombre y la ayuda de la casilla (el resumen).
 * `editarDeEntrada`: abre directo en el formulario, sin «Completar» ni «Editar» (el cajón del
 * resumen: tocar la tarjeta ya es querer llenarla). Al guardar o cancelar avisa con `onListo`.
 * `pie`: dónde van «Guardar» y «Cancelar» (el pie del cajón, fijo abajo); sin él, debajo del editor.
 * `recientes`: en una lista de textos, cuántos se ven (los más nuevos, con su fecha); el resto, con «Ver todas (N)».
 */
export function Casilla({
  clave,
  className,
  sinTitulo = false,
  editarDeEntrada = false,
  onListo,
  pie,
  recientes,
}: {
  clave: ClaveDeCasilla;
  className?: string;
  sinTitulo?: boolean;
  editarDeEntrada?: boolean;
  onListo?: () => void;
  pie?: HTMLElement | null;
  recientes?: number;
}) {
  const { exp, marco, cambiar, puedeEditar, guardando, pendientesPara } = useLienzo();
  // Con el nombre de su marco: en un proyecto, «Metas» es «Resultados que persigue».
  const def = definicionEnElMarco(clave, marco);
  const valor = exp.estado.contenido.casillas[clave] as ValoresDeCasillas[typeof clave] | undefined;
  const pendientes = pendientesPara((d) => d.tipo === "casilla" && d.clave === clave);
  const [editando, setEditando] = useState(editarDeEntrada && puedeEditar);
  const [borrador, setBorrador] = useState<unknown>(valor);

  /* Si mientras se edita cambia lo confirmado (se usó algo que propuso el agente), lo nuevo entra al
     borrador: si no, «Guardar» lo borraría sin que nadie lo note. */
  const [visto, setVisto] = useState<unknown>(valor);
  if (!igual(visto, valor)) {
    setVisto(valor);
    if (Array.isArray(valor) && Array.isArray(borrador)) {
      const antes = Array.isArray(visto) ? (visto as unknown[]) : [];
      const nuevos = (valor as unknown[]).filter((x) => !antes.some((y) => igual(x, y)));
      setBorrador([...(borrador as unknown[]), ...nuevos]);
    } else if (igual(borrador, visto)) {
      setBorrador(valor);
    }
  }

  async function guardar() {
    const limpio = limpiar(clave, borrador);
    const ok = await cambiar([{ op: "casilla", clave, valor: vacio(limpio) ? null : limpio }]);
    if (!ok) return;
    setEditando(false);
    onListo?.();
  }

  function cancelar() {
    setBorrador(valor);
    setEditando(false);
    onListo?.();
  }

  const enCajon = editarDeEntrada;
  return (
    <section className={cn(enCajon ? "space-y-4" : "space-y-2", !sinTitulo && "rounded-xl border border-line bg-surface p-5", className)}>
      {enCajon && (def.explicacion || def.ejemplo) && (
        <div className="space-y-1.5 rounded-xl bg-surface-muted px-4 py-3">
          {def.explicacion && <p className="text-sm leading-relaxed text-fg-secondary">{def.explicacion}</p>}
          {def.ejemplo && (
            <p className="text-xs text-fg-muted">
              <span className="font-semibold text-fg-secondary">Ejemplo: </span>
              {def.ejemplo}
            </p>
          )}
        </div>
      )}

      <div className={cn("flex items-start gap-3", sinTitulo ? "justify-end" : "justify-between")}>
        {!sinTitulo && (
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-fg">{def.etiqueta}</h3>
            <p className="text-xs text-fg-muted">{def.ayuda}</p>
          </div>
        )}
        <div className="flex flex-shrink-0 items-center gap-2">
          {!def.alCliente && (
            <Badge size="xs" title="No entra a la propuesta: la ve el cliente.">
              Interno
            </Badge>
          )}
          {puedeEditar && !editando && (
            <Button
              size="xs"
              variant="secondary"
              onClick={() => {
                setBorrador(valor);
                setEditando(true);
              }}
            >
              {valor === undefined ? "Completar" : "Editar"}
            </Button>
          )}
        </div>
      </div>

      {editando ? (
        <div className="space-y-3">
          <Editor clave={clave} borrador={borrador} setBorrador={setBorrador} />
          {!pie && (
            <div className="flex items-center gap-2">
              <Button size="sm" variant="primary" loading={guardando} onClick={() => void guardar()}>
                Guardar
              </Button>
              <Button size="sm" variant="secondary" onClick={cancelar}>
                Cancelar
              </Button>
            </div>
          )}
        </div>
      ) : valor !== undefined ? (
        recientes && clave === "particularidades" && Array.isArray(valor) ? (
          <VistaDeLasRecientes lista={valor as string[]} n={recientes} />
        ) : (
          <Vista clave={clave} valor={valor} />
        )
      ) : (
        <p className="text-sm text-fg-muted">Sin completar.</p>
      )}

      {/* 2026-11-20: cuánto pierde el cliente, calculado con Negocio y Embudo (solo la preventa, solo en «Qué pasa»). */}
      {clave === "consecuencias" && <PerdidaCalculada />}

      {/* K12: con lo usado hoy en esta casilla, para revertirlo (y «No quedan» al usar la última). */}
      <div className="space-y-2">
        <Propuestas items={pendientes} filtro={(d) => d.tipo === "casilla" && d.clave === clave} />
      </div>

      {pie &&
        editando &&
        createPortal(
          <>
            <Button size="sm" variant="secondary" onClick={cancelar}>
              Cancelar
            </Button>
            <Button size="sm" variant="primary" loading={guardando} onClick={() => void guardar()}>
              Guardar
            </Button>
          </>,
          pie,
        )}
    </section>
  );
}
