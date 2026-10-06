"use client";

/**
 * PasoPreparacion — todo lo que hace falta ANTES de escribirle o llamarle (pedido de Elías,
 * 2026-10-02). Dos columnas:
 *
 *   - Identificación: arriba, el resumen con todo lo que escribe la IA (el «por qué ahora», su HubSpot
 *     hoy y la radiografía), una sola vez (Elías, 2026-10-03); abajo, solo los hechos: el detonante (los hechos de HubSpot y el «por qué ahora»), el contacto, la
 *     radiografía de la empresa (su ficha de HubSpot y lo que el agente investigó en internet) y su
 *     HubSpot hoy. La escala y las áreas en juego viven en Exploración (Elías, 2026-10-03).
 *   - Conexión: cómo abrir la conversación, la hipótesis de valor y la estrategia de conexión (que
 *     queda plegada si ya agendó: no hace falta contactarlo).
 *
 * Los hechos de HubSpot se leen al abrir la pieza y no se guardan; lo que interpreta el agente vive
 * en sus casillas, como todo lo demás: lo propone y el vendedor lo usa o lo descarta.
 */
import { useEffect, useState } from "react";
import { Alert, Badge, Button, Skeleton } from "@/components/ui";
import { cn } from "@/lib/cn";
import { diaConAnio, diaYHora } from "@/lib/exploraciones/fechas";
import { definicionDe } from "@/lib/exploraciones/casillas";
import { debePrepararSola, estadoDeLaPreparacion, ultimaPreparacion, type CorridasAlAbrir } from "@/lib/exploraciones/preparar-sola";
import { contactoPrincipal, porQueAhoraSugerido, senalesDe, type ContactoConRastro, type Senal } from "@/lib/exploraciones/senales";
import { useRecorridos } from "@/components/recorridos/contexto";
import { Casilla, Vista } from "./Casilla";
import { useLienzo } from "./contexto";
import { BotonAzul, BotonTexto, IconoDeSugerencia } from "./FranjaDeSugerencias";
import { FilaSugerida } from "./Propuestas";
import { useCorrida } from "./useCorrida";

interface DatosDePreparacion {
  empresa: {
    nombre: string;
    dominio: string | null;
    sitio: string | null;
    industria: string | null;
    pais: string | null;
    ciudad: string | null;
    empleados: string | null;
    descripcion: string | null;
  } | null;
  contactos: ContactoConRastro[];
  principalId: string | null;
  tests: { contacto: string; areaId: string; fecha: string | null }[];
  agenda: { id: string; titulo: string; inicio: string }[];
}

/** El encabezado de una columna: el nombre chico arriba y qué responde. */
function Columna({ nombre, pregunta, children }: { nombre: string; pregunta: string; children: React.ReactNode }) {
  return (
    <div data-recorrido={nombre === "Conexión" ? "preventa.preparacion.conexion" : undefined} className="min-w-0 space-y-4">
      <div className="border-b border-line pb-2">
        <p className="text-2xs font-semibold uppercase tracking-widest text-brand">{nombre}</p>
        <p className="text-sm text-fg-secondary">{pregunta}</p>
      </div>
      {children}
    </div>
  );
}

/** Una tarjeta de la pieza: título, una línea de ayuda y su contenido. */
function Bloque({ titulo, ayuda, children, className }: { titulo: string; ayuda?: string; children: React.ReactNode; className?: string }) {
  return (
    <section data-recorrido={titulo === "Contacto" ? "preventa.preparacion.contacto" : undefined} className={cn("space-y-4 rounded-xl border border-line bg-surface p-5", className)}>
      <div>
        <h3 className="text-sm font-semibold text-fg">{titulo}</h3>
        {ayuda && <p className="text-xs text-fg-muted">{ayuda}</p>}
      </div>
      {children}
    </section>
  );
}

/** Un dato en una fila: la etiqueta a la izquierda, el valor a la derecha. */
function Dato({ que, children }: { que: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[8.5rem_1fr] gap-3 py-1.5 text-sm">
      <dt className="text-fg-muted">{que}</dt>
      <dd className="min-w-0 break-words text-fg">{children}</dd>
    </div>
  );
}

/** Las exploraciones en las que esta pantalla ya lanzó la preparación sola (un montaje doble no lanza dos). */
const yaPreparadasSolas = new Set<string>();

