"use server";

import { redirect } from "next/navigation";
import { signOutUser } from "./session";

/** Signs the staff user out on this device (hunts joined as a player stay joined). */
export async function signOutAction(): Promise<void> {
  await signOutUser();
  redirect("/");
}
