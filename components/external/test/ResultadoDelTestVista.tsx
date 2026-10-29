/**
 * components/external/test/ResultadoDelTestVista.tsx — LA PÁGINA DE RESULTADOS del test del diagnóstico (área O,
 * 2026-10-26). Server component: el radar y las barras son SVG y CSS estáticos, así que la misma vista sirve para el PDF
 * (`modo="pdf"`, lib/print/pdf-runner.ts). Tema claro con hex literal, en tuteo.
 *
 * Rediseño aprobado por Elías el 29 oct (Claude Design, tableros `Main`, `Movil` y `PdfHoja1`): la estructura, el orden
 * y los textos de antes, con tres cambios — el radar es el de la teoría con la empresa como figura (RadarDeUnaEmpresa,
 * a todo el ancho de su tarjeta y con «Ver puntajes» apagado al abrir), cada sección usa el ancho (columnas lado a lado)
 * y la línea visual V3 de Nexus (Geist, tarjetas de 20 px, sombra suave, chips pastel, degradado en la cabecera; el
 * aspecto vive en resultado.css). El orden: los botones, la cabecera con el nivel y el radar, «Por dónde empezar» (UNA
 * recomendación, su razón y lo que cuesta quedarse), «Lo que hoy pone en riesgo a tu área», «Lo que lo mueve» (sin
 * precio), «Cómo está cada parte» (las barras con su puntaje sobre 100) y el calendario de HubSpot para agendar. El
 * nivel va marcado como ESTIMADO: lo dijo quien respondió.
 *
 * El pulido del 29 oct (pedido de Elías, mirando la aplicación vieja): arriba, el logo de color sobre el fondo claro con
 * los dos botones al lado (ya no la barra azul); la cabecera sin su contenedor, para que el radar gane ancho; toda la
 * letra un poco más grande; el movimiento de la vieja (AnimacionesDelResultado), y la agenda de HubSpot siempre
 * incrustada (la de la vieja si el servidor no trae otra).
 *
 * Los ajustes del 29 oct (segunda vuelta, mirando la vieja otra vez):
 *   · debajo del nivel, el RESUMEN del resultado en una o dos frases (el que redactó la IA al terminar, o el de los datos:
 *     lib/tests-diagnostico/redaccion.ts), en lugar del saludo con el nombre;
 *   · al pasar el cursor (o tocar) una dimensión del radar, su TARJETA (`TarjetaDeLaDimension`): qué mide, su puntaje y
 *     su nivel, cómo está y «En la escala, este nivel es:». Dice cómo estás; «Ver detalles» de su barra dice QUÉ HACER
 *     (qué priorizar para el nivel siguiente). Los dos salen de lib/tests-diagnostico/detalle-de-la-dimension.ts y
 *     no repiten lo mismo;
 *   · al final, «Diagnosticar otra área» y «Diagnosticar otra empresa» (como en la vieja) y el logo de Smarteam;
 *   · «El siguiente paso» con tres viñetas de lo que se lleva la persona.
 *
 * El PDF va en hojas horizontales (carta, 1056 × 816): la 1 con la cabecera (y el resumen) y el radar grande, la 2 con
 * las tres piezas y la 3 con las barras (cada una con qué priorizar) y el enlace para agendar. Sin botones, sin
 * calendario, sin puntajes en el radar, sin tarjetas y sin movimiento.
 * Las salidas a la portada son enlaces comunes y no `<Link>`: al volver con «Atrás», Next revivía la página en el
 * navegador y la agenda de HubSpot quedaba en blanco; con una carga completa vuelve bien (probado el 28 oct).
 */
