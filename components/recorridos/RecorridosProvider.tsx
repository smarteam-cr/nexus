"use client";

/**
 * RecorridosProvider — los recorridos guiados del shell interno.
 *
 * Lo monta `AppShell` con el rol y la cookie de lo visto ya leídos en el servidor: el punto azul
 * del botón nace bien pintado, sin parpadeo. React Joyride se carga recién cuando arranca un
 * recorrido (import dinámico): a quien no abre uno no le pesa nada.
 *
 * Arrancar un recorrido resuelve cada paso contra la pantalla: busca el primer elemento visible
 * con su `data-recorrido` y, si no hay, el paso no sale. Así un permiso que esconde un botón, el
 * panel oculto o una propuesta que no existe nunca dejan un globo señalando el vacío.
 */
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { TeamRole } from "@prisma/client";
import type { EventData, Step } from "react-joyride";
import { useToast } from "@/components/ui/Toast";
import { Z } from "@/lib/ui/z";
import {
  COOKIE_DE_RECORRIDOS,
  EVENTO_DEL_RECORRIDO,
  escribirVistos,
  estadoDe,
  leerVistos,
  marcarVisto,
  pasosDelRol,
  recorridoActual,
  recorridosDelRol,
  type AccionDelRecorrido,
  type ComoTermino,
  type Recorrido,
  type Vistos,
} from "@/lib/recorridos";
import { RecorridosContext, type ContextoDeRecorridos } from "./contexto";
import { GloboDelRecorrido } from "./GloboDelRecorrido";
import { TusRecorridos } from "./TusRecorridos";

const Joyride = dynamic(() => import("react-joyride").then((m) => m.Joyride), { ssr: false });

/** El recorrido que se pidió desde otra pantalla («Ver» en la lista): arranca al llegar a la suya. */
const PENDIENTE = "nexus-recorrido-pendiente";
/** Cuánto se espera, al llegar, a que la pantalla pinte lo que el recorrido señala. */
const ESPERA_MAXIMA_MS = 6000;
/** Cuánto se espera a que una acción (elegir algo en la rueda) pinte el elemento del paso. */
const ESPERA_DE_ACCION_MS = 2500;

function guardarCookie(vistos: Vistos) {
  const valor = escribirVistos(vistos);
  document.cookie = valor
    ? `${COOKIE_DE_RECORRIDOS}=${valor};path=/;max-age=31536000;SameSite=Lax`
    : `${COOKIE_DE_RECORRIDOS}=;path=/;max-age=0;SameSite=Lax`;
}

/** El primer elemento A LA VISTA con ese ancla. Un panel montado y oculto (`hidden`) no cuenta. */
function elementoALaVista(ancla: string): HTMLElement | null {
  const candidatos = document.querySelectorAll<HTMLElement>(`[data-recorrido="${ancla}"]`);
  for (const el of candidatos) if (el.getClientRects().length > 0) return el;
  return null;
}

/** Le pide a la pantalla una acción del recorrido. La escucha quien la sabe hacer (el mapa de la escala, por ejemplo). */
function pedirAccion(a: AccionDelRecorrido) {
  window.dispatchEvent(new CustomEvent(EVENTO_DEL_RECORRIDO, { detail: a }));
}

const dosCuadros = () => new Promise<void>((listo) => requestAnimationFrame(() => requestAnimationFrame(() => listo())));

async function esperarAncla(ancla: string, tope: number) {
  const desde = Date.now();
  while (Date.now() - desde < tope) {
    await dosCuadros();
    if (elementoALaVista(ancla)) return;
  }
}

function pasosALaVista(recorrido: Recorrido, rol: TeamRole | null): Step[] {
  const pasos: Step[] = [];
  for (const p of pasosDelRol(recorrido, rol)) {
    // Un paso con acción recién tiene su elemento después de hacerla: entra siempre y se busca
    // cuando le toca. El resto, solo si ya está a la vista.
    if (!p.accion && !elementoALaVista(p.ancla)) continue;
    const accion = p.accion;
    pasos.push({
      // Se busca cuando le toca, no al arrancar: un panel que cambia de variante reemplaza su nodo.
      target: () => elementoALaVista(p.ancla),
      title: p.titulo,
      content: p.texto,
      placement: p.lado ?? "bottom",
      data: { rotulo: recorrido.rotulo },
      ...(accion
        ? {
            before: async () => {
              pedirAccion(accion);
              await esperarAncla(p.ancla, ESPERA_DE_ACCION_MS);
            },
            targetWaitTimeout: ESPERA_DE_ACCION_MS,
          }
        : {}),
    });
  }
  return pasos;
}

