"use client";

/**
 * SumarAMano — sumar una sesión o un documento que no quedó en Meet ni en HubSpot.
 *
 * Pedido de Elías (2026-10-01): el vendedor pega el texto o sube un archivo (el resumen del
 * Smartflow, una minuta) y el agente lo lee igual que una transcripción: propone lo que salió, con la
 * frase que lo respalda, y el vendedor usa o descarta. Se guarda solo el texto, nunca el archivo.
 *
 * Desde el 2026-10-06 es la columna «Fuentes manuales» del «Contexto adicional» de la preventa: la
 * lista arriba, como las demás columnas, y el formulario detrás de «Sumar una sesión o un documento».
 */
import { useRef, useState } from "react";
import { Button, Input, Segmentado, Textarea, useToast } from "@/components/ui";
import { ContextColumnList, ContextRow, CTX_ICONS } from "@/components/clients/context-column";
import { conEspaciosComunes, diaConAnio, diaCorto } from "@/lib/exploraciones/fechas";
import { subirDirecto } from "@/lib/storage/subir-directo";
import { useLienzo } from "./contexto";
import { useCorrida } from "./useCorrida";

type Modo = "pegar" | "subir";

export default function SumarAMano({ abiertoAlInicio = false }: { abiertoAlInicio?: boolean } = {}) {
  const { exp, documentos, puedeEditar, recargar } = useLienzo();
  const { seguir, corriendo } = useCorrida();
  const toast = useToast();
  const [modo, setModo] = useState<Modo>("pegar");
  const [titulo, setTitulo] = useState("");
  const [fecha, setFecha] = useState("");
  const [texto, setTexto] = useState("");
  const [archivo, setArchivo] = useState<File | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [quitando, setQuitando] = useState<string | null>(null);
  const [formAbierto, setFormAbierto] = useState(abiertoAlInicio);
  const input = useRef<HTMLInputElement>(null);
  const leidos = new Set(exp.estado.propuesta.leidas.documentos);

  const listo = modo === "pegar" ? titulo.trim().length > 0 && texto.trim().length >= 40 : !!archivo;

  async function sumar() {
    setEnviando(true);
    try {
      const ruta = `/api/sales/exploraciones/${exp.id}/documentos`;
      const extra = { ...(titulo.trim() ? { titulo: titulo.trim() } : {}), ...(fecha ? { fecha } : {}) };
      let data: { corrida?: { yaCorria: boolean } | null };
      if (modo === "pegar") {
        const res = await fetch(ruta, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...extra, texto }) });
        const r = (await res.json().catch(() => ({}))) as { error?: string; corrida?: { yaCorria: boolean } | null };
        if (!res.ok) {
          toast.error(r.error ?? "No se pudo sumar.");
          return;
        }
        data = r;
      } else {
        // Directo a Supabase: el nginx del VPS corta todo cuerpo de más de 1 MB (lib/storage/subida-directa.ts).
        const r = await subirDirecto<{ corrida?: { yaCorria: boolean } | null }>({ ruta, archivo: archivo as File, extra });
        if (!r.ok) {
          toast.error(r.error);
          return;
        }
        data = r.data;
      }
      setTitulo("");
      setFecha("");
      setTexto("");
      setArchivo(null);
      if (input.current) input.current.value = "";
      setFormAbierto(false);
      await recargar();
      if (data.corrida && !data.corrida.yaCorria) {
        toast.info("Listo: el agente lo está leyendo.");
        void seguir();
      } else {
        toast.info("Listo. El agente está ocupado: léelo con «Leer la última reunión» cuando termine.");
      }
    } catch {
      toast.error("No se pudo sumar. Revisa tu conexión.");
    } finally {
      setEnviando(false);
    }
  }

  async function quitar(id: string) {
    setQuitando(id);
    try {
      const res = await fetch(`/api/sales/exploraciones/${exp.id}/documentos/${id}`, { method: "DELETE" });
      if (!res.ok) toast.error("No se pudo quitar.");
      await recargar();
    } finally {
      setQuitando(null);
    }
  }

  const formulario = (
    <div className="space-y-3 rounded-xl border border-line bg-surface p-3">
      <Segmentado<Modo>
        etiqueta="Cómo sumarlo"
        opciones={[
          { clave: "pegar", etiqueta: "Pegar el texto" },
          { clave: "subir", etiqueta: "Subir un archivo" },
        ]}
        valor={modo}
        onCambio={setModo}
      />
      <div className="grid gap-3 sm:grid-cols-[1fr_11rem]">
        <Input
          value={titulo}
          onChange={(e) => setTitulo(e.target.value)}
          placeholder={modo === "pegar" ? "De qué es (por ejemplo, Llamada de Gong con Ana)" : "De qué es (si no, el nombre del archivo)"}
          aria-label="De qué es"
          maxLength={120}
        />
        <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} aria-label="Fecha de la sesión (si es una sesión)" title="Fecha de la sesión, si es una sesión" />
      </div>
      {modo === "pegar" ? (
        <Textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={6} placeholder="Pega aquí la transcripción, el resumen o las notas." aria-label="El texto" />
      ) : (
        <input
          ref={input}
          type="file"
          accept=".pdf,.docx,.pptx,.xlsx,.txt,.csv"
          onChange={(e) => setArchivo(e.target.files?.[0] ?? null)}
          className="block w-full text-sm text-fg-secondary file:mr-3 file:rounded-lg file:border file:border-line file:bg-surface-hover file:px-3 file:py-1.5 file:text-sm file:text-fg"
          aria-label="El archivo"
        />
      )}
      <div className="flex items-center justify-between gap-3">
        <p className="text-2xs text-fg-muted">
          {modo === "subir" ? "PDF, Word, Excel, PowerPoint o texto, hasta 10 MB. Se guarda solo el texto; el archivo se borra." : "Al menos unas líneas: el agente necesita de dónde sacar."}
        </p>
        <Button size="sm" variant="primary" loading={enviando} disabled={!listo || corriendo} onClick={() => void sumar()}>
          Sumar y que el agente lo lea
        </Button>
      </div>
    </div>
  );

  // Igual que la columna de Reuniones: la lista arriba y el enlace al pie, a la misma altura (Elías, 2026-10-07).
  return (
    <div className="flex flex-1 flex-col gap-2">
      <ContextColumnList empty="Nada sumado. Una llamada de Gong, una minuta o el resumen del Smartflow: súmalo y el agente lo lee como una transcripción.">
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
      {puedeEditar &&
        (formAbierto ? (
          formulario
        ) : (
          <button type="button" onClick={() => setFormAbierto(true)} className="mt-auto self-start text-[11px] font-semibold text-brand transition-colors hover:text-brand-dark">
            + Sumar una sesión o un documento
          </button>
        ))}
    </div>
  );
}
