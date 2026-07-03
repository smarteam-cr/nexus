import { redirect } from "next/navigation";

// El hub de Marketing abre en la subsección de Ideas (la salida principal).
export default function MarketingIndexPage() {
  redirect("/marketing/ideas");
}
