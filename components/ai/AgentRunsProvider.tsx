"use client";

/**
 * components/ai/AgentRunsProvider.tsx
 *
 * EL HILO DURABLE de las corridas de agente. Montado una vez en el shell
 * (components/layout/AppShell.tsx), que persiste en la navegación client-side:
 * por eso sobrevive a irte del cliente a Marketing o a Cobranza.
 *
 * El problema que resuelve: el servidor SIEMPRE corrió detached (AgentRun guarda
 * status, fase y error), pero la mitad de UI vivía dentro del botón que lanzaba el
 * agente — al desmontarlo se cortaba el polling, moría el spinner y nunca llegaba el
 * aviso de "listo". Ahora el seguimiento vive acá arriba y el botón es solo el gesto.
 *
 * Responsabilidades (una sola de cada cosa en toda la app):
 *  1. UN poller de /api/agent-runs, con cadencia adaptativa.
 *  2. Detectar que algo TERMINÓ y anunciarlo exactamente una vez.
 *  3. Publicar `running`/`recent` para que el sidebar los pinte.
 *
 * Lo que NO hace: lanzar agentes (eso es de cada CTA) ni refrescar la pantalla en la
 * que estás (el aviso te lleva al resultado, y esa página carga fresca).
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/Toast";
import { notifyAgentDone } from "@/lib/notifications/client";

// Con algo corriendo el usuario está esperando: la fase tiene que sentirse viva.
// En reposo, el poll es solo para enterarse de lo que lanzó otra pestaña.
const POLL_ACTIVO_MS = 4_000;
const POLL_REPOSO_MS = 60_000;

export interface RunRow {
  id: string;
  status: "PENDING" | "RUNNING" | "DONE" | "ERROR";
  currentPhase: string | null;
  createdAt: string;
  updatedAt: string;
  clientId: string | null;
  clientName: string | null;
  agentName: string;
  error: string | null;
  /** ¿La lancé yo? Solo lo mío interrumpe con un aviso. */
  mine: boolean;
  /** Deep-link al resultado (lib/agents/run-url.ts). */
  resultUrl: string;
}

interface Feed {
  running: RunRow[];
  recent: RunRow[];
}

interface AgentRunsApi {
  running: RunRow[];
  recent: RunRow[];
  /** Corridas MÍAS en curso — las que justifican el spinner del sidebar. */
  misEnCurso: RunRow[];
  /** Fase legible de la corrida mía más reciente, para el label del sidebar. */
  fase: string | null;
  /** Fuerza un refresco inmediato (al lanzar un agente, para no esperar al tick). */
  refrescar: () => void;
  /**
   * "De esta corrida ya avisé yo" — la llama el disparador que siguió montado hasta
   * el final. Sin esto el usuario que NO navega vería DOS avisos: el del botón y el
   * de este provider.
   */
  marcarAnunciada: (runId: string) => void;
}

const Ctx = createContext<AgentRunsApi | null>(null);

/** No lanza si no hay provider: los CTA viven también fuera del shell (landings). */
export function useAgentRuns(): AgentRunsApi | null {
  return useContext(Ctx);
}

export default function AgentRunsProvider({ children }: { children: React.ReactNode }) {
  const [feed, setFeed] = useState<Feed>({ running: [], recent: [] });
  const router = useRouter();
  const toast = useToast();

  // Ids ya anunciados (por el provider o por un disparador vivo). Es un ref y no
  // estado: cambiarlo no debe re-renderizar y su lectura tiene que ser síncrona
  // dentro del tick del poller.
  const anunciadasRef = useRef<Set<string>>(new Set());
  // El primer tick es la línea base (ver fetchFeed): sin esto, abrir Nexus dispararía
  // un aviso por cada corrida terminada que quedó en la lista.
  const primerTickRef = useRef(true);

  const marcarAnunciada = useCallback((runId: string) => {
    anunciadasRef.current.add(runId);
  }, []);

  const anunciar = useCallback(
    (r: RunRow) => {
      const quien = r.clientName ? ` de ${r.clientName}` : "";
      const ver = { label: "Ver", onClick: () => router.push(r.resultUrl) };
      if (r.status === "DONE") {
        toast.success(`Listo: ${r.agentName}${quien}`, { action: ver });
      } else {
        toast.error(r.error ?? `Falló: ${r.agentName}${quien}`, { action: ver });
      }
      // Con la pestaña sin foco, además la notificación del sistema — ahora con la
      // URL del resultado, no la home del cliente. Se auto-suprime si estás mirando.
      void notifyAgentDone({
        label: r.agentName,
        clientName: r.clientName,
        ok: r.status === "DONE",
        url: r.resultUrl,
      });
    },
    [router, toast],
  );

  const fetchFeed = useCallback(async () => {
    let data: Feed;
    try {
      const res = await fetch("/api/agent-runs?take=15");
      if (!res.ok) return;
      data = (await res.json()) as Feed;
    } catch {
      return; // red caída: el próximo tick reintenta
    }

    // El PRIMER tick solo toma la FOTO INICIAL: todo lo que ya estaba terminado
    // cuando abriste Nexus se marca como anunciado, para no vomitar avisos viejos
    // de cosas que pasaron ayer. A partir de ahí, cualquier id NUEVO en `recent` es,
    // por definición, algo que terminó durante esta sesión.
    if (primerTickRef.current) {
      primerTickRef.current = false;
      for (const r of data.recent) anunciadasRef.current.add(r.id);
      setFeed(data);
      return;
    }

    const enCurso = new Set(data.running.map((r) => r.id));
    for (const r of data.recent) {
      if (anunciadasRef.current.has(r.id)) continue;
      if (enCurso.has(r.id)) continue; // aparece en las dos listas: carrera, todavía viva
      // Ojo: NO se exige haberla visto "en curso" antes. Una corrida rápida puede
      // arrancar y terminar entre dos polls sin asomar nunca por `running`, y era
      // justo la que se perdía en silencio si el usuario había navegado.
      anunciadasRef.current.add(r.id);
      if (r.mine) anunciar(r);
    }

    setFeed(data);
  }, [anunciar]);

  const hayEnCurso = feed.running.length > 0;

  useEffect(() => {
    // Suscripción a un sistema externo (el feed del server), que es justamente el
    // caso para el que existe useEffect. El setState no es sincrónico —ocurre cuando
    // responde el fetch— pero la regla es estática y no puede verlo.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- polling de un recurso remoto
    void fetchFeed();
    const t = setInterval(() => void fetchFeed(), hayEnCurso ? POLL_ACTIVO_MS : POLL_REPOSO_MS);
    return () => clearInterval(t);
  }, [fetchFeed, hayEnCurso]);

  // Al volver a la pestaña, refrescar ya: si terminó mientras estabas en otra app,
  // el aviso sale al instante en vez de esperar hasta un minuto.
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "visible") void fetchFeed();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [fetchFeed]);

  const misEnCurso = useMemo(() => feed.running.filter((r) => r.mine), [feed.running]);

  const api = useMemo<AgentRunsApi>(
    () => ({
      running: feed.running,
      recent: feed.recent,
      misEnCurso,
      fase: misEnCurso[0]?.currentPhase ?? null,
      refrescar: () => void fetchFeed(),
      marcarAnunciada,
    }),
    [feed, misEnCurso, fetchFeed, marcarAnunciada],
  );

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}
