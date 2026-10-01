"use client";

/**
 * LienzoDeExploracion — el lienzo de la exploración de venta de una empresa.
 *
 * Es un PROCESO, no un formulario: arriba, una sola indicación de qué sigue; abajo, los cinco pasos
 * (preparación, las dos reuniones, lo que quedó, la propuesta y el traspaso). Lo que propuso el
 * agente aparece en el lugar de cada casilla, para usarlo o descartarlo mirando lo que ya está.
 */
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useRef, useState } from "react";
import { AgentProposal } from "@/components/ai/AgentProposal";
import { Alert, Tabs, useToast } from "@/components/ui";
import type { Letra } from "@/lib/escala/documento/tipos";
import { listaParaProponer, queSigue } from "@/lib/exploraciones/calidad";
import {
  aplicarOperaciones,
  propuestaVigente,
  VALIDADOR_LIBRE,
  type DestinoDePropuesta,
  type Operacion,
  type Validez,
} from "@/lib/exploraciones/contenido";
import { idsDeLaEscala, type EscalaDelLienzo } from "@/lib/exploraciones/escala-del-lienzo";
import type { ExploracionParaLaPantalla } from "@/lib/exploraciones/servidor";
import { calcularChequeo } from "@/lib/escala/chequeo";
import { LienzoContexto, type Lienzo, type OpcionesDeCambio } from "./contexto";
import PasoPreparacion from "./PasoPreparacion";
import PasoPropuesta from "./PasoPropuesta";
import PasoQuedo from "./PasoQuedo";
import PasoReuniones from "./PasoReuniones";
import PasoTraspaso from "./PasoTraspaso";

type Paso = "preparacion" | "reuniones" | "quedo" | "propuesta" | "traspaso";

