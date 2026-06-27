/**
 * components/business-cases/BusinessCaseLanding.tsx
 *
 * Render PÚBLICO (read-only) de un Business Case publicado, a partir del snapshot
 * congelado (shape limpio del chokepoint). Un componente de render por blockType,
 * en el orden del snapshot. Bloques con needsValidation se renderizan igual (el
 * vendedor publica solo cuando está listo).
 *
 * THEME-SAFETY: valores literales (hex) inspirados en el sistema de Landings —
 * hero oscuro #0B1426, azul #168CF6, teal #42E4B3, titulares en italic 600. No
 * usa utilidades temáticas → se ve idéntico sin importar el tema de la app. No
 * carga recursos externos (regla de la superficie externa).
 */
import type {
  BusinessCaseLandingBlock,
  BusinessCaseLandingData,
} from "@/lib/external/business-case-view";

const C = {
  dark: "#0B1426",
  blue: "#168CF6",
  teal: "#42E4B3",
  ink: "#0f172a",
  soft: "#475569",
  dim: "#94a3b8",
  line: "rgba(15, 23, 42, 0.08)",
  surfaceAlt: "#f7faff",
};

const display: React.CSSProperties = { fontStyle: "italic", fontWeight: 600, letterSpacing: "-0.01em" };
const wrap: React.CSSProperties = { maxWidth: 1040, margin: "0 auto", padding: "0 24px" };

// ── Helpers defensivos (el content viene como unknown del snapshot) ───────────
function obj(x: unknown): Record<string, unknown> {
  return x && typeof x === "object" ? (x as Record<string, unknown>) : {};
}
function str(x: unknown): string {
  return typeof x === "string" ? x : "";
}
function num(x: unknown): number | null {
  return typeof x === "number" ? x : null;
}
function list(x: unknown): Record<string, unknown>[] {
  return Array.isArray(x) ? x.map(obj) : [];
}
function strList(x: unknown): string[] {
  return Array.isArray(x) ? x.filter((v): v is string => typeof v === "string") : [];
}

export default function BusinessCaseLanding({ data }: { data: BusinessCaseLandingData }) {
  return (
    <div style={{ background: "#ffffff", color: C.ink, fontFamily: "var(--font-geist-sans), system-ui, sans-serif" }}>
      {data.blocks.map((b) => (
        <BlockRenderer key={b.id} block={b} data={data} />
      ))}
    </div>
  );
}

function BlockRenderer({ block, data }: { block: BusinessCaseLandingBlock; data: BusinessCaseLandingData }) {
  switch (block.blockType) {
    case "HERO":
      return <Hero content={block.content} data={data} />;
    case "PAIN_POINTS":
      return <PainPoints content={block.content} />;
    case "BEFORE_AFTER":
      return <BeforeAfter content={block.content} />;
    case "SOLUTION":
      return <Solution content={block.content} />;
    case "ROI_METRICS":
      return <RoiMetrics content={block.content} />;
    case "TIMELINE":
      return <Timeline content={block.content} />;
    case "INVESTMENT":
      return <Investment content={block.content} />;
    case "PARTNER":
      return <Partner content={block.content} />;
    case "CTA":
      return <Cta content={block.content} />;
    default:
      return null;
  }
}

