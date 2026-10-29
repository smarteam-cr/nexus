"use client";

/**
 * components/escala/Radar.tsx — el radar de la teoría: un área de la escala como radar (diseño aprobado por Elías el
 * 2026-10-28, pantallas `Teoria`, `TeoriaDimension` y `TeoriaCruce` del lienzo del radar).
 *
 * Es el Mapa en forma de radar, no una empresa: un eje por dimensión (la base operativa a la derecha, la producción a
 * la izquierda, con su nombre al costado) y un anillo por etapa, de Deficiente adentro a Óptimo afuera. Cada anillo es
 * una línea del color de su nivel, sin rellenos; Funcional va punteada, con su chip «La base». En el centro, el área.
 * En cada cruce de eje y anillo va la celda del Mapa con cuántos criterios tiene de lo que se elige en «Qué se cuenta»
 * (la cuenta es la misma del Mapa: `lib/escala/radar.ts`); una celda en 0 es un punto gris chico. Los puntos van
 * siempre sobre las líneas, nunca dentro de una zona (Elías ya rechazó las zonas de color).
 *
 * Pasar el cursor por un cruce (o tocarlo) cuenta esa celda en el panel del costado, con sus criterios; pasar por una
 * dimensión (su nombre o su eje) cuenta sus cinco etapas. Tocar deja lo elegido fijo, y tocar fuera del radar lo
 * suelta. El número de «qué se trabaja primero» va junto al número de la dimensión, del lado de afuera: hacia el radar
 * tapaba un cruce. Para el teclado y los lectores de pantalla, los rótulos son botones y la tabla de abajo tiene cada
 * celda como botón.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { cn } from "@/lib/cn";
import { describirPerfil, type Perfil } from "@/lib/escala/documento/perfil";
import { LETRAS, type Letra } from "@/lib/escala/documento/tipos";
import {
  conPerfil,
  criteriosDelCruce,
  cuentaDeLaCelda,
  ejesDeLaTeoria,
  enPalabras,
  opcionesDeQueSeCuenta,
  QUE_SE_CUENTA,
  type EjeDeLaTeoria,
  type QueSeCuenta,
} from "@/lib/escala/radar";
import {
  anchoDelNumero,
  angulosDeLosEjes,
  anilloDeLaEtapa,
  cajaDelChipDeLaBase,
  CHIP_DE_LA_BASE,
  CRUCE,
  CRUCE_ELEGIDO,
  CRUCE_EN_FOCO,
  cruce,
  CX,
  CY,
  f,
  H,
  HALO,
  LETRA_DE_ETAPA,
  lugarDelOrden,
  polar,
  porcionDelEje,
  PUNTO_EN_CERO,
  puntosSvg,
  R_CENTRO,
  R_EJE_DESDE,
  R_EJE_HASTA,
  R_ORDEN,
  rotuloDeLaMitad,
  rotuloDelEje,
  W,
  yDelNombreDeEtapa,
} from "@/lib/escala/radar-dibujo";
import { lugarEnElOrden, ordenDeDependencias, type DatosDeLaVista } from "@/lib/escala/vista";
import { conteoDeDimension, useEscala } from "./contexto";
import { COLOR_DE_NIVEL } from "./niveles";
import { BOTON_CLARO, GrupoDeControl, MetaDelCriterio, NoAplicanEnLaEdicion, ROTULO, Segmentado, TextoConPalabras } from "./piezas";

/** Las rayas del dibujo, con los tokens del tema. */
const RAYA = { stroke: "var(--color-fg-muted)", strokeOpacity: 0.32, strokeWidth: 1 };

/** «1 reporte», «3 reportes». */
const cuantos = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

/** Lo que está en foco: una dimensión y, si se apuntó a un cruce, su etapa. */
type Foco = { dim: string; letra: Letra | null } | null;
const mismoFoco = (a: Foco, b: Foco) => (!a || !b ? a === b : a.dim === b.dim && a.letra === b.letra);

