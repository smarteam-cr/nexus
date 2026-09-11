"use client";

/**
 * components/documentacion/RedirigirAnclaVieja.tsx — rescata los enlaces del manual viejo.
 *
 * Hasta el 2026-09-11 el manual ERA `/documentacion`, y sus anclas (`#doc-kickoff`,
 * `#agentes`, `#agent-…`) andan pegadas en chats y en documentos. Ahora el manual es una página
 * dentro de la base, así que esos enlaces caen en el Inicio y no saltan a ningún lado.
 *
 * ⚠ Esto NO se puede resolver en el servidor: el navegador nunca manda la parte de la dirección
 * que va después del `#`. Por eso es un componente de cliente que la lee y reenvía.
 */
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { SECCIONES, SLUG_COMO_FUNCIONA } from "@/lib/manual/anclas";

export default function RedirigirAnclaVieja() {
  const router = useRouter();

  useEffect(() => {
    const hash = window.location.hash;
    if (!hash) return;
    const id = hash.slice(1);
    const esDelManualViejo =
      id.startsWith("doc-") ||
      id.startsWith("agent-") ||
      id.startsWith("etapa-") ||
      SECCIONES.some((s) => s.id === id);
    if (esDelManualViejo) router.replace(`/documentacion/${SLUG_COMO_FUNCIONA}${hash}`);
  }, [router]);

  return null;
}
