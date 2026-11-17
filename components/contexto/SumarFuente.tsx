"use client";

/**
 * components/contexto/SumarFuente.tsx — «Sumar una sesión o un documento», el formulario de la columna
 * «Fuentes manuales» de todo «Contexto adicional» (2026-10-07).
 *
 * Salió de la preventa (`SumarAMano`) para que el cronograma, los documentos del proyecto, el handoff y
 * la propuesta tengan el MISMO formulario: pegar el texto o subir un archivo, con de qué es y su fecha.
 * Dónde se guarda lo decide cada pieza (`alPegar` / `alSubir`); este componente solo pide los datos.
 *
 * Un archivo subido acá queda además en Información del cliente › Documentos, a nivel de empresa: lo
 * hace la ruta de cada pieza, no este formulario. Por eso la nota lo dice.
 */
import { useRef, useState } from "react";
import { Button, Input, Segmentado, Textarea } from "@/components/ui";
import { BotonTexto } from "@/components/ui/sistema";
import EnlaceDeContexto from "./EnlaceDeContexto";

type Modo = "pegar" | "subir";

export type DatosPegados = { titulo: string; fecha: string | null; texto: string };
export type DatosSubidos = { archivo: File; titulo: string | null; fecha: string | null };

/** Lo que se acepta subir (lo mismo en todas las piezas: lo que saca texto `extractText`). */
export const ACEPTA_AL_SUBIR = ".pdf,.docx,.pptx,.xlsx,.txt,.csv";

/** «12 sept 2026» (o «12 sept» sin el año), en la hora de Costa Rica. Una fecha sin hora es ese día. */
export function fechaDeLaFuente(v: string, conAnio = true): string {
  const d = /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(`${v}T12:00:00-06:00`) : new Date(v);
  if (Number.isNaN(d.getTime())) return v;
  return d
    .toLocaleDateString("es-CR", { day: "numeric", month: "short", ...(conAnio ? { year: "numeric" } : {}), timeZone: "America/Costa_Rica" })
    .replace(/[\u00a0\u202f\u2007\u2009]/g, " ");
}

/**
 * El título con la fecha adentro, para las piezas cuya fuente no tiene campo de fecha (el cronograma, el
 * handoff, los documentos): el agente lee la fecha de los hechos en el título.
 */
export function tituloConFecha(titulo: string | null, fecha: string | null): string | null {
  const t = titulo?.trim() || null;
  if (!fecha) return t;
  const dia = fechaDeLaFuente(fecha);
  return t ? `${t} — ${dia}` : `Sesión del ${dia}`;
}

const conEspacios = (n: number) => n.toLocaleString("es-CR").replace(/[  ]/g, " ");

