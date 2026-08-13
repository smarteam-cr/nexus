"use client";

/**
 * components/landing/sections-custom.tsx
 *
 * HtmlEmbedSection — la sección que crea el VENDEDOR: pega un HTML que armó aparte (una
 * animación, unos tabs, una explicación interactiva) y el motor lo muestra dentro de la
 * propuesta. `sectionType: "html_embed"`; la identidad y la def sintetizada viven en
 * `lib/landing/custom-sections.ts`, y la CSP inyectada en `lib/landing/html-embed.ts`.
 *
 * ── POR QUÉ UN <textarea> Y NO EL `Editable` DEL MOTOR ───────────────────────
 * `Editable` lee y escribe con `textContent` (inline.tsx:55-57, 77-78, 106-108). El markup
 * pegado se RENDERIZA vivo adentro del contentEditable —o sea que parece que funcionó— y
 * al perder el foco se aplana a texto y se guarda aplanado, sin un solo aviso. Y hay un
 * segundo motivo, de seguridad: pegar en un contentEditable inserta DOM real DENTRO del
 * origen de Nexus; los `<script>` no corren por esa vía, pero un `<img onerror>` sí. La
 * textarea no es ergonomía, es la frontera.
 *
 * ── POR QUÉ EL ALTO ES UN NÚMERO Y NO SE AUTO-AJUSTA ─────────────────────────
 * Medir el contenido exige una de tres cosas, y las tres son peores que un campo:
 *   1. leer `iframe.contentDocument.scrollHeight` → necesita `allow-same-origin`, que
 *      anula el sandbox (ver html-embed.ts);
 *   2. que el HTML pegado coopere con un `postMessage` → es código que pegó el vendedor,
 *      no lo controlamos;
 *   3. inyectarle nosotros un script de resize → el mensaje llegaría con
 *      `event.origin === "null"` (origen opaco), así que no se puede autenticar:
 *      cualquier otro frame podría falsificar la altura.
 * El CSE ve el resultado en vivo mientras ajusta el número. Un handle de arrastre que
 * escriba `altoEmbed` sería una mejora posterior sin cambio de modelo.
 */
import { useEffect, useRef, type FC } from "react";
import type { SectionProps } from "./types";
import {
  altoEmbedPx,
  MAX_EMBED_CHARS,
  type HtmlEmbedData,
} from "@/lib/landing/custom-sections";
import { withEmbedCsp } from "@/lib/landing/html-embed";

/** Lo que sale impreso cuando el vendedor no escribió el texto de reemplazo: un PDF con un
 *  hueco mudo es peor que una línea que explica por qué falta. */
const PDF_FALLBACK = "Esta sección es interactiva: vela en la versión en línea de la propuesta.";

/**
 * Textarea con la misma disciplina de commit que `Editable`: no-controlada mientras tiene
 * foco, sincronizada desde `value` solo cuando NO lo tiene, y comitea en blur Y al
 * desmontarse. Sin lo último, el toggle Editar→Listo (o cambiar de canvas) con el cursor
 * adentro perdía lo último pegado.
 */
