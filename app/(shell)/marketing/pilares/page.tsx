import { redirect } from "next/navigation";

// "Pilares" se renombró a "Temas". Redirect para no romper bookmarks.
export default function MarketingPilaresRedirect() {
  redirect("/marketing/temas");
}
