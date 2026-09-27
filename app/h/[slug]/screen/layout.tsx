import type { ReactNode } from "react";
import { ScreenDocument } from "@/components/screen/screen-document";

/**
 * The big screen lives outside the player shell. This layout switches the
 * document to Night-O (or ?theme=light) and the projector type scale before
 * anything paints, including the loading state, and restores both when the
 * viewer leaves the screen.
 */
export default function ScreenLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <ScreenDocument />
      {children}
    </>
  );
}