/** Los colores que la librería pinta como atributos SVG (no aceptan variables CSS): se leen del tema vivo. */
function coloresDelTema() {
  const raiz = document.documentElement;
  const oscuro = !raiz.classList.contains("light");
  const marca = getComputedStyle(raiz).getPropertyValue("--color-brand").trim() || "#3b82f6";
  return { velo: oscuro ? "rgba(0, 0, 0, 0.6)" : "rgba(0, 0, 0, 0.4)", marca };
}

interface Corrida {
  recorrido: Recorrido;
  pasos: Step[];
  clave: number;
  velo: string;
  marca: string;
}

export default function RecorridosProvider({
  rol,
  vistosIniciales,
  children,
}: {
  rol: TeamRole | null;
  /** El valor crudo de la cookie `nexus-recorridos`, leído en el servidor. */
  vistosIniciales: string | null;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const toast = useToast();
  const [vistos, setVistos] = useState<Vistos>(() => leerVistos(vistosIniciales));
  const [corrida, setCorrida] = useState<Corrida | null>(null);
  const [listaAbierta, setListaAbierta] = useState(false);
  const [pantalla, setPantalla] = useState<string | null>(null);
  const terminada = useRef<number | null>(null);

  const recorridos = useMemo(() => recorridosDelRol(rol), [rol]);

  const guardar = useCallback((rec: Recorrido, como: ComoTermino) => {
    setVistos((v) => {
      const nuevo = marcarVisto(v, rec, como);
      guardarCookie(nuevo);
      return nuevo;
    });
  }, []);

  const arrancar = useCallback(
    async (rec: Recorrido): Promise<boolean> => {
      if (rec.alArrancar?.length) {
        for (const a of rec.alArrancar) pedirAccion(a);
        await dosCuadros();
        await new Promise((listo) => window.setTimeout(listo, 120));
      }
      const pasos = pasosALaVista(rec, rol);
      if (pasos.length === 0) return false;
      setListaAbierta(false);
      setCorrida({ recorrido: rec, pasos, clave: Date.now(), ...coloresDelTema() });
      return true;
    },
    [rol],
  );

  /** ¿Está a la vista la pantalla de ese recorrido? Para una pieza, además de la dirección, tiene que estar abierta. */
  const enSuPantalla = useCallback(
    (rec: Recorrido) => rec.ruta.test(pathname) && (!rec.porPantalla || pantalla === rec.id),
    [pathname, pantalla],
  );

  const iniciar = useCallback(
    (id: string) => {
      const rec = recorridos.find((r) => r.id === id);
      if (!rec) return;
      if (enSuPantalla(rec)) {
        void arrancar(rec).then((ok) => {
          if (!ok) toast.info("Lo que explica este recorrido no está a la vista en esta pantalla.");
        });
        return;
      }
      try {
        sessionStorage.setItem(PENDIENTE, rec.id);
      } catch {
        /* Sin sessionStorage: igual se navega; el recorrido se arranca a mano desde su botón. */
      }
      setListaAbierta(false);
      // Misma dirección, otra pieza (estás en la ficha pero no en su cronograma): no se navega, se avisa.
      if (!rec.ruta.test(pathname)) router.push(rec.irA.href);
      if (rec.irA.aviso) toast.info(rec.irA.aviso);
    },
    [recorridos, enSuPantalla, pathname, arrancar, router, toast],
  );

  /* El recorrido pendiente arranca cuando su pantalla ya pintó lo que señala. La ficha carga sus
     piezas en el cliente: se espera a que aparezcan casi todas (o a que pase el tope) en vez de
     arrancar con la mitad de los pasos. */
  useEffect(() => {
    let id: string | null = null;
    try {
      id = sessionStorage.getItem(PENDIENTE);
    } catch {
      return;
    }
    const rec = id ? recorridos.find((r) => r.id === id) : null;
    if (!rec || !enSuPantalla(rec)) return;
    const total = pasosDelRol(rec, rol).length;
    const desde = Date.now();
    let anterior = -1;
    const reloj = window.setInterval(() => {
      const hay = pasosALaVista(rec, rol).length;
      const quieto = hay > 0 && hay === anterior;
      anterior = hay;
      if (hay >= total || (quieto && hay >= Math.min(3, total)) || Date.now() - desde > ESPERA_MAXIMA_MS) {
        window.clearInterval(reloj);
        try {
          sessionStorage.removeItem(PENDIENTE);
        } catch {
          /* nada que limpiar */
        }
        void arrancar(rec);
      }
    }, 400);
    return () => window.clearInterval(reloj);
  }, [enSuPantalla, recorridos, rol, arrancar]);

  const terminar = useCallback(
    (como: ComoTermino) => {
      if (!corrida || terminada.current === corrida.clave) return;
      terminada.current = corrida.clave;
      const rec = corrida.recorrido;
      guardar(rec, como);
      setCorrida(null);
      const otraVez = { label: "Verlo de nuevo", onClick: () => void arrancar(rec) };
      if (como === "v") toast.success(`Viste el recorrido «${rec.titulo}». Lo vuelves a ver con «Recorrido», arriba.`, { action: otraVez });
      else toast.info("Saltaste el recorrido. Lo retomas cuando quieras con «Recorrido», arriba.", { action: otraVez });
    },
    [corrida, guardar, arrancar, toast],
  );

  const alEvento = useCallback(
    (data: EventData) => {
      if (data.status === "finished") terminar("v");
      else if (data.status === "skipped") terminar("s");
    },
    [terminar],
  );

  const descartar = useCallback(
    (id: string) => {
      const rec = recorridos.find((r) => r.id === id);
      if (rec) guardar(rec, "s");
    },
    [recorridos, guardar],
  );

  const declararPantalla = useCallback((id: string) => {
    setPantalla(id);
    return () => setPantalla((actual) => (actual === id ? null : actual));
  }, []);

  const reiniciarTodos = useCallback(() => {
    setVistos({});
    guardarCookie({});
  }, []);

  const valor = useMemo<ContextoDeRecorridos>(
    () => ({
      recorridos,
      estado: (id) => {
        const rec = recorridos.find((r) => r.id === id);
        return rec ? estadoDe(rec, vistos) : "visto";
      },
      sinVer: recorridos.filter((r) => estadoDe(r, vistos) !== "visto").length,
      activo: corrida?.recorrido.id ?? null,
      pantalla,
      iniciar,
      descartar,
      abrirLista: () => setListaAbierta(true),
      declararPantalla,
    }),
    [recorridos, vistos, corrida, pantalla, iniciar, descartar, declararPantalla],
  );

  return (
    <RecorridosContext.Provider value={valor}>
      {children}
      {corrida && (
        <Joyride
          key={corrida.clave}
          run
          continuous
          scrollToFirstStep
          steps={corrida.pasos}
          tooltipComponent={GloboDelRecorrido}
          onEvent={alEvento}
          locale={{ back: "Anterior", close: "Cerrar", last: "Terminar", next: "Siguiente", skip: "Saltar" }}
          options={{
            skipBeacon: true,
            zIndex: Z.TOUR,
            overlayColor: corrida.velo,
            spotlightPadding: 6,
            spotlightRadius: 12,
            arrowBase: 16,
            arrowSize: 8,
            offset: 12,
            scrollOffset: 96,
            targetWaitTimeout: 0,
            // Esc lo maneja el globo (sale del recorrido); la librería no tiene esa acción.
            dismissKeyAction: false,
            // Un clic en el velo no saca a nadie del recorrido por accidente, ni la cosa señalada navega.
            overlayClickAction: false,
            blockTargetInteraction: true,
          }}
          styles={{
            spotlight: { stroke: corrida.marca, strokeWidth: 2 },
            arrow: { color: "var(--color-surface)" },
          }}
        />
      )}
      <TusRecorridos
        abierta={listaAbierta}
        onCerrar={() => setListaAbierta(false)}
        recorridos={recorridos}
        rol={rol}
        vistos={vistos}
        actual={recorridoActual(pathname, pantalla, recorridos)?.id ?? null}
        onVer={iniciar}
        onReiniciar={reiniciarTodos}
      />
    </RecorridosContext.Provider>
  );
}
