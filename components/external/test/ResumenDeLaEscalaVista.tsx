/**
 * components/external/test/ResumenDeLaEscalaVista.tsx — LA PORTADA «Resumen» de la escala que ve el cliente (Elías, 9 nov;
 * rehecha el 10 nov como resumen ejecutivo). Es la primera pestaña, antes de Ventas, Servicio y Marketing, y la página
 * abre en ella. Tema de documento (hex literal de resultado.css: la página no tiene tema) y en tuteo.
 *
 * Se recorre en 2 o 3 minutos, en cinco partes:
 *   1 «Qué entendimos de tu negocio»: qué vende, cómo gana, qué abarca y qué queda fuera, qué lo movió y qué busca. Lo
 *     que no se habló dice «Pendiente», no se completa;
 *   2 «Qué hicimos»: sesiones, tiempo, personas y los equipos explorados frente a los pendientes;
 *   3 «Cómo funciona tu operación hoy»: el recorrido del cliente entre áreas, horizontal en escritorio y vertical en el
 *     teléfono, con lo que se traba;
 *   4 «Qué encontramos por área»: una tarjeta por área OPERATIVA, comparables entre sí: cifras con su estado en palabras
 *     (lo dijiste tú · estimado · por confirmar), cómo está organizada, lo que ya hace bien, lo que la frena y sus retos.
 *     El nivel de la escala es una etiqueta discreta («provisional» si depende de partes por explorar) y el «por qué» va
 *     en un desplegable. «Ver diagnóstico de…» lleva a su pestaña;
 *   5 «Qué falta validar» (cada pendiente con su tipo) y «¿Entendimos bien?».
 * El rojo solo marca lo respaldado por evidencia (los retos y lo que se traba): la página no se ve toda en rojo.
 * Lo que decide qué sale es `resumenParaLaPagina` (lib/exploraciones/resumen-de-la-escala.ts); acá solo se pinta. La
 * pantalla interna (components/exploraciones/PaginaDeLaEscala.tsx) pasa `edicion`: cada texto se edita en su lugar y debajo
 * de cada pieza va de dónde sale (las citas, que el cliente nunca ve). «Armar / Rehacer con IA» y su aviso NO van acá:
 * van en la franja interna, fuera de este marco (Elías, 9 nov). Nada depende del hover: lo complementario va en `<details>`.
 */
import type { ReactNode } from "react";
import {
  enHoras,
  ETIQUETA_DEL_ESTADO,
  ETIQUETA_DEL_PENDIENTE,
  TOPE_A_MANO,
  TOPE_DE_LA_CIFRA,
  TOPE_DE_UN_NOMBRE,
  type CifraDeLaPagina,
  type CitaDelResumen,
  type EstadoDeLaCifra,
  type ListaDeLaPagina,
  type ResumenDeLaPagina,
  type TarjetaDeLaPagina,
} from "@/lib/external/pagina-del-resumen";
import AnimacionesDelResultado from "./AnimacionesDelResultado";
import { ArribaDeLaEscala, PESTANA_DEL_RESUMEN, type PestanaDeLaEscala } from "./ArribaDeLaEscala";
import "./diagnostico.css";
import "./resultado.css";

const LOGO_DE_COLOR = "/logo-smarteam.png";

const fechaLarga = (iso: string) => new Intl.DateTimeFormat("es-CR", { day: "numeric", month: "long", year: "numeric", timeZone: "America/Costa_Rica" }).format(new Date(iso));
const fechaCorta = (iso: string) => new Intl.DateTimeFormat("es-CR", { day: "numeric", month: "long", timeZone: "America/Costa_Rica" }).format(new Date(iso));

/** Lo que pasa la pantalla interna para editar el Resumen en su lugar. La página pública no lo pasa. */
export interface EdicionDelResumen {
  /** Las pestañas y los «Ver diagnóstico de…» son botones: cambian de área sin salir de la pantalla. */
  alElegir: (id: string) => void;
  /** Un texto que se edita en su lugar. `valor` null: la invitación (`vacio`). */
  texto: (o: { clave: string; valor: string | null; vacio: string; etiqueta: string; tope: number; quitar?: string | null }) => ReactNode;
  /** Debajo de una pieza, solo adentro: de dónde sale. `noSostiene`: la cita ya no dice la cifra. */
  deDonde?: (citas: readonly CitaDelResumen[], o?: { noSostiene?: boolean }) => ReactNode;
}

