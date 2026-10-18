"use client";

/**
 * components/landing/sections-modulos.tsx
 *
 * Los tres módulos que Ventas armaba en HTML a mano y pasaron a ser secciones del motor
 * (2026-10-18). La forma de cada uno —schema, vacío y reglas— vive en
 * `lib/landing/modulos-nativos.ts`; acá solo se dibujan y se editan.
 *
 *   · CasosPorProyectoSection  → `casos_por_proyecto`: pestañas por proyecto, casos adentro.
 *   · ComparacionLicenciasSection → `comparacion_licencias`: planes enfrentados por necesidad.
 *   · FasesUOpcionesSection    → `fases_u_opciones`: tarjetas 01/02 (ruta) o A/B (elegir).
 *
 * ── EL PDF ───────────────────────────────────────────────────────────────────────────────────
 * Una pestaña que esconde contenido en un PDF es contenido PERDIDO, y nadie se entera (la misma
 * regla que las píldoras de «Qué se implementa»). Con `ctx.pdfMode` los grupos salen todos,
 * uno debajo del otro, y no se pinta ninguna pestaña.
 *
 * ── LOS RÓTULOS FIJOS ────────────────────────────────────────────────────────────────────────
 * Van por `t(lang, …)`: estas secciones se publican al cliente y la propuesta puede estar en
 * inglés. Un literal en español acá saldría tal cual en una propuesta en inglés.
 */
import { useState, type FC } from "react";
import type { SectionProps } from "./types";
import { Editable, RemoveBtn, AddBtn, replaceAt, removeAt, appendItem } from "./inline";
import { SortableItems } from "./sortable";
import { landingLang, t, type LandingLang } from "./i18n";
import {
  CASO_VACIO,
  FASE_VACIA,
  GRUPO_VACIO,
  MAX_PLANES,
  casoDesdeElCatalogo,
  columnasDeFases,
  esDestacada,
  grupoVisible,
  herramientasDe,
  indiceRecomendado,
  marcarRecomendado,
  modoDe,
  resumenDeCasos,
  rotuloDeOrden,
  valorDeLicencia,
  valoresDeFila,
  type CasoAImplementar,
  type CasosPorProyectoData,
  type ComparacionLicenciasData,
  type FaseUOpcion,
  type FasesUOpcionesData,
  type GrupoDeCasos,
} from "@/lib/landing/modulos-nativos";

// ── 1 · Casos de uso por proyecto ────────────────────────────────────────────────────────────

/** El número con su palabra en singular o plural, en el idioma de la propuesta. */
function cuenta(lang: LandingLang, n: number, uno: "modProyecto" | "modCasoDeUso", varios: "modProyectos" | "modCasosDeUso") {
  return `${n} ${t(lang, n === 1 ? uno : varios)}`;
}

/**
 * «Desde el catálogo» — agrega un caso del catálogo de casos de uso de Smarteam.
 *
 * ⚠ El catálogo se carga con `import()` DINÁMICO al abrir el selector: son ~900 líneas que, con un
 * import estático, viajarían en el bundle de la propuesta que abre el PROSPECTO, donde este botón
 * no existe (solo se pinta en edición). Mismo criterio que «Copiar instrucciones para tu IA».
 */
function DesdeElCatalogo({ onElegir }: { onElegir: (caso: CasoAImplementar) => void }) {
  const [casos, setCasos] = useState<Array<{ id: string; titulo: string; caso: CasoAImplementar }> | null>(null);
  const [abierto, setAbierto] = useState(false);

  async function abrir() {
    setAbierto(true);
    if (casos) return;
    const { CATALOGO_DE_CASOS } = await import("@/lib/casos-de-uso/catalogo");
    setCasos(CATALOGO_DE_CASOS.map((c) => ({ id: c.id, titulo: c.titulo, caso: casoDesdeElCatalogo(c) })));
  }

  if (!abierto) {
    return <AddBtn label="Desde el catálogo de casos" onClick={() => void abrir()} />;
  }
  return (
    <select
      className="stl-mod-select"
      aria-label="Elegir un caso del catálogo de Smarteam"
      defaultValue=""
      onChange={(e) => {
        const elegido = casos?.find((c) => c.id === e.target.value);
        if (elegido) onElegir(elegido.caso);
        setAbierto(false);
      }}
      onBlur={() => setAbierto(false)}
      autoFocus
    >
      <option value="" disabled>
        {casos ? "Elige un caso del catálogo…" : "Cargando el catálogo…"}
      </option>
      {(casos ?? []).map((c) => (
        <option key={c.id} value={c.id}>
          {c.titulo}
        </option>
      ))}
    </select>
  );
}

