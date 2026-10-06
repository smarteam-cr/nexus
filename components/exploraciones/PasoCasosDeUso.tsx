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
 * Se ve como en el diseño del 2026-10-03: una franja azul arriba (cuántos sugiere el agente, otra
 * tanda, usar todos), los elegidos como filas con su marca verde, y los sugeridos en dos columnas de
 * tarjetas compactas con el porqué plegado.
 *
 * Los casos de uso del agente entran a la propuesta como contexto; la sección de casos de uso con
 * precio sale solo del catálogo, como siempre. Armar la propuesta es su propia pieza desde el
 * 2026-10-01 (PasoPropuesta.tsx).
 */
import { useEffect, useState } from "react";
import { Alert, Badge, Select } from "@/components/ui";
import { cn } from "@/lib/cn";
import { esCasoLibre, type CasoDeUsoElegido, type ItemPropuesto } from "@/lib/exploraciones/contenido";
import { useRecorridos } from "@/components/recorridos/contexto";
import { useLienzo } from "./contexto";
import FranjaDeSugerencias, { BotonAzul, BotonBlanco, BotonTexto, IconoDeSugerencia } from "./FranjaDeSugerencias";
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

/** Las dimensiones que mueve un caso, por nombre. */
function useMueve(caso: CasoDeUsoElegido): string[] {
  const { escala } = useLienzo();
  const nombreDim = (id: string) => escala.areas.flatMap((a) => a.dimensiones).find((d) => d.id === id)?.nombre;
  return (caso.dimensiones ?? []).map(nombreDim).filter((x): x is string => !!x);
}

/** Un caso elegido: una fila con su marca verde, el área y lo que mueve. */
function FilaElegida({ id, caso, onQuitar }: { id: string; caso: CasoDeUsoElegido; onQuitar?: () => void }) {
  const { escala, guardando } = useLienzo();
  const mueve = useMueve(caso);
  const area = escala.areas.find((a) => a.id === caso.areaId)?.nombre ?? "Sin área";
  return (
    <li className="flex items-center gap-3 rounded-xl border border-line bg-surface px-3.5 py-3">
      <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-success-surface text-xs font-bold text-success-ink" aria-hidden="true">
        ✓
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-fg">{caso.titulo}</p>
        <p className="text-xs text-fg-muted">
          {area}
          {!esCasoLibre(id) && " · del catálogo"}
          {mueve.length > 0 && ` · Mueve: ${mueve.join(", ")}`}
        </p>
      </div>
      {onQuitar && (
        <BotonTexto className="flex-shrink-0" disabled={guardando} onClick={onQuitar}>
          Quitar
        </BotonTexto>
      )}
    </li>
  );
}

