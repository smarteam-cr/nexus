"use client";

/**
 * PasoPreparacion — todo lo que hace falta ANTES de escribirle o llamarle (pedido de Elías,
 * 2026-10-02). Dos columnas:
 *
 *   - Identificación: el detonante (los hechos de HubSpot y el «por qué ahora» que interpreta el
 *     agente), el contacto, la radiografía de la empresa (su ficha de HubSpot y lo que el agente
 *     investigó en internet), la industria y el perfil, las áreas en juego y su HubSpot hoy.
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
import { contactoPrincipal, senalesDe, type ContactoConRastro } from "@/lib/exploraciones/senales";
import { Casilla } from "./Casilla";
import { useLienzo } from "./contexto";
import { AreasEnJuego, IndustriaYPerfil } from "./Identificacion";
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
    <div className="min-w-0 space-y-4">
      <div className="border-b border-line pb-2">
        <p className="text-2xs font-semibold uppercase tracking-widest text-brand-light">{nombre}</p>
        <p className="text-sm text-fg-secondary">{pregunta}</p>
      </div>
      {children}
    </div>
  );
}

/** Una tarjeta de la pieza: título, una línea de ayuda y su contenido. */
function Bloque({ titulo, ayuda, children, className }: { titulo: string; ayuda?: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("space-y-4 rounded-xl border border-line bg-surface p-5", className)}>
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

/** Lo que hace el agente en esta pieza, con su estado. */
function BarraDelAgente() {
  const { exp, puedeEditar } = useLienzo();
  const { corrida, corriendo, lanzando, lanzar } = useCorrida();
  const ultima = [...exp.estado.propuesta.corridas].reverse().find((c) => c.modo === "preparar");
  const trabajando = corriendo && corrida?.modo === "preparar";
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-brand/20 bg-brand/5 px-5 py-4">
      <div className="min-w-0 space-y-0.5">
        <p className="text-sm font-semibold text-fg">{trabajando ? "El agente está preparando" : ultima ? "Preparada por el agente" : "Prepara la exploración con el agente"}</p>
        <p className="text-xs text-fg-secondary" role={trabajando ? "status" : undefined}>
          {trabajando
            ? (corrida?.fase ?? "Empezando…")
            : ultima
              ? `${diaYHora(ultima.en)} · ${ultima.propuestos === 0 ? "nada nuevo que proponer" : `${ultima.propuestos} ${ultima.propuestos === 1 ? "propuesta" : "propuestas"} para revisar`}`
              : "Investiga la empresa en internet, lee HubSpot y el diagnóstico, y propone el «por qué ahora», la radiografía, la hipótesis de valor y cómo conectar."}
        </p>
      </div>
      {puedeEditar && (
        <Button size="sm" variant={ultima ? "secondary" : "primary"} loading={lanzando || trabajando} disabled={corriendo} onClick={() => void lanzar("preparar")}>
          {ultima ? "Volver a preparar" : "Preparar con el agente"}
        </Button>
      )}
      {corrida?.estado === "ERROR" && corrida.modo === "preparar" && (
        <Alert variant="danger" className="w-full">
          {corrida.error}
        </Alert>
      )}
    </div>
  );
}

function Detonante({ datos }: { datos: DatosDePreparacion | null }) {
  const { escala } = useLienzo();
  const principal = datos ? (datos.contactos.find((c) => c.id === datos.principalId) ?? contactoPrincipal(datos.contactos)) : null;
  const test = datos?.tests[0];
  const senales = datos
    ? senalesDe(principal, { test: test ? { area: escala.areas.find((a) => a.id === test.areaId)?.nombre ?? "un área", fecha: test.fecha } : null })
    : [];
  return (
    <Bloque titulo="Detonante" ayuda="Por qué hablar ahora: lo que hizo y de dónde llegó, según HubSpot.">
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
      <Casilla clave="detonante" className="rounded-none border-0 border-t border-line bg-transparent p-0 pt-4" />
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
            <a href={`mailto:${c.email}`} className="text-brand-light hover:underline">
              {c.email}
            </a>
          ) : (
            <span className="text-fg-muted">—</span>
          )}
        </Dato>
        <Dato que="Teléfono">
          {tel ? (
            <span className="flex flex-wrap items-center gap-2">
              <a href={`tel:${tel}`} className="text-brand-light hover:underline">
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
          <button type="button" className="text-xs font-medium text-brand-light hover:underline" onClick={() => setVerTodos((x) => !x)}>
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

function RadiografiaDeLaEmpresa({ datos }: { datos: DatosDePreparacion | null }) {
  const empresa = datos?.empresa ?? null;
  const ubicacion = [empresa?.ciudad, empresa?.pais].filter(Boolean).join(", ");
  const sitio = empresa?.sitio ?? (empresa?.dominio ? `https://${empresa.dominio}` : null);
  return (
    <Bloque titulo="Radiografía de la empresa" ayuda="Su ficha en HubSpot y lo que el agente encontró en internet.">
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
              <a href={sitio} target="_blank" rel="noreferrer" className="text-brand-light hover:underline">
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
      <Casilla clave="radiografia" sinTitulo className="rounded-none border-0 border-t border-line bg-transparent p-0 pt-4" />
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
        <button type="button" className="text-xs font-medium text-brand-light hover:underline" onClick={() => setVerIgual(true)}>
          Ver la estrategia igual
        </button>
      </Bloque>
    );
  }
  return <Casilla clave="estrategiaDeConexion" />;
}

export default function PasoPreparacion() {
  const { exp } = useLienzo();
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

  return (
    <div className="space-y-6">
      <BarraDelAgente />
      {error && <Alert variant="warning">{error} Lo demás se puede llenar igual.</Alert>}
      <div className="grid items-start gap-8 xl:grid-cols-2">
        <Columna nombre="Identificación" pregunta="Quién es, qué hace y por qué hablar ahora.">
          <Detonante datos={datos} />
          <Contacto datos={datos} />
          <RadiografiaDeLaEmpresa datos={datos} />
          <IndustriaYPerfil />
          <AreasEnJuego />
          <Casilla clave="hubspotActual" />
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
