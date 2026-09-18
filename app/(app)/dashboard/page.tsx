import { redirect } from "next/navigation";

/** The home screen is now Practice: priorities first, then the session. */
export default function DashboardRedirect() {
  redirect("/practice");
}
