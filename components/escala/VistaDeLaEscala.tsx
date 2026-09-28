"use client";

/**
 * components/escala/VistaDeLaEscala.tsx — la sección de la escala: un área, tres formas de verla.
 *
 *   · Matriz: las dimensiones frente a los cinco niveles (para comparar).
 *   · Por dimensión: una dimensión como escalera (para leer e interiorizar).
 *   · Mapa: el área como radar (para recorrerla y ver dónde se concentran los comentarios).
 *
 * El perfil de negocio filtra las tres igual (la regla de `pruebas_escala.py`). La escala es de
 * SOLO LECTURA: lo único que se escribe son comentarios, anclados a un identificador estable.
 * Lo que se mira queda en la URL (vista, perfil, dimensión, celda, comentario abierto), para
 * poder mandar un enlace exacto.
 */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Menu, Tabs } from "@/components/ui";
import {
  aplica,
  CIERRES,
  DESPUES,
  describirPerfil,
  dimensionAplica,
  ETIQUETA_DE_CIERRE,
  ETIQUETA_DE_DESPUES,
  perfilParaUrl,
  type Cierre,
  type Despues,
  type Perfil,
} from "@/lib/escala/documento/perfil";
import { LETRAS, type Letra, type PreguntaDelPerfil } from "@/lib/escala/documento/tipos";
import type { Autor, ConteosPorClave } from "@/lib/escala/comentarios/reglas";
import { definicionDeOpcion, notaDelCierre, type DatosDeLaVista, type Vista } from "@/lib/escala/vista";
import { almacenDeLaApi, type AlmacenDeLaEscala } from "./comentarios/almacen";
import PanelDeComentarios from "./comentarios/PanelDeComentarios";
import { ProveedorDeLaEscala } from "./contexto";
import Escalera from "./Escalera";
import Leyenda from "./Leyenda";
import Mapa, { type SeleccionDelMapa } from "./Mapa";
import Matriz from "./Matriz";
import { GrupoDeControl, IconoComentario, ParrafoDeLaEscala, Segmentado } from "./piezas";

/**
 * Qué esconde cada respuesta del perfil. Es la regla de `aplica` (perfil.ts) dicha en palabras:
 * si cambia la regla, cambia esto.
 */
const EFECTO_DEL_CIERRE: Record<Cierre, string> = {
  "con equipo": "Esconde los criterios que solo cuentan si la empresa vende sin vendedor.",
  transaccional: "Esconde los criterios marcados «venta con equipo».",
  mixta: "No esconde ninguno.",
};

const EFECTO_DEL_DESPUES: Record<Despues, string> = {
  única: "Esconde los criterios marcados «cliente recurrente» y «relación continua».",
  recompra: "Esconde los criterios marcados «relación continua».",
  continua: "No esconde ninguno por lo que pasa después de la venta.",
};

/** «Transaccional: cuando la venta se cierra sin que nadie la trabaje… Esconde…» (la definición sale de la escala). */
function tituloDeOpcion(pregunta: PreguntaDelPerfil | null, valor: Cierre | Despues, etiqueta: string, efecto: string): string {
  const def = definicionDeOpcion(pregunta, valor);
  return `${etiqueta}: ${def ? `${def}. ` : ""}${efecto}`;
}

/**
 * Con un perfil elegido: cuántos criterios se escondieron, qué dimensiones no aplican y, si la
 * escala lo dice, cómo se leen los que quedan con ese cierre (la venta transaccional, la mixta).
 */
