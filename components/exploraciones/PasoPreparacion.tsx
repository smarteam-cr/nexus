"use client";

/**
 * PasoPreparacion — todo lo que hace falta ANTES de escribirle o llamarle (pedido de Elías,
 * 2026-10-02). Dos pestañas desde el 2026-10-06 (antes, dos columnas: se veía apretado):
 *
 *   - Identificación: arriba, el resumen con todo lo que escribe la IA (el «por qué ahora», su CRM
 *     actualmente, la radiografía de la empresa y la investigación de su industria), una sola vez
 *     (Elías, 2026-10-03); abajo, solo los hechos de HubSpot: las señales (lo que hizo y de dónde
 *     llegó) y, en una fila, la ficha de contacto y la ficha de empresa. La escala y las áreas en
 *     juego viven en La escala.
 *   - Conexión: lo que todavía no se dijo en Identificación y sirve para abrir la conversación, la
 *     hipótesis de valor (cada idea con de dónde sale) y la estrategia de conexión. Con conversación
 *     (agendó, ya hablaron o agendó por HubSpot) la estrategia y su correo de ejemplo sobran: arriba
 *     lo dice y la estrategia se ve solo si se pide (Elías, 2026-10-07).
 *
 * Los hechos de HubSpot se leen al abrir la pieza y no se guardan; lo que interpreta el agente vive
 * en sus casillas, como todo lo demás: lo propone y el vendedor lo usa o lo descarta.
 */
import { useEffect, useState } from "react";
import { Alert, Badge, Button, Segmentado, Skeleton } from "@/components/ui";
import { EVENTO_DEL_RECORRIDO, type AccionDelRecorrido } from "@/lib/recorridos/tipos";
import { cn } from "@/lib/cn";
import { diaConAnio, diaYHora } from "@/lib/exploraciones/fechas";
import { definicionDe } from "@/lib/exploraciones/casillas";
import { debePrepararSola, estadoDeLaPreparacion, ultimaPreparacion, type CorridasAlAbrir } from "@/lib/exploraciones/preparar-sola";
import { contactoPrincipal, estadoDeLaConexion, porQueAhoraSugerido, senalesDe, type ContactoConRastro, type EstadoDeLaConexion, type Senal } from "@/lib/exploraciones/senales";
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

type Pestana = "identificacion" | "conexion";

const PESTANAS: { clave: Pestana; etiqueta: string; pregunta: string }[] = [
  { clave: "identificacion", etiqueta: "Identificación", pregunta: "Quién es, qué hace y por qué hablar ahora." },
  { clave: "conexion", etiqueta: "Conexión", pregunta: "Qué le duele, qué le ofrecemos y cómo abrir la conversación." },
];

