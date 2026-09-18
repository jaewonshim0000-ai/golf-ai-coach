import { redirect } from "next/navigation";

/** Training plans were removed; today's session is built on /train instead. */
export default function PlansRedirect() {
  redirect("/train");
}
