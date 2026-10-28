"use client";

/**
 * components/external/test/InicioDelTest.tsx — LA PORTADA del test público (Elías, 28 oct: igual a la aplicación vieja).
 *
 * El título con su subrayado y «N preguntas · N minutos»; a la izquierda las tres tarjetas que explican el diagnóstico y a
 * la derecha «Dinos quién eres y arrancamos»: nombre, apellido, correo de trabajo, dominio, teléfono con su país, puesto,
 * industria (con buscador) y el área, en una sola pantalla y con un solo botón. Al pie, las preguntas frecuentes. Solo
 * pinta: el estado y el envío los lleva TestDelDiagnostico. Página del cliente: las clases de diagnostico.css.
 */
import type { FormEvent } from "react";
import { PAISES, PUESTOS, type CampoDelFormulario, type ErroresDelFormulario, type ValoresDelFormulario } from "@/lib/tests-diagnostico/formulario";
import ComboConBuscador from "./ComboConBuscador";

/** Las tres áreas, en el orden y con las palabras de la aplicación vieja. */
export const AREAS_DE_LA_PORTADA: readonly { slug: string; nombre: string; resumen: string }[] = [
  { slug: "marketing", nombre: "Marketing", resumen: "Cómo opera por dentro y qué produce hacia el mercado." },
  { slug: "ventas", nombre: "Ventas", resumen: "Cómo opera por dentro y qué produce en pipeline y cierre." },
  { slug: "servicio", nombre: "Servicio", resumen: "Cómo opera por dentro y qué entrega hacia el cliente." },
];

const ICONO_DIANA = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <circle cx="12" cy="12" r="9" />
    <circle cx="12" cy="12" r="4.5" />
    <circle cx="12" cy="12" r="0.6" fill="currentColor" stroke="none" />
  </svg>
);
const ICONO_RELOJ = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7.5V12l3 1.8" />
  </svg>
);
const ICONO_IA = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="3.5" y="5" width="17" height="12" rx="2.5" />
    <path d="M8 21l4-3.8 4 3.8" />
    <circle cx="9.5" cy="11" r="1.15" fill="currentColor" stroke="none" />
    <circle cx="14.5" cy="11" r="1.15" fill="currentColor" stroke="none" />
  </svg>
);
const ICONO_LUPA = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" aria-hidden="true">
    <circle cx="11" cy="11" r="7" />
    <path d="M21 21l-4.3-4.3" />
  </svg>
);

const BENEFICIOS = [
  { icono: ICONO_IA, titulo: "Diagnóstico con IA", texto: "Ubica a tu área en una escala de 5 niveles según lo que realmente produce, no según las herramientas que tenga contratadas." },
  { icono: ICONO_LUPA, titulo: "El cuello de botella", texto: "Detecta la pieza más débil que, sin que lo notes, está frenando a todo el equipo y limitando su rendimiento." },
  { icono: ICONO_DIANA, titulo: "Plan de acción", texto: "Te llevas pasos concretos y priorizados para ejecutar este mes, empezando por lo que más mueve la aguja." },
];

function preguntasFrecuentes(total: number, minutos: number) {
  return [
    {
      q: "¿Qué mide exactamente el diagnóstico?",
      a: "El nivel de rendimiento operativo real de tu área (marketing, ventas o servicio), en una escala de 5 niveles y en dos capas: la base operativa (cómo estás montado por dentro) y la producción (qué entregas hacia afuera). Medimos lo que produces, no las herramientas que tengas contratadas.",
    },
    { q: "¿Cuánto tiempo toma?", a: `${minutos === 1 ? "Un minuto" : `Unos ${minutos} minutos`}. Son ${total} preguntas sobre cómo funciona hoy tu equipo.` },
    {
      q: "¿Cómo funcionan las preguntas y qué hace la IA?",
      a: "En cada pregunta eliges la opción que mejor describe cómo opera tu área hoy (o «No lo sé»). Con eso se calcula tu nivel; la inteligencia artificial redacta el diagnóstico y las recomendaciones. La IA nunca decide tu nivel: lo determinan tus respuestas.",
    },
    { q: "¿Mis respuestas son privadas?", a: "Sí. No se publican en ningún lado: el resultado vive en un enlace privado que solo tú decides compartir." },
    { q: "¿Puedo diagnosticar más de un departamento?", a: "Sí. Al terminar puedes volver y diagnosticar otro departamento." },
    {
      q: "¿Por qué piden un correo de empresa?",
      a: "Es una herramienta para empresas: usamos tu correo, dominio e industria para personalizar el diagnóstico. Por eso no aceptamos correos personales (Gmail, Hotmail, etc.).",
    },
    { q: "¿Qué obtengo al final?", a: "Tu nivel actual, el cuello de botella que está frenando a tu equipo y los pasos concretos para subir al siguiente peldaño." },
  ];
}

