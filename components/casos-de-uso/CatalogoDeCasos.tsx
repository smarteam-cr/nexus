"use client";

/**
 * components/casos-de-uso/CatalogoDeCasos.tsx — Ventas › Casos de uso: el catálogo (diseño «Catálogo de casos de uso»,
 * Claude Design, 2026-10-11; la lista se rehízo el 2026-10-12 con lo que pidió Elías al verla).
 *
 * Dos vistas del mismo catálogo, que se eligen arriba a la derecha: la lista (una pestaña por tipo con cuántos casos
 * tiene, el buscador y los filtros, y las tarjetas) y «En la escala» (qué casos suben cada dimensión). La vista y el tipo
 * van en la dirección (`?vista=escala`, `?tipo=expandir`) para poder mandarlos por chat; se cambian sin volver a pedir la
 * página. El catálogo es de solo lectura: se edita en el repo (lib/casos-de-uso/catalogo.ts) y lo que se quiera cambiar
 * se sugiere por Feedback.
 */
import { useMemo, useState } from "react";
import { useFeedback } from "@/components/feedback/FeedbackProvider";
import { Button, PageHeader, Segmentado, Select, Tabs } from "@/components/ui";
import { cn } from "@/lib/cn";
import { CATALOGO_DE_CASOS, SERVICIOS, type AreaDeLaEscala, type Servicio, type TipoDeCaso } from "@/lib/casos-de-uso/catalogo";
import {
  cuantosCasos,
  hayFiltros,
  NOMBRE_DEL_TIPO,
  nombreDelArea,
  nombreDelNivel,
  pasaLosFiltros,
  SIN_FILTROS,
  TIPOS_DE_CASO,
  type EscalaDelCatalogo,
  type FiltroDeHerramienta,
  type FiltroDeNivel,
  type FiltrosDelCatalogo,
} from "@/lib/casos-de-uso/vista";
import type { Letra } from "@/lib/escala/documento/tipos";
import { EnLaEscala } from "./EnLaEscala";
import { TarjetaDelCaso } from "./TarjetaDelCaso";

export type VistaDelCatalogo = "tipo" | "escala";
/** La pestaña de la lista: un tipo, o todos. */
export type PestanaDelCatalogo = TipoDeCaso | "todos";

const NIVELES_DE_RESPALDO: EscalaDelCatalogo["niveles"] = [
  { letra: "D", nombre: "Deficiente" },
  { letra: "I", nombre: "Inicial" },
  { letra: "F", nombre: "Funcional" },
  { letra: "E", nombre: "Eficiente" },
  { letra: "O", nombre: "Óptimo" },
];

/** Cambia un parámetro de la dirección sin volver a pedir la página. */
function ponerEnLaDireccion(cambios: Record<string, string | null>) {
  const url = new URL(window.location.href);
  for (const [k, v] of Object.entries(cambios)) {
    if (v) url.searchParams.set(k, v);
    else url.searchParams.delete(k);
  }
  window.history.replaceState(window.history.state, "", url);
}

export default function CatalogoDeCasos({
  escala,
  vistaInicial,
  tipoInicial = "todos",
  dimensionInicial,
}: {
  /** La escala publicada; sin ella, los nombres de las dimensiones se muestran por su identificador. */
  escala: EscalaDelCatalogo | null;
  vistaInicial: VistaDelCatalogo;
  tipoInicial?: PestanaDelCatalogo;
  dimensionInicial: string | null;
}) {
  const [vista, setVista] = useState<VistaDelCatalogo>(vistaInicial);
  const abrirFeedback = useFeedback()?.abrir;
  const niveles = escala?.niveles ?? NIVELES_DE_RESPALDO;
  const proponer = abrirFeedback ? () => abrirFeedback({ catalogo: { modo: "nuevo" } }) : null;

  const cambiarVista = (v: VistaDelCatalogo) => {
    setVista(v);
    ponerEnLaDireccion({ vista: v === "escala" ? "escala" : null, dimension: null });
  };

  return (
    <div className="mx-auto flex max-w-[1180px] flex-col gap-6">
      <PageHeader
        className="mb-0"
        title="Casos de uso"
        badges={
          <span className="rounded-full border border-line bg-surface px-2.5 py-0.5 text-xs font-medium text-fg-secondary">
            Borrador v1 · {cuantosCasos(CATALOGO_DE_CASOS.length)}
          </span>
        }
        description="Lo que un cliente consigue con Smarteam, ordenado por la Escala de Rendimiento. La preventa y las propuestas los toman como punto de partida."
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Segmentado<VistaDelCatalogo>
              etiqueta="Cómo ver el catálogo"
              valor={vista}
              onCambio={cambiarVista}
              opciones={[
                { clave: "tipo", etiqueta: "Lista" },
                { clave: "escala", etiqueta: "En la escala" },
              ]}
            />
            {proponer && (
              <Button variant="primary" className="text-[13px] font-semibold" onClick={proponer}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                  <path d="M12 5v14M5 12h14" />
                </svg>
                Proponer un caso nuevo
              </Button>
            )}
          </div>
        }
      />

      {vista === "tipo" ? (
        <Lista niveles={niveles} escala={escala} tipoInicial={tipoInicial} onProponer={proponer} />
      ) : (
        <EnLaEscala escala={escala} niveles={niveles} dimensionInicial={dimensionInicial} onProponer={proponer} />
      )}
    </div>
  );
}