/**
 * Lo que dice el servidor al abrir la pieza: la última corrida y la última preparación (del AgentRun).
 * undefined mientras no contesta; null si no se pudo consultar. Es UNA consulta al abrir: el
 * seguimiento de la corrida sigue siendo el compartido (useCorrida).
 */
function useCorridasAlAbrir(exploracionId: string): CorridasAlAbrir | null | undefined {
  const [alAbrir, setAlAbrir] = useState<CorridasAlAbrir | null | undefined>(undefined);
  useEffect(() => {
    let vivo = true;
    void (async () => {
      try {
        const res = await fetch(`/api/sales/exploraciones/${exploracionId}/agente`);
        const data = (await res.json().catch(() => ({}))) as Partial<CorridasAlAbrir>;
        if (vivo) setAlAbrir(res.ok ? { corrida: data.corrida ?? null, preparacion: data.preparacion ?? null } : null);
      } catch {
        if (vivo) setAlAbrir(null);
      }
    })();
    return () => {
      vivo = false;
    };
  }, [exploracionId]);
  return alAbrir;
}

/** Lo que hace el agente en esta pieza, con su estado: cuándo se actualizó la información y si la última vez falló. */
function BarraDelAgente() {
  const { exp, puedeEditar } = useLienzo();
  const { corrida, corriendo, lanzando, lanzar } = useCorrida();
  const ultima = [...exp.estado.propuesta.corridas].reverse().find((c) => c.modo === "preparar");
  const trabajando = corriendo && corrida?.modo === "preparar";
  const alAbrir = useCorridasAlAbrir(exp.id);
  const { fallo } = estadoDeLaPreparacion({ preparadaEn: ultima?.en ?? null, ultima: ultimaPreparacion(alAbrir?.preparacion, corrida) });

  /* La primera vez, se prepara sola: lo de esta pieza llega sugerido sin que nadie lo pida. Decide con
     lo que contestó el servidor; ⛔ si la última preparación falló, espera el botón (Elías, 2026-10-05). */
  const prepararSola = debePrepararSola({
    puedeEditar,
    archivada: exp.estado.archivada,
    preparadaEn: ultima?.en ?? null,
    alAbrir,
    ocupado: corriendo || lanzando,
  });
  // Mientras corre un recorrido guiado, la pieza se abrió para mostrarla, no para trabajarla: no se gasta al agente.
  const enRecorrido = !!useRecorridos()?.activo;
  useEffect(() => {
    if (enRecorrido || !prepararSola || yaPreparadasSolas.has(exp.id)) return;
    yaPreparadasSolas.add(exp.id);
    void lanzar("preparar");
  }, [enRecorrido, prepararSola, exp.id, lanzar]);
  return (
    <div data-recorrido="preventa.preparacion.agente" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-info-line bg-info-surface px-5 py-4">
      <div className="min-w-0 space-y-0.5">
        <p className="text-sm font-semibold text-fg">{trabajando ? "El agente está preparando" : ultima ? "Preparada por el agente" : "Prepara la preventa con el agente"}</p>
        <p className="text-xs text-fg-secondary" role={trabajando ? "status" : undefined}>
          {trabajando
            ? (corrida?.fase ?? "Empezando…")
            : ultima
              ? `Información actualizada el ${diaYHora(ultima.en)} · ${ultima.propuestos === 0 ? "nada nuevo que proponer" : `${ultima.propuestos} ${ultima.propuestos === 1 ? "propuesta" : "propuestas"} para revisar`}`
              : "Investiga la empresa en internet, lee HubSpot y el diagnóstico, y propone el «por qué ahora», la radiografía, la hipótesis de valor y cómo conectar."}
        </p>
      </div>
      {puedeEditar && (
        <Button size="sm" variant={ultima && !fallo ? "secondary" : "primary"} loading={lanzando || trabajando} disabled={corriendo} onClick={() => void lanzar("preparar")}>
          {fallo ? "Volver a intentar" : ultima ? "Volver a preparar" : "Preparar con el agente"}
        </Button>
      )}
      {fallo && !trabajando && (
        <Alert variant="danger" className="w-full" title={`La última actualización falló el ${diaYHora(fallo.en)}${puedeEditar ? ": vuelve a intentarlo." : "."}`}>
          {fallo.error}
        </Alert>
      )}
    </div>
  );
}

