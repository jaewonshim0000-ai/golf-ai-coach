import { redirect } from "next/navigation";

/** Train split into Swing and Practice, which is how the app is navigated now. */
export default function TrainRedirect() {
  redirect("/practice");
}
