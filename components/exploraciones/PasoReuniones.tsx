"use client";

/**
 * PasoReuniones — el guion de las dos reuniones, para tenerlo abierto mientras se conversa.
 *
 * Cada paso dice qué se busca, cuánto dura, qué preguntar y qué llena del lienzo, y tiene su nota
 * rápida (el agente la lee como fuente). Donde el paso usa la escala, la escala está ahí mismo: el
 * nivel de las dimensiones para validar el test, y «lo que pide Funcional» de las elegidas.
 */
import { useState } from "react";
import { Alert, Badge, Segmentado, Select, Tabs, Textarea } from "@/components/ui";
import { definicionDe } from "@/lib/exploraciones/casillas";
import { ESTADOS_DEL_CRITERIO, type EstadoDelCriterio } from "@/lib/exploraciones/contenido";
import { minutosPara, REUNIONES, type IdDeReunion, type LoQueLlena, type PasoDelGuion, type Reunion } from "@/lib/exploraciones/sesion";
import { useLienzo } from "./contexto";
import { NivelDelArea, QueVaPrimero } from "./NivelDelArea";
import { Propuestas } from "./Propuestas";

const ESTADO: Record<EstadoDelCriterio, string> = { tiene: "Lo tiene", no_tiene: "No lo tiene", no_se: "No se sabe" };

const QUE_LLENA: Record<Exclude<LoQueLlena, Parameters<typeof definicionDe>[0]>, string> = {
  nivel: "Nivel de las dimensiones",
  areas: "Áreas en juego",
  aExplorar: "Dimensiones a explorar",
  falta: "Lo que pide Funcional",
  plan: "Qué va primero",
};

function etiquetaDeLoQueLlena(l: LoQueLlena): string {
  return l in QUE_LLENA ? QUE_LLENA[l as keyof typeof QUE_LLENA] : definicionDe(l as Parameters<typeof definicionDe>[0]).etiqueta;
}

function NotaDelPaso({ paso }: { paso: PasoDelGuion }) {
  const { exp, cambiar, puedeEditar } = useLienzo();
  const guardada = exp.estado.contenido.notas[paso.id] ?? "";
  const [texto, setTexto] = useState(guardada);
  const [vista, setVista] = useState(guardada);
  if (vista !== guardada) {
    setVista(guardada);
    setTexto(guardada);
  }
  return (
    <Textarea
      rows={2}
      value={texto}
      disabled={!puedeEditar}
      placeholder="Nota rápida: lo que dijo, con sus palabras"
      aria-label={`Nota de «${paso.titulo}»`}
      onChange={(e) => setTexto(e.target.value)}
      onBlur={() => {
        if (texto !== guardada) void cambiar([{ op: "nota", paso: paso.id, texto }]);
      }}
    />
  );
}

