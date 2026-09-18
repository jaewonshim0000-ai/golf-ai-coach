import { redirect } from "next/navigation";

/** The breakdowns moved onto /rounds, which is where the shots come from. */
export default function StatsRedirect() {
  redirect("/rounds");
}
