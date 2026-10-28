"use client";

/**
 * components/external/test/TestDelDiagnostico.tsx — EL TEST PÚBLICO del diagnóstico de rendimiento, del lado del
 * prospecto (área O, 2026-10-26). Página del cliente (§1-WEB de ARCHITECTURE.md): tema claro con hex literal, tuteo.
 *
 * Se ve como la aplicación vieja (Elías, 28 oct): la portada navy con las tres tarjetas y «Dinos quién eres y
 * arrancamos» (InicioDelTest) y después una pregunta por pantalla con la barra de avance (PasoDelTest); el aspecto vive en
 * diagnostico.css. La INDUSTRIA es un campo más de ese formulario: el servidor elige con ella el banco de su edición al
 * empezar (servicio-server.ts › empezarTest), así que ya no hace falta un paso antes. El ÁREA también se elige ahí; la
 * dirección del área (`/external/test/ventas`) solo la deja marcada.
 *
 * Lo demás sigue igual: el avance se guarda en cada paso (si cierra la pestaña, al volver retoma donde quedó: el token
 * vive en este navegador; por eso no hay aviso del navegador al irse), y quien responde nunca ve niveles ni
 * ids del banco: las opciones traen ids que solo sirven para este intento. El token se guarda por área y versión: dos
 * tests a medio hacer no se pisan. La visita se cuenta UNA vez por pestaña: al abrir, si la dirección ya trae el área; si
 * no, con la primera que elige (tocar las otras tarjetas para leerlas no suma visitas).
 */
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { valorDeLaIndustria } from "@/lib/tests-diagnostico/direccion-publica";
import {
  erroresDelFormulario,
  limpiarDominio,
  opcionExacta,
  USOS_DE_CRM,
  telefonoE164,
  VALORES_VACIOS,
  type CampoDelFormulario,
  type ErroresDelFormulario,
  type ValoresDelFormulario,
} from "@/lib/tests-diagnostico/formulario";
import InicioDelTest, { AREAS_DE_LA_PORTADA } from "./InicioDelTest";
import PasoDelTest, { type PreguntaEnPantalla } from "./PasoDelTest";
import "./diagnostico.css";

interface Vista {
  token: string;
  /** El id del área en la escala («1»). */
  area: string;
  estado: "en_curso" | "terminado" | "abandonado";
  paso: number;
  preguntas: PreguntaEnPantalla[];
  respuestas: Record<string, { opcion: string; matiz?: string }>;
}

const SLUG_DEL_AREA: Record<string, string> = { "1": "ventas", "2": "marketing", "3": "servicio" };
const SLUGS = AREAS_DE_LA_PORTADA.map((a) => a.slug);

function leerCookie(nombre: string): string | null {
  const m = document.cookie.match(new RegExp(`(?:^|; )${nombre}=([^;]*)`));
  return m ? decodeURIComponent(m[1]) : null;
}

