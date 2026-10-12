"use client";

/**
 * La pieza «Ciclo» de un proyecto recurrente (docs/smartloop-plan.md, etapa 1).
 *
 * Arriba lo que el CSE necesita para trabajar: en qué etapa va el ciclo y qué le toca hacer (la guía, que
 * sale del documento de proceso del servicio). Debajo, el ciclo en sí: tramo, fechas, compromiso, meta y
 * los casos de uso con su criterio de aceptación. Sin ciclo abierto, se abre el siguiente.
 *
 * Lo que comprueba Nexus lleva su marca (hecho o falta); lo que todavía no puede comprobar va sin marca,
 * nunca como hecho. La señal de que la etapa se saltó va en ámbar solo cuando Nexus la ve.
 */
import { useCallback, useEffect, useState } from "react";
import { Alert, Field, Input, Select, Textarea } from "@/components/ui";
import { BotonAzul, BotonBlanco, BotonTexto, ROTULO_DEL_SISTEMA } from "@/components/ui/sistema";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/cn";
import {
  COMPROMISOS,
  ETAPAS_DEL_CICLO,
  ETIQUETA_DE_COMPROMISO,
  ETIQUETA_DE_ETAPA,
  etapaSiguiente,
  nombreDelCiclo,
  type Compromiso,
  type EtapaDelCiclo,
} from "@/lib/servicios/ciclo";
import type { CasoDeUsoVista, EstadoDelCiclo } from "@/lib/servicios/ciclos-server";

type Estado = EstadoDelCiclo & { puedeEditar: boolean };