function ResumenDelPerfil({ datos, perfil }: { datos: DatosDeLaVista; perfil: Perfil }) {
  const criterios = datos.area.dimensiones.flatMap((d) => d.niveles.flatMap((n) => n.criterios));
  const escondidos = criterios.filter((c) => !aplica(c, perfil)).length;
  const noAplican = datos.area.dimensiones.filter((d) => !dimensionAplica(d, perfil));
  const nota = notaDelCierre(datos.perfilDeNegocio, perfil.cierre);
  return (
    <div className="mt-3 space-y-1.5 border-t border-line pt-2 text-xs text-fg-secondary">
      <p>
        <span className="font-semibold text-fg">{describirPerfil(perfil)}:</span> se esconden{" "}
        <span className="font-semibold tabular-nums text-fg">{escondidos}</span> de los {criterios.length} criterios de {datos.area.nombre}
        {noAplican.length > 0 && (
          <>
            {" "}
            y {noAplican.length === 1 ? "no aplica" : "no aplican"}{" "}
            <span className="font-semibold text-fg">{noAplican.map((d) => d.nombre).join(", ")}</span>
          </>
        )}
        .
      </p>
      {nota && (
        <p className="rounded-md bg-info-surface px-2 py-1.5 leading-relaxed text-info-ink">
          <span className="font-semibold">Cómo se lee con este perfil: </span>
          {nota}
        </p>
      )}
    </div>
  );
}

export interface EstadoInicial {
  vista: Vista;
  perfil: Perfil;
  dimension: string | null;
  /** `1.7.F` (celda), `1.7` (dimensión) o `F` (nivel), para el mapa. */
  celda: string | null;
  ancla: string | null;
}

function seleccionDesde(celda: string | null): SeleccionDelMapa {
  if (!celda) return null;
  if ((LETRAS as readonly string[]).includes(celda)) return { tipo: "nivel", letra: celda as Letra };
  const m = /^(\d+\.\d+)(?:\.([DIFEO]))?$/.exec(celda);
  if (!m) return null;
  return m[2] ? { tipo: "celda", dim: m[1], letra: m[2] as Letra } : { tipo: "dimension", dim: m[1] };
}

function seleccionHacia(s: SeleccionDelMapa): string | null {
  if (!s) return null;
  if (s.tipo === "nivel") return s.letra;
  if (s.tipo === "dimension") return s.dim;
  return `${s.dim}.${s.letra}`;
}

