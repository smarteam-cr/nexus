"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { KnowledgeType, KnowledgeStatus, TagCategory } from "@prisma/client";

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface Tag {
  id: string;
  category: TagCategory;
  value: string;
  label: string;
}

interface KnowledgeDoc {
  id: string;
  type: KnowledgeType;
  status: KnowledgeStatus;
  title: string;
  summary: string | null;
  content: string;
  version: number;
  tags: Tag[];
  createdByEmail: string | null;
  updatedAt: string | Date;
  createdAt: string | Date;
}

interface Props {
  initialDocs: KnowledgeDoc[];
  initialTags: Tag[];
}

// ─── Constantes de UI ─────────────────────────────────────────────────────────

const TYPE_META: Record<KnowledgeType, { label: string; color: string; icon: string }> = {
  PROCESS:       { label: "Proceso",           color: "bg-blue-500/10 text-blue-400 border-blue-500/20",     icon: "⚙️" },
  METHODOLOGY:   { label: "Metodología",       color: "bg-purple-500/10 text-purple-400 border-purple-500/20", icon: "🧠" },
  HUBSPOT_SPEC:  { label: "HubSpot Spec",      color: "bg-orange-500/10 text-orange-400 border-orange-500/20", icon: "🔧" },
  BEST_PRACTICE: { label: "Mejor práctica",    color: "bg-green-500/10 text-green-400 border-green-500/20",  icon: "✅" },
  TEMPLATE:      { label: "Plantilla",         color: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20", icon: "📋" },
};

const TYPE_ACCENT: Record<KnowledgeType, string> = {
  PROCESS:       "border-l-blue-500/70",
  METHODOLOGY:   "border-l-purple-500/70",
  HUBSPOT_SPEC:  "border-l-orange-500/70",
  BEST_PRACTICE: "border-l-green-500/70",
  TEMPLATE:      "border-l-yellow-500/70",
};

const STATUS_META: Record<KnowledgeStatus, { label: string; color: string }> = {
  DRAFT:     { label: "Borrador",   color: "bg-gray-500/10 text-gray-400 border-gray-500/20" },
  PUBLISHED: { label: "Publicado",  color: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" },
  ARCHIVED:  { label: "Archivado",  color: "bg-red-500/10 text-red-400 border-red-500/20" },
};

const TAG_CATEGORY_LABEL: Record<TagCategory, string> = {
  SERVICE:      "Servicio",
  STAGE:        "Etapa",
  SUBSTAGE:     "Subetapa",
  DOMAIN:       "Dominio",
  HUBSPOT_AREA: "Área HubSpot",
  TOPIC:        "Tema",
};

// ─── Formulario ───────────────────────────────────────────────────────────────

function DocForm({
  initial,
  allTags,
  onSave,
  onCancel,
}: {
  initial?: Partial<KnowledgeDoc>;
  allTags: Tag[];
  onSave: (doc: KnowledgeDoc) => void;
  onCancel: () => void;
}) {
  const isEditing = !!initial?.id;

  const [type,    setType]    = useState<KnowledgeType>(initial?.type    ?? "PROCESS");
  const [status,  setStatus]  = useState<KnowledgeStatus>(initial?.status ?? "DRAFT");
  const [title,   setTitle]   = useState(initial?.title   ?? "");
  const [summary, setSummary] = useState(initial?.summary ?? "");
  const [content, setContent] = useState(initial?.content ?? "");
  const [tagIds,  setTagIds]  = useState<string[]>(initial?.tags?.map((t) => t.id) ?? []);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState("");
  const [tab,     setTab]     = useState<"content" | "tags">("content");

  const toggleTag = (id: string) =>
    setTagIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);

  const handleSubmit = async () => {
    if (!title.trim() || !content.trim()) {
      setError("El título y el contenido son obligatorios.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const url    = isEditing ? `/api/knowledge-docs/${initial!.id}` : "/api/knowledge-docs";
      const method = isEditing ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, status, title, summary, content, tagIds }),
      });
      if (!res.ok) {
        const d = (await res.json()) as { error?: string };
        throw new Error(d.error ?? "Error desconocido");
      }
      const saved = (await res.json()) as KnowledgeDoc;
      onSave(saved);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error desconocido");
    } finally {
      setLoading(false);
    }
  };

  const tagsByCategory = Object.entries(TAG_CATEGORY_LABEL).reduce<Record<string, Tag[]>>(
    (acc, [cat]) => {
      acc[cat] = allTags.filter((t) => t.category === cat);
      return acc;
    },
    {}
  );

  return (
    <div className="rounded-xl border border-gray-700 border-l-2 border-l-brand/70 bg-gray-900 p-5 space-y-4 shadow-[0_4px_24px_rgba(0,0,0,0.5)]">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-white">
          {isEditing ? "Editar documento" : "Nuevo documento de conocimiento"}
        </h3>
        <button onClick={onCancel} className="p-1 rounded-lg hover:bg-gray-800 text-gray-600 hover:text-gray-300 transition-colors">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {error && (
        <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{error}</p>
      )}

      {/* Tipo + Estado */}
      <div className="flex gap-4 flex-wrap">
        <div className="flex-1 min-w-48">
          <label className="block text-xs text-gray-500 mb-2">Tipo</label>
          <div className="flex flex-wrap gap-1.5">
            {(Object.keys(TYPE_META) as KnowledgeType[]).map((t) => (
              <button
                key={t}
                onClick={() => setType(t)}
                className={`px-2.5 py-1 rounded-lg text-xs border transition-all ${
                  type === t ? TYPE_META[t].color : "border-gray-700 text-gray-500 hover:text-gray-300 hover:border-gray-600"
                }`}
              >
                {TYPE_META[t].icon} {TYPE_META[t].label}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-2">Estado</label>
          <div className="flex gap-1.5">
            {(Object.keys(STATUS_META) as KnowledgeStatus[]).map((s) => (
              <button
                key={s}
                onClick={() => setStatus(s)}
                className={`px-2.5 py-1 rounded-lg text-xs border transition-all ${
                  status === s ? STATUS_META[s].color : "border-gray-700 text-gray-500 hover:text-gray-300 hover:border-gray-600"
                }`}
              >
                {STATUS_META[s].label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Título */}
      <div>
        <label className="block text-xs text-gray-500 mb-1.5">Título</label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Ej: Cadencia semanal de Loop Marketing — Diagnóstico"
          className="w-full px-3 py-2.5 rounded-lg bg-gray-800 border border-gray-700 text-white text-sm placeholder-gray-600 outline-none focus:border-brand transition-colors"
        />
      </div>

      {/* Resumen */}
      <div>
        <label className="block text-xs text-gray-500 mb-1.5">
          Resumen <span className="text-gray-700">— descripción corta para listados y agentes</span>
        </label>
        <input
          type="text"
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          placeholder="Ej: Define la rutina de trabajo semanal para la etapa de diagnóstico en Loop Marketing"
          className="w-full px-3 py-2.5 rounded-lg bg-gray-800 border border-gray-700 text-white text-sm placeholder-gray-600 outline-none focus:border-brand transition-colors"
        />
      </div>

      {/* Tabs: Contenido / Tags */}
      <div>
        <div className="flex gap-1 border-b border-gray-800 mb-3">
          {(["content", "tags"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-3 py-1.5 text-xs font-medium border-b-2 transition-colors -mb-px ${
                tab === t
                  ? "border-brand text-brand-light"
                  : "border-transparent text-gray-500 hover:text-gray-300"
              }`}
            >
              {t === "content" ? "Contenido (Markdown)" : `Tags ${tagIds.length > 0 ? `(${tagIds.length})` : ""}`}
            </button>
          ))}
        </div>

        {tab === "content" && (
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={32}
            placeholder="Escribe el contenido en Markdown..."
            className="w-full px-3 py-2.5 rounded-lg bg-gray-800 border border-gray-700 text-white text-sm placeholder-gray-600 outline-none focus:border-brand transition-colors resize-y leading-relaxed font-mono"
          />
        )}

        {tab === "tags" && (
          <div className="space-y-3">
            {(Object.entries(tagsByCategory) as [string, Tag[]][]).map(([cat, tags]) => {
              if (tags.length === 0) return null;
              return (
                <div key={cat}>
                  <p className="text-2xs text-gray-600 uppercase tracking-wider mb-1.5">{TAG_CATEGORY_LABEL[cat as TagCategory]}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {tags.map((tag) => (
                      <button
                        key={tag.id}
                        onClick={() => toggleTag(tag.id)}
                        className={`px-2.5 py-1 rounded-lg text-xs border transition-all ${
                          tagIds.includes(tag.id)
                            ? "bg-brand/15 text-brand-light border-brand/30"
                            : "border-gray-700 text-gray-500 hover:text-gray-300 hover:border-gray-600"
                        }`}
                      >
                        {tag.label}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
            {allTags.length === 0 && (
              <p className="text-xs text-gray-600">Aún no hay tags. Se agregarán automáticamente con el tiempo.</p>
            )}
          </div>
        )}
      </div>

      {/* Acciones */}
      <div className="flex gap-2 justify-end pt-1">
        <button onClick={onCancel} className="px-4 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-400 text-xs transition-colors">
          Cancelar
        </button>
        <button
          onClick={handleSubmit}
          disabled={loading}
          className="px-5 py-2 rounded-lg bg-brand hover:bg-brand-light disabled:opacity-50 text-white text-xs font-medium transition-colors"
        >
          {loading ? "Guardando..." : isEditing ? "Guardar cambios" : "Crear documento"}
        </button>
      </div>
    </div>
  );
}

// ─── Card ─────────────────────────────────────────────────────────────────────

function DocCard({
  doc,
  onEdit,
  onDelete,
}: {
  doc: KnowledgeDoc;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting,      setDeleting]      = useState(false);
  const [expanded,      setExpanded]      = useState(false);

  const typeMeta   = TYPE_META[doc.type];
  const statusMeta = STATUS_META[doc.status];
  const accent     = TYPE_ACCENT[doc.type];

  const dateStr = new Date(doc.updatedAt).toLocaleDateString("es-ES", {
    day: "numeric", month: "short", year: "numeric",
  });

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await fetch(`/api/knowledge-docs/${doc.id}`, { method: "DELETE" });
      onDelete();
    } finally {
      setDeleting(false);
      setConfirmDelete(false);
    }
  };

  return (
    <div className={`group flex flex-col rounded-xl border border-gray-800 border-l-2 ${accent} bg-gray-900 shadow-[0_2px_12px_rgba(0,0,0,0.45)] hover:shadow-[0_6px_24px_rgba(0,0,0,0.55)] hover:border-gray-700 transition-all duration-200`}>
      <div className="p-5 flex-1 space-y-2.5">
        {/* Badges: tipo + estado */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className={`inline-flex text-2xs font-semibold px-2 py-0.5 rounded-md border ${typeMeta.color}`}>
            {typeMeta.icon} {typeMeta.label}
          </span>
          {doc.status !== "PUBLISHED" && (
            <span className={`inline-flex text-2xs font-semibold px-2 py-0.5 rounded-md border ${statusMeta.color}`}>
              {statusMeta.label}
            </span>
          )}
          <span className="text-2xs text-gray-700 ml-auto">v{doc.version}</span>
        </div>

        {/* Título */}
        <p className="text-sm font-semibold text-white leading-snug">{doc.title}</p>

        {/* Resumen o contenido preview */}
        <p className="text-xs text-gray-400 leading-relaxed line-clamp-3">
          {doc.summary || doc.content.slice(0, 180)}
        </p>

        {/* Contenido expandido */}
        {expanded && (
          <div className="mt-2 pt-2 border-t border-gray-800">
            <pre className="text-xs text-gray-400 whitespace-pre-wrap leading-relaxed font-sans">{doc.content}</pre>
          </div>
        )}

        {/* Tags */}
        {doc.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 pt-1">
            {doc.tags.slice(0, 5).map((tag) => (
              <span key={tag.id} className="px-1.5 py-0.5 rounded text-2xs bg-gray-800 text-gray-500 border border-gray-700/50">
                {tag.label}
              </span>
            ))}
            {doc.tags.length > 5 && (
              <span className="px-1.5 py-0.5 rounded text-2xs bg-gray-800 text-gray-600">+{doc.tags.length - 5}</span>
            )}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-5 py-3 border-t border-gray-800/70 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-2xs text-gray-600">{dateStr}</span>
          <button
            onClick={() => setExpanded((v) => !v)}
            className="text-2xs text-gray-600 hover:text-gray-400 transition-colors"
          >
            {expanded ? "Ver menos" : "Ver más"}
          </button>
        </div>

        {confirmDelete ? (
          <div className="flex items-center gap-2 animate-in fade-in duration-150">
            <span className="text-xs text-red-400">¿Eliminar?</span>
            <button onClick={() => setConfirmDelete(false)} className="px-2.5 py-1 rounded-lg text-xs text-gray-400 hover:text-white hover:bg-gray-800 transition-colors">No</button>
            <button onClick={handleDelete} disabled={deleting} className="px-2.5 py-1 rounded-lg text-xs font-medium bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/20 transition-colors disabled:opacity-50">
              {deleting ? "..." : "Sí, eliminar"}
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-1">
            <button onClick={onEdit} className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs text-gray-500 hover:text-gray-200 hover:bg-gray-800 transition-colors">
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
              Editar
            </button>
            <button onClick={() => setConfirmDelete(true)} className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs text-gray-500 hover:text-red-400 hover:bg-red-500/5 transition-colors">
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
              Eliminar
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function KnowledgeClient({ initialDocs, initialTags }: Props) {
  const router = useRouter();
  const [docs,      setDocs]      = useState<KnowledgeDoc[]>(initialDocs);
  const [tags]                    = useState<Tag[]>(initialTags);
  const [showForm,  setShowForm]  = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [filterType,   setFilterType]   = useState<KnowledgeType | "all">("all");
  const [filterStatus, setFilterStatus] = useState<KnowledgeStatus | "all">("all");
  const [search,       setSearch]       = useState("");

  const handleSave = (doc: KnowledgeDoc) => {
    setDocs((prev) => {
      const idx = prev.findIndex((d) => d.id === doc.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = doc;
        return next;
      }
      return [doc, ...prev];
    });
    setShowForm(false);
    setEditingId(null);
    router.refresh();
  };

  const handleDelete = (id: string) => {
    setDocs((prev) => prev.filter((d) => d.id !== id));
    router.refresh();
  };

  const filtered = docs.filter((d) => {
    if (filterType   !== "all" && d.type   !== filterType)   return false;
    if (filterStatus !== "all" && d.status !== filterStatus) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!d.title.toLowerCase().includes(q) && !(d.summary ?? "").toLowerCase().includes(q)) return false;
    }
    return true;
  });

  // Agrupar por tipo
  const grouped = (Object.keys(TYPE_META) as KnowledgeType[]).reduce<Record<KnowledgeType, KnowledgeDoc[]>>(
    (acc, t) => { acc[t] = filtered.filter((d) => d.type === t); return acc; },
    {} as Record<KnowledgeType, KnowledgeDoc[]>
  );

  const totalPublished = docs.filter((d) => d.status === "PUBLISHED").length;
  const totalDraft     = docs.filter((d) => d.status === "DRAFT").length;

  return (
    <div className="space-y-5">

      {/* ── Stats rápidas ─────────────────────────────────────────────────── */}
      <div className="flex gap-3 flex-wrap">
        {[
          { label: "Documentos totales", value: docs.length,      color: "text-white" },
          { label: "Publicados",          value: totalPublished,   color: "text-emerald-400" },
          { label: "Borradores",          value: totalDraft,       color: "text-gray-400" },
          { label: "Tags disponibles",    value: tags.length,      color: "text-brand-light" },
        ].map((s) => (
          <div key={s.label} className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gray-900 border border-gray-800">
            <span className={`text-lg font-bold ${s.color}`}>{s.value}</span>
            <span className="text-xs text-gray-500">{s.label}</span>
          </div>
        ))}
      </div>

      {/* ── Toolbar ───────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 flex-wrap justify-between">
        <div className="flex items-center gap-2 flex-wrap">
          {/* Búsqueda */}
          <div className="relative">
            <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar..."
              className="pl-8 pr-3 py-1.5 rounded-lg bg-gray-900 border border-gray-700 text-white text-xs placeholder-gray-600 outline-none focus:border-brand transition-colors w-44"
            />
          </div>

          {/* Filtro tipo */}
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value as KnowledgeType | "all")}
            className="px-3 py-1.5 rounded-lg bg-gray-900 border border-gray-700 text-xs text-gray-300 outline-none focus:border-brand transition-colors"
          >
            <option value="all">Todos los tipos</option>
            {(Object.keys(TYPE_META) as KnowledgeType[]).map((t) => (
              <option key={t} value={t}>{TYPE_META[t].label}</option>
            ))}
          </select>

          {/* Filtro estado */}
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as KnowledgeStatus | "all")}
            className="px-3 py-1.5 rounded-lg bg-gray-900 border border-gray-700 text-xs text-gray-300 outline-none focus:border-brand transition-colors"
          >
            <option value="all">Todos los estados</option>
            {(Object.keys(STATUS_META) as KnowledgeStatus[]).map((s) => (
              <option key={s} value={s}>{STATUS_META[s].label}</option>
            ))}
          </select>
        </div>

        <button
          onClick={() => { setShowForm(true); setEditingId(null); }}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-brand hover:bg-brand-light text-white text-xs font-medium transition-colors shadow-md shadow-brand/30 flex-shrink-0"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Nuevo documento
        </button>
      </div>

      {/* ── Formulario de creación ────────────────────────────────────────── */}
      {showForm && !editingId && (
        <DocForm allTags={tags} onSave={handleSave} onCancel={() => setShowForm(false)} />
      )}

      {/* ── Empty state ───────────────────────────────────────────────────── */}
      {docs.length === 0 && (
        <div className="rounded-xl border border-dashed border-gray-700 p-12 text-center">
          <div className="w-14 h-14 rounded-2xl bg-brand/10 border border-brand/20 flex items-center justify-center mx-auto mb-4">
            <svg className="w-7 h-7 text-brand-light" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
            </svg>
          </div>
          <p className="text-sm font-medium text-gray-300 mb-1">Base de conocimiento vacía</p>
          <p className="text-xs text-gray-600 max-w-xs mx-auto">
            Crea el primer documento de conocimiento — metodologías, procesos, specs de HubSpot y más.
          </p>
        </div>
      )}

      {/* ── Lista agrupada por tipo ────────────────────────────────────────── */}
      {(Object.keys(TYPE_META) as KnowledgeType[]).map((type) => {
        const items = grouped[type];
        if (!items || items.length === 0) return null;
        const meta = TYPE_META[type];

        return (
          <div key={type} className="space-y-3">
            <div className="flex items-center gap-3">
              <span className={`inline-flex px-2.5 py-1 rounded-lg text-2xs font-bold border uppercase tracking-widest ${meta.color}`}>
                {meta.icon} {meta.label}
              </span>
              <div className="flex-1 h-px bg-gradient-to-r from-gray-800 to-transparent" />
              <span className="text-2xs text-gray-700">{items.length} doc{items.length !== 1 ? "s" : ""}</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {items.map((doc) =>
                editingId === doc.id ? (
                  <div key={doc.id} className="col-span-full">
                    <DocForm
                      initial={doc}
                      allTags={tags}
                      onSave={handleSave}
                      onCancel={() => setEditingId(null)}
                    />
                  </div>
                ) : (
                  <DocCard
                    key={doc.id}
                    doc={doc}
                    onEdit={() => { setEditingId(doc.id); setShowForm(false); }}
                    onDelete={() => handleDelete(doc.id)}
                  />
                )
              )}
            </div>
          </div>
        );
      })}

      {/* Sin resultados de filtro */}
      {docs.length > 0 && filtered.length === 0 && (
        <div className="text-center py-10 text-sm text-gray-600">
          No hay documentos que coincidan con los filtros.
        </div>
      )}
    </div>
  );
}
