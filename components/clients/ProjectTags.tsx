"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import HubBadge from "@/components/ui/HubBadge";

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
      <HubBadge tags={tags} />
    </div>
  );
}
