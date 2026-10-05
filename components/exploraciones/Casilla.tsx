"use client";

/**
 * Casilla — una casilla del lienzo: lo confirmado, el editor y lo que propuso el agente para ella.
 *
 * Se edita entera («Editar» → «Guardar»): una casilla es una idea completa (las metas, quién decide)
 * y guardarla a medias en cada tecla dejaría versiones raras en la historia. En una lista, cada ítem
 * se ve como una tarjeta y se abre de a uno. Lo propuesto se usa o se descarta desde la propia casilla.
 */
import { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Badge, Button, Field, Input, Segmentado, Select, Textarea } from "@/components/ui";
import {
  CANALES_DE_CONEXION,
  CLASES_DE_OBJECION,
  definicionDe,
  ETIQUETA_DEL_CANAL,
  ETIQUETA_DEL_MODELO,
  MODELOS_DE_NEGOCIO,
  ETIQUETA_DE_LA_OBJECION,
  ETIQUETA_DEL_ROL,
  metaEnCifras,
  QUE_HACE_EL_ROL,
  ROLES_EN_LA_DECISION,
  type Apertura,
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
          {(valor as string[]).map((t, i) => (
            <li key={i}>{t}</li>
          ))}
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
function TextoQueCrece({ value, onChange, minFilas = 2, ...resto }: { value: string; onChange: (v: string) => void; minFilas?: number; placeholder?: string; "aria-label"?: string; autoFocus?: boolean }) {
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
      className="overflow-hidden leading-relaxed"
      {...resto}
    />
  );
}

/**
 * Una lista editable de a un ítem. `abierto` es el que muestra sus campos; los demás se ven como
 * tarjetas. «Listo» lo cierra (y lo quita si quedó vacío); «Agregar» suma uno vacío, ya abierto.
 */