/** El racimo de triángulos azules de la derecha (la lámina de marca). */
function Triangulos() {
  return (
    <div className="hero-deco" aria-hidden="true">
      <svg viewBox="0 0 460 520" fill="none" xmlns="http://www.w3.org/2000/svg">
        <g stroke="#1E8FF6" strokeWidth="1.6" strokeLinejoin="round">
          <polygon points="175,150 300,108 248,238" opacity=".75" />
          <polygon points="300,108 402,140 360,58" opacity=".5" />
          <polygon points="248,238 360,218 302,322" opacity=".6" />
          <polygon points="402,140 444,120 424,182" opacity=".45" />
          <polygon points="118,120 178,150 98,202" opacity=".5" />
          <polygon points="360,218 452,250 430,322" opacity=".35" />
          <polygon points="302,322 382,342 332,412" opacity=".45" />
          <polygon points="418,58 446,48 436,92" opacity=".3" />
          <polygon points="150,300 222,280 200,362" opacity=".4" />
          <polygon points="60,242 120,222 92,302" opacity=".3" />
          <polygon points="382,342 452,362 422,432" opacity=".3" />
          <polygon points="200,362 302,322 262,430" opacity=".35" />
        </g>
      </svg>
    </div>
  );
}

export default function InicioDelTest({
  total,
  valores,
  alCambiar,
  errores,
  industrias,
  ocupado,
  error,
  alEnviar,
  abiertas,
}: {
  total: number;
  /** Los slugs de las áreas con preguntas aprobadas para esta versión: las demás se ven apagadas y no se eligen. */
  abiertas: readonly string[];
  valores: ValoresDelFormulario;
  alCambiar: (campo: CampoDelFormulario, valor: string) => void;
  errores: ErroresDelFormulario;
  /** Las etiquetas de la lista de industrias de Smarteam (con «Otra» al final). */
  industrias: readonly string[];
  ocupado: boolean;
  error: string | null;
  alEnviar: (e: FormEvent<HTMLFormElement>) => void;
}) {
  const minutos = Math.max(1, Math.round(total / 4));
  const campo = (id: "nombre" | "apellido" | "email" | "dominio", etiqueta: string, tipo = "text", placeholder = "", auto?: string) => (
    <div className="form-campo" data-campo={id}>
      <label className="field-lbl" htmlFor={`f-${id}`}>
        {etiqueta}
        <span className="req" aria-hidden="true">*</span>
      </label>
      <input
        id={`f-${id}`}
        className={`composer-input${errores[id] ? " is-invalid" : ""}`}
        type={tipo}
        value={valores[id]}
        onChange={(e) => alCambiar(id, e.target.value)}
        placeholder={placeholder}
        autoComplete={auto}
        maxLength={id === "email" ? 200 : 120}
        aria-invalid={!!errores[id] || undefined}
      />
      {errores[id] && <p className="field-err">{errores[id]}</p>}
    </div>
  );
  const combo = (id: "puesto" | "industria", etiqueta: string, opciones: readonly string[], placeholder: string) => (
    <div className="form-campo" data-campo={id}>
      <label className="field-lbl" htmlFor={`f-${id}`}>
        {etiqueta}
        <span className="req" aria-hidden="true">*</span>
      </label>
      <ComboConBuscador
        id={`f-${id}`}
        opciones={opciones}
        valor={valores[id]}
        alCambiar={(v) => alCambiar(id, v)}
        alEscribir={() => errores[id] && alCambiar(id, valores[id])}
        placeholder={placeholder}
        invalido={!!errores[id]}
      />
      {errores[id] && <p className="field-err">{errores[id]}</p>}
    </div>
  );

  return (
    <>
      <Triangulos />
      <div className="inicio-wrap">
        <header className="intro-head">
          <p className="eyebrow">Diagnóstico de Rendimiento</p>
          <h1>
            Descubre el nivel de rendimiento <br className="br-lg" />
            de tu departamento
          </h1>
          <svg className="hero-underline" viewBox="0 0 300 16" fill="none" aria-hidden="true">
            <path d="M5 11 C 70 3 200 3 295 9" stroke="#E8481C" strokeWidth="4.5" strokeLinecap="round" />
          </svg>
          <div className="hero-meta">
            <span className="hero-meta-item">
              {ICONO_DIANA} {total} preguntas
            </span>
            <span className="hero-meta-item">
              {ICONO_RELOJ} {minutos} {minutos === 1 ? "minuto" : "minutos"}
            </span>
          </div>
        </header>
        <div className="inicio-grid">
          <aside className="inicio-beneficios">
            {BENEFICIOS.map((b) => (
              <div key={b.titulo} className="beneficio-card">
                <span className="beneficio-icon">{b.icono}</span>
                <div>
                  <p className="beneficio-titulo">{b.titulo}</p>
                  <p className="beneficio-texto">{b.texto}</p>
                </div>
              </div>
            ))}
          </aside>
          <div className="panel inicio-form">
            <p className="inicio-form-intro">
              Dinos quién eres y <span className="hl">arrancamos</span>
            </p>
            {/* `data-hs-do-not-collect`: con el seguimiento de HubSpot prendido, su «recoger formularios que no son de
                HubSpot» mandaría este formulario por su cuenta, con el correo personal que la revisión todavía no rechazó. */}
            <form onSubmit={alEnviar} noValidate data-hs-do-not-collect="true">
              <div className="form-grid">
                {campo("nombre", "Nombre", "text", "", "given-name")}
                {campo("apellido", "Apellido", "text", "", "family-name")}
                {campo("email", "Correo de trabajo", "email", "tu@empresa.com", "email")}
                {campo("dominio", "Dominio de tu empresa", "text", "empresa.com")}
                <div className="form-campo form-campo-full" data-campo="telefono">
                  <label className="field-lbl" htmlFor="f-telefono">
                    Teléfono<span className="req" aria-hidden="true">*</span>
                  </label>
                  <div className="tel-row">
                    <ComboConBuscador
                      id="f-pais"
                      className="tel-code"
                      opciones={PAISES.map((p) => p.etiqueta)}
                      valor={valores.pais}
                      alCambiar={(v) => alCambiar("pais", v)}
                      placeholder="País…"
                      etiquetaAccesible="Código de país"
                    />
                    <input
                      id="f-telefono"
                      className={`composer-input tel-num${errores.telefono ? " is-invalid" : ""}`}
                      type="tel"
                      inputMode="tel"
                      autoComplete="tel-national"
                      placeholder="8888 8888"
                      maxLength={30}
                      value={valores.telefono}
                      onChange={(e) => alCambiar("telefono", e.target.value)}
                      aria-invalid={!!errores.telefono || undefined}
                    />
                  </div>
                  {errores.telefono && <p className="field-err">{errores.telefono}</p>}
                </div>
                {combo("puesto", "Puesto", PUESTOS, "Busca o elige tu puesto…")}
                {combo("industria", "Industria", industrias, "Busca o escribe tu industria…")}
              </div>
              <div className="form-campo form-campo-full campo-area" data-campo="area">
                <span className="field-lbl" id="lbl-area">
                  Elige el área a diagnosticar<span className="req" aria-hidden="true">*</span>
                </span>
                <div className="area-grid" role="radiogroup" aria-labelledby="lbl-area">
                  {AREAS_DE_LA_PORTADA.map((a) => {
                    const activa = valores.area === a.slug;
                    const abierta = abiertas.includes(a.slug);
                    return (
                      <button
                        key={a.slug}
                        type="button"
                        role="radio"
                        aria-checked={activa}
                        disabled={!abierta}
                        className={`area-card${activa ? " is-active" : ""}`}
                        onClick={() => alCambiar("area", a.slug)}
                      >
                        <span className="area-check" aria-hidden="true" />
                        <span className="area-name">{a.nombre}</span>
                        <span className="area-desc">{abierta ? a.resumen : "Todavía no está abierto."}</span>
                      </button>
                    );
                  })}
                </div>
                {errores.area && <p className="field-err">{errores.area}</p>}
              </div>
              {/* El campo trampa: una persona no lo ve ni lo alcanza con el teclado. */}
              <div className="trampa" aria-hidden="true">
                <label htmlFor="f-sitio">No llenes este campo</label>
                <input id="f-sitio" name="sitio" tabIndex={-1} autoComplete="off" />
              </div>
              {error && <p className="form-err">{error}</p>}
              <div className="intro-cta">
                <button type="submit" className="btn btn-primary btn-lg" disabled={ocupado}>
                  {ocupado ? "Un momento…" : "Comenzar diagnóstico →"}
                </button>
              </div>
            </form>
            <p className="inicio-form-nota">Usamos estos datos para personalizar tu diagnóstico a tu empresa, tu industria y tu rol.</p>
          </div>
        </div>
        <section className="inicio-faq">
          <h2>Preguntas frecuentes</h2>
          <div className="faq-list">
            {preguntasFrecuentes(total, minutos).map((f) => (
              <details key={f.q} className="faq-item">
                <summary>{f.q}</summary>
                <p>{f.a}</p>
              </details>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}