function TarjetaDeCaso({
  caso,
  lang,
  editable,
  handle,
  onCambio,
  onQuitar,
}: {
  caso: CasoAImplementar;
  lang: LandingLang;
  editable?: boolean;
  handle: React.ReactNode;
  onCambio: (c: CasoAImplementar) => void;
  onQuitar: () => void;
}) {
  const herramientas = herramientasDe(caso.herramientas);
  return (
    <div className="stl-item stl-card stl-mod-caso">
      {handle}
      {editable && <RemoveBtn onClick={onQuitar} title="Quitar este caso" />}
      <Editable as="div" className="stl-card-title" editable={editable} value={caso.titulo}
        placeholder="El caso, como resultado…" onCommit={(v) => onCambio({ ...caso, titulo: v })} />
      {(caso.detalle || editable) && (
        <Editable as="p" className="stl-card-detail" editable={editable} value={caso.detalle}
          placeholder="Qué lo dispara y qué se automatiza…" onCommit={(v) => onCambio({ ...caso, detalle: v })} />
      )}
      {(caso.resultado || editable) && (
        <div className="stl-mod-resultado">
          <span className="stl-mod-rotulo">{t(lang, "resultado")}</span>
          <Editable as="span" editable={editable} value={caso.resultado}
            placeholder="Lo que obtiene el cliente…" onCommit={(v) => onCambio({ ...caso, resultado: v })} />
        </div>
      )}
      {editable ? (
        <div className="stl-mod-herramientas">
          <span className="stl-mod-rotulo">{t(lang, "modConQue")}</span>
          <Editable as="span" editable value={caso.herramientas}
            placeholder="Sales Hub, Data Hub… (separadas por comas)" onCommit={(v) => onCambio({ ...caso, herramientas: v })} />
        </div>
      ) : (
        herramientas.length > 0 && (
          <div className="stl-mod-chips">
            {herramientas.map((h) => (
              <span key={h} className="stl-mod-chip">{h}</span>
            ))}
          </div>
        )
      )}
    </div>
  );
}

function CasosDelGrupo({
  grupo,
  lang,
  editable,
  onCambio,
}: {
  grupo: GrupoDeCasos;
  lang: LandingLang;
  editable?: boolean;
  onCambio: (g: GrupoDeCasos) => void;
}) {
  const casos = Array.isArray(grupo.casos) ? grupo.casos : [];
  const setCasos = (next: CasoAImplementar[]) => onCambio({ ...grupo, casos: next });
  return (
    <>
      <SortableItems items={casos} disabled={!editable} onReorder={setCasos}
        container={(nodes) => <div className="stl-grid stl-grid-2 stl-mod-casos">{nodes}</div>}>
        {(c, i, handle) => (
          <TarjetaDeCaso caso={c} lang={lang} editable={editable} handle={handle}
            onCambio={(next) => setCasos(replaceAt(casos, i, next))}
            onQuitar={() => setCasos(removeAt(casos, i))} />
        )}
      </SortableItems>
      {editable && (
        <div className="stl-mod-acciones">
          <AddBtn label="Agregar caso" onClick={() => setCasos(appendItem(casos, { ...CASO_VACIO }))} />
          <DesdeElCatalogo onElegir={(c) => setCasos(appendItem(casos, c))} />
        </div>
      )}
    </>
  );
}