/** La señal de cómo se sabe una cifra: un símbolo y su texto, nunca solo el color. */
const SIMBOLO_DEL_ESTADO: Record<EstadoDeLaCifra, string> = { declarado: "✓", estimado: "≈", pendiente: "?" };
function Estado({ estado }: { estado: EstadoDeLaCifra }) {
  return (
    <span className={`rs-estado rs-estado-${estado}`}>
      <span aria-hidden="true">{SIMBOLO_DEL_ESTADO[estado]}</span>
      {ETIQUETA_DEL_ESTADO[estado]}
    </span>
  );
}

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
  const deDonde = (citas: readonly CitaDelResumen[] | undefined, o?: { noSostiene?: boolean }) => (edicion?.deDonde && citas ? edicion.deDonde(citas, o) : null);
  /** «Ver diagnóstico de Servicio»: su pestaña. */
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
  /** Una lista de piezas: cada una editable, con de dónde sale, y la invitación a agregar (solo adentro). */
  const piezas = (l: ListaDeLaPagina, etiqueta: string, o: { clase?: string; vacio?: ReactNode; agregar?: string; ordenada?: boolean } = {}) => {
    const Lista = o.ordenada ? "ol" : "ul";
    return (
      <>
        {l.piezas.length > 0 ? (
          <Lista className={o.clase ?? "rs-lista"}>
            {l.piezas.map((p) => (
              <li key={p.id}>
                {texto({ clave: p.clave, valor: p.texto, vacio: "+ Escribir", etiqueta, tope: TOPE_A_MANO, quitar: "Quitar" })}
                {p.dimensionNombre && <span className="rs-parte">{p.dimensionNombre}</span>}
                {deDonde(p.citas)}
              </li>
            ))}
          </Lista>
        ) : (
          !edicion && o.vacio
        )}
        {edicion && l.nueva && (
          <div key={`nuevo-${l.piezas.length}`} className="rs-agregar">
            {texto({ clave: l.nueva, valor: null, vacio: o.agregar ?? "+ Agregar", etiqueta, tope: TOPE_A_MANO })}
          </div>
        )}
      </>
    );
  };

  const h = resumen.hicimos;
  const armado = !!resumen.at;
  const negocio = resumen.negocio;
  const recorrido = resumen.recorrido;
  const conRecorrido = !!recorrido && (recorrido.length > 0 || !!edicion);
  const conValidar = resumen.pendientes.length > 0 || resumen.entendimos.length > 0 || (armado && !!edicion);
  const partes = [
    negocio ? { id: "rs-negocio", nombre: "Tu negocio" } : null,
    h ? { id: "rs-hicimos", nombre: "Qué hicimos" } : null,
    conRecorrido ? { id: "rs-operacion", nombre: "Tu operación" } : null,
    resumen.tarjetas.length ? { id: "rs-areas", nombre: "Qué encontramos" } : null,
    conValidar ? { id: "rs-validar", nombre: "Qué falta validar" } : null,
  ].filter((x): x is { id: string; nombre: string } => !!x);
  const numero = (id: string) => partes.findIndex((p) => p.id === id) + 1;
  const TituloDeLaPagina = edicion ? "p" : "h1";
  const nivelDe = (areaId: string) => resumen.areas.find((a) => a.areaId === areaId);

  const cifra = (c: CifraDeLaPagina) => (
    <div key={c.id} className={`rs-cifra${c.noSale ? " rs-cifra-fuera" : ""}`}>
      <div className="rs-cifra-n">{texto({ clave: `${c.clave}:cifra`, valor: c.cifra, vacio: "+ La cifra", etiqueta: "La cifra", tope: TOPE_DE_LA_CIFRA })}</div>
      <div className="rs-cifra-texto">{texto({ clave: `${c.clave}:texto`, valor: c.texto, vacio: "+ Qué significa", etiqueta: `Qué significa ${c.cifra}`, tope: TOPE_A_MANO, quitar: "Quitar esta cifra" })}</div>
      <div className="rs-cifra-pie">
        <Estado estado={c.estado} />
        {c.fecha && !c.noSale && <span>De la sesión del {fechaCorta(c.fecha)}</span>}
      </div>
      {(c.nota || (edicion && c.conNota)) && (
        <div className="rs-cifra-nota">
          {c.conNota ? texto({ clave: `${c.clave}:nota`, valor: c.nota, vacio: "+ Su base o lo que falta validar", etiqueta: "La base de la cifra", tope: TOPE_A_MANO, quitar: c.nota ? "Quitar la nota" : null }) : c.nota}
        </div>
      )}
      {c.noSale && <p className="rs-rojo-aviso">{c.noSale}</p>}
      {deDonde(c.citas, { noSostiene: !!c.noSale })}
    </div>
  );

  const tarjeta = (t: TarjetaDeLaPagina) => {
    const nivel = nivelDe(t.areaId);
    const conOrganizacion = t.organizacion.piezas.length > 0 || (!!edicion && !!t.organizacion.nueva);
    const conBien = t.bien.piezas.length > 0 || (!!edicion && !!t.bien.nueva);
    const conFrena = t.frena.piezas.length > 0 || (!!edicion && !!t.frena.nueva);
    const conRetos = t.retos.piezas.length > 0 || (!!edicion && !!t.retos.nueva);
    const vacia = !conOrganizacion && !conBien && !conFrena && !conRetos && !t.cifras.length && !t.falta;
    return (
      <article key={t.id} className="rs-area" data-nivel={t.nivel ?? undefined}>
        <header className="rs-area-cabeza">
          <h3 className="rs-area-nombre">
            {t.claveDelNombre ? texto({ clave: t.claveDelNombre, valor: t.nombre, vacio: "+ Nombre del área", etiqueta: "Nombre del área", tope: TOPE_DE_UN_NOMBRE, quitar: "Quitar esta área" }) : t.nombre}
          </h3>
          <span className="rs-nivel-chip">
            <span className="rd-punto" aria-hidden="true" />
            {t.nombre !== t.areaNombre ? `${t.areaNombre} · ` : ""}
            {t.nivelNombre ?? "En medición"}
            {t.provisional && <b> · provisional</b>}
          </span>
        </header>

        {(t.cifras.length > 0 || t.falta || (edicion && t.claveDeLaFalta)) && (
          <div className="rs-magnitud">
            {t.cifras.map(cifra)}
            {!t.cifras.length && (t.falta || edicion) && (
              <div className="rs-sin-cifra">
                <Estado estado="pendiente" />
                <span className="rs-sin-cifra-k">Sin cifra todavía. Para medirlo falta:</span>
                <span>{t.claveDeLaFalta ? texto({ clave: t.claveDeLaFalta, valor: t.falta, vacio: "+ Qué dato falta", etiqueta: "Qué dato falta", tope: TOPE_A_MANO, quitar: t.falta ? "Quitar" : null }) : t.falta}</span>
              </div>
            )}
          </div>
        )}

        {conOrganizacion && (
          <div className="rs-bloque">
            <p className="rs-bloque-k">Cómo está organizada</p>
            {piezas(t.organizacion, `Cómo está organizada ${t.nombre}`, { agregar: "+ Agregar" })}
          </div>
        )}
        {conBien && (
          <div className="rs-bloque rs-bloque-bien">
            <p className="rs-bloque-k">Lo que ya hace bien</p>
            {piezas(t.bien, `Lo que ya hace bien ${t.nombre}`, { agregar: "+ Agregar" })}
          </div>
        )}
        {conFrena && (
          <div className="rs-bloque">
            <p className="rs-bloque-k">Lo que le impide rendir más</p>
            {piezas(t.frena, `Lo que frena a ${t.nombre}`, { agregar: "+ Agregar" })}
          </div>
        )}
        {conRetos && (
          <div className="rs-bloque rs-bloque-retos">
            <p className="rs-bloque-k">Los retos, por prioridad</p>
            {piezas(t.retos, `Reto de ${t.nombre}`, { clase: "rs-retos", ordenada: true, agregar: "+ Agregar un reto" })}
          </div>
        )}
        {vacia && !edicion && <p className="rs-vacio">Todavía no conversamos lo suficiente con esta área: lo completamos contigo.</p>}

        {t.conPorque && nivel?.porque && (
          <details className="rs-porque">
            <summary>Por qué {nivel.nombre} está en {nivel.nivelNombre}{nivel.provisional ? " (provisional)" : ""}</summary>
            <div className="rs-porque-cuerpo">
              {texto({ clave: `porque:${t.areaId}`, valor: nivel.porque, vacio: "+ Por qué está ahí", etiqueta: `Por qué ${nivel.nombre} está en ${nivel.nivelNombre}`, tope: TOPE_A_MANO, quitar: nivel.origenDelPorque === "mano" ? "Volver al de los datos" : null })}
              {edicion && nivel.porqueViejo && <span className="rd-editable-origen">Los niveles cambiaron desde que se escribió: sale el de los datos. Rehaz el Resumen o escríbelo.</span>}
            </div>
          </details>
        )}
        {t.provisional && !t.conPorque && <p className="rs-provisional">Nivel provisional: depende de confirmar {enLista(t.provisional.map((x) => `«${x}»`))}.</p>}
        {alDetalle(t.areaId, `Ver diagnóstico de ${t.areaNombre} →`, "rs-cta")}
      </article>
    );
  };

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

        {negocio && (
          <section id="rs-negocio" className="rd-tarjeta" data-revela="">
            <p className="rd-eyebrow">{numero("rs-negocio")} · Qué entendimos de tu negocio</p>
            <div className="rs-negocio">
              {negocio.map((p) => (
                <div key={p.tipo} className="rs-negocio-parte">
                  <p className="rs-bloque-k">{p.titulo}</p>
                  {piezas(p.lista, p.titulo, {
                    clase: "rs-negocio-lista",
                    vacio: (
                      <p className="rs-pendiente-txt">
                        <Estado estado="pendiente" /> Lo vemos contigo.
                      </p>
                    ),
                  })}
                </div>
              ))}
            </div>
          </section>
        )}

        {h && (
          <section id="rs-hicimos" className="rd-tarjeta" data-revela="">
            <p className="rd-eyebrow">{numero("rs-hicimos")} · Qué hicimos</p>
            <div className="rs-numeros">
              <div className="rs-numero">
                <b>{h.sesiones}</b>
                <span>{h.sesiones === 1 ? "sesión" : "sesiones"} contigo</span>
              </div>
              {h.minutos > 0 && (
                <div className="rs-numero">
                  <b>
                    {h.sinDuracion ? <small>más de </small> : null}
                    {enHoras(h.minutos)}
                  </b>
                  <span>de conversación{h.sinDuracion ? ` (${h.sinDuracion === 1 ? "una sesión no registró" : `${h.sinDuracion} sesiones no registraron`} su duración)` : ""}</span>
                </div>
              )}
              {h.personas > 0 && (
                <div className="rs-numero">
                  <b>{h.personas}</b>
                  <span>{h.personas === 1 ? "persona de tu equipo" : "personas de tu equipo"}</span>
                </div>
              )}
            </div>
            {h.areas.length > 0 && (
              <ul className="rs-exploradas" aria-label="Las áreas que exploramos y las pendientes">
                {h.areas.map((a) => (
                  <li key={a.areaId} className={a.sesiones ? "rs-explorada" : "rs-por-explorar"}>
                    <span className="rs-explorada-marca" aria-hidden="true">
                      {a.sesiones ? "✓" : "○"}
                    </span>
                    <b>{a.nombre}</b>
                    <span>{a.sesiones ? `${a.sesiones} ${a.sesiones === 1 ? "sesión" : "sesiones"}${a.minutos ? ` · ${enHoras(a.minutos)}` : ""}` : "Por explorar"}</span>
                  </li>
                ))}
              </ul>
            )}
            <div className="rs-parrafo">{texto({ clave: "hicimos", valor: h.texto, vacio: "+ Qué hicimos", etiqueta: "Qué hicimos", tope: TOPE_A_MANO, quitar: h.mano ? "Volver al de los datos" : null })}</div>
          </section>
        )}

        {conRecorrido && recorrido && (
          <section id="rs-operacion" className="rd-tarjeta" data-revela="">
            <p className="rd-eyebrow">{numero("rs-operacion")} · Cómo funciona tu operación hoy</p>
            <p className="rs-intro">Cómo pasa un cliente por tus áreas, tal como nos lo contaste. Es lo de hoy, no lo que proponemos.</p>
            {recorrido.length > 0 && (
              <ol className="rs-recorrido">
                {recorrido.map((e, i) => (
                  <li key={e.id} className="rs-etapa">
                    <span className="rs-etapa-n" aria-hidden="true">
                      {i + 1}
                    </span>
                    <p className="rs-etapa-nombre">{texto({ clave: `${e.clave}:nombre`, valor: e.nombre, vacio: "+ La etapa", etiqueta: "Nombre de la etapa", tope: TOPE_DE_UN_NOMBRE })}</p>
                    {e.quien && <span className="rs-etapa-quien">{e.quien}</span>}
                    <div className="rs-etapa-texto">{texto({ clave: `${e.clave}:texto`, valor: e.texto || null, vacio: "+ Qué pasa ahí", etiqueta: `Qué pasa en ${e.nombre}`, tope: TOPE_A_MANO, quitar: "Quitar esta etapa" })}</div>
                    {(e.friccion || edicion) && (
                      <div className={e.friccion ? "rs-friccion" : "rs-friccion rs-friccion-vacia"}>
                        {e.friccion && <span className="rs-friccion-k">Se traba:</span>}{" "}
                        {texto({ clave: `${e.clave}:friccion`, valor: e.friccion, vacio: "+ Lo que se traba", etiqueta: `Lo que se traba en ${e.nombre}`, tope: TOPE_A_MANO, quitar: e.friccion ? "Quitar" : null })}
                      </div>
                    )}
                    {deDonde(e.citas)}
                  </li>
                ))}
              </ol>
            )}
            {edicion && resumen.etapaNueva && (
              <div key={`nueva-${recorrido.length}`} className="rs-agregar">
                {texto({ clave: resumen.etapaNueva, valor: null, vacio: "+ Agregar una etapa", etiqueta: "Nueva etapa", tope: TOPE_DE_UN_NOMBRE })}
              </div>
            )}
          </section>
        )}

        {resumen.tarjetas.length > 0 && (
          <section id="rs-areas" className="rs-seccion" data-revela="">
            <p className="rd-eyebrow">{numero("rs-areas")} · Qué encontramos por área</p>
            <div className="rs-areas">
              {resumen.tarjetas.map(tarjeta)}
            </div>
          </section>
        )}

        {conValidar && (
          <section id="rs-validar" className="rd-tarjeta" data-revela="">
            <p className="rd-eyebrow">{numero("rs-validar")} · Qué falta validar</p>
            {(resumen.pendientes.length > 0 || edicion) && (
              <>
                <p className="rs-intro">Lo que todavía puede cambiar este diagnóstico:</p>
                <ul className="rs-pendientes">
                  {resumen.pendientes.map((p) => (
                    <li key={p.id} className={`rs-pendiente rs-pendiente-${p.tipo}`}>
                      <span className="rs-pendiente-tipo">{ETIQUETA_DEL_PENDIENTE[p.tipo]}</span>
                      <span>{p.clave ? texto({ clave: p.clave, valor: p.texto, vacio: "+ Lo que falta", etiqueta: "Lo que falta validar", tope: TOPE_A_MANO, quitar: "Quitar" }) : p.texto}</span>
                      {deDonde(p.citas)}
                    </li>
                  ))}
                </ul>
                {edicion && resumen.pendienteNuevo && (
                  <div key={`nuevo-${resumen.pendientes.length}`} className="rs-agregar">
                    {texto({ clave: resumen.pendienteNuevo, valor: null, vacio: "+ Agregar algo por validar", etiqueta: "Lo que falta validar", tope: TOPE_A_MANO })}
                  </div>
                )}
              </>
            )}
            {(resumen.entendimos.length > 0 || (armado && edicion)) && (
              <div className="rs-entendimos">
                <h2>¿Entendimos bien?</h2>
                <p className="rs-intro">Esto es lo que más nos importa haber entendido. Si algo no es así, dínoslo cuando lo revisemos juntos.</p>
                <ul>
                  {resumen.entendimos.map((p) => (
                    <li key={p.id}>{texto({ clave: `entendimos:${p.id}`, valor: p.texto, vacio: "+ Algo para confirmar", etiqueta: "¿Entendimos bien?", tope: TOPE_A_MANO, quitar: "Quitar" })}</li>
                  ))}
                </ul>
                {edicion && (
                  <div key={`nuevo-${resumen.entendimos.length}`} className="rs-agregar">
                    {texto({ clave: "entendimos:nuevo", valor: null, vacio: "+ Agregar algo para confirmar", etiqueta: "¿Entendimos bien?", tope: TOPE_A_MANO })}
                  </div>
                )}
              </div>
            )}
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
