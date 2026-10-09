"use client";

/**
 * components/escala/borrador/PantallaDelBorrador.tsx — el borrador de la próxima versión de la escala.
 *
 * Para los super admin (docs/escala/plan-escala-como-datos.md, etapa «El borrador en Nexus»):
 *   · Sin borrador: abrirlo desde la versión publicada.
 *   · Con borrador: bajar su `.md`, subirlo con cambios (antes de guardar se ve qué cambió, criterio
 *     por criterio), revisarlo con las pruebas de siempre y publicarlo, o descartarlo.
 *   · La bitácora: cada cambio con quién, cuándo, por qué y el antes y el después.
 *
 * Lo que se edita es la escala que ve todo el equipo y la que se usa con los clientes: nada se guarda
 * sin mostrar antes qué cambia, y publicar pide confirmación.
 */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Alert, Badge, Button, buttonVariants, Card, ConfirmDialog, Field, Input, PageHeader, Textarea } from "@/components/ui";
import { cn } from "@/lib/cn";
import type { CambioParaMostrar, EstadoDelBorrador, ResumenDelBorrador, TandaDeLaBitacora } from "@/lib/escala/datos/pantalla";
import { fechaYHora } from "@/lib/escala/datos/reglas";
import type { RevisionDelBorrador } from "@/lib/escala/datos/publicar";

type Revision = RevisionDelBorrador & { revisionDelBorrador: number };
interface Subida {
  nombre: string;
  texto: string;
  cambios: CambioParaMostrar[];
  resumen: string;
}

/** La escala pesa más de medio mega: viaja comprimida (nginx corta los cuerpos en 1 MB). */
async function comprimido(cuerpo: unknown): Promise<ArrayBuffer> {
  const flujo = new Blob([JSON.stringify(cuerpo)]).stream().pipeThrough(new CompressionStream("gzip"));
  return new Response(flujo).arrayBuffer();
}

/**
 * Pide algo a las rutas del borrador. Una respuesta que no es JSON es el inicio de sesión (la sesión se
 * cerró y el middleware redirige): se dice así, en vez de reventar al leerla.
 */
