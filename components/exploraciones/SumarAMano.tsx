"use client";

/**
 * SumarAMano — sumar una sesión o un documento que no quedó en Meet ni en HubSpot.
 *
 * Pedido de Elías (2026-10-01): el vendedor pega el texto o sube un archivo (el resumen del
 * Smartflow, una minuta) y el agente lo lee igual que una transcripción: propone lo que salió, con la
 * frase que lo respalda, y el vendedor usa o descarta.
 *
 * Desde el 2026-10-06 es la columna «Fuentes manuales» del «Contexto adicional» de la preventa: la
 * lista arriba, como las demás columnas, y el formulario detrás de «Sumar una sesión o un documento».
 * Desde el 2026-10-07 el formulario es el de todo «Contexto adicional» (`SumarFuente`), y el archivo ya
 * no se borra: queda en Información del cliente › Documentos, a nivel de empresa.
 *
 * Desde la etapa A (2026-10-09) vive en la página de inicio de Exploración (y en el «Contexto adicional»
 * de Preparación). Con `paraSesionId` («sumar la minuta» de una sesión que terminó sin transcripción),
 * lo sumado pasa a ser la reunión de ESA sesión, sin quedar como sesión suelta.
 */
import { useState } from "react";
import { useToast } from "@/components/ui";
import { ContextColumnList, ContextRow, CTX_ICONS } from "@/components/clients/context-column";
import { VACIO_DE_LAS_FUENTES } from "@/components/clients/FuentesManualesColumn";
import SumarFuente, { type DatosPegados, type DatosSubidos } from "@/components/contexto/SumarFuente";
import { conEspaciosComunes, diaConAnio, diaCorto } from "@/lib/exploraciones/fechas";
import { subirDirecto } from "@/lib/storage/subir-directo";
import { useLienzo } from "./contexto";
import { useCorrida } from "./useCorrida";

type Respuesta = { id?: string; corrida?: { yaCorria: boolean } | null };

export default function SumarAMano({
  abiertoAlInicio = false,
  paraSesionId,
  sinVacio = false,
  sinLista = false,
}: {
  abiertoAlInicio?: boolean;
  /** La sesión de la que es la minuta: lo sumado pasa a ser su reunión. */
  paraSesionId?: string;
  /** Sin documentos, no dice nada (quien la monta ya lo explica). */
  sinVacio?: boolean;
  /** Solo el formulario, sin la lista de lo sumado. */
  sinLista?: boolean;
} = {}) {
  const { exp, documentos, puedeEditar, recargar, cambiar } = useLienzo();
  const { seguir, corriendo } = useCorrida();
  const toast = useToast();
  const [quitando, setQuitando] = useState<string | null>(null);
  const leidos = new Set(exp.estado.propuesta.leidas.documentos);
  const ruta = `/api/sales/exploraciones/${exp.id}/documentos`;

  async function alListo(data: Respuesta) {
    // La minuta de una sesión: lo sumado pasa a ser su reunión (antes de releer, sobre las sesiones que se ven).
    if (paraSesionId && data.id) {
      const id = data.id;
      const sesiones = exp.estado.contenido.sesiones;
      if (sesiones.some((s) => s.id === paraSesionId)) {
        await cambiar([{ op: "sesiones", sesiones: sesiones.map((s) => (s.id === paraSesionId ? { ...s, reunion: { origen: "documento" as const, id } } : s)) }]);
      }
    }
    await recargar();
    if (data.corrida && !data.corrida.yaCorria) {
      toast.info("Listo: el agente lo está leyendo.");
      void seguir();
    } else {
      toast.info("Listo. El agente está ocupado: léelo con «Leer la última reunión» cuando termine.");
    }
  }

  async function alPegar(d: DatosPegados): Promise<string | null> {
    const res = await fetch(ruta, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ titulo: d.titulo, texto: d.texto, ...(d.fecha ? { fecha: d.fecha } : {}) }),
    });
    const r = (await res.json().catch(() => ({}))) as Respuesta & { error?: string };
    if (!res.ok) return r.error ?? "No se pudo sumar.";
    await alListo(r);
    return null;
  }

  async function alSubir(d: DatosSubidos): Promise<string | null> {
    // Directo a Supabase: el nginx del VPS corta todo cuerpo de más de 1 MB (lib/storage/subida-directa.ts).
    const extra = { ...(d.titulo ? { titulo: d.titulo } : {}), ...(d.fecha ? { fecha: d.fecha } : {}) };
    const r = await subirDirecto<Respuesta>({ ruta, archivo: d.archivo, extra });
    if (!r.ok) return r.error;
    await alListo(r.data);
    return null;
  }

  async function quitar(id: string) {
    setQuitando(id);
    try {
      const res = await fetch(`${ruta}/${id}`, { method: "DELETE" });
      if (!res.ok) toast.error("No se pudo quitar.");
      await recargar();
    } finally {
      setQuitando(null);
    }
  }

  // Igual que la columna de Reuniones: la lista arriba y el enlace al pie, a la misma altura (Elías, 2026-10-07).
  return (
    <div className="flex flex-1 flex-col gap-2">
      {!sinLista && !(sinVacio && documentos.length === 0) && (
        <ContextColumnList empty={VACIO_DE_LAS_FUENTES}>
          {documentos.map((d) => (
            <ContextRow
              key={d.id}
              icon={CTX_ICONS.note}
              meta={`${d.fecha ? `Sesión del ${diaConAnio(d.fecha)}` : `Sumado el ${diaCorto(d.creadoEn)}`}${d.nombreArchivo ? ` · ${d.nombreArchivo}` : " · pegado"}`}
              title={d.titulo}
              snippet={`${conEspaciosComunes(d.caracteres.toLocaleString("es-CR"))} caracteres`}
              badge={leidos.has(d.id) ? { label: "Leído", tone: "green" } : { label: "Sin leer", tone: "amber" }}
              onRemove={puedeEditar && quitando !== d.id ? () => void quitar(d.id) : undefined}
            />
          ))}
        </ContextColumnList>
      )}
      {puedeEditar && (
        <SumarFuente
          alPegar={alPegar}
          alSubir={alSubir}
          abiertoAlInicio={abiertoAlInicio}
          boton="Sumar y que el agente lo lea"
          tituloObligatorio
          minimo={40}
          ocupado={corriendo}
          notaAlPegar="Al menos unas líneas: el agente necesita de dónde sacar."
        />
      )}
    </div>
  );
}
