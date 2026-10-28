"use client";

/**
 * components/external/test/CalendarioDeHubspot.tsx — el calendario de HubSpot para agendar la sesión, incrustado en la
 * página de resultado del test (como el de la aplicación vieja).
 *
 * ⛔ SIN el script de HubSpot (MeetingsEmbedCode.js): la página del resultado no corre programas de terceros (DECISIONS
 * «Test público», revisión del 28 oct). Ese script mandaba a HubSpot la dirección de la página, que es el token del
 * resultado. El iframe lo arma este componente con lo mismo que armaba el script, menos eso:
 *   · `parentPageUrl` es la ruta del resultado SIN el token (`/external/test/resultado`);
 *   · la cookie `hubspotutk` del visitante (así la reunión cae en su contacto, como antes) o, sin ella, una al azar, como
 *     hace el script: sin ninguna, la agenda se queda en blanco (probado el 28 oct);
 *   · contesta el «readyForConsentListener» de la agenda (sin esa respuesta se queda en blanco; probado el 28 oct), con
 *     el seguimiento de analítica apagado: aquí no hay aviso de cookies que lo autorice (darConsentimiento);
 *   · el alto llega por mensaje desde HubSpot. Mientras el visitante no entra al calendario, la tarjeta se recorta al
 *     primer paso (HubSpot pide siempre 715 px y su primer paso mide unos 490: el resto se veía como un hueco).
 * Sin red o bloqueado, el enlace de abajo abre la agenda en otra pestaña.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { ORIGENES_DE_LA_AGENDA, srcDeLaAgenda } from "@/lib/tests-diagnostico/pagina-del-resultado";

/** Un identificador al azar de 32 letras hexadecimales (el que arma el script de HubSpot cuando no hay cookie). */
function utkAlAzar(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * La respuesta al «readyForConsentListener» de la agenda: sin ella se queda en blanco. Con `"*"`, como el script de
 * HubSpot (con el origen exacto la agenda no la toma; probado el 28 oct): no lleva nada privado y va solo a este iframe.
 * Se manda a su aviso y, por si llega antes de que la agenda escuche, al cargar el iframe y unas veces más en los 20 s
 * siguientes (repetirla no hace nada). NO se contesta a cada mensaje: la agenda responde con su alto y se armaba un
 * ping-pong de decenas de mensajes por segundo.
 */
function darConsentimiento(ifr: HTMLIFrameElement) {
  ifr.contentWindow?.postMessage({ type: "privacy-consent", shouldTrackAnalytics: false }, "*");
}

function leerCookie(nombre: string): string | null {
  const m = document.cookie.match(new RegExp(`(?:^|; )${nombre}=([^;]*)`));
  return m ? decodeURIComponent(m[1]) : null;
}

export default function CalendarioDeHubspot({ agenda }: { agenda: string }) {
  const marco = useRef<HTMLIFrameElement>(null);
  const [src, setSrc] = useState<string | null>(null);
  /**
   * Un nombre nuevo para el iframe en cada carga: al volver con «Atrás», Chrome repone cada iframe con lo que tenía (lo
   * busca por su nombre o su lugar), y la agenda repuesta así se quedaba en blanco aunque se le contestara (probado el
   * 28 oct). Con otro nombre no la repone y carga de cero, que es lo que funciona.
   */
  const [nombre, setNombre] = useState("agenda");
  const [alto, setAlto] = useState(715);
  const [compacto, setCompacto] = useState(true);
  const origenes = useMemo(() => new Set(ORIGENES_DE_LA_AGENDA), []);

  useEffect(() => {
    // En el navegador: la cookie y el origen solo existen aquí.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- leer la cookie y el origen del navegador al montar
    setNombre(`agenda-${utkAlAzar()}`);
    setSrc(srcDeLaAgenda(agenda, { origen: window.location.origin, utk: leerCookie("hubspotutk") ?? utkAlAzar() }));
  }, [agenda]);

  useEffect(() => {
    const alMensaje = (e: MessageEvent) => {
      const ifr = marco.current;
      if (!ifr || e.source !== ifr.contentWindow || !origenes.has(e.origin)) return;
      const d = e.data as unknown;
      if (d === "readyForConsentListener") {
        darConsentimiento(ifr);
        return;
      }
      const h = d && typeof d === "object" ? Number((d as { height?: unknown }).height) : NaN;
      if (Number.isFinite(h) && h > 200 && h < 3000) setAlto(h);
    };
    // El foco salió de la página; si aterrizó en el calendario, empezó a reservar: se suelta el recorte.
    const alPerderFoco = () =>
      setTimeout(() => {
        if (document.activeElement === marco.current) setCompacto(false);
      }, 0);
    window.addEventListener("message", alMensaje);
    window.addEventListener("blur", alPerderFoco);
    return () => {
      window.removeEventListener("message", alMensaje);
      window.removeEventListener("blur", alPerderFoco);
    };
  }, [origenes]);

  return (
    <>
      <div className={`rd-agenda-cal${compacto ? " is-compacto" : ""}`}>
        {src ? (
          <iframe
            key={nombre}
            name={nombre}
            ref={marco}
            src={src}
            title="Agenda tu sesión con Smarteam"
            style={{ height: alto }}
            referrerPolicy="no-referrer"
            onLoad={(e) => {
              const ifr = e.currentTarget;
              darConsentimiento(ifr);
              for (const s of [1, 2, 4, 8, 12, 16, 20]) setTimeout(() => darConsentimiento(ifr), s * 1000);
            }}
          />
        ) : (
          <div className="rd-agenda-cargando" />
        )}
      </div>
      <a className="rd-agenda-enlace" href={agenda} target="_blank" rel="noopener noreferrer">
        ¿No ves el calendario? Ábrelo aquí
      </a>
    </>
  );
}
