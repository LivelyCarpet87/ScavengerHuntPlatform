import { z } from "zod";

/*
 * Conventions for Server Actions used with React's useActionState:
 *
 *   "use server";
 *   export async function renameTeam(_prev: ActionState, formData: FormData): Promise<ActionState> {
 *     const parsed = parseForm(RenameSchema, formData);
 *     if (!parsed.ok) return parsed.state;
 *     ...
 *     return ok("Team renamed");
 *   }
 *
 * Validation messages are user-facing: say what to fix, in sentence case.
 */

export type ActionState<T = unknown> =
  | { ok: true; message?: string; data?: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string> }
  | null;

export function ok<T = unknown>(message?: string, data?: T): ActionState<T> {
  return { ok: true, message, data };
}

export function fail(error: string, fieldErrors?: Record<string, string>): ActionState<never> {
  return { ok: false, error, fieldErrors };
}

/** FormData → plain object. Keys ending in [] (or repeated keys) become arrays. */
export function formToObject(formData: FormData): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [rawKey, value] of formData.entries()) {
    if (rawKey.startsWith("$ACTION")) continue;
    const isArray = rawKey.endsWith("[]");
    const key = isArray ? rawKey.slice(0, -2) : rawKey;
    if (isArray) {
      const list = (out[key] as unknown[]) ?? [];
      list.push(value);
      out[key] = list;
    } else if (key in out) {
      const prev = out[key];
      out[key] = Array.isArray(prev) ? [...prev, value] : [prev, value];
    } else {
      out[key] = value;
    }
  }
  return out;
}

export function parseForm<S extends z.ZodType>(
  schema: S,
  formData: FormData,
): { ok: true; data: z.infer<S> } | { ok: false; state: ActionState<never> } {
  const result = schema.safeParse(formToObject(formData));
  if (result.success) return { ok: true, data: result.data };
  const fieldErrors: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const key = issue.path.join(".") || "_form";
    fieldErrors[key] ??= issue.message;
  }
  const first = result.error.issues[0]?.message ?? "Check the highlighted fields.";
  return {
    ok: false,
    state: fail(Object.keys(fieldErrors).length > 1 ? "Check the highlighted fields." : first, fieldErrors),
  };
}

// Reusable field schemas for FormData input -----------------------------------

/** Checkbox/switch: present as "on"/"true" when checked, absent otherwise. */
export const zCheckbox = z.preprocess((v) => v === "on" || v === "true" || v === true, z.boolean());

/** Optional text: empty strings become null. */
export const zOptionalText = (max = 2000) =>
  z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? null : v), z.string().trim().max(max).nullable());

/** Integer input. Empty becomes null when optional. */
export const zInt = (opts: { min?: number; max?: number; label?: string } = {}) => {
  const label = opts.label ?? "This";
  let n = z.coerce.number({ message: `${label} must be a number.` }).int(`${label} must be a whole number.`);
  if (opts.min != null) n = n.min(opts.min, `${label} must be at least ${opts.min}.`);
  if (opts.max != null) n = n.max(opts.max, `${label} must be at most ${opts.max}.`);
  return n;
};

export const zOptionalInt = (opts: { min?: number; max?: number; label?: string } = {}) =>
  z.preprocess((v) => (v === "" || v == null ? null : v), zInt(opts).nullable());

/**
 * Date from <DateTimeField>, which submits an ISO string in UTC (or "").
 * The browser does the local→UTC conversion, so no timezone guessing here.
 */
export const zOptionalDate = z.preprocess(
  (v) => (typeof v === "string" && v.trim() !== "" ? new Date(v) : null),
  z
    .date({ message: "Enter a valid date and time." })
    .refine((d) => !Number.isNaN(d.getTime()), "Enter a valid date and time.")
    .nullable(),
);