export default function TestDelDiagnostico({
  areaInicial,
  version,
  total,
  industriaInicial,
  industrias,
  logo,
  abiertas,
  conversionGoogleAds = null,
}: {
  /** El slug del área que trae la dirección (queda marcada en el formulario), o null. */
  areaInicial: string | null;
  version: "marketing" | "web";
  /** Cuántas preguntas tiene esta versión (8 la web, 4 la de Marketing). */
  total: number;
  /** El VALOR de la industria que trae la dirección, si es de la lista. */
  industriaInicial: string | null;
  /** La lista de Smarteam, con «Otra» al final: lo que se ve (etiqueta) y lo que se guarda (valor). */
  industrias: readonly { valor: string; etiqueta: string }[];
  logo: string;
  /** Los slugs de las áreas con preguntas aprobadas para esta versión (las otras se ven apagadas). */
  abiertas: readonly string[];
  /** La conversión de Google Ads que se dispara al empezar (como la página vieja). Null = no hay etiqueta. */
  conversionGoogleAds?: string | null;
}) {
  /** Dónde vive el token de este navegador: uno por área y versión. */
  const claveDe = useCallback((area: string) => `nexus:test-diagnostico:${area}:${version}`, [version]);
  const etiquetas = useMemo(() => industrias.map((i) => i.etiqueta), [industrias]);
  const [valores, setValores] = useState<ValoresDelFormulario>(() => ({
    ...VALORES_VACIOS,
    area: areaInicial ?? "",
    industria: industrias.find((i) => i.valor === industriaInicial)?.etiqueta ?? "",
  }));
  const [errores, setErrores] = useState<ErroresDelFormulario>({});
  const [vista, setVista] = useState<Vista | null>(null);
  const [indice, setIndice] = useState(0);
  const [direccion, setDireccion] = useState<"adelante" | "atras">("adelante");
  const [respuestas, setRespuestas] = useState<Vista["respuestas"]>({});
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const enviado = useRef(false);

  // Retomar donde quedó: el token de este navegador, si el intento sigue sin terminar. Con el área en la dirección, solo el
  // de esa área; en la entrada, el primero que siga abierto.
  useEffect(() => {
    const areas = areaInicial ? [areaInicial] : SLUGS;
    const tokens = areas.flatMap((a) => {
      try {
        const t = window.localStorage.getItem(claveDe(a));
        return t ? [t] : [];
      } catch {
        return [];
      }
    });
    if (!tokens.length) return;
    let vivo = true;
    void (async () => {
      for (const token of tokens) {
        const v = await fetch(`/api/external/test/${encodeURIComponent(token)}`)
          .then((r) => (r.ok ? (r.json() as Promise<Vista>) : null))
          .catch(() => null);
        if (!vivo) return;
        if (!v || v.estado === "terminado") continue;
        setVista(v);
        setRespuestas(v.respuestas);
        setIndice(Math.min(v.paso, Math.max(0, v.preguntas.length - 1)));
        return;
      }
    })();
    return () => {
      vivo = false;
    };
  }, [claveDe, areaInicial]);

  // Contar la visita (O6 etapa 3), UNA vez por pestaña: para medir cuántos de los que abren el test lo terminan.
  const contarVisita = useCallback(
    (area: string) => {
      const marca = `nexus:test-diagnostico:${version}:visita`;
      try {
        if (window.sessionStorage.getItem(marca)) return;
        window.sessionStorage.setItem(marca, "1");
      } catch {
        // Sin almacenamiento (modo privado estricto): se cuenta igual; el servidor no deja que una recarga sume dos.
      }
      void fetch("/api/external/test/visita", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ area, version }),
        keepalive: true,
      }).catch(() => undefined);
    },
    [version],
  );
  useEffect(() => {
    if (areaInicial) contarVisita(areaInicial);
  }, [areaInicial, contarVisita]);

  // Sin aviso del navegador al irse (Elías, 28 oct): salía también al terminar, justo al pasar al resultado («¿Deseas
  // abandonar el sitio?»), y no protegía nada: el avance se guarda en cada pregunta y, al volver, retoma donde quedó.

  const cambiar = (campo: CampoDelFormulario, valor: string) => {
    setValores((v) => ({ ...v, [campo]: valor }));
    // Al corregir un campo, su mensaje se va (el del teléfono también al cambiar el país).
    setErrores((e) => ({ ...e, [campo === "pais" ? "telefono" : campo]: undefined }));
    if (campo === "area" && SLUGS.includes(valor)) contarVisita(valor);
  };

  const empezar = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    const errs = erroresDelFormulario(valores, etiquetas, abiertas);
    setErrores(errs);
    const primero = Object.keys(errs)[0];
    if (primero) {
      const campo = document.querySelector<HTMLElement>(`[data-campo="${primero}"]`);
      campo?.scrollIntoView({ block: "center", behavior: "smooth" });
      campo?.querySelector<HTMLElement>("input, button")?.focus({ preventScroll: true });
      return;
    }
    const f = new FormData(e.currentTarget);
    const origen: Record<string, string> = {};
    const params = new URLSearchParams(window.location.search);
    for (const [k, v] of params) if (k.startsWith("utm_") || k === "gclid" || k === "fbclid") origen[k] = v.slice(0, 300);
    if (document.referrer) origen.referrer = document.referrer.slice(0, 300);
    const hutk = leerCookie("hubspotutk");
    if (hutk) origen.hutk = hutk.slice(0, 300);
    origen.pagina = window.location.href.split("#")[0].slice(0, 300);
    const etiqueta = opcionExacta(etiquetas, valores.industria);
    const cuerpo = {
      area: valores.area,
      version,
      nombre: valores.nombre.trim(),
      apellido: valores.apellido.trim(),
      email: valores.email.trim(),
      telefono: telefonoE164(valores.pais, valores.telefono),
      usoDeCrm: opcionExacta(USOS_DE_CRM, valores.crm) ?? "",
      dominio: limpiarDominio(valores.dominio),
      industria: etiqueta ? valorDeLaIndustria(etiqueta) : "",
      sitio: String(f.get("sitio") ?? ""),
      origen,
    };
    setOcupado(true);
    try {
      const r = await fetch("/api/external/test", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(cuerpo) });
      const j = (await r.json().catch(() => null)) as (Vista & { error?: string }) | null;
      if (!r.ok || !j?.token) {
        setError(j?.error ?? "No se pudo empezar el test. Vuelve a intentarlo.");
        return;
      }
      try {
        window.localStorage.setItem(claveDe(valores.area), j.token);
      } catch {
        // Sin almacenamiento (navegación privada): el test funciona igual, solo que no se retoma.
      }
      // La conversión de Google Ads: el lead se gana aquí, cuando deja sus datos (igual que la página vieja).
      const gtag = (window as { gtag?: (...a: unknown[]) => void }).gtag;
      if (conversionGoogleAds && typeof gtag === "function") {
        try {
          gtag("event", "conversion", { send_to: conversionGoogleAds });
        } catch {
          // El seguimiento nunca rompe el test.
        }
      }
      setVista(j);
      setRespuestas({});
      setIndice(0);
      setDireccion("adelante");
      window.scrollTo({ top: 0 });
    } catch {
      setError("No hay conexión. Revisa tu internet y vuelve a intentarlo.");
    } finally {
      setOcupado(false);
    }
  };

  const pregunta = vista?.preguntas[indice] ?? null;
  const elegida = pregunta ? respuestas[pregunta.id]?.opcion : undefined;
  const esLaUltima = !!vista && indice === vista.preguntas.length - 1;

  /** Solo las respuestas con una opción elegida (un matiz sin opción no se manda). */
  const paraMandar = useMemo(() => Object.fromEntries(Object.entries(respuestas).filter(([, r]) => r.opcion)), [respuestas]);

  const guardar = useCallback(
    async (paso: number) => {
      if (!vista) return true;
      const r = await fetch(`/api/external/test/${encodeURIComponent(vista.token)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ respuestas: paraMandar, paso }),
      }).catch(() => null);
      return !!r?.ok;
    },
    [vista, paraMandar],
  );

  const irA = (i: number, hacia: "adelante" | "atras") => {
    setDireccion(hacia);
    setIndice(i);
    setError(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const siguiente = async () => {
    if (!vista || !elegida || enviado.current) return;
    setError(null);
    setOcupado(true);
    try {
      if (!esLaUltima) {
        // Guardar al avanzar: si se corta la conexión, igual se sigue (se guarda en el próximo paso).
        await guardar(indice + 1);
        irA(indice + 1, "adelante");
        return;
      }
      enviado.current = true;
      const r = await fetch(`/api/external/test/${encodeURIComponent(vista.token)}/terminar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ respuestas: paraMandar }),
      }).catch(() => null);
      const j = (await r?.json().catch(() => null)) as { url?: string; error?: string } | null;
      if (!r?.ok || !j?.url) {
        enviado.current = false;
        setError(j?.error ?? "No se pudo calcular tu resultado. Vuelve a intentarlo.");
        return;
      }
      try {
        window.localStorage.removeItem(claveDe(SLUG_DEL_AREA[vista.area]));
      } catch {
        // nada
      }
      setVista({ ...vista, estado: "terminado" });
      window.location.assign(j.url);
    } finally {
      setOcupado(false);
    }
  };

  /**
   * «Volver a iniciar» (y el logo): deja el intento (queda sin terminar) y vuelve a la portada con los datos ya escritos.
   * Con algo respondido, pregunta antes: un clic sin querer en el logo borraba el avance.
   */
  const reiniciar = () => {
    if (Object.values(respuestas).some((r) => r.opcion) && !window.confirm("¿Volver a empezar? Se pierden las respuestas que ya diste.")) return;
    try {
      if (vista) window.localStorage.removeItem(claveDe(SLUG_DEL_AREA[vista.area]));
    } catch {
      // nada
    }
    setVista(null);
    setRespuestas({});
    setIndice(0);
    setError(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const enPreguntas = !!vista && !!pregunta;
  const areaNombre = AREAS_DE_LA_PORTADA.find((a) => a.slug === (vista ? SLUG_DEL_AREA[vista.area] : valores.area))?.nombre ?? "";

  return (
    <div className={`dr ${enPreguntas ? "dr-pasos" : "dr-inicio"}`} data-dir={direccion}>
      <header className="topbar">
        <button type="button" className="brand" title={enPreguntas ? "Volver al inicio (reinicia el test)" : "Smarteam"} onClick={enPreguntas ? reiniciar : undefined}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={logo} alt="Smarteam" height={28} />
        </button>
      </header>
      <main className="app">
        {enPreguntas ? (
          <PasoDelTest
            areaNombre={areaNombre}
            preguntas={vista.preguntas}
            indice={indice}
            respuestas={respuestas}
            ocupado={ocupado}
            error={error}
            alElegir={(opcion) => setRespuestas((r) => ({ ...r, [pregunta.id]: { ...r[pregunta.id], opcion } }))}
            alEscribirMatiz={(matiz) => setRespuestas((r) => ({ ...r, [pregunta.id]: { opcion: r[pregunta.id]?.opcion ?? "", matiz } }))}
            alIrA={(i) => irA(i, i < indice ? "atras" : "adelante")}
            alVolver={() => irA(Math.max(0, indice - 1), "atras")}
            alSeguir={() => void siguiente()}
            alReiniciar={reiniciar}
          />
        ) : (
          <InicioDelTest
            total={total}
            valores={valores}
            alCambiar={cambiar}
            errores={errores}
            industrias={etiquetas}
            abiertas={abiertas}
            ocupado={ocupado}
            error={error}
            alEnviar={empezar}
          />
        )}
      </main>
    </div>
  );
}