// ── La lista ──────────────────────────────────────────────────────────────────

const SELECT_DEL_FILTRO = "w-auto cursor-pointer appearance-none bg-surface py-2 pl-3 pr-8 text-[13px]";
const SELECT_ACTIVO = "border-brand font-semibold text-fg";

function Filtro<K extends string>({
  etiqueta,
  valor,
  onCambio,
  opciones,
}: {
  etiqueta: string;
  valor: K | "";
  onCambio: (v: K | "") => void;
  opciones: { valor: K | ""; nombre: string }[];
}) {
  return (
    <label className="relative inline-flex">
      <span className="sr-only">{etiqueta}</span>
      <Select value={valor} onChange={(e) => onCambio(e.target.value as K | "")} className={cn(SELECT_DEL_FILTRO, valor && SELECT_ACTIVO)}>
        {opciones.map((o) => (
          <option key={o.valor || "todas"} value={o.valor}>
            {o.nombre}
          </option>
        ))}
      </Select>
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        className="pointer-events-none absolute right-2.5 top-1/2 -mt-[7px] text-fg-muted"
      >
        <path d="M6 9l6 6 6-6" />
      </svg>
    </label>
  );
}

function Lista({
  niveles,
  escala,
  tipoInicial,
  onProponer,
}: {
  niveles: EscalaDelCatalogo["niveles"];
  escala: EscalaDelCatalogo | null;
  tipoInicial: PestanaDelCatalogo;
  onProponer: (() => void) | null;
}) {
  const [pestana, setPestana] = useState<PestanaDelCatalogo>(tipoInicial);
  const [f, setF] = useState<FiltrosDelCatalogo>(SIN_FILTROS);
  const poner = <K extends keyof FiltrosDelCatalogo>(k: K) => (v: FiltrosDelCatalogo[K]) => setF((x) => ({ ...x, [k]: v }));
  // Los filtros cuentan en todas las pestañas: cada una dice cuántos casos de su tipo pasan.
  const filtrados = useMemo(() => CATALOGO_DE_CASOS.filter((c) => pasaLosFiltros(c, f)), [f]);
  const orden = (c: (typeof CATALOGO_DE_CASOS)[number]) => TIPOS_DE_CASO.findIndex((t) => t.clave === c.tipo);
  const visibles = pestana === "todos" ? [...filtrados].sort((a, b) => orden(a) - orden(b)) : filtrados.filter((c) => c.tipo === pestana);
  const filtrando = hayFiltros(f);
  const nombre = (l: Letra) => nombreDelNivel({ niveles }, l);
  const areas = escala?.areas ?? [];
  const tipo = TIPOS_DE_CASO.find((t) => t.clave === pestana);

  const elegir = (p: PestanaDelCatalogo) => {
    setPestana(p);
    ponerEnLaDireccion({ tipo: p === "todos" ? null : p });
  };

  return (
    <div className="flex flex-col gap-5">
      <Tabs<PestanaDelCatalogo>
        aria-label="Tipos de caso"
        value={pestana}
        onChange={elegir}
        items={[
          { key: "todos", label: "Todos", count: filtrados.length },
          ...TIPOS_DE_CASO.map((t) => ({
            key: t.clave,
            label: NOMBRE_DEL_TIPO[t.clave],
            count: filtrados.filter((c) => c.tipo === t.clave).length,
            title: t.descripcion,
          })),
        ]}
      />

      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <label className="relative inline-flex min-w-[280px] flex-1">
            <span className="sr-only">Buscar casos</span>
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-1/2 -mt-[7.5px] text-fg-muted"
            >
              <circle cx="11" cy="11" r="7" />
              <path d="M20 20l-3.5-3.5" />
            </svg>
            <input
              type="search"
              value={f.texto}
              onChange={(e) => poner("texto")(e.target.value)}
              placeholder="Busca un resultado o lo que dice el cliente"
              className="w-full rounded-lg border border-line bg-surface py-2 pl-[34px] pr-3 text-[13px] text-fg placeholder:text-fg-muted focus:border-brand focus:outline-none"
            />
          </label>
          <Filtro<AreaDeLaEscala>
            etiqueta="Área"
            valor={f.area}
            onCambio={poner("area")}
            opciones={[
              { valor: "", nombre: "Todas las áreas" },
              ...(["1", "2", "3"] as const).map((a) => ({
                valor: a,
                nombre: areas.length ? nombreDelArea({ areas }, a) : ({ "1": "Ventas", "2": "Marketing", "3": "Servicio" } as const)[a],
              })),
            ]}
          />
          <Filtro<FiltroDeHerramienta>
            etiqueta="Herramienta"
            valor={f.herramienta}
            onCambio={poner("herramienta")}
            opciones={[
              { valor: "", nombre: "Todas las herramientas" },
              { valor: "hubspot", nombre: "HubSpot" },
              { valor: "insider", nombre: "Insider" },
              { valor: "solo-smarteam", nombre: "Sin licencia (solo Smarteam)" },
            ]}
          />
          <Filtro<Servicio>
            etiqueta="Servicio de Smarteam"
            valor={f.servicio}
            onCambio={poner("servicio")}
            opciones={[{ valor: "", nombre: "Todos los servicios" }, ...SERVICIOS.map((s) => ({ valor: s, nombre: s }))]}
          />
          <Filtro<FiltroDeNivel>
            etiqueta="Nivel de partida"
            valor={f.nivel}
            onCambio={poner("nivel")}
            opciones={[
              { valor: "", nombre: "Desde cualquier nivel" },
              { valor: "sin", nombre: `Sin sistema (${nombre("D")} o ${nombre("I")})` },
              { valor: "F", nombre: `Ya en ${nombre("F")}` },
              { valor: "E", nombre: `Ya en ${nombre("E")}` },
            ]}
          />
        </div>
        <div className="flex min-h-[26px] flex-wrap items-center gap-x-2 text-xs text-fg-muted">
          <span>
            {filtrando ? `${visibles.length} con estos filtros` : cuantosCasos(visibles.length)}
            {tipo && ` · ${tipo.descripcion}`}
          </span>
          {filtrando && (
            <button type="button" onClick={() => setF(SIN_FILTROS)} className="rounded px-1.5 py-1 text-xs text-fg-muted hover:bg-surface-hover hover:text-fg">
              Limpiar filtros
            </button>
          )}
        </div>
      </div>

      {visibles.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-line bg-surface-muted p-8 text-center">
          <p className="text-[15px] font-semibold text-fg">{filtrando ? "Ningún caso con esos filtros" : "Ningún caso de este tipo todavía"}</p>
          <p className="text-[13px] text-fg-muted">
            Si falta un caso que tus clientes necesitan,{" "}
            {onProponer ? (
              <button type="button" onClick={onProponer} className="text-brand hover:text-brand-light">
                propónlo
              </button>
            ) : (
              "propónlo"
            )}
            .
          </p>
          {filtrando && (
            <button type="button" onClick={() => setF(SIN_FILTROS)} className="rounded px-1.5 py-1 text-xs font-semibold text-brand hover:bg-surface-hover">
              Limpiar filtros
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(420px,1fr))] gap-5 max-sm:grid-cols-1">
          {visibles.map((c) => (
            <TarjetaDelCaso key={c.id} caso={c} escala={escala} conTipo={pestana === "todos"} />
          ))}
        </div>
      )}
    </div>
  );
}
