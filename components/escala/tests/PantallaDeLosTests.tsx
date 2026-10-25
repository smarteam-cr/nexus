"use client";

/**
 * components/escala/tests/PantallaDeLosTests.tsx — los tests del diagnóstico de rendimiento, del lado de Smarteam (área O,
 * 2026-10-26). Tres pestañas:
 *   · Preguntas: cada banco (área × versión × edición) con su estado. El super admin edita el borrador y lo aprueba; lo
 *     aprobado es lo que ve el público, y un borrador con cambios no cambia nada hasta aprobarse. Acá SÍ se ve a qué nivel
 *     apunta cada opción (el público nunca lo ve).
 *   · Intentos: por empresa, quién hizo qué área, con qué nivel y si ya llegó a HubSpot (K10).
 *   · Medición: cuántos empiezan, terminan y lo dejan, y en qué pregunta (O4 y O6).
 */
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Alert, Badge, Button, Card, ConfirmDialog, EmptyState, Field, Input, PageHeader, Tabs, Textarea } from "@/components/ui";
import type { BancoEnPantalla, DatosDeLaPantalla } from "@/lib/tests-diagnostico/admin-server";
import { empresasConTests, estadoEnHubspot, ETIQUETA_DEL_ESTADO, medicionDelTest, type EstadoEnHubspot } from "@/lib/tests-diagnostico/pantalla";
import { ETIQUETA_DE_LA_VERSION, NOMBRE_DEL_AREA, SLUG_POR_AREA, type PreguntaDelBanco } from "@/lib/tests-diagnostico/tipos";

type Pestana = "preguntas" | "intentos" | "medicion";

async function pedir(url: string, init?: RequestInit): Promise<{ ok: true; datos: unknown } | { ok: false; error: string }> {
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
  return { ok: true, datos: json };
}

const fecha = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("es-CR", { day: "numeric", month: "short", year: "numeric" }) : "—");

const VARIANTE_DEL_ESTADO = { "sin-aprobar": "warning", aprobado: "success", "aprobado-con-cambios": "info" } as const;

// ── Un banco ──────────────────────────────────────────────────────────────────

