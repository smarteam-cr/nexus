/**
 * components/roles/RolePage.tsx — render de UN rol como página web, REUSANDO el
 * motor visual de landings de Nexus (`.stl`, app/landing-engine.css — el mismo
 * que usa el business case). Hero + bandas de sección alternadas + prosa
 * markdown (`.stl-md`). Read-only, sin IA, sin canvas. Las secciones vacías se
 * ocultan.
 */
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ROLE_SECTIONS, type RoleSectionKey } from "@/lib/roles/schema";

interface RolePageData {
  title: string;
  area: string | null;
  summary: string | null;
  profile: string | null;
  responsibilities: string | null;
  kpis: string | null;
  successPaths: string | null;
  failurePaths: string | null;
  maturityPath: string | null;
  transitionPeriod: string | null;
}

export default function RolePage({ role }: { role: RolePageData }) {
  const filled = ROLE_SECTIONS.filter((s) => (role[s.key as RoleSectionKey] ?? "").trim().length > 0);

  return (
    <div className="stl">
      {/* Hero (mismo look que el business case) */}
      <section className="stl-sec stl-dark hero-backdrop">
        <div className="stl-wrap">
          {role.area && <span className="stl-eyebrow">{role.area}</span>}
          <h1 className="stl-hero-title">{role.title}</h1>
          {role.summary && (
            <p className="stl-body" style={{ maxWidth: 640, fontSize: 17 }}>
              {role.summary}
            </p>
          )}
        </div>
      </section>

      {filled.length === 0 ? (
        <section className="stl-sec stl-light">
          <div className="stl-wrap">
            <p className="stl-body">
              Este rol todavía no tiene contenido. Editalo para completar sus secciones.
            </p>
          </div>
        </section>
      ) : (
        filled.map((s, i) => (
          <section key={s.key} className={`stl-sec ${i % 2 === 0 ? "stl-light" : "stl-soft"}`}>
            <div className="stl-wrap">
              <header className="stl-sec-head">
                <h2 className="stl-title">{s.label}</h2>
              </header>
              <div className="stl-body stl-md">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {role[s.key as RoleSectionKey] ?? ""}
                </ReactMarkdown>
              </div>
            </div>
          </section>
        ))
      )}
    </div>
  );
}