/**
 * Lo que escribe la IA va ARRIBA y una sola vez (Elías, 2026-10-03: «todos los resúmenes generados por
 * IA deben estar siempre arriba»; antes «Su HubSpot hoy» y el «por qué ahora» se veían dos veces). Abajo
 * quedan solo los hechos de HubSpot. Cada línea muestra lo confirmado y, debajo, lo que sugirió el
 * agente (en azul, con su chispa, para usar o descartar ahí mismo); «Editar» abre su casilla.
 */
const LO_QUE_ESCRIBE_LA_IA = ["detonante", "hubspotActual", "radiografia"] as const;

function ResumenDeLaIdentificacion({ porQueAhoraDeHubspot }: { porQueAhoraDeHubspot: string | null }) {
  const { exp, cambiar, puedeEditar, guardando, pendientesPara, abrirCasilla } = useLienzo();
  return (
    <section data-recorrido="preventa.preparacion.resumen" className="space-y-1 rounded-xl border border-line bg-surface p-5">
      <div className="flex items-start gap-2 pb-2">
        <IconoDeSugerencia className="mt-0.5 h-[18px] w-[18px] flex-shrink-0 text-brand" />
        <div>
          <h3 className="text-sm font-semibold text-fg">Resumen</h3>
          <p className="text-xs text-fg-muted">Lo que armó el agente con HubSpot e internet. Úsalo, cámbialo o descártalo; abajo, los datos de HubSpot.</p>
        </div>
      </div>
      <div className="divide-y divide-line">
        {LO_QUE_ESCRIBE_LA_IA.map((clave) => {
          const valor = exp.estado.contenido.casillas[clave];
          const pendientes = pendientesPara((d) => d.tipo === "casilla" && d.clave === clave);
          const deHubspot = clave === "detonante" && valor === undefined && pendientes.length === 0 ? porQueAhoraDeHubspot : null;
          return (
            <div key={clave} className="space-y-2 py-3 last:pb-0">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-muted">{definicionDe(clave).etiqueta}</span>
                {puedeEditar && <BotonTexto onClick={() => abrirCasilla(clave)}>{valor === undefined ? "Escribir" : "Editar"}</BotonTexto>}
              </div>
              {valor !== undefined && (
                <div className="text-[13px] leading-[1.45] text-fg-secondary">
                  <Vista clave={clave} valor={valor} />
                </div>
              )}
              {pendientes.length > 0 && (
                <ul className="space-y-1.5">
                  {pendientes.map((it) => (
                    <FilaSugerida key={it.id} item={it} />
                  ))}
                </ul>
              )}
              {deHubspot && (
                <div className="flex items-start gap-2.5 rounded-lg border border-info-line bg-info-surface py-2.5 pl-3 pr-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm leading-[1.45] text-fg">{deHubspot}</p>
                    <p className="mt-0.5 text-xs text-fg-muted">Sugerido con lo que dice HubSpot</p>
                  </div>
                  {puedeEditar && (
                    <BotonAzul
                      className="px-[11px] py-[5px]"
                      disabled={guardando}
                      onClick={() => void cambiar([{ op: "casilla", clave: "detonante", valor: deHubspot }])}
                    >
                      Usar
                    </BotonAzul>
                  )}
                </div>
              )}
              {valor === undefined && pendientes.length === 0 && !deHubspot && (
                <p className="text-xs text-fg-muted">Falta: el agente lo propone al preparar.</p>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function Detonante({ datos, senales }: { datos: DatosDePreparacion | null; senales: Senal[] }) {
  return (
    <Bloque titulo="Detonante" ayuda="Lo que hizo y de dónde llegó, según HubSpot.">
      {datos === null ? (
        <div className="space-y-2" aria-hidden>
          <Skeleton className="h-3 w-3/4" />
          <Skeleton className="h-3 w-1/2" />
        </div>
      ) : senales.length === 0 ? (
        <p className="text-sm text-fg-muted">HubSpot no tiene señales de este contacto: ni formularios ni visitas registradas.</p>
      ) : (
        <dl className="divide-y divide-line">
          {senales.map((s, i) => (
            <Dato key={i} que={s.que}>
              {s.valor}
              {s.fecha && <span className="ml-1.5 text-xs text-fg-muted">· {diaConAnio(s.fecha)}</span>}
            </Dato>
          ))}
        </dl>
      )}
    </Bloque>
  );
}

function Contacto({ datos }: { datos: DatosDePreparacion | null }) {
  const [verTodos, setVerTodos] = useState(false);
  if (datos === null) {
    return (
      <Bloque titulo="Contacto">
        <div className="space-y-2" aria-hidden>
          <Skeleton className="h-3 w-1/2" />
          <Skeleton className="h-3 w-2/3" />
        </div>
      </Bloque>
    );
  }
  const principal = datos.contactos.find((c) => c.id === datos.principalId) ?? contactoPrincipal(datos.contactos);
  const otros = datos.contactos.filter((c) => c.id !== principal?.id);
  const ficha = (c: ContactoConRastro) => {
    const tel = c.rastro.telefono;
    const wa = tel ? `https://wa.me/${tel.replace(/[^\d]/g, "")}` : null;
    return (
      <dl className="divide-y divide-line">
        <Dato que="Nombre">
          <span className="font-medium">{c.nombre}</span>
          {c.hizoElTest && (
            <Badge size="xs" variant="primary" className="ml-2">
              Hizo el diagnóstico
            </Badge>
          )}
        </Dato>
        <Dato que="Cargo">{c.cargo ?? <span className="text-fg-muted">—</span>}</Dato>
        <Dato que="Correo">
          {c.email ? (
            <a href={`mailto:${c.email}`} className="text-brand hover:underline">
              {c.email}
            </a>
          ) : (
            <span className="text-fg-muted">—</span>
          )}
        </Dato>
        <Dato que="Teléfono">
          {tel ? (
            <span className="flex flex-wrap items-center gap-2">
              <a href={`tel:${tel}`} className="text-brand hover:underline">
                {tel}
              </a>
              {wa && (
                <a href={wa} target="_blank" rel="noreferrer" className="text-xs text-fg-muted hover:text-fg hover:underline">
                  WhatsApp
                </a>
              )}
            </span>
          ) : (
            <span className="text-fg-muted">—</span>
          )}
        </Dato>
      </dl>
    );
  };
  return (
    <Bloque titulo="Contacto" ayuda="Con quién vas a hablar. Si es otra persona, está entre los demás contactos.">
      {principal ? ficha(principal) : <p className="text-sm text-fg-muted">La empresa no tiene contactos en HubSpot.</p>}
      {otros.length > 0 && (
        <div className="space-y-2">
          <button type="button" className="text-xs font-medium text-brand hover:underline" onClick={() => setVerTodos((x) => !x)}>
            {verTodos ? "Ocultar los demás contactos" : `Ver los demás contactos (${otros.length})`}
          </button>
          {verTodos && (
            <ul className="divide-y divide-line rounded-lg border border-line">
              {otros.map((c) => (
                <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
                  <span className="min-w-0">
                    <span className="font-medium text-fg">{c.nombre}</span>
                    {c.cargo && <span className="text-fg-muted"> · {c.cargo}</span>}
                  </span>
                  <span className="text-xs text-fg-muted">{[c.email, c.rastro.telefono].filter(Boolean).join(" · ")}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Bloque>
  );
}

function FichaEnHubspot({ datos }: { datos: DatosDePreparacion | null }) {
  const empresa = datos?.empresa ?? null;
  const ubicacion = [empresa?.ciudad, empresa?.pais].filter(Boolean).join(", ");
  const sitio = empresa?.sitio ?? (empresa?.dominio ? `https://${empresa.dominio}` : null);
  return (
    <Bloque titulo="Ficha en HubSpot" ayuda="Lo que HubSpot sabe de la empresa. Lo que el agente encontró en internet está arriba, en el resumen.">
      {datos === null ? (
        <div className="space-y-2" aria-hidden>
          <Skeleton className="h-3 w-2/3" />
          <Skeleton className="h-3 w-1/2" />
        </div>
      ) : empresa ? (
        <dl className="divide-y divide-line">
          <Dato que="Empresa">
            <span className="font-medium">{empresa.nombre}</span>
          </Dato>
          <Dato que="Sitio web">
            {sitio ? (
              <a href={sitio} target="_blank" rel="noreferrer" className="text-brand hover:underline">
                {sitio.replace(/^https?:\/\//, "").replace(/\/$/, "")}
              </a>
            ) : (
              <span className="text-fg-muted">—</span>
            )}
          </Dato>
          <Dato que="Industria">{empresa.industria ? empresa.industria.toLowerCase().replace(/_/g, " ") : <span className="text-fg-muted">—</span>}</Dato>
          <Dato que="Ubicación">{ubicacion || <span className="text-fg-muted">—</span>}</Dato>
          {empresa.empleados && <Dato que="Personas">{empresa.empleados}</Dato>}
        </dl>
      ) : (
        <p className="text-sm text-fg-muted">La empresa no está en HubSpot.</p>
      )}
    </Bloque>
  );
}

function Conexion({ datos }: { datos: DatosDePreparacion | null }) {
  const agendada = datos?.agenda[0] ?? null;
  const [verIgual, setVerIgual] = useState(false);
  if (agendada && !verIgual) {
    return (
      <Bloque titulo="Estrategia de conexión">
        <div className="space-y-2 rounded-lg border border-success-line bg-success-surface px-4 py-3">
          <p className="text-sm font-medium text-success-ink">Ya agendó: no hace falta contactarlo.</p>
          <p className="text-xs text-fg-secondary">
            «{agendada.titulo}», {diaYHora(agendada.inicio)}. Usa lo de arriba para preparar esa reunión.
          </p>
        </div>
        <button type="button" className="text-xs font-medium text-brand hover:underline" onClick={() => setVerIgual(true)}>
          Ver la estrategia igual
        </button>
      </Bloque>
    );
  }
  return <Casilla clave="estrategiaDeConexion" />;
}

export default function PasoPreparacion() {
  const { exp, escala } = useLienzo();
  const [datos, setDatos] = useState<DatosDePreparacion | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    void (async () => {
      try {
        const res = await fetch(`/api/sales/exploraciones/${exp.id}/preparacion`);
        const data = (await res.json().catch(() => ({}))) as Partial<DatosDePreparacion> & { error?: string };
        if (!vivo) return;
        if (!res.ok) {
          setError(data.error ?? "No se pudo leer HubSpot.");
          setDatos({ empresa: null, contactos: [], principalId: null, tests: [], agenda: [] });
          return;
        }
        setDatos({
          empresa: data.empresa ?? null,
          contactos: data.contactos ?? [],
          principalId: data.principalId ?? null,
          tests: data.tests ?? [],
          agenda: data.agenda ?? [],
        });
      } catch {
        if (vivo) setError("No se pudo leer HubSpot. Revisa tu conexión.");
      }
    })();
    return () => {
      vivo = false;
    };
  }, [exp.id]);

  const principal = datos ? (datos.contactos.find((c) => c.id === datos.principalId) ?? contactoPrincipal(datos.contactos)) : null;
  const test = datos?.tests[0];
  const senales = datos
    ? senalesDe(principal, { test: test ? { area: escala.areas.find((a) => a.id === test.areaId)?.nombre ?? "un área", fecha: test.fecha } : null })
    : [];
  /* Mientras «Por qué ahora» está vacía y el agente no propuso la suya, una sugerida con los hechos de
     HubSpot: se usa con un clic, arriba, en el resumen. */
  const porQueAhoraDeHubspot = datos ? porQueAhoraSugerido(senales, diaConAnio) : null;

  return (
    <div className="space-y-6">
      <BarraDelAgente />
      {error && <Alert variant="warning">{error} Lo demás se puede llenar igual.</Alert>}
      <div className="grid items-start gap-8 xl:grid-cols-2">
        <Columna nombre="Identificación" pregunta="Quién es, qué hace y por qué hablar ahora.">
          <ResumenDeLaIdentificacion porQueAhoraDeHubspot={porQueAhoraDeHubspot} />
          <Detonante datos={datos} senales={senales} />
          <Contacto datos={datos} />
          <FichaEnHubspot datos={datos} />
        </Columna>
        <Columna nombre="Conexión" pregunta="Qué le duele, qué le ofrecemos y cómo abrir la conversación.">
          <Casilla clave="contexto" />
          <Casilla clave="hipotesisDeValor" />
          <Conexion datos={datos} />
        </Columna>
      </div>
    </div>
  );
}
