/**
 * components/external/test/ResumenDeLaEscalaVista.tsx — LA PORTADA «Resumen» de la escala que ve el cliente (Elías, 9 nov).
 * Es la primera pestaña, antes de Ventas, Servicio y Marketing, y la página abre en ella. Tema de documento (hex literal
 * de resultado.css: la página no tiene tema) y en tuteo, como la página de cada área.
 *
 * Marco la presenta en 15 a 20 minutos, en este orden:
 *   · arriba, los DATOS ROJOS: dos o tres cifras de lo que la empresa está perdiendo, cada una con el equipo y la parte que
 *     explica (se entra a su pestaña) y la fecha de la reunión de donde sale. Sin datos verificados, no sale;
 *   · 1 «Lo que hicimos»: sesiones, tiempo invertido y equipos (reconoce su esfuerzo);
 *   · 2 «Lo que encontramos»: los hallazgos de cada equipo, con «Ver el detalle»;
 *   · 3 «Dónde quedan»: el nivel de cada equipo y por qué está ahí y no un nivel arriba o abajo;
 *   · 4 «¿Entendimos bien?» y «¿Falta algo?».
 * Lo que decide qué sale es `resumenParaLaPagina` (lib/exploraciones/resumen-de-la-escala.ts); acá solo se pinta. La
 * pantalla interna (components/exploraciones/PaginaDeLaEscala.tsx) pasa `edicion`: cada texto se edita en su lugar y debajo
 * de cada dato y hallazgo va de dónde sale (las citas, que el cliente nunca ve). «Armar / Rehacer con IA» y su aviso NO van
 * acá: van en la franja interna, fuera de este marco (Elías, 9 nov). Una cifra que no sale al cliente (`noSale`) solo
 * llega a la página interna, y acá se pinta marcada con su porqué.
 */
import type { ReactNode } from "react";
import { enHoras, TOPE_A_MANO, TOPE_DE_LA_CIFRA, type CitaDelResumen, type ResumenDeLaPagina } from "@/lib/external/pagina-del-resumen";
import AnimacionesDelResultado from "./AnimacionesDelResultado";
import { ArribaDeLaEscala, PESTANA_DEL_RESUMEN, type PestanaDeLaEscala } from "./ArribaDeLaEscala";
import "./diagnostico.css";
import "./resultado.css";

const LOGO_DE_COLOR = "/logo-smarteam.png";

const fechaLarga = (iso: string) => new Intl.DateTimeFormat("es-CR", { day: "numeric", month: "long", year: "numeric", timeZone: "America/Costa_Rica" }).format(new Date(iso));
const fechaCorta = (iso: string) => new Intl.DateTimeFormat("es-CR", { day: "numeric", month: "long", timeZone: "America/Costa_Rica" }).format(new Date(iso));

/** Lo que pasa la pantalla interna para editar el Resumen en su lugar. La página pública no lo pasa. */
export interface EdicionDelResumen {
  /** Las pestañas y los «Ver el detalle» son botones: cambian de área sin salir de la pantalla. */
  alElegir: (id: string) => void;
  /** Un texto que se edita en su lugar. `valor` null: la invitación (`vacio`). */
  texto: (o: { clave: string; valor: string | null; vacio: string; etiqueta: string; tope: number; quitar?: string | null }) => ReactNode;
  /** Debajo de un dato o un hallazgo, solo adentro: de dónde sale. `noSostiene`: la cita ya no dice la cifra. */
  deDonde?: (citas: readonly CitaDelResumen[], o?: { noSostiene?: boolean }) => ReactNode;
}

const IconoAlerta = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 3 2.5 20h19L12 3Z" />
    <path d="M12 10v4" />
    <path d="M12 17.5h.01" />
  </svg>
);

/** «A», «A y B», «A, B y C». */
const enLista = (xs: readonly string[]) => (xs.length <= 1 ? (xs[0] ?? "") : `${xs.slice(0, -1).join(", ")} y ${xs[xs.length - 1]}`);

