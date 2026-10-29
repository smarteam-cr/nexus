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
 * letra un poco más grande; el movimiento de la vieja (AnimacionesDelResultado: las secciones que aparecen al bajar, las
 * barras que se llenan con el puntaje que cuenta y el resalte del radar); «Ver detalles» en cada barra (lo que sale de
 * la escala y de lo que respondió: lib/tests-diagnostico/detalle-de-la-dimension.ts), y la agenda de HubSpot siempre
 * incrustada (la de la vieja si el servidor no trae otra).
 *
 * El PDF va en hojas horizontales (carta, 1056 × 816): la 1 con la cabecera y el radar grande, la 2 con las tres piezas
 * y la 3 con las barras y el enlace para agendar. Sin botones, sin calendario, sin puntajes en el radar, sin «Ver
 * detalles» y sin movimiento: el pulido del 29 oct no lo cambia.
 * Las salidas a la portada son enlaces comunes y no `<Link>`: al volver con «Atrás», Next revivía la página en el
 * navegador y la agenda de HubSpot quedaba en blanco; con una carga completa vuelve bien (probado el 28 oct).
 */
/* eslint-disable @next/next/no-html-link-for-pages -- las salidas a la portada recargan la página a propósito: con
   `<Link>`, al volver con «Atrás» la agenda de HubSpot quedaba en blanco (ver el encabezado). */
import type { ReactNode } from "react";
import type { DetalleDeLaDimension } from "@/lib/tests-diagnostico/detalle-de-la-dimension";
import { puntajeDeLaDimension } from "@/lib/tests-diagnostico/pagina-del-resultado";
import type { ResultadoDelTest } from "@/lib/tests-diagnostico/resultado";
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

const fechaLarga = (iso: string) =>
  new Intl.DateTimeFormat("es-CR", { day: "numeric", month: "long", year: "numeric", timeZone: "America/Costa_Rica" }).format(new Date(iso));

const IconoAlerta = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 8v5" />
    <path d="M12 17h.01" />
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

