"use client";

/**
 * PasoCasosDeUso — los casos de uso de la primera propuesta, y la propuesta.
 *
 * Pedido de Elías (2026-10-01): «la parte de propuestas, yo le pondría casos de uso; y ahí debería
 * arrancar un agente, en modo experimental, que proponga casos de uso sin la biblioteca, porque en
 * este momento está vacía». La PRIMERA vez que se abre el paso, el agente propone solo; después, otra
 * tanda con un botón (cada tanda cuesta unos centavos). El vendedor usa o descarta cada uno; lo
 * descartado no vuelve.
 *
 * Abajo, como cierre: ¿está lista para proponer? (los siete puntos: avisan, no bloquean) y el botón
 * que arma la Propuesta de Nexus y la genera. Los casos de uso del agente entran a la propuesta como
 * contexto; la sección de casos de uso con precio sale solo del catálogo, como siempre.
 */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Alert, Badge, Button, Input, Select, Skeleton, useToast } from "@/components/ui";
import { cn } from "@/lib/cn";
import { listaParaProponer } from "@/lib/exploraciones/calidad";
import { esCasoLibre, type CasoDeUsoElegido, type ItemPropuesto } from "@/lib/exploraciones/contenido";
import { diaCorto } from "@/lib/exploraciones/fechas";
import { useLienzo } from "./contexto";
import { useCorrida } from "./useCorrida";

/** Las exploraciones en las que esta pestaña ya lanzó la primera tanda (un montaje doble no lanza dos). */
const yaLanzadas = new Set<string>();

interface Negocio {
  id: string;
  name: string;
  isWon: boolean;
  isClosed: boolean;
  pipeline: string | null;
  stage: string | null;
}
interface Caso {
  id: string;
  titulo: string;
  descripcion: string;
  precio: string | null;
}
interface PropuestaArmada {
  id: string;
  nombre: string;
  estado: string;
  creadaEn: string;
}
interface DatosDelPaso {
  negocios: Negocio[] | null;
  catalogo: Caso[];
  propuestas: PropuestaArmada[];
}

const ESTADO_DE_LA_PROPUESTA: Record<string, string> = { DRAFT: "Borrador", PUBLISHED: "Publicada", ARCHIVED: "Archivada" };

