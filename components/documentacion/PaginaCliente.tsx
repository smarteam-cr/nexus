"use client";

/**
 * components/documentacion/PaginaCliente.tsx — la página entera del lado del cliente.
 *
 * Es el dueño de tres cosas que tienen que vivir juntas:
 *   · el ENCABEZADO (ícono, título, estado del guardado y acciones);
 *   · el EDITOR, que se carga perezoso y solo en el navegador (`ssr: false`, lo único que un
 *     Server Component no puede hacer);
 *   · el GUARDADO.
 *
 * Las tres reglas del guardado:
 *   · Se guarda SOLO cuando la persona cambia algo, y recién ~1,2 s después de la última tecla.
 *   · Cada guardado manda la VERSIÓN que se está editando. Si otra persona guardó primero, el
 *     servidor responde 409: se corta el autoguardado y se avisa, en vez de pisar su trabajo.
 *   · Si la pestaña se cierra o se oculta con un cambio pendiente, se manda igual (`keepalive`).
 *
 * Monta además los dos contextos que el editor necesita: los datos VIVOS (lo que se arma solo
 * desde Nexus) y el índice de PÁGINAS (para el menú «@» y para que cada mención muestre el título
 * actual de la página que enlaza). El que monta un contexto nunca es el que lo consume.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { ApiError, fetchJson } from "@/lib/api/fetch-json";
import { SkeletonText } from "@/components/ui";
import type { EstadoDeGuardado } from "@/lib/documentacion/tipos";
import type { DatosVivos } from "@/lib/documentacion/vivos";
import { ProveedorDeVivos } from "./ContextoDeVivos";
import { ProveedorDePaginas, type PaginaEnlazable } from "./ContextoDePaginas";
import EncabezadoDePagina from "./EncabezadoDePagina";
import type { BloqueParcialDeDocumentacion } from "./esquema-editor";

const EditorDePagina = dynamic(() => import("./EditorDePagina").then((m) => m.default), {
  ssr: false,
  loading: () => <SkeletonText lines={6} />,
});

export interface PaginaClienteProps {
  pagina: {
    id: string;
    slug: string;
    titulo: string;
    icono: string | null;
    bloqueada: boolean;
    fija: boolean;
    version: number;
  };
  migas: { label: string; href: string }[];
  contenido: BloqueParcialDeDocumentacion[];
  editable: boolean;
  puedeAdministrar: boolean;
  /** Lo que el servidor calculó para los bloques vivos. `null` = la página no tiene ninguno. */
  vivos: DatosVivos | null;
  /** El índice de páginas: alimenta el menú «@» y los títulos de las menciones. */
  paginas: PaginaEnlazable[];
}

const ESPERA_MS = 1200;

export default function PaginaCliente({
  pagina,
  migas,
  contenido,
  editable,
  puedeAdministrar,
  vivos,
  paginas,
}: PaginaClienteProps) {
  const [estado, setEstado] = useState<EstadoDeGuardado>("guardado");
  const versionRef = useRef(pagina.version);
  const pendiente = useRef<unknown[] | null>(null);
  const reloj = useRef<ReturnType<typeof setTimeout> | null>(null);

  const guardar = useCallback(async () => {
    const documento = pendiente.current;
    if (!documento) return;
    pendiente.current = null;
    setEstado("guardando");
    try {
      const r = await fetchJson<{ version: number }>(`/api/documentacion/paginas/${pagina.id}`, {
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
  }, [pagina.id]);

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
     que la página se descargue. `visibilitychange` es el evento que los navegadores garantizan en
     móvil (`beforeunload` no dispara al cambiar de app). */
  useEffect(() => {
    const vaciar = () => {
      const documento = pendiente.current;
      if (!documento) return;
      pendiente.current = null;
      void fetch(`/api/documentacion/paginas/${pagina.id}`, {
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
  }, [pagina.id]);

  return (
    <ProveedorDePaginas paginas={paginas}>
      <ProveedorDeVivos datos={vivos}>
        <EncabezadoDePagina
          paginaId={pagina.id}
          slug={pagina.slug}
          titulo={pagina.titulo}
          icono={pagina.icono}
          migas={migas}
          bloqueada={pagina.bloqueada}
          fija={pagina.fija}
          editable={editable}
          puedeAdministrar={puedeAdministrar}
          estado={estado}
        />

        <div className="nx-doc">
          {editable && <AvisoDeGuardado estado={estado} />}
          <EditorDePagina
            key={pagina.id}
            contenidoInicial={contenido}
            editable={editable && estado !== "conflicto"}
            onCambio={editable ? (documento) => alCambiar(documento as unknown[]) : undefined}
          />
        </div>
      </ProveedorDeVivos>
    </ProveedorDePaginas>
  );
}

/** Solo aparece cuando algo salió mal: el estado normal lo dice el encabezado, en chiquito. */
function AvisoDeGuardado({ estado }: { estado: EstadoDeGuardado }) {
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
  return null;
}
