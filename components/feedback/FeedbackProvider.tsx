"use client";

/**
 * components/feedback/FeedbackProvider.tsx — el feedback en todas las pantallas internas (2026-10-04).
 *
 * Vive una vez, en el shell (AppShell), y no se desmonta al navegar. Hace cuatro cosas:
 *   1. Abre el panel de la derecha desde «Feedback» del pie del menú. Al abrirlo toma la captura de lo
 *      que se estaba viendo (sin el panel) y anota los errores recientes de la pantalla.
 *   2. «Señalar algo»: esconde el panel, deja marcar hasta 3 cosas y vuelve a capturar con las marcas.
 *   3. Muestra el pedido de opinión de dirección cuando la persona entra a esa pantalla.
 *   4. Abre el panel en un reporte cuando la dirección trae `?feedback=<id>` (los avisos de «Para ti»).
 *
 * El panel NO tapa la pantalla (como el chat del asistente): se sigue viendo lo que se reporta.
 */
import { createContext, Suspense, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { pedidoAplica } from "@/lib/feedback/reglas";
import type { PedidoParaMi } from "@/lib/feedback/queries";
import { capturarPantalla } from "./captura";
import { escucharErrores } from "./errores";
import { Festejo } from "./Festejo";
import { PanelDeFeedback, type Pestana } from "./PanelDeFeedback";
import { PedidoDeOpinion } from "./PedidoDeOpinion";
import { CapaDeSenalar, MarcasEnLaPagina, type Marca } from "./Senalar";

export interface Captura {
  estado: "tomando" | "lista" | "sin" | "fallo";
  blob: Blob | null;
  url: string | null;
  hora: string | null;
}

interface ContextoDeFeedback {
  abierto: boolean;
  alternar: () => void;
  abrir: (opciones?: { en?: Pestana; reporteId?: string; pedido?: PedidoParaMi }) => void;
}

const Contexto = createContext<ContextoDeFeedback | null>(null);

/** Para el botón del pie del menú. Fuera del provider no hace nada (la pantalla de login, por ejemplo). */
export function useFeedback(): ContextoDeFeedback | null {
  return useContext(Contexto);
}

const SIN_CAPTURA: Captura = { estado: "sin", blob: null, url: null, hora: null };

function horaCorta(d = new Date()): string {
  return d.toLocaleTimeString("es-CR", { hour: "numeric", minute: "2-digit" });
}

export default function FeedbackProvider({
  children,
  version,
}: {
  children: React.ReactNode;
  /** El commit que corre (se manda con el reporte). */
  version: string | null;
}) {
  const pathname = usePathname();
  const [abierto, setAbierto] = useState(false);
  const [pestana, setPestana] = useState<Pestana>("dar");
  const [reporteId, setReporteId] = useState<string | null>(null);
  const [captura, setCaptura] = useState<Captura>(SIN_CAPTURA);
  const [marcas, setMarcas] = useState<Marca[]>([]);
  const [senalando, setSenalando] = useState(false);
  const [festejo, setFestejo] = useState<{ ideas: number } | null>(null);
  const [pedidos, setPedidos] = useState<PedidoParaMi[]>([]);
  const [respondiendo, setRespondiendo] = useState<PedidoParaMi | null>(null);
  const [reinicio, setReinicio] = useState(0);
  const urlAnterior = useRef<string | null>(null);

  useEffect(() => escucharErrores(), []);

  // Los pedidos de opinión abiertos: una vez por carga del shell (no por navegación).
  useEffect(() => {
    let vivo = true;
    fetch("/api/feedback", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { pedidos?: PedidoParaMi[] } | null) => {
        if (vivo && d?.pedidos) setPedidos(d.pedidos);
      })
      .catch(() => {});
    return () => {
      vivo = false;
    };
  }, []);

  const ponerCaptura = useCallback((blob: Blob | null) => {
    if (urlAnterior.current) URL.revokeObjectURL(urlAnterior.current);
    const url = blob ? URL.createObjectURL(blob) : null;
    urlAnterior.current = url;
    setCaptura(blob ? { estado: "lista", blob, url, hora: horaCorta() } : { estado: "fallo", blob: null, url: null, hora: null });
  }, []);

  const tomarCaptura = useCallback(async () => {
    setCaptura((c) => ({ ...c, estado: "tomando" }));
    // Un cuadro de respiro: que el panel recién abierto ya tenga su `data-feedback-ui` en el DOM.
    await new Promise((r) => requestAnimationFrame(() => r(null)));
    ponerCaptura(await capturarPantalla());
  }, [ponerCaptura]);

  const abrir = useCallback<ContextoDeFeedback["abrir"]>(
    (opciones) => {
      const p = opciones?.en ?? "dar";
      setPestana(p);
      setReporteId(opciones?.reporteId ?? null);
      if (opciones?.pedido) setRespondiendo(opciones.pedido);
      if (!abierto) {
        setAbierto(true);
        setMarcas([]);
        setReinicio((n) => n + 1);
        if (p === "dar") void tomarCaptura();
        else setCaptura(SIN_CAPTURA);
      } else if (p === "dar" && captura.estado === "sin") {
        void tomarCaptura();
      }
    },
    [abierto, captura.estado, tomarCaptura],
  );

  const cerrar = useCallback(() => {
    setAbierto(false);
    setSenalando(false);
    setMarcas([]);
    setRespondiendo(null);
    if (urlAnterior.current) URL.revokeObjectURL(urlAnterior.current);
    urlAnterior.current = null;
    setCaptura(SIN_CAPTURA);
  }, []);

  const alternar = useCallback(() => (abierto ? cerrar() : abrir()), [abierto, abrir, cerrar]);

  const terminarDeSenalar = useCallback(async () => {
    setSenalando(false);
    // Las marcas salen en la captura: se vuelve a tomar con ellas puestas.
    await new Promise((r) => requestAnimationFrame(() => r(null)));
    await tomarCaptura();
  }, [tomarCaptura]);

  const pedidoAqui = useMemo(
    () => (abierto ? null : (pedidos.find((p) => pedidoAplica({ estado: "abierto", ruta: p.ruta, hasta: p.hasta }, pathname)) ?? null)),
    [abierto, pedidos, pathname],
  );

  const quitarPedido = useCallback((id: string) => setPedidos((ps) => ps.filter((p) => p.id !== id)), []);

  const valor = useMemo<ContextoDeFeedback>(() => ({ abierto, alternar, abrir }), [abierto, alternar, abrir]);

  return (
    <Contexto.Provider value={valor}>
      {children}
      <Suspense fallback={null}>
        <AbrirDesdeLaDireccion abrir={abrir} />
      </Suspense>
      {abierto && !senalando && (
        <PanelDeFeedback
          key={reinicio}
          enPestana={pestana}
          onPestana={setPestana}
          reporteId={reporteId}
          onReporte={setReporteId}
          captura={captura}
          marcas={marcas}
          onQuitarMarca={(n) => setMarcas((ms) => ms.filter((m) => m.n !== n).map((m, i) => ({ ...m, n: i + 1 })))}
          onSenalar={() => setSenalando(true)}
          onQuitarCaptura={() => ponerCaptura(null)}
          onVolverACapturar={() => void tomarCaptura()}
          respondiendo={respondiendo}
          onRespondido={(id) => {
            quitarPedido(id);
            setRespondiendo(null);
          }}
          version={version}
          onFestejar={(ideas) => setFestejo({ ideas })}
          onCerrar={cerrar}
        />
      )}
      {abierto && <MarcasEnLaPagina marcas={marcas} />}
      {senalando && (
        <CapaDeSenalar
          marcas={marcas}
          onMarcar={(m) => setMarcas((ms) => [...ms, m])}
          onListo={() => void terminarDeSenalar()}
          onCancelar={() => setSenalando(false)}
        />
      )}
      {festejo && <Festejo ideas={festejo.ideas} onCerrar={() => setFestejo(null)} />}
      {pedidoAqui && (
        <PedidoDeOpinion
          key={pedidoAqui.id}
          pedido={pedidoAqui}
          onResponder={() => abrir({ en: "dar", pedido: pedidoAqui })}
          onAhoraNo={() => quitarPedido(pedidoAqui.id)}
        />
      )}
    </Contexto.Provider>
  );
}

/** Los avisos de «Para ti» llevan `?feedback=<id>`: abre el panel en ese reporte. */
function AbrirDesdeLaDireccion({ abrir }: { abrir: ContextoDeFeedback["abrir"] }) {
  const params = useSearchParams();
  const id = params.get("feedback");
  const visto = useRef<string | null>(null);
  useEffect(() => {
    if (!id || visto.current === id) return;
    visto.current = id;
    abrir({ en: "mis", reporteId: id });
  }, [id, abrir]);
  return null;
}
