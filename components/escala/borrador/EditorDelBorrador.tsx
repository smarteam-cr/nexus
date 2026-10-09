"use client";

/**
 * components/escala/borrador/EditorDelBorrador.tsx — el borrador de la escala, con sus mismas vistas
 * (mapa, matriz, por dimensión), donde tocar algo lo EDITA.
 *
 * Tocar un criterio, un nivel o una dimensión abre el panel de la derecha con lo que dice hoy en el
 * borrador: se cambia, se dice por qué y, si salió de un reporte de feedback, se vincula. Cada guardado
 * va a la bitácora. Lo que se edita es la escala GENERAL (la matriz); lo que dice una edición se cambia,
 * por ahora, con el `.md` (lib/escala/datos/editar.ts).
 */
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Alert, Button, Drawer, Field, Input, Select, Textarea } from "@/components/ui";
import { cn } from "@/lib/cn";
import type { ReporteDelAncla } from "@/lib/escala/datos/pantalla";
import { fechaYHora } from "@/lib/escala/datos/reglas";
import { VERIFICACIONES, type Criterio, type Dimension, type MarcaDePerfil, type Nivel, type Verificacion } from "@/lib/escala/documento/tipos";
import type { DatosDeLaVista } from "@/lib/escala/vista";
import VistaDeLaEscala from "../VistaDeLaEscala";
import { Segmentado } from "../piezas";

type PropsDeLaVista = React.ComponentProps<typeof VistaDeLaEscala>;

const MARCAS: MarcaDePerfil[] = ["venta con equipo", "venta sin vendedor", "cliente recurrente", "recompra", "relación continua"];
const ETIQUETA_DE_VERIFICACION: Record<Verificacion, string> = { comprobable: "Comprobable", declarado: "Declarado", evaluado: "Evaluado" };

type Pedido<T> = { ok: true; datos: T } | { ok: false; error: string };

/** Igual que en la pantalla del borrador: una respuesta que no es JSON es que se cerró la sesión. */
async function pedir<T>(url: string, init?: RequestInit): Promise<Pedido<T>> {
  let r: Response;
  try {
    r = await fetch(url, init);
  } catch {
    return { ok: false, error: "No hubo conexión con Nexus. Vuelve a intentarlo." };
  }
  const json = r.headers.get("content-type")?.includes("application/json") ? ((await r.json().catch(() => null)) as unknown) : null;
  if (json === null) return { ok: false, error: "Se cerró tu sesión: vuelve a cargar la página e inicia sesión." };
  if (!r.ok) {
    const j = json as { error?: string; detalle?: string[] };
    return { ok: false, error: [j.error ?? `No se pudo (${r.status}).`, ...(j.detalle ?? [])].join(" ") };
  }
  return { ok: true, datos: json as T };
}

// ── Qué se tocó ───────────────────────────────────────────────────────────────

type Tocado =
  | { tipo: "criterio"; dim: Dimension; nivel: Nivel; criterio: Criterio }
  | { tipo: "nivel"; dim: Dimension; nivel: Nivel }
  | { tipo: "dimension"; dim: Dimension };

function resolver(datos: DatosDeLaVista, ancla: string): Tocado | null {
  for (const dim of datos.area.dimensiones) {
    if (dim.id === ancla) return { tipo: "dimension", dim };
    for (const nivel of dim.niveles) {
      if (nivel.id === ancla) return { tipo: "nivel", dim, nivel };
      const criterio = nivel.criterios.find((c) => c.id === ancla);
      if (criterio) return { tipo: "criterio", dim, nivel, criterio };
    }
  }
  return null;
}

// ── Los campos de un criterio ─────────────────────────────────────────────────

interface CamposDelCriterio {
  texto: string;
  verificacion: Verificacion;
  riesgo: boolean;
  habito: boolean;
  perfil: MarcaDePerfil | null;
  requiere: string;
}