// ── HERO ──────────────────────────────────────────────────────────────────────
function Hero({ content, data }: { content: unknown; data: BusinessCaseLandingData }) {
  const c = obj(content);
  const tags = strList(c.tags);
  return (
    <section style={{ background: C.dark, color: "#fff", padding: "72px 0 80px" }}>
      <div style={wrap}>
        {data.clientLogoUrl && (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={data.clientLogoUrl} alt={data.clientName} style={{ height: 40, width: "auto", marginBottom: 28, filter: "brightness(0) invert(1)", opacity: 0.92 }} />
        )}
        <p style={{ textTransform: "uppercase", letterSpacing: "0.14em", fontSize: 12, fontWeight: 700, color: C.teal, margin: 0 }}>
          Caso de negocio · {data.clientName}
        </p>
        <h1 style={{ ...display, fontSize: 44, lineHeight: 1.1, margin: "16px 0 0", maxWidth: 820 }}>
          {str(c.headline) || data.name}
        </h1>
        {str(c.subhead) && (
          <p style={{ fontSize: 18, lineHeight: 1.6, color: "rgba(255,255,255,0.74)", margin: "20px 0 0", maxWidth: 680 }}>
            {str(c.subhead)}
          </p>
        )}
        {tags.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 28 }}>
            {tags.map((t, i) => (
              <span key={i} style={{ fontSize: 13, fontWeight: 600, padding: "6px 14px", borderRadius: 9999, background: "rgba(22,140,246,0.16)", border: "1px solid rgba(66,228,179,0.32)", color: "#dbeafe" }}>
                {t}
              </span>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

// ── Section shell (cuerpo claro) ──────────────────────────────────────────────
function Section({ eyebrow, title, children, alt }: { eyebrow: string; title: string; children: React.ReactNode; alt?: boolean }) {
  return (
    <section style={{ padding: "64px 0", background: alt ? C.surfaceAlt : "#fff", borderTop: `1px solid ${C.line}` }}>
      <div style={wrap}>
        <p style={{ textTransform: "uppercase", letterSpacing: "0.14em", fontSize: 11, fontWeight: 700, color: C.blue, margin: 0 }}>{eyebrow}</p>
        <h2 style={{ ...display, fontSize: 30, lineHeight: 1.15, margin: "10px 0 28px" }}>{title}</h2>
        {children}
      </div>
    </section>
  );
}

// ── PAIN_POINTS ───────────────────────────────────────────────────────────────
function PainPoints({ content }: { content: unknown }) {
  const items = list(obj(content).items);
  if (items.length === 0) return null;
  return (
    <Section eyebrow="Situación actual" title="Los retos que identificamos">
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 18 }}>
        {items.map((it, i) => (
          <div key={i} style={{ border: `1px solid ${C.line}`, borderRadius: 16, padding: "22px 22px", background: "#fff" }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: C.ink }}>{str(it.title)}</h3>
            <p style={{ fontSize: 14, lineHeight: 1.6, color: C.soft, margin: "8px 0 0" }}>{str(it.detail)}</p>
          </div>
        ))}
      </div>
    </Section>
  );
}

// ── BEFORE_AFTER ────────────────────────────────────────────────────────────
function BeforeAfter({ content }: { content: unknown }) {
  const rows = list(obj(content).rows);
  if (rows.length === 0) return null;
  return (
    <Section eyebrow="El salto" title="De dónde partimos, a dónde llegamos" alt>
      <div style={{ display: "grid", gap: 12 }}>
        {rows.map((r, i) => (
          <div key={i} style={{ display: "grid", gridTemplateColumns: "minmax(120px, 0.6fr) 1fr 1fr", gap: 16, alignItems: "center", padding: "16px 18px", background: "#fff", border: `1px solid ${C.line}`, borderRadius: 14 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: C.dim, textTransform: "uppercase", letterSpacing: "0.06em" }}>{str(r.aspect)}</span>
            <span style={{ fontSize: 14, color: C.soft }}>{str(r.before)}</span>
            <span style={{ fontSize: 14, fontWeight: 600, color: C.ink, borderLeft: `3px solid ${C.teal}`, paddingLeft: 12 }}>{str(r.after)}</span>
          </div>
        ))}
      </div>
    </Section>
  );
}

// ── SOLUTION ──────────────────────────────────────────────────────────────────
function Solution({ content }: { content: unknown }) {
  const c = obj(content);
  const hubs = strList(c.hubs);
  const integrations = strList(c.integrations);
  const useCases = list(c.useCases);
  if (hubs.length === 0 && integrations.length === 0 && useCases.length === 0) return null;
  return (
    <Section eyebrow="La solución" title="Cómo lo resolvemos con HubSpot">
      {(hubs.length > 0 || integrations.length > 0) && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 28 }}>
          {hubs.map((h, i) => (
            <span key={`h${i}`} style={{ fontSize: 13, fontWeight: 600, padding: "7px 14px", borderRadius: 9999, background: "rgba(22,140,246,0.10)", color: C.blue, border: `1px solid rgba(22,140,246,0.24)` }}>{h}</span>
          ))}
          {integrations.map((g, i) => (
            <span key={`i${i}`} style={{ fontSize: 13, fontWeight: 600, padding: "7px 14px", borderRadius: 9999, background: "#fff", color: C.soft, border: `1px solid ${C.line}` }}>{g}</span>
          ))}
        </div>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 18 }}>
        {useCases.map((u, i) => (
          <div key={i} style={{ border: `1px solid ${C.line}`, borderRadius: 16, padding: 22, background: "#fff" }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>{str(u.title)}</h3>
            <p style={{ fontSize: 14, lineHeight: 1.6, color: C.soft, margin: "8px 0 0" }}>{str(u.detail)}</p>
          </div>
        ))}
      </div>
    </Section>
  );
}

// ── ROI_METRICS ─────────────────────────────────────────────────────────────
function RoiMetrics({ content }: { content: unknown }) {
  const metrics = list(obj(content).metrics);
  if (metrics.length === 0) return null;
  return (
    <Section eyebrow="Impacto esperado" title="El retorno de la inversión" alt>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 18 }}>
        {metrics.map((m, i) => (
          <div key={i} style={{ border: `1px solid ${C.line}`, borderRadius: 16, padding: 24, background: "#fff", textAlign: "center" }}>
            <div style={{ ...display, fontSize: 36, color: C.blue }}>
              {str(m.value)}
              {str(m.unit) && <span style={{ fontSize: 18, color: C.soft, fontStyle: "normal", fontWeight: 600 }}> {str(m.unit)}</span>}
            </div>
            <p style={{ fontSize: 14, fontWeight: 600, color: C.ink, margin: "8px 0 0" }}>{str(m.label)}</p>
            {str(m.note) && <p style={{ fontSize: 12, color: C.dim, margin: "4px 0 0" }}>{str(m.note)}</p>}
          </div>
        ))}
      </div>
    </Section>
  );
}