async function pedir<T>(url: string, init?: RequestInit): Promise<{ ok: true; datos: T } | { ok: false; error: string }> {
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

// ── Un cambio ─────────────────────────────────────────────────────────────────

const ROTULO_DE_ACCION: Record<CambioParaMostrar["accion"], { texto: string; variante: "success" | "destructive" | "info" }> = {
  agregado: { texto: "Nuevo", variante: "success" },
  quitado: { texto: "Quitado", variante: "destructive" },
  cambiado: { texto: "Cambió", variante: "info" },
};

function FilaDeCambio({ c }: { c: CambioParaMostrar }) {
  const rotulo = ROTULO_DE_ACCION[c.accion];
  return (
    <li className="flex flex-col gap-1 border-t border-line py-2.5 first:border-t-0">
      <div className="flex flex-wrap items-baseline gap-2">
        <Badge variant={rotulo.variante}>{rotulo.texto}</Badge>
        <span className="text-sm font-medium text-fg">{c.donde}</span>
        {c.campo && <span className="text-xs text-fg-muted">· {c.campo}</span>}
      </div>
      {c.accion === "cambiado" ? (
        <div className="grid gap-1 text-[13px] leading-relaxed sm:grid-cols-[4.5rem_minmax(0,1fr)]">
          <span className="text-xs font-semibold text-fg-muted">Antes</span>
          <span className="whitespace-pre-line text-fg-muted">{c.antes ?? "—"}</span>
          <span className="text-xs font-semibold text-fg-muted">Ahora</span>
          <span className="whitespace-pre-line text-fg">{c.despues ?? "—"}</span>
        </div>
      ) : (
        <p className={cn("whitespace-pre-line text-[13px] leading-relaxed", c.accion === "quitado" ? "text-fg-muted line-through" : "text-fg")}>
          {c.accion === "quitado" ? c.antes : c.despues}
        </p>
      )}
    </li>
  );
}

function ListaDeCambios({ cambios, tope = 200 }: { cambios: CambioParaMostrar[]; tope?: number }) {
  return (
    <ul className="flex flex-col">
      {cambios.slice(0, tope).map((c, i) => (
        <FilaDeCambio key={`${c.ancla}:${c.campo}:${i}`} c={c} />
      ))}
      {cambios.length > tope && <li className="pt-2 text-xs text-fg-muted">… y {cambios.length - tope} más.</li>}
    </ul>
  );
}

// ── Sin borrador ──────────────────────────────────────────────────────────────

function AbrirBorrador({ publicada, sugerida }: { publicada: string | null; sugerida: string }) {
  const router = useRouter();
  const [version, setVersion] = useState(sugerida);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const abrir = async () => {
    setOcupado(true);
    setError(null);
    const r = await pedir("/api/escala/borrador", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ version: version.trim() }) });
    setOcupado(false);
    if (!r.ok) return setError(r.error);
    router.refresh();
  };

  if (!publicada) {
    return (
      <Alert variant="warning" title="Todavía no hay ninguna versión de la escala como datos">
        Hay que pasar la versión publicada a datos una vez (`scripts/escala-datos.ts migrar`). Después se abre el borrador desde aquí.
      </Alert>
    );
  }
  return (
    <Card className="flex max-w-2xl flex-col gap-4 p-5">
      <div>
        <h2 className="text-base font-semibold text-fg">No hay ningún borrador abierto</h2>
        <p className="mt-1 text-sm leading-relaxed text-fg-secondary">
          La versión publicada es la {publicada}. El borrador arranca igual a ella; lo que le cambies queda anotado, y nadie más lo ve hasta que se publica.
        </p>
      </div>
      <Field label="Versión nueva" hint="Sube el número del medio si cambia el contenido; el último, si solo se arregla la forma." error={error}>
        <Input value={version} onChange={(e) => setVersion(e.target.value)} className="max-w-40" inputMode="decimal" />
      </Field>
      <div>
        <Button variant="primary" onClick={abrir} loading={ocupado} disabled={!/^\d+\.\d+\.\d+$/.test(version.trim())}>
          Abrir el borrador
        </Button>
      </div>
    </Card>
  );
}

// ── Revisar y publicar ────────────────────────────────────────────────────────

