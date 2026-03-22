"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import { RefreshCw } from "lucide-react";

interface Props {
  auditId: string;
}

export default function AuditReAnalyzeButton({ auditId }: Props) {
  const router = useRouter();
  const [isFetching, setIsFetching] = useState(false);
  const [isPending, startTransition] = useTransition();

  const isLoading = isFetching || isPending;

  async function handleClick() {
    setIsFetching(true);
    try {
      await fetch(`/api/audits/${auditId}/insights`, { method: "POST" });
      startTransition(() => {
        router.refresh();
      });
    } finally {
      setIsFetching(false);
    }
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={handleClick}
      loading={isLoading}
    >
      {!isLoading && <RefreshCw className="w-3.5 h-3.5" />}
      {isLoading ? "Analizando..." : "Re-analizar"}
    </Button>
  );
}
