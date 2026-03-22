"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Input } from "@/components/ui";

interface Props {
  primary?: boolean;
}

export default function NewImplementationButton({ primary }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState("");
  const [showInput, setShowInput] = useState(false);

  const handleCreate = async () => {
    if (!name.trim()) return;
    setLoading(true);
    try {
      const res = await fetch("/api/implementations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = await res.json() as { id: string };
      router.push(`/implementation/${data.id}/plan`);
    } finally {
      setLoading(false);
    }
  };

  if (showInput) {
    return (
      <div className="flex gap-2">
        <Input
          autoFocus
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleCreate()}
          placeholder="Nombre del proyecto..."
        />
        <Button
          variant="primary"
          size="md"
          onClick={handleCreate}
          loading={loading}
          disabled={!name.trim()}
        >
          Crear
        </Button>
        <Button variant="secondary" size="md" onClick={() => setShowInput(false)}>
          Cancelar
        </Button>
      </div>
    );
  }

  return (
    <Button
      variant={primary ? "primary" : "secondary"}
      size="md"
      onClick={() => setShowInput(true)}
    >
      + Nueva implementación
    </Button>
  );
}