function EditorDeItems<T>({
  items,
  onCambio,
  nuevo,
  estaVacio,
  verItem,
  campos,
  agregar,
}: {
  items: T[];
  onCambio: (v: T[]) => void;
  nuevo: () => T;
  estaVacio: (x: T) => boolean;
  verItem: (x: T) => React.ReactNode;
  campos: (x: T, set: (cambio: Partial<T>) => void) => React.ReactNode;
  agregar: string;
}) {
  // Sin nada todavía, el primero ya está abierto: tocar la tarjeta es querer llenarla.
  const [abierto, setAbierto] = useState<number | null>(items.length === 0 ? 0 : null);
  const lista = items.length === 0 && abierto === 0 ? [nuevo()] : items;

  const set = (i: number, cambio: Partial<T>) => onCambio(lista.map((x, j) => (j === i ? { ...x, ...cambio } : x)));
  const quitar = (i: number) => {
    onCambio(lista.filter((_, j) => j !== i));
    setAbierto(null);
  };
  const cerrar = (i: number) => {
    if (estaVacio(lista[i])) onCambio(lista.filter((_, j) => j !== i));
    setAbierto(null);
  };

  return (
    <div className="space-y-2">
      {lista.map((x, i) =>
        i === abierto ? (
          <div key={i} className="space-y-3 rounded-xl border border-info-line bg-surface p-4 shadow-sm">
            {campos(x, (cambio) => set(i, cambio))}
            <div className="flex items-center justify-between gap-2 pt-1">
              <button type="button" className="text-xs text-fg-muted hover:text-fg hover:underline" onClick={() => quitar(i)}>
                Quitar
              </button>
              <Button size="sm" variant="secondary" onClick={() => cerrar(i)}>
                Listo
              </Button>
            </div>
          </div>
        ) : (
          <div key={i} className="flex items-start justify-between gap-3 rounded-xl border border-line bg-surface px-4 py-3">
            <div className="min-w-0 flex-1 text-sm">{verItem(x)}</div>
            <div className="flex flex-shrink-0 items-center gap-3 text-xs">
              <button type="button" className="font-medium text-brand hover:underline" onClick={() => setAbierto(i)}>
                Editar
              </button>
              <button type="button" className="text-fg-muted hover:text-fg hover:underline" onClick={() => quitar(i)}>
                Quitar
              </button>
            </div>
          </div>
        ),
      )}
      {abierto === null && (
        <button
          type="button"
          className="w-full rounded-xl border border-dashed border-line px-4 py-3 text-left text-sm font-medium text-brand transition-colors hover:bg-surface-hover"
          onClick={() => {
            onCambio([...lista, nuevo()]);
            setAbierto(lista.length);
          }}
        >
          + {agregar}
        </button>
      )}
    </div>
  );
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
      return (
        <EditorDeItems<Fila>
          items={filas}
          onCambio={(v) => setBorrador(v.map((f) => f.t))}
          nuevo={() => ({ t: "" })}
          estaVacio={(f) => vacioDeTexto(f.t)}
          verItem={(f) => <p className="text-fg">{f.t}</p>}
          campos={(f, set) => <TextoQueCrece autoFocus aria-label={definicionDe(clave).etiqueta} value={f.t} onChange={(t) => set({ t })} />}
          agregar="Agregar otro"
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
          verItem={(m) => (
            <div className="space-y-1">
              <p className="font-medium text-fg">{m.que}</p>
              {(m.actual || m.objetivo || m.para) && (
                <p className="text-xs text-fg-secondary">
                  {[m.actual && `Hoy: ${m.actual}`, m.objetivo && `Meta: ${m.objetivo}`, m.para && `Para: ${m.para}`].filter(Boolean).join(" · ")}
                </p>
              )}
              <Badge variant={metaEnCifras(m) ? "success" : "warning"} size="xs">
                {metaEnCifras(m) ? "En cifras" : "Sin cifra"}
              </Badge>
            </div>
          )}
          campos={(m, set) => (
            <>
              <Field label="Qué quiere lograr">
                <TextoQueCrece autoFocus value={m.que} onChange={(que) => set({ que })} placeholder="Cerrar más de lo que entra" />
              </Field>
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
            </>
          )}
          agregar="Agregar una meta"
        />
      );
    case "retos":
      return (
        <EditorDeItems<Reto>
          items={(borrador as Reto[]) ?? []}
          onCambio={setBorrador}
          nuevo={() => ({ texto: "" })}
          estaVacio={(r) => vacioDeTexto(r.texto)}
          verItem={(r) => (
            <div className="space-y-1">
              <p className="text-fg">{r.texto}</p>
              {nombreDim(r.dimensionId) && <p className="text-xs text-fg-muted">{nombreDim(r.dimensionId)}</p>}
            </div>
          )}
          campos={(r, set) => (
            <>
              <Field label="Qué los frena">
                <TextoQueCrece autoFocus value={r.texto} onChange={(texto) => set({ texto })} />
              </Field>
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
            </>
          )}
          agregar="Agregar un reto"
        />
      );
    case "autoridad":
      return (
        <EditorDeItems<Persona>
          items={(borrador as Persona[]) ?? []}
          onCambio={setBorrador}
          nuevo={() => ({ nombre: "", rol: "decide" })}
          estaVacio={(p) => vacioDeTexto(p.nombre)}
          verItem={(p) => (
            <div className="space-y-1">
              <p className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-fg">{p.nombre}</span>
                {p.cargo && <span className="text-xs text-fg-muted">{p.cargo}</span>}
                <Badge variant={p.rol === "firma" ? "primary" : "default"} size="xs">
                  {ETIQUETA_DEL_ROL[p.rol]}
                </Badge>
              </p>
              {p.nota && <p className="text-xs text-fg-secondary">{p.nota}</p>}
            </div>
          )}
          campos={(p, set) => (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Nombre">
                  <Input autoFocus value={p.nombre} onChange={(e) => set({ nombre: e.target.value })} />
                </Field>
                <Field label="Cargo">
                  <Input value={p.cargo ?? ""} onChange={(e) => set({ cargo: e.target.value })} />
                </Field>
              </div>
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
          )}
          agregar="Agregar una persona"
        />
      );
    case "objeciones":
      return (
        <EditorDeItems<Objecion>
          items={(borrador as Objecion[]) ?? []}
          onCambio={setBorrador}
          nuevo={() => ({ texto: "", clase: "otra" })}
          estaVacio={(o) => vacioDeTexto(o.texto)}
          verItem={(o) => (
            <div className="space-y-1">
              <p className="flex flex-wrap items-center gap-2">
                <span className="text-fg">{o.texto}</span>
                <Badge size="xs">{ETIQUETA_DE_LA_OBJECION[o.clase]}</Badge>
                {!o.respuesta && (
                  <Badge variant="warning" size="xs">
                    Sin responder
                  </Badge>
                )}
              </p>
              {o.respuesta && <p className="text-xs text-fg-secondary">Se respondió: {o.respuesta}</p>}
            </div>
          )}
          campos={(o, set) => (
            <>
              <Field label="Qué dijo que lo frena">
                <TextoQueCrece autoFocus value={o.texto} onChange={(texto) => set({ texto })} />
              </Field>
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
          )}
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
              verItem={(h) => (
                <p className="text-fg">
                  {h.fecha && <span className="mr-2 text-xs tabular-nums text-fg-muted">{h.fecha}</span>}
                  {h.texto}
                </p>
              )}
              campos={(h, setH) => (
                <>
                  <Field label="Qué pasó">
                    <TextoQueCrece autoFocus value={h.texto} onChange={(texto) => setH({ texto })} />
                  </Field>
                  <div className="grid gap-3 sm:grid-cols-[8rem_1fr]">
                    <Field label="Cuándo">
                      <Input value={h.fecha ?? ""} onChange={(e) => setH({ fecha: e.target.value || undefined })} placeholder="2026-03" />
                    </Field>
                    <Field label="Enlace">
                      <Input value={h.url} onChange={(e) => setH({ url: e.target.value })} placeholder="https://…" />
                    </Field>
                  </div>
                </>
              )}
              agregar="Agregar un hito"
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
  }
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
 */
export function Casilla({
  clave,
  className,
  sinTitulo = false,
  editarDeEntrada = false,
  onListo,
  pie,
}: {
  clave: ClaveDeCasilla;
  className?: string;
  sinTitulo?: boolean;
  editarDeEntrada?: boolean;
  onListo?: () => void;
  pie?: HTMLElement | null;
}) {
  const { exp, cambiar, puedeEditar, guardando, pendientesPara } = useLienzo();
  const def = definicionDe(clave);
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
        <Vista clave={clave} valor={valor} />
      ) : (
        <p className="text-sm text-fg-muted">Sin completar.</p>
      )}

      {pendientes.length > 0 && (
        <div className="space-y-2">
          <Propuestas items={pendientes} />
        </div>
      )}

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
