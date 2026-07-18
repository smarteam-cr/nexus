/**
 * components/roles/RolePage.tsx — render presentacional de UN rol como página web
 * resumida (hero + las 6 secciones de la plantilla en markdown). Tokens semánticos
 * (flipea claro/oscuro); las secciones vacías se ocultan. Sin edición, sin IA.
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
}

// Colores de prose alineados a tokens (no `prose-invert`, no gris crudo → flipea).
const PROSE_CLS =
  "prose prose-sm max-w-none prose-p:text-fg-secondary prose-li:text-fg-secondary " +
  "prose-headings:text-fg prose-strong:text-fg prose-a:text-brand prose-code:text-fg " +
  "prose-code:bg-surface-muted prose-code:px-1 prose-code:rounded";

export default function RolePage({ role }: { role: RolePageData }) {
  const filled = ROLE_SECTIONS.filter((s) => (role[s.key as RoleSectionKey] ?? "").trim().length > 0);

  return (
    <article className="max-w-3xl mx-auto">
      {/* Hero */}
      <header className="border-b border-line pb-6">
        {role.area && (
          <p className="text-xs font-semibold uppercase tracking-widest text-brand">{role.area}</p>
        )}
        <h1 className="mt-1 text-3xl font-semibold text-fg">{role.title}</h1>
        {role.summary && <p className="mt-2 text-base text-fg-secondary">{role.summary}</p>}
      </header>

      {filled.length === 0 ? (
        <p className="mt-8 text-sm text-fg-muted">
          Este rol todavía no tiene contenido. Editalo para completar sus secciones.
        </p>
      ) : (
        <div className="mt-8 space-y-10">
          {filled.map((s) => (
            <section key={s.key}>
              <h2 className="text-xs font-semibold uppercase tracking-widest text-fg-muted">
                {s.label}
              </h2>
              <div className={`mt-2 ${PROSE_CLS}`}>
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {role[s.key as RoleSectionKey] ?? ""}
                </ReactMarkdown>
              </div>
            </section>
          ))}
        </div>
      )}
    </article>
  );
}