const camposDe = (c: Criterio | null): CamposDelCriterio => ({
  texto: c?.texto ?? "",
  verificacion: c?.verificacion ?? "declarado",
  riesgo: c?.riesgo ?? false,
  habito: c?.habito ?? false,
  perfil: c?.perfil ?? null,
  requiere: (c?.requiere ?? []).join(", "),
});

function FormularioDelCriterio({ valor, onCambio }: { valor: CamposDelCriterio; onCambio: (v: CamposDelCriterio) => void }) {
  const poner = (parcial: Partial<CamposDelCriterio>) => onCambio({ ...valor, ...parcial });
  return (
    <div className="flex flex-col gap-4">
      <Field label="Texto">
        <Textarea value={valor.texto} onChange={(e) => poner({ texto: e.target.value })} rows={4} />
      </Field>
      <Field label="Cómo se verifica">
        <Segmentado
          etiqueta="Cómo se verifica"
          opciones={VERIFICACIONES.map((v) => ({ clave: v, etiqueta: ETIQUETA_DE_VERIFICACION[v] }))}
          valor={valor.verificacion}
          onCambio={(v) => poner({ verificacion: v })}
        />
      </Field>
      <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-fg">
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={valor.riesgo} onChange={(e) => poner({ riesgo: e.target.checked })} />
          Es de riesgo
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={valor.habito} onChange={(e) => poner({ habito: e.target.checked })} />
          Es un hábito
        </label>
      </div>
      <Field label="A qué perfil aplica" hint="Sin marca, aplica a todos.">
        <Select value={valor.perfil ?? ""} onChange={(e) => poner({ perfil: (e.target.value || null) as MarcaDePerfil | null })}>
          <option value="">A todos</option>
          {MARCAS.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Requiere" hint="Los criterios que necesita para poder cumplirse, separados por coma (1.5.F1, 1.6.F2).">
        <Input value={valor.requiere} onChange={(e) => poner({ requiere: e.target.value })} />
      </Field>
    </div>
  );
}

const paraEnviar = (c: CamposDelCriterio) => ({ ...c, requiere: c.requiere.split(",").map((x) => x.trim()).filter(Boolean) });

// ── El panel ──────────────────────────────────────────────────────────────────

function Formulario({ tocado, nombreDelNivel, revision, onListo }: { tocado: Tocado; nombreDelNivel: (l: string) => string; revision: number; onListo: () => void }) {
  const router = useRouter();
  const [criterio, setCriterio] = useState(camposDe(tocado.tipo === "criterio" ? tocado.criterio : null));
  const [nivel, setNivel] = useState(tocado.tipo === "nivel" ? { frase: tocado.nivel.descripcion, resultado: tocado.nivel.resultado ?? "" } : null);
  const [dim, setDim] = useState(
    tocado.tipo === "dimension"
      ? { nombre: tocado.dim.nombre, pregunta: tocado.dim.pregunta, descripcion: tocado.dim.descripcion ?? "", costoDeQuedarse: tocado.dim.costoDeQuedarse }
      : null,
  );
  /** En un nivel: agregarle un criterio en vez de cambiar su frase. */
  const [nuevo, setNuevo] = useState<CamposDelCriterio | null>(null);
  const [nota, setNota] = useState("");
  const [reportes, setReportes] = useState<ReporteDelAncla[] | null>(null);
  const [sinReportes, setSinReportes] = useState<string | null>(null);
  const [feedbackId, setFeedbackId] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ancla = tocado.tipo === "criterio" ? tocado.criterio.id : tocado.tipo === "nivel" ? tocado.nivel.id : tocado.dim.id;
  useEffect(() => {
    let vivo = true;
    void pedir<{ reportes: ReporteDelAncla[] }>(`/api/escala/borrador/reportes?ancla=${encodeURIComponent(ancla)}`).then((r) => {
      if (!vivo) return;
      if (r.ok) setReportes(r.datos.reportes);
      else setSinReportes(`No se pudo ver el feedback: ${r.error}`);
    });
    return () => {
      vivo = false;
    };
  }, [ancla]);

  const guardar = async () => {
    const cambio =
      nuevo && tocado.tipo === "nivel"
        ? { tipo: "nuevo-criterio", nivel: tocado.nivel.id, ...paraEnviar(nuevo) }
        : tocado.tipo === "criterio"
          ? { tipo: "criterio", id: tocado.criterio.id, ...paraEnviar(criterio) }
          : tocado.tipo === "nivel"
            ? { tipo: "nivel", id: tocado.nivel.id, frase: nivel!.frase, resultado: nivel!.resultado.trim() || null }
            : { tipo: "dimension", id: tocado.dim.id, ...dim!, descripcion: dim!.descripcion.trim() || null };
    setGuardando(true);
    setError(null);
    const r = await pedir<{ cambios: number; id: string }>("/api/escala/borrador/cambio", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ revision, cambio, nota: nota.trim() || null, feedbackId }),
    });
    setGuardando(false);
    if (!r.ok) return setError(r.error);
    if (r.datos.cambios === 0) return setError("No cambiaste nada: el borrador ya dice eso.");
    router.refresh();
    onListo();
  };

  const titulo =
    tocado.tipo === "criterio"
      ? `Criterio ${tocado.criterio.id} · ${nombreDelNivel(tocado.nivel.letra)}`
      : tocado.tipo === "nivel"
        ? `${tocado.dim.id} ${tocado.dim.nombre} · ${nombreDelNivel(tocado.nivel.letra)}`
        : `Dimensión ${tocado.dim.id}`;

  return (
    <div className="flex flex-col gap-5">
      <p className="text-sm font-semibold text-fg">{titulo}</p>

      {tocado.tipo === "criterio" && <FormularioDelCriterio valor={criterio} onCambio={setCriterio} />}

      {tocado.tipo === "nivel" && nivel && !nuevo && (
        <div className="flex flex-col gap-4">
          <Field label="Frase del nivel">
            <Textarea value={nivel.frase} onChange={(e) => setNivel({ ...nivel, frase: e.target.value })} rows={3} />
          </Field>
          {tocado.nivel.letra !== "D" && tocado.nivel.letra !== "I" && (
            <Field label="Resultado" hint="Lo que el cliente consigue al llegar a este nivel.">
              <Textarea value={nivel.resultado} onChange={(e) => setNivel({ ...nivel, resultado: e.target.value })} rows={3} />
            </Field>
          )}
          <div>
            <Button size="sm" onClick={() => setNuevo(camposDe(null))}>
              Agregar un criterio a este nivel
            </Button>
          </div>
        </div>
      )}

      {tocado.tipo === "nivel" && nuevo && (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-fg-secondary">
            Criterio nuevo en {nombreDelNivel(tocado.nivel.letra)}. Nexus le da el número que sigue (sin repetir uno retirado).
          </p>
          <FormularioDelCriterio valor={nuevo} onCambio={setNuevo} />
          <div>
            <Button size="sm" variant="link" onClick={() => setNuevo(null)}>
              Mejor cambiar la frase del nivel
            </Button>
          </div>
        </div>
      )}

      {tocado.tipo === "dimension" && dim && (
        <div className="flex flex-col gap-4">
          <Field label="Nombre">
            <Input value={dim.nombre} onChange={(e) => setDim({ ...dim, nombre: e.target.value })} />
          </Field>
          <Field label="Pregunta">
            <Textarea value={dim.pregunta} onChange={(e) => setDim({ ...dim, pregunta: e.target.value })} rows={2} />
          </Field>
          <Field label="Descripción" hint="Qué mide, en una línea. Opcional.">
            <Textarea value={dim.descripcion} onChange={(e) => setDim({ ...dim, descripcion: e.target.value })} rows={2} />
          </Field>
          <Field label="Costo de quedarse">
            <Textarea value={dim.costoDeQuedarse} onChange={(e) => setDim({ ...dim, costoDeQuedarse: e.target.value })} rows={3} />
          </Field>
        </div>
      )}

      <section aria-label="Reportes de feedback" className="flex flex-col gap-2 border-t border-line pt-4">
        <h3 className="text-sm font-semibold text-fg">Feedback sobre esto</h3>
        {sinReportes ? (
          <p className="text-xs text-fg-muted">{sinReportes}</p>
        ) : reportes === null ? (
          <p className="text-xs text-fg-muted">Buscando…</p>
        ) : reportes.length === 0 ? (
          <p className="text-xs text-fg-muted">Nadie mandó feedback sobre esto.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {reportes.map((r) => (
              <li key={r.id}>
                <label className={cn("flex cursor-pointer gap-2 rounded-lg border p-2.5 text-sm", feedbackId === r.id ? "border-info-line bg-info-surface" : "border-line")}>
                  <input type="checkbox" className="mt-1" checked={feedbackId === r.id} onChange={(e) => setFeedbackId(e.target.checked ? r.id : null)} />
                  <span className="flex flex-col gap-0.5">
                    <span className="text-xs text-fg-muted">
                      F-{r.numero} · {r.tipo} · {r.autorEmail} · {fechaYHora(r.creadoEn)}
                    </span>
                    <span className="text-fg-secondary">{r.cuerpo.length > 280 ? `${r.cuerpo.slice(0, 280)}…` : r.cuerpo}</span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        )}
        {reportes && reportes.length > 0 && <p className="text-xs text-fg-muted">Marca el reporte que origina este cambio: queda vinculado en la bitácora.</p>}
      </section>

      <Field label="Por qué (opcional)" hint="Queda en la bitácora junto al cambio.">
        <Textarea value={nota} onChange={(e) => setNota(e.target.value)} rows={2} maxLength={500} />
      </Field>

      {error && <Alert variant="danger">{error}</Alert>}

      <div className="flex gap-2">
        <Button variant="primary" onClick={guardar} loading={guardando}>
          Guardar en el borrador
        </Button>
        <Button onClick={onListo}>Cancelar</Button>
      </div>
    </div>
  );
}

function PanelDeEdicion({ ancla, datos, revision, onCerrar }: { ancla: string | null; datos: DatosDeLaVista; revision: number; onCerrar: () => void }) {
  const tocado = ancla ? resolver(datos, ancla) : null;
  const nombreDelNivel = (l: string) => datos.niveles.find((n) => n.letra === l)?.nombre ?? l;
  return (
    <Drawer open={!!ancla} onClose={onCerrar} title="Editar el borrador" size="md">
      {datos.edicion ? (
        <Alert variant="info" title={`Estás viendo la edición «${datos.edicion.nombre}»`}>
          El editor cambia la escala general. Lo que dice una edición se cambia, por ahora, con el .md del borrador. Elige «General» en la industria
          para editar.
        </Alert>
      ) : tocado ? (
        <Formulario key={ancla} tocado={tocado} nombreDelNivel={nombreDelNivel} revision={revision} onListo={onCerrar} />
      ) : (
        <p className="text-sm text-fg-muted">Eso no se edita desde aquí.</p>
      )}
    </Drawer>
  );
}

// ── La pantalla ───────────────────────────────────────────────────────────────

export default function EditorDelBorrador({
  version,
  revision,
  ...vista
}: Omit<PropsDeLaVista, "editor" | "borrador" | "hrefDeArea" | "hrefDeLaBandeja"> & { version: string; revision: number }) {
  const [abierta, setAbierta] = useState<string | null>(null);
  const editor = useMemo(() => ({ version, alTocar: setAbierta, hrefDeVuelta: "/escala/borrador" }), [version]);
  return (
    <>
      <VistaDeLaEscala {...vista} editor={editor} hrefDeArea={(slug) => `/escala/borrador/${slug}`} />
      <PanelDeEdicion ancla={abierta} datos={vista.datos} revision={revision} onCerrar={() => setAbierta(null)} />
    </>
  );
}