/** Una tarjeta de la pieza: título, una línea de ayuda y su contenido. */
function Bloque({ titulo, ayuda, children, className }: { titulo: string; ayuda?: string; children: React.ReactNode; className?: string }) {
  return (
    <section data-recorrido={titulo === "Ficha de contacto" ? "preventa.preparacion.contacto" : undefined} className={cn("space-y-4 rounded-xl border border-line bg-surface p-5", className)}>
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
const LO_QUE_ESCRIBE_LA_IA = ["detonante", "hubspotActual", "radiografia", "industria"] as const;

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

function SenalesDeHubspot({ datos, senales }: { datos: DatosDePreparacion | null; senales: Senal[] }) {
  return (
    <Bloque titulo="Señales de HubSpot" ayuda="Lo que hizo y de dónde llegó, según HubSpot.">
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
      <Bloque titulo="Ficha de contacto">
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
                <a
                  href={wa}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-md border border-line bg-surface px-2.5 py-[5px] text-xs font-medium text-fg-secondary transition-colors hover:bg-surface-hover hover:text-fg"
                >
                  <svg viewBox="0 0 16 16" aria-hidden className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round">
                    <path d="M2.5 13.5l.9-2.6A5.5 5.5 0 1 1 5.6 13l-3.1.5z" />
                  </svg>
                  Escribir por WhatsApp
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
    <Bloque titulo="Ficha de contacto" ayuda="Con quién vas a hablar. Si es otra persona, está entre los demás contactos.">
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

function FichaDeEmpresa({ datos }: { datos: DatosDePreparacion | null }) {
  const empresa = datos?.empresa ?? null;
  const ubicacion = [empresa?.ciudad, empresa?.pais].filter(Boolean).join(", ");
  const sitio = empresa?.sitio ?? (empresa?.dominio ? `https://${empresa.dominio}` : null);
  return (
    <Bloque titulo="Ficha de empresa" ayuda="Lo que HubSpot sabe de la empresa. Lo que el agente encontró en internet está arriba, en el resumen.">
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

/** Lo que dice el aviso de arriba de Conexión, según con qué conversación se cuenta. */
function textoDeLaConexion(c: Exclude<EstadoDeLaConexion, { tipo: "sin-contacto" }>): { titulo: string; detalle: string } {
  if (c.tipo === "agendada") return { titulo: "Ya agendó: no hace falta contactarlo.", detalle: `«${c.titulo}», ${diaYHora(c.inicio)}. Prepara esa reunión en Exploración.` };
  if (c.tipo === "ya-hablaron") {
    const otras = c.cuantas > 1 ? ` Hay ${c.cuantas} reuniones con la empresa.` : "";
    return { titulo: "Ya hablaron: no hace falta contactarlo.", detalle: `La última reunión fue «${c.titulo}», el ${diaConAnio(c.fecha)}.${otras} Lo que sigue se prepara en Exploración.` };
  }
  return { titulo: "Ya agendó por HubSpot: no hace falta contactarlo.", detalle: `Agendó una reunión con la herramienta de reuniones de HubSpot el ${diaConAnio(c.fecha)}.` };
}

/**
 * Con conversación, arriba de todo y en verde (Elías, 2026-10-07: «en un momento me parece que ni lo
 * vi»: iba al final de la pestaña). La estrategia de conexión y su correo de ejemplo se ven solo si se
 * piden. Sin conversación, la estrategia va al final, como siempre.
 */
function Conexion({ conexion }: { conexion: EstadoDeLaConexion }) {
  const { irA } = useLienzo();
  const [verIgual, setVerIgual] = useState(false);
  if (conexion.tipo === "sin-contacto") return <Casilla clave="estrategiaDeConexion" />;
  const t = textoDeLaConexion(conexion);
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-success-line bg-success-surface px-5 py-4">
        <div className="min-w-0 space-y-0.5">
          <p className="text-sm font-semibold text-success-ink">{t.titulo}</p>
          <p className="text-xs text-fg-secondary">{t.detalle}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" className="text-xs font-medium text-brand hover:underline" onClick={() => setVerIgual((x) => !x)}>
            {verIgual ? "Ocultar la estrategia de conexión" : "Ver la estrategia de conexión igual"}
          </button>
          <button type="button" className="text-xs font-medium text-brand hover:underline" onClick={() => irA("exploracion")}>
            Ir a Exploración
          </button>
        </div>
      </div>
      {verIgual && <Casilla clave="estrategiaDeConexion" />}
    </>
  );
}

export default function PasoPreparacion() {
  const { exp, escala, reuniones } = useLienzo();
  const [datos, setDatos] = useState<DatosDePreparacion | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pestana, setPestana] = useState<Pestana>("identificacion");

  // El recorrido de la preventa abre la pestaña que señala (lib/recorridos/contenido/preventa.ts).
  useEffect(() => {
    const alPedido = (e: Event) => {
      const a = (e as CustomEvent<AccionDelRecorrido>).detail;
      if (a?.evento === "preventa.preparacion" && (a.valor === "identificacion" || a.valor === "conexion")) setPestana(a.valor);
    };
    window.addEventListener(EVENTO_DEL_RECORRIDO, alPedido);
    return () => window.removeEventListener(EVENTO_DEL_RECORRIDO, alPedido);
  }, []);

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
  // La agenda que viene y las reuniones salen del lienzo (ya están al abrir); lo que agendó, del contacto.
  const conexion = estadoDeLaConexion({ agenda: exp.leido.agenda, reuniones, agendo: principal?.rastro.agendo ?? null });

  return (
    <div className="space-y-6">
      <BarraDelAgente />
      {error && <Alert variant="warning">{error} Lo demás se puede llenar igual.</Alert>}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <Segmentado<Pestana>
          etiqueta="Qué parte de la preparación"
          tamano="grande"
          opciones={PESTANAS.map((p) => ({ clave: p.clave, etiqueta: p.etiqueta }))}
          valor={pestana}
          onCambio={setPestana}
        />
        <p className="text-sm text-fg-secondary">{PESTANAS.find((p) => p.clave === pestana)?.pregunta}</p>
      </div>
      {pestana === "identificacion" ? (
        <div className="space-y-4">
          <ResumenDeLaIdentificacion porQueAhoraDeHubspot={porQueAhoraDeHubspot} />
          <SenalesDeHubspot datos={datos} senales={senales} />
          <div className="grid items-start gap-4 lg:grid-cols-2">
            <Contacto datos={datos} />
            <FichaDeEmpresa datos={datos} />
          </div>
        </div>
      ) : (
        <div data-recorrido="preventa.preparacion.conexion" className="space-y-4">
          {conexion.tipo !== "sin-contacto" && <Conexion conexion={conexion} />}
          <Casilla clave="contexto" />
          <Casilla clave="hipotesisDeValor" />
          {conexion.tipo === "sin-contacto" && <Conexion conexion={conexion} />}
        </div>
      )}
    </div>
  );
}