export const CasosPorProyectoSection: FC<SectionProps<CasosPorProyectoData>> = ({ data, ctx, editable, onChange }) => {
  const lang = landingLang(ctx.lang);
  const grupos = Array.isArray(data.grupos) ? data.grupos : [];
  const [pedido, setPedido] = useState(0);
  const set = (next: Partial<CasosPorProyectoData>) => onChange?.({ ...data, ...next });
  const setGrupo = (i: number, g: GrupoDeCasos) => set({ grupos: replaceAt(grupos, i, g) });
  const resumen = resumenDeCasos(grupos);
  const abierto = grupoVisible(grupos.length, pedido);

  const intro = (data.intro || editable) && (
    <Editable as="p" className="stl-lead" editable={editable} value={data.intro ?? ""}
      placeholder="Una frase que enmarca el alcance (opcional)…" onCommit={(v) => set({ intro: v })} />
  );

  // PDF, o un solo grupo: todo a la vista, sin pestañas (ver el encabezado).
  if (ctx.pdfMode || (grupos.length <= 1 && !editable)) {
    if (grupos.length === 0) return null;
    return (
      <>
        {intro}
        {grupos.map((g, i) => (
          <div key={i} className="stl-mod-grupo">
            {grupos.length > 1 && (
              <div className="stl-mod-grupo-head">
                <h3 className="stl-mod-grupo-nombre">{g.nombre}</h3>
                {g.descripcion && <p className="stl-card-detail">{g.descripcion}</p>}
              </div>
            )}
            <CasosDelGrupo grupo={g} lang={lang} onCambio={() => {}} />
          </div>
        ))}
      </>
    );
  }

  const grupo = abierto >= 0 ? grupos[abierto] : null;
  return (
    <>
      {intro}
      {grupos.length > 0 && (
        <p className="stl-mod-resumen">
          {cuenta(lang, resumen.grupos, "modProyecto", "modProyectos")} · {cuenta(lang, resumen.casos, "modCasoDeUso", "modCasosDeUso")}
        </p>
      )}
      <div className="stl-mod-tabs" role="tablist">
        {grupos.map((g, i) => (
          <button key={i} type="button" role="tab" aria-selected={i === abierto}
            className={`stl-mod-tab${i === abierto ? " is-on" : ""}`} onClick={() => setPedido(i)}>
            <span className="stl-mod-tab-n">{String(i + 1).padStart(2, "0")}</span>
            <span>{g.nombre || (editable ? "Sin nombre" : "")}</span>
            <span className="stl-mod-tab-cuenta">{Array.isArray(g.casos) ? g.casos.length : 0}</span>
          </button>
        ))}
        {editable && grupos.length < 8 && (
          <button type="button" className="stl-mod-tab stl-mod-tab--nuevo"
            onClick={() => {
              set({ grupos: appendItem(grupos, { ...GRUPO_VACIO, casos: [] }) });
              setPedido(grupos.length);
            }}>
            + Proyecto
          </button>
        )}
      </div>
      {grupo && (
        <div className="stl-mod-grupo" role="tabpanel">
          <div className="stl-mod-grupo-head stl-item">
            {editable && grupos.length > 0 && (
              <RemoveBtn title="Quitar este proyecto"
                onClick={() => {
                  set({ grupos: removeAt(grupos, abierto) });
                  setPedido(0);
                }} />
            )}
            {editable && (
              <Editable as="h3" className="stl-mod-grupo-nombre" editable value={grupo.nombre}
                placeholder="Nombre del proyecto o del área…" onCommit={(v) => setGrupo(abierto, { ...grupo, nombre: v })} />
            )}
            {(grupo.descripcion || editable) && (
              <Editable as="p" className="stl-card-detail" editable={editable} value={grupo.descripcion}
                placeholder="De qué se trata, en una frase…" onCommit={(v) => setGrupo(abierto, { ...grupo, descripcion: v })} />
            )}
          </div>
          <CasosDelGrupo grupo={grupo} lang={lang} editable={editable} onCambio={(g) => setGrupo(abierto, g)} />
        </div>
      )}
    </>
  );
};

// ── 2 · Comparación de licencias ─────────────────────────────────────────────────────────────

