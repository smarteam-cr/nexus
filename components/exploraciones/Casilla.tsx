"use client";

/**
 * Casilla — una casilla del lienzo: lo confirmado, el editor y lo que propuso el agente para ella.
 *
 * Se edita entera («Editar» → «Guardar»): una casilla es una idea completa (las metas, quién decide)
 * y guardarla a medias en cada tecla dejaría versiones raras en la historia. Lo propuesto se usa o
 * se descarta desde la propia casilla.
 */
import { useState } from "react";
import { Badge, Button, Input, Segmentado, Select, Textarea } from "@/components/ui";
import {
  definicionDe,
  ETIQUETA_DEL_ROL,
  metaEnCifras,
  ROLES_EN_LA_DECISION,
  type Apertura,
  type ClaveDeCasilla,
  type Meta,
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

function EditorDeLista({ valor, onCambio, placeholder }: { valor: string[]; onCambio: (v: string[]) => void; placeholder: string }) {
  const filas = valor.length ? valor : [""];
  return (
    <div className="space-y-2">
      {filas.map((t, i) => (
        <div key={i} className="flex gap-2">
          <Input value={t} placeholder={placeholder} onChange={(e) => onCambio(filas.map((x, j) => (j === i ? e.target.value : x)))} />
          <Button size="sm" variant="destructive" aria-label="Quitar" onClick={() => onCambio(filas.filter((_, j) => j !== i))}>
            Quitar
          </Button>
        </div>
      ))}
      <Button size="xs" variant="ghost" onClick={() => onCambio([...filas, ""])}>
        Agregar otra
      </Button>
    </div>
  );
}

function Editor({ clave, borrador, setBorrador }: { clave: ClaveDeCasilla; borrador: unknown; setBorrador: (v: unknown) => void }) {
  const { escala, exp } = useLienzo();
  const tipo = definicionDe(clave).tipo;
  const dimsEnJuego = escala.areas.filter((a) => exp.estado.areas.includes(a.id)).flatMap((a) => a.dimensiones.filter((d) => d.aplica));

  switch (tipo) {
    case "texto":
      return <Textarea rows={4} value={(borrador as string) ?? ""} onChange={(e) => setBorrador(e.target.value)} />;
    case "lista":
      return <EditorDeLista valor={(borrador as string[]) ?? []} onCambio={setBorrador} placeholder="Una idea por línea" />;
    case "metas": {
      const metas = ((borrador as Meta[]) ?? []).length ? (borrador as Meta[]) : [{ que: "" }];
      const set = (i: number, campo: keyof Meta, v: string) => setBorrador(metas.map((m, j) => (j === i ? { ...m, [campo]: v } : m)));
      return (
        <div className="space-y-3">
          {metas.map((m, i) => (
            <div key={i} className="grid gap-2 rounded-lg border border-line p-2.5 sm:grid-cols-[2fr_1fr_1fr_1fr_auto]">
              <Input value={m.que} placeholder="Qué quiere lograr" aria-label="Qué quiere lograr" onChange={(e) => set(i, "que", e.target.value)} />
              <Input value={m.actual ?? ""} placeholder="Hoy (cifra)" aria-label="De cuánto parte" onChange={(e) => set(i, "actual", e.target.value)} />
              <Input value={m.objetivo ?? ""} placeholder="Meta (cifra)" aria-label="A cuánto quiere llegar" onChange={(e) => set(i, "objetivo", e.target.value)} />
              <Input value={m.para ?? ""} placeholder="Para cuándo" aria-label="Para cuándo" onChange={(e) => set(i, "para", e.target.value)} />
              <Button size="sm" variant="destructive" onClick={() => setBorrador(metas.filter((_, j) => j !== i))}>
                Quitar
              </Button>
            </div>
          ))}
          <Button size="xs" variant="ghost" onClick={() => setBorrador([...metas, { que: "" }])}>
            Agregar otra meta
          </Button>
        </div>
      );
    }
    case "retos": {
      const retos = ((borrador as Reto[]) ?? []).length ? (borrador as Reto[]) : [{ texto: "" }];
      return (
        <div className="space-y-2">
          {retos.map((r, i) => (
            <div key={i} className="grid gap-2 sm:grid-cols-[2fr_1fr_auto]">
              <Input value={r.texto} placeholder="Qué los frena" aria-label="Reto" onChange={(e) => setBorrador(retos.map((x, j) => (j === i ? { ...x, texto: e.target.value } : x)))} />
              <Select
                aria-label="Dimensión de la escala"
                value={r.dimensionId ?? ""}
                onChange={(e) => setBorrador(retos.map((x, j) => (j === i ? { ...x, dimensionId: e.target.value || undefined } : x)))}
              >
                <option value="">Sin dimensión</option>
                {dimsEnJuego.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.nombre}
                  </option>
                ))}
              </Select>
              <Button size="sm" variant="destructive" onClick={() => setBorrador(retos.filter((_, j) => j !== i))}>
                Quitar
              </Button>
            </div>
          ))}
          <Button size="xs" variant="ghost" onClick={() => setBorrador([...retos, { texto: "" }])}>
            Agregar otro reto
          </Button>
        </div>
      );
    }
    case "autoridad": {
      const personas = ((borrador as Persona[]) ?? []).length ? (borrador as Persona[]) : [{ nombre: "", rol: "decide" as const }];
      const set = (i: number, cambio: Partial<Persona>) => setBorrador(personas.map((p, j) => (j === i ? { ...p, ...cambio } : p)));
      return (
        <div className="space-y-3">
          {personas.map((p, i) => (
            <div key={i} className="grid gap-2 rounded-lg border border-line p-2.5 sm:grid-cols-[1.2fr_1fr_0.9fr_1.6fr_auto]">
              <Input value={p.nombre} placeholder="Nombre" aria-label="Nombre" onChange={(e) => set(i, { nombre: e.target.value })} />
              <Input value={p.cargo ?? ""} placeholder="Cargo" aria-label="Cargo" onChange={(e) => set(i, { cargo: e.target.value })} />
              <Select aria-label="Papel en la decisión" value={p.rol} onChange={(e) => set(i, { rol: e.target.value as Persona["rol"] })}>
                {ROLES_EN_LA_DECISION.map((r) => (
                  <option key={r} value={r}>
                    {ETIQUETA_DEL_ROL[r]}
                  </option>
                ))}
              </Select>
              <Input value={p.nota ?? ""} placeholder="Cómo le afecta, qué le preocupa" aria-label="Nota" onChange={(e) => set(i, { nota: e.target.value })} />
              <Button size="sm" variant="destructive" onClick={() => setBorrador(personas.filter((_, j) => j !== i))}>
                Quitar
              </Button>
            </div>
          ))}
          <Button size="xs" variant="ghost" onClick={() => setBorrador([...personas, { nombre: "", rol: "afectado" }])}>
            Agregar otra persona
          </Button>
        </div>
      );
    }
    case "siguientePaso": {
      const s = (borrador as SiguientePaso) ?? { que: "" };
      return (
        <div className="grid gap-2 sm:grid-cols-[2fr_1fr_1.5fr]">
          <Input value={s.que} placeholder="Qué sigue" aria-label="Qué sigue" onChange={(e) => setBorrador({ ...s, que: e.target.value })} />
          <Input type="date" value={s.fecha ?? ""} aria-label="Fecha" onChange={(e) => setBorrador({ ...s, fecha: e.target.value || undefined })} />
          <Input value={s.conQuien ?? ""} placeholder="Con quién" aria-label="Con quién" onChange={(e) => setBorrador({ ...s, conQuien: e.target.value })} />
        </div>
      );
    }
    case "apertura": {
      const a = (borrador as Apertura) ?? null;
      return (
        <div className="space-y-2">
          <Segmentado etiqueta="Apertura a la asesoría" opciones={APERTURA} valor={a?.valor ?? null} onCambio={(v) => setBorrador({ ...(a ?? {}), valor: v })} />
          <Input value={a?.porQue ?? ""} placeholder="Por qué lo dices" aria-label="Por qué" onChange={(e) => setBorrador({ ...(a ?? { valor: "no_se" }), porQue: e.target.value })} />
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

export function Casilla({ clave, className }: { clave: ClaveDeCasilla; className?: string }) {
  const { exp, cambiar, puedeEditar, guardando, pendientesPara } = useLienzo();
  const def = definicionDe(clave);
  const valor = exp.estado.contenido.casillas[clave] as ValoresDeCasillas[typeof clave] | undefined;
  const pendientes = pendientesPara((d) => d.tipo === "casilla" && d.clave === clave);
  const [editando, setEditando] = useState(false);
  const [borrador, setBorrador] = useState<unknown>(valor);

  async function guardar() {
    const limpio = limpiar(clave, borrador);
    const ok = await cambiar([{ op: "casilla", clave, valor: vacio(limpio) ? null : limpio }]);
    if (ok) setEditando(false);
  }

  return (
    <section className={cn("space-y-2 rounded-xl border border-line bg-surface p-4", className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-fg">{def.etiqueta}</h3>
          <p className="text-xs text-fg-muted">{def.ayuda}</p>
        </div>
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
            <Button size="sm" variant="secondary" onClick={() => setEditando(false)}>
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