export default function Radar({ datos, perfil, onLeerDimension }: { datos: DatosDeLaVista; perfil: Perfil; onLeerDimension: (dimensionId: string) => void }) {
  const { conteos } = useEscala();
  const { area, niveles, capas } = datos;
  const dims = area.dimensiones;
  const disponibles = opcionesDeQueSeCuenta(perfil);
  const [queElegido, setQue] = useState<QueSeCuenta>("criterios");
  /** Si se quita el perfil, «Escondidos por el perfil» deja de existir: vuelve a todos los criterios. */
  const que = disponibles.includes(queElegido) ? queElegido : "criterios";
  const ejes = useMemo(() => ejesDeLaTeoria(area, perfil, datos.requeridos, que), [area, perfil, datos.requeridos, que]);
  const angulos = useMemo(() => angulosDeLosEjes(dims), [dims]);
  const todosLosAngulos = useMemo(() => [...angulos.values()], [angulos]);

  const [encima, setEncima] = useState<Foco>(null);
  const [fijo, setFijo] = useState<Foco>(null);
  const foco = encima ?? fijo;
  /** Lo del panel es lo fijo (con su X) mientras el cursor no apunte a otra cosa: encima de lo fijo, sigue fijo. */
  const panelFijo = !!fijo && (!encima || mismoFoco(encima, fijo));
  /** Lo que se anuncia a los lectores de pantalla: vive fuera del panel, que se cambia entero, para que sí se lea. */
  const [anuncio, setAnuncio] = useState("");
  /**
   * Al elegir desde el panel (una etapa, ← →, la X), el botón que se tocó desaparece con el panel: el foco del teclado
   * pasa al título del panel nuevo, para no volver al comienzo de la página.
   */
  const seccionRef = useRef<HTMLElement>(null);
  const [enfocarElPanel, setEnfocarElPanel] = useState(0);
  useEffect(() => {
    if (enfocarElPanel) seccionRef.current?.querySelector<HTMLElement>("[data-titulo-del-panel]")?.focus();
  }, [enfocarElPanel]);

  const nombreNivel = (l: Letra) => niveles.find((n) => n.letra === l)?.nombre ?? l;
  const perfilEnPalabras = describirPerfil(perfil);

  /** «Qué se trabaja primero», como en el mapa: el número junto al rótulo de cada dimensión, si hay un orden solo. */
  const ordenes = useMemo(
    () => new Map(capas.map((c) => [c.clave, ordenDeDependencias(datos.dependencias, area.nombre, c.nombre, perfil.cierre)])),
    [capas, datos.dependencias, area.nombre, perfil.cierre],
  );

  // Al salir de algo, soltar con un respiro: si el cursor entra enseguida a otra cosa (de un cruce a su eje), no parpadea.
  const soltarRef = useRef<number | null>(null);
  const ponerEncima = (fc: Foco) => {
    if (soltarRef.current) window.clearTimeout(soltarRef.current);
    soltarRef.current = null;
    setEncima(fc);
  };
  const soltarEncima = () => {
    if (soltarRef.current) window.clearTimeout(soltarRef.current);
    soltarRef.current = window.setTimeout(() => {
      soltarRef.current = null;
      setEncima(null);
    }, 80);
  };
  useEffect(
    () => () => {
      if (soltarRef.current) window.clearTimeout(soltarRef.current);
    },
    [],
  );

  /** Cómo se dice lo fijo, para los lectores de pantalla. */
  const decir = (fc: Foco) => {
    const e = fc ? ejes.find((x) => x.dimensionId === fc.dim) : null;
    if (!fc || !e) return "Nada fijo en el panel.";
    return fc.letra
      ? `${e.nombre} en ${nombreNivel(fc.letra)}, fijado en el panel: ${enPalabras(e.cuentas[fc.letra], que)}.`
      : `${e.nombre}, fijada en el panel: sus cinco etapas.`;
  };
  // Al tocar, se olvida el «por encima»: en una pantalla táctil el toque también lo pone, y taparía lo fijo.
  const tocar = (fc: Foco) => {
    ponerEncima(null);
    const nuevo = mismoFoco(fijo, fc) ? null : fc;
    setFijo(nuevo);
    setAnuncio(decir(nuevo));
  };
  /** Desde el panel o la tabla: elige sin alternar. Desde el panel, el foco pasa al panel nuevo. */
  const fijar = (fc: Foco, desdeElPanel = false) => {
    ponerEncima(null);
    setFijo(fc);
    setAnuncio(decir(fc));
    if (desdeElPanel) setEnfocarElPanel((n) => n + 1);
  };
  const soltar = (desdeElPanel = false) => {
    if (!fijo) return;
    setFijo(null);
    setAnuncio(decir(null));
    if (desdeElPanel) setEnfocarElPanel((n) => n + 1);
  };
  const alTecladoDelRotulo = (dim: string) => (e: KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      tocar({ dim, letra: null });
    } else if (e.key === "Escape") soltar();
  };

  // El número de «qué se trabaja primero» va pasado el final del número de la dimensión: se mide de verdad apenas está
  // dibujado (el ancho estimado es solo el primer lugar). Se mueve el atributo a mano para no volver a dibujar.
  const numerosRef = useRef(new Map<string, SVGTextElement>());
  const ordenesRef = useRef(new Map<string, SVGGElement>());
  useLayoutEffect(() => {
    for (const e of ejes) {
      const numero = numerosRef.current.get(e.dimensionId);
      const marca = ordenesRef.current.get(e.dimensionId);
      if (!numero || !marca) continue;
      let ancho: number;
      try {
        ancho = numero.getComputedTextLength();
      } catch {
        continue;
      }
      if (!(ancho > 0)) continue;
      const [x, y] = lugarDelOrden(rotuloDelEje(angulos.get(e.dimensionId)!, e.nombre, !e.aplica), ancho);
      marca.setAttribute("transform", `translate(${f(x)} ${f(y)})`);
    }
  });

  const ejeEnFoco = foco ? (ejes.find((e) => e.dimensionId === foco.dim) ?? null) : null;
  const chipDeLaBase = cajaDelChipDeLaBase(todosLosAngulos);
  const etiquetaDeQue = QUE_SE_CUENTA.find((q) => q.clave === que)!;

  return (
    <section
      ref={seccionRef}
      aria-label={`Radar de ${area.nombre}`}
      className="flex min-w-0 flex-col gap-3 rounded-[20px] border border-line bg-surface px-6 py-5"
      onKeyDown={(e) => {
        if (e.key === "Escape") soltar();
      }}
    >
      <p className="sr-only" aria-live="polite">
        {anuncio}
      </p>
      <div className="flex flex-wrap items-start justify-between gap-6">
        <div className="flex min-w-0 max-w-[560px] flex-col gap-1">
          <h2 className="text-base font-semibold text-fg">Radar de {area.nombre}</h2>
          <p className="text-[13px] leading-normal text-fg-muted">
            La escala misma, vista como radar: el mismo contenido del Mapa, con cada celda en el cruce de una dimensión y una etapa
            {perfilEnPalabras ? ` (con el perfil «${perfilEnPalabras}»: solo los criterios que aplican)` : ""}. No es una empresa.
          </p>
        </div>
        <GrupoDeControl
          nombre="Qué se cuenta"
          className="flex-row flex-wrap items-center gap-2"
          ayuda={`El número de cada cruce dice cuántos tiene esa celda de lo que elijas. ${QUE_SE_CUENTA.filter((q) => disponibles.includes(q.clave))
            .map((q) => `${q.etiqueta}: ${q.title}`)
            .join(" ")}${conPerfil(perfil) ? "" : " «Escondidos por el perfil» aparece al elegir un perfil de negocio arriba."}`}
        >
          <Segmentado<QueSeCuenta>
            etiqueta="Qué se cuenta"
            valor={que}
            onCambio={setQue}
            opciones={QUE_SE_CUENTA.filter((q) => disponibles.includes(q.clave)).map((q) => ({ clave: q.clave, etiqueta: q.etiqueta, title: q.title }))}
          />
        </GrupoDeControl>
      </div>

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_330px]">
        <div className="min-w-0" onMouseLeave={soltarEncima}>
          <svg
            viewBox={`0 0 ${W} ${H}`}
            className="mx-auto block h-auto max-h-[calc(100vh-11rem)] w-full"
            role="group"
            aria-label={`Radar de ${area.nombre}: un eje por dimensión y un anillo por etapa; cada cruce dice cuántos ${etiquetaDeQue.varios} tiene esa dimensión en esa etapa.`}
          >
            {/* El fondo: tocar fuera del radar suelta lo elegido. */}
            <rect width={W} height={H} style={{ fill: "transparent" }} onClick={() => soltar()} />

            {/* La porción de cada eje: pasar el cursor por cualquier parte enfoca la dimensión; tocarla la deja fija. */}
            {dims.map((d) => (
              <polygon
                key={d.id}
                points={puntosSvg(porcionDelEje(todosLosAngulos, angulos.get(d.id)!))}
                style={{ fill: "transparent", cursor: "pointer" }}
                onMouseEnter={() => ponerEncima({ dim: d.id, letra: null })}
                onMouseLeave={soltarEncima}
                onClick={() => tocar({ dim: d.id, letra: null })}
              />
            ))}

            <g aria-hidden style={{ pointerEvents: "none" }}>
              {/* El centro: el área. */}
              <circle cx={CX} cy={CY} r={R_CENTRO} style={{ fill: "var(--color-surface-muted)", stroke: "var(--color-line)", strokeWidth: 1 }} />
              <text x={CX} y={CY + 2} style={{ fill: "var(--color-fg)", fontSize: 26, fontWeight: 700, textAnchor: "middle" }}>
                {area.nombre}
              </text>
              <text x={CX} y={CY + 24} style={{ fill: "var(--color-fg-muted)", fontSize: 12.5, textAnchor: "middle" }}>
                {dims.length} dimensiones · {niveles.length} etapas
              </text>

              {/* Los ejes: salen del borde del centro. El de la dimensión en foco, más grueso y del color de marca. */}
              {ejes.map((e) => {
                const g = angulos.get(e.dimensionId)!;
                const [x1, y1] = polar(g, R_EJE_DESDE);
                const [x2, y2] = polar(g, R_EJE_HASTA);
                const enFoco = foco?.dim === e.dimensionId;
                return (
                  <line
                    key={e.dimensionId}
                    x1={f(x1)}
                    y1={f(y1)}
                    x2={f(x2)}
                    y2={f(y2)}
                    style={enFoco ? { stroke: "var(--color-brand)", strokeWidth: 2.5 } : { ...RAYA, strokeDasharray: e.aplica ? undefined : "3 4" }}
                  />
                );
              })}

              {/* Un anillo por etapa, del color de su nivel y sin relleno; Funcional, la base, punteada. */}
              {LETRAS.map((l, k) => (
                <polygon
                  key={l}
                  points={puntosSvg(anilloDeLaEtapa(todosLosAngulos, k))}
                  style={{
                    fill: "none",
                    stroke: COLOR_DE_NIVEL[l],
                    strokeOpacity: l === "F" ? 1 : 0.75,
                    strokeWidth: foco?.letra === l ? 3 : 1.75,
                    strokeDasharray: l === "F" ? "7 5" : undefined,
                  }}
                />
              ))}

              {/* El nombre de cada etapa, en el hueco de arriba, con halo del color de la superficie. */}
              {LETRAS.map((l, k) => (
                <text
                  key={l}
                  x={CX}
                  y={f(yDelNombreDeEtapa(todosLosAngulos, k))}
                  style={{
                    fill: "var(--color-fg-secondary)",
                    fontSize: LETRA_DE_ETAPA,
                    fontWeight: 600,
                    textAnchor: "middle",
                    stroke: "var(--color-surface)",
                    strokeWidth: 5,
                    paintOrder: "stroke",
                  }}
                >
                  {nombreNivel(l)}
                </text>
              ))}
              {/* El chip de «La base», abajo, sobre el anillo de Funcional. */}
              <rect
                x={chipDeLaBase.x0}
                y={f(chipDeLaBase.y0)}
                width={CHIP_DE_LA_BASE.ancho}
                height={CHIP_DE_LA_BASE.alto}
                rx={CHIP_DE_LA_BASE.alto / 2}
                style={{ fill: "var(--color-surface)", stroke: "var(--color-nivel-funcional)", strokeWidth: 1.25 }}
              />
              <text x={CX} y={f((chipDeLaBase.y0 + chipDeLaBase.y1) / 2 + 4)} style={{ fill: "var(--color-success-ink)", fontSize: 11.5, fontWeight: 600, textAnchor: "middle" }}>
                La base
              </text>

              {/* Los cruces: la cuenta de cada celda. En 0, un punto gris; el elegido, lleno del color de su nivel. */}
              {ejes.map((e) =>
                LETRAS.map((l, k) => {
                  const [x, y] = cruce(angulos.get(e.dimensionId)!, k);
                  const n = e.cuentas[l];
                  const enFoco = foco?.dim === e.dimensionId;
                  const elegido = enFoco && foco?.letra === l;
                  if (elegido) {
                    return (
                      <g key={`${e.dimensionId}-${l}`}>
                        <circle cx={f(x)} cy={f(y)} r={CRUCE_ELEGIDO} style={{ fill: COLOR_DE_NIVEL[l], stroke: "var(--color-surface)", strokeWidth: 2.5 }} />
                        <circle cx={f(x)} cy={f(y)} r={HALO} style={{ fill: "none", stroke: COLOR_DE_NIVEL[l], strokeOpacity: 0.35, strokeWidth: 2 }} />
                        {/* En blanco no se lee sobre Inicial ni Funcional: la tinta del tema con halo de la superficie, en claro y en oscuro. */}
                        <text
                          x={f(x)}
                          y={f(y + 3.9)}
                          style={{
                            fill: "var(--color-fg)",
                            stroke: "var(--color-surface)",
                            strokeWidth: 3,
                            paintOrder: "stroke",
                            fontSize: 11,
                            fontWeight: 700,
                            textAnchor: "middle",
                          }}
                        >
                          {n}
                        </text>
                      </g>
                    );
                  }
                  if (n === 0) {
                    return <circle key={`${e.dimensionId}-${l}`} cx={f(x)} cy={f(y)} r={PUNTO_EN_CERO} style={{ fill: "var(--color-fg-muted)", fillOpacity: 0.4 }} />;
                  }
                  return (
                    <g key={`${e.dimensionId}-${l}`}>
                      <circle
                        cx={f(x)}
                        cy={f(y)}
                        r={enFoco ? CRUCE_EN_FOCO : CRUCE}
                        style={{ fill: "var(--color-surface)", stroke: COLOR_DE_NIVEL[l], strokeWidth: enFoco ? 2.25 : 1.75 }}
                      />
                      <text x={f(x)} y={f(y + 3.4)} style={{ fill: "var(--color-fg)", fontSize: enFoco ? 10 : 9, fontWeight: 700, textAnchor: "middle" }}>
                        {n}
                      </text>
                    </g>
                  );
                }),
              )}

              {/* El nombre de cada mitad, al costado. */}
              {capas.map((c) => {
                const r = rotuloDeLaMitad(c.clave, c.nombre, c.descripcion);
                return (
                  <g key={c.clave}>
                    {r.nombre.map((linea) => (
                      <text key={linea.texto} x={r.x} y={f(linea.y)} style={{ fill: "var(--color-fg)", fontSize: 28, fontWeight: 700, textAnchor: r.ancla }}>
                        {linea.texto}
                      </text>
                    ))}
                    {r.descripcion.map((linea) => (
                      <text key={linea.texto} x={r.x} y={f(linea.y)} style={{ fill: "var(--color-fg-muted)", fontSize: 13, textAnchor: r.ancla }}>
                        {linea.texto}
                      </text>
                    ))}
                  </g>
                );
              })}
            </g>

            {/* Encima, la zona de cada cruce: más grande que el cruce, para el cursor y el dedo. */}
            {ejes.map((e) =>
              LETRAS.map((l, k) => {
                const [x, y] = cruce(angulos.get(e.dimensionId)!, k);
                return (
                  <circle
                    key={`${e.dimensionId}-${l}`}
                    cx={f(x)}
                    cy={f(y)}
                    r={14}
                    style={{ fill: "transparent", cursor: "pointer" }}
                    onMouseEnter={() => ponerEncima({ dim: e.dimensionId, letra: l })}
                    onMouseLeave={soltarEncima}
                    onClick={() => tocar({ dim: e.dimensionId, letra: l })}
                  />
                );
              }),
            )}

            {/* El rótulo de cada dimensión: su número (con sus reportes) y su nombre; un botón que la deja fija en el panel. */}
            {ejes.map((e) => {
              const r = rotuloDelEje(angulos.get(e.dimensionId)!, e.nombre, !e.aplica);
              const reportes = conteoDeDimension(conteos, e.dimensionId).total;
              const numero = `${e.dimensionId}${reportes > 0 ? ` · ${cuantos(reportes, "reporte", "reportes")}` : ""}`;
              const enFoco = foco?.dim === e.dimensionId;
              // «Qué se trabaja primero»: el número en un círculo, pasado el final del número de la dimensión.
              const capa = capas.find((c) => c.clave === e.capa);
              const filas = capa ? (ordenes.get(capa.clave) ?? []) : [];
              const orden = filas.length === 1 ? filas[0] : null;
              const dim = dims.find((d) => d.id === e.dimensionId);
              const lugar = orden && dim ? lugarEnElOrden(orden, dim) : null;
              const [ox, oy] = lugarDelOrden(r, anchoDelNumero(numero));
              return (
                <g key={e.dimensionId}>
                  <g
                    role="button"
                    tabIndex={0}
                    aria-label={`${e.dimensionId} ${e.nombre}${e.aplica ? "" : ", no aplica a este perfil"}: tócala para ver sus cinco etapas en el panel`}
                    aria-pressed={!!fijo && fijo.dim === e.dimensionId && fijo.letra === null}
                    className="cursor-pointer outline-none focus-visible:outline-2 focus-visible:outline-brand"
                    onMouseEnter={() => ponerEncima({ dim: e.dimensionId, letra: null })}
                    onMouseLeave={soltarEncima}
                    onFocus={() => ponerEncima({ dim: e.dimensionId, letra: null })}
                    onBlur={() => setEncima(null)}
                    onClick={() => tocar({ dim: e.dimensionId, letra: null })}
                    onKeyDown={alTecladoDelRotulo(e.dimensionId)}
                  >
                    <text
                      ref={(el) => {
                        if (el) numerosRef.current.set(e.dimensionId, el);
                        else numerosRef.current.delete(e.dimensionId);
                      }}
                      x={f(r.x)}
                      y={f(r.yNumero)}
                      style={{
                        textAnchor: r.ancla,
                        fontSize: 11,
                        fontWeight: 600,
                        letterSpacing: "0.06em",
                        fill: "var(--color-fg-muted)",
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      {numero}
                    </text>
                    {r.nombre.map((linea) => (
                      <text
                        key={linea.texto}
                        x={f(r.x)}
                        y={f(linea.y)}
                        style={{
                          textAnchor: r.ancla,
                          fontSize: 15,
                          fontWeight: 600,
                          fill: enFoco ? "var(--color-brand)" : e.aplica ? "var(--color-fg)" : "var(--color-fg-muted)",
                        }}
                      >
                        {linea.texto}
                      </text>
                    ))}
                    {!e.aplica && (
                      <text x={f(r.x)} y={f(r.yNota)} style={{ textAnchor: r.ancla, fontSize: 12, fill: "var(--color-fg-muted)" }}>
                        no aplica a este perfil
                      </text>
                    )}
                  </g>
                  {lugar && orden && capa && (
                    <g
                      ref={(el) => {
                        if (el) ordenesRef.current.set(e.dimensionId, el);
                        else ordenesRef.current.delete(e.dimensionId);
                      }}
                      transform={`translate(${f(ox)} ${f(oy)})`}
                      className="cursor-help"
                    >
                      <title>{`${lugar}.º en el orden de ${capa.nombre.toLowerCase()}: ${orden.orden.join(" → ")}. ${orden.porQue}`}</title>
                      <circle r={R_ORDEN} style={{ fill: "var(--color-surface)", stroke: "var(--color-fg-muted)", strokeWidth: 1.25 }} />
                      <text y={3.4} style={{ fill: "var(--color-fg)", fontSize: 9.5, fontWeight: 600, textAnchor: "middle" }}>
                        {lugar}
                      </text>
                    </g>
                  )}
                </g>
              );
            })}
          </svg>
        </div>

        {!ejeEnFoco ? (
          <ComoSeLee nombreNivel={nombreNivel} />
        ) : foco?.letra ? (
          <PanelDelCruce
            eje={ejeEnFoco}
            letra={foco.letra}
            que={que}
            datos={datos}
            perfil={perfil}
            nombreNivel={nombreNivel}
            fijo={panelFijo}
            onElegir={(letra) => fijar({ dim: ejeEnFoco.dimensionId, letra }, true)}
            onSoltar={() => soltar(true)}
          />
        ) : (
          <PanelDeLaDimension
            eje={ejeEnFoco}
            que={que}
            datos={datos}
            nombreNivel={nombreNivel}
            fijo={panelFijo}
            onElegir={(letra) => fijar({ dim: ejeEnFoco.dimensionId, letra }, true)}
            onSoltar={() => soltar(true)}
            onLeerDimension={onLeerDimension}
          />
        )}
      </div>

      <TablaDelRadar ejes={ejes} que={que} nombreNivel={nombreNivel} fijo={fijo} onElegir={fijar} />
    </section>
  );
}

