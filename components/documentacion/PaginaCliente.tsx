"use client";

/**
 * components/documentacion/PaginaCliente.tsx — el editor de la página y su guardado.
 *
 * Existe, primero, para lo único que un Server Component no puede hacer: cargar el editor con
 * `dynamic(..., { ssr: false })`. Y segundo, para el guardado, que tiene tres reglas:
 *
 *   · Se guarda SOLO cuando la persona cambia algo, y recién ~1,2 s después de la última tecla.
 *   · Cada guardado manda la VERSIÓN que se está editando. Si otra persona guardó primero, el
 *     servidor responde 409: se corta el autoguardado y se avisa, en vez de pisar su trabajo.
 *   · Si la pestaña se cierra o se oculta con un cambio pendiente, se manda igual (`keepalive`).
 *     Sin eso, escribir y cerrar pierde lo último escrito.
 *
 * También monta el proveedor de los datos VIVOS: el bloque que se arma solo los lee de acá, y el
 * que monta un contexto nunca es el que lo consume.
 *
 * El `key` con el id de la página remonta el editor al navegar: su contenido inicial se lee una
 * sola vez.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { ApiError, fetchJson } from "@/lib/api/fetch-json";
import { SkeletonText } from "@/components/ui";
import type { DatosVivos } from "@/lib/documentacion/vivos";
import { ProveedorDeVivos } from "./ContextoDeVivos";
import type { BloqueParcialDeDocumentacion } from "./esquema-editor";

const EditorDePagina = dynamic(() => import("./EditorDePagina").then((m) => m.default), {
  ssr: false,
  loading: () => <SkeletonText lines={6} />,
});

type Estado = "guardado" | "pendiente" | "guardando" | "conflicto" | "error";

export interface PaginaClienteProps {
  paginaId: string;
  version: number;
  contenido: BloqueParcialDeDocumentacion[];
  editable: boolean;
  /** Lo que el servidor calculó para los bloques vivos. `null` = la página no tiene ninguno. */
  vivos: DatosVivos | null;
}

const ESPERA_MS = 1200;

export default function PaginaCliente({
  paginaId,
  version,
  contenido,
  editable,
  vivos,
}: PaginaClienteProps) {
  const [estado, setEstado] = useState<Estado>("guardado");
  const versionRef = useRef(version);
  const pendiente = useRef<unknown[] | null>(null);
  const reloj = useRef<ReturnType<typeof setTimeout> | null>(null);

  const guardar = useCallback(async () => {
    const documento = pendiente.current;
    if (!documento) return;
    pendiente.current = null;
    setEstado("guardando");
    try {
      const r = await fetchJson<{ version: number }>(`/api/documentacion/paginas/${paginaId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ version: versionRef.current, contenido: documento }),
      });
      versionRef.current = r.version;
      setEstado(pendiente.current ? "pendiente" : "guardado");
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        setEstado("conflicto");
        return;
      }
      // Se conserva lo pendiente: el próximo cambio (o cerrar la pestaña) lo reintenta.
      pendiente.current = documento;
      setEstado("error");
    }
  }, [paginaId]);

  const alCambiar = useCallback(
    (documento: unknown[]) => {
      setEstado((previo) => (previo === "conflicto" ? previo : "pendiente"));
      pendiente.current = documento;
      if (reloj.current) clearTimeout(reloj.current);
      reloj.current = setTimeout(() => void guardar(), ESPERA_MS);
    },
    [guardar],
  );

  /* Cerrar o esconder la pestaña con algo sin guardar: se manda con `keepalive`, que sobrevive a
     que la página se descargue. `visibilitychange` es el evento que los navegadores garantizan
     en móvil (`beforeunload` no dispara al cambiar de app). */
  useEffect(() => {
    const vaciar = () => {
      const documento = pendiente.current;
      if (!documento) return;
      pendiente.current = null;
      void fetch(`/api/documentacion/paginas/${paginaId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ version: versionRef.current, contenido: documento }),
        keepalive: true,
      });
    };
    const alOcultar = () => {
      if (document.visibilityState === "hidden") vaciar();
    };
    document.addEventListener("visibilitychange", alOcultar);
    return () => {
      document.removeEventListener("visibilitychange", alOcultar);
      if (reloj.current) clearTimeout(reloj.current);
      vaciar();
    };
  }, [paginaId]);

  return (
    <ProveedorDeVivos datos={vivos}>
      <div className="nx-doc">
        {editable && <Aviso estado={estado} />}
        <EditorDePagina
          key={paginaId}
          contenidoInicial={contenido}
          editable={editable && estado !== "conflicto"}
          onCambio={editable ? (documento) => alCambiar(documento as unknown[]) : undefined}
        />
      </div>
    </ProveedorDeVivos>
  );
}

function Aviso({ estado }: { estado: Estado }) {
  if (estado === "conflicto") {
    return (
      <div className="mb-3 rounded-md border border-warn-line bg-warn-surface px-3 py-2 text-sm text-warn-ink">
        Alguien más guardó esta página mientras la editabas, así que se frenó el guardado para no
        pisar su trabajo.{" "}
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="underline underline-offset-2"
        >
          Recargar para ver su versión
        </button>
        .
      </div>
    );
  }
  if (estado === "error") {
    return (
      <div className="mb-3 rounded-md border border-danger-line bg-danger-surface px-3 py-2 text-sm text-danger-ink">
        No se pudo guardar el último cambio. Se reintenta al seguir escribiendo.
      </div>
    );
  }
  const texto =
    estado === "guardando" ? "Guardando…" : estado === "pendiente" ? "Sin guardar" : "Guardado";
  return (
    <p className="mb-2 text-right text-2xs text-fg-muted" aria-live="polite">
      {texto}
    </p>
  );
}
