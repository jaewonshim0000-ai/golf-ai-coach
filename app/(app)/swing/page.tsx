import { redirect } from "next/navigation";

/** Swing merged into /train. */
export default function SwingRedirect() {
  redirect("/train?tab=swing");
}