const CAJA = "relative flex flex-col self-start rounded-[14px] bg-surface-muted p-4 xl:sticky xl:top-4";

/** Las flechas de los botones del panel. */
function Flecha({ hacia }: { hacia: "izquierda" | "derecha" }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {hacia === "derecha" ? (
        <>
          <path d="M5 12h14" />
          <path d="M13 6l6 6-6 6" />
        </>
      ) : (
        <>
          <path d="M19 12H5" />
          <path d="M11 6l-6 6 6 6" />
        </>
      )}
    </svg>
  );
}

/** El punto de 8 px del color de un nivel. */
function PuntoDeNivel({ letra, tamano = 8 }: { letra: Letra; tamano?: number }) {
  return (
    <svg width={tamano} height={tamano} viewBox="0 0 8 8" className="flex-shrink-0" aria-hidden>
      <circle cx="4" cy="4" r="4" style={{ fill: COLOR_DE_NIVEL[letra] }} />
    </svg>
  );
}

/** La X de lo que quedó fijo (también se suelta tocando fuera del radar, o con Escape). */
function Soltar({ onClick, que }: { onClick: () => void; que: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="absolute right-3 top-3 inline-flex h-7 w-7 items-center justify-center rounded-md text-fg-muted transition-colors hover:bg-surface-hover hover:text-fg"
      aria-label={`Soltar ${que}`}
      title="Soltar (también: tocar fuera del radar, o Escape)"
    >
      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden>
        <path d="M6 6l12 12M18 6L6 18" />
      </svg>
    </button>
  );
}

