"use client";

/**
 * components/escala/comentarios/SelectorDeCliente.tsx — «¿con qué cliente no calza?».
 *
 * Busca entre los clientes que la persona ve en Nexus (la lista se pide una vez, al enfocar), sin
 * tildes ni mayúsculas. Si el caso es un prospecto que no está en Nexus, se escribe el nombre.
 * La lista va EN LÍNEA debajo del campo (no flotante): vive dentro del panel lateral.
 */
import { useId, useMemo, useState } from "react";
import { cn } from "@/lib/cn";
import { coincideBusqueda } from "@/lib/ui/text-search";
import type { ClienteParaElegir } from "./almacen";

export type ClienteElegido = { id: string | null; nombre: string } | null;

const CATEGORIA: Record<string, string> = { CLIENTE: "cliente", PROSPECTO: "prospecto", ALIADO: "aliado", INTERNO: "interno" };

export default function SelectorDeCliente({
  valor,
  onCambio,
  cargar,
}: {
  valor: ClienteElegido;
  onCambio: (c: ClienteElegido) => void;
  cargar: () => Promise<ClienteParaElegir[]>;
}) {
  const id = useId();
  const [clientes, setClientes] = useState<ClienteParaElegir[] | null>(null);
  const [error, setError] = useState(false);
  const [texto, setTexto] = useState("");
  const [abierto, setAbierto] = useState(false);
  const [activo, setActivo] = useState(0);

  const pedir = () => {
    if (clientes || error) return;
    cargar()
      .then(setClientes)
      .catch(() => setError(true));
  };

  const opciones = useMemo(() => {
    const q = texto.trim();
    const encontrados = (clientes ?? []).filter((c) => !q || coincideBusqueda(c.nombre, q)).slice(0, 8);
    const out: { clave: string; nombre: string; detalle: string; elegir: ClienteElegido }[] = encontrados.map((c) => ({
      clave: c.id,
      nombre: c.nombre,
      detalle: CATEGORIA[c.categoria] ?? c.categoria.toLowerCase(),
      elegir: { id: c.id, nombre: c.nombre },
    }));
    if (q) out.push({ clave: "__libre", nombre: `No está en Nexus: usar «${q}»`, detalle: "", elegir: { id: null, nombre: q } });
    return out;
  }, [clientes, texto]);

  if (valor) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-lg border border-line bg-surface-muted px-3 py-2">
        <span className="min-w-0 truncate text-sm text-fg">
          {valor.nombre}
          {!valor.id && <span className="ml-1.5 text-2xs text-fg-muted">(no está en Nexus)</span>}
        </span>
        <button type="button" onClick={() => onCambio(null)} className="text-xs text-fg-muted hover:text-fg">
          Cambiar
        </button>
      </div>
    );
  }

  const elegir = (i: number) => {
    const o = opciones[i];
    if (!o) return;
    onCambio(o.elegir);
    setTexto("");
    setAbierto(false);
  };

  return (
    <div>
      <input
        type="text"
        role="combobox"
        aria-expanded={abierto && opciones.length > 0}
        aria-controls={`${id}-lista`}
        aria-activedescendant={abierto && opciones[activo] ? `${id}-${activo}` : undefined}
        aria-label="Buscar el cliente"
        placeholder="Busca el cliente por su nombre"
        value={texto}
        onFocus={() => {
          pedir();
          setAbierto(true);
        }}
        onChange={(e) => {
          setTexto(e.target.value);
          setActivo(0);
          setAbierto(true);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActivo((a) => Math.min(opciones.length - 1, a + 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActivo((a) => Math.max(0, a - 1));
          } else if (e.key === "Enter") {
            e.preventDefault();
            elegir(activo);
          } else if (e.key === "Escape") {
            setAbierto(false);
          }
        }}
        className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-fg placeholder:text-fg-muted focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30"
      />
      {abierto && (
        <ul id={`${id}-lista`} role="listbox" aria-label="Clientes" className="mt-1 max-h-56 overflow-auto rounded-lg border border-line bg-surface">
          {!clientes && !error && <li className="px-3 py-2 text-xs text-fg-muted">Cargando los clientes…</li>}
          {error && <li className="px-3 py-2 text-xs text-danger-ink">No pude cargar los clientes. Escribe el nombre.</li>}
          {opciones.map((o, i) => (
            <li
              key={o.clave}
              id={`${id}-${i}`}
              role="option"
              aria-selected={i === activo}
              onMouseDown={(e) => {
                e.preventDefault();
                elegir(i);
              }}
              onMouseEnter={() => setActivo(i)}
              className={cn(
                "flex cursor-pointer items-center justify-between gap-2 px-3 py-1.5 text-sm",
                i === activo ? "bg-surface-hover" : "",
                o.clave === "__libre" ? "border-t border-line text-info-ink" : "text-fg",
              )}
            >
              <span className="min-w-0 truncate">{o.nombre}</span>
              {o.detalle && <span className="text-2xs text-fg-muted">{o.detalle}</span>}
            </li>
          ))}
          {clientes && opciones.length === 0 && <li className="px-3 py-2 text-xs text-fg-muted">Escribe para buscar.</li>}
        </ul>
      )}
    </div>
  );
}
