"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";

const HUB_COLORS: Record<string, string> = {
  "Marketing Hub": "bg-orange-50 text-orange-700 border-orange-200",
  "Sales Hub":     "bg-blue-50 text-blue-700 border-blue-200",
  "Service Hub":   "bg-green-50 text-green-700 border-green-200",
  "CMS Hub":       "bg-purple-50 text-purple-700 border-purple-200",
  "Operations Hub":"bg-gray-100 text-gray-700 border-gray-300",
  "Commerce Hub":  "bg-pink-50 text-pink-700 border-pink-200",
};

const DEFAULT_COLOR = "bg-gray-50 text-gray-600 border-gray-200";

export default function ProjectTags() {
  const params = useParams();
  const projectId = params?.projectId as string | undefined;
  const [tags, setTags] = useState<string[]>([]);

  useEffect(() => {
    if (!projectId) return;
    fetch(`/api/projects/${projectId}/tags`)
      .then((r) => r.json())
      .then((d) => setTags(d.tags ?? []))
      .catch(() => {});
  }, [projectId]);

  if (!projectId || tags.length === 0) return null;

  return (
    <div className="flex items-center gap-1">
      {tags.map((tag) => (
        <span
          key={tag}
          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border ${HUB_COLORS[tag] ?? DEFAULT_COLOR}`}
        >
          {tag}
        </span>
      ))}
    </div>
  );
}