/** Al entrar, sin nada en foco: cómo se lee el dibujo. */
function ComoSeLee({ nombreNivel }: { nombreNivel: (l: Letra) => string }) {
  return (
    <aside aria-label="Detalle del radar" className={cn(CAJA, "gap-[14px]")}>
      <p data-titulo-del-panel tabIndex={-1} className={cn(ROTULO, "outline-none")}>
        Cómo se lee
      </p>
      <p className="text-[13px] leading-normal text-fg-secondary">
        Cada eje es una dimensión y cada anillo, una etapa. Donde se cruzan está la celda del Mapa: el número dice cuántos criterios tiene esa dimensión en esa
        etapa.
      </p>
      <ul className="flex flex-col gap-2">
        {LETRAS.map((l) => (
          <li key={l} className="flex items-center gap-2.5 text-[13px] text-fg">
            <svg width="20" height="10" viewBox="0 0 20 10" className="flex-shrink-0" aria-hidden>
              <line x1="0" y1="5" x2="20" y2="5" style={{ stroke: COLOR_DE_NIVEL[l], strokeWidth: 2.5, strokeDasharray: l === "F" ? "4 3" : undefined }} />
            </svg>
            <span className="font-semibold">{nombreNivel(l)}</span>
            {l === "F" && <span className="text-success-ink">· la base</span>}
          </li>
        ))}
      </ul>
      <p className="flex items-start gap-2.5 text-[12.5px] leading-[1.45] text-fg-secondary">
        <svg width="20" height="20" viewBox="0 0 20 20" className="flex-shrink-0" aria-hidden>
          <circle cx="10" cy="10" r="8.5" style={{ fill: "var(--color-surface)", stroke: "var(--color-fg-muted)", strokeWidth: 1.25 }} />
          <text x="10" y="13.8" style={{ fill: "var(--color-fg)", fontSize: 10.5, fontWeight: 600, textAnchor: "middle" }}>
            1
          </text>
        </svg>
        <span>Junto al número de una dimensión: su lugar en «qué se trabaja primero».</span>
      </p>
      <p className="flex items-start gap-2.5 text-[12.5px] leading-[1.45] text-fg-secondary">
        <svg width="20" height="20" viewBox="0 0 20 20" className="flex-shrink-0" aria-hidden>
          <circle cx="10" cy="10" r={PUNTO_EN_CERO} style={{ fill: "var(--color-fg-muted)", fillOpacity: 0.4 }} />
        </svg>
        <span>Un punto gris: en esa etapa no hay ninguno de lo que se cuenta.</span>
      </p>
      <div className="flex items-start gap-2.5 border-t border-line pt-3">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="mt-px flex-shrink-0 stroke-brand" aria-hidden>
          <path d="M9 9l5 12 1.8-5.2L21 14 9 9z" />
          <path d="M7.2 2.2L8 5.1" />
          <path d="M5.1 8L2.2 7.2" />
          <path d="M14 4.1L12 6" />
          <path d="M6 12l-1.9 2" />
        </svg>
        <p className="text-[13px] leading-normal text-fg-secondary">Toca un cruce para leer sus criterios, o el nombre de una dimensión para ver sus cinco etapas.</p>
      </div>
    </aside>
  );
}

