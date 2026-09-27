import { redirect } from "next/navigation";

/** /join without a code: the code entry lives on the start page. */
export default function JoinIndex() {
  redirect("/");
}