function CodeArea({
  value,
  onCommit,
  rows,
  placeholder,
  mono,
}: {
  value: string;
  onCommit: (next: string) => void;
  rows: number;
  placeholder?: string;
  mono?: boolean;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const safe = typeof value === "string" ? value : "";

  const onCommitRef = useRef(onCommit);
  const valueRef = useRef(safe);
  useEffect(() => {
    onCommitRef.current = onCommit;
    valueRef.current = safe;
  });

  useEffect(() => {
    const el = ref.current;
    if (el && document.activeElement !== el && el.value !== safe) el.value = safe;
  }, [safe]);

  useEffect(() => {
    const el = ref.current;
    return () => {
      if (el && el.value !== valueRef.current) onCommitRef.current(el.value);
    };
  }, []);

  return (
    <textarea
      ref={ref}
      className={`stl-embed-input${mono ? " stl-embed-input--mono" : ""}`}
      defaultValue={safe}
      rows={rows}
      placeholder={placeholder}
      spellCheck={false}
      onBlur={(e) => {
        if (e.currentTarget.value !== safe) onCommit(e.currentTarget.value);
      }}
    />
  );
}

/** El iframe. Sandbox `allow-scripts` a secas: SIN `allow-same-origin` (juntos se anulan
 *  entre sí — el frame sería same-origin y podría quitarse el sandbox solo), sin
 *  `allow-forms` (un formulario pegado por error no puede enviarse), sin `allow-popups`,
 *  sin `allow-top-navigation` (no puede llevarse la página del prospecto a otro dominio) y
 *  sin `allow-modals` (un `alert()` en loop no congela la propuesta). */
function Embed({ html, alto, titulo }: { html: string; alto: number; titulo: string }) {
  return (
    <iframe
      className="stl-embed-frame"
      srcDoc={withEmbedCsp(html)}
      sandbox="allow-scripts"
      allow=""
      referrerPolicy="no-referrer"
      loading="lazy"
      title={titulo}
      style={{ height: alto }}
    />
  );
}

export const HtmlEmbedSection: FC<SectionProps<HtmlEmbedData>> = ({
  data,
  ctx,
  editable,
  onChange,
  sectionTitle,
}) => {
  const html = (data.html ?? "").trim();
  const notaPdf = (data.notaPdf ?? "").trim();
  const alto = altoEmbedPx(data);
  const set = (next: Partial<HtmlEmbedData>) => onChange?.({ ...data, ...next });

  /* PDF: el iframe NO se monta, y no es una preferencia estética — muere por cuatro vías
     distintas. `PdfReadySignal` enumera las `<img>` del documento de ARRIBA y no ve nada
     adentro del frame (la señal de "listo" se dispara con el embebido en blanco);
     `pdf-runner` mide la página con `scrollHeight` y un iframe solo aporta su caja
     declarada (recorte silencioso); lo animado se congela en un frame arbitrario; y Chrome
     imprime frames sandboxeados de forma poco confiable. Ver el guard `<iframe` de
     `lib/ui/pdf-mode-coverage.test.ts`. */
  if (ctx.pdfMode) {
    return <p className="stl-lead">{notaPdf || PDF_FALLBACK}</p>;
  }

  if (!editable) {
    // Sin HTML pero con texto de reemplazo, el texto es lo que hay que mostrar (una
    // sección explicativa sin animación es legítima). Sin ninguno de los dos, `isBlank`
    // ya la omitió antes de llegar acá.
    if (!html) return notaPdf ? <p className="stl-lead">{notaPdf}</p> : null;
    return <Embed html={html} alto={alto} titulo={sectionTitle ?? "Sección personalizada"} />;
  }

  const exceso = (data.html ?? "").length > MAX_EMBED_CHARS;

  return (
    <div className="stl-embed-edit">
      <label className="stl-embed-field">
        <span className="stl-embed-label">
          HTML de la sección
          <span className={`stl-embed-count${exceso ? " stl-embed-count--over" : ""}`}>
            {(data.html ?? "").length.toLocaleString("en-US")} / {MAX_EMBED_CHARS.toLocaleString("en-US")}
          </span>
        </span>
        <CodeArea
          mono
          rows={10}
          value={data.html ?? ""}
          placeholder="Pegá acá el HTML completo (puede traer <style> y <script>)…"
          onCommit={(v) => set({ html: v })}
        />
        <span className="stl-embed-help">
          Corre aislado: no puede leer ni tocar nada de Nexus, ni enviar formularios, ni salir
          a otra página. Los CDN (Tailwind, GSAP) sí funcionan.
        </span>
      </label>

      <div className="stl-embed-row">
        <label className="stl-embed-field stl-embed-field--alto">
          <span className="stl-embed-label">Alto (px)</span>
          <input
            className="stl-embed-input"
            type="number"
            min={200}
            max={2000}
            step={20}
            defaultValue={alto}
            onBlur={(e) => set({ altoEmbed: e.currentTarget.value.trim() })}
          />
        </label>
        <label className="stl-embed-field">
          <span className="stl-embed-label">Texto que sale en el PDF</span>
          <CodeArea
            rows={2}
            value={data.notaPdf ?? ""}
            placeholder={PDF_FALLBACK}
            onCommit={(v) => set({ notaPdf: v })}
          />
          <span className="stl-embed-help">
            El PDF no puede mostrar animaciones: acá va lo que se imprime en su lugar.
          </span>
        </label>
      </div>

      {html ? (
        <Embed html={html} alto={alto} titulo={sectionTitle ?? "Sección personalizada"} />
      ) : (
        <div className="stl-embed-vacio">Pegá un HTML arriba y lo vas a ver acá mismo.</div>
      )}
    </div>
  );
};
