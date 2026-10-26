"use client";

/**
 * SugerenciasDeAsociacion — arriba del lienzo, la pregunta de K5 (2026-10-27): «¿Es la sesión 2 con Marketing?».
 *
 * Cada minuto mientras la pestaña está a la vista (y al volver a ella) pide GET …/asociar: las reuniones recientes de la
 * empresa que calzan con una sesión planeada (lib/exploraciones/asociar.ts) y la huella del lienzo. Si la huella cambió
 * (entró una reunión a una sesión, el agente leyó una, otra persona cambió algo), el lienzo se vuelve a leer solo: ya no
 * hace falta recargar la página (K5 etapa 3).
 *
 * «Sí» une la reunión a esa sesión por la misma puerta de «+ Agregar sesión» (POST …/sesiones); «No» la deja de sugerir
 * (`descartarAsociacion`). Lo que no tiene duda lo une solo el job `exploraciones-asociar`; mientras tanto se muestra con
 * «Sin dudas para Nexus», y «No» lo frena (el job lo vuelve a mirar con la fila bloqueada).
 *
 * Lo que unió Nexus solo en la última semana (`SesionPlaneada.asociadaSola`) se dice acá, con «Deshacer»: suelta la reunión
 * de la sesión y no la vuelve a sugerir.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useToast } from "@/components/ui";
import type { SugerenciaDeAsociacion } from "@/lib/exploraciones/asociar";
import { diaConSemana } from "@/lib/exploraciones/fechas";
import { useLienzo } from "./contexto";
import { BotonAzul, BotonTexto } from "./FranjaDeSugerencias";
import { FilaSugerida } from "@/components/ui/sistema";

/** Cada cuánto se mira, con la pestaña a la vista. */
const CADA_MS = 60_000;

/** Cuánto tiempo se avisa lo que unió Nexus solo. */
const DIAS_DEL_AVISO = 7;

