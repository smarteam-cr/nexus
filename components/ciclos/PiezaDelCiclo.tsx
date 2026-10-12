"use client";

/**
 * Los ARTEFACTOS del ciclo de un proyecto recurrente (docs/smartloop-plan.md; rediseño del 2026-10-11, pedido de
 * Elías): Diagnóstico, Plan del ciclo y Aprendizaje, más la cabecera que se pinta arriba del Cronograma.
 *
 * Arriba de cada uno, la CABECERA del ciclo (tramo, fechas, compromiso y la etapa, con «Pasar a…») y la GUÍA de su
 * etapa, que sale del documento de proceso del servicio: qué haces, qué tiene que quedar y la señal de que se saltó.
 * Lo que Nexus comprueba lleva marca; lo que no puede comprobar va sin marca, nunca como hecho.
 *
 * El primer ciclo nace solo (GET /ciclo): no hay formulario para abrirlo.
 */
import { useState } from "react";
import { Alert, Field, Input, Select, Textarea } from "@/components/ui";
import { BotonAzul, BotonBlanco, BotonTexto, ROTULO_DEL_SISTEMA } from "@/components/ui/sistema";
import { cn } from "@/lib/cn";
import {
  COMPROMISOS,
  ETAPAS_DEL_CICLO,
  ETIQUETA_DE_COMPROMISO,
  ETIQUETA_DE_ETAPA,
  PIEZA_APRENDIZAJE_DEL_CICLO,
  PIEZA_DIAGNOSTICO_DEL_CICLO,
  PIEZA_PLAN_DEL_CICLO,
  etapaSiguiente,
  etapasDeLaPieza,
  nombreDelCiclo,
  type Compromiso,
  type EtapaDelCiclo,
} from "@/lib/servicios/ciclo";
import { guiaDeServicio } from "@/lib/servicios";
import { guiaDelCiclo } from "@/lib/servicios/guia";
import type { CasoDeUsoVista } from "@/lib/servicios/ciclos-server";
import { useCiclo, type EstadoConPermiso } from "./useCiclo";

