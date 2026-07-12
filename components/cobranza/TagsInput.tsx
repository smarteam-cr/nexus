"use client";

/**
 * components/cobranza/TagsInput.tsx — input de tags con chips removibles + dropdown
 * de sugerencias por prefijo. Vocabulario ABIERTO: cada tag se normaliza a slug al
 * agregar con `normalizeGastoTag` (la MISMA función que usa el server → lo que ves
 * en el preview es lo que se guarda). Tope de 8 tags (espejo de `normalizeGastoTags`).
 * Presentacional: el estado de los tags vive en el form padre (value/onChange).
 */
import { useMemo, useState, type KeyboardEvent } from "react";
import { normalizeGastoTag } from "@/lib/cobranza/schema";
import { INPUT_CLS } from "./format";

const MAX_TAGS = 8;

export default function TagsInput({
  value,
  onChange,
  suggestions,
}: {
  value: string[];
  onChange: (tags: string[]) => void;
  suggestions: string[];
}) {
  const [text, setText] = useState("");
  const [focused, setFocused] = useState(false);

  const slug = normalizeGastoTag(text);
  const lleno = value.length >= MAX_TAGS;

  // Sugerencias por PREFIJO (case-insensitive), que no estén ya elegidas. Solo al escribir.
  const filtradas = useMemo(() => {
    const needle = text.trim().toLowerCase();
    if (needle === "") return [];
    return suggestions
      .filter((s) => !value.includes(s) && s.toLowerCase().startsWith(needle))
      .slice(0, 8);
  }, [suggestions, value, text]);

  function agregar(raw: string) {
    const n = normalizeGastoTag(raw);
    if (!n || value.includes(n) || value.length >= MAX_TAGS) return;
    onChange([...value, n]);
    setText("");
  }

  function quitar(tag: string) {
    onChange(value.filter((t) => t !== tag));
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      agregar(text);
    } else if (e.key === "Backspace" && text === "" && value.length > 0) {
      // Backspace con el input vacío quita el último chip (patrón usual de tag inputs).
      quitar(value[value.length - 1]);
    }
  }

  const mostrarDropdown = focused && filtradas.length > 0;
  const mostrarPreview = slug !== "" && slug !== text.trim();

  return (
    <div>
      {/* Chips elegidos */}
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-1.5">
          {value.map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full border border-brand/30 bg-brand/10 text-brand"
            >
              {tag}
              <button
                type="button"
                onClick={() => quitar(tag)}
                aria-label={`Quitar ${tag}`}
                className="text-brand/70 hover:text-brand leading-none"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Input + dropdown de sugerencias */}
      <div className="relative">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          disabled={lleno}
          placeholder={lleno ? "Máximo 8 tags" : "Agregá un tag y Enter…"}
          maxLength={60}
          className={`${INPUT_CLS} disabled:opacity-50 disabled:cursor-not-allowed`}
        />
        {mostrarDropdown && (
          <ul className="absolute z-10 mt-1 w-full max-h-40 overflow-y-auto rounded-lg border border-line bg-surface shadow-lg py-1">
            {filtradas.map((s) => (
              <li key={s}>
                <button
                  type="button"
                  // preventDefault en mousedown → el input no pierde foco antes del click.
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => agregar(s)}
                  className="w-full text-left px-3 py-1.5 text-xs text-fg hover:bg-surface-hover transition-colors"
                >
                  {s}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Preview del slug si difiere de lo tecleado */}
      {mostrarPreview && !lleno && (
        <p className="text-[11px] text-fg-muted mt-1">
          Se guarda como: <span className="font-medium text-fg-secondary">{slug}</span>
        </p>
      )}
    </div>
  );
}