export default function VistaDeLaEscala({
  datos,
  conteos,
  porArea,
  abiertosEnTotal,
  yo,
  esResponsable,
  comentariosDisponibles,
  inicial,
  almacen = almacenDeLaApi,
  hrefDeArea = (slug) => `/escala/${slug}`,
  hrefDeLaBandeja = "/escala/comentarios",
  alCambiar,
}: {
  datos: DatosDeLaVista;
  conteos: ConteosPorClave;
  porArea: ConteosPorClave;
  abiertosEnTotal: number;
  yo: Autor;
  esResponsable: boolean;
  comentariosDisponibles: boolean;
  inicial: EstadoInicial;
  almacen?: AlmacenDeLaEscala;
  hrefDeArea?: (slug: string) => string;
  hrefDeLaBandeja?: string;
  /** Después de comentar o cambiar un estado. Por defecto, pedir de nuevo la página (contadores). */
  alCambiar?: () => void;
}) {
  const router = useRouter();
  const { area } = datos;
  const [vista, setVista] = useState<Vista>(inicial.vista);
  const [perfil, setPerfil] = useState<Perfil>(inicial.perfil);
  const [dimension, setDimension] = useState<string>(
    inicial.dimension && area.dimensiones.some((d) => d.id === inicial.dimension) ? inicial.dimension : area.dimensiones[0].id,
  );
  const [seleccion, setSeleccion] = useState<SeleccionDelMapa>(seleccionDesde(inicial.celda));
  const [ancla, setAncla] = useState<string | null>(inicial.ancla);

  // Lo que se mira, en la URL: sin recargar ni volver a pedir la página (history nativo).
  useEffect(() => {
    const p = new URLSearchParams();
    if (vista !== "matriz") p.set("vista", vista);
    const u = perfilParaUrl(perfil);
    if (u.cierre) p.set("cierre", u.cierre);
    if (u.despues) p.set("despues", u.despues);
    if (vista === "dimension") p.set("dim", dimension);
    const celda = vista === "mapa" ? seleccionHacia(seleccion) : null;
    if (celda) p.set("celda", celda);
    if (ancla) p.set("c", ancla);
    const qs = p.toString();
    const url = `${window.location.pathname}${qs ? `?${qs}` : ""}`;
    if (url !== `${window.location.pathname}${window.location.search}`) window.history.replaceState(null, "", url);
  }, [vista, perfil, dimension, seleccion, ancla]);

  const abrirComentarios = useCallback((a: string) => setAncla(a), []);
  const contexto = useMemo(
    () => ({ yo, esResponsable, almacen, conteos, comentariosDisponibles, abrirComentarios }),
    [yo, esResponsable, almacen, conteos, comentariosDisponibles, abrirComentarios],
  );

  /** Cambiar de área conserva la vista y el perfil (no la dimensión ni la celda, que son del área). */
  const irAlArea = (slug: string) => {
    const p = new URLSearchParams();
    if (vista !== "matriz") p.set("vista", vista);
    const u = perfilParaUrl(perfil);
    if (u.cierre) p.set("cierre", u.cierre);
    if (u.despues) p.set("despues", u.despues);
    const qs = p.toString();
    router.push(`${hrefDeArea(slug)}${qs ? `?${qs}` : ""}`);
  };

  const leerDimension = (d: string) => {
    setDimension(d);
    setVista("dimension");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const congelada = datos.estado?.toLowerCase().includes("congelada");
  const [infoAbierta, setInfoAbierta] = useState(false);
  const publicadaEl = new Date(datos.publicadaEn).toLocaleDateString("es-CR", { day: "numeric", month: "long", year: "numeric" });

  return (
    <ProveedorDeLaEscala value={contexto}>
      <div className="space-y-4">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold text-fg">Escala de Rendimiento</h1>
              <button
                type="button"
                aria-expanded={infoAbierta}
                onClick={() => setInfoAbierta((v) => !v)}
                className="rounded-full border border-info-line bg-info-surface px-2 py-0.5 text-xs font-semibold text-info-ink hover:brightness-95"
                title={`Publicada en Nexus el ${publicadaEl}. Toca para ver qué cambió en esta versión.`}
              >
                Versión {datos.version} {infoAbierta ? "▴" : "▾"}
              </button>
              {congelada && (
                <button
                  type="button"
                  aria-expanded={infoAbierta}
                  onClick={() => setInfoAbierta((v) => !v)}
                  className="rounded-full border border-warn-line bg-warn-surface px-2 py-0.5 text-xs font-semibold text-warn-ink hover:brightness-95"
                  title={`${datos.estado ?? "Congelada"}. Toca para ver qué quiere decir y cuándo se descongela.`}
                >
                  Congelada · solo lectura {infoAbierta ? "▴" : "▾"}
                </button>
              )}
            </div>
            <p className="mt-1 text-sm text-fg-secondary">
              Recórrela por área, dimensión y nivel. Si algo no se entiende o no calza con un cliente real, coméntalo ahí mismo: es la
              materia prima para cuando se descongele.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Leyenda datos={datos} />
            <Link
              href={hrefDeLaBandeja}
              className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-1.5 text-xs text-fg-secondary hover:bg-surface-hover"
            >
              <IconoComentario />
              Comentarios
              {abiertosEnTotal > 0 && (
                <span className="rounded-full bg-info-surface px-1.5 text-2xs font-semibold text-info-ink">{abiertosEnTotal} abiertos</span>
              )}
            </Link>
            <Menu
              align="end"
              panelWidth="w-80"
              aria-label="Descargar los documentos de la escala"
              triggerClassName="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-fg hover:bg-primary-hover"
              trigger={
                <>
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v12m0 0l-4-4m4 4l4-4M4 21h16" />
                  </svg>
                  Descargar .md
                </>
              }
              header={<span className="text-2xs text-fg-muted">Tal cual está publicada en Nexus</span>}
              items={datos.documentos.map((d) => ({
                key: d.clave,
                disabled: !d.version,
                label: (
                  <span className="flex flex-col">
                    <span className="text-sm font-medium text-fg">
                      {d.titulo}
                      {d.version ? ` · ${d.version}` : " · sin publicar"}
                    </span>
                    <span className="text-2xs text-fg-muted">{d.paraQuien}</span>
                  </span>
                ),
                onSelect: () => {
                  window.location.href = `/api/escala/documentos/${d.clave}`;
                },
              }))}
            />
          </div>
        </header>

        {infoAbierta && (
          <div className="grid gap-5 rounded-xl border border-line bg-surface-muted p-4 md:grid-cols-2">
            <section aria-label="Sobre esta versión">
              <h2 className="text-sm font-semibold text-fg">Qué cambió en la {datos.version}</h2>
              <p className="text-2xs text-fg-muted">
                Publicada en Nexus el {publicadaEl}
                {datos.fecha ? ` · fechada ${datos.fecha}` : ""}
              </p>
              {datos.novedades ? (
                <ParrafoDeLaEscala texto={datos.novedades.texto} className="mt-2 text-sm leading-relaxed text-fg-secondary" />
              ) : (
                <p className="mt-2 text-sm text-fg-muted">El historial de la escala no trae una entrada para esta versión.</p>
              )}
            </section>
            {datos.congelamiento && (
              <section aria-label="Por qué está congelada">
                <h2 className="text-sm font-semibold text-fg">Por qué está congelada</h2>
                <p className="mt-2 text-sm leading-relaxed text-fg-secondary">{datos.congelamiento.resumen}</p>
                <ul className="mt-2 flex flex-col gap-1.5">
                  {datos.congelamiento.reglas.map((r, i) => (
                    <li key={i} className="flex gap-2">
                      <span className="mt-2 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-warn-ink" aria-hidden />
                      <ParrafoDeLaEscala texto={r} className="text-sm leading-relaxed text-fg-secondary" />
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        )}

        {datos.aviso && <Alert variant="warning">{datos.aviso}</Alert>}
        {!comentariosDisponibles && (
          <Alert variant="info">Los comentarios todavía no están disponibles: falta aplicar el SQL de la escala. Se puede leer igual.</Alert>
        )}

        <Tabs
          aria-label="Áreas de la escala"
          value={area.slug}
          onChange={irAlArea}
          items={datos.areas.map((a) => ({ key: a.slug, label: a.nombre, count: porArea[a.id]?.total || undefined }))}
        />

        <div className="rounded-xl border border-line bg-surface px-4 py-3">
          <div className="flex flex-wrap items-start gap-x-10 gap-y-3">
            <GrupoDeControl
              nombre="Vista"
              ayuda="Tres formas de recorrer el área que elegiste arriba: la matriz para comparar, una dimensión como escalera para leerla entera y el mapa para ver dónde se concentran los comentarios, los hábitos o los riesgos."
            >
              <div className="flex flex-col gap-1">
                <span className="text-2xs text-fg-secondary">Cómo la quieres recorrer</span>
                <Segmentado<Vista>
                  etiqueta="Vista"
                  valor={vista}
                  onCambio={setVista}
                  opciones={[
                    { clave: "matriz", etiqueta: "Matriz", title: "Las ocho dimensiones del área frente a los cinco niveles, con todos sus criterios: para comparar." },
                    { clave: "dimension", etiqueta: "Por dimensión", title: "Una dimensión a la vez, sus cinco niveles como escalera: para leerla de punta a punta." },
                    { clave: "mapa", etiqueta: "Mapa", title: "El área como radar: cada eje una dimensión, cada anillo un nivel. Para recorrerla y ver dónde se concentran comentarios, hábitos o riesgos." },
                  ]}
                />
              </div>
            </GrupoDeControl>

            <GrupoDeControl
              nombre="Perfil de negocio"
              ayuda={`${datos.perfilDeNegocio.introduccion ?? "El perfil de negocio decide qué criterios aplican."} Elegir un perfil esconde los criterios que no le aplican, con la misma regla de la escala; «Sin filtrar» los muestra todos, cada uno con su marca.`}
            >
              <div className="flex flex-wrap items-end gap-x-6 gap-y-2">
                <div className="flex flex-col gap-1">
                  <span className="text-2xs text-fg-secondary">{datos.perfilDeNegocio.cierre?.pregunta ?? "Cómo se cierra la venta"}</span>
                  <Segmentado<"todas" | Cierre>
                    etiqueta={datos.perfilDeNegocio.cierre?.pregunta ?? "Cómo se cierra la venta"}
                    valor={perfil.cierre ?? "todas"}
                    onCambio={(k) => setPerfil((p) => ({ ...p, cierre: k === "todas" ? null : k }))}
                    opciones={[
                      { clave: "todas", etiqueta: "Sin filtrar", title: "Sin filtrar: se ven los criterios de todos los tipos de venta, cada uno con su marca." },
                      ...CIERRES.map((c) => ({
                        clave: c,
                        etiqueta: ETIQUETA_DE_CIERRE[c],
                        title: tituloDeOpcion(datos.perfilDeNegocio.cierre, c, ETIQUETA_DE_CIERRE[c], EFECTO_DEL_CIERRE[c]),
                      })),
                    ]}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-2xs text-fg-secondary">{datos.perfilDeNegocio.despues?.pregunta ?? "Qué pasa después de la venta"}</span>
                  <Segmentado<"todas" | Despues>
                    etiqueta={datos.perfilDeNegocio.despues?.pregunta ?? "Qué pasa después de la venta"}
                    valor={perfil.despues ?? "todas"}
                    onCambio={(k) => setPerfil((p) => ({ ...p, despues: k === "todas" ? null : k }))}
                    opciones={[
                      { clave: "todas", etiqueta: "Sin filtrar", title: "Sin filtrar: se ven los criterios de todos los tipos de relación, cada uno con su marca." },
                      ...DESPUES.map((d) => ({
                        clave: d,
                        etiqueta: ETIQUETA_DE_DESPUES[d],
                        title: tituloDeOpcion(datos.perfilDeNegocio.despues, d, ETIQUETA_DE_DESPUES[d], EFECTO_DEL_DESPUES[d]),
                      })),
                    ]}
                  />
                </div>
              </div>
            </GrupoDeControl>
          </div>
          {(perfil.cierre || perfil.despues) && <ResumenDelPerfil datos={datos} perfil={perfil} />}
        </div>

        {vista === "matriz" && <Matriz datos={datos} perfil={perfil} anclaAbierta={ancla} onLeerDimension={leerDimension} />}
        {vista === "dimension" && (
          <Escalera datos={datos} perfil={perfil} dimension={dimension} onElegirDimension={setDimension} anclaAbierta={ancla} />
        )}
        {vista === "mapa" && (
          <Mapa
            datos={datos}
            perfil={perfil}
            seleccion={seleccion}
            onSeleccion={setSeleccion}
            onLeerDimension={leerDimension}
            onVerEnLaMatriz={() => setVista("matriz")}
          />
        )}

        <p className="text-xs text-fg-muted">
          Todo lo que ves sale de la versión {datos.version} publicada en Nexus. Ningún criterio está escrito a mano en la aplicación: cuando
          se publica una versión nueva, esta sección cambia sola.
        </p>
      </div>

      <PanelDeComentarios ancla={ancla} datos={datos} perfil={perfil} onCerrar={() => setAncla(null)} onCambio={alCambiar ?? (() => router.refresh())} />
    </ProveedorDeLaEscala>
  );
}