/** «Ver detalles» de una barra: lo que respondió, su nivel en la escala, lo que pide el siguiente y lo que pone en riesgo. */
function VerDetalles({ d }: { d: DetalleDeLaDimension }) {
  return (
    <details className="rd-detalles">
      <summary>Ver detalles</summary>
      <div className="rd-detalles-cuerpo">
        {d.queMide && <p className="rd-detalles-mide">{d.queMide}</p>}
        {d.respondiste && (
          <div className="rd-detalles-bloque">
            <p className="rd-detalles-k">Lo que respondiste</p>
            <p className="rd-detalles-respuesta">«{d.respondiste}»</p>
          </div>
        )}
        {d.esteNivel && (
          <div className="rd-detalles-bloque">
            <p className="rd-detalles-k">En la escala, {d.esteNivel.nombre} es</p>
            <p>{d.esteNivel.descripcion}</p>
          </div>
        )}
        {d.siguiente && (
          <div className="rd-detalles-bloque rd-detalles-falta">
            <p className="rd-detalles-k">Para llegar a {d.siguiente.nombre}</p>
            <ul className="rd-detalles-lista">
              {d.siguiente.criterios.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
          </div>
        )}
        {d.riesgos.length > 0 && (
          <div className="rd-detalles-bloque rd-detalles-riesgo">
            <p className="rd-detalles-k">Lo que hoy pone en riesgo</p>
            <ul className="rd-detalles-lista">
              {d.riesgos.map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </details>
  );
}

function Barras({ r, detalles = null }: { r: ResultadoDelTest; detalles?: Record<string, DetalleDeLaDimension> | null }) {
  const frena = r.recomendacion?.tipo === "trabajar" ? r.recomendacion.dimensionId : null;
  return (
    <Tarjeta titulo="Cómo está cada parte">
      <div className="rd-barras">
        {r.capas.map((c) => {
          const dims = r.dimensiones.filter((d) => d.capa === c.clave && d.preguntada);
          if (!dims.length) return null;
          return (
            <div key={c.clave} className="rd-grupo">
              <div className="rd-grupo-head">
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
                    {det && <VerDetalles d={det} />}
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

export default function ResultadoDelTestVista({
  r,
  nombre,
  empresa,
  dominio = null,
  fecha = null,
  agenda,
  pdf = null,
  modo = "pantalla",
  aviso = null,
  detalles = null,
}: {
  r: ResultadoDelTest;
  /** Null en un resultado reabierto de la aplicación vieja (O6): su dirección no se usa para escribir un nombre. */
  nombre: string | null;
  empresa: string | null;
  dominio?: string | null;
  /** Cuándo lo terminó (ISO). */
  fecha?: string | null;
  /** El enlace de la agenda que va incrustada (`enlaceDeLaAgenda`: el del servidor o el de la aplicación vieja). */
  agenda: string;
  /** La dirección que arma el PDF. Null = sin botón (el resultado viejo no está guardado en Nexus). */
  pdf?: string | null;
  /** `pdf`: lo que abre el navegador que imprime (en hojas, sin botones ni calendario). */
  modo?: "pantalla" | "pdf";
  /** Una línea arriba de todo (el resultado viejo dice cuándo se hizo y con qué escala se lee). */
  aviso?: string | null;
  /** «Ver detalles» de cada barra, por dimensión (solo en la página; el PDF no los lleva). */
  detalles?: Record<string, DetalleDeLaDimension> | null;
}) {
  const enPdf = modo === "pdf";
  const nombreDeLaEmpresa = empresa || dominio || "";
  const rec = r.recomendacion;
  const primerNombre = nombre?.trim().split(/\s+/)[0] ?? "";
  const saludo = `${primerNombre ? `${primerNombre}, así` : "Así"} está hoy tu área de ${r.areaNombre}, parte por parte.`;
  const parcial = r.preguntadas < r.total ? ` (${r.preguntadas} de ${r.total} partes)` : "";

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
            <p className="rd-saludo">{saludo}</p>
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
        <Barras r={r} />
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
          <a className="rd-logo" href="/external/test" title="Hacer otro diagnóstico">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={LOGO_DE_COLOR} alt="Smarteam" height={34} />
          </a>
          <div className="rd-acciones">
            <a className="rd-btn rd-btn-ghost" href="/external/test">
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
                <span className="rd-empresa">
                  <span className="rd-empresa-logo" aria-hidden="true">
                    {nombreDeLaEmpresa.trim().charAt(0).toUpperCase()}
                  </span>
                  <span className="rd-empresa-txt">
                    <b>{nombreDeLaEmpresa}</b>
                    {dominio && dominio !== nombreDeLaEmpresa && <small>{dominio}</small>}
                  </span>
                </span>
              )}
              <p className="rd-eyebrow">Diagnóstico de rendimiento · {r.areaNombre}</p>
              {fecha && <p className="rd-fecha">{fechaLarga(fecha)}</p>}
              <p className="rd-label">Resultado general</p>
              {nivelGrande}
              <p className="rd-saludo">{saludo}</p>
              <p className="rd-estimado">
                <span className="rd-pill">Estimado</span>
                con lo que respondiste{parcial}
              </p>
            </div>
            <Capas r={r} />
          </div>
          <div className="rd-radar">{radar}</div>
        </section>

        {rec && <PorDondeEmpezar rec={rec} />}
        {r.riesgos.length > 0 && <Riesgos riesgos={r.riesgos} />}
        {r.casos.length > 0 && <Casos casos={r.casos} />}
        <Barras r={r} detalles={detalles} />

        <section className="rd-agenda" data-revela="">
          <div className="rd-agenda-texto">
            <p className="rd-eyebrow">El siguiente paso</p>
            <h2>Revisemos juntos tu resultado, sin costo</h2>
            <p>En 30 minutos lo leemos contigo y armamos el primer paso. Te llevas el plan aunque no trabajemos juntos.</p>
          </div>
          <div className="rd-agenda-caja">
            <CalendarioDeHubspot agenda={agenda} />
          </div>
        </section>
        <div className="rd-pie">
          <a className="rd-btn rd-btn-ghost" href="/external/test">
            Diagnosticar otra área
          </a>
          <p className="rd-pie-texto">Diagnóstico hecho con la Escala de Rendimiento de Smarteam.</p>
        </div>
      </AnimacionesDelResultado>
    </div>
  );
}
