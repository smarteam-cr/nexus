/**
 * components/external/test/ResultadoDelTestVista.tsx — LA PÁGINA DE RESULTADOS del test del diagnóstico (área O,
 * 2026-10-26). Server component: el radar y las barras son SVG y CSS estáticos, así que la misma vista sirve para el PDF
 * (`modo="pdf"`, lib/print/pdf-runner.ts). Tema claro con hex literal, en tuteo.
 *
 * Se ve como el resultado de la aplicación vieja (Elías, 28 oct; el aspecto vive en resultado.css): los botones arriba,
 * la cabecera celeste con el nivel en grande, las barras con su puntaje sobre 100 y el calendario de HubSpot para agendar.
 * Cambios a propósito contra la vieja:
 *   · arriba de todo va el RADAR de la empresa, junto al nivel (reemplaza la curva de niveles, que ya no está);
 *   · el foco son las tres piezas de Nexus: «Por dónde empezar» (UNA recomendación, su razón y lo que cuesta quedarse),
 *     «Lo que hoy pone en riesgo a tu área» y «Lo que lo mueve» (sin precio);
 *   · las barras van después y compactas: nombre, barra, puntaje y nivel en una línea, sin la explicación de cada una;
 *   · los mensajes son los de la vieja, más cortos. El nivel va marcado como ESTIMADO: lo dijo quien respondió.
 * En el PDF no van los botones ni el calendario (se deja el enlace para agendar). Las salidas a la portada son enlaces
 * comunes y no `<Link>`: al volver con «Atrás», Next revivía la página en el navegador y la agenda de HubSpot quedaba en
 * blanco; con una carga completa vuelve bien (probado el 28 oct).
 */
/* eslint-disable @next/next/no-html-link-for-pages -- las salidas a la portada recargan la página a propósito: con
   `<Link>`, al volver con «Atrás» la agenda de HubSpot quedaba en blanco (ver el encabezado). */
import { puntajeDeLaDimension } from "@/lib/tests-diagnostico/pagina-del-resultado";
import type { ResultadoDelTest } from "@/lib/tests-diagnostico/resultado";
import CalendarioDeHubspot from "./CalendarioDeHubspot";
import DescargarPdfDelResultado from "./DescargarPdfDelResultado";
import RadarDelResultado from "./RadarDelResultado";
import "./diagnostico.css";
import "./resultado.css";

const LOGO = "/logo-smarteam-blanco.png";
const DESCRIPCION_DE_LA_CAPA: Record<string, string> = {
  base: "cómo está montado el departamento por dentro",
  produccion: "qué entrega el departamento hacia afuera",
};

const fechaLarga = (iso: string) =>
  new Intl.DateTimeFormat("es-CR", { day: "numeric", month: "long", year: "numeric", timeZone: "America/Costa_Rica" }).format(new Date(iso));