function PanelParaPublicar({ revision, edicionesRevisadas, onRevisadas, onPublicar, publicando }: {
  revision: Revision;
  edicionesRevisadas: boolean;
  onRevisadas: (v: boolean) => void;
  onPublicar: () => void;
  publicando: boolean;
}) {
  const c = revision.cambios;
  return (
    <Card className="flex flex-col gap-4 p-5">
      <div>
        <h2 className="text-base font-semibold text-fg">Antes de publicar la {revision.version}</h2>
        <p className="mt-1 text-sm text-fg-secondary">Las mismas pruebas que corre el script de siempre, más lo que cambia contra la versión publicada.</p>
      </div>

      <section aria-label="Pruebas" className="flex flex-col gap-1.5">
        {revision.pruebas.map((p) => (
          <div key={p.nombre} className="flex flex-col gap-0.5">
            <span className={cn("text-sm font-medium", p.ok ? "text-success-ink" : "text-danger-ink")}>
              {p.ok ? "✓" : "✗"} {p.nombre}
            </span>
            {!p.ok && (
              <ul className="ml-5 list-disc text-xs leading-relaxed text-fg-secondary">
                {p.detalle.slice(0, 8).map((d, i) => (
                  <li key={i}>{d}</li>
                ))}
                {p.detalle.length > 8 && <li>… y {p.detalle.length - 8} más.</li>}
              </ul>
            )}
          </div>
        ))}
      </section>

      {c && (
        <section aria-label="Qué cambia" className="text-sm text-fg-secondary">
          <h3 className="text-sm font-semibold text-fg">Qué cambia contra la {revision.contra}</h3>
          <p className="mt-1">
            {c.nuevos.length} nuevos · {c.retirados.length} retirados · {c.cambiados.length} con otro texto · {c.conOtrosRequeridos.length} con otros requeridos
          </p>
          {c.retirados.length > 0 && <p className="mt-1 text-xs">Retirados: {c.retirados.join(", ")}</p>}
        </section>
      )}

      {revision.edicionesViejas.length > 0 && (
        <Alert variant="warning" title="Textos de las ediciones que pueden haber quedado viejos">
          <p>El texto general de estos criterios cambió y la edición los dice con sus palabras sin que se tocaran:</p>
          <ul className="mt-1 list-disc pl-5">
            {revision.edicionesViejas.map((e) => (
              <li key={e.nombre}>
                {e.nombre}: {e.ids.join(", ")}
              </li>
            ))}
          </ul>
          <label className="mt-2 flex items-center gap-2 text-sm font-medium">
            <input type="checkbox" checked={edicionesRevisadas} onChange={(e) => onRevisadas(e.target.checked)} />
            Los miré y siguen diciendo lo mismo
          </label>
        </Alert>
      )}

      {revision.avisos.length > 0 && (
        <Alert variant="info" title="El mapa de herramientas nombra criterios que esta versión no tiene">
          <ul className="list-disc pl-5">
            {revision.avisos.slice(0, 10).map((a, i) => (
              <li key={i}>{a}</li>
            ))}
          </ul>
          <p className="mt-1">No frena: la pantalla los ignora hasta que se publique un mapa nuevo.</p>
        </Alert>
      )}

      {revision.bloqueos.length > 0 && (
        <Alert variant="danger" title="Todavía no se puede publicar">
          <ul className="list-disc pl-5">
            {revision.bloqueos.map((b, i) => (
              <li key={i}>{b}</li>
            ))}
          </ul>
        </Alert>
      )}

      <div>
        <Button variant="primary" onClick={onPublicar} loading={publicando} disabled={revision.bloqueos.length > 0}>
          Publicar la {revision.version}
        </Button>
      </div>
    </Card>
  );
}

// ── Con borrador ──────────────────────────────────────────────────────────────

