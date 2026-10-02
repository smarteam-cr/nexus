"use client";

/**
 * Casilla — una casilla del lienzo: lo confirmado, el editor y lo que propuso el agente para ella.
 *
 * Se edita entera («Editar» → «Guardar»): una casilla es una idea completa (las metas, quién decide)
 * y guardarla a medias en cada tecla dejaría versiones raras en la historia. Lo propuesto se usa o
 * se descarta desde la propia casilla.
 */
import { useState } from "react";
import { Badge, Button, Field, Input, Segmentado, Select, Textarea } from "@/components/ui";
import {
  CLASES_DE_OBJECION,
  definicionDe,
  ETIQUETA_DE_LA_OBJECION,
  ETIQUETA_DEL_ROL,
  metaEnCifras,
  ROLES_EN_LA_DECISION,
  type Apertura,
  type ClaveDeCasilla,
  type Meta,
  type Objecion,
  type Persona,
  type Reto,
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

// ── Vista de lo confirmado ────────────────────────────────────────────────────

function Vista({ clave, valor }: { clave: ClaveDeCasilla; valor: unknown }) {
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
// Cada campo con su ETIQUETA a la vista y a todo el ancho (pedido de Elías, 2026-10-01: los
// placeholders cortados no se leían y no había espacio para ver lo escrito). Cada ítem de una lista
// va en su propia tarjeta, con los campos uno debajo del otro.

/** La tarjeta de un ítem de lista: sus campos y «Quitar» arriba a la derecha. */
function Item({ children, onQuitar, titulo }: { children: React.ReactNode; onQuitar: () => void; titulo: string }) {
  return (
    <div className="space-y-3 rounded-lg border border-line p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold text-fg-secondary">{titulo}</p>
        <button type="button" className="text-xs text-fg-muted underline-offset-2 hover:text-fg hover:underline" onClick={onQuitar}>
          Quitar
        </button>
      </div>
      {children}
    </div>
  );
}

function Agregar({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <Button size="xs" variant="ghost" onClick={onClick}>
      {children}
    </Button>
  );
}

function EditorDeLista({ valor, onCambio }: { valor: string[]; onCambio: (v: string[]) => void }) {
  const filas = valor.length ? valor : [""];
  return (
    <div className="space-y-2">
      {filas.map((t, i) => (
        <div key={i} className="flex items-start gap-2">
          <Textarea rows={2} value={t} aria-label={`Punto ${i + 1}`} onChange={(e) => onCambio(filas.map((x, j) => (j === i ? e.target.value : x)))} />
          <button
            type="button"
            className="mt-2 flex-shrink-0 text-xs text-fg-muted underline-offset-2 hover:text-fg hover:underline"
            onClick={() => onCambio(filas.filter((_, j) => j !== i))}
          >
            Quitar
          </button>
        </div>
      ))}
      <Agregar onClick={() => onCambio([...filas, ""])}>Agregar otro punto</Agregar>
    </div>
  );
}

function Editor({ clave, borrador, setBorrador }: { clave: ClaveDeCasilla; borrador: unknown; setBorrador: (v: unknown) => void }) {
  const { escala, exp } = useLienzo();
  const tipo = definicionDe(clave).tipo;
  const dimsEnJuego = escala.areas.filter((a) => exp.estado.areas.includes(a.id)).flatMap((a) => a.dimensiones.filter((d) => d.aplica));

  switch (tipo) {
    case "texto":
      return <Textarea rows={6} aria-label={definicionDe(clave).etiqueta} value={(borrador as string) ?? ""} onChange={(e) => setBorrador(e.target.value)} />;
    case "lista":
      return <EditorDeLista valor={(borrador as string[]) ?? []} onCambio={setBorrador} />;
    case "metas": {
      const metas = ((borrador as Meta[]) ?? []).length ? (borrador as Meta[]) : [{ que: "" }];
      const set = (i: number, campo: keyof Meta, v: string) => setBorrador(metas.map((m, j) => (j === i ? { ...m, [campo]: v } : m)));
      return (
        <div className="space-y-3">
          {metas.map((m, i) => (
            <Item key={i} titulo={`Meta ${i + 1}`} onQuitar={() => setBorrador(metas.filter((_, j) => j !== i))}>
              <Field label="Qué quiere lograr">
                <Textarea rows={2} value={m.que} placeholder="Por ejemplo: cerrar más de lo que entra" onChange={(e) => set(i, "que", e.target.value)} />
              </Field>
              <div className="grid gap-3 sm:grid-cols-3">
                <Field label="De cuánto parte">
                  <Input value={m.actual ?? ""} placeholder="Hoy: 4 de cada 10" onChange={(e) => set(i, "actual", e.target.value)} />
                </Field>
                <Field label="A cuánto quiere llegar">
                  <Input value={m.objetivo ?? ""} placeholder="7 de cada 10" onChange={(e) => set(i, "objetivo", e.target.value)} />
                </Field>
                <Field label="Para cuándo">
                  <Input value={m.para ?? ""} placeholder="Diciembre" onChange={(e) => set(i, "para", e.target.value)} />
                </Field>
              </div>
            </Item>
          ))}
          <Agregar onClick={() => setBorrador([...metas, { que: "" }])}>Agregar otra meta</Agregar>
        </div>
      );
    }
    case "retos": {
      const retos = ((borrador as Reto[]) ?? []).length ? (borrador as Reto[]) : [{ texto: "" }];
      const set = (i: number, cambio: Partial<Reto>) => setBorrador(retos.map((x, j) => (j === i ? { ...x, ...cambio } : x)));
      return (
        <div className="space-y-3">
          {retos.map((r, i) => (
            <Item key={i} titulo={`Reto ${i + 1}`} onQuitar={() => setBorrador(retos.filter((_, j) => j !== i))}>
              <Field label="Qué los frena">
                <Textarea rows={2} value={r.texto} onChange={(e) => set(i, { texto: e.target.value })} />
              </Field>
              <Field label="Dimensión de la escala" hint="Opcional: de qué parte de la operación sale.">
                <Select value={r.dimensionId ?? ""} onChange={(e) => set(i, { dimensionId: e.target.value || undefined })}>
                  <option value="">Sin dimensión</option>
                  {dimsEnJuego.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.nombre}
                    </option>
                  ))}
                </Select>
              </Field>
            </Item>
          ))}
          <Agregar onClick={() => setBorrador([...retos, { texto: "" }])}>Agregar otro reto</Agregar>
        </div>
      );
    }
    case "autoridad": {
      const personas = ((borrador as Persona[]) ?? []).length ? (borrador as Persona[]) : [{ nombre: "", rol: "decide" as const }];
      const set = (i: number, cambio: Partial<Persona>) => setBorrador(personas.map((p, j) => (j === i ? { ...p, ...cambio } : p)));
      return (
        <div className="space-y-3">
          {personas.map((p, i) => (
            <Item key={i} titulo={p.nombre.trim() || `Persona ${i + 1}`} onQuitar={() => setBorrador(personas.filter((_, j) => j !== i))}>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Nombre">
                  <Input value={p.nombre} onChange={(e) => set(i, { nombre: e.target.value })} />
                </Field>
                <Field label="Cargo">
                  <Input value={p.cargo ?? ""} onChange={(e) => set(i, { cargo: e.target.value })} />
                </Field>
              </div>
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-fg-secondary">Papel en la decisión</p>
                <Segmentado
                  etiqueta="Papel en la decisión"
                  opciones={ROLES_EN_LA_DECISION.map((r) => ({ clave: r, etiqueta: ETIQUETA_DEL_ROL[r] }))}
                  valor={p.rol}
                  onCambio={(rol) => set(i, { rol })}
                />
              </div>
              <Field label="Nota" hint="Cómo le afecta, qué le preocupa.">
                <Textarea rows={2} value={p.nota ?? ""} onChange={(e) => set(i, { nota: e.target.value })} />
              </Field>
            </Item>
          ))}
          <Agregar onClick={() => setBorrador([...personas, { nombre: "", rol: "afectado" }])}>Agregar otra persona</Agregar>
        </div>
      );
    }
    case "objeciones": {
      const objeciones = ((borrador as Objecion[]) ?? []).length ? (borrador as Objecion[]) : [{ texto: "", clase: "otra" as const }];
      const set = (i: number, cambio: Partial<Objecion>) => setBorrador(objeciones.map((o, j) => (j === i ? { ...o, ...cambio } : o)));
      return (
        <div className="space-y-3">
          {objeciones.map((o, i) => (
            <Item key={i} titulo={`Objeción ${i + 1}`} onQuitar={() => setBorrador(objeciones.filter((_, j) => j !== i))}>
              <Field label="Qué dijo que lo frena">
                <Textarea rows={2} value={o.texto} onChange={(e) => set(i, { texto: e.target.value })} />
              </Field>
              <Field label="De qué tipo es">
                <Select value={o.clase} onChange={(e) => set(i, { clase: e.target.value as Objecion["clase"] })}>
                  {CLASES_DE_OBJECION.map((c) => (
                    <option key={c} value={c}>
                      {ETIQUETA_DE_LA_OBJECION[c]}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Cómo se respondió" hint="Si no se respondió, déjalo vacío: queda abierta.">
                <Textarea rows={2} value={o.respuesta ?? ""} onChange={(e) => set(i, { respuesta: e.target.value })} />
              </Field>
            </Item>
          ))}
          <Agregar onClick={() => setBorrador([...objeciones, { texto: "", clase: "otra" }])}>Agregar otra objeción</Agregar>
        </div>
      );
    }
    case "siguientePaso": {
      const s = (borrador as SiguientePaso) ?? { que: "" };
      return (
        <div className="space-y-3">
          <Field label="Qué sigue">
            <Textarea rows={2} value={s.que} onChange={(e) => setBorrador({ ...s, que: e.target.value })} />
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
    case "apertura": {
      const a = (borrador as Apertura) ?? null;
      return (
        <div className="space-y-3">
          <Segmentado etiqueta="Apertura a la asesoría" opciones={APERTURA} valor={a?.valor ?? null} onCambio={(v) => setBorrador({ ...(a ?? {}), valor: v })} />
          <Field label="Por qué lo dices">
            <Textarea rows={2} value={a?.porQue ?? ""} onChange={(e) => setBorrador({ ...(a ?? { valor: "no_se" }), porQue: e.target.value })} />
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
  }
}

/** ¿El borrador quedó vacío? Entonces guardar = borrar la casilla. */
function vacio(v: unknown): boolean {
  return v === undefined || v === "" || (Array.isArray(v) && v.length === 0);
}

/**
 * `sinTitulo`: dentro de un cajón que ya muestra el nombre y la ayuda de la casilla (el resumen).
 * `editarDeEntrada`: abre directo en el formulario, sin «Completar» ni «Editar» (el cajón del
 * resumen: tocar la tarjeta ya es querer llenarla). Al guardar o cancelar avisa con `onListo`.
 */
export function Casilla({
  clave,
  className,
  sinTitulo = false,
  editarDeEntrada = false,
  onListo,
}: {
  clave: ClaveDeCasilla;
  className?: string;
  sinTitulo?: boolean;
  editarDeEntrada?: boolean;
  onListo?: () => void;
}) {
  const { exp, cambiar, puedeEditar, guardando, pendientesPara } = useLienzo();
  const def = definicionDe(clave);
  const valor = exp.estado.contenido.casillas[clave] as ValoresDeCasillas[typeof clave] | undefined;
  const pendientes = pendientesPara((d) => d.tipo === "casilla" && d.clave === clave);
  const [editando, setEditando] = useState(editarDeEntrada && puedeEditar);
  const [borrador, setBorrador] = useState<unknown>(valor);

  async function guardar() {
    const limpio = limpiar(clave, borrador);
    const ok = await cambiar([{ op: "casilla", clave, valor: vacio(limpio) ? null : limpio }]);
    if (!ok) return;
    setEditando(false);
    onListo?.();
  }

  function cancelar() {
    setEditando(false);
    onListo?.();
  }

  return (
    <section className={cn("space-y-2", !sinTitulo && "rounded-xl border border-line bg-surface p-4", className)}>
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
          <div className="flex items-center gap-2">
            <Button size="sm" variant="primary" loading={guardando} onClick={() => void guardar()}>
              Guardar
            </Button>
            <Button size="sm" variant="secondary" onClick={cancelar}>
              Cancelar
            </Button>
          </div>
        </div>
      ) : valor !== undefined ? (
        <Vista clave={clave} valor={valor} />
      ) : (
        <p className="text-sm text-fg-muted">Sin completar.</p>
      )}

      <Propuestas items={pendientes} />
    </section>
  );
}
