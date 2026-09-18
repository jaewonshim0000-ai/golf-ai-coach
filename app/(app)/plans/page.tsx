import { redirect } from "next/navigation";

/** Training plans were removed; the next session is built on /practice instead. */
export default function PlansRedirect() {
  redirect("/practice");
}