export default function SumarFuente({
  alPegar,
  alSubir,
  abiertoAlInicio = false,
  boton = "Sumar",
  tituloObligatorio = false,
  minimo = 1,
  ocupado = false,
  notaAlPegar = "Lo que no quedó en ninguna reunión: una minuta, un correo, una decisión. Con la fecha, si es de una sesión.",
  deLaSesion,
  leeHasta,
  tope,
}: {
  /**
   * Es la reunión de una sesión que ya existe: su nombre y su fecha se usan en vez de pedirlos otra vez (Elías,
   * 2026-11-17). Sin fecha, se pide.
   */
  deLaSesion?: { titulo: string; fecha: string | null };
  /** Cuánto lee el agente: pasado eso se avisa que se guarda el principio y el final. */
  leeHasta?: number;
  /** Lo más largo que se acepta pegar. */
  tope?: number;
  /** Guarda lo pegado. Devuelve el error para mostrar, o null si salió bien. */
  alPegar: (d: DatosPegados) => Promise<string | null>;
  /** Sube el archivo. Devuelve el error para mostrar, o null si salió bien. */
  alSubir: (d: DatosSubidos) => Promise<string | null>;
  abiertoAlInicio?: boolean;
  /** El texto del botón azul. */
  boton?: string;
  /** Si «De qué es» hace falta para pegar (la preventa lo pide: es el nombre de la sesión). */
  tituloObligatorio?: boolean;
  /** Caracteres mínimos del texto pegado. */
  minimo?: number;
  /** Un agente trabajando: no se suma hasta que termine. */
  ocupado?: boolean;
  notaAlPegar?: string;
}) {
  const [abierto, setAbierto] = useState(abiertoAlInicio);
  const [modo, setModo] = useState<Modo>("pegar");
  const [titulo, setTitulo] = useState("");
  const [fecha, setFecha] = useState("");
  const [texto, setTexto] = useState("");
  const [archivo, setArchivo] = useState<File | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const fechaDeLaSesion = deLaSesion?.fecha && /^\d{4}-\d{2}-\d{2}$/.test(deLaSesion.fecha) ? deLaSesion.fecha : null;
  const largo = texto.trim().length;
  const pasaDelTope = modo === "pegar" && !!tope && largo > tope;
  const faltaElTitulo = tituloObligatorio && !deLaSesion && titulo.trim().length === 0;
  const listo = modo === "pegar" ? !faltaElTitulo && largo >= minimo && !pasaDelTope : !!archivo;
  // Por qué el botón no se puede usar todavía, dicho (antes quedaba apagado sin explicación).
  const porQueNo =
    modo !== "pegar" || !largo ? null : faltaElTitulo ? "Escribe de qué es." : largo < minimo ? null : pasaDelTope ? "Es demasiado largo: pega una parte." : null;

  const limpiar = () => {
    setTitulo("");
    setFecha("");
    setTexto("");
    setArchivo(null);
    setError(null);
    if (input.current) input.current.value = "";
  };

  async function sumar() {
    setEnviando(true);
    setError(null);
    try {
      const t = titulo.trim() || deLaSesion?.titulo.trim() || "";
      const f = fecha || fechaDeLaSesion;
      const e =
        modo === "pegar"
          ? await alPegar({ titulo: t, fecha: f, texto: texto.trim() })
          : await alSubir({ archivo: archivo as File, titulo: t || null, fecha: f });
      if (e) {
        setError(e);
        return;
      }
      limpiar();
      setAbierto(false);
    } catch {
      setError("No se pudo sumar. Revisa tu conexión.");
    } finally {
      setEnviando(false);
    }
  }

  if (!abierto) return <EnlaceDeContexto onClick={() => setAbierto(true)}>Sumar una sesión o un documento</EnlaceDeContexto>;

  return (
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
      {deLaSesion ? (
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-sm text-fg-secondary">
            Es de la sesión <span className="font-semibold text-fg">«{deLaSesion.titulo}»</span>
            {fechaDeLaSesion ? ` del ${fechaDeLaFuente(fechaDeLaSesion)}` : ""}.
          </p>
          {!fechaDeLaSesion && (
            <Input
              type="date"
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
              aria-label="Fecha de la sesión"
              title="Fecha de la sesión"
              className="w-44"
            />
          )}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-[1fr_11rem]">
          <Input
            value={titulo}
            onChange={(e) => setTitulo(e.target.value)}
            placeholder={modo === "pegar" ? "De qué es (por ejemplo, Llamada de Gong con Ana)" : "De qué es (si no, el nombre del archivo)"}
            aria-label="De qué es"
            maxLength={120}
          />
          <Input
            type="date"
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
            aria-label="Fecha de la sesión (si es una sesión)"
            title="Fecha de la sesión, si es una sesión"
          />
        </div>
      )}
      {modo === "pegar" ? (
        <>
          <Textarea
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            rows={6}
            placeholder="Pega aquí la transcripción, el resumen o las notas."
            aria-label="El texto"
          />
          {leeHasta && largo > leeHasta && !pasaDelTope && (
            <p role="status" className="rounded-lg border border-warn-line bg-warn-surface px-3 py-2 text-xs leading-[18px] text-warn-ink">
              Tiene {conEspacios(largo)} caracteres y el agente lee hasta {conEspacios(leeHasta)}. Se guarda el principio y el final, y se quita un
              tramo del medio (unos {conEspacios(largo - leeHasta)} caracteres).
            </p>
          )}
        </>
      ) : (
        <input
          ref={input}
          type="file"
          accept={ACEPTA_AL_SUBIR}
          onChange={(e) => setArchivo(e.target.files?.[0] ?? null)}
          className="block w-full text-sm text-fg-secondary file:mr-3 file:rounded-lg file:border file:border-line file:bg-surface-hover file:px-3 file:py-1.5 file:text-sm file:text-fg"
          aria-label="El archivo"
        />
      )}
      {error && <p className="whitespace-pre-line text-xs text-danger-ink">{error}</p>}
      {!error && porQueNo && <p className="text-xs text-warn-ink">{porQueNo}</p>}
      <div className="flex items-center justify-between gap-3">
        <p className="text-2xs text-fg-muted">
          {modo === "subir"
            ? "PDF, Word, Excel, PowerPoint o texto, hasta 10 MB. El archivo queda en Información del cliente › Documentos."
            : notaAlPegar}
        </p>
        <div className="flex flex-none items-center gap-1">
          <BotonTexto
            onClick={() => {
              limpiar();
              setAbierto(false);
            }}
          >
            Cancelar
          </BotonTexto>
          <Button size="sm" variant="primary" loading={enviando} disabled={!listo || ocupado} onClick={() => void sumar()}>
            {boton}
          </Button>
        </div>
      </div>
    </div>
  );
}