import type { ReactNode } from "react";
import type { DetalleDeLaDimension } from "@/lib/tests-diagnostico/detalle-de-la-dimension";
import { etiquetaDeIndustria } from "@/lib/tests-diagnostico/direccion-publica";
import { ENLACE_DE_OTRA_EMPRESA, enlaceDeOtraArea, puntajeDeLaDimension } from "@/lib/tests-diagnostico/pagina-del-resultado";
import { resumenDelResultado } from "@/lib/tests-diagnostico/redaccion";
import type { DimensionDelResultado, ResultadoDelTest } from "@/lib/tests-diagnostico/resultado";
import RadarDeUnaEmpresa from "@/components/escala/RadarDeUnaEmpresa";
import AnimacionesDelResultado from "./AnimacionesDelResultado";
import CalendarioDeHubspot from "./CalendarioDeHubspot";
import DescargarPdfDelResultado from "./DescargarPdfDelResultado";
import "./diagnostico.css";
import "./resultado.css";

/** El de la barra azul de cada hoja del PDF. */
const LOGO_BLANCO = "/logo-smarteam-blanco.png";
/** El de la página, sobre el fondo claro (public/logo-smarteam.png, el mismo de ExternalShell). */
const LOGO_DE_COLOR = "/logo-smarteam.png";
const DESCRIPCION_DE_LA_CAPA: Record<string, string> = {
  base: "cómo está montado el departamento por dentro",
  produccion: "qué entrega el departamento hacia afuera",
};
/** El test es una estimación: lo dice cada tarjeta del radar y cada «Ver detalles». */
const FALTAN_PREGUNTAS = "Faltan preguntas por responder para ubicar mejor este puntaje: el test lo estima y el diagnóstico lo ubica con precisión.";
const FALTA_CORROBORAR = "Falta información por corroborar: en la sesión lo revisamos contigo con evidencia.";

const fechaLarga = (iso: string) =>
  new Intl.DateTimeFormat("es-CR", { day: "numeric", month: "long", year: "numeric", timeZone: "America/Costa_Rica" }).format(new Date(iso));

const IconoAlerta = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 8v5" />
    <path d="M12 17h.01" />
  </svg>
);
const IconoCheck = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="m5 12.5 4.5 4.5L19 7.5" />
  </svg>
);

/** Una sección blanca con su título chico arriba. `data-revela`: en la página, aparece al llegar a ella. */
function Tarjeta({ titulo, className = "", children }: { titulo?: string; className?: string; children: ReactNode }) {
  return (
    <section className={`rd-tarjeta ${className}`} data-revela="">
      {titulo && <p className="rd-eyebrow">{titulo}</p>}
      {children}
    </section>
  );
}

function PorDondeEmpezar({ rec }: { rec: NonNullable<ResultadoDelTest["recomendacion"]> }) {
  return (
    <Tarjeta className={`rd-empezar${rec.tipo === "trabajar" && rec.costoDeQuedarse ? " con-costo" : ""}`}>
      <div className="rd-empezar-texto">
        <p className="rd-eyebrow">Por dónde empezar</p>
        {rec.tipo === "trabajar" && (
          <h2>
            Llevar {rec.dimensionNombre.toLowerCase()} a {rec.objetivoNombre}
          </h2>
        )}
        <p className="rd-empezar-razon">{rec.razon}</p>
      </div>
      {rec.tipo === "trabajar" && rec.costoDeQuedarse && (
        <div className="rd-costo">
          <p className="rd-costo-titulo">Lo que cuesta quedarse así</p>
          <p>{rec.costoDeQuedarse}</p>
        </div>
      )}
    </Tarjeta>
  );
}

function Riesgos({ riesgos }: { riesgos: readonly string[] }) {
  return (
    <Tarjeta titulo="Lo que hoy pone en riesgo a tu área">
      <ul className="rd-riesgos">
        {riesgos.map((x) => (
          <li key={x}>
            <span className="rd-riesgo-icono">
              <IconoAlerta />
            </span>
            <span>{x}</span>
          </li>
        ))}
      </ul>
    </Tarjeta>
  );
}

