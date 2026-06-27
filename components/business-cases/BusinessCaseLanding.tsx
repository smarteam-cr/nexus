/**
 * components/business-cases/BusinessCaseLanding.tsx
 *
 * Render PÚBLICO (read-only) del Business Case publicado, a partir del snapshot
 * congelado (secciones + bloques markdown). Hero/CTA oscuros, cuerpo claro.
 *
 * THEME-SAFETY: valores literales (hex), sin utilidades temáticas → idéntico sin
 * importar el tema de la app. No carga recursos externos.
 */
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type {
  BusinessCaseLandingData,
  BusinessCaseLandingSection,
} from "@/lib/external/business-case-view";

const C = {
  dark: "#0B1426",
  blue: "#168CF6",
  teal: "#42E4B3",
  ink: "#0f172a",
  soft: "#475569",
  line: "rgba(15, 23, 42, 0.08)",
  surfaceAlt: "#f7faff",
};
const display: React.CSSProperties = { fontStyle: "italic", fontWeight: 600, letterSpacing: "-0.01em" };
const wrap: React.CSSProperties = { maxWidth: 1000, margin: "0 auto", padding: "0 24px" };

function sectionMarkdown(s: BusinessCaseLandingSection): string {
  return s.blocks.map((b) => b.content ?? "").filter(Boolean).join("\n\n");
}

const PROSE_CSS = `
.bc-prose { font-size: 16px; line-height: 1.7; color: ${C.soft}; }
.bc-prose h2 { font-size: 22px; font-weight: 700; color: ${C.ink}; margin: 20px 0 8px; }
.bc-prose h3 { font-size: 17px; font-weight: 700; color: ${C.ink}; margin: 16px 0 6px; }
.bc-prose p { margin: 8px 0; }
.bc-prose strong { color: ${C.ink}; }
.bc-prose a { color: ${C.blue}; }
.bc-prose ul, .bc-prose ol { margin: 8px 0; padding-left: 22px; }
.bc-prose li { margin: 4px 0; }
.bc-prose table { width: 100%; border-collapse: collapse; margin: 12px 0; font-size: 14px; }
.bc-prose th { text-align: left; padding: 8px 12px; border-bottom: 2px solid ${C.line}; color: ${C.ink}; font-weight: 700; }
.bc-prose td { padding: 8px 12px; border-bottom: 1px solid ${C.line}; }
.bc-prose-invert, .bc-prose-invert p, .bc-prose-invert li { color: rgba(255,255,255,0.82); }
.bc-prose-invert h2, .bc-prose-invert h3, .bc-prose-invert strong { color: #fff; }
.bc-prose-invert a { color: ${C.teal}; }
`;

export default function BusinessCaseLanding({ data }: { data: BusinessCaseLandingData }) {
  const byKey = new Map(data.sections.map((s) => [s.key, s]));
  const hero = byKey.get("hero");
  const cta = byKey.get("cta");
  const body = data.sections.filter((s) => s.key !== "hero" && s.key !== "cta");

  return (
    <div style={{ background: "#fff", color: C.ink, fontFamily: "var(--font-geist-sans), system-ui, sans-serif" }}>
      <style>{PROSE_CSS}</style>

      {/* HERO */}
      <section style={{ background: C.dark, color: "#fff", padding: "72px 0 80px" }}>
        <div style={wrap}>
          {data.clientLogoUrl && (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={data.clientLogoUrl} alt={data.clientName} style={{ height: 40, marginBottom: 24, filter: "brightness(0) invert(1)", opacity: 0.92 }} />
          )}
          <p style={{ textTransform: "uppercase", letterSpacing: "0.14em", fontSize: 12, fontWeight: 700, color: C.teal, margin: 0 }}>
            Caso de negocio · {data.clientName}
          </p>
          {hero ? (
            <div className="bc-prose bc-prose-invert" style={{ marginTop: 14 }}>
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{sectionMarkdown(hero)}</ReactMarkdown>
            </div>
          ) : (
            <h1 style={{ ...display, fontSize: 40, margin: "14px 0 0" }}>{data.name}</h1>
          )}
        </div>
      </section>

      {/* CUERPO */}
      {body.map((s, i) => {
        const md = sectionMarkdown(s);
        if (!md.trim()) return null;
        return (
          <section key={s.key} style={{ padding: "56px 0", background: i % 2 === 1 ? C.surfaceAlt : "#fff", borderTop: `1px solid ${C.line}` }}>
            <div style={wrap}>
              <p style={{ textTransform: "uppercase", letterSpacing: "0.14em", fontSize: 11, fontWeight: 700, color: C.blue, margin: "0 0 10px" }}>
                {s.label}
              </p>
              <div className="bc-prose">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{md}</ReactMarkdown>
              </div>
            </div>
          </section>
        );
      })}

      {/* CTA */}
      {cta && sectionMarkdown(cta).trim() && (
        <section style={{ background: C.dark, color: "#fff", padding: "64px 0" }}>
          <div style={{ ...wrap, textAlign: "center" }}>
            <div className="bc-prose bc-prose-invert" style={{ display: "inline-block", textAlign: "left" }}>
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{sectionMarkdown(cta)}</ReactMarkdown>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