export default function LienzoDeExploracion({
  inicial,
  escala,
  puedeEditar,
}: {
  inicial: ExploracionParaLaPantalla;
  escala: EscalaDelLienzo;
  puedeEditar: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [exp, setExp] = useState(inicial);
  const [sinLeer, setSinLeer] = useState(inicial.sinLeer ?? []);
  const [guardando, setGuardando] = useState(false);
  const [paso, setPaso] = useState<Paso>("preparacion");

  /* Lo último que confirmó el servidor, y la fila de pedidos: cada uno sale con la versión que dejó
     el anterior. */
  const confirmada = useRef(inicial);
  const cola = useRef<Promise<unknown>>(Promise.resolve());

  /* Un `router.refresh()` (cambió la edición o el perfil) trae una fila más nueva: se adopta. */
  const [vistaDe, setVistaDe] = useState(inicial.actualizadaEn);
  if (vistaDe !== inicial.actualizadaEn) {
    setVistaDe(inicial.actualizadaEn);
    setExp(inicial);
    if (inicial.sinLeer) setSinLeer(inicial.sinLeer);
    confirmada.current = inicial;
  }

  const validez = useMemo<Validez>(() => {
    const ids = idsDeLaEscala(escala);
    return {
      dimensiones: ids.dimensiones,
      criterios: ids.criterios,
      areas: new Set(escala.areas.map((a) => a.id)),
      ediciones: new Set(escala.ediciones.map((e) => e.slug)),
      escalaVersion: escala.version,
    };
  }, [escala]);

  const enviar = useCallback(
    async (ops: Operacion[], opciones: OpcionesDeCambio = {}): Promise<boolean> => {
      const base = confirmada.current;
      setGuardando(true);
      try {
        const res = await fetch(`/api/sales/exploraciones/${base.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ version: base.version, operaciones: ops }),
        });
        const data = (await res.json().catch(() => ({}))) as { exploracion?: ExploracionParaLaPantalla; error?: string };
        if (data.exploracion) {
          confirmada.current = data.exploracion;
          setExp(data.exploracion);
        } else {
          setExp(confirmada.current);
        }
        if (!res.ok) {
          toast.error(data.error ?? "No se pudo guardar.");
          return false;
        }
        if (opciones.refrescar) router.refresh();
        if (opciones.exito) toast.success(opciones.exito);
        return true;
      } catch {
        setExp(confirmada.current);
        toast.error("No se pudo guardar. Revisa tu conexión.");
        return false;
      } finally {
        setGuardando(false);
      }
    },
    [router, toast],
  );

  const cambiar = useCallback(
    (ops: Operacion[], opciones?: OpcionesDeCambio): Promise<boolean> => {
      // En pantalla primero, con la misma regla que aplica el servidor.
      setExp((actual) => {
        const r = aplicarOperaciones(actual.estado, ops, validez, VALIDADOR_LIBRE);
        return r.ok ? { ...actual, estado: r.estado } : actual;
      });
      const p = cola.current.then(() => enviar(ops, opciones));
      cola.current = p.catch(() => undefined);
      return p;
    },
    [enviar, validez],
  );

  const recargar = useCallback((): Promise<void> => {
    const p = cola.current.then(async () => {
      try {
        const res = await fetch(`/api/sales/exploraciones/${confirmada.current.id}`);
        const data = (await res.json().catch(() => ({}))) as { exploracion?: ExploracionParaLaPantalla };
        if (data.exploracion) {
          confirmada.current = data.exploracion;
          setExp(data.exploracion);
          if (data.exploracion.sinLeer) setSinLeer(data.exploracion.sinLeer);
        }
      } catch {
        /* se queda con lo que tiene: el próximo cambio trae lo último */
      }
    });
    cola.current = p;
    return p;
  }, []);

  const chequeo = useMemo(() => {
    const areas = exp.estado.areas
      .map((id) => escala.areas.find((a) => a.id === id)?.paraChequeo)
      .filter((a): a is NonNullable<typeof a> => !!a);
    const estimados = Object.fromEntries(
      Object.entries(exp.estado.contenido.chequeo).map(([id, e]) => [id, { nivel: e.nivel, riesgoALaVista: !!e.riesgo }]),
    );
    return calcularChequeo(areas, estimados);
  }, [exp.estado, escala]);

  const pendientes = useMemo(() => propuestaVigente(exp.estado), [exp.estado]);
  const pendientesPara = useCallback((filtro: (d: DestinoDePropuesta) => boolean) => pendientes.filter((it) => filtro(it.destino)), [pendientes]);
  const nombreDeNivel = useCallback((l: Letra) => escala.niveles.find((n) => n.letra === l)?.nombre ?? l, [escala]);

  const lienzo: Lienzo = { exp, escala, chequeo, pendientes, sinLeer, puedeEditar, guardando, cambiar, recargar, nombreDeNivel, pendientesPara };

  const puntos = listaParaProponer(exp.estado, chequeo);
  const sigue = queSigue(exp.estado, chequeo, sinLeer);
  const enPrep = pendientes.filter((p) => ["edicion", "perfil", "area", "aExplorar"].includes(p.destino.tipo) || (p.destino.tipo === "casilla" && ["contexto", "hubspotActual", "hipotesis"].includes(p.destino.clave))).length;
  const enQuedo = pendientes.length - enPrep;

  const pasos: { key: Paso; label: string; count?: number }[] = [
    { key: "preparacion", label: "Preparación", count: enPrep || undefined },
    { key: "reuniones", label: "Reuniones" },
    { key: "quedo", label: "Lo que quedó", count: enQuedo || undefined },
    { key: "propuesta", label: `Propuesta · ${puntos.filter((p) => p.cumplido).length}/${puntos.length}` },
    { key: "traspaso", label: "Traspaso" },
  ];

  return (
    <LienzoContexto.Provider value={lienzo}>
      <div className="space-y-5">
        <Alert variant="info" title="Qué sigue">
          {sigue}
        </Alert>

        {pendientes.length > 0 && puedeEditar && (
          <AgentProposal
            title={`Hay ${pendientes.length} ${pendientes.length === 1 ? "propuesta" : "propuestas"} para revisar`}
            subtitle="Están en su lugar, en cada paso. Úsalas o descártalas mirando lo que ya está; nada se confirma solo."
            applyLabel="Usar todas"
            discardLabel="Descartar todas"
            applying={guardando}
            onApply={() => void cambiar(pendientes.map((it) => ({ op: "usar" as const, itemId: it.id })), { refrescar: pendientes.some((it) => it.destino.tipo === "edicion" || it.destino.tipo === "perfil") })}
            onDiscard={() => void cambiar([{ op: "descartar", itemIds: pendientes.map((it) => it.id) }])}
          />
        )}

        <Tabs<Paso> aria-label="Pasos de la exploración" value={paso} onChange={setPaso} items={pasos} />

        {paso === "preparacion" && <PasoPreparacion />}
        {paso === "reuniones" && <PasoReuniones />}
        {paso === "quedo" && <PasoQuedo />}
        {paso === "propuesta" && <PasoPropuesta />}
        {paso === "traspaso" && <PasoTraspaso />}
      </div>
    </LienzoContexto.Provider>
  );
}
