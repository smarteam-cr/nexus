"use client";

import { useState, useEffect, useRef } from "react";
import { useParams } from "next/navigation";

// Colores por tipo de hub
const HUB_COLORS: Record<string, string> = {
  "Marketing Hub": "bg-orange-50 text-orange-700 border-orange-200",
  "Sales Hub":     "bg-blue-50 text-blue-700 border-blue-200",
  "Service Hub":   "bg-green-50 text-green-700 border-green-200",
  "CMS Hub":       "bg-purple-50 text-purple-700 border-purple-200",
  "Operations Hub":"bg-gray-100 text-gray-700 border-gray-300",
  "Commerce Hub":  "bg-pink-50 text-pink-700 border-pink-200",
};

const HUB_ICONS: Record<string, string> = {
  "Marketing Hub": "⚡",
  "Sales Hub":     "💰",
  "Service Hub":   "🎧",
  "CMS Hub":       "🌐",
  "Operations Hub":"⚙️",
  "Commerce Hub":  "🛒",
};

const DEFAULT_COLOR = "bg-gray-50 text-gray-600 border-gray-200";

export default function ProjectTags() {
  const params = useParams();
  const projectId = params?.projectId as string | undefined;
  const [tags, setTags] = useState<string[]>([]);
  const [editing, setEditing] = useState(false);
  const [input, setInput] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!projectId) return;
    fetch(`/api/projects/${projectId}/tags`)
      .then((r) => r.json())
      .then((d) => setTags(d.tags ?? []))
      .catch(() => {});
  }, [projectId]);

  const saveTags = async (newTags: string[]) => {
    setTags(newTags);
    if (!projectId) return;
    await fetch(`/api/projects/${projectId}/tags`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tags: newTags }),
    }).catch(() => {});
  };

  const addTag = () => {
    const val = input.trim();
    if (!val || tags.includes(val)) { setInput(""); return; }
    saveTags([...tags, val]);
    setInput("");
  };

  const removeTag = (tag: string) => {
    saveTags(tags.filter((t) => t !== tag));
  };

  if (!projectId) return null;

  return (
    <div className="flex items-center gap-1 flex-wrap">
      {tags.map((tag) => (
        <span
          key={tag}
          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold border ${HUB_COLORS[tag] ?? DEFAULT_COLOR}`}
        >
          {HUB_ICONS[tag] && <span className="text-xs">{HUB_ICONS[tag]}</span>}
          {tag}
          {editing && (
            <button
              onClick={() => removeTag(tag)}
              className="ml-0.5 text-current opacity-50 hover:opacity-100"
            >
              ×
            </button>
          )}
        </span>
      ))}

      {editing ? (
        <form
          onSubmit={(e) => { e.preventDefault(); addTag(); }}
          className="inline-flex"
        >
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onBlur={() => { if (!input) setEditing(false); }}
            placeholder="Hub..."
            list="hub-suggestions"
            className="w-24 px-1.5 py-0.5 text-[11px] rounded border border-gray-200 focus:border-brand focus:outline-none"
            autoFocus
          />
          <datalist id="hub-suggestions">
            {Object.keys(HUB_COLORS)
              .filter((h) => !tags.includes(h))
              .map((h) => (
                <option key={h} value={h} />
              ))}
          </datalist>
        </form>
      ) : (
        <button
          onClick={() => setEditing(true)}
          className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[11px] text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
          title="Agregar tag"
        >
          +
        </button>
      )}
    </div>
  );
}
