"use client";

/**
 * components/artefactos/ContextoDeLaCopia.tsx — el «Contexto adicional» de una COPIA (etapa V3b de docs/artefactos-plan.md),
 * con las piezas de siempre: las reuniones que lee entera, las fuentes manuales (notas, transcripciones y archivos) y las
 * instrucciones. Es de esta copia y no de su tipo. Lo elegido pesa más que la memoria del proyecto: se lee entero.
 */
import { useCallback, useEffect, useState } from "react";
import { Alert, Input } from "@/components/ui";
import { useToast } from "@/components/ui/Toast";
import { ContextColumn, CTX_ICONS } from "@/components/clients/context-column";
import FuentesManualesColumn from "@/components/clients/FuentesManualesColumn";
import InstruccionesDelDocumento from "@/components/contexto/InstruccionesDelDocumento";
import { Casilla } from "@/components/contexto/ListaDeReuniones";
import { TOPE_NOTAS_DEL_DOCUMENTO } from "@/lib/contexto/documento";
import { piezaDeLasNotas, TOPE_DE_REUNIONES_DE_LA_COPIA } from "@/lib/artefactos/contexto-de-la-copia";
import { tipoDeArtefacto } from "@/lib/artefactos/tipos";

interface Reunion {
  id: string;
  titulo: string;
  fecha: string;
  elegida: boolean;
}

const fecha = (iso: string) => new Date(iso).toLocaleDateString("es-CR", { day: "numeric", month: "short", year: "numeric", timeZone: "America/Costa_Rica" });

function ReunionesDeLaCopia({
  projectId,
  canvasId,
  onCuenta,
  onPuedeEditar,
}: {
  projectId: string;
  canvasId: string;
  onCuenta: (n: number) => void;
  onPuedeEditar: (puede: boolean) => void;
}) {
  const base = `/api/projects/${projectId}/artefactos/${canvasId}/contexto`;
  /** null = leyendo; «error» = no se pudo leer. */
  const [lista, setLista] = useState<Reunion[] | "error" | null>(null);
  const [filtro, setFiltro] = useState("");
  const [puedeEditar, setPuedeEditar] = useState(false);
  const toast = useToast();

  useEffect(() => {
    void (async () => {
      const r = await fetch(base).catch(() => null);
      const j = r?.ok ? ((await r.json().catch(() => null)) as { reuniones: Reunion[]; puedeEditar: boolean } | null) : null;
      setLista(j?.reuniones ?? "error");
      setPuedeEditar(!!j?.puedeEditar);
      onPuedeEditar(!!j?.puedeEditar);
    })();
  }, [base, onPuedeEditar]);

  const elegidas = Array.isArray(lista) ? lista.filter((x) => x.elegida) : [];
  useEffect(() => onCuenta(elegidas.length), [elegidas.length, onCuenta]);

  const alternar = useCallback(
    async (id: string) => {
      if (!Array.isArray(lista) || !puedeEditar) return;
      const nueva = lista.map((x) => (x.id === id ? { ...x, elegida: !x.elegida } : x));
      if (nueva.filter((x) => x.elegida).length > TOPE_DE_REUNIONES_DE_LA_COPIA) return toast.error(`Hasta ${TOPE_DE_REUNIONES_DE_LA_COPIA} reuniones por documento.`);
      setLista(nueva);
      const r = await fetch(base, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reuniones: nueva.filter((x) => x.elegida).map((x) => x.id) }),
      }).catch(() => null);
      if (!r?.ok) {
        setLista(lista);
        toast.error("No se pudo guardar. Vuelve a intentarlo.");
      }
    },
    [base, lista, puedeEditar, toast],
  );

  if (lista === "error") return <Alert variant="danger">No se pudieron cargar las reuniones del proyecto.</Alert>;
  if (lista === null) return <p className="text-xs text-fg-muted">Leyendo las reuniones…</p>;
  if (lista.length === 0) return <p className="text-xs text-fg-muted">Este proyecto todavía no tiene reuniones.</p>;
  const texto = filtro.trim().toLowerCase();
  const visibles = texto ? lista.filter((x) => x.titulo.toLowerCase().includes(texto)) : lista;
  return (
    <div className="space-y-2">
      {!puedeEditar && <p className="text-xs text-fg-muted">Solo lectura: elegirlas pide el permiso de generar este documento.</p>}
      <Input value={filtro} onChange={(e) => setFiltro(e.target.value)} placeholder="Buscar una reunión" aria-label="Buscar una reunión" />
      <ul className="max-h-72 space-y-0.5 overflow-y-auto">
        {visibles.map((x) => (
          <li key={x.id} className="flex items-start gap-2 rounded-md px-1.5 py-1 hover:bg-surface-hover">
            <Casilla marcada={x.elegida} onCambiar={() => void alternar(x.id)} etiqueta={`Elegir «${x.titulo}»`} className="mt-0.5" />
            <span className="min-w-0 text-xs">
              <span className="block truncate text-fg" title={x.titulo}>
                {x.titulo}
              </span>
              <span className="block text-fg-muted">{fecha(x.fecha)}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function ContextoDeLaCopia({ projectId, canvasId, tipo }: { projectId: string; canvasId: string; tipo: string }) {
  const [reuniones, setReuniones] = useState(0);
  const [notas, setNotas] = useState(0);
  const [puedeEditar, setPuedeEditar] = useState(false);
  const t = tipoDeArtefacto(tipo);
  return (
    <div className="space-y-3">
      <p className="text-xs text-fg-muted">
        Con esto, más la memoria del proyecto, la IA escribe {t?.conArticulo ?? "el documento"}. Lee enteras las reuniones que elijas: pesan más que lo demás. Es solo de este
        documento.
      </p>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <ContextColumn icon={CTX_ICONS.meet} color="#16a34a" title="Reuniones" count={reuniones}>
          <ReunionesDeLaCopia projectId={projectId} canvasId={canvasId} onCuenta={setReuniones} onPuedeEditar={setPuedeEditar} />
        </ContextColumn>
        <ContextColumn icon={CTX_ICONS.note} color="#7c6df2" title="Notas, transcripciones y archivos" count={notas}>
          <FuentesManualesColumn
            endpoint={`/api/projects/${projectId}/contexto/${piezaDeLasNotas(canvasId)}/notas`}
            canEdit={puedeEditar}
            onCount={setNotas}
            tope={TOPE_NOTAS_DEL_DOCUMENTO}
            adjunto={{ projectId, origen: t?.contextoDe ?? "planning" }}
          />
        </ContextColumn>
      </div>
      <InstruccionesDelDocumento
        projectId={projectId}
        slug={tipo}
        canvasId={canvasId}
        soloLectura={!puedeEditar}
        elDocumento={t?.conArticulo ?? "el documento"}
        ejemplo="Ej.: enfócate en el equipo de Marketing; no incluyas lo de la fase 2."
      />
    </div>
  );
}
