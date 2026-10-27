/**
 * components/external/test/SelectorDeIndustria.tsx — LA INDUSTRIA del test público: la lista de Smarteam (la misma de
 * «Datos de la empresa»), con «Otra» al final. La usan la entrada (`/external/test`) y el paso de la industria de la
 * página del área. Página del cliente (§1-WEB): hex literal.
 */
import { INDUSTRIAS_DE_SMARTEAM } from "@/lib/clients/datos-de-la-empresa";
import { OTRA_INDUSTRIA } from "@/lib/tests-diagnostico/direccion-publica";

export default function SelectorDeIndustria({ id, valor }: { id: string; valor: string | null }) {
  return (
    <select
      id={id}
      name="industria"
      required
      defaultValue={valor ?? ""}
      style={{ width: "100%", maxWidth: 420, padding: "11px 12px", borderRadius: 10, border: "1px solid #dfe5f1", fontSize: 15, color: "#0f1b3d", background: "#fff", fontFamily: "inherit" }}
    >
      <option value="" disabled>
        Elige una
      </option>
      {INDUSTRIAS_DE_SMARTEAM.map((i) => (
        <option key={i.valor} value={i.valor}>
          {i.etiqueta}
        </option>
      ))}
      <option value={OTRA_INDUSTRIA}>{OTRA_INDUSTRIA}</option>
    </select>
  );
}