/** Un caso sugerido: tarjeta compacta con el porqué plegado, «Descartar» en texto y «Usar». */
function TarjetaSugerida({ item }: { item: ItemPropuesto }) {
  const { escala, cambiar, puedeEditar, guardando } = useLienzo();
  const [abierta, setAbierta] = useState(false);
  const caso = item.valor as CasoDeUsoElegido;
  const mueve = useMueve(caso);
  const area = escala.areas.find((a) => a.id === caso.areaId)?.nombre;
  const cita = item.fuentes.find((f) => f.cita);
  const porQue = caso.razon || item.razon;
  const hayMas = !!porQue || !!cita || (caso.descripcion?.length ?? 0) > 120;
  return (
    <li className="flex flex-col rounded-xl border border-info-line bg-surface">
      <div className="flex flex-col gap-1.5 px-4 pb-3 pt-3.5">
        <p className="flex items-center gap-1.5">
          <span className="inline-flex items-center gap-1 rounded-full border border-info-line bg-info-surface py-0.5 pl-1.5 pr-2 text-[11px] font-semibold leading-none text-brand">
            <IconoDeSugerencia className="h-[13px] w-[13px]" />
            Sugerido
          </span>
          {area && <span className="text-xs text-fg-muted">{area}</span>}
        </p>
        <h3 className="text-[15px] font-semibold leading-[1.35] text-fg">{caso.titulo}</h3>
        {caso.descripcion && <p className={cn("text-[13px] leading-normal text-fg-secondary", !abierta && "line-clamp-2")}>{caso.descripcion}</p>}
        {mueve.length > 0 && (
          <p className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] text-fg-muted">Mueve</span>
            {mueve.map((m) => (
              <span key={m} className="rounded-md border border-line bg-surface-hover px-2 py-0.5 text-[11px] font-medium text-fg-secondary">
                {m}
              </span>
            ))}
          </p>
        )}
        {abierta && (porQue || cita?.cita) && (
          <div className="mt-1 rounded-lg bg-surface-muted px-3 py-2.5 text-[13px] leading-normal text-fg-secondary">
            {porQue && (
              <>
                <span className="font-medium text-fg">Por qué: </span>
                {porQue}
              </>
            )}
            {cita?.cita && (
              <span className="mt-1 block text-xs italic text-fg-muted">
                «{cita.cita}» · {cita.etiqueta}
              </span>
            )}
          </div>
        )}
      </div>
      <div className="mt-auto flex items-center gap-1 border-t border-line py-2 pl-4 pr-2.5">
        {hayMas && (
          <button type="button" aria-expanded={abierta} className="text-xs font-medium text-brand hover:underline" onClick={() => setAbierta((x) => !x)}>
            {abierta ? "Por qué ▴" : "Por qué ▾"}
          </button>
        )}
        <span className="flex-1" />
        {puedeEditar && (
          <>
            <BotonTexto disabled={guardando} onClick={() => void cambiar([{ op: "descartar", itemIds: [item.id] }])}>
              Descartar
            </BotonTexto>
            <BotonAzul disabled={guardando} onClick={() => void cambiar([{ op: "usar", itemId: item.id, valor: item.valor }])}>
              Usar
            </BotonAzul>
          </>
        )}
      </div>
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
     otra cosa, no se insiste: queda el botón. Un recorrido guiado abre la pieza para mostrarla: ahí
     no se gasta al agente. */
  const enRecorrido = !!useRecorridos()?.activo;
  useEffect(() => {
    if (enRecorrido || !puedeEditar || areas.length === 0 || yaPropuso || yaLanzadas.has(exp.id)) return;
    yaLanzadas.add(exp.id);
    void lanzar("casos");
  }, [enRecorrido, puedeEditar, areas.length, yaPropuso, exp.id, lanzar]);

  const quitar = (id: string) => void cambiar([{ op: "casoDeUso", useCaseId: id, valor: null }]);
  const elegirDelCatalogo = (caso: Caso, areaId: string | null) =>
    void cambiar([{ op: "casoDeUso", useCaseId: caso.id, valor: { titulo: caso.titulo, areaId, razon: caso.descripcion.slice(0, 400) } }]);
  const esPropia = corrida?.modo === "casos";
  const nombresDeAreas = areas.map((a) => a.nombre).join(" y ");

  return (
    <div className="space-y-6">
      <div data-recorrido="preventa.casos.agente">
        <FranjaDeSugerencias
          acciones={
            puedeEditar && (
              <>
                <BotonBlanco disabled={lanzando || corriendo || areas.length === 0} onClick={() => void lanzar("casos")}>
                  {lanzando ? "Pidiendo…" : yaPropuso || propuestos.length > 0 ? "Proponer otra tanda" : "Proponer casos de uso"}
                </BotonBlanco>
                {propuestos.length > 1 && (
                  <BotonAzul disabled={guardando} onClick={() => void cambiar([{ op: "usarVarias", items: propuestos.map((it) => ({ itemId: it.id, valor: it.valor })) }])}>
                    Usar los {propuestos.length}
                  </BotonAzul>
                )}
              </>
            )
          }
        >
          {corriendo && esPropia ? (
            <span role="status">El agente está pensando los casos: {corrida?.fase ?? "empezando…"}</span>
          ) : propuestos.length > 0 ? (
            <>
              <strong>
                El agente sugiere {propuestos.length} {propuestos.length === 1 ? "caso" : "casos"}
              </strong>
              {nombresDeAreas ? ` para ${nombresDeAreas}` : ""}, según dónde está cada equipo. Experimental: sin biblioteca ni precio.
            </>
          ) : (
            <>El agente propone casos de uso según dónde está cada equipo en la escala y lo que contó el cliente. Experimental: sin biblioteca ni precio; cada tanda cuesta unos centavos.</>
          )}
        </FranjaDeSugerencias>
      </div>

      {corrida?.estado === "ERROR" && esPropia && <Alert variant="danger">{corrida.error}</Alert>}
      {areas.length === 0 && <p className="text-sm text-fg-muted">Elige primero las áreas en juego (en «La escala»): los casos de uso se proponen por área.</p>}

      {elegidos.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-muted">Elegidos · {elegidos.length}</h2>
          <ul className="space-y-2">
            {elegidos.map(([id, caso]) => (
              <FilaElegida key={id} id={id} caso={caso} onQuitar={puedeEditar ? () => quitar(id) : undefined} />
            ))}
          </ul>
        </section>
      )}

      {propuestos.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-muted">Sugeridos por el agente · {propuestos.length}</h2>
          <ul className="grid items-start gap-3 xl:grid-cols-2">
            {propuestos.map((it) => (
              <TarjetaSugerida key={it.id} item={it} />
            ))}
          </ul>
        </section>
      )}

      {libres.length > 0 && (
        <details className="rounded-xl border border-line bg-surface">
          <summary className="cursor-pointer select-none px-4 py-3 text-sm font-medium text-fg">
            Del catálogo de Smarteam <span className="font-normal text-fg-muted">· {libres.length}</span>
          </summary>
          <ul className="divide-y divide-line border-t border-line">
            {libres.map((c) => (
              <li key={c.id} className="flex flex-wrap items-start justify-between gap-2 px-4 py-2.5">
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
    </div>
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
        <button type="button" className="text-brand hover:underline" onClick={() => irA("propuesta")}>
          Propuesta
        </button>
        .
      </p>
    </div>
  );
}
