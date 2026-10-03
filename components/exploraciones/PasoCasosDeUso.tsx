"use client";

/**
 * PasoCasosDeUso — los casos de uso de la primera propuesta.
 *
 * Pedido de Elías (2026-10-01): «la parte de propuestas, yo le pondría casos de uso; y ahí debería
 * arrancar un agente, en modo experimental, que proponga casos de uso sin la biblioteca, porque en
 * este momento está vacía». La PRIMERA vez que se abre el paso, el agente propone solo; después, otra
 * tanda con un botón (cada tanda cuesta unos centavos). El vendedor usa o descarta cada uno; lo
 * descartado no vuelve.
 *
 * Los casos de uso del agente entran a la propuesta como contexto; la sección de casos de uso con
 * precio sale solo del catálogo, como siempre. Armar la propuesta es su propia pieza desde el
 * 2026-10-01 (PasoPropuesta.tsx).
 */
import { useEffect, useState } from "react";
import { Alert, Badge, Button, Select } from "@/components/ui";
import { cn } from "@/lib/cn";
import { esCasoLibre, type CasoDeUsoElegido, type ItemPropuesto } from "@/lib/exploraciones/contenido";
import { useLienzo } from "./contexto";
import { useCorrida } from "./useCorrida";

/** Las exploraciones en las que esta pestaña ya lanzó la primera tanda (un montaje doble no lanza dos). */
const yaLanzadas = new Set<string>();

interface Caso {
  id: string;
  titulo: string;
  descripcion: string;
  precio: string | null;
}
interface DatosDelPaso {
  catalogo: Caso[];
}

/** Un caso de uso: qué es, por qué y qué dimensiones mueve. */
function TarjetaDeCaso({ caso, propuesto, acciones }: { caso: CasoDeUsoElegido; propuesto?: boolean; acciones?: React.ReactNode }) {
  const { escala } = useLienzo();
  const nombreDim = (id: string) => escala.areas.flatMap((a) => a.dimensiones).find((d) => d.id === id)?.nombre;
  const mueve = (caso.dimensiones ?? []).map(nombreDim).filter((x): x is string => !!x);
  return (
    <li className={cn("flex flex-wrap items-start justify-between gap-3 rounded-lg border px-3 py-2.5", propuesto ? "border-info-line bg-info-surface" : "border-line")}>
      <div className="min-w-0 flex-1 space-y-1">
        {propuesto && <p className="text-2xs font-semibold uppercase tracking-wide text-info-ink">Propuesto</p>}
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
      {areas.length === 0 && <p className="text-sm text-fg-muted">Elige primero las áreas en juego (en «Exploración»): los casos de uso se proponen por área.</p>}

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

export default function PasoCasosDeUso() {
  const { exp, irA } = useLienzo();
  const [datos, setDatos] = useState<DatosDelPaso | null>(null);
  const [error, setError] = useState<string | null>(null);

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
        setDatos({ catalogo: data.catalogo ?? [] });
      } catch {
        if (vivo) setError("No se pudo cargar el paso. Revisa tu conexión.");
      }
    })();
    return () => {
      vivo = false;
    };
  }, [exp.id]);

  return (
    <div className="space-y-4">
      {error && <Alert variant="danger">{error}</Alert>}
      <CasosDeUso catalogo={datos?.catalogo ?? []} />
      <p className="text-xs text-fg-muted">
        Con los casos elegidos, la propuesta se arma en{" "}
        <button type="button" className="text-info-ink hover:underline" onClick={() => irA("propuesta")}>
          Propuesta
        </button>
        .
      </p>
    </div>
  );
}
