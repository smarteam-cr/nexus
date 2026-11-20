/**
 * components/external/test/ResumenDeLaEscalaVista.tsx — LA PORTADA «Resumen» de la escala que ve el cliente (Elías, 9 nov;
 * rehecha el 10 nov como resumen ejecutivo y el 15 nov con la FORMA EDITORIAL de su referencia, artefacto «Escala de
 * Centauro · Editorial»). Es la primera pestaña, antes de Ventas, Servicio y Marketing, y la página abre en ella. Tema de
 * documento (hex literal de resumen-editorial.css: la página no tiene tema, no flipea) y en tuteo.
 *
 * Se lee en un minuto. Blanco, tinta azul marino, un solo azul, titulares cortos en negrita y una cifra grande por bloque:
 *   arriba, la empresa en la ceja, la TESIS (dos frases: el problema principal, 18 nov), las etiquetas del negocio, el
 *   alcance y, a la derecha, el tamaño del negocio si la empresa lo dijo (sin él, la tesis ocupa todo el ancho);
 *   «Puntos clave» (18 nov): los 5 más críticos de la empresa, en orden de peso (un Resumen de antes no los trae);
 *   01 «Lo que hicimos»: sesiones, tiempo, personas y las áreas exploradas (y la próxima por explorar, si hay);
 *   02 «Tu operación»: los pasos del cliente con su ícono hasta el resultado (el último, lleno), el bucle de los equipos que
 *      acompañan mientras opera y «Dónde se traba hoy», numerado sobre su paso;
 *   03 «Equipos y hallazgos»: una fila por subequipo (Televentas dice «Parte de Ventas») con el nivel de su equipo: quiénes
 *      son y qué hacen, lo que ya funciona, dos retos y «Ver diagnóstico de …»; a la derecha su cifra grande con su estado,
 *      o «Falta un dato». Un equipo sin sesiones sale apagado, sin cifra ni botón;
 *   la banda oscura con lo que falta validar (sin nada que validar, no sale) y el pie con la fecha.
 * Lo que decide qué sale es `resumenParaLaPagina` (lib/exploraciones/resumen-de-la-escala.ts); acá solo se pinta. La
 * pantalla interna (components/exploraciones/PaginaDeLaEscala.tsx) pasa `edicion`: cada texto se edita en su lugar y debajo
 * de cada pieza va de dónde sale (las citas, que el cliente nunca ve). Lo que bajó de visibilidad el 15 nov (aprobado por
 * Elías en el artefacto): la ficha con el logo del cliente, los atajos, el texto largo de cada etapa, «Lo que le impide
 * rendir más» (va con los retos), el «por qué este nivel» (lo cuenta la página del área) y las partes del negocio que no
 * son la tesis, las etiquetas, el alcance ni el tamaño (siguen guardadas: sostienen la tesis).
 */
import type { ReactNode } from "react";
import {
  enHoras,
  ETIQUETA_DEL_ESTADO,
  partirElTamano,
  MAX_ETIQUETAS,
  TOPE_A_MANO,
  TOPE_DE_LA_CIFRA,
  TOPE_DE_UN_NOMBRE,
  TOPE_DEL_TITULO_DEL_PUNTO,
  TOPE_DEL_TITULO_DEL_RECORRIDO,
  type CifraDeLaPagina,
  type CitaDelResumen,
  type EstadoDeLaCifra,
  type EtapaDeLaPagina,
  type IconoDelPaso,
  type ListaDeLaPagina,
  type PiezaDeLaPagina,
  type ResumenDeLaPagina,
  type SubequipoDeLaPagina,
  type TarjetaDeLaPagina,
} from "@/lib/external/pagina-del-resumen";
import { CLAVES, huella, quitadaDeLaPagina, textoDeLaPagina, type TextosDeLaPagina } from "@/lib/external/textos-de-la-pagina";
import AnimacionesDelResultado from "./AnimacionesDelResultado";
import type { EdicionDeUnTextoFijo } from "./ResultadoDelTestVista";
import { ArribaDeLaEscala, PESTANA_DEL_RESUMEN, type PestanaDeLaEscala } from "./ArribaDeLaEscala";
import "./diagnostico.css";
import "./resultado.css";
import "./resumen-editorial.css";

const LOGO_DE_COLOR = "/logo-smarteam.png";
/** Un «quiénes son» se pinta en negrita solo si es corto (la forma editorial lo pide de 2 a 6 palabras; el agente a veces lo explica: «Dos personas: quien coordina…»). */
const LARGO_DE_QUIENES = 80;
/** Una organización de una sola pieza va en negrita solo si es así de corta: más larga, suele contar qué hacen. */
const LARGO_DE_UNA_SOLA = 45;
const PARECE_QUIENES = /\d|\+|^(una?|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|jefatura|gerencia|coordinaci[oó]n)\b/i;

const fechaLarga = (iso: string) => new Intl.DateTimeFormat("es-CR", { day: "numeric", month: "long", year: "numeric", timeZone: "America/Costa_Rica" }).format(new Date(iso));

