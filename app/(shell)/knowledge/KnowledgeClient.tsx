"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { KnowledgeType, KnowledgeStatus, TagCategory } from "@prisma/client";
import {
  Modal,
  ConfirmDialog,
  Button,
  Select,
  EmptyState,
  Table,
  Tabs,
  type TableColumn,
} from "@/components/ui";

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

const PILL = "inline-flex items-center gap-1 text-2xs font-medium px-2 py-0.5 rounded-md border whitespace-nowrap";

// ─── Formulario (modal) ───────────────────────────────────────────────────────

function DocForm({
  initial,
  allTags,
  onSave,
  onClose,
}: {
  initial?: Partial<KnowledgeDoc>;
  allTags: Tag[];
  onSave: (doc: KnowledgeDoc) => void;
  onClose: () => void;
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
    <Modal
      open
      onClose={onClose}
      title={isEditing ? "Editar documento" : "Nuevo documento de conocimiento"}
      size="xl"
      footer={
        <>
          <Button variant="secondary" size="md" onClick={onClose} disabled={loading}>
            Cancelar
          </Button>
          <Button variant="primary" size="md" loading={loading} onClick={handleSubmit}>
            {isEditing ? "Guardar cambios" : "Crear documento"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
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
          <Tabs
            aria-label="Contenido del conocimiento"
            size="sm"
            className="mb-3"
            value={tab}
            onChange={setTab}
            items={[
              { key: "content", label: "Contenido (Markdown)" },
              { key: "tags", label: "Tags", count: tagIds.length > 0 ? tagIds.length : undefined },
            ]}
          />

          {tab === "content" && (
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={14}
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
      </div>
    </Modal>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function KnowledgeClient({ initialDocs, initialTags }: Props) {
  const router = useRouter();
  const [docs, setDocs] = useState<KnowledgeDoc[]>(initialDocs);
  const [tags] = useState<Tag[]>(initialTags);
  // null = cerrado | "new" = crear | KnowledgeDoc = editar
  const [formDoc, setFormDoc] = useState<KnowledgeDoc | "new" | null>(null);
  const [confirmTarget, setConfirmTarget] = useState<KnowledgeDoc | null>(null);
  const [filterType,   setFilterType]   = useState<KnowledgeType | "all">("all");
  const [filterStatus, setFilterStatus] = useState<KnowledgeStatus | "all">("all");

  // Guardado optimista: parchea la lista local y revalida el RSC.
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
    setFormDoc(null);
    router.refresh();
  };

  // Borrado optimista: fetch → quitar de la lista local → revalidar.
  async function confirmDelete() {
    if (!confirmTarget) return;
    const id = confirmTarget.id;
    await fetch(`/api/knowledge-docs/${id}`, { method: "DELETE" });
    setDocs((prev) => prev.filter((d) => d.id !== id));
    setConfirmTarget(null);
    router.refresh();
  }

  // Pre-filtro por tipo/estado; la búsqueda y el orden los hace <Table>.
  const filtered = docs.filter((d) => {
    if (filterType   !== "all" && d.type   !== filterType)   return false;
    if (filterStatus !== "all" && d.status !== filterStatus) return false;
    return true;
  });

  const totalPublished = docs.filter((d) => d.status === "PUBLISHED").length;
  const totalDraft     = docs.filter((d) => d.status === "DRAFT").length;

  // ── Columnas de la tabla ──────────────────────────────────────────────────────
  const columns: TableColumn<KnowledgeDoc>[] = [
    {
      key: "doc",
      header: "Documento",
      sortValue: (d) => d.title,
      render: (d) => (
        <Table.IdentityCell
          leading={
            <div className="w-8 h-8 rounded-lg bg-gray-800 border border-gray-700 flex items-center justify-center text-sm flex-shrink-0">
              {TYPE_META[d.type].icon}
            </div>
          }
          primary={d.title}
          secondary={d.summary || d.content.slice(0, 120)}
        />
      ),
    },
    {
      key: "type",
      header: "Tipo",
      sortValue: (d) => d.type,
      width: "w-44",
      hideOnMobile: true,
      render: (d) => (
        <span className={`${PILL} ${TYPE_META[d.type].color}`}>
          {TYPE_META[d.type].icon} {TYPE_META[d.type].label}
        </span>
      ),
    },
    {
      key: "status",
      header: "Estado",
      sortValue: (d) => d.status,
      width: "w-28",
      render: (d) => (
        <span className={`${PILL} ${STATUS_META[d.status].color}`}>
          {STATUS_META[d.status].label}
        </span>
      ),
    },
    {
      key: "tags",
      header: "Tags",
      width: "w-44",
      hideOnMobile: true,
      render: (d) =>
        d.tags.length === 0 ? (
          <span className="text-gray-600">—</span>
        ) : (
          <div className="flex flex-wrap gap-1">
            {d.tags.slice(0, 2).map((tag) => (
              <span
                key={tag.id}
                className="px-1.5 py-0.5 rounded text-2xs bg-gray-800 text-gray-500 border border-gray-700/50 whitespace-nowrap"
              >
                {tag.label}
              </span>
            ))}
            {d.tags.length > 2 && (
              <span className="px-1.5 py-0.5 rounded text-2xs bg-gray-800 text-gray-600">
                +{d.tags.length - 2}
              </span>
            )}
          </div>
        ),
    },
    {
      key: "version",
      header: "Versión",
      sortValue: (d) => d.version,
      align: "right",
      width: "w-20",
      hideOnMobile: true,
      render: (d) => <span className="text-2xs text-gray-600">v{d.version}</span>,
    },
    {
      key: "updated",
      header: "Actualizado",
      sortValue: (d) => new Date(d.updatedAt),
      width: "w-32",
      render: (d) => (
        <span className="text-gray-400 whitespace-nowrap">
          {new Date(d.updatedAt).toLocaleDateString("es-ES", {
            day: "numeric",
            month: "short",
            year: "numeric",
          })}
        </span>
      ),
    },
    {
      key: "actions",
      header: "",
      align: "right",
      width: "w-16",
      render: (d) => (
        <button
          onClick={(e) => {
            e.stopPropagation();
            setConfirmTarget(d);
          }}
          title="Eliminar"
          className="p-1.5 rounded-md text-gray-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </button>
      ),
    },
  ];

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

      {/* ── Tabla / estado vacío ──────────────────────────────────────────── */}
      {docs.length === 0 ? (
        <EmptyState
          variant="dashed"
          icon={
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
            </svg>
          }
          title="Base de conocimiento vacía"
          description="Crea el primer documento de conocimiento — metodologías, procesos, specs de HubSpot y más."
          action={
            <Button variant="ghost" size="sm" onClick={() => setFormDoc("new")}>
              Nuevo documento
            </Button>
          }
        />
      ) : (
        <Table
          columns={columns}
          rows={filtered}
          rowKey={(d) => d.id}
          onRowClick={(d) => setFormDoc(d)}
          search={{
            placeholder: "Buscar por título o etiqueta…",
            getText: (d) =>
              `${d.title} ${d.summary ?? ""} ${d.tags.map((t) => t.label).join(" ")}`,
          }}
          initialSort={{ key: "updated", dir: "desc" }}
          filters={
            <>
              <Select
                value={filterType}
                onChange={(e) => setFilterType(e.target.value as KnowledgeType | "all")}
                className="w-auto"
              >
                <option value="all">Todos los tipos</option>
                {(Object.keys(TYPE_META) as KnowledgeType[]).map((t) => (
                  <option key={t} value={t}>{TYPE_META[t].label}</option>
                ))}
              </Select>
              <Select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value as KnowledgeStatus | "all")}
                className="w-auto"
              >
                <option value="all">Todos los estados</option>
                {(Object.keys(STATUS_META) as KnowledgeStatus[]).map((s) => (
                  <option key={s} value={s}>{STATUS_META[s].label}</option>
                ))}
              </Select>
            </>
          }
          action={
            <Button variant="primary" size="md" onClick={() => setFormDoc("new")}>
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Nuevo documento
            </Button>
          }
        />
      )}

      {/* ── Modal de creación / edición ────────────────────────────────────── */}
      {formDoc !== null && (
        <DocForm
          key={formDoc === "new" ? "new" : formDoc.id}
          initial={formDoc === "new" ? undefined : formDoc}
          allTags={tags}
          onSave={handleSave}
          onClose={() => setFormDoc(null)}
        />
      )}

      {/* ── Confirmación de borrado ────────────────────────────────────────── */}
      <ConfirmDialog
        open={!!confirmTarget}
        onConfirm={confirmDelete}
        onCancel={() => setConfirmTarget(null)}
        title="¿Eliminar documento?"
        description={confirmTarget?.title}
        confirmLabel="Eliminar"
      />
    </div>
  );
}