function Barras({ r }: { r: ResultadoDelTest }) {
  const frena = r.recomendacion?.tipo === "trabajar" ? r.recomendacion.dimensionId : null;
  return (
    <div className="rd-barras">
      {r.capas.map((c) => {
        const dims = r.dimensiones.filter((d) => d.capa === c.clave && d.preguntada);
        if (!dims.length) return null;
        return (
          <div key={c.clave}>
            <div className="rd-grupo-head">
              <h3>{c.nombre}</h3>
              {DESCRIPCION_DE_LA_CAPA[c.clave] && <span>{DESCRIPCION_DE_LA_CAPA[c.clave]}</span>}
            </div>
            {dims.map((d) => {
              const p = puntajeDeLaDimension(d.nivel, d.puntaje);
              return (
                <div key={d.id} className="rd-fila" data-nivel={d.nivel ?? undefined}>
                  <span className="rd-fila-nombre">
                    {d.nombre}
                    {d.id === frena && <span className="rd-frena">LO QUE MÁS FRENA</span>}
                  </span>
                  <span className="rd-barra" aria-hidden="true">
                    <span className="rd-barra-fill" style={{ width: `${Math.max(3, p)}%` }} />
                  </span>
                  <span className="rd-num">
                    {p}
                    <small>/100</small>
                  </span>
                  <span className="rd-chip">{d.noLoSe ? "No lo sabías" : (d.nivelNombre ?? "Sin ubicar")}</span>
                </div>
              );
            })}
          </div>
        );
      })}
      {r.preguntadas < r.total && (
        <p className="rd-nota">
          Este test mira {r.preguntadas} de las {r.total} partes del área; las otras las vemos juntos en la sesión.
        </p>
      )}
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
  sinCorreo = false,
  pdf = null,
  modo = "pantalla",
  aviso = null,
}: {
  r: ResultadoDelTest;
  /** Null en un resultado reabierto de la aplicación vieja (O6): su dirección no se usa para escribir un nombre. */
  nombre: string | null;
  empresa: string | null;
  dominio?: string | null;
  /** Cuándo lo terminó (ISO). */
  fecha?: string | null;
  /** El enlace para agendar la sesión (`TESTS_ENLACE_DE_AGENDA`); sin él, se le dice que le escribimos. */
  agenda: string | null;
  /**
   * Un resultado reabierto de la app vieja (O6): Nexus no tiene el correo de quien lo mira, así que sin agenda no se le
   * promete escribirle; se le ofrece hacer el test de nuevo.
   */
  sinCorreo?: boolean;
  /** La dirección que arma el PDF. Null = sin botón (el resultado viejo no está guardado en Nexus). */
  pdf?: string | null;
  /** `pdf`: lo que abre el navegador que imprime (sin botones ni calendario). */
  modo?: "pantalla" | "pdf";
  /** Una línea arriba de todo (el resultado viejo dice cuándo se hizo y con qué escala se lee). */
  aviso?: string | null;
}) {
  const enPdf = modo === "pdf";
  const nombreDeLaEmpresa = empresa || dominio || "";
  const rec = r.recomendacion;
  const primerNombre = nombre?.trim().split(/\s+/)[0] ?? "";

  return (
    <div className={`dr dr-pasos${enPdf ? " rd-pdf" : ""}`}>
      <header className="topbar">
        {enPdf ? (
          // eslint-disable-next-line @next/next/no-img-element
          <span className="brand"><img src={LOGO} alt="Smarteam" height={28} /></span>
        ) : (
          <a className="brand" href="/external/test" title="Hacer otro diagnóstico">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={LOGO} alt="Smarteam" height={28} />
          </a>
        )}
      </header>
      <main className="rd">
        {!enPdf && (
          <div className="rd-acciones">
            <a className="btn btn-ghost" href="/external/test">
              ↻ Hacer otro test
            </a>
            {pdf && <DescargarPdfDelResultado href={pdf} />}
          </div>
        )}

        {aviso && <p className="rd-nota">{aviso}</p>}

        <section className="rd-head">
          <div className="rd-head-texto">
            {nombreDeLaEmpresa && (
              <span className="rd-empresa">
                <span className="rd-empresa-logo" aria-hidden="true">{nombreDeLaEmpresa.trim().charAt(0).toUpperCase()}</span>
                <span className="rd-empresa-txt">
                  <b>{nombreDeLaEmpresa}</b>
                  {dominio && dominio !== nombreDeLaEmpresa && <small>{dominio}</small>}
                </span>
              </span>
            )}
            <p className="rd-eyebrow">Diagnóstico de rendimiento · {r.areaNombre}</p>
            {fecha && <p className="rd-fecha">{fechaLarga(fecha)}</p>}
            <p className="rd-label">Resultado general</p>
            <h1 className="rd-nivel" data-nivel={r.nivel ?? undefined}>
              {r.nivelNombre ?? "Sin determinar"}
            </h1>
            <p className="rd-saludo">
              {primerNombre ? `${primerNombre}, así` : "Así"} está hoy tu área de {r.areaNombre}, parte por parte.
            </p>
            <p className="rd-estimado">
              <span className="rd-pill">Estimado</span>
              con lo que respondiste{r.preguntadas < r.total ? ` (${r.preguntadas} de ${r.total} partes)` : ""}
            </p>
            <div className="rd-capas">
              {r.capas.map((c) => (
                <div key={c.clave} className="rd-capa" data-nivel={c.nivel ?? undefined}>
                  <p className="rd-capa-k">{c.nombre}</p>
                  <p className="rd-capa-v">
                    {c.nivelNombre ?? (r.dimensiones.some((d) => d.capa === c.clave && d.preguntada) ? "Sin ubicar" : "No se midió")}
                  </p>
                </div>
              ))}
            </div>
          </div>
          <div className="rd-head-radar">
            <RadarDelResultado r={r} />
          </div>
        </section>

        {rec && (
          <section className="rd-panel rd-empezar">
            <p className="rd-panel-titulo">Por dónde empezar</p>
            {rec.tipo === "trabajar" ? (
              <>
                <h2>
                  Llevar {rec.dimensionNombre.toLowerCase()} a {rec.objetivoNombre}
                </h2>
                <p>{rec.razon}</p>
                {rec.costoDeQuedarse && (
                  <p className="rd-costo">
                    <b>Lo que cuesta quedarse así: </b>
                    {rec.costoDeQuedarse}
                  </p>
                )}
              </>
            ) : (
              <p>{rec.razon}</p>
            )}
          </section>
        )}

        {r.riesgos.length > 0 && (
          <section className="rd-panel">
            <p className="rd-panel-titulo">Lo que hoy pone en riesgo a tu área</p>
            <ul className="rd-riesgos">
              {r.riesgos.map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ul>
          </section>
        )}

        {r.casos.length > 0 && (
          <section className="rd-panel">
            <p className="rd-panel-titulo">Lo que lo mueve</p>
            <div className="rd-casos">
              {r.casos.map((c) => (
                <div key={c.id} className="rd-caso">
                  <p className="rd-caso-titulo">{c.titulo}</p>
                  <p className="rd-caso-promesa">{c.promesa}</p>
                  {c.razon && <p className="rd-caso-razon">{c.razon}</p>}
                </div>
              ))}
            </div>
          </section>
        )}

        <section className="rd-panel">
          <p className="rd-panel-titulo">Cómo está cada parte</p>
          <Barras r={r} />
        </section>

        {enPdf ? (
          agenda && (
            <p className="rd-pie-texto">
              ¿Lo revisamos juntos? Agenda una sesión de 30 minutos, sin costo: <a href={agenda}>{agenda}</a>
            </p>
          )
        ) : (
          <>
            <section className="rd-agenda">
              <p className="rd-eyebrow">El siguiente paso</p>
              <h2>Revisemos juntos tu resultado, sin costo</h2>
              <p>En 30 minutos lo leemos contigo y armamos el primer paso. Te llevas el plan aunque no trabajemos juntos.</p>
              {agenda ? (
                <CalendarioDeHubspot agenda={agenda} />
              ) : sinCorreo ? (
                <p className="rd-agenda-aviso">
                  Para coordinarla, <a href="/external/test">haz el test de nuevo</a> y te escribimos al correo que dejes.
                </p>
              ) : (
                <p className="rd-agenda-aviso">Te escribimos al correo que dejaste para coordinarla.</p>
              )}
            </section>
            <div className="rd-pie">
              <a className="btn btn-ghost" href="/external/test">
                Diagnosticar otra área
              </a>
            </div>
          </>
        )}
        <p className="rd-pie-texto">Diagnóstico hecho con la Escala de Rendimiento de Smarteam.</p>
      </main>
    </div>
  );
}
