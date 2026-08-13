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
 * El número se aplica al SALIR del campo (mismo commit-en-blur que el resto del motor), y el
 * campo se re-sincroniza con el valor ya saneado para que un 5000 no quede en pantalla
 * mientras el iframe se pinta a 2000. Un handle de arrastre que escriba `altoEmbed` —o un
 * preview que siga al número mientras se tipea— serían mejoras posteriores sin cambio de
 * modelo.
 */
import { useEffect, useRef, useState, type FC } from "react";
import type { SectionProps } from "./types";
import {
  altoEmbedPx,
  EMBED_ALTO_MAX,
  EMBED_ALTO_MIN,
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
  onLength,
  rows,
  placeholder,
  mono,
}: {
  value: string;
  onCommit: (next: string) => void;
  /** Largo EN VIVO mientras se tipea, sin comitear. Lo pide el contador: `value` es lo ya
   *  guardado, así que mientras se pegan 200.000 caracteres seguía diciendo lo de antes. */
  onLength?: (n: number) => void;
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
      /* Sin corrector en el HTML (subrayaría cada etiqueta), CON corrector en la prosa: el
         texto de reemplazo sale IMPRESO en la propuesta que lee el cliente y es lo único
         que ataja un dedazo ahí. `mono` ya distingue exactamente los dos campos. */
      spellCheck={mono ? false : undefined}
      onInput={onLength ? (e) => onLength(e.currentTarget.value.length) : undefined}
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

/**
 * "Copiar instrucciones para tu IA" — el brief que Nexus le pasa al agente de código con el
 * que Ventas está armando el HTML aparte. Sin esto, el agente no tiene forma de saber que va
 * a correr en un iframe sin red, con alto fijo y origen opaco: escribe un `fetch`, un
 * `localStorage` o un embed de YouTube, y el vendedor vuelve diciendo "no funciona" sin un
 * error que mostrar (casi todo lo que este entorno bloquea falla EN SILENCIO).
 *
 * ── DOS DECISIONES QUE NO SON DE ESTILO ──────────────────────────────────────
 * 1. El texto se carga con `import()` DINÁMICO adentro del handler. `HtmlEmbedSection` la
 *    importa estáticamente el registry del motor, así que una constante de ~10 KB de módulo
 *    viajaría en el bundle que descarga el PROSPECTO al abrir la propuesta publicada — donde
 *    este botón ni existe.
 * 2. El estado "falló" NO se auto-limpia. Es el único camino para copiar a mano (revela el
 *    texto en un textarea), así que un timeout que lo esconda a los 2 segundos borra la
 *    salida justo cuando hace falta. Solo el "copiado" se apaga solo.
 */
function CopiarConsejos() {
  const [estado, setEstado] = useState<"idle" | "copiado" | "fallo">("idle");
  const [texto, setTexto] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  async function copiar() {
    const { CONSEJOS_EMBED } = await import("@/lib/landing/consejos-embed");
    try {
      await navigator.clipboard.writeText(CONSEJOS_EMBED);
      setEstado("copiado");
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setEstado("idle"), 1800);
    } catch {
      /* El portapapeles falla de verdad: sin permiso, sin contexto seguro o con la pestaña
         en segundo plano. Un "no se pudo" mudo haría que el vendedor pegue en su IA lo que
         tuviera copiado de antes, así que acá se muestra el texto para copiarlo a mano. */
      setTexto(CONSEJOS_EMBED);
      setEstado("fallo");
    }
  }

  return (
    <div className="stl-embed-cta">
      <div className="stl-embed-cta-fila">
        <button type="button" className="stl-embed-cta-btn" onClick={copiar}>
          {estado === "copiado" ? "Copiado" : "Copiar instrucciones para tu IA"}
        </button>
        <span className="stl-embed-help">
          Pégaselas a tu Claude Code antes de pedirle el HTML: le dicen en qué caja va a correr
          (sin red, alto fijo, sin acceso a la página) para que no falle en silencio. Reemplaza
          lo que tengas copiado.
        </span>
      </div>
      {estado === "fallo" && (
        <>
          <span className="stl-embed-cta-fallo">
            No se pudo copiar. Selecciona el texto de abajo y cópialo a mano.
          </span>
          <textarea
            className="stl-embed-input stl-embed-input--mono"
            aria-label="Instrucciones para el agente de código"
            readOnly
            rows={10}
            value={texto}
          />
        </>
      )}
    </div>
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

  /* Largo mientras se tipea. `null` = nadie está tipeando → se deriva de lo guardado, que
     es lo correcto cuando el valor cambia por afuera (regenerar, deshacer). Se vuelve a
     `null` al comitear. Va ANTES de los returns tempranos: un hook no puede ser condicional. */
  const [largoVivo, setLargoVivo] = useState<number | null>(null);

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

  const largo = largoVivo ?? (data.html ?? "").length;
  const exceso = largo > MAX_EMBED_CHARS;

  return (
    <div className="stl-embed-edit">
      {/* Va PRIMERO y no al pie: el orden de lectura del formulario arranca en "pegá acá el
          HTML", y para cuando alguien llega al final ya fue a pedirle la pieza a su IA. */}
      <CopiarConsejos />
      <label className="stl-embed-field">
        <span className="stl-embed-label">
          HTML de la sección
          <span className={`stl-embed-count${exceso ? " stl-embed-count--over" : ""}`}>
            {largo.toLocaleString("en-US")} / {MAX_EMBED_CHARS.toLocaleString("en-US")}
          </span>
        </span>
        <CodeArea
          mono
          rows={10}
          value={data.html ?? ""}
          placeholder="Pega acá el HTML completo (puede traer <style> y <script>)…"
          onLength={setLargoVivo}
          onCommit={(v) => {
            setLargoVivo(null);
            set({ html: v });
          }}
        />
        <span className="stl-embed-help">
          Corre aislado. Sí funcionan CSS, JavaScript y los CDN (Tailwind, GSAP). NO funcionan:
          llamadas a APIs (fetch), videos embebidos de YouTube o Vimeo, formularios, ni enlaces
          que abran otra página.
        </span>
      </label>

      <div className="stl-embed-row">
        <label className="stl-embed-field stl-embed-field--alto">
          <span className="stl-embed-label">Alto (px)</span>
          <input
            /* La `key` remonta el campo cuando cambia lo guardado: sin eso, escribir 5000
               dejaba el 5000 en pantalla para siempre mientras el iframe se pintaba a 2000
               (`altoEmbedPx` capa en silencio) — el número que se leía NO era el alto real.
               Los topes salen de las constantes que hacen ese clamp, no escritos a mano. */
            key={`${alto}|${(data.altoEmbed ?? "").trim()}`}
            className="stl-embed-input"
            type="number"
            min={EMBED_ALTO_MIN}
            max={EMBED_ALTO_MAX}
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
        <div className="stl-embed-vacio">
          Pega un HTML arriba y, al salir del campo, lo vas a ver acá mismo.
        </div>
      )}
    </div>
  );
};