function EditorDelBanco({ banco, datos, editor, alCerrar }: { banco: BancoEnPantalla; datos: DatosDeLaPantalla; editor: boolean; alCerrar: () => void }) {
  const router = useRouter();
  const [preguntas, setPreguntas] = useState<PreguntaDelBanco[]>(banco.preguntas);
  const [problemas, setProblemas] = useState<string[]>(banco.problemas);
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [confirmar, setConfirmar] = useState(false);
  const cambiado = JSON.stringify(preguntas) !== JSON.stringify(banco.preguntas);
  const nombreDelNivel = (l: string) => datos.escala?.niveles.find((n) => n.letra === l)?.nombre ?? l;

  const cambiar = (i: number, cambio: Partial<PreguntaDelBanco>) => setPreguntas((ps) => ps.map((p, k) => (k === i ? { ...p, ...cambio } : p)));
  const cambiarOpcion = (i: number, j: number, texto: string) =>
    setPreguntas((ps) => ps.map((p, k) => (k === i ? { ...p, opciones: p.opciones.map((o, m) => (m === j ? { ...o, texto } : o)) } : p)));

  const guardar = async (): Promise<PreguntaDelBanco[] | null> => {
    setOcupado(true);
    setError(null);
    const r = await pedir(`/api/escala/tests/${banco.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ preguntas }),
    });
    setOcupado(false);
    if (!r.ok) {
      setError(r.error);
      return null;
    }
    const guardado = r.datos as { preguntas: PreguntaDelBanco[]; problemas: string[] };
    // Lo que quedó guardado (textos recortados) es lo que se sigue editando y lo que se aprueba.
    setPreguntas(guardado.preguntas);
    setProblemas(guardado.problemas);
    router.refresh();
    return guardado.preguntas;
  };

  const aprobar = async () => {
    const revisadas = cambiado ? await guardar() : preguntas;
    if (!revisadas) return;
    const r = await pedir(`/api/escala/tests/${banco.id}/aprobar`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ preguntas: revisadas }),
    });
    setConfirmar(false);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    router.refresh();
    alCerrar();
  };

  return (
    <div className="flex flex-col gap-4 border-t border-line pt-4">
      {problemas.length > 0 && (
        <Alert variant="warning" title="Antes de aprobarlo">
          <ul className="list-disc pl-5">
            {problemas.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </Alert>
      )}
      {error && <Alert variant="danger">{error}</Alert>}
      {preguntas.map((p, i) => (
        <div key={p.id} className="flex flex-col gap-2 rounded-lg border border-line p-3">
          <span className="text-xs text-fg-muted">
            Pregunta {i + 1} · {datos.escala?.dimensiones[p.dimensionId] ?? p.dimensionId} ({p.dimensionId})
          </span>
          <Field label="La pregunta">
            <Textarea rows={2} value={p.texto} disabled={!editor} onChange={(e) => cambiar(i, { texto: e.target.value })} />
          </Field>
          <Field label="Una línea que la aclara (opcional)">
            <Input value={p.ayuda ?? ""} disabled={!editor} onChange={(e) => cambiar(i, { ayuda: e.target.value || null })} />
          </Field>
          <div className="flex flex-col gap-2">
            {p.opciones.map((o, j) => (
              <div key={o.id} className="grid gap-2 sm:grid-cols-[9rem_minmax(0,1fr)] sm:items-start">
                <Badge variant="default" className="justify-self-start">
                  {nombreDelNivel(o.nivel)}
                </Badge>
                <Textarea rows={2} aria-label={`Opción ${nombreDelNivel(o.nivel)}`} value={o.texto} disabled={!editor} onChange={(e) => cambiarOpcion(i, j, e.target.value)} />
              </div>
            ))}
            <span className="text-xs text-fg-muted">El público ve las opciones en este orden y, al final, «No lo sé» (cuenta como el nivel más bajo).</span>
          </div>
        </div>
      ))}
      <div className="flex flex-wrap gap-2">
        {editor && (
          <>
            <Button variant="secondary" disabled={!cambiado || ocupado} onClick={() => void guardar()}>
              Guardar el borrador
            </Button>
            <Button variant="primary" disabled={ocupado || banco.estado === "aprobado"} onClick={() => setConfirmar(true)}>
              Aprobar y publicar
            </Button>
          </>
        )}
        <Button variant="ghost" onClick={alCerrar}>
          Cerrar
        </Button>
      </div>
      <ConfirmDialog
        open={confirmar}
        title="¿Publicar estas preguntas?"
        description="Desde ahora el público ve estas preguntas en el test. Los intentos que ya empezaron siguen con las suyas."
        confirmLabel="Aprobar y publicar"
        onCancel={() => setConfirmar(false)}
        onConfirm={aprobar}
      />
    </div>
  );
}

function Preguntas({ datos, editor }: { datos: DatosDeLaPantalla; editor: boolean }) {
  const router = useRouter();
  const [abierto, setAbierto] = useState<string | null>(null);
  const [aviso, setAviso] = useState<{ variante: "success" | "danger"; texto: string } | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const nombreDeEdicion = (slug: string) => (slug === "general" ? "Escala general" : (datos.escala?.ediciones.find((e) => e.slug === slug)?.nombre ?? slug));

  const generar = async () => {
    setOcupado(true);
    const r = await pedir("/api/escala/tests", { method: "POST" });
    setOcupado(false);
    if (!r.ok) return setAviso({ variante: "danger", texto: r.error });
    const n = (r.datos as { creados: number }).creados;
    setAviso({ variante: "success", texto: n ? `Se crearon ${n} borradores desde la escala ${datos.escala?.version ?? ""}.` : "Ya estaban todos: no se creó ninguno." });
    router.refresh();
  };

  return (
    <div className="flex flex-col gap-6">
      {aviso && (
        <Alert variant={aviso.variante} onDismiss={() => setAviso(null)}>
          {aviso.texto}
        </Alert>
      )}
      {editor && (
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="secondary" disabled={ocupado || !datos.escala} onClick={() => void generar()}>
            Generar borradores desde la escala
          </Button>
          <span className="text-xs text-fg-muted">Crea los que falten; los que ya existen no se tocan.</span>
        </div>
      )}
      {!datos.bancos.length ? (
        <EmptyState
          variant="dashed"
          title="Todavía no hay preguntas"
          description={editor ? "Genera los borradores desde la escala publicada, revísalos y apruébalos." : "Las prepara y las aprueba un super admin."}
        />
      ) : (
        (["1", "2", "3"] as const).map((area) => {
          const bancos = datos.bancos.filter((b) => b.area === area);
          if (!bancos.length) return null;
          return (
            <section key={area} className="flex flex-col gap-3">
              <div className="flex flex-wrap items-baseline gap-3">
                <h2 className="text-sm font-semibold text-fg">{NOMBRE_DEL_AREA[area]}</h2>
                <a className="text-xs text-brand hover:underline" href={`/external/test/${SLUG_POR_AREA[area]}`} target="_blank" rel="noreferrer">
                  Abrir el test web
                </a>
                <a className="text-xs text-brand hover:underline" href={`/external/test/${SLUG_POR_AREA[area]}?v=marketing`} target="_blank" rel="noreferrer">
                  Abrir el de Marketing
                </a>
              </div>
              {bancos.map((b) => (
                <Card key={b.id} className="flex flex-col gap-2 p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-fg">{ETIQUETA_DE_LA_VERSION[b.version]}</span>
                    <span className="text-xs text-fg-muted">· {nombreDeEdicion(b.edicion)}</span>
                    <Badge variant={VARIANTE_DEL_ESTADO[b.estado]}>{ETIQUETA_DEL_ESTADO[b.estado]}</Badge>
                    {b.problemas.length > 0 && <Badge variant="warning">{b.problemas.length} por resolver</Badge>}
                    <span className="ml-auto text-xs text-fg-muted">
                      {b.aprobadoAt ? `Aprobado el ${fecha(b.aprobadoAt)} por ${b.aprobadoPor}` : `Escala ${b.escalaVersion}`}
                    </span>
                    <Button size="sm" variant="secondary" onClick={() => setAbierto(abierto === b.id ? null : b.id)}>
                      {abierto === b.id ? "Ocultar" : editor ? "Revisar" : "Ver"}
                    </Button>
                  </div>
                  {abierto === b.id && <EditorDelBanco banco={b} datos={datos} editor={editor} alCerrar={() => setAbierto(null)} />}
                </Card>
              ))}
            </section>
          );
        })
      )}
    </div>
  );
}

// ── Los intentos ──────────────────────────────────────────────────────────────

const ROTULO_DE_HUBSPOT: Record<EstadoEnHubspot, { texto: string; variante: "success" | "info" | "destructive" | "default" }> = {
  enviado: { texto: "En HubSpot", variante: "success" },
  "en-camino": { texto: "En camino a HubSpot", variante: "info" },
  "con-error": { texto: "HubSpot falló", variante: "destructive" },
  apagado: { texto: "Envío apagado", variante: "default" },
};

function Intentos({ datos, hubspotEncendido, puedeReintentar }: { datos: DatosDeLaPantalla; hubspotEncendido: boolean; puedeReintentar: boolean }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const empresas = useMemo(() => empresasConTests(datos.intentos), [datos.intentos]);

  const reintentar = async (id: string) => {
    const r = await pedir(`/api/escala/tests/intentos/${id}/hubspot`, { method: "POST" });
    if (!r.ok) return setError(r.error);
    router.refresh();
  };

  if (!empresas.length) return <EmptyState variant="dashed" title="Nadie llenó el test todavía" description="Aquí aparece cada intento, agrupado por empresa, de los últimos 90 días." />;
  return (
    <div className="flex flex-col gap-3">
      {!hubspotEncendido && (
        <Alert variant="info">
          El envío a HubSpot está apagado: los intentos quedan guardados aquí y salen solos el día que se prenda (TESTS_HUBSPOT_ENABLED).
        </Alert>
      )}
      {error && (
        <Alert variant="danger" onDismiss={() => setError(null)}>
          {error}
        </Alert>
      )}
      {empresas.map((e) => (
        <Card key={e.clave} className="flex flex-col gap-3 p-4">
          <div className="flex flex-wrap items-baseline gap-2">
            <span className="text-sm font-semibold text-fg">{e.nombre}</span>
            {e.dominio && <span className="text-xs text-fg-muted">{e.dominio}</span>}
            {e.clientId ? <Badge variant="primary">En Nexus</Badge> : <Badge variant="default">Prospecto nuevo</Badge>}
            <span className="ml-auto text-xs text-fg-muted">{e.personas.map((p) => `${p.nombre}${p.puesto ? ` (${p.puesto})` : ""}`).join(" · ")}</span>
          </div>
          <div className="grid gap-2 sm:grid-cols-3">
            {(["1", "2", "3"] as const).map((area) => {
              const i = e.porArea[area];
              if (!i) {
                return (
                  <div key={area} className="rounded-lg border border-dashed border-line p-3 text-xs text-fg-muted">
                    {NOMBRE_DEL_AREA[area]}: sin test
                  </div>
                );
              }
              const hs = estadoEnHubspot(i, hubspotEncendido);
              return (
                <div key={area} className="flex flex-col gap-1.5 rounded-lg border border-line bg-surface-muted p-3">
                  <span className="text-xs text-fg-muted">
                    {NOMBRE_DEL_AREA[area]} · {i.version === "marketing" ? "Marketing" : "Web"} · {fecha(i.createdAt)}
                  </span>
                  <span className="text-sm text-fg">
                    {i.estado === "terminado" ? (i.nivelNombre ?? "Sin nivel") : i.estado === "abandonado" ? `Lo dejó en la pregunta ${Math.min(i.paso + 1, i.totalDePreguntas)} de ${i.totalDePreguntas}` : "Contestando"}
                  </span>
                  <span className="text-xs text-fg-muted">{i.nombre} · {i.email}</span>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={ROTULO_DE_HUBSPOT[hs].variante}>{ROTULO_DE_HUBSPOT[hs].texto}</Badge>
                    {i.url && (
                      <a className="text-xs text-brand hover:underline" href={i.url.split("#")[0]} target="_blank" rel="noreferrer">
                        Ver el resultado
                      </a>
                    )}
                    {hs === "con-error" && puedeReintentar && (
                      <Button size="xs" variant="secondary" onClick={() => void reintentar(i.id)}>
                        Reintentar
                      </Button>
                    )}
                  </div>
                  {i.hubspotError && <span className="text-xs text-fg-muted">{i.hubspotError}</span>}
                </div>
              );
            })}
          </div>
        </Card>
      ))}
    </div>
  );
}

// ── La medición ───────────────────────────────────────────────────────────────

function Medicion({ datos }: { datos: DatosDeLaPantalla }) {
  const medicion = useMemo(() => medicionDelTest(datos.intentos), [datos.intentos]);
  if (!medicion.length) return <EmptyState variant="dashed" title="Sin intentos que medir" description="Cuando alguien empiece el test, aquí ves cuántos terminan y dónde lo dejan." />;
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {medicion.map((m) => {
        const tope = Math.max(1, ...m.dejadosEn);
        return (
          <Card key={`${m.area}:${m.version}`} className="flex flex-col gap-3 p-4">
            <h2 className="text-sm font-semibold text-fg">
              {NOMBRE_DEL_AREA[m.area]} · {ETIQUETA_DE_LA_VERSION[m.version]}
            </h2>
            <div className="grid grid-cols-4 gap-2 text-center">
              {[
                ["Empezaron", m.empezados],
                ["Terminaron", m.terminados],
                ["Lo dejaron", m.abandonados],
                ["Contestando", m.enCurso],
              ].map(([rotulo, n]) => (
                <div key={rotulo} className="flex flex-col">
                  <span className="text-xl font-semibold text-fg">{n}</span>
                  <span className="text-xs text-fg-muted">{rotulo}</span>
                </div>
              ))}
            </div>
            <span className="text-xs text-fg-muted">
              {m.empezados ? `Termina el ${Math.round((m.terminados / m.empezados) * 100)} %.` : ""} Dónde lo dejan:
            </span>
            {m.dejadosEn.length ? (
              <div className="flex flex-col gap-1">
                {m.dejadosEn.map((n, k) => (
                  <div key={k} className="grid grid-cols-[6rem_minmax(0,1fr)_2rem] items-center gap-2 text-xs text-fg-secondary">
                    <span>Pregunta {k + 1}</span>
                    <div className="h-2 rounded-full bg-surface-hover">
                      <div className="h-2 rounded-full bg-brand" style={{ width: `${(n / tope) * 100}%` }} />
                    </div>
                    <span className="text-right">{n}</span>
                  </div>
                ))}
              </div>
            ) : (
              <span className="text-xs text-fg-muted">Nadie lo dejó a medias.</span>
            )}
          </Card>
        );
      })}
    </div>
  );
}

export default function PantallaDeLosTests({
  datos,
  editor,
  puedeReintentar,
  hubspotEncendido,
  sqlFaltante,
}: {
  datos: DatosDeLaPantalla;
  editor: boolean;
  puedeReintentar: boolean;
  hubspotEncendido: boolean;
  sqlFaltante: string | null;
}) {
  const [pestana, setPestana] = useState<Pestana>("preguntas");
  const sinAprobar = datos.bancos.filter((b) => b.estado !== "aprobado").length;
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Tests del diagnóstico"
        description="El test público de cada área: las preguntas que ve el público, quién lo llenó y cuántos lo terminan."
        backHref="/escala"
        backLabel="Escala de Rendimiento"
        badges={datos.escala ? <Badge variant="default">Escala {datos.escala.version}</Badge> : undefined}
      />
      {sqlFaltante && <Alert variant="warning">Falta aplicar {sqlFaltante} en esta base: los tests todavía no existen.</Alert>}
      {!datos.escala && <Alert variant="warning">No hay una escala publicada: sin ella no se pueden generar ni aprobar preguntas.</Alert>}
      <Tabs<Pestana>
        aria-label="Partes de los tests"
        value={pestana}
        onChange={setPestana}
        items={[
          { key: "preguntas", label: "Preguntas", count: sinAprobar || undefined },
          { key: "intentos", label: "Intentos", count: datos.intentos.length || undefined },
          { key: "medicion", label: "Medición" },
        ]}
      />
      {pestana === "preguntas" && <Preguntas datos={datos} editor={editor} />}
      {pestana === "intentos" && <Intentos datos={datos} hubspotEncendido={hubspotEncendido} puedeReintentar={puedeReintentar} />}
      {pestana === "medicion" && <Medicion datos={datos} />}
    </div>
  );
}