/** Lo que pasa la pantalla interna para editar el Resumen en su lugar. La página pública no lo pasa. */
export interface EdicionDelResumen {
  /** Las pestañas y los «Ver diagnóstico de…» son botones: cambian de área sin salir de la pantalla. */
  alElegir: (id: string) => void;
  /** Un texto que se edita en su lugar. `valor` null: la invitación (`vacio`). */
  texto: (o: { clave: string; valor: string | null; vacio: string; etiqueta: string; tope: number; quitar?: string | null }) => ReactNode;
  /** Debajo de una pieza, solo adentro: de dónde sale. `noSostiene`: la cita ya no dice la cifra. */
  deDonde?: (citas: readonly CitaDelResumen[], o?: { noSostiene?: boolean }) => ReactNode;
  /** Un texto fijo de la página (la bajada, los títulos, lo que hicimos, el pie), editable para esta empresa (16 nov). */
  fijo?: (o: EdicionDeUnTextoFijo) => ReactNode;
  /** «Confirmar» una cifra que dijo Smarteam y la empresa no corrigió (18 nov). `clave`: la de la cifra. */
  confirmar?: (clave: string) => ReactNode;
}

/** La señal de cómo se sabe una cifra: un símbolo y su texto, nunca solo el color. «Por confirmar» va sin signo. */
const SIMBOLO_DEL_ESTADO: Record<EstadoDeLaCifra, string | null> = { declarado: "✓", estimado: "≈", pendiente: null };
function Estado({ estado, nota }: { estado: EstadoDeLaCifra; nota?: ReactNode }) {
  return (
    <span className={`re-estado re-estado-${estado}`}>
      {SIMBOLO_DEL_ESTADO[estado] && <span aria-hidden="true">{SIMBOLO_DEL_ESTADO[estado]} </span>}
      {ETIQUETA_DEL_ESTADO[estado]}
      {nota ? <> · {nota}</> : null}
    </span>
  );
}

/** Los íconos de los pasos (trazos de 24 × 24, como los de la app). */
const TRAZOS: Record<IconoDelPaso, ReactNode> = {
  captacion: (
    <>
      <path d="m3 11 18-5v12L3 14v-3z" />
      <path d="M11.6 16.8a3 3 0 1 1-5.8-1.6" />
    </>
  ),
  contacto: (
    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z" />
  ),
  visita: (
    <>
      <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
      <circle cx="12" cy="10" r="3" />
    </>
  ),
  demo: (
    <>
      <rect x="2" y="3" width="20" height="14" rx="2" />
      <path d="M8 21h8M12 17v4" />
    </>
  ),
  cotizacion: (
    <>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" />
    </>
  ),
  cierre: (
    <>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
      <path d="m9 15 2 2 4-4" />
    </>
  ),
  configuracion: <path d="M20 16V7a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v9m16 0H4m16 0 1.3 2.6a1 1 0 0 1-.9 1.4H3.6a1 1 0 0 1-.9-1.4L4 16" />,
  entrega: (
    <>
      <path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2M15 18H9M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.62l-3.48-4.35A1 1 0 0 0 17.52 8H14" />
      <circle cx="17" cy="18" r="2" />
      <circle cx="7" cy="18" r="2" />
    </>
  ),
  tienda: <path d="M3 9l1.5-5h15L21 9M4 9v11h16V9M9 20v-6h6v6M3 9h18" />,
  opera: (
    <>
      <rect x="4" y="2" width="16" height="20" rx="2" />
      <path d="M9 22v-4h6v4M8 6h.01M12 6h.01M16 6h.01M8 10h.01M12 10h.01M16 10h.01M8 14h.01M12 14h.01M16 14h.01" />
    </>
  ),
  filtro: <path d="M22 3H2l8 9.46V19l4 2v-8.54L22 3z" />,
  soporte: (
    <>
      <path d="M3 11h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-5Zm0 0a9 9 0 1 1 18 0m0 0v5a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3Z" />
      <path d="M21 16v2a4 4 0 0 1-4 4h-5" />
    </>
  ),
};
const Icono = ({ de }: { de: IconoDelPaso }) => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    {TRAZOS[de]}
  </svg>
);

