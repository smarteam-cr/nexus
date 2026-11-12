/**
 * components/external/test/ResumenDeLaEscalaVista.tsx — LA PORTADA «Resumen» de la escala que ve el cliente (Elías, 9 nov;
 * rehecha el 10 nov como resumen ejecutivo). Es la primera pestaña, antes de Ventas, Servicio y Marketing, y la página
 * abre en ella. Tema de documento (hex literal de resultado.css: la página no tiene tema) y en tuteo.
 *
 * Se recorre en 2 o 3 minutos (segunda vuelta, 11 nov). Arriba, en el bloque con degradado (Sistema 2, 12 nov): la
 * empresa con su logo, «Qué entendimos del negocio», los atajos a las cuatro partes (bajan suave hasta cada una) y las
 * tres cifras de lo que hicimos (sesiones, tiempo, personas). Después, cuatro partes:
 *   1 «Tu negocio»: qué vende, cómo gana, qué abarca y qué queda fuera, qué lo movió y qué busca. Lo
 *     que no pasó la verificación dice «Por confirmar», no se completa;
 *   2 «Cómo funciona tu operación hoy»: el recorrido de un cliente de punta a punta, una etapa por traspaso, horizontal en
 *     escritorio y vertical en el teléfono, con lo que se traba;
 *   3 «Qué encontramos por área»: una tarjeta por EQUIPO DE LA ESCALA con sus subequipos adentro (Soporte y Customer
 *     Success dentro de Servicio): cifras con su estado en palabras, cómo está organizado, lo que ya hace bien, lo que lo
 *     frena y sus retos. El nivel va normal (nunca «provisional») y el «por qué» en un desplegable. Un equipo sin sesiones
 *     dice «Por explorar» y su pestaña no se abre;
 *   4 «Qué falta validar»: tres líneas simples, sin etiquetas técnicas. «¿Entendimos bien?» salió (Elías, 11 nov).
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
  TOPE_A_MANO,
  TOPE_DE_LA_CIFRA,
  TOPE_DE_UN_NOMBRE,
  type CifraDeLaPagina,
  type CitaDelResumen,
  type EstadoDeLaCifra,
  type ListaDeLaPagina,
  type ResumenDeLaPagina,
  type SubequipoDeLaPagina,
  type TarjetaDeLaPagina,
} from "@/lib/external/pagina-del-resumen";
import AnimacionesDelResultado from "./AnimacionesDelResultado";
import { ArribaDeLaEscala, EmpresaDeLaEscala, PESTANA_DEL_RESUMEN, type PestanaDeLaEscala } from "./ArribaDeLaEscala";
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
/** «Por confirmar» va sin el signo de pregunta (Elías, 12 nov): su texto y su color gris ya lo dicen. */
const SIMBOLO_DEL_ESTADO: Record<EstadoDeLaCifra, string | null> = { declarado: "✓", estimado: "≈", pendiente: null };
function Estado({ estado }: { estado: EstadoDeLaCifra }) {
  return (
    <span className={`rs-estado rs-estado-${estado}`}>
      {SIMBOLO_DEL_ESTADO[estado] && <span aria-hidden="true">{SIMBOLO_DEL_ESTADO[estado]}</span>}
      {ETIQUETA_DEL_ESTADO[estado]}
    </span>
  );
}

