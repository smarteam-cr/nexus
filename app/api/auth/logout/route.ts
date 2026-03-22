import { NextResponse } from "next/server";
import { cookies } from "next/headers";

export async function POST() {
  const cookieStore = await cookies();
  cookieStore.delete("account_id");
  cookieStore.delete("consultant_session");
  return NextResponse.redirect(process.env.APP_URL + "/");
}