export function ListaParaProponer() {
  const { exp, chequeo } = useLienzo();
  const puntos = listaParaProponer(exp.estado, chequeo);
  const cumplidos = puntos.filter((p) => p.cumplido).length;
  return (
    <section className="space-y-3 rounded-xl border border-line bg-surface p-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-fg">Lista para proponer</h3>
        <span className="text-xs tabular-nums text-fg-muted">
          {cumplidos} de {puntos.length}
        </span>
      </div>
      <ul className="space-y-1.5">
        {puntos.map((p) => (
          <li key={p.id} className="flex items-center gap-2 text-sm">
            <span
              className={cn(
                "flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full border text-2xs",
                p.cumplido ? "border-success-line bg-success-surface text-success-ink" : "border-line text-fg-muted",
              )}
              aria-hidden="true"
            >
              {p.cumplido ? "✓" : ""}
            </span>
            <span className={p.cumplido ? "text-fg" : "text-fg-secondary"}>{p.titulo}</span>
            <span className="sr-only">{p.cumplido ? "cumplido" : "falta"}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Un caso de uso: qué es, por qué y qué dimensiones mueve. */
function TarjetaDeCaso({ caso, propuesto, acciones }: { caso: CasoDeUsoElegido; propuesto?: boolean; acciones?: React.ReactNode }) {
  const { escala } = useLienzo();
  const nombreDim = (id: string) => escala.areas.flatMap((a) => a.dimensiones).find((d) => d.id === id)?.nombre;
  const mueve = (caso.dimensiones ?? []).map(nombreDim).filter((x): x is string => !!x);
  return (
    <li className={cn("flex flex-wrap items-start justify-between gap-3 rounded-lg border px-3 py-2.5", propuesto ? "border-brand/25 bg-brand/5" : "border-line")}>
      <div className="min-w-0 flex-1 space-y-1">
        {propuesto && <p className="text-2xs font-semibold uppercase tracking-wide text-brand-light">Propuesto</p>}
        <p className="text-sm font-medium text-fg">{caso.titulo}</p>
        {caso.descripcion && <p className="text-xs text-fg-secondary">{caso.descripcion}</p>}
        {caso.razon && (
          <p className="text-xs text-fg-muted">
            <span className="font-medium text-fg-secondary">Por qué: </span>
            {caso.razon}
          </p>
        )}
        {mueve.length > 0 && <p className="text-2xs text-fg-muted">Mueve: {mueve.join(" · ")}</p>}
      </div>
      {acciones && <div className="flex flex-shrink-0 items-center gap-1.5">{acciones}</div>}
    </li>
  );
}

function CasosDeUso({ catalogo }: { catalogo: Caso[] }) {
  const { exp, escala, cambiar, puedeEditar, guardando, pendientesPara } = useLienzo();
  const { corrida, corriendo, lanzando, lanzar } = useCorrida();
  const e = exp.estado;
  const elegidos = Object.entries(e.contenido.casosDeUso);
  const areas = escala.areas.filter((a) => e.areas.includes(a.id));
  const propuestos = pendientesPara((d) => d.tipo === "casoDeUso");
  const libres = catalogo.filter((c) => !(c.id in e.contenido.casosDeUso));
  const yaPropuso = e.propuesta.corridas.some((c) => c.modo === "casos");

  /* La primera vez que se abre el paso, el agente propone solo. Si en ese momento ya trabajaba en
     otra cosa, no se insiste: queda el botón. */
  useEffect(() => {
    if (!puedeEditar || areas.length === 0 || yaPropuso || yaLanzadas.has(exp.id)) return;
    yaLanzadas.add(exp.id);
    void lanzar("casos");
  }, [puedeEditar, areas.length, yaPropuso, exp.id, lanzar]);

  const usar = (it: ItemPropuesto) => void cambiar([{ op: "usar", itemId: it.id, valor: it.valor }]);
  const descartar = (it: ItemPropuesto) => void cambiar([{ op: "descartar", itemIds: [it.id] }]);
  const quitar = (id: string) => void cambiar([{ op: "casoDeUso", useCaseId: id, valor: null }]);
  const elegirDelCatalogo = (caso: Caso, areaId: string | null) =>
    void cambiar([{ op: "casoDeUso", useCaseId: caso.id, valor: { titulo: caso.titulo, areaId, razon: caso.descripcion.slice(0, 400) } }]);
  const sinArea = elegidos.filter(([, c]) => !c.areaId || !e.areas.includes(c.areaId));
  const esPropia = corrida?.modo === "casos";

  return (
    <section className="space-y-4 rounded-xl border border-line bg-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-fg">
            Casos de uso
            <Badge size="xs" variant="purple">
              Experimental
            </Badge>
          </h3>
          <p className="text-xs text-fg-muted">
            El agente los propone a partir de dónde está cada equipo en la escala, lo que le falta para Funcional y lo que contó el cliente. Todavía no usa la biblioteca de casos de uso: son propuestas para conversar, sin precio. Cada tanda cuesta unos centavos de dólar.
          </p>
        </div>
        {puedeEditar && (
          <Button size="sm" variant="secondary" loading={lanzando} disabled={corriendo || areas.length === 0} onClick={() => void lanzar("casos")}>
            {yaPropuso || propuestos.length > 0 ? "Proponer otra tanda" : "Proponer casos de uso"}
          </Button>
        )}
      </div>
      {corriendo && (
        <p className="text-xs text-fg-secondary" role="status">
          {corrida?.etiqueta ?? "El agente está trabajando"}: {corrida?.fase ?? "empezando…"}
        </p>
      )}
      {corrida?.estado === "ERROR" && esPropia && <Alert variant="danger">{corrida.error}</Alert>}
      {areas.length === 0 && <p className="text-sm text-fg-muted">Elige primero las áreas en juego (paso «Preparación»): los casos de uso se proponen por área.</p>}

      {areas.map((a) => {
        const susElegidos = elegidos.filter(([, c]) => c.areaId === a.id);
        const susPropuestos = propuestos.filter((it) => (it.valor as CasoDeUsoElegido).areaId === a.id);
        return (
          <div key={a.id} className="space-y-2">
            <p className="text-xs font-semibold text-fg-secondary">{a.nombre}</p>
            {susElegidos.length === 0 && susPropuestos.length === 0 && (
              <p className="text-xs text-fg-muted">{corriendo ? "El agente está pensando los de esta área…" : "Todavía ninguno."}</p>
            )}
            <ul className="space-y-2">
              {susElegidos.map(([id, caso]) => (
                <TarjetaDeCaso
                  key={id}
                  caso={caso}
                  acciones={
                    <>
                      <Badge size="xs" variant="success">
                        {esCasoLibre(id) ? "Elegido" : "Del catálogo"}
                      </Badge>
                      {puedeEditar && (
                        <Button size="xs" variant="ghost" disabled={guardando} onClick={() => quitar(id)}>
                          Quitar
                        </Button>
                      )}
                    </>
                  }
                />
              ))}
              {susPropuestos.map((it) => (
                <TarjetaDeCaso
                  key={it.id}
                  caso={it.valor as CasoDeUsoElegido}
                  propuesto
                  acciones={
                    puedeEditar && (
                      <>
                        <Button size="xs" variant="primary" disabled={guardando} onClick={() => usar(it)}>
                          Usar
                        </Button>
                        <Button size="xs" variant="secondary" disabled={guardando} onClick={() => descartar(it)}>
                          Descartar
                        </Button>
                      </>
                    )
                  }
                />
              ))}
            </ul>
          </div>
        );
      })}

      {sinArea.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-fg-secondary">Sin área en juego</p>
          <ul className="space-y-2">
            {sinArea.map(([id, caso]) => (
              <TarjetaDeCaso
                key={id}
                caso={caso}
                acciones={
                  puedeEditar && (
                    <Button size="xs" variant="ghost" disabled={guardando} onClick={() => quitar(id)}>
                      Quitar
                    </Button>
                  )
                }
              />
            ))}
          </ul>
        </div>
      )}

      {libres.length > 0 && (
        <details className="rounded-lg border border-line">
          <summary className="cursor-pointer select-none px-3 py-2 text-xs font-medium text-fg-secondary">Del catálogo de Smarteam ({libres.length})</summary>
          <ul className="divide-y divide-line">
            {libres.map((c) => (
              <li key={c.id} className="flex flex-wrap items-start justify-between gap-2 px-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-fg">
                    {c.titulo}
                    {c.precio && (
                      <Badge size="xs" className="ml-2">
                        {c.precio}
                      </Badge>
                    )}
                  </p>
                  <p className="line-clamp-2 text-xs text-fg-muted">{c.descripcion}</p>
                </div>
                {puedeEditar && (
                  <Select
                    aria-label={`Agregar «${c.titulo}»`}
                    value=""
                    disabled={guardando}
                    onChange={(ev) => {
                      if (ev.target.value) elegirDelCatalogo(c, ev.target.value === "-" ? null : ev.target.value);
                    }}
                  >
                    <option value="">Agregar a…</option>
                    {areas.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.nombre}
                      </option>
                    ))}
                    <option value="-">Sin área</option>
                  </Select>
                )}
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

function ArmarLaPropuesta({ negocios, propuestas, alRecargar }: { negocios: Negocio[] | null; propuestas: PropuestaArmada[]; alRecargar: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const { exp, chequeo, puedeEditar, guardando, alDia } = useLienzo();
  const abiertos = (negocios ?? []).filter((n) => !n.isClosed);
  const [dealId, setDealId] = useState(abiertos[0]?.id ?? negocios?.[0]?.id ?? "");
  const [nombre, setNombre] = useState(`Propuesta — ${exp.empresa.nombre}`);
  const [armando, setArmando] = useState(false);
  const faltan = listaParaProponer(exp.estado, chequeo).filter((p) => !p.cumplido).length;

  async function armar() {
    setArmando(true);
    try {
      // Lo que se acaba de elegir (un caso de uso, por ejemplo) tiene que estar guardado antes.
      await alDia();
      const res = await fetch(`/api/sales/exploraciones/${exp.id}/propuesta`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dealId, nombre }),
      });
      const data = (await res.json().catch(() => ({}))) as { businessCaseId?: string; error?: string };
      if (!res.ok || !data.businessCaseId) {
        toast.error(data.error ?? "No se pudo armar la propuesta.");
        return;
      }
      // La genera con IA de una vez: la pantalla de la propuesta retoma la generación en curso.
      await fetch(`/api/business-cases/${data.businessCaseId}/generate`, { method: "POST" }).catch(() => null);
      router.push(`/business-cases/${data.businessCaseId}`);
    } catch {
      toast.error("No se pudo armar la propuesta. Revisa tu conexión.");
    } finally {
      setArmando(false);
    }
  }

  const etiquetaDelNegocio = (n: Negocio) =>
    `${n.name}${n.stage ? ` · ${n.stage}` : ""}${n.isWon ? " · ganado" : n.isClosed ? " · cerrado" : ""}`;

  return (
    <section className="space-y-3 rounded-xl border border-line bg-surface p-4">
      <div>
        <h3 className="text-sm font-semibold text-fg">Armar la propuesta</h3>
        <p className="text-xs text-fg-muted">
          Crea la Propuesta de Nexus con lo que puede ver el cliente de este lienzo y la genera con IA: sus metas en cifras como criterio de éxito, el nivel de cada área tal como quedó confirmado y los casos de uso elegidos. Lo interno (hipótesis, presupuesto, quién decide, lo que nadie exploró) no entra. El precio se pone a mano, como siempre.
        </p>
      </div>
      {negocios === null ? (
        <Alert variant="warning" title="No se pudo consultar HubSpot">
          Sin el negocio no se puede armar la propuesta.{" "}
          <button type="button" className="underline" onClick={alRecargar}>
            Volver a intentar
          </button>
        </Alert>
      ) : negocios.length === 0 ? (
        <Alert variant="warning" title="La empresa no tiene negocios en HubSpot">
          La propuesta se une al proyecto por el negocio: créalo en HubSpot y vuelve.{" "}
          <button type="button" className="underline" onClick={alRecargar}>
            Volver a buscar
          </button>
        </Alert>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          <label className="space-y-1.5">
            <span className="block text-xs font-medium text-fg-secondary">Negocio en HubSpot</span>
            <Select value={dealId} disabled={!puedeEditar || armando} onChange={(ev) => setDealId(ev.target.value)}>
              {negocios.map((n) => (
                <option key={n.id} value={n.id}>
                  {etiquetaDelNegocio(n)}
                </option>
              ))}
            </Select>
          </label>
          <label className="space-y-1.5">
            <span className="block text-xs font-medium text-fg-secondary">Nombre de la propuesta</span>
            <Input value={nombre} disabled={!puedeEditar || armando} onChange={(ev) => setNombre(ev.target.value)} maxLength={200} />
          </label>
        </div>
      )}
      {faltan > 0 && negocios && negocios.length > 0 && (
        <p className="text-xs text-fg-muted">
          Faltan {faltan} de los siete puntos de «lista para proponer». Puedes armarla igual: lo que falta queda a la vista arriba.
        </p>
      )}
      {puedeEditar && negocios && negocios.length > 0 && (
        <Button variant="primary" loading={armando} disabled={!dealId || !nombre.trim() || guardando} onClick={() => void armar()}>
          Armar y generar la propuesta
        </Button>
      )}
      {propuestas.length > 0 && (
        <div className="space-y-1.5 border-t border-line pt-3">
          <p className="text-xs font-medium text-fg-secondary">Propuestas que nacieron de esta exploración</p>
          <ul className="space-y-1">
            {propuestas.map((p) => (
              <li key={p.id} className="text-sm">
                <Link href={`/business-cases/${p.id}`} className="text-brand-light hover:underline">
                  {p.nombre}
                </Link>
                <span className="text-xs text-fg-muted">
                  {" "}
                  · {ESTADO_DE_LA_PROPUESTA[p.estado] ?? p.estado} · {diaCorto(p.creadaEn)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

export default function PasoCasosDeUso() {
  const { exp } = useLienzo();
  const [datos, setDatos] = useState<DatosDelPaso | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Cada «volver a intentar» vuelve a pedir el paso (los negocios se leen de HubSpot).
  const [intento, setIntento] = useState(0);

  useEffect(() => {
    let vivo = true;
    void (async () => {
      try {
        const res = await fetch(`/api/sales/exploraciones/${exp.id}/propuesta`);
        const data = (await res.json().catch(() => ({}))) as Partial<DatosDelPaso> & { error?: string };
        if (!vivo) return;
        if (!res.ok) {
          setError(data.error ?? "No se pudo cargar el paso.");
          return;
        }
        setError(null);
        setDatos({ negocios: data.negocios ?? null, catalogo: data.catalogo ?? [], propuestas: data.propuestas ?? [] });
      } catch {
        if (vivo) setError("No se pudo cargar el paso. Revisa tu conexión.");
      }
    })();
    return () => {
      vivo = false;
    };
  }, [exp.id, intento]);

  return (
    <div className="space-y-4">
      <CasosDeUso catalogo={datos?.catalogo ?? []} />
      <ListaParaProponer />
      {error && <Alert variant="danger">{error}</Alert>}
      {!datos && !error ? (
        <div className="space-y-3" aria-hidden>
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : datos ? (
        <ArmarLaPropuesta
          key={datos.negocios?.map((n) => n.id).join(",") ?? "sin"}
          negocios={datos.negocios}
          propuestas={datos.propuestas}
          alRecargar={() => setIntento((n) => n + 1)}
        />
      ) : null}
    </div>
  );
}