function ConBorrador({ borrador, bitacora, hrefDelEditor }: { borrador: ResumenDelBorrador; bitacora: TandaDeLaBitacora[]; hrefDelEditor: string | null }) {
  const router = useRouter();
  const archivo = useRef<HTMLInputElement>(null);
  const [ocupado, setOcupado] = useState<null | "subir" | "guardar" | "revisar" | "publicar" | "descartar">(null);
  const [error, setError] = useState<string | null>(null);
  const [subida, setSubida] = useState<Subida | null>(null);
  const [nota, setNota] = useState("");
  const [revision, setRevision] = useState<Revision | null>(null);
  const [edicionesRevisadas, setEdicionesRevisadas] = useState(false);
  const [confirmar, setConfirmar] = useState<null | "publicar" | "descartar">(null);

  const alElegir = async (f: File | undefined) => {
    if (!f) return;
    setOcupado("subir");
    setError(null);
    setRevision(null);
    const texto = await f.text();
    const r = await pedir<{ cambios: CambioParaMostrar[]; resumen: string }>("/api/escala/borrador/importar", {
      method: "POST",
      headers: { "Content-Type": "application/gzip" },
      body: await comprimido({ texto, revision: borrador.revision, guardar: false }),
    });
    setOcupado(null);
    if (archivo.current) archivo.current.value = "";
    if (!r.ok) return setError(r.error);
    setSubida({ nombre: f.name, texto, ...r.datos });
  };

  const guardar = async () => {
    if (!subida) return;
    setOcupado("guardar");
    setError(null);
    const r = await pedir("/api/escala/borrador/importar", {
      method: "POST",
      headers: { "Content-Type": "application/gzip" },
      body: await comprimido({ texto: subida.texto, revision: borrador.revision, nota: nota.trim() || null, guardar: true }),
    });
    setOcupado(null);
    if (!r.ok) return setError(r.error);
    setSubida(null);
    setNota("");
    router.refresh();
  };

  const revisar = async (revisadas = edicionesRevisadas) => {
    setOcupado("revisar");
    setError(null);
    setSubida(null);
    const r = await pedir<Revision>(`/api/escala/borrador/publicar${revisadas ? "?edicionesRevisadas=1" : ""}`);
    setOcupado(null);
    if (!r.ok) return setError(r.error);
    setRevision(r.datos);
  };

  const publicar = async () => {
    setOcupado("publicar");
    setError(null);
    const r = await pedir("/api/escala/borrador/publicar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ revision: borrador.revision, edicionesRevisadas }),
    });
    setOcupado(null);
    setConfirmar(null);
    if (!r.ok) return setError(r.error);
    router.push("/escala");
    router.refresh();
  };

  const descartar = async () => {
    setOcupado("descartar");
    const r = await pedir("/api/escala/borrador", { method: "DELETE" });
    setOcupado(null);
    setConfirmar(null);
    if (!r.ok) return setError(r.error);
    router.refresh();
  };

  return (
    <div className="flex flex-col gap-5">
      <Card className="flex flex-col gap-4 p-5">
        <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1 text-sm text-fg-secondary">
          <span>
            Sale de la <strong className="font-semibold text-fg">{borrador.basadaEn ?? "—"}</strong>
          </span>
          <span>
            <strong className="font-semibold text-fg">{borrador.totalDeCambios}</strong> {borrador.totalDeCambios === 1 ? "cambio anotado" : "cambios anotados"}
          </span>
          <span>
            Último cambio: {fechaYHora(borrador.actualizadaEn)}
            {borrador.actualizadaPorEmail ? ` · ${borrador.actualizadaPorEmail}` : ""}
          </span>
        </div>
        <p className="text-sm leading-relaxed text-fg-secondary">
          Para cambiar la escala: edítala sobre la escala misma (tocas un criterio, un nivel o una dimensión), o baja el .md, edítalo y súbelo; antes de
          guardar ves qué cambió, criterio por criterio.
        </p>
        <div className="flex flex-wrap gap-2">
          {hrefDelEditor && (
            <Link href={hrefDelEditor} className={buttonVariants({ variant: "ghost" })}>
              Editar sobre la escala
            </Link>
          )}
          {/* Una descarga, no una página: la misma forma que «Descargar .md» de la escala. */}
          <Button
            onClick={() => {
              window.location.href = "/api/escala/borrador/md";
            }}
          >
            Bajar el .md
          </Button>
          <Button onClick={() => archivo.current?.click()} loading={ocupado === "subir"}>
            Subir el .md con cambios
          </Button>
          <input ref={archivo} type="file" accept=".md,text/markdown,text/plain" className="hidden" onChange={(e) => alElegir(e.target.files?.[0])} />
          <Button variant="primary" onClick={() => revisar()} loading={ocupado === "revisar"}>
            Revisar y publicar
          </Button>
          <Button variant="destructive" onClick={() => setConfirmar("descartar")}>
            Descartar el borrador
          </Button>
        </div>
      </Card>

      {error && (
        <Alert variant="danger" onDismiss={() => setError(null)}>
          {error}
        </Alert>
      )}

      {subida && (
        <Card className="flex flex-col gap-4 p-5">
          <div>
            <h2 className="text-base font-semibold text-fg">Lo que cambia con «{subida.nombre}»</h2>
            <p className="mt-1 text-sm text-fg-secondary">{subida.cambios.length ? subida.resumen : "El archivo dice lo mismo que el borrador: no hay nada que guardar."}</p>
          </div>
          {subida.cambios.length > 0 && (
            <>
              <ListaDeCambios cambios={subida.cambios} />
              <Field label="Por qué (opcional)" hint="Queda en la bitácora junto a estos cambios.">
                <Textarea value={nota} onChange={(e) => setNota(e.target.value)} rows={2} maxLength={500} />
              </Field>
            </>
          )}
          <div className="flex gap-2">
            {subida.cambios.length > 0 && (
              <Button variant="primary" onClick={guardar} loading={ocupado === "guardar"}>
                Guardar en el borrador
              </Button>
            )}
            <Button onClick={() => setSubida(null)}>{subida.cambios.length ? "Cancelar" : "Cerrar"}</Button>
          </div>
        </Card>
      )}

      {revision && (
        <PanelParaPublicar
          revision={revision}
          edicionesRevisadas={edicionesRevisadas}
          onRevisadas={(v) => {
            setEdicionesRevisadas(v);
            void revisar(v);
          }}
          onPublicar={() => setConfirmar("publicar")}
          publicando={ocupado === "publicar"}
        />
      )}

      <section aria-label="Lo que cambió en el borrador" className="flex flex-col gap-3">
        <h2 className="text-base font-semibold text-fg">Lo que cambió en el borrador</h2>
        {bitacora.length === 0 ? (
          <p className="text-sm text-fg-muted">Todavía nada: el borrador dice lo mismo que la {borrador.basadaEn}.</p>
        ) : (
          bitacora.map((t, i) => (
            <Card key={`${t.cuando}:${i}`} className="flex flex-col gap-2 p-4">
              <p className="text-xs text-fg-muted">
                {fechaYHora(t.cuando)} · {t.autorEmail} · {t.origen === "importacion" ? "subió un .md" : "desde el editor"} · {t.cambios.length}{" "}
                {t.cambios.length === 1 ? "cambio" : "cambios"}
              </p>
              {t.nota && <p className="text-sm italic text-fg-secondary">«{t.nota}»</p>}
              <ListaDeCambios cambios={t.cambios} tope={60} />
            </Card>
          ))
        )}
      </section>

      <ConfirmDialog
        open={confirmar === "publicar"}
        onCancel={() => setConfirmar(null)}
        onConfirm={publicar}
        loading={ocupado === "publicar"}
        title={`¿Publicar la ${borrador.version}?`}
        description="Pasa a ser la escala que ve todo el equipo y la que se descarga, y queda congelada: lo que cambie después va en un borrador nuevo."
        confirmLabel={`Publicar la ${borrador.version}`}
      />
      <ConfirmDialog
        open={confirmar === "descartar"}
        onCancel={() => setConfirmar(null)}
        onConfirm={descartar}
        loading={ocupado === "descartar"}
        variant="destructive"
        title={`¿Descartar el borrador ${borrador.version}?`}
        description={`Se borran el borrador y sus ${borrador.totalDeCambios} cambios anotados. No tiene vuelta atrás. La versión publicada no cambia.`}
        confirmLabel="Descartar"
      />
    </div>
  );
}