// ── TIMELINE ──────────────────────────────────────────────────────────────────
function Timeline({ content }: { content: unknown }) {
  const phases = list(obj(content).phases);
  if (phases.length === 0) return null;
  return (
    <Section eyebrow="El plan" title="Cómo lo implementamos">
      <div style={{ display: "grid", gap: 14 }}>
        {phases.map((p, i) => {
          const weeks = num(p.weeks);
          const deliverables = strList(p.deliverables);
          return (
            <div key={i} style={{ display: "grid", gridTemplateColumns: "44px 1fr", gap: 18, padding: "18px 20px", border: `1px solid ${C.line}`, borderRadius: 16, background: "#fff" }}>
              <div style={{ width: 44, height: 44, borderRadius: 12, background: C.dark, color: "#fff", display: "grid", placeItems: "center", fontWeight: 700 }}>{i + 1}</div>
              <div>
                <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
                  <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>{str(p.name)}</h3>
                  {weeks != null && <span style={{ fontSize: 12, fontWeight: 600, color: C.blue }}>{weeks} semana{weeks === 1 ? "" : "s"}</span>}
                </div>
                {deliverables.length > 0 && (
                  <ul style={{ margin: "8px 0 0", paddingLeft: 18, color: C.soft, fontSize: 14, lineHeight: 1.7 }}>
                    {deliverables.map((d, j) => <li key={j}>{d}</li>)}
                  </ul>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </Section>
  );
}

// ── INVESTMENT ────────────────────────────────────────────────────────────────
function Investment({ content }: { content: unknown }) {
  const c = obj(content);
  const licenses = list(c.licenses);
  const services = list(c.services);
  if (licenses.length === 0 && services.length === 0) return null;
  return (
    <Section eyebrow="La inversión" title="Licencias y servicios" alt>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 18 }}>
        {licenses.length > 0 && (
          <div style={{ border: `1px solid ${C.line}`, borderRadius: 16, padding: 22, background: "#fff" }}>
            <h3 style={{ fontSize: 15, fontWeight: 700, margin: "0 0 12px" }}>Licencias HubSpot</h3>
            {licenses.map((l, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderTop: i === 0 ? "none" : `1px solid ${C.line}` }}>
                <span style={{ fontSize: 14, color: C.ink }}>{str(l.name)}{str(l.tier) && <span style={{ color: C.dim }}> · {str(l.tier)}</span>}</span>
                <span style={{ fontSize: 14, fontWeight: 600, color: C.soft }}>{str(l.price)}</span>
              </div>
            ))}
          </div>
        )}
        {services.length > 0 && (
          <div style={{ border: `1px solid ${C.line}`, borderRadius: 16, padding: 22, background: "#fff" }}>
            <h3 style={{ fontSize: 15, fontWeight: 700, margin: "0 0 12px" }}>Servicios Smarteam</h3>
            {services.map((s, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderTop: i === 0 ? "none" : `1px solid ${C.line}` }}>
                <span style={{ fontSize: 14, color: C.ink }}>{str(s.name)}</span>
                <span style={{ fontSize: 14, fontWeight: 600, color: C.soft }}>{str(s.price)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
      {str(c.total) && (
        <div style={{ marginTop: 20, textAlign: "right", fontSize: 16 }}>
          <span style={{ color: C.soft }}>Inversión total: </span>
          <span style={{ ...display, fontSize: 24, color: C.ink }}>{str(c.total)}</span>
        </div>
      )}
    </Section>
  );
}

// ── PARTNER ─────────────────────────────────────────────────────────────────
function Partner({ content }: { content: unknown }) {
  const c = obj(content);
  const credentials = strList(c.credentials);
  return (
    <Section eyebrow="Tu partner" title={str(c.headline) || "Smarteam, Elite HubSpot Partner"}>
      <ul style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 14, listStyle: "none", margin: 0, padding: 0 }}>
        {credentials.map((cr, i) => (
          <li key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start", fontSize: 14, color: C.soft }}>
            <span style={{ color: C.teal, fontWeight: 700, flexShrink: 0 }}>✓</span>
            <span>{cr}</span>
          </li>
        ))}
      </ul>
    </Section>
  );
}

// ── CTA ─────────────────────────────────────────────────────────────────────
function Cta({ content }: { content: unknown }) {
  const c = obj(content);
  return (
    <section style={{ background: C.dark, color: "#fff", padding: "72px 0" }}>
      <div style={{ ...wrap, textAlign: "center" }}>
        <h2 style={{ ...display, fontSize: 34, margin: 0 }}>{str(c.headline) || "¿Avanzamos juntos?"}</h2>
        <div style={{ marginTop: 28 }}>
          <span style={{ display: "inline-block", padding: "14px 28px", borderRadius: 12, background: C.blue, color: "#fff", fontSize: 15, fontWeight: 600 }}>
            {str(c.buttonLabel) || "Agendar una conversación"}
          </span>
        </div>
        {str(c.contact) && <p style={{ marginTop: 18, fontSize: 14, color: "rgba(255,255,255,0.6)" }}>{str(c.contact)}</p>}
      </div>
    </section>
  );
}
