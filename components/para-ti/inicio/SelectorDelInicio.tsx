"use client";

/**
 * SelectorDelInicio — «Tu día · Tu cartera» (Ventas), «Tu día · Tus cuentas» (CSE), «Tu día · La cartera» (CSL) o
 * «Tu día · Clientes con desarrollo» (Desarrollo), en la cabecera del inicio (ficha D, 2026-10-17). Vive en `?vista=`.
 */
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Segmentado } from "@/components/ui";

export default function SelectorDelInicio({ valor, otra }: { valor: string; otra: { clave: string; etiqueta: string; cuenta: number } }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  return (
    <Segmentado
      etiqueta="Vista"
      tamano="grande"
      opciones={[
        { clave: "dia", etiqueta: "Tu día" },
        { clave: otra.clave, etiqueta: otra.etiqueta, cuenta: otra.cuenta },
      ]}
      valor={valor}
      onCambio={(k) => {
        const p = new URLSearchParams(params.toString());
        for (const quitar of ["vista", "cartera", "negocio"]) p.delete(quitar);
        if (k !== "dia") p.set("vista", k);
        const q = p.toString();
        router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false });
      }}
    />
  );
}