export default function ResumenDeLaEscalaVista({
  resumen,
  empresa,
  dominio = null,
  logo = null,
  fecha = null,
  pestanas,
  edicion = null,
}: {
  resumen: ResumenDeLaPagina;
  empresa: string | null;
  dominio?: string | null;
  /** El logo de la ficha del cliente (`logoQueSeSirve`); sin él, el círculo con la inicial. */
  logo?: string | null;
  fecha?: string | null;
  /** Las pestañas de arriba, con la del Resumen primero. */
  pestanas: readonly PestanaDeLaEscala[];
  edicion?: EdicionDelResumen | null;
}) {
  const nombreDeLaEmpresa = empresa || dominio || "";
  // Un equipo sin sesiones: su pestaña dice «Por explorar» y no se abre (Elías, 11 nov).
  pestanas = pestanas.map((p) => (resumen.sinExplorar.includes(p.id) ? { ...p, porExplorar: true } : p));
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
  const conValidar = resumen.pendientes.length > 0 || (armado && !!edicion);
  const partes = [
    negocio ? { id: "rs-negocio", nombre: "Tu negocio" } : null,
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

  /** Un subequipo (o el equipo entero, si no tiene): sus cifras, cómo está organizado, lo que hace bien, lo que lo frena y sus retos. */
  const subequipo = (x: SubequipoDeLaPagina, conTitulo: boolean) => {
    const con = (l: ListaDeLaPagina) => l.piezas.length > 0 || (!!edicion && !!l.nueva);
    const vacio = !con(x.organizacion) && !con(x.bien) && !con(x.frena) && !con(x.retos) && !x.cifras.length && !x.falta;
    return (
      <div key={x.id} className={conTitulo ? "rs-subequipo" : "rs-subequipo rs-subequipo-solo"}>
        {conTitulo && (
          <h4 className="rs-subequipo-nombre">
            {x.claveDelNombre ? texto({ clave: x.claveDelNombre, valor: x.nombre, vacio: "+ Nombre del equipo", etiqueta: "Nombre del equipo", tope: TOPE_DE_UN_NOMBRE, quitar: "Quitar este equipo" }) : x.nombre}
          </h4>
        )}
        {(x.cifras.length > 0 || x.falta || (edicion && x.claveDeLaFalta)) && (
          <div className="rs-magnitud">
            {x.cifras.map(cifra)}
            {!x.cifras.length && (x.falta || edicion) && (
              <div className="rs-sin-cifra">
                <Estado estado="pendiente" />
                <span className="rs-sin-cifra-k">Sin cifra todavía. Para medirlo falta:</span>
                <span>{x.claveDeLaFalta ? texto({ clave: x.claveDeLaFalta, valor: x.falta, vacio: "+ Qué dato falta", etiqueta: "Qué dato falta", tope: TOPE_A_MANO, quitar: x.falta ? "Quitar" : null }) : x.falta}</span>
              </div>
            )}
          </div>
        )}
        {con(x.organizacion) && (
          <div className="rs-bloque rs-bloque-organizado">
            <p className="rs-bloque-k">Cómo está organizado</p>
            {piezas(x.organizacion, `Cómo está organizado ${x.nombre}`, { agregar: "+ Agregar" })}
          </div>
        )}
        {con(x.bien) && (
          <div className="rs-bloque rs-bloque-bien">
            <p className="rs-bloque-k">Lo que ya hace bien</p>
            {piezas(x.bien, `Lo que ya hace bien ${x.nombre}`, { agregar: "+ Agregar" })}
          </div>
        )}
        {con(x.frena) && (
          <div className="rs-bloque rs-bloque-frena">
            <p className="rs-bloque-k">Lo que le impide rendir más</p>
            {piezas(x.frena, `Lo que frena a ${x.nombre}`, { agregar: "+ Agregar" })}
          </div>
        )}
        {con(x.retos) && (
          <div className="rs-bloque rs-bloque-retos">
            <p className="rs-bloque-k">Los retos, por prioridad</p>
            {piezas(x.retos, `Reto de ${x.nombre}`, { clase: "rs-retos", ordenada: true, agregar: "+ Agregar un reto" })}
          </div>
        )}
        {vacio && !edicion && <p className="rs-vacio">Lo completamos contigo en la próxima sesión.</p>}
      </div>
    );
  };

  /** Un equipo de la escala: su nivel (normal), sus subequipos, el «por qué» en un desplegable y su pestaña. */
  const tarjeta = (t: TarjetaDeLaPagina) => {
    const nivel = nivelDe(t.areaId);
    if (t.porExplorar)
      return (
        <article key={t.id} className="rs-area rs-area-por-explorar">
          <header className="rs-area-cabeza">
            <h3 className="rs-area-nombre">{t.nombre}</h3>
            <span className="rs-nivel-chip">
              <span className="rd-punto" aria-hidden="true" />
              Por explorar
            </span>
          </header>
          <p className="rs-vacio">Lo conversamos en la sesión con tu equipo de {t.nombre}.</p>
        </article>
      );
    // Con un solo subequipo del mismo nombre que el equipo, no se repite el título.
    const conTitulos = t.subequipos.length > 1 || (t.subequipos[0] && t.subequipos[0].nombre !== t.nombre);
    return (
      <article key={t.id} className={`rs-area${t.subequipos.length > 1 ? " rs-area-ancha" : ""}`} data-nivel={t.nivel ?? undefined}>
        <header className="rs-area-cabeza">
          <h3 className="rs-area-nombre">{t.nombre}</h3>
          <span className="rs-nivel-chip">
            <span className="rd-punto" aria-hidden="true" />
            {t.nivelNombre ?? "En medición"}
          </span>
        </header>
        <div className={t.subequipos.length > 1 ? "rs-subequipos" : undefined}>{t.subequipos.map((x) => subequipo(x, !!conTitulos))}</div>
        {t.conPorque && nivel?.porque && (
          <details className="rs-porque">
            <summary>
              Por qué {nivel.nombre} está en {nivel.nivelNombre}
            </summary>
            <div className="rs-porque-cuerpo">
              {texto({ clave: `porque:${t.areaId}`, valor: nivel.porque, vacio: "+ Por qué está ahí", etiqueta: `Por qué ${nivel.nombre} está en ${nivel.nivelNombre}`, tope: TOPE_A_MANO, quitar: nivel.origenDelPorque === "mano" ? "Volver al de los datos" : null })}
              {edicion && nivel.porqueViejo && <span className="rd-editable-origen">Los niveles cambiaron desde que se escribió: sale el de los datos. Rehaz el Resumen o escríbelo.</span>}
            </div>
          </details>
        )}
        {alDetalle(t.areaId, `Ver diagnóstico de ${t.nombre} →`, "rs-cta")}
      </article>
    );
  };

  return (
    <div className={`dr rd-v3 rd-s2${edicion ? " rd-editable" : ""}`}>
      <AnimacionesDelResultado className="rd rs" quieta={!!edicion}>
        {/* Adentro, el recorrido guiado de la preventa señala las pestañas: la de cada área es la que tiene el radar. */}
        <div data-recorrido={edicion ? "preventa.escala.dimensiones" : undefined}>
          <ArribaDeLaEscala pestanas={pestanas} actual={PESTANA_DEL_RESUMEN} alElegir={edicion?.alElegir} />
        </div>

        <section className="rs-cabecera">
          <EmpresaDeLaEscala nombre={nombreDeLaEmpresa} dominio={dominio} logo={logo} />
          <p className="rd-eyebrow rd-entra">Escala de rendimiento · Resumen</p>
          {fecha && <p className="rd-fecha rd-entra">{fechaLarga(fecha)}</p>}
          <TituloDeLaPagina className="rs-titulo rd-entra">Qué entendimos del negocio</TituloDeLaPagina>
          {/* Los atajos van debajo del título (Elías, 12 nov); bajan suave hasta su parte (resultado.css, `scroll-behavior`). */}
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
          {h && (
            <div className="rs-numeros rd-entra" aria-label="Qué hicimos">
              <div className="rs-numero">
                <b>{h.sesiones}</b>
                <span>{h.sesiones === 1 ? "sesión contigo" : "sesiones contigo"}</span>
              </div>
              {h.minutos > 0 && (
                <div className="rs-numero">
                  <b>
                    {h.sinDuracion ? <small>más de </small> : null}
                    {enHoras(h.minutos)}
                  </b>
                  <span>de conversación</span>
                </div>
              )}
              {h.personas > 0 && (
                <div className="rs-numero">
                  <b>{h.personas}</b>
                  <span>{h.personas === 1 ? "persona de tu equipo" : "personas de tu equipo"}</span>
                </div>
              )}
            </div>
          )}
        </section>

        {negocio && (
          <section id="rs-negocio" className="rd-tarjeta" data-revela="">
            {/* «Tu negocio», no «Qué entendimos de tu negocio»: el título de la página ya lo dice (12 nov). */}
            <p className="rd-eyebrow">{numero("rs-negocio")} · Tu negocio</p>
            <div className="rs-negocio">
              {negocio.map((p) => (
                <div key={p.tipo} className="rs-negocio-parte">
                  <p className="rs-bloque-k">{p.titulo}</p>
                  {piezas(p.lista, p.titulo, {
                    clase: "rs-negocio-lista",
                    vacio: (
                      <p className="rs-pendiente-txt">
                        <Estado estado="pendiente" />
                      </p>
                    ),
                  })}
                </div>
              ))}
            </div>
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
                <ul className="rs-pendientes">
                  {resumen.pendientes.map((p) => (
                    <li key={p.id} className="rs-pendiente">
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
