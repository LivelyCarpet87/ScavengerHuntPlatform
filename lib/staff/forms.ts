import type { ActionState } from "@/lib/actions";

/*
 * Small, pure helpers for organizer forms (safe in the browser and in tests).
 */

/**
 * The message to show beside a form's submit button. When every error is
 * already shown next to its field (listed in `inline`), repeating it there is
 * just noise, so this returns null; errors about anything else still show.
 * Keys with a dot (e.g. "slug.suggestion") carry data, not errors.
 */
export function formLevel<T>(state: ActionState<T>, inline: string[]): ActionState<T> {
  if (!state || state.ok || !state.fieldErrors) return state;
  const keys = Object.keys(state.fieldErrors).filter((k) => !k.includes("."));
  return keys.length > 0 && keys.every((k) => inline.includes(k)) ? null : state;
}

/** Keeps what people type link-shaped while they type: lowercase letters, digits and dashes. */
export function linkish(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9-]/g, "-");
}

/** Tidies a typed link: no doubled, leading or trailing dashes. */
export function tidySlug(value: string): string {
  return value.replace(/-+/g, "-").replace(/^-|-$/g, "");
}