export default function ResumenDeLaEscalaVista({
  resumen,
  empresa,
  dominio = null,
  fecha = null,
  pestanas,
  edicion = null,
}: {
  resumen: ResumenDeLaPagina;
  empresa: string | null;
  dominio?: string | null;
  fecha?: string | null;
  /** Las pestañas de arriba, con la del Resumen primero. */
  pestanas: readonly PestanaDeLaEscala[];
  edicion?: EdicionDelResumen | null;
}) {
  const nombreDeLaEmpresa = empresa || dominio || "";
  const hrefDe = (id: string) => pestanas.find((p) => p.id === id)?.href ?? "#";
  /** Un texto: editable adentro, plano afuera. */
  const texto = (o: Parameters<EdicionDelResumen["texto"]>[0]) => (edicion ? edicion.texto(o) : o.valor);
  /** «Ver el detalle de Ventas»: su pestaña. */
  const alDetalle = (areaId: string, contenido: ReactNode, className = "rs-enlace") =>
    edicion ? (
      <button type="button" className={className} onClick={() => edicion.alElegir(areaId)}>
        {contenido}
      </button>
    ) : (
      <a className={className} href={hrefDe(areaId)}>
        {contenido}
      </a>
    );
  const h = resumen.hicimos;
  const conHallazgos = resumen.areas.some((a) => a.hallazgos.length) || !!edicion;
  const armado = !!resumen.at;
  const conValidacion = armado && (resumen.entendimos.length > 0 || resumen.falta.length > 0 || !!edicion);
  const partes = [
    h ? { id: "rs-hicimos", nombre: "Lo que hicimos" } : null,
    armado && conHallazgos ? { id: "rs-encontramos", nombre: "Lo que encontramos" } : null,
    { id: "rs-quedan", nombre: "Dónde quedan" },
    conValidacion ? { id: "rs-validacion", nombre: "¿Entendimos bien?" } : null,
  ].filter((x): x is { id: string; nombre: string } => !!x);
  const TituloDeLaPagina = edicion ? "p" : "h1";

  return (
    <div className={`dr rd-v3${edicion ? " rd-editable" : ""}`}>
      <AnimacionesDelResultado className="rd rs" quieta={!!edicion}>
        {/* Adentro, el recorrido guiado de la preventa señala las pestañas: la de cada área es la que tiene el radar. */}
        <div data-recorrido={edicion ? "preventa.escala.dimensiones" : undefined}>
          <ArribaDeLaEscala pestanas={pestanas} actual={PESTANA_DEL_RESUMEN} alElegir={edicion?.alElegir} />
        </div>

        <section className="rs-cabecera">
          {nombreDeLaEmpresa && (
            <span className="rd-empresa rd-entra">
              <span className="rd-empresa-logo" aria-hidden="true">
                {nombreDeLaEmpresa.trim().charAt(0).toUpperCase()}
              </span>
              <span className="rd-empresa-txt">
                <b>{nombreDeLaEmpresa}</b>
                {dominio && dominio !== nombreDeLaEmpresa && <small>{dominio}</small>}
              </span>
            </span>
          )}
          <p className="rd-eyebrow rd-entra">Escala de rendimiento · Resumen</p>
          {fecha && <p className="rd-fecha rd-entra">{fechaLarga(fecha)}</p>}
          <TituloDeLaPagina className="rs-titulo rd-entra">Lo que vimos de tu empresa</TituloDeLaPagina>
          {partes.length > 1 && (
            <ol className="rs-ruta rd-entra" aria-label="Las partes de este resumen">
              {partes.map((p, i) => (
                <li key={p.id}>
                  <a href={`#${p.id}`}>
                    <span className="rs-ruta-n">{i + 1}</span>
                    {p.nombre}
                  </a>
                </li>
              ))}
            </ol>
          )}
        </section>

        {resumen.datosRojos.length > 0 && (
          <section className="rs-rojos" aria-label="Lo que hoy se te escapa" data-revela="">
            <p className="rd-eyebrow rs-eyebrow-rojo">Lo que hoy se te escapa</p>
            <div className="rs-rojos-lista">
              {resumen.datosRojos.map((d) => (
                <article key={d.id} className={`rs-rojo${d.noSale ? " rs-rojo-fuera" : ""}`}>
                  <span className="rs-rojo-icono">
                    <IconoAlerta />
                  </span>
                  <div className="rs-rojo-cifra">{texto({ clave: `rojo:${d.id}:cifra`, valor: d.cifra, vacio: "+ La cifra", etiqueta: "La cifra del dato", tope: TOPE_DE_LA_CIFRA })}</div>
                  <div className="rs-rojo-texto">
                    {texto({ clave: `rojo:${d.id}:texto`, valor: d.texto, vacio: "+ Qué significa", etiqueta: `Qué significa ${d.cifra}`, tope: TOPE_A_MANO, quitar: "Quitar este dato" })}
                  </div>
                  <p className="rs-rojo-pie">
                    {alDetalle(d.areaId, `${d.areaNombre}${d.dimensionNombre ? ` · ${d.dimensionNombre}` : ""} →`)}
                    {d.fecha && !d.noSale && <span>De la sesión del {fechaCorta(d.fecha)}</span>}
                  </p>
                  {d.noSale && <p className="rs-rojo-aviso">{d.noSale}</p>}
                  {edicion?.deDonde && d.citas && edicion.deDonde(d.citas, { noSostiene: !!d.noSale })}
                </article>
              ))}
            </div>
          </section>
        )}

        {h && (
          <section id="rs-hicimos" className="rd-tarjeta rs-hicimos" data-revela="">
            <p className="rd-eyebrow">1 · Lo que hicimos</p>
            <div className="rs-numeros">
              <div className="rs-numero">
                <b>{h.sesiones}</b>
                <span>{h.sesiones === 1 ? "sesión" : "sesiones"} de diagnóstico</span>
              </div>
              {h.minutos > 0 && (
                <div className="rs-numero">
                  <b>
                    {h.sinDuracion ? <small>más de </small> : null}
                    {enHoras(h.minutos)}
                  </b>
                  <span>de tu tiempo con nosotros</span>
                </div>
              )}
              {h.personas > 1 && (
                <div className="rs-numero">
                  <b>{h.personas}</b>
                  <span>personas de tu equipo</span>
                </div>
              )}
              {h.equipos.length > 0 && (
                <div className="rs-numero">
                  <b className="rs-numero-texto">{enLista(h.equipos)}</b>
                  <span>{h.equipos.length === 1 ? "el equipo" : "los equipos"} con que conversamos</span>
                </div>
              )}
            </div>
            <div className="rs-parrafo">{texto({ clave: "hicimos", valor: h.texto, vacio: "+ Lo que hicimos", etiqueta: "Lo que hicimos", tope: TOPE_A_MANO, quitar: h.mano ? "Volver al de los datos" : null })}</div>
          </section>
        )}

        {armado && conHallazgos && (
          <section id="rs-encontramos" className="rd-tarjeta" data-revela="">
            <p className="rd-eyebrow">2 · Lo que encontramos</p>
            <div className="rs-areas">
              {resumen.areas.map((a) => (
                <div key={a.areaId} className="rs-area" data-nivel={a.nivel ?? undefined}>
                  <p className="rs-area-nombre">
                    <span className="rd-punto" aria-hidden="true" />
                    {a.nombre}
                  </p>
                  {a.hallazgos.length ? (
                    <ul className="rs-hallazgos">
                      {a.hallazgos.map((x) => (
                        <li key={x.id}>
                          {texto({ clave: `hallazgo:${a.areaId}:${x.id}`, valor: x.texto, vacio: "+ Un hallazgo", etiqueta: `Hallazgo de ${a.nombre}`, tope: TOPE_A_MANO, quitar: "Quitar" })}
                          {x.dimensionNombre && <span className="rs-parte">{x.dimensionNombre}</span>}
                          {edicion?.deDonde && x.citas && edicion.deDonde(x.citas)}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    !edicion && <p className="rs-vacio">Todavía no conversamos lo suficiente con este equipo.</p>
                  )}
                  {edicion && (
                    <div key={`nuevo-${a.hallazgos.length}`} className="rs-agregar">
                      {texto({ clave: `hallazgo:${a.areaId}:nuevo`, valor: null, vacio: "+ Agregar un hallazgo", etiqueta: `Nuevo hallazgo de ${a.nombre}`, tope: TOPE_A_MANO })}
                    </div>
                  )}
                  {alDetalle(a.areaId, `Ver el detalle de ${a.nombre} →`)}
                </div>
              ))}
            </div>
          </section>
        )}

        <section id="rs-quedan" className="rd-tarjeta" data-revela="">
          <p className="rd-eyebrow">{partes.findIndex((p) => p.id === "rs-quedan") + 1} · Dónde quedan</p>
          <div className="rs-quedan">
            {resumen.areas.map((a) => (
              <div key={a.areaId} className="rs-queda" data-nivel={a.nivel ?? undefined}>
                <div className="rs-queda-nivel">
                  <span className="rs-queda-area">{a.nombre}</span>
                  <span className="rs-queda-v">
                    <span className="rd-punto" aria-hidden="true" />
                    {a.nivelNombre ?? "En medición"}
                  </span>
                </div>
                <div className="rs-queda-porque">
                  {a.nivel
                    ? texto({ clave: `porque:${a.areaId}`, valor: a.porque, vacio: "+ Por qué está ahí", etiqueta: `Por qué ${a.nombre} está en ${a.nivelNombre}`, tope: TOPE_A_MANO, quitar: a.origenDelPorque === "mano" ? "Volver al de los datos" : null })
                    : "Todavía nos faltan partes de este equipo para darle un nivel: lo completamos contigo."}
                  {edicion && a.porqueViejo && <span className="rd-editable-origen">Los niveles cambiaron desde que se escribió: sale el de los datos. Rehaz el Resumen o escríbelo.</span>}
                  {alDetalle(a.areaId, `Ver ${a.nombre} →`)}
                </div>
              </div>
            ))}
          </div>
        </section>

        {conValidacion && (
          <section id="rs-validacion" className="rd-tarjeta" data-revela="">
            <p className="rd-eyebrow">{partes.findIndex((p) => p.id === "rs-validacion") + 1} · La validación</p>
            <div className="rs-validacion">
              {(
                [
                  ["entendimos", "¿Entendimos bien?", "Confírmalo o corrígenos:", resumen.entendimos],
                  ["falta", "¿Falta algo?", "Lo que todavía no alcanzamos a ver:", resumen.falta],
                ] as const
              )
                // Una columna sin nada no sale afuera (revisión del 9 nov: quedaba el título y la frase sin preguntas).
                .filter(([, , , lista]) => lista.length > 0 || !!edicion)
                .map(([k, titulo, intro, lista]) => (
                <div key={k} className="rs-preguntas">
                  <h2>{titulo}</h2>
                  <p className="rs-intro">{intro}</p>
                  <ul>
                    {lista.map((p) => (
                      <li key={p.id}>{texto({ clave: `${k}:${p.id}`, valor: p.texto, vacio: "+ Una pregunta", etiqueta: titulo, tope: TOPE_A_MANO, quitar: "Quitar" })}</li>
                    ))}
                  </ul>
                  {edicion && (
                    <div key={`nuevo-${lista.length}`} className="rs-agregar">
                      {texto({ clave: `${k}:nuevo`, valor: null, vacio: k === "entendimos" ? "+ Agregar algo para confirmar" : "+ Agregar una pregunta", etiqueta: titulo, tope: TOPE_A_MANO })}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        <footer className="rd-pie" data-revela="">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="rd-pie-logo" src={LOGO_DE_COLOR} alt="Smarteam" height={30} />
          <p className="rd-pie-texto">Medido con la Escala de Rendimiento de Smarteam, con lo que conversamos contigo.</p>
        </footer>
      </AnimacionesDelResultado>
    </div>
  );
}