// ── La pantalla ───────────────────────────────────────────────────────────────

export default function PantallaDelBorrador({ estado, hrefDelEditor = null }: { estado: EstadoDelBorrador; hrefDelEditor?: string | null }) {
  const borrador = estado.estado === "ok" ? estado.borrador : null;
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Borrador de la escala"
        crumbs={[{ label: "Escala de Rendimiento", href: "/escala" }, { label: "Borrador" }]}
        badges={borrador ? <Badge variant="warning">Versión {borrador.version} · borrador</Badge> : undefined}
        description="La próxima versión se prepara aquí. Cada cambio queda anotado, y se publica cuando pasa todas las pruebas."
        action={
          <Link href="/escala" className={buttonVariants({ variant: "secondary" })}>
            Ver la publicada
          </Link>
        }
      />
      {estado.estado === "sin-tablas" ? (
        <Alert variant="warning" title="Falta crear las tablas de la escala como datos">
          Corre el SQL scripts/sql/2026-10-08-escala-como-datos.sql y reinicia.
        </Alert>
      ) : borrador ? (
        <ConBorrador borrador={borrador} bitacora={estado.bitacora} hrefDelEditor={hrefDelEditor} />
      ) : (
        <AbrirBorrador publicada={estado.publicada} sugerida={estado.sugerida} />
      )}
    </div>
  );
}