export default function SugerenciasDeAsociacion() {
  const { exp, puedeEditar, recargar, cambiar, guardando, reuniones } = useLienzo();
  const toast = useToast();
  const [sugerencias, setSugerencias] = useState<SugerenciaDeAsociacion[]>([]);
  const [decidiendo, setDecidiendo] = useState<string | null>(null);
  const huella = useRef<string | null>(null);
  const ocupado = useRef(false);
  useEffect(() => {
    ocupado.current = guardando || decidiendo !== null;
  }, [guardando, decidiendo]);
  const id = exp.id;
  const archivada = exp.estado.archivada;

  const mirar = useCallback(async () => {
    try {
      const res = await fetch(`/api/sales/exploraciones/${id}/asociar`);
      if (!res.ok) return;
      const data = (await res.json().catch(() => ({}))) as { sugerencias?: SugerenciaDeAsociacion[]; huella?: string | null };
      setSugerencias(data.sugerencias ?? []);
      const nueva = data.huella ?? null;
      // La primera vez solo se anota; después, si cambió y nadie está guardando, el lienzo se pone al día.
      if (nueva && huella.current && nueva !== huella.current && !ocupado.current) void recargar();
      if (nueva) huella.current = nueva;
    } catch {
      /* sin red: la próxima vuelta lo intenta de nuevo */
    }
  }, [id, recargar]);

  useEffect(() => {
    if (archivada) return;
    void mirar();
    const intervalo = window.setInterval(() => {
      if (document.visibilityState === "visible") void mirar();
    }, CADA_MS);
    const alVolver = () => {
      if (document.visibilityState === "visible") void mirar();
    };
    document.addEventListener("visibilitychange", alVolver);
    return () => {
      window.clearInterval(intervalo);
      document.removeEventListener("visibilitychange", alVolver);
    };
  }, [mirar, archivada]);

  const si = async (s: SugerenciaDeAsociacion) => {
    setDecidiendo(s.reunion.id);
    try {
      const res = await fetch(`/api/sales/exploraciones/${id}/sesiones`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tipo: "pasada", sessionId: s.reunion.id, origen: "meet", ...(s.sesion ? { paraSesionId: s.sesion.id } : {}) }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        toast.error(data.error ?? "No se pudo unir la reunión.");
        return;
      }
      setSugerencias((xs) => xs.filter((x) => x.reunion.id !== s.reunion.id));
      toast.success(s.sesion ? `Listo: «${s.reunion.titulo}» es la sesión ${s.sesion.numero}.` : `Listo: «${s.reunion.titulo}» es una sesión de la exploración.`);
      await recargar();
    } catch {
      toast.error("No se pudo unir la reunión. Revisa tu conexión.");
    } finally {
      setDecidiendo(null);
    }
  };

  const no = async (s: SugerenciaDeAsociacion) => {
    setDecidiendo(s.reunion.id);
    try {
      const ok = await cambiar([{ op: "descartarAsociacion", claves: [`meet:${s.reunion.id}`] }]);
      if (ok) setSugerencias((xs) => xs.filter((x) => x.reunion.id !== s.reunion.id));
    } finally {
      setDecidiendo(null);
    }
  };

  const desde = Date.now() - DIAS_DEL_AVISO * 24 * 60 * 60 * 1000;
  const unidasSolas = exp.estado.contenido.sesiones.filter((s) => s.asociadaSola && s.reunion?.origen === "meet" && Date.parse(s.asociadaSola) >= desde);

  const deshacer = async (sesionId: string) => {
    const s = exp.estado.contenido.sesiones.find((x) => x.id === sesionId);
    if (!s?.reunion) return;
    setDecidiendo(s.reunion.id);
    try {
      const sesiones = exp.estado.contenido.sesiones.map((x) => {
        if (x.id !== sesionId) return x;
        const { reunion: _r, asociadaSola: _a, ...resto } = x;
        void _r;
        void _a;
        return resto;
      });
      await cambiar([{ op: "sesiones", sesiones }, { op: "descartarAsociacion", claves: [`meet:${s.reunion.id}`] }], { exito: "Listo: la reunión ya no es de esa sesión." });
    } finally {
      setDecidiendo(null);
    }
  };

  if (archivada || (!sugerencias.length && !unidasSolas.length)) return null;
  return (
    <ul className="mb-5 flex flex-col gap-1.5" aria-label="Reuniones que pueden ser una sesión de la exploración">
      {unidasSolas.map((s) => {
        const r = reuniones.find((x) => x.origen === "meet" && x.id === s.reunion?.id);
        return (
          <FilaSugerida
            key={`sola-${s.id}`}
            encima="Nexus la unió sola"
            origen={<span className="min-w-0">Sin dudas: el título y la empresa calzaban con la sesión. Si no es, deshazlo.</span>}
            acciones={
              puedeEditar ? (
                <BotonTexto disabled={decidiendo !== null} onClick={() => void deshacer(s.id)}>
                  Deshacer
                </BotonTexto>
              ) : undefined
            }
          >
            <span className="font-medium text-fg">«{r?.titulo ?? s.titulo ?? "La reunión"}»</span>{" "}
            <span className="text-fg-secondary">es ahora {s.titulo ? `la sesión «${s.titulo}»` : "una sesión de la exploración"}.</span>
          </FilaSugerida>
        );
      })}
      {sugerencias.map((s) => (
        <FilaSugerida
          key={s.reunion.id}
          encima={s.sola ? "Sin dudas para Nexus" : undefined}
          origen={
            <span className="min-w-0" title={s.dudas.length ? `Te pregunto porque: ${s.dudas.join(" ")}` : undefined}>
              {s.porque}
              {s.dudas.length > 0 && <span className="text-fg-muted"> Te pregunto porque: {s.dudas[0].charAt(0).toLowerCase() + s.dudas[0].slice(1)}</span>}
            </span>
          }
          acciones={
            puedeEditar ? (
              <>
                <BotonTexto disabled={decidiendo !== null} onClick={() => void no(s)} title="Nexus no la vuelve a sugerir">
                  No
                </BotonTexto>
                <BotonAzul disabled={decidiendo !== null} onClick={() => void si(s)}>
                  {decidiendo === s.reunion.id ? "Uniendo…" : "Sí"}
                </BotonAzul>
              </>
            ) : undefined
          }
        >
          <span className="font-medium text-fg">{s.pregunta}</span>{" "}
          <span className="text-fg-secondary">
            «{s.reunion.titulo}» · {diaConSemana(s.reunion.fecha)}
          </span>
        </FilaSugerida>
      ))}
    </ul>
  );
}