/** Una dimensión: sus cinco etapas, cada una con su cuenta y su descripción. */
function PanelDeLaDimension({
  eje,
  que,
  datos,
  nombreNivel,
  fijo,
  onElegir,
  onSoltar,
  onLeerDimension,
}: {
  eje: EjeDeLaTeoria;
  que: QueSeCuenta;
  datos: DatosDeLaVista;
  nombreNivel: (l: Letra) => string;
  fijo: boolean;
  onElegir: (letra: Letra) => void;
  onSoltar: () => void;
  onLeerDimension: (dimensionId: string) => void;
}) {
  const dimension = datos.area.dimensiones.find((d) => d.id === eje.dimensionId);
  const capa = datos.capas.find((c) => c.clave === eje.capa);
  return (
    <aside aria-label="Detalle del radar" className={cn(CAJA, "gap-2.5")}>
      {fijo && <Soltar onClick={onSoltar} que="la dimensión" />}
      <p className={cn("pr-8", ROTULO)}>
        {eje.dimensionId}
        {capa ? ` · ${capa.nombre}` : ""}
      </p>
      <h3 data-titulo-del-panel tabIndex={-1} className="-mt-0.5 text-base font-semibold text-fg outline-none">
        {eje.nombre}
      </h3>
      {!eje.aplica && <p className="text-xs text-fg-muted">No aplica con este perfil de negocio.</p>}
      {dimension?.descripcion && (
        <p className="text-[13px] leading-normal text-fg-secondary">
          <TextoConPalabras texto={dimension.descripcion} palabras={datos.terminos} />
        </p>
      )}
      <ul className="flex flex-col divide-y divide-line rounded-[10px] bg-surface px-3">
        {(dimension?.niveles ?? []).map((nv) => (
          <li key={nv.id}>
            <button type="button" onClick={() => onElegir(nv.letra)} className="flex w-full flex-col gap-[3px] py-[9px] text-left hover:bg-surface-hover">
              <span className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-[7px] text-[13px] font-semibold text-fg">
                  <PuntoDeNivel letra={nv.letra} />
                  {nombreNivel(nv.letra)}
                </span>
                <span className="text-xs tabular-nums text-fg-muted">{enPalabras(eje.cuentas[nv.letra], que)}</span>
              </span>
              <span className="text-xs leading-[1.45] text-fg-muted">{nv.descripcion}</span>
            </button>
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={() => onLeerDimension(eje.dimensionId)}
        className={cn(BOTON_CLARO, "h-9 justify-center rounded-[10px] py-0 font-semibold text-fg")}
      >
        Leer la dimensión entera
        <Flecha hacia="derecha" />
      </button>
      <p className="text-xs leading-normal text-fg-muted">Toca una etapa (aquí o en su cruce) para leer sus criterios.</p>
    </aside>
  );
}

/** Un cruce: la etapa de esa dimensión, cuántos hay de cada clase y sus criterios con sus marcas. */
function PanelDelCruce({
  eje,
  letra,
  que,
  datos,
  perfil,
  nombreNivel,
  fijo,
  onElegir,
  onSoltar,
}: {
  eje: EjeDeLaTeoria;
  letra: Letra;
  que: QueSeCuenta;
  datos: DatosDeLaVista;
  perfil: Perfil;
  nombreNivel: (l: Letra) => string;
  fijo: boolean;
  onElegir: (letra: Letra) => void;
  onSoltar: () => void;
}) {
  const dimension = datos.area.dimensiones.find((d) => d.id === eje.dimensionId);
  const nv = dimension?.niveles.find((x) => x.letra === letra);
  if (!dimension || !nv) return null;
  const n = eje.cuentas[letra];
  const cuenta = (q: QueSeCuenta) => cuentaDeLaCelda(nv.criterios, q, perfil, datos.requeridos);
  // Los mismos criterios que cuenta el número del cruce (la regla vive en lib/escala/radar.ts).
  const listados = criteriosDelCruce(dimension, nv, que, perfil, datos.requeridos);
  // Cuántos hay de cada clase, de los que aplican.
  const clases = eje.aplica
    ? [
        que !== "criterios" ? enPalabras(cuenta("criterios"), "criterios") : null,
        cuenta("habitos") ? `${cuenta("habitos")} ${cuenta("habitos") === 1 ? "hábito" : "hábitos"}` : null,
        cuenta("riesgos") ? `${cuenta("riesgos")} de riesgo` : null,
        cuenta("requeridos") ? `${cuenta("requeridos")} que otros requieren` : null,
      ].filter(Boolean)
    : [];
  const escondidos = conPerfil(perfil) && que !== "perfil" ? cuenta("perfil") : 0;
  const k = LETRAS.indexOf(letra);
  const anterior = k > 0 ? LETRAS[k - 1] : null;
  const siguiente = k < LETRAS.length - 1 ? LETRAS[k + 1] : null;

  return (
    <aside aria-label="Detalle del radar" className={cn(CAJA, "gap-2.5")}>
      {fijo && <Soltar onClick={onSoltar} que="el cruce" />}
      <p className={cn("pr-8", ROTULO)}>
        {eje.dimensionId} · {eje.nombre}
      </p>
      <h3 data-titulo-del-panel tabIndex={-1} className="-mt-0.5 flex flex-wrap items-center gap-2 text-base font-semibold text-fg outline-none">
        <PuntoDeNivel letra={letra} tamano={10} />
        {nombreNivel(letra)} <span className="text-sm font-normal text-fg-muted">· {enPalabras(n, que)}</span>
      </h3>
      <p className="text-[13px] leading-normal text-fg-secondary">{nv.descripcion}</p>
      {!eje.aplica && que !== "perfil" && <p className="text-xs text-fg-muted">Esta dimensión no aplica con este perfil de negocio.</p>}
      {clases.length > 0 && <p className="text-xs text-fg-muted">{clases.join(" · ")}</p>}
      {listados.length > 0 ? (
        <ul className="flex flex-col divide-y divide-line rounded-[10px] bg-surface px-3">
          {listados.map((c) => (
            <li key={c.id} className="flex flex-col gap-[5px] py-[9px]">
              <span className="line-clamp-3 text-[12.5px] leading-[1.45] text-fg" title={c.texto}>
                <TextoConPalabras texto={c.texto} palabras={datos.terminos} />
              </span>
              <MetaDelCriterio criterio={c} datos={datos} perfil={perfil} />
            </li>
          ))}
        </ul>
      ) : (
        eje.aplica && <p className="text-xs text-fg-muted">En esta etapa no hay {QUE_SE_CUENTA.find((q) => q.clave === que)!.varios}.</p>
      )}
      {escondidos > 0 && (
        <p className="text-xs text-fg-muted">
          {escondidos} {escondidos === 1 ? "criterio no aplica" : "criterios no aplican"} a este perfil.
        </p>
      )}
      <NoAplicanEnLaEdicion nivel={nv} className="block text-xs" />
      <div className="flex gap-2">
        {anterior && (
          <button type="button" onClick={() => onElegir(anterior)} className={cn(BOTON_CLARO, "h-9 flex-1 justify-center rounded-[10px] py-0 font-semibold text-fg")}>
            <Flecha hacia="izquierda" />
            {nombreNivel(anterior)} · {eje.cuentas[anterior]}
          </button>
        )}
        {siguiente && (
          <button type="button" onClick={() => onElegir(siguiente)} className={cn(BOTON_CLARO, "h-9 flex-1 justify-center rounded-[10px] py-0 font-semibold text-fg")}>
            {nombreNivel(siguiente)} · {eje.cuentas[siguiente]}
            <Flecha hacia="derecha" />
          </button>
        )}
      </div>
    </aside>
  );
}

/** Los mismos números en una tabla: para quien no lee el dibujo, y para llegar a cada cruce con el teclado. */
function TablaDelRadar({
  ejes,
  que,
  nombreNivel,
  fijo,
  onElegir,
}: {
  ejes: EjeDeLaTeoria[];
  que: QueSeCuenta;
  nombreNivel: (l: Letra) => string;
  fijo: Foco;
  onElegir: (fc: Foco) => void;
}) {
  return (
    <details className="group rounded-xl border border-line text-xs text-fg-secondary">
      <summary className="cursor-pointer select-none px-3 py-2 font-medium text-fg-secondary hover:text-fg">Ver los números en una tabla</summary>
      <div className="overflow-x-auto px-3 pb-3">
        <table className="w-full min-w-[480px] border-collapse text-left">
          <caption className="sr-only">Cuántos {QUE_SE_CUENTA.find((q) => q.clave === que)!.varios} tiene cada dimensión en cada etapa</caption>
          <thead>
            <tr className="border-b border-line">
              <th className="py-1.5 pr-3 font-semibold text-fg">Dimensión</th>
              {LETRAS.map((l) => (
                <th key={l} className="py-1.5 pr-3 font-semibold text-fg">
                  <span className="inline-flex items-center gap-1.5">
                    <PuntoDeNivel letra={l} />
                    {nombreNivel(l)}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ejes.map((e) => (
              <tr key={e.dimensionId} className="border-b border-line last:border-0">
                <td className="py-1.5 pr-3 text-fg">
                  {e.nombre}
                  {!e.aplica && <span className="text-fg-muted"> · no aplica</span>}
                </td>
                {LETRAS.map((l) => {
                  const elegido = fijo?.dim === e.dimensionId && fijo.letra === l;
                  return (
                    <td key={l} className="py-1 pr-3">
                      <button
                        type="button"
                        aria-pressed={elegido}
                        aria-label={`${e.nombre} en ${nombreNivel(l)}: ${enPalabras(e.cuentas[l], que)}. Ver en el panel.`}
                        onClick={() => onElegir({ dim: e.dimensionId, letra: l })}
                        className={cn("min-w-8 rounded px-1.5 py-0.5 tabular-nums hover:bg-surface-hover", elegido ? "bg-surface-hover font-semibold text-fg" : e.cuentas[l] === 0 && "text-fg-muted")}
                      >
                        {e.cuentas[l]}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