/** Lo que pide Funcional en las dimensiones elegidas: guía de lo que falta, no cambia el nivel. */
function LoQueFalta() {
  const { exp, escala, cambiar, puedeEditar, guardando, pendientesPara } = useLienzo();
  const e = exp.estado;
  const elegidas = escala.areas
    .filter((a) => e.areas.includes(a.id))
    .flatMap((a) => a.dimensiones.filter((d) => d.aplica && d.id in e.contenido.aExplorar).map((d) => ({ area: a, d })));
  if (elegidas.length === 0) {
    return <p className="text-sm text-fg-muted">Todavía no hay dimensiones elegidas para explorar (paso «Preparación»).</p>;
  }
  return (
    <div className="space-y-4">
      {elegidas.map(({ area, d }) => (
        <div key={d.id} className="space-y-2 rounded-lg border border-line p-3">
          <div>
            <p className="text-sm font-medium text-fg">
              {d.nombre} <span className="text-xs font-normal text-fg-muted">· {area.nombre}</span>
            </p>
            <p className="text-xs text-fg-secondary">{d.pregunta}</p>
          </div>
          <ul className="space-y-2">
            {d.funcional.map((c) => {
              const actual = e.contenido.falta[c.id];
              const pendientes = pendientesPara((x) => x.tipo === "falta" && x.criterioId === c.id);
              return (
                <li key={c.id} className="space-y-1.5">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <p className="min-w-0 flex-1 text-xs text-fg-secondary">
                      {c.texto}
                      {c.verificacion === "comprobable" && (
                        <Badge size="xs" variant="info" className="ml-2">
                          Míralo en el portal
                        </Badge>
                      )}
                    </p>
                    <Segmentado<EstadoDelCriterio>
                      etiqueta="¿Lo tiene?"
                      opciones={ESTADOS_DEL_CRITERIO.map((k) => ({ clave: k, etiqueta: ESTADO[k] }))}
                      valor={actual?.estado ?? null}
                      deshabilitado={!puedeEditar || guardando}
                      onCambio={(estado) => void cambiar([{ op: "falta", criterioId: c.id, estado: { estado, ...(actual?.cita ? { cita: actual.cita } : {}) } }])}
                    />
                  </div>
                  <Propuestas items={pendientes} compacto />
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}

function PasoDeLaReunion({ paso, numero, minutos }: { paso: PasoDelGuion; numero: number; minutos: number }) {
  const { exp } = useLienzo();
  const areas = exp.estado.areas;
  const delPaso = paso.dimensiones === "todas" ? areas.slice(0, 1) : paso.dimensiones === "sumadas" ? areas.slice(1) : [];

  return (
    <li className="space-y-3 rounded-xl border border-line bg-surface p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-fg">
            <span className="tabular-nums text-fg-muted">{numero}.</span> {paso.titulo}
            {paso.opcional && (
              <Badge size="xs" className="ml-2">
                Opcional
              </Badge>
            )}
          </p>
          <p className="text-xs text-fg-secondary">{paso.objetivo}</p>
        </div>
        <span className="flex-shrink-0 text-xs tabular-nums text-fg-muted">{minutos} min</span>
      </div>

      {paso.preguntas.length > 0 && (
        <ul className="list-disc space-y-1 pl-5 text-sm text-fg">
          {paso.preguntas.map((q, i) => (
            <li key={i}>{q}</li>
          ))}
        </ul>
      )}
      {paso.ojo && <Alert variant="warning">{paso.ojo}</Alert>}

      {paso.dimensiones === "sumadas" && delPaso.length === 0 && (
        <p className="text-xs text-fg-muted">No se sumaron áreas: estos minutos van a profundizar.</p>
      )}
      {delPaso.map((id) => (
        <NivelDelArea key={id} areaId={id} />
      ))}
      {paso.dimensiones === "todas" && areas.length === 0 && (
        <p className="text-xs text-fg-muted">Elige primero las áreas en juego (paso «Preparación»).</p>
      )}
      {paso.dimensiones === "elegidas" && <LoQueFalta />}
      {paso.llena.includes("plan") && <QueVaPrimero />}

      <div className="space-y-1.5">
        <NotaDelPaso paso={paso} />
        <p className="text-2xs text-fg-muted">Llena: {paso.llena.map(etiquetaDeLoQueLlena).join(" · ")}</p>
      </div>
    </li>
  );
}

function Guion({ reunion }: { reunion: Reunion }) {
  const [duracion, setDuracion] = useState(reunion.duracion);
  const minutos = minutosPara(reunion, duracion);
  const opciones = [...new Set([reunion.duracion, 30, 45, 60, 90])].sort((a, b) => a - b);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Alert variant="info" className="flex-1">
          {reunion.promesa}
        </Alert>
        <label className="flex items-center gap-2 text-xs text-fg-muted">
          Dura
          <Select value={duracion} onChange={(e) => setDuracion(Number(e.target.value))} aria-label="Duración de la reunión">
            {opciones.map((m) => (
              <option key={m} value={m}>
                {m} min
              </option>
            ))}
          </Select>
        </label>
      </div>
      <ol className="space-y-3">
        {reunion.pasos.map((p, i) => (
          <PasoDeLaReunion key={p.id} paso={p} numero={i + 1} minutos={minutos[i]} />
        ))}
      </ol>
    </div>
  );
}

export default function PasoReuniones() {
  const [cual, setCual] = useState<IdDeReunion>("revision");
  const reunion = REUNIONES.find((r) => r.id === cual) ?? REUNIONES[0];
  return (
    <div className="space-y-4">
      <Tabs<IdDeReunion>
        aria-label="Reuniones"
        variant="pill"
        value={cual}
        onChange={setCual}
        items={REUNIONES.map((r) => ({ key: r.id, label: `${r.titulo.split(" — ")[0]} · ${r.duracion} min` }))}
      />
      <h2 className="text-sm font-semibold text-fg">{reunion.titulo}</h2>
      <Guion key={reunion.id} reunion={reunion} />
    </div>
  );
}