export default function ResumenDeLaEscalaVista({
  resumen,
  empresa,
  dominio = null,
  fecha = null,
  pestanas,
  edicion = null,
  textos = null,
}: {
  resumen: ResumenDeLaPagina;
  empresa: string | null;
  dominio?: string | null;
  /** Desde el 15 nov la ficha con el logo no sale (forma editorial): se acepta para no romper a quien lo pasa. */
  logo?: string | null;
  fecha?: string | null;
  /** Las pestañas de arriba, con la del Resumen primero. */
  pestanas: readonly PestanaDeLaEscala[];
  edicion?: EdicionDelResumen | null;
  /** Los textos fijos cambiados para esta empresa (16 nov, lib/external/textos-de-la-pagina.ts). */
  textos?: TextosDeLaPagina | null;
}) {
  const nombreDeLaEmpresa = empresa || dominio || "";
  // Un equipo sin sesiones: su pestaña se ve deshabilitada y afuera no se abre (Elías, 11 nov).
  pestanas = pestanas.map((p) => (resumen.sinExplorar.includes(p.id) ? { ...p, porExplorar: true } : p));
  const hrefDe = (id: string) => pestanas.find((p) => p.id === id)?.href ?? "#";
  /** Un texto: editable adentro, plano afuera. */
  const texto = (o: Parameters<EdicionDelResumen["texto"]>[0]) => (edicion ? edicion.texto(o) : o.valor);
  /** Un texto fijo de la página (16 nov): afuera el cambiado para esta empresa; adentro, editable en su lugar. */
  /**
   * `atado`: lo escrito vale solo mientras el de siempre sea el mismo (un número de «Lo que hicimos», quién hace un paso:
   * al rehacer el Resumen cambian, y lo escrito para el de antes no debe quedar pegado al nuevo).
   */
  const claveDe = (nombre: string, original: string, atado: boolean) => CLAVES.delResumen(atado ? `${nombre}.${huella(original)}` : nombre);
  const fijo = (nombre: string, original: string, etiqueta: string, quitable = false, atado = false): ReactNode => {
    const clave = claveDe(nombre, original, atado);
    const valor = textoDeLaPagina(textos, clave, original);
    return edicion?.fijo ? edicion.fijo({ clave, valor, original, etiqueta, quitar: quitable ? { clave, quitada: quitadaDeLaPagina(textos, clave) } : undefined }) : valor;
  };
  /** Si una pieza que se puede quitar sale: afuera, no si se quitó; adentro sale siempre (marcada). */
  const sale = (nombre: string, original: string, atado = false) => !!edicion?.fijo || !quitadaDeLaPagina(textos, claveDe(nombre, original, atado));
  /** Un párrafo con un texto fijo: adentro es un editor (un bloque), que no puede ir dentro de un <p>. */
  const P = edicion?.fijo ? "div" : "p";
  const deDonde = (citas: readonly CitaDelResumen[] | undefined, o?: { noSostiene?: boolean }) => (edicion?.deDonde && citas ? edicion.deDonde(citas, o) : null);
  /** «Ver diagnóstico de Servicio →»: su pestaña (un botón, como en los otros diseños). */
  const alDetalle = (areaId: string, contenido: ReactNode) =>
    edicion ? (
      <button type="button" className="re-boton" onClick={() => edicion.alElegir(areaId)}>
        {contenido}
      </button>
    ) : (
      <a className="re-boton" href={hrefDe(areaId)}>
        {contenido}
      </a>
    );
  /** Una pieza editable, con de dónde sale debajo (solo adentro). */
  const pieza = (p: PiezaDeLaPagina, etiqueta: string, tope = TOPE_A_MANO) => (
    <>
      {texto({ clave: p.clave, valor: p.texto, vacio: "+ Escribir", etiqueta, tope, quitar: "Quitar" })}
      {deDonde(p.citas)}
    </>
  );
  /** La invitación a agregar una pieza a una lista (solo adentro). */
  const agregar = (l: ListaDeLaPagina, etiqueta: string, vacio: string, clase = "re-agregar") =>
    edicion && l.nueva ? (
      <div key={`nuevo-${l.piezas.length}`} className={clase}>
        {texto({ clave: l.nueva, valor: null, vacio, etiqueta, tope: TOPE_A_MANO })}
      </div>
    ) : null;

  const negocio = resumen.negocio;
  const parte = (tipo: string) => negocio?.find((p) => p.tipo === tipo)?.lista ?? { piezas: [], nueva: null };
  const tesis = parte("tesis");
  const etiquetas = parte("etiquetas");
  const alcance = [...parte("abarca").piezas.map((p) => ({ p, k: "Qué abarca este diagnóstico" })), ...parte("fuera").piezas.map((p) => ({ p, k: "Qué queda fuera" }))];
  // Un Resumen de antes del 15 nov no tiene tesis: el titular dice qué es la página y la bajada, qué vende.
  const vende = parte("vende").piezas;
  const tamano = resumen.tamano;
  const h = resumen.hicimos;
  const exploradas = resumen.tarjetas.filter((t) => !t.porExplorar).map((t) => t.nombre);
  const sinExplorar = resumen.tarjetas.filter((t) => t.porExplorar).map((t) => t.nombre);
  const recorrido = resumen.recorrido;
  // El resultado para el cliente (el paso sin equipo) va siempre al final de la línea, aunque el agente lo ponga antes
  // (Polaris, simulacro del 15 nov: «Formularios web» quedó después de «Compra en tienda»).
  const enLinea = (recorrido ?? []).filter((e) => !e.continuo);
  const resultados = enLinea.filter((e) => !e.quien);
  const pasos = resultados.length === 1 ? [...enLinea.filter((e) => !!e.quien), resultados[0]] : enLinea;
  const continuos = (recorrido ?? []).filter((e) => e.continuo);
  const conRecorrido = !!recorrido && (recorrido.length > 0 || !!edicion);
  // «Dónde se traba hoy»: las fricciones en el orden de los pasos, después las del bucle; cada una con su número.
  const conTraba = [...pasos, ...continuos].filter((e) => e.friccion || edicion);
  const numeroDeLaTraba = (e: EtapaDeLaPagina) => (e.friccion ? [...pasos, ...continuos].filter((x) => x.friccion).indexOf(e) + 1 : 0);
  const nivelDe = (t: TarjetaDeLaPagina) => (t.porExplorar ? null : (t.nivel ?? null));
  // Los pendientes que arma la página («Conversar con tu equipo de…») se pueden quitar; sin ninguno, no hay banda.
  const pendientes = resumen.pendientes.filter((p) => p.clave || sale(`pendiente.${p.id}`, p.texto, true));
  let fila = 0;

  /**
   * Una cifra escrita a mano con su unidad («~50 formularios web/semana», «6,600 conversaciones»): afuera, el número en
   * grande y la unidad debajo; sin número al principio, en letra de texto. Sin esto la unidad se partía letra por letra
   * en la columna (Polaris, 16 nov). Adentro se edita la cifra entera, en letra más chica si es larga.
   */
  const cifra = (c: CifraDeLaPagina) => {
    const { valor, rotulo } = partirElTamano(c.cifra);
    // «14 de 25» es una proporción: con otro número en la unidad, va entera.
    const unidad = valor && !/\d/.test(rotulo) ? rotulo : "";
    const larga = !unidad && !/\d/.test(c.cifra.slice(0, 4));
    return (
    <div key={c.id} className={`re-cifra${c.noSale ? " re-cifra-fuera" : ""}`}>
      {edicion ? (
        <span className={`re-grande${c.cifra.length > 10 ? " re-grande-larga" : ""}`}>{texto({ clave: `${c.clave}:cifra`, valor: c.cifra, vacio: "+ La cifra", etiqueta: "La cifra", tope: TOPE_DE_LA_CIFRA })}</span>
      ) : (
        <>
          <span className={`re-grande${larga ? " re-grande-larga" : ""}`}>{unidad ? valor : c.cifra}</span>
          {unidad && <span className="re-unidad">{unidad}</span>}
        </>
      )}
      <b>{texto({ clave: `${c.clave}:texto`, valor: c.texto, vacio: "+ Qué significa", etiqueta: `Qué significa ${c.cifra}`, tope: TOPE_A_MANO, quitar: "Quitar esta cifra" })}</b>
      <Estado
        estado={c.estado}
        nota={
          c.conNota && (c.nota || edicion)
            ? texto({ clave: `${c.clave}:nota`, valor: c.nota, vacio: "+ Su base o lo que falta validar", etiqueta: "La base de la cifra", tope: TOPE_A_MANO, quitar: c.nota ? "Quitar la nota" : null })
            : c.nota
        }
      />
      {c.porConfirmar && edicion?.confirmar && (
        <p className="re-aviso-interno">
          La dijo Smarteam y la empresa no la corrigió. {edicion.confirmar(c.clave)}
        </p>
      )}
      {c.noSale && <p className="re-aviso-interno">{c.noSale}</p>}
      {deDonde(c.citas, { noSostiene: !!c.noSale })}
    </div>
    );
  };

  /** Una fila de «Equipos y hallazgos»: un subequipo con el nivel de su equipo de la escala. */
  const filaDelEquipo = (t: TarjetaDeLaPagina, x: SubequipoDeLaPagina) => {
    fila++;
    const org = x.organizacion.piezas;
    // «Jefatura + 5 asesores» va en negrita; lo que hacen, debajo. Un texto largo (un Resumen anterior) va normal.
    // Una sola pieza corta («Jefatura + 5 asesores») también es «quiénes son» (Centauro, 16 nov).
    // Sola, solo si se lee como quiénes son (un número, un «+» o «Una persona…»): «Responden consultas» es qué hacen.
    const quienes =
      (org.length >= 2 && org[0].texto.length <= LARGO_DE_QUIENES) || (org.length === 1 && org[0].texto.length <= LARGO_DE_UNA_SOLA && PARECE_QUIENES.test(org[0].texto))
        ? org[0]
        : null;
    const hace = quienes ? org.slice(1) : org;
    const retos = [...x.retos.piezas, ...x.frena.piezas];
    const conCifra = x.cifras.length > 0;
    return (
      <article key={`${t.id}-${x.id}`} className="re-equipo">
        <div className="re-equipo-nombre">
          <span className="re-num">{String(fila).padStart(2, "0")} /</span>
          <h3>{x.claveDelNombre ? texto({ clave: x.claveDelNombre, valor: x.nombre, vacio: "+ Nombre del equipo", etiqueta: "Nombre del equipo", tope: TOPE_DE_UN_NOMBRE, quitar: "Quitar este equipo" }) : x.nombre}</h3>
          {x.nombre !== t.nombre && <span className="re-parte-de">Parte de {t.nombre}</span>}
          <Nivel letra={nivelDe(t)} nombre={t.nivelNombre} />
        </div>
        <div className="re-equipo-medio">
          {quienes && <div className="re-quienes">{pieza(quienes, `Quiénes son en ${x.nombre}`)}</div>}
          {hace.map((p) => (
            <div key={p.id} className="re-hace">
              {pieza(p, `Qué hace ${x.nombre}`)}
            </div>
          ))}
          {agregar(x.organizacion, `Cómo está organizado ${x.nombre}`, "+ Quiénes son o qué hacen")}
          {x.bien.piezas.map((p) => (
            <div key={p.id} className="re-funciona">
              <span>{pieza(p, `Lo que ya funciona en ${x.nombre}`)}</span>
            </div>
          ))}
          {agregar(x.bien, `Lo que ya funciona en ${x.nombre}`, "+ Lo que ya funciona")}
          {(retos.length > 0 || edicion) && (
            <>
              <p className="re-rotulo">Retos</p>
              <ul className="re-retos">
                {retos.map((p) => (
                  <li key={p.id}>
                    <span>{pieza(p, `Reto de ${x.nombre}`)}</span>
                  </li>
                ))}
              </ul>
              {agregar(x.retos, `Reto de ${x.nombre}`, "+ Agregar un reto")}
            </>
          )}
          {alDetalle(t.areaId, `Ver diagnóstico de ${t.nombre} →`)}
        </div>
        {/* Sin cifra ni dato que falte (y afuera), la columna queda vacía y sin su raya. */}
        <div className={conCifra || x.falta || (edicion && (x.claveDeLaFalta || x.cifraNueva)) ? `re-equipo-cifra${conCifra ? "" : " re-sin-cifra"}` : undefined}>
          {x.cifras.map(cifra)}
          {edicion && x.cifraNueva && (
            <div key={`cifra-${x.cifras.length}`} className="re-agregar">
              {texto({ clave: x.cifraNueva, valor: null, vacio: "+ Agregar una cifra", etiqueta: "Nueva cifra", tope: TOPE_DE_LA_CIFRA })}
            </div>
          )}
          {!conCifra && (x.falta || (edicion && x.claveDeLaFalta)) && (
            <p className="re-falta-dato">
              <b>Falta un dato</b>
              {x.claveDeLaFalta ? texto({ clave: x.claveDeLaFalta, valor: x.falta, vacio: "+ Qué dato falta", etiqueta: "Qué dato falta", tope: TOPE_A_MANO, quitar: x.falta ? "Quitar" : null }) : x.falta}
            </p>
          )}
        </div>
      </article>
    );
  };

  /** Un equipo con nivel y sin nada escrito en el Resumen: su fila con el nivel y su botón (el detalle está en su pestaña). */
  const filaSinContenido = (t: TarjetaDeLaPagina) => {
    fila++;
    return (
      <article key={t.id} className="re-equipo">
        <div className="re-equipo-nombre">
          <span className="re-num">{String(fila).padStart(2, "0")} /</span>
          <h3>{t.nombre}</h3>
          <Nivel letra={nivelDe(t)} nombre={t.nivelNombre} />
        </div>
        <div className="re-equipo-medio">
          <P className="re-hace">{fijo(`sin-contenido.${t.areaId}`, "Lo completamos contigo en la próxima sesión.", `Lo que dice ${t.nombre} sin hallazgos`)}</P>
          {alDetalle(t.areaId, `Ver diagnóstico de ${t.nombre} →`)}
        </div>
        <div />
      </article>
    );
  };

  /** Un equipo sin sesiones: su fila apagada, sin cifra ni botón (su pestaña tampoco se abre afuera). */
  const filaPorExplorar = (t: TarjetaDeLaPagina) => {
    fila++;
    return (
      <article key={t.id} className="re-equipo re-por-explorar">
        <div className="re-equipo-nombre">
          <span className="re-num">{String(fila).padStart(2, "0")} /</span>
          <h3>{t.nombre}</h3>
          <Nivel letra={null} nombre="Por explorar" />
        </div>
        <div className="re-equipo-medio">
          <P className="re-hace">{fijo(`por-explorar.${t.areaId}`, `Lo conversamos en la sesión con tu equipo de ${t.nombre}.`, `Lo que dice ${t.nombre} por explorar`)}</P>
        </div>
        <div />
      </article>
    );
  };

  const Titular = edicion ? "div" : "h1";
  const conTesis = tesis.piezas.length > 0;
  // Los 5 puntos clave (18 nov), debajo del titular. Un Resumen o una foto de antes no los trae: la parte no sale.
  const puntos = resumen.puntos ?? [];
  const conPuntos = puntos.length > 0 || (!!edicion && !!resumen.puntoNuevo);
  // Las partes van numeradas en su orden; las que no salen no gastan número.
  let partesNumeradas = 0;
  const numero = (va: boolean) => (va ? String(++partesNumeradas).padStart(2, "0") : "");
  const nPuntos = numero(conPuntos);
  const nHicimos = numero(!!h);
  const nRecorrido = numero(conRecorrido && !!recorrido);
  const nEquipos = numero(resumen.tarjetas.length > 0);
  return (
    <div className={`dr rd-v3 rd-s2 rd-ed re${edicion ? " rd-editable" : ""}`}>
      <AnimacionesDelResultado className="rd rs" quieta={!!edicion}>
        {/* Adentro, el recorrido guiado de la preventa señala las pestañas: la de cada área es la que tiene el radar. */}
        <div data-recorrido={edicion ? "preventa.escala.dimensiones" : undefined}>
          <ArribaDeLaEscala pestanas={pestanas} actual={PESTANA_DEL_RESUMEN} alElegir={edicion?.alElegir} editorial />
        </div>

        <section className={`re-hero${tamano ? "" : " re-hero-sin-cifra"}`}>
          <div className="re-hero-texto">
            <p className="re-ceja rd-entra">
              {nombreDeLaEmpresa} <span>/ Diagnóstico</span>
            </p>
            <Titular className="re-titular rd-entra">
              {conTesis ? pieza(tesis.piezas[0], "La tesis", TOPE_A_MANO) : "Así entendimos tu negocio."}
            </Titular>
            {edicion && !conTesis && tesis.nueva && (
              <div className="re-agregar">{texto({ clave: tesis.nueva, valor: null, vacio: "+ Escribir la tesis (dos frases cortas)", etiqueta: "La tesis", tope: TOPE_A_MANO })}</div>
            )}
            <P className="re-bajada rd-entra">
              {/* Atada a su texto: si el Resumen pasa a tener tesis, la bajada de antes (lo que vende) no queda pegada. */}
              {fijo(
                "bajada",
                conTesis || !vende.length ? "Así entendimos tu negocio, cómo trabajan tus equipos y qué los frena hoy." : vende.map((p) => p.texto).join(" "),
                "La bajada, debajo de la tesis",
                false,
                true,
              )}
            </P>
            {(etiquetas.piezas.length > 0 || edicion) && (
              <ul className="re-etiquetas rd-entra">
                {etiquetas.piezas.map((p) => (
                  <li key={p.id}>{pieza(p, "Una etiqueta del negocio")}</li>
                ))}
                {edicion && etiquetas.nueva && etiquetas.piezas.length < MAX_ETIQUETAS && (
                  <li key={`nueva-${etiquetas.piezas.length}`}>{texto({ clave: etiquetas.nueva, valor: null, vacio: "+ Etiqueta", etiqueta: "Una etiqueta del negocio", tope: TOPE_DE_UN_NOMBRE })}</li>
                )}
              </ul>
            )}
            {(alcance.length > 0 || edicion) && (
              <div className="re-alcance rd-entra">
                {alcance.map(({ p, k }) => (
                  <span key={p.id}>
                    {/* «La división de desarrollo a medida» sola no dice que queda fuera: se lo antepone si el texto no lo dice. */}
                    {k === "Qué queda fuera" && !/\bfuera\b/i.test(p.texto) && "Queda fuera: "}
                    {pieza(p, k)}{" "}
                  </span>
                ))}
                {edicion && !parte("abarca").piezas.length && parte("abarca").nueva && texto({ clave: parte("abarca").nueva!, valor: null, vacio: "+ Qué abarca", etiqueta: "Qué abarca este diagnóstico", tope: TOPE_A_MANO })}
                {edicion && !parte("fuera").piezas.length && parte("fuera").nueva && <> {texto({ clave: parte("fuera").nueva!, valor: null, vacio: "+ Qué queda fuera", etiqueta: "Qué queda fuera", tope: TOPE_A_MANO })}</>}
              </div>
            )}
          </div>
          {tamano ? (
            <div className={`re-cifra-negocio rd-entra${tamano.noSale ? " re-cifra-fuera" : ""}`}>
              {/* Sin un número al principio («Quinientos clientes»), sale como texto, sin la cifra en grande. */}
              {tamano.valor && <span className="re-grande">{tamano.valor}</span>}
              {/* Adentro se edita la frase entera («500 clientes activos»); afuera, el número en grande y su rótulo. */}
              <b>{edicion ? texto({ clave: tamano.clave, valor: [tamano.valor, tamano.rotulo].filter(Boolean).join(" "), vacio: "+ El tamaño del negocio", etiqueta: "El tamaño del negocio (número y unidad)", tope: TOPE_A_MANO, quitar: "Quitar" }) : tamano.rotulo}</b>
              {tamano.valor && <Estado estado={tamano.estado} />}
              {tamano.noSale && <p className="re-aviso-interno">{tamano.noSale}</p>}
              {deDonde(tamano.citas, { noSostiene: !!tamano.noSale })}
            </div>
          ) : (
            edicion &&
            parte("tamano").nueva && (
              <div className="re-agregar re-cifra-negocio">
                {texto({ clave: parte("tamano").nueva!, valor: null, vacio: "+ El tamaño del negocio («500 clientes activos»)", etiqueta: "El tamaño del negocio", tope: TOPE_A_MANO })}
              </div>
            )
          )}
        </section>

        {conPuntos && (
          <section className="re-parte" data-revela="" aria-labelledby="re-t0">
            <p className="re-ceja">
              {nPuntos} <span>/ Puntos clave</span>
            </p>
            <h2 className="re-titulo" id="re-t0">
              {fijo("titulo.puntos", "Lo más crítico hoy.", "Título de los puntos clave")}
            </h2>
            <ol className="re-puntos">
              {puntos.map((p, i) => (
                <li key={p.id}>
                  <i aria-hidden="true">{i + 1}</i>
                  <div>
                    <h3>{texto({ clave: `${p.clave}:titulo`, valor: p.titulo, vacio: "+ El título", etiqueta: "Título del punto clave", tope: TOPE_DEL_TITULO_DEL_PUNTO, quitar: "Quitar este punto" })}</h3>
                    {(p.texto || edicion) && (
                      <div className="re-punto-texto">{texto({ clave: `${p.clave}:texto`, valor: p.texto || null, vacio: "+ Qué pasa y qué consecuencia tiene", etiqueta: `Qué explica «${p.titulo}»`, tope: TOPE_A_MANO })}</div>
                    )}
                    {p.areaNombre && <span className="re-punto-area">{p.areaNombre}</span>}
                    {deDonde(p.citas)}
                  </div>
                </li>
              ))}
            </ol>
            {edicion && resumen.puntoNuevo && (
              <div key={`nuevo-${puntos.length}`} className="re-agregar">
                {texto({ clave: resumen.puntoNuevo, valor: null, vacio: "+ Agregar un punto clave", etiqueta: "Nuevo punto clave (su título)", tope: TOPE_DEL_TITULO_DEL_PUNTO })}
              </div>
            )}
          </section>
        )}

        {h && (
          <section className="re-parte" data-revela="" aria-labelledby="re-t1">
            <p className="re-ceja">
              {nHicimos} <span>/ Lo que hicimos</span>
            </p>
            <h2 className="re-titulo" id="re-t1">
              {fijo("titulo.hicimos", "El diagnóstico, contigo.", "Título de lo que hicimos")}
            </h2>
            <div className="re-hicimos">
              <div>
                <b>{fijo("hicimos.sesiones", String(h.sesiones), "Cuántas sesiones", false, true)}</b>
                <span>{fijo("hicimos.sesiones.rotulo", h.sesiones === 1 ? "sesión de exploración" : "sesiones de exploración", "Rótulo de las sesiones", false, true)}</span>
              </div>
              {h.minutos > 0 && (
                <div>
                  <b>{fijo("hicimos.tiempo", enHoras(h.minutos), "Cuánto tiempo de conversación", false, true)}</b>
                  <span>{fijo("hicimos.tiempo.rotulo", "de conversación", "Rótulo del tiempo")}</span>
                </div>
              )}
              {h.personas > 0 && (
                <div>
                  <b>{fijo("hicimos.personas", String(h.personas), "Cuántas personas", false, true)}</b>
                  <span>{fijo("hicimos.personas.rotulo", h.personas === 1 ? "persona de tu equipo" : "personas de tu equipo", "Rótulo de las personas", false, true)}</span>
                </div>
              )}
              {exploradas.length > 0 && (
                <div>
                  <b className="re-hicimos-texto">{fijo("hicimos.areas", exploradas.join(" · "), "Las áreas exploradas", false, true)}</b>
                  <span>{fijo("hicimos.areas.rotulo", exploradas.length === 1 ? "área explorada" : "áreas exploradas", "Rótulo de las áreas", false, true)}</span>
                </div>
              )}
            </div>
            {/* Atada a su texto: explorada un área, la frase cambia y lo escrito para la de antes deja de salir. */}
            {sinExplorar.length > 0 && sale("proxima", `Próxima área por explorar: ${sinExplorar.join(", ")}.`, true) && (
              <P className="re-proxima">{fijo("proxima", `Próxima área por explorar: ${sinExplorar.join(", ")}.`, "La próxima área por explorar", true, true)}</P>
            )}
          </section>
        )}

        {conRecorrido && recorrido && (
          <section className="re-parte" data-revela="" aria-labelledby="re-t2">
            <p className="re-ceja">
              {nRecorrido} <span>/ Tu operación</span>
            </p>
            <h2 className="re-titulo" id="re-t2">
              {resumen.claveDelTituloDelRecorrido
                ? texto({ clave: resumen.claveDelTituloDelRecorrido, valor: resumen.tituloDelRecorrido ?? (edicion ? null : "Cómo pasa un cliente por tus áreas."), vacio: "Cómo pasa un cliente por tus áreas. (+ Escribir el título)", etiqueta: "Título del recorrido", tope: TOPE_DEL_TITULO_DEL_RECORRIDO })
                : "Cómo pasa un cliente por tus áreas."}
            </h2>
            <div className="re-diagrama">
              {pasos.length > 0 && (
                <ol className="re-pasos" style={{ ["--re-n" as string]: pasos.length }}>
                  {pasos.map((e) => {
                    const n = numeroDeLaTraba(e);
                    return (
                      <li key={e.id} className="re-paso">
                        <span className="re-icono">
                          <Icono de={e.icono} />
                          {n > 0 && (
                            <i className="re-marca" aria-label={`Se traba aquí: ver ${n}`}>
                              {n}
                            </i>
                          )}
                        </span>
                        <h3>{texto({ clave: `${e.clave}:nombre`, valor: e.nombre, vacio: "+ El paso", etiqueta: "Nombre del paso", tope: TOPE_DE_UN_NOMBRE })}</h3>
                        {e.quien && <span className="re-quien">{fijo(`paso.${e.id}.quien`, e.quien, `Quién hace ${e.nombre}`, false, true)}</span>}
                        {(e.texto || edicion) && <span className="re-detalle">{texto({ clave: `${e.clave}:texto`, valor: e.texto || null, vacio: "+ Un detalle", etiqueta: `El detalle de ${e.nombre}`, tope: TOPE_A_MANO, quitar: "Quitar este paso" })}</span>}
                        {deDonde(e.citas)}
                      </li>
                    );
                  })}
                </ol>
              )}
              {continuos.length > 0 && (
                <div className="re-continuo" style={{ ["--re-desde" as string]: `${pasos.length >= 2 ? ((pasos.length - 2) / pasos.length) * 100 : 0}%` }}>
                  {pasos.length >= 2 && <div className="re-corchete" aria-hidden="true" />}
                  {continuos.map((e) => {
                    const n = numeroDeLaTraba(e);
                    return (
                      <div key={e.id} className="re-continuo-uno">
                        <span className="re-chip-continuo">
                          <Icono de={e.icono} />
                          {/* Dos que acompañan del mismo equipo (Soporte y Customer Success, los dos de Servicio): cada uno por su nombre. */}
                          {edicion
                            ? texto({ clave: `${e.clave}:nombre`, valor: e.nombre, vacio: "+ El paso", etiqueta: "Nombre del paso que acompaña", tope: TOPE_DE_UN_NOMBRE })
                            : e.quien && continuos.filter((x) => x.quien === e.quien).length === 1
                              ? e.quien
                              : e.nombre}
                          {n > 0 && (
                            <i className="re-marca" aria-label={`Se traba aquí: ver ${n}`}>
                              {n}
                            </i>
                          )}
                        </span>
                        {(e.texto || edicion) && <div className="re-continuo-texto">{texto({ clave: `${e.clave}:texto`, valor: e.texto || null, vacio: "+ Qué hace mientras el cliente opera", etiqueta: `Qué hace ${e.nombre}`, tope: TOPE_A_MANO, quitar: "Quitar" })}</div>}
                        {deDonde(e.citas)}
                      </div>
                    );
                  })}
                </div>
              )}
              {conTraba.length > 0 && (
                <div className="re-trabas">
                  <h3>{fijo("titulo.trabas", "Dónde se traba hoy", "Título de dónde se traba")}</h3>
                  <ul>
                    {conTraba.map((e) => {
                      const n = numeroDeLaTraba(e);
                      return (
                        <li key={e.id} className={n ? undefined : "re-traba-vacia"}>
                          {n > 0 && <i>{n}</i>}
                          <span>{texto({ clave: `${e.clave}:friccion`, valor: e.friccion, vacio: `+ Lo que se traba en ${e.nombre}`, etiqueta: `Lo que se traba en ${e.nombre}`, tope: TOPE_A_MANO, quitar: e.friccion ? "Quitar" : null })}</span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
              {edicion && resumen.etapaNueva && (
                <div key={`nueva-${recorrido.length}`} className="re-agregar">
                  {texto({ clave: resumen.etapaNueva, valor: null, vacio: "+ Agregar un paso", etiqueta: "Nuevo paso", tope: TOPE_DE_UN_NOMBRE })}
                </div>
              )}
            </div>
          </section>
        )}

        {resumen.tarjetas.length > 0 && (
          <section className="re-parte" data-revela="" aria-labelledby="re-t3">
            <p className="re-ceja">
              {nEquipos} <span>/ Equipos y hallazgos</span>
            </p>
            <h2 className="re-titulo" id="re-t3">
              {fijo("titulo.equipos", "Cómo trabajan. Qué necesitan mejorar.", "Título de los equipos")}
            </h2>
            <div className="re-equipos">
              {resumen.tarjetas.flatMap((t) => (t.porExplorar ? [filaPorExplorar(t)] : t.subequipos.length ? t.subequipos.map((x) => filaDelEquipo(t, x)) : [filaSinContenido(t)]))}
            </div>
          </section>
        )}

        {(pendientes.length > 0 || (edicion && resumen.pendienteNuevo)) && (
          <section className="re-cierre" data-revela="" aria-labelledby="re-t4">
            <h2 id="re-t4">{fijo("titulo.cierre", "Tu mirada completa el diagnóstico.", "Título del cierre")}</h2>
            <P className="re-p">{fijo("cierre.bajada", "Antes de avanzar, confirmemos contigo:", "La frase del cierre")}</P>
            <ul>
              {pendientes.map((p) => (
                  <li key={p.id}>
                    {/* Los que arma la página («Conversar con tu equipo de…») no los guarda el agente: se cambian como texto fijo. */}
                    <span>
                      {p.clave
                        ? texto({ clave: p.clave, valor: p.texto, vacio: "+ Lo que falta", etiqueta: "Lo que falta validar", tope: TOPE_A_MANO, quitar: "Quitar" })
                        : fijo(`pendiente.${p.id}`, p.texto, "Lo que falta validar", true, true)}
                    </span>
                    {deDonde(p.citas)}
                  </li>
                ))}
            </ul>
            {edicion && resumen.pendienteNuevo && (
              <div key={`nuevo-${resumen.pendientes.length}`} className="re-agregar">
                {texto({ clave: resumen.pendienteNuevo, valor: null, vacio: "+ Agregar algo por validar", etiqueta: "Lo que falta validar", tope: TOPE_A_MANO })}
              </div>
            )}
          </section>
        )}

        <footer className="re-pie" data-revela="">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={LOGO_DE_COLOR} alt="Smarteam" height={22} />
          <span>
            {fijo(
              "pie",
              fecha ? `Medido el ${fechaLarga(fecha)}, con lo que conversamos contigo.` : "Medido con la Escala de Rendimiento de Smarteam, con lo que conversamos contigo.",
              "El pie de la página",
              false,
              true,
            )}
          </span>
        </footer>
      </AnimacionesDelResultado>
    </div>
  );
}

/** El nivel de un equipo: el punto de su color y su nombre; sin nivel, «En medición» con el punto punteado. */
function Nivel({ letra, nombre }: { letra: string | null; nombre: string | null }) {
  return (
    <span className={`re-nivel${letra ? ` re-nivel-${letra}` : " re-nivel-medicion"}`}>
      <i aria-hidden="true" />
      {nombre ?? "En medición"}
    </span>
  );
}