function CeldaDeLicencia({ valor, lang }: { valor: string; lang: LandingLang }) {
  const v = valorDeLicencia(valor);
  switch (v.tipo) {
    case "si":
      return <span className="stl-mod-lic stl-mod-lic--si"><span aria-hidden>✓</span>{t(lang, "modIncluido")}</span>;
    case "no":
      return <span className="stl-mod-lic stl-mod-lic--no"><span aria-hidden>—</span>{t(lang, "modNoIncluido")}</span>;
    case "parcial":
      return (
        <span className="stl-mod-lic stl-mod-lic--parcial">
          <span aria-hidden>◐</span>{v.texto || t(lang, "modParcial")}
        </span>
      );
    case "texto":
      return <span className="stl-mod-lic">{v.texto}</span>;
    default:
      return <span className="stl-mod-lic stl-mod-lic--vacio">—</span>;
  }
}

export const ComparacionLicenciasSection: FC<SectionProps<ComparacionLicenciasData>> = ({ data, ctx, editable, onChange }) => {
  const lang = landingLang(ctx.lang);
  const planes = Array.isArray(data.planes) ? data.planes : [];
  const filas = Array.isArray(data.filas) ? data.filas : [];
  const set = (next: Partial<ComparacionLicenciasData>) => onChange?.({ ...data, ...next });
  const rec = indiceRecomendado(planes);
  const conImpacto = editable || filas.some((f) => (f.impacto ?? "").trim());

  if (planes.length === 0 && !editable) return null;

  const agregarPlan = () => {
    if (planes.length >= MAX_PLANES) return;
    set({
      planes: appendItem(planes, { nombre: "", nota: "", recomendado: "" }),
      filas: filas.map((f) => ({ ...f, valores: [...valoresDeFila(f, planes.length), ""] })),
    });
  };
  const quitarPlan = (i: number) =>
    set({
      planes: removeAt(planes, i),
      filas: filas.map((f) => ({ ...f, valores: removeAt(valoresDeFila(f, planes.length), i) })),
    });
  const setValor = (fi: number, pi: number, v: string) => {
    const fila = filas[fi];
    const valores = valoresDeFila(fila, planes.length).slice();
    valores[pi] = v;
    set({ filas: replaceAt(filas, fi, { ...fila, valores }) });
  };

  return (
    <>
      {(data.intro || editable) && (
        <Editable as="p" className="stl-lead" editable={editable} value={data.intro ?? ""}
          placeholder="Qué cubre cada plan y por qué importa para este cliente (opcional)…" onCommit={(v) => set({ intro: v })} />
      )}
      {(data.recomendacion || editable) && (
        <div className="stl-mod-recomendacion">
          <span className="stl-mod-rotulo">{t(lang, "modRecomendacion")}</span>
          <Editable as="div" className="stl-mod-recomendacion-texto" editable={editable} value={data.recomendacion ?? ""}
            placeholder="Marketing Hub Professional + Sales Hub Professional…" onCommit={(v) => set({ recomendacion: v })} />
        </div>
      )}
      <div className="stl-props-scroll stl-mod-lic-scroll">
        <table className="stl-props stl-mod-lic-tabla">
          <thead>
            <tr>
              <th>{t(lang, "modNecesidad")}</th>
              {planes.map((p, pi) => (
                <th key={pi} className={pi === rec ? "is-rec" : undefined}>
                  {pi === rec && <span className="stl-mod-lic-chip">{t(lang, "modRecomendado")}</span>}
                  <Editable as="div" className="stl-mod-plan" editable={editable} value={p.nombre}
                    placeholder="Plan…" onCommit={(v) => set({ planes: replaceAt(planes, pi, { ...p, nombre: v }) })} />
                  {(p.nota || editable) && (
                    <Editable as="div" className="stl-mod-plan-nota" editable={editable} value={p.nota}
                      placeholder="Una línea…" onCommit={(v) => set({ planes: replaceAt(planes, pi, { ...p, nota: v }) })} />
                  )}
                  {editable && (
                    <div className="stl-mod-plan-acciones">
                      <button type="button" className="stl-mod-mini"
                        onClick={() => set({ planes: marcarRecomendado(planes, pi === rec ? -1 : pi) })}>
                        {pi === rec ? "Quitar recomendación" : "Recomendar"}
                      </button>
                      {planes.length > 1 && <RemoveBtn onClick={() => quitarPlan(pi)} title="Quitar este plan" />}
                    </div>
                  )}
                </th>
              ))}
              {conImpacto && <th>{t(lang, "modImpacto")}</th>}
              {editable && <th className="stl-props-actions" aria-label="Acciones" />}
            </tr>
          </thead>
          <tbody>
            {filas.map((f, fi) => (
              <tr key={fi}>
                <td className="stl-mod-necesidad">
                  <Editable as="span" editable={editable} value={f.necesidad}
                    placeholder="Necesidad del cliente…" onCommit={(v) => set({ filas: replaceAt(filas, fi, { ...f, necesidad: v }) })} />
                </td>
                {valoresDeFila(f, planes.length).map((v, pi) => (
                  <td key={pi} className={pi === rec ? "is-rec" : undefined}>
                    {editable ? (
                      <Editable as="span" editable value={v} placeholder="sí / no / parcial"
                        onCommit={(nv) => setValor(fi, pi, nv)} />
                    ) : (
                      <CeldaDeLicencia valor={v} lang={lang} />
                    )}
                  </td>
                ))}
                {conImpacto && (
                  <td>
                    <Editable as="span" editable={editable} value={f.impacto ?? ""}
                      placeholder="Por qué le importa…" onCommit={(v) => set({ filas: replaceAt(filas, fi, { ...f, impacto: v }) })} />
                  </td>
                )}
                {editable && (
                  <td className="stl-props-actions">
                    <RemoveBtn onClick={() => set({ filas: removeAt(filas, fi) })} title="Quitar esta fila" />
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {editable && (
        <div className="stl-mod-acciones">
          <AddBtn label="Agregar fila"
            onClick={() => set({ filas: appendItem(filas, { necesidad: "", valores: planes.map(() => ""), impacto: "" }) })} />
          {planes.length < MAX_PLANES && <AddBtn label="Agregar plan" onClick={agregarPlan} />}
        </div>
      )}
      {(data.nota || editable) && (
        <Editable as="p" className="stl-mod-nota" editable={editable} value={data.nota ?? ""}
          placeholder="Una aclaración al pie (opcional)…" onCommit={(v) => set({ nota: v })} />
      )}
    </>
  );
};

// ── 3 · Fases u opciones ─────────────────────────────────────────────────────────────────────

function TarjetaDeFase({
  item,
  i,
  modo,
  lang,
  editable,
  handle,
  onCambio,
  onQuitar,
}: {
  item: FaseUOpcion;
  i: number;
  modo: "fases" | "opciones";
  lang: LandingLang;
  editable?: boolean;
  handle: React.ReactNode;
  onCambio: (f: FaseUOpcion) => void;
  onQuitar: () => void;
}) {
  const incluye = Array.isArray(item.incluye) ? item.incluye : [];
  const destacada = esDestacada(item);
  // En opciones, la destacada sin etiqueta escrita dice «Recomendada»: es lo que significa.
  const etiqueta = item.etiqueta || (destacada && modo === "opciones" && !editable ? t(lang, "modRecomendada") : "");
  return (
    <div className={`stl-item stl-card stl-mod-fase${destacada ? " is-destacada" : ""}`}>
      {handle}
      {editable && <RemoveBtn onClick={onQuitar} title="Quitar esta tarjeta" />}
      <div className="stl-mod-fase-top">
        <span className="stl-mod-fase-n" aria-label={`${t(lang, modo === "opciones" ? "modOpcion" : "modFase")} ${rotuloDeOrden(modo, i)}`}>
          {rotuloDeOrden(modo, i)}
        </span>
        {(etiqueta || editable) && (
          <Editable as="span" className="stl-mod-fase-etiqueta" editable={editable} value={editable ? item.etiqueta : etiqueta}
            placeholder="Etiqueta (opcional)" onCommit={(v) => onCambio({ ...item, etiqueta: v })} />
        )}
      </div>
      <Editable as="div" className="stl-card-title" editable={editable} value={item.nombre}
        placeholder={modo === "opciones" ? "Nombre de la opción…" : "Nombre de la fase…"} onCommit={(v) => onCambio({ ...item, nombre: v })} />
      {(item.objetivo || editable) && (
        <div className="stl-mod-campo">
          <span className="stl-mod-rotulo">{t(lang, "objetivo")}</span>
          <Editable as="p" className="stl-card-detail" editable={editable} value={item.objetivo}
            placeholder="Para qué es, en una frase…" onCommit={(v) => onCambio({ ...item, objetivo: v })} />
        </div>
      )}
      {(incluye.length > 0 || editable) && (
        <div className="stl-mod-campo">
          <span className="stl-mod-rotulo">{t(lang, "modIncluye")}</span>
          <ul className="stl-mod-lista">
            {incluye.map((x, j) => (
              <li key={j} className="stl-item">
                {editable && <RemoveBtn onClick={() => onCambio({ ...item, incluye: removeAt(incluye, j) })} />}
                <Editable as="span" editable={editable} value={x} placeholder="Lo que incluye…"
                  onCommit={(v) => onCambio({ ...item, incluye: replaceAt(incluye, j, v) })} />
              </li>
            ))}
          </ul>
          {editable && <AddBtn label="Agregar" onClick={() => onCambio({ ...item, incluye: appendItem(incluye, "") })} />}
        </div>
      )}
      {(item.resultado || item.plazo || editable) && (
        <div className="stl-mod-fase-pie">
          {(item.resultado || editable) && (
            <div>
              <span className="stl-mod-rotulo">{t(lang, "resultado")}</span>
              <Editable as="span" editable={editable} value={item.resultado} placeholder="Lo que deja…"
                onCommit={(v) => onCambio({ ...item, resultado: v })} />
            </div>
          )}
          {(item.plazo || editable) && (
            <div>
              <span className="stl-mod-rotulo">{t(lang, "modPlazo")}</span>
              <Editable as="span" editable={editable} value={item.plazo} placeholder="4 semanas"
                onCommit={(v) => onCambio({ ...item, plazo: v })} />
            </div>
          )}
        </div>
      )}
      {editable && (
        <button type="button" className="stl-mod-mini" onClick={() => onCambio({ ...item, destacada: destacada ? "" : "si" })}>
          {destacada ? "Quitar destacado" : modo === "opciones" ? "Marcar como recomendada" : "Destacar"}
        </button>
      )}
    </div>
  );
}

export const FasesUOpcionesSection: FC<SectionProps<FasesUOpcionesData>> = ({ data, ctx, editable, onChange }) => {
  const lang = landingLang(ctx.lang);
  const items = Array.isArray(data.items) ? data.items : [];
  const modo = modoDe(data.modo);
  const set = (next: Partial<FasesUOpcionesData>) => onChange?.({ ...data, ...next });
  const cols = columnasDeFases(items.length);

  if (items.length === 0 && !editable) return null;

  return (
    <>
      {editable && (
        <div className="stl-vista-bar stl-mod-modo" role="group" aria-label="Fases u opciones">
          <button type="button" className={`stl-vista-btn${modo === "fases" ? " is-on" : ""}`} onClick={() => set({ modo: "fases" })}>
            Fases (una ruta)
          </button>
          <button type="button" className={`stl-vista-btn${modo === "opciones" ? " is-on" : ""}`} onClick={() => set({ modo: "opciones" })}>
            Opciones (elegir una)
          </button>
        </div>
      )}
      {(data.intro || editable) && (
        <Editable as="p" className="stl-lead" editable={editable} value={data.intro ?? ""}
          placeholder="Una frase que enmarca la ruta o la decisión (opcional)…" onCommit={(v) => set({ intro: v })} />
      )}
      <SortableItems items={items} disabled={!editable} onReorder={(next) => set({ items: next })}
        container={(nodes) => <div className={`stl-grid stl-grid-${cols} stl-mod-fases`}>{nodes}</div>}>
        {(it, i, handle) => (
          <TarjetaDeFase item={it} i={i} modo={modo} lang={lang} editable={editable} handle={handle}
            onCambio={(next) => set({ items: replaceAt(items, i, next) })}
            onQuitar={() => set({ items: removeAt(items, i) })} />
        )}
      </SortableItems>
      {editable && items.length < 6 && (
        <AddBtn label={modo === "opciones" ? "Agregar opción" : "Agregar fase"}
          onClick={() => set({ items: appendItem(items, { ...FASE_VACIA, incluye: [] }) })} />
      )}
    </>
  );
};