function Casos({ casos }: { casos: ResultadoDelTest["casos"] }) {
  return (
    <Tarjeta titulo="Lo que lo mueve">
      <div className="rd-casos">
        {casos.map((c) => (
          <div key={c.id} className="rd-caso">
            <p className="rd-caso-titulo">{c.titulo}</p>
            <p className="rd-caso-promesa">{c.promesa}</p>
            {c.razon && <p className="rd-caso-razon">{c.razon}</p>}
          </div>
        ))}
      </div>
    </Tarjeta>
  );
}

/** Qué priorizar para el nivel siguiente: «Ver detalles» de la barra y, en el PDF, el renglón debajo de ella. */
function textoDeLaPrioridad(d: DetalleDeLaDimension): { titulo: string; texto: string } {
  return d.siguiente
    ? { titulo: `Qué priorizar para llegar a ${d.siguiente.nombre}`, texto: d.siguiente.prioridad }
    : { titulo: "Qué priorizar", texto: "Ya está en el nivel más alto de la escala: lo que sigue es sostenerlo y volver a medir." };
}

/** «Ver detalles» de una barra: qué hacer (no cómo está: eso lo dice la tarjeta del radar). */
function VerDetalles({ d }: { d: DetalleDeLaDimension }) {
  const p = textoDeLaPrioridad(d);
  return (
    <details className="rd-detalles">
      <summary>Ver detalles</summary>
      <div className="rd-detalles-cuerpo">
        <p className="rd-detalles-k">{p.titulo}</p>
        <p className="rd-detalles-prioridad">{p.texto}</p>
        <p className="rd-detalles-corroborar">{FALTA_CORROBORAR}</p>
      </div>
    </details>
  );
}