const FECHA = new Intl.DateTimeFormat("es-CR", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const fecha = (iso: string | null) => (iso ? FECHA.format(new Date(`${iso}T00:00:00Z`)) : null);

export default function PiezaDelCiclo({
  projectId,
  slug,
  onCambio,
  onAbrirPieza,
}: {
  projectId: string;
  /** Qué artefacto: el diagnóstico, el plan, el aprendizaje, o `timeline` (la cabecera arriba del Cronograma). */
  slug: string;
  onCambio?: () => void;
  onAbrirPieza?: (slug: string) => void;
}) {
  const { estado, error, guardando, enviar } = useCiclo(projectId, onCambio);

  if (error) return <Alert variant="danger">{error}</Alert>;
  if (!estado) {
    return (
      <div className="space-y-3" aria-busy="true">
        <div className="skeleton-shimmer h-10 rounded-lg" />
        <div className="skeleton-shimmer h-10 rounded-lg" />
      </div>
    );
  }
  const ciclo = estado.abierto;
  if (!ciclo) {
    return (
      <p className="rounded-xl border border-dashed border-line px-4 py-3 text-[13px] text-fg-muted">
        {estado.puedeEditar
          ? "No hay un ciclo abierto: el siguiente se abre al cerrar el anterior con su sesión de aprendizaje."
          : "Todavía no hay un ciclo abierto. Lo abre quien puede editar el cronograma."}
      </p>
    );
  }

  const etapasDeEsta = etapasDeLaPieza(slug);
  const enCurso = etapasDeEsta.includes(ciclo.etapa);
  // La guía de la etapa de este artefacto; en el Cronograma, la de la etapa en curso solo si es una de las suyas.
  const etapaDeLaGuia: EtapaDelCiclo | null = slug === "timeline" ? (enCurso ? ciclo.etapa : null) : (etapasDeEsta[0] ?? null);

  return (
    <div className="space-y-6">
      <CabeceraDelCiclo
        estado={estado}
        guardando={guardando}
        onGuardar={(cambios) => enviar("", "PATCH", cambios, "Listo.")}
        onEtapa={(etapa) => enviar("", "PATCH", { etapa }, `El ciclo pasó a ${ETIQUETA_DE_ETAPA[etapa]}.`)}
      />
      {etapaDeLaGuia && <Guia estado={estado} etapa={etapaDeLaGuia} enCurso={enCurso} />}

      {slug === PIEZA_DIAGNOSTICO_DEL_CICLO && (
        <section className="space-y-3 rounded-xl border border-line bg-surface p-5">
          <h2 className="text-sm font-semibold text-fg">El nivel de partida</h2>
          <p className="text-[13px] text-fg-secondary">
            Aquí va a quedar el nivel de cada dimensión del área con el que arranca el ciclo, guardado en la empresa para
            compararlo ciclo tras ciclo. Mientras tanto se trabaja con sus insumos:
          </p>
          <div className="flex flex-wrap gap-2">
            <BotonBlanco onClick={() => onAbrirPieza?.("exploration")}>Abrir la Exploración</BotonBlanco>
            <BotonBlanco onClick={() => onAbrirPieza?.("questionnaires")}>Abrir los Cuestionarios</BotonBlanco>
          </div>
        </section>
      )}

      {slug === PIEZA_PLAN_DEL_CICLO && (
        <>
          <Meta key={ciclo.meta ?? ""} meta={ciclo.meta} puedeEditar={estado.puedeEditar} onGuardar={(meta) => enviar("", "PATCH", { meta })} />
          <CasosDeUso
            estado={estado}
            guardando={guardando}
            onCrear={(datos) => enviar("/casos", "POST", datos, "Se sumó el caso de uso.")}
            onCambiar={(datos) => enviar("/casos", "PATCH", datos)}
          />
        </>
      )}

      {slug === PIEZA_APRENDIZAJE_DEL_CICLO && (
        <section className="space-y-2 rounded-xl border border-line bg-surface p-5">
          <h2 className="text-sm font-semibold text-fg">La sesión de aprendizaje</h2>
          <p className="text-[13px] text-fg-secondary">{guiaDeServicio(estado.servicio)?.reglaDeCierre}</p>
          <p className="text-[13px] text-fg-muted">
            {ciclo.hasta ? `El ciclo termina el ${fecha(ciclo.hasta)}.` : "El ciclo todavía no tiene fecha de cierre: ponla en la cabecera."}
          </p>
        </section>
      )}

      {slug !== "timeline" && estado.cerrados.length > 0 && (
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

// ── La cabecera del ciclo: tramo, fechas, compromiso y etapa ─────────────────

function CabeceraDelCiclo({
  estado,
  guardando,
  onGuardar,
  onEtapa,
}: {
  estado: EstadoConPermiso;
  guardando: boolean;
  onGuardar: (cambios: Record<string, string | null>) => Promise<boolean>;
  onEtapa: (etapa: EtapaDelCiclo) => Promise<boolean>;
}) {
  const ciclo = estado.abierto!;
  const [editando, setEditando] = useState(false);
  const [nombre, setNombre] = useState(ciclo.nombre ?? "");
  const [desde, setDesde] = useState(ciclo.desde ?? "");
  const [hasta, setHasta] = useState(ciclo.hasta ?? "");
  const idx = ETAPAS_DEL_CICLO.indexOf(ciclo.etapa);
  const siguiente = etapaSiguiente(ciclo.etapa);
  const puedeMover = estado.puedeEditar && !estado.enHubspot;
  const fechas = ciclo.desde && ciclo.hasta ? `${fecha(ciclo.desde)} – ${fecha(ciclo.hasta)}` : "Sin fechas";

  return (
    <section className="space-y-3 rounded-xl border border-line bg-surface p-4">
      {!editando ? (
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className={ROTULO_DEL_SISTEMA}>{estado.nombreDelServicio}</p>
            <p className="mt-0.5 text-[15px] font-semibold text-fg">{nombreDelCiclo(ciclo)}</p>
            <p className="text-[13px] text-fg-muted">{fechas}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
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
            {estado.puedeEditar && <BotonTexto onClick={() => setEditando(true)}>{ciclo.desde ? "Editar" : "Poner tramo y fechas"}</BotonTexto>}
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Tramo">
              <Input value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={200} placeholder="Corregir y adoptar" />
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

      <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
        <ol className="flex flex-1 flex-wrap items-center gap-1" aria-label="Etapas del ciclo">
          {ETAPAS_DEL_CICLO.map((e, i) => (
            <li
              key={e}
              aria-current={i === idx ? "step" : undefined}
              className={cn(
                "rounded-full px-2.5 py-0.5 text-xs",
                i === idx ? "bg-info-surface font-semibold text-brand" : i < idx ? "text-fg-secondary" : "text-fg-muted",
              )}
            >
              {i < idx ? "✓ " : ""}
              {ETIQUETA_DE_ETAPA[e]}
            </li>
          ))}
        </ol>
        {puedeMover && siguiente && (
          <BotonBlanco disabled={guardando} onClick={() => void onEtapa(siguiente)}>
            Pasar a {ETIQUETA_DE_ETAPA[siguiente]}
          </BotonBlanco>
        )}
        {estado.enHubspot && <span className="text-xs text-fg-muted">La etapa la mueve el equipo en HubSpot.</span>}
      </div>
    </section>
  );
}

// ── La guía del CSE para una etapa ───────────────────────────────────────────

function Guia({ estado, etapa, enCurso }: { estado: EstadoConPermiso; etapa: EtapaDelCiclo; enCurso: boolean }) {
  const servicio = guiaDeServicio(estado.servicio);
  const ciclo = estado.abierto;
  if (!servicio || !ciclo) return null;
  const g = guiaDelCiclo(servicio, { etapa, meta: ciclo.meta, desde: ciclo.desde, hasta: ciclo.hasta, casos: ciclo.casos });
  return (
    <section className="space-y-3 rounded-xl border border-line bg-surface p-5">
      <div>
        <p className={ROTULO_DEL_SISTEMA}>
          Qué haces en {ETIQUETA_DE_ETAPA[etapa]}
          {enCurso ? " · etapa en curso" : ""}
        </p>
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
      {enCurso && g.senalVista ? (
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
  estado: EstadoConPermiso;
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