const FECHA = new Intl.DateTimeFormat("es-CR", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const fecha = (iso: string | null) => (iso ? FECHA.format(new Date(`${iso}T00:00:00Z`)) : null);

export default function PanelDelCiclo({ projectId, onCambio }: { projectId: string; onCambio?: () => void }) {
  const toast = useToast();
  const [estado, setEstado] = useState<Estado | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  const cargar = useCallback(async () => {
    const res = await fetch(`/api/projects/${projectId}/ciclo`, { cache: "no-store" });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      setError(data?.error ?? "No se pudo cargar el ciclo.");
      return;
    }
    setError(null);
    setEstado(data as Estado);
  }, [projectId]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  /** Manda un cambio, recarga y avisa al riel. Devuelve si salió bien. */
  const enviar = useCallback(
    async (url: string, method: "POST" | "PATCH", body: unknown, ok?: string): Promise<boolean> => {
      setGuardando(true);
      try {
        const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
        const data = await res.json().catch(() => null);
        if (!res.ok) {
          toast.error(data?.error ?? "No se pudo guardar.");
          return false;
        }
        if (ok) toast.success(ok);
        await cargar();
        onCambio?.();
        return true;
      } finally {
        setGuardando(false);
      }
    },
    [cargar, onCambio, toast],
  );

  if (error) return <Alert variant="danger">{error}</Alert>;
  if (!estado) {
    return (
      <div className="space-y-4" aria-busy="true">
        <div className="skeleton-shimmer h-10 rounded-lg" />
        <div className="skeleton-shimmer h-10 rounded-lg" />
      </div>
    );
  }

  const urlCiclo = `/api/projects/${projectId}/ciclo`;
  const urlCasos = `${urlCiclo}/casos`;
  const ciclo = estado.abierto;
  const siguienteNumero = (estado.cerrados[0]?.numero ?? 0) + 1;

  return (
    <div className="space-y-6">
      {!ciclo ? (
        <AbrirCiclo
          numero={siguienteNumero}
          puedeEditar={estado.puedeEditar}
          guardando={guardando}
          onAbrir={(datos) => enviar(urlCiclo, "POST", datos, `Se abrió el ciclo ${siguienteNumero}.`)}
        />
      ) : (
        <>
          <Cabecera
            estado={estado}
            guardando={guardando}
            onGuardar={(cambios) => enviar(urlCiclo, "PATCH", cambios, "Listo.")}
          />
          <Etapa
            estado={estado}
            guardando={guardando}
            onCambiar={(etapa) => enviar(urlCiclo, "PATCH", { etapa }, `El ciclo pasó a ${ETIQUETA_DE_ETAPA[etapa]}.`)}
          />
          <Guia estado={estado} />
          <Meta
            key={ciclo.meta ?? ""}
            meta={ciclo.meta}
            puedeEditar={estado.puedeEditar}
            onGuardar={(meta) => enviar(urlCiclo, "PATCH", { meta })}
          />
          <CasosDeUso
            estado={estado}
            guardando={guardando}
            onCrear={(datos) => enviar(urlCasos, "POST", datos, "Se sumó el caso de uso.")}
            onCambiar={(datos) => enviar(urlCasos, "PATCH", datos)}
          />
        </>
      )}

      {estado.cerrados.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-fg">Ciclos anteriores</h2>
          <ul className="space-y-1 text-[13px] text-fg-secondary">
            {estado.cerrados.map((c) => (
              <li key={c.numero}>
                {nombreDelCiclo(c)}
                {c.desde && c.hasta ? ` · ${fecha(c.desde)} al ${fecha(c.hasta)}` : ""}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

// ── Abrir un ciclo ───────────────────────────────────────────────────────────

function AbrirCiclo({
  numero,
  puedeEditar,
  guardando,
  onAbrir,
}: {
  numero: number;
  puedeEditar: boolean;
  guardando: boolean;
  onAbrir: (datos: { nombre: string | null; desde: string | null; hasta: string | null; meta: string | null }) => Promise<boolean>;
}) {
  const [nombre, setNombre] = useState("");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [meta, setMeta] = useState("");
  return (
    <section className="space-y-4 rounded-xl border border-line bg-surface p-5">
      <div>
        <h2 className="text-sm font-semibold text-fg">{numero === 1 ? "Todavía no hay un ciclo abierto" : `El ciclo ${numero - 1} se cerró`}</h2>
        <p className="mt-1 text-[13px] text-fg-muted">
          Un ciclo es un tramo con fechas: abre con un diagnóstico y cierra con la sesión de aprendizaje. El tramo, las fechas y la meta se
          pueden completar después.
        </p>
      </div>
      {puedeEditar ? (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Tramo (opcional)">
              <Input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Corregir y adoptar" maxLength={200} />
            </Field>
            <Field label="Desde">
              <Input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
            </Field>
            <Field label="Hasta">
              <Input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
            </Field>
          </div>
          <Field label="Meta del ciclo (opcional)" hint="El resultado que persigue el cliente en este tramo.">
            <Textarea value={meta} onChange={(e) => setMeta(e.target.value)} rows={2} maxLength={4000} />
          </Field>
          <BotonAzul
            disabled={guardando}
            onClick={() => void onAbrir({ nombre: nombre || null, desde: desde || null, hasta: hasta || null, meta: meta || null })}
          >
            Abrir el ciclo {numero}
          </BotonAzul>
        </>
      ) : (
        <p className="text-[13px] text-fg-muted">Lo abre quien puede editar el cronograma.</p>
      )}
    </section>
  );
}

// ── Cabecera: tramo, fechas y compromiso ─────────────────────────────────────

function Cabecera({
  estado,
  guardando,
  onGuardar,
}: {
  estado: Estado;
  guardando: boolean;
  onGuardar: (cambios: Record<string, string | null>) => Promise<boolean>;
}) {
  const ciclo = estado.abierto!;
  const [editando, setEditando] = useState(false);
  const [nombre, setNombre] = useState(ciclo.nombre ?? "");
  const [desde, setDesde] = useState(ciclo.desde ?? "");
  const [hasta, setHasta] = useState(ciclo.hasta ?? "");
  const fechas = ciclo.desde && ciclo.hasta ? `${fecha(ciclo.desde)} al ${fecha(ciclo.hasta)}` : "Sin fechas";
  return (
    <section className="rounded-xl border border-line bg-surface p-5">
      {!editando ? (
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className={ROTULO_DEL_SISTEMA}>{estado.nombreDelServicio}</p>
            <h2 className="mt-1 text-[15px] font-semibold text-fg">{nombreDelCiclo(ciclo)}</h2>
            <p className="mt-0.5 text-[13px] text-fg-muted">{fechas}</p>
          </div>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-[13px] text-fg-secondary">
              Compromiso
              <Select
                value={estado.compromiso ?? ""}
                disabled={!estado.puedeEditar || guardando}
                onChange={(e) => void onGuardar({ compromiso: (e.target.value || null) as Compromiso | null })}
                className="w-36"
              >
                <option value="">Sin definir</option>
                {COMPROMISOS.map((c) => (
                  <option key={c} value={c}>
                    {ETIQUETA_DE_COMPROMISO[c]}
                  </option>
                ))}
              </Select>
            </label>
            {estado.puedeEditar && <BotonBlanco onClick={() => setEditando(true)}>Editar</BotonBlanco>}
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Tramo">
              <Input value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={200} />
            </Field>
            <Field label="Desde">
              <Input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
            </Field>
            <Field label="Hasta">
              <Input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
            </Field>
          </div>
          <div className="flex gap-2">
            <BotonAzul
              disabled={guardando}
              onClick={async () => {
                if (await onGuardar({ nombre: nombre || null, desde: desde || null, hasta: hasta || null })) setEditando(false);
              }}
            >
              Guardar
            </BotonAzul>
            <BotonTexto onClick={() => setEditando(false)}>Cancelar</BotonTexto>
          </div>
        </div>
      )}
    </section>
  );
}

// ── La etapa del ciclo ───────────────────────────────────────────────────────

function Etapa({
  estado,
  guardando,
  onCambiar,
}: {
  estado: Estado;
  guardando: boolean;
  onCambiar: (etapa: EtapaDelCiclo) => Promise<boolean>;
}) {
  const actual = estado.abierto!.etapa;
  const idx = ETAPAS_DEL_CICLO.indexOf(actual);
  const siguiente = etapaSiguiente(actual);
  const puedeMover = estado.puedeEditar && !estado.enHubspot;
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-fg">Etapa del ciclo</h2>
        {puedeMover && siguiente && (
          <BotonBlanco disabled={guardando} onClick={() => void onCambiar(siguiente)}>
            Pasar a {ETIQUETA_DE_ETAPA[siguiente]}
          </BotonBlanco>
        )}
      </div>
      <ol className="grid grid-cols-5 gap-1.5" aria-label="Etapas del ciclo">
        {ETAPAS_DEL_CICLO.map((e, i) => {
          const hecha = i < idx;
          const enCurso = i === idx;
          return (
            <li key={e}>
              <button
                type="button"
                disabled={!puedeMover || guardando || enCurso}
                onClick={() => void onCambiar(e)}
                title={puedeMover && !enCurso ? `Mover el ciclo a ${ETIQUETA_DE_ETAPA[e]}` : undefined}
                aria-current={enCurso ? "step" : undefined}
                className={cn(
                  "w-full rounded-lg border px-2 py-2 text-center text-xs transition-colors",
                  enCurso
                    ? "border-info-line bg-info-surface font-semibold text-brand"
                    : hecha
                      ? "border-line bg-surface text-fg-secondary"
                      : "border-line bg-surface-muted text-fg-muted",
                  puedeMover && !enCurso && "hover:bg-surface-hover",
                )}
              >
                {ETIQUETA_DE_ETAPA[e]}
              </button>
            </li>
          );
        })}
      </ol>
      {estado.enHubspot ? (
        <p className="text-xs text-fg-muted">La etapa la mueve el equipo en HubSpot.</p>
      ) : actual === "aprendizaje" ? (
        <p className="text-xs text-fg-muted">El ciclo se cierra con la sesión de aprendizaje.</p>
      ) : null}
    </section>
  );
}

// ── La guía del CSE ──────────────────────────────────────────────────────────

function Guia({ estado }: { estado: Estado }) {
  const g = estado.guia;
  if (!g) return null;
  return (
    <section className="space-y-3 rounded-xl border border-line bg-surface p-5">
      <div>
        <p className={ROTULO_DEL_SISTEMA}>Qué haces en {ETIQUETA_DE_ETAPA[g.etapa]}</p>
        <p className="mt-1.5 text-[13px] leading-relaxed text-fg">{g.guia.queHaces}</p>
      </div>
      <div>
        <p className={ROTULO_DEL_SISTEMA}>Qué tiene que quedar</p>
        <ul className="mt-1.5 space-y-1">
          {g.producido.map((p) => (
            <li key={p.clave} className="flex items-start gap-2 text-[13px]">
              <span
                aria-hidden="true"
                className={cn(
                  "mt-0.5 inline-flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full text-[10px]",
                  p.hecho === true
                    ? "bg-success-surface text-success-ink"
                    : p.hecho === false
                      ? "border border-warn-line text-warn-ink"
                      : "border border-line text-fg-muted",
                )}
              >
                {p.hecho === true ? "✓" : ""}
              </span>
              <span className={p.hecho === true ? "text-fg-secondary" : "text-fg"}>
                {p.texto}
                {p.hecho === false && <span className="text-warn-ink"> · falta</span>}
              </span>
            </li>
          ))}
        </ul>
      </div>
      {g.senalVista ? (
        <Alert variant="warning">{g.senalVista}</Alert>
      ) : (
        <p className="text-xs text-fg-muted">
          <span className="font-medium">Señal de que se saltó:</span> {g.guia.senal}
        </p>
      )}
    </section>
  );
}

// ── La meta ──────────────────────────────────────────────────────────────────

function Meta({ meta, puedeEditar, onGuardar }: { meta: string | null; puedeEditar: boolean; onGuardar: (meta: string | null) => Promise<boolean> }) {
  // Se monta de nuevo cuando cambia la meta guardada (`key`), así el campo arranca con lo de la base.
  const [valor, setValor] = useState(meta ?? "");
  return (
    <section className="space-y-2">
      <h2 className="text-sm font-semibold text-fg">Meta del ciclo</h2>
      {puedeEditar ? (
        <Textarea
          value={valor}
          rows={2}
          maxLength={4000}
          placeholder="El resultado que persigue el cliente en este tramo, en sus palabras."
          onChange={(e) => setValor(e.target.value)}
          onBlur={() => {
            if ((valor.trim() || null) !== (meta ?? null)) void onGuardar(valor.trim() || null);
          }}
        />
      ) : (
        <p className="text-[13px] text-fg">{meta ?? "Sin meta todavía."}</p>
      )}
    </section>
  );
}

// ── Los casos de uso ─────────────────────────────────────────────────────────

function CasosDeUso({
  estado,
  guardando,
  onCrear,
  onCambiar,
}: {
  estado: Estado;
  guardando: boolean;
  onCrear: (datos: { titulo: string; criterio: string | null; metrica: string | null }) => Promise<boolean>;
  onCambiar: (datos: { id: string } & Record<string, unknown>) => Promise<boolean>;
}) {
  const casos = estado.abierto!.casos;
  const [titulo, setTitulo] = useState("");
  const [criterio, setCriterio] = useState("");
  const [metrica, setMetrica] = useState("");
  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-sm font-semibold text-fg">Casos de uso del ciclo</h2>
        <p className="mt-0.5 text-xs text-fg-muted">
          Cada uno con su criterio de aceptación: cómo se va a saber que funcionó. Un caso de uso puede mover varias dimensiones de la escala.
        </p>
      </div>
      {casos.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line px-4 py-3 text-[13px] text-fg-muted">Todavía no hay casos de uso en este ciclo.</p>
      ) : (
        <ul className="space-y-2">
          {casos.map((c) => (
            <Caso key={c.id} caso={c} puedeEditar={estado.puedeEditar} guardando={guardando} onCambiar={onCambiar} />
          ))}
        </ul>
      )}
      {estado.puedeEditar && (
        <div className="space-y-3 rounded-xl border border-line bg-surface-muted p-4">
          <p className={ROTULO_DEL_SISTEMA}>Sumar un caso de uso</p>
          <Field label="Título">
            <Input value={titulo} onChange={(e) => setTitulo(e.target.value)} maxLength={200} placeholder="Rutina de ventas en HubSpot" />
          </Field>
          <div className="grid gap-3 sm:grid-cols-[2fr_1fr]">
            <Field label="Criterio de aceptación">
              <Input
                value={criterio}
                onChange={(e) => setCriterio(e.target.value)}
                maxLength={4000}
                placeholder="Todo negocio abierto tiene próxima actividad y conversación registrada"
              />
            </Field>
            <Field label="Métrica">
              <Input value={metrica} onChange={(e) => setMetrica(e.target.value)} maxLength={200} placeholder="% de negocios con próxima actividad" />
            </Field>
          </div>
          <BotonAzul
            disabled={guardando || !titulo.trim()}
            onClick={async () => {
              if (await onCrear({ titulo: titulo.trim(), criterio: criterio || null, metrica: metrica || null })) {
                setTitulo("");
                setCriterio("");
                setMetrica("");
              }
            }}
          >
            Sumar
          </BotonAzul>
        </div>
      )}
    </section>
  );
}

function Caso({
  caso,
  puedeEditar,
  guardando,
  onCambiar,
}: {
  caso: CasoDeUsoVista;
  puedeEditar: boolean;
  guardando: boolean;
  onCambiar: (datos: { id: string } & Record<string, unknown>) => Promise<boolean>;
}) {
  const [editando, setEditando] = useState(false);
  const [titulo, setTitulo] = useState(caso.titulo);
  const [criterio, setCriterio] = useState(caso.criterio ?? "");
  const [metrica, setMetrica] = useState(caso.metrica ?? "");
  const sinCriterio = !caso.criterio?.trim();
  return (
    <li className="rounded-xl border border-line bg-surface p-4">
      {!editando ? (
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <p className="text-[13px] font-semibold text-fg">{caso.titulo}</p>
            {sinCriterio ? (
              <p className="text-xs text-warn-ink">Sin criterio de aceptación.</p>
            ) : (
              <p className="text-xs text-fg-secondary">
                <span className="font-medium">Criterio:</span> {caso.criterio}
                {caso.metrica ? <span className="text-fg-muted"> · {caso.metrica}</span> : null}
              </p>
            )}
            {caso.mueve.length > 0 && (
              <p className="text-xs text-fg-muted">
                Mueve: {caso.mueve.map((m) => `${m.area ? `${m.area} · ` : ""}${m.dimension}${m.nivel ? ` → ${m.nivel}` : ""}`).join(", ")}
              </p>
            )}
          </div>
          {puedeEditar && (
            <div className="flex flex-shrink-0 gap-1">
              <BotonTexto onClick={() => setEditando(true)}>Editar</BotonTexto>
              <BotonTexto disabled={guardando} onClick={() => void onCambiar({ id: caso.id, quitar: true })}>
                Quitar
              </BotonTexto>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <Field label="Título">
            <Input value={titulo} onChange={(e) => setTitulo(e.target.value)} maxLength={200} />
          </Field>
          <div className="grid gap-3 sm:grid-cols-[2fr_1fr]">
            <Field label="Criterio de aceptación">
              <Input value={criterio} onChange={(e) => setCriterio(e.target.value)} maxLength={4000} />
            </Field>
            <Field label="Métrica">
              <Input value={metrica} onChange={(e) => setMetrica(e.target.value)} maxLength={200} />
            </Field>
          </div>
          <div className="flex gap-2">
            <BotonAzul
              disabled={guardando || !titulo.trim()}
              onClick={async () => {
                if (await onCambiar({ id: caso.id, titulo: titulo.trim(), criterio: criterio || null, metrica: metrica || null })) setEditando(false);
              }}
            >
              Guardar
            </BotonAzul>
            <BotonTexto onClick={() => setEditando(false)}>Cancelar</BotonTexto>
          </div>
        </div>
      )}
    </li>
  );
}