function Barras({ r, detalles = null, enPdf = false }: { r: ResultadoDelTest; detalles?: Record<string, DetalleDeLaDimension> | null; enPdf?: boolean }) {
  const frena = r.recomendacion?.tipo === "trabajar" ? r.recomendacion.dimensionId : null;
  return (
    <Tarjeta titulo="Cómo está cada parte">
      <div className="rd-barras">
        {r.capas.map((c) => {
          const dims = r.dimensiones.filter((d) => d.capa === c.clave && d.preguntada);
          if (!dims.length) return null;
          return (
            <div key={c.clave} className="rd-grupo">
              <div className="rd-grupo-head" data-revela="">
                <h3>{c.nombre}</h3>
                {DESCRIPCION_DE_LA_CAPA[c.clave] && <span>{DESCRIPCION_DE_LA_CAPA[c.clave]}</span>}
              </div>
              {dims.map((d) => {
                const p = puntajeDeLaDimension(d.nivel, d.puntaje);
                const det = detalles?.[d.id];
                return (
                  <div key={d.id} className="rd-fila" data-nivel={d.nivel ?? undefined}>
                    <span className="rd-fila-nombre">
                      {d.nombre}
                      {d.id === frena && <span className="rd-frena">LO QUE MÁS FRENA</span>}
                    </span>
                    <span className="rd-barra" aria-hidden="true">
                      <span className="rd-barra-fill" data-fill={Math.max(3, p)} style={{ width: `${Math.max(3, p)}%` }} />
                    </span>
                    <span className="rd-num">
                      {/* El número que cuenta es solo para la vista; el lector de pantalla lee el puntaje de una vez. */}
                      <span data-count={p} aria-hidden="true">
                        {p}
                      </span>
                      <span className="rd-sr">{p}</span>
                      <small>/100</small>
                    </span>
                    <span className="rd-chip" data-no-lo-se={d.noLoSe || undefined}>
                      {d.noLoSe ? "No lo sabías" : (d.nivelNombre ?? "Sin ubicar")}
                    </span>
                    {det && !enPdf && <VerDetalles d={det} />}
                    {det && enPdf && <p className="rd-fila-prioridad">{`${textoDeLaPrioridad(det).titulo}: ${textoDeLaPrioridad(det).texto}`}</p>}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
      {r.preguntadas < r.total && (
        <p className="rd-nota">
          Este test mira {r.preguntadas} de las {r.total} partes del área; las otras las vemos juntos en la sesión.
        </p>
      )}
    </Tarjeta>
  );
}

/**
 * La tarjeta de una dimensión del radar (como la de la aplicación vieja): la página trae una por dimensión, escondida, y
 * AnimacionesDelResultado muestra la de la dimensión bajo el cursor (o el dedo), al lado del puntero.
 */
function TarjetaDeLaDimension({ d, det }: { d: DimensionDelResultado; det: DetalleDeLaDimension | undefined }) {
  const p = puntajeDeLaDimension(d.nivel, d.puntaje);
  return (
    <div className="rd-tip" data-tarjeta={d.id} data-nivel={d.preguntada ? (d.nivel ?? undefined) : undefined} role="status" hidden>
      <div className="rd-tip-cabeza">
        <div className="rd-tip-id">
          <p className="rd-tip-nombre">{d.nombre}</p>
          {det?.queMide && <p className="rd-tip-mide">{det.queMide}</p>}
        </div>
        {d.preguntada && d.nivel && (
          <div className="rd-tip-puntaje">
            <span className="rd-tip-num">
              {p}
              <small>/100</small>
            </span>
            <span className="rd-tip-chip">{d.noLoSe ? "No lo sabías" : d.nivelNombre}</span>
          </div>
        )}
      </div>
      {!d.preguntada ? (
        <p className="rd-tip-lectura">Esta parte no se preguntó en este test: la vemos juntos en la sesión.</p>
      ) : (
        <>
          {(d.noLoSe || det?.lectura) && (
            <p className="rd-tip-lectura">
              {d.noLoSe ? `Contestaste «No lo sé», así que cuenta como ${d.nivelNombre}. ` : ""}
              {det?.lectura}
            </p>
          )}
          {det?.esteNivel && (
            <div className="rd-tip-escala">
              <p className="rd-tip-k">En la escala, este nivel es:</p>
              <ul>
                {det.esteNivel.criterios.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
            </div>
          )}
          <p className="rd-tip-estimado">{FALTAN_PREGUNTAS}</p>
        </>
      )}
    </div>
  );
}

/** Las dos capas, con su nivel (o que no se midió). */
function Capas({ r }: { r: ResultadoDelTest }) {
  return (
    <div className="rd-capas">
      {r.capas.map((c) => (
        <div key={c.clave} className="rd-capa" data-nivel={c.nivel ?? undefined}>
          <p className="rd-capa-k">{c.nombre}</p>
          <p className="rd-capa-v">
            <span className="rd-punto" aria-hidden="true" />
            {c.nivelNombre ?? (r.dimensiones.some((d) => d.capa === c.clave && d.preguntada) ? "Sin ubicar" : "No se midió")}
          </p>
        </div>
      ))}
    </div>
  );
}

/** Lo que se lleva quien agenda: lo que la página y el test ya prometen, sin ofertas nuevas. */
function vinetasDeLaSesion(area: string): string[] {
  return [
    `Lo que de verdad dice tu resultado: lo leemos contigo y corroboramos lo que el test solo estima de tu área de ${area}.`,
    "Por dónde empezar: qué atacar primero en tu operación y qué esperar de cada paso.",
    "Un primer paso claro, por escrito: te lo llevas aunque no trabajemos juntos.",
  ];
}

export default function ResultadoDelTestVista({
  r,
  empresa,
  dominio = null,
  fecha = null,
  industria = null,
  agenda,
  pdf = null,
  modo = "pantalla",
  aviso = null,
  detalles = null,
}: {
  r: ResultadoDelTest;
  empresa: string | null;
  dominio?: string | null;
  /** Cuándo lo terminó (ISO). */
  fecha?: string | null;
  /** La industria que eligió (el VALOR de la lista): va en el resumen sin IA y en «Diagnosticar otra área». */
  industria?: string | null;
  /** El enlace de la agenda que va incrustada (`enlaceDeLaAgenda`: el del servidor o el de la aplicación vieja). */
  agenda: string;
  /** La dirección que arma el PDF. Null = sin botón (el resultado viejo no está guardado en Nexus). */
  pdf?: string | null;
  /** `pdf`: lo que abre el navegador que imprime (en hojas, sin botones ni calendario). */
  modo?: "pantalla" | "pdf";
  /** Una línea arriba de todo (el resultado viejo dice cuándo se hizo y con qué escala se lee). */
  aviso?: string | null;
  /** Lo que se dice de cada dimensión: la tarjeta del radar y «Ver detalles» de su barra (en el PDF, qué priorizar). */
  detalles?: Record<string, DetalleDeLaDimension> | null;
}) {
  const enPdf = modo === "pdf";
  const nombreDeLaEmpresa = empresa || dominio || "";
  const rec = r.recomendacion;
  const resumen = resumenDelResultado(r, industria ? etiquetaDeIndustria(industria) : null);
  const parcial = r.preguntadas < r.total ? ` (${r.preguntadas} de ${r.total} partes)` : "";
  const otraArea = enlaceDeOtraArea({ version: r.version, industria });

  const radar = (
    <RadarDeUnaEmpresa
      area={r.areaNombre}
      dimensiones={r.dimensiones.map((d) => ({ clave: d.id, nombre: d.nombre, capa: d.capa, preguntada: d.preguntada, nivel: d.nivel, noLoSe: d.noLoSe, puntaje: d.puntaje }))}
      capas={r.capas.map((c) => ({ clave: c.clave, nombre: c.nombre, descripcion: DESCRIPCION_DE_LA_CAPA[c.clave] ?? null, nivel: c.nivel, puntaje: c.puntaje }))}
      niveles={r.niveles}
      resultado={{ nivel: r.nivel, puntaje: r.puntaje }}
      frena={rec?.tipo === "trabajar" ? { clave: rec.dimensionId, objetivo: rec.objetivo } : null}
      formato={modo}
    />
  );
  const nivelGrande = (
    <h1 className="rd-nivel" data-nivel={r.nivel ?? undefined}>
      <span className="rd-punto" aria-hidden="true" />
      {r.nivelNombre ?? "Sin determinar"}
    </h1>
  );

  if (enPdf) {
    const hojas = [
      <>
        <section className="rd-head">
          <div className="rd-head-texto">
            <p className="rd-label">Resultado general</p>
            <div className="rd-nivel-fila">
              {nivelGrande}
              <span className="rd-pill">Estimado</span>
              <span className="rd-parcial">con lo que respondiste{parcial}</span>
            </div>
            <p className="rd-resumen">{resumen}</p>
          </div>
          <Capas r={r} />
        </section>
        <div className="rd-radar">{radar}</div>
      </>,
      <>
        {rec && <PorDondeEmpezar rec={rec} />}
        {r.riesgos.length > 0 && <Riesgos riesgos={r.riesgos} />}
        {r.casos.length > 0 && <Casos casos={r.casos} />}
      </>,
      <>
        <Barras r={r} detalles={detalles} enPdf />
        {agenda && (
          <section className="rd-tarjeta rd-agenda-pdf">
            <p className="rd-eyebrow">El siguiente paso</p>
            <h2>Revisemos juntos tu resultado, sin costo</h2>
            <p>
              ¿Lo revisamos juntos? Agenda una sesión de 30 minutos, sin costo: <a href={agenda}>{agenda}</a>
            </p>
          </section>
        )}
      </>,
    ];
    return (
      <div className="dr rd-v3 rd-pdf">
        {hojas.map((contenido, i) => (
          <section key={i} className={`rd-hoja${i === 0 ? " rd-hoja-1" : ""}`}>
            <header className="rd-hoja-barra">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={LOGO_BLANCO} alt="Smarteam" height={20} />
              <span>
                {[nombreDeLaEmpresa, dominio && dominio !== nombreDeLaEmpresa ? dominio : null, `Diagnóstico de rendimiento · ${r.areaNombre}`, fecha ? fechaLarga(fecha) : null]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            </header>
            <div className="rd-hoja-cuerpo">{contenido}</div>
            <footer className="rd-hoja-pie">
              <span>Diagnóstico hecho con la Escala de Rendimiento de Smarteam.</span>
              <span className="rd-hoja-numero">{i + 1}</span>
            </footer>
          </section>
        ))}
      </div>
    );
  }

  return (
    <div className="dr rd-v3">
      <AnimacionesDelResultado className="rd">
        <header className="rd-arriba">
          <a className="rd-logo" href={otraArea} title="Hacer otro diagnóstico">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={LOGO_DE_COLOR} alt="Smarteam" height={34} />
          </a>
          <div className="rd-acciones">
            <a className="rd-btn rd-btn-ghost" href={otraArea}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M3 12a9 9 0 1 0 3-6.7" />
                <path d="M3 4v5h5" />
              </svg>
              Hacer otro test
            </a>
            {pdf && <DescargarPdfDelResultado href={pdf} />}
          </div>
        </header>

        {aviso && <p className="rd-aviso">{aviso}</p>}

        <section className="rd-cabecera">
          <div className="rd-head-arriba">
            <div className="rd-head-texto">
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
              <p className="rd-eyebrow rd-entra">Diagnóstico de rendimiento · {r.areaNombre}</p>
              {fecha && <p className="rd-fecha rd-entra">{fechaLarga(fecha)}</p>}
              <p className="rd-label rd-entra">Resultado general</p>
              <div className="rd-entra">{nivelGrande}</div>
              <p className="rd-resumen rd-entra">{resumen}</p>
              <p className="rd-estimado rd-entra">
                <span className="rd-pill">Estimado</span>
                con lo que respondiste{parcial}
              </p>
            </div>
            <div className="rd-entra">
              <Capas r={r} />
            </div>
          </div>
          <div className="rd-radar rd-entra">
            {radar}
            <p className="rd-radar-ayuda">Pasa el cursor (o toca) una parte del radar para ver por qué está en ese nivel.</p>
          </div>
        </section>

        {rec && <PorDondeEmpezar rec={rec} />}
        {r.riesgos.length > 0 && <Riesgos riesgos={r.riesgos} />}
        {r.casos.length > 0 && <Casos casos={r.casos} />}
        <Barras r={r} detalles={detalles} />

        <section className="rd-agenda" data-revela="">
          <div className="rd-agenda-texto">
            <p className="rd-eyebrow">El siguiente paso</p>
            <h2>Revisemos juntos tu resultado, sin costo</h2>
            <p>Son 30 minutos de trabajo, no una llamada de ventas. Te llevas:</p>
            <ul className="rd-agenda-vinetas">
              {vinetasDeLaSesion(r.areaNombre).map((x) => (
                <li key={x}>
                  <span className="rd-agenda-check">
                    <IconoCheck />
                  </span>
                  <span>{x}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="rd-agenda-caja">
            <CalendarioDeHubspot agenda={agenda} />
          </div>
        </section>
        <footer className="rd-pie" data-revela="">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="rd-pie-logo" src={LOGO_DE_COLOR} alt="Smarteam" height={30} />
          <div className="rd-pie-botones">
            <a className="rd-btn rd-btn-primary" href={otraArea}>
              Diagnosticar otra área
            </a>
            <a className="rd-btn rd-btn-ghost" href={ENLACE_DE_OTRA_EMPRESA}>
              Diagnosticar otra empresa
            </a>
          </div>
          <p className="rd-pie-texto">Diagnóstico hecho con la Escala de Rendimiento de Smarteam.</p>
        </footer>
        {/* Las tarjetas del radar: escondidas, una por dimensión. Fuera de las secciones que se mueven, para que su
            posición fija no dependa de una animación. */}
        <div className="rd-tips">
          {r.dimensiones.map((d) => (
            <TarjetaDeLaDimension key={d.id} d={d} det={detalles?.[d.id]} />
          ))}
        </div>
      </AnimacionesDelResultado>
    </div>
  );
}
