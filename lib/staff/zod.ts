import { z } from "zod";

/*
 * FormData field schemas with organizer-friendly messages. Labels are
 * lower-case nouns ("the title", "points") and get capitalized as needed.
 */

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const emptyToUndefined = (v: unknown) => (v === "" || v == null ? undefined : v);
const emptyToNull = (v: unknown) => (typeof v === "string" && v.trim() === "" ? null : (v ?? null));

/** Ids posted in hidden fields. A bad one means a stale page, not user error. */
export const zId = z
  .string({ message: "This page is out of date. Reload it and try again." })
  .trim()
  .min(1, "This page is out of date. Reload it and try again.")
  .max(64, "This page is out of date. Reload it and try again.");

export const zText = (label: string, opts: { min?: number; max: number }) =>
  z
    .string({ message: `Enter ${label}.` })
    .trim()
    .min(
      opts.min ?? 1,
      (opts.min ?? 1) <= 1 ? `Enter ${label}.` : `${cap(label)} needs at least ${opts.min} characters.`,
    )
    .max(opts.max, `${cap(label)} can be up to ${opts.max} characters.`);

/** Optional text: blank becomes null. */
export const zOptText = (label: string, max: number) =>
  z.preprocess(
    emptyToNull,
    z
      .string()
      .trim()
      .max(max, `${cap(label)} can be up to ${max} characters.`)
      .nullable(),
  );

/** Long free text (Markdown) that may be empty. */
export const zLongText = (label: string, max: number) =>
  z.preprocess(
    (v) => (typeof v === "string" ? v : ""),
    z.string().max(max, `${cap(label)} can be up to ${max.toLocaleString("en-US")} characters.`),
  );

export const zNumber = (label: string, opts: { min?: number; max?: number } = {}) => {
  let n = z.coerce.number({ message: `Enter ${label} as a number.` }).int(`Use a whole number for ${label}.`);
  if (opts.min != null) n = n.min(opts.min, `${cap(label)} can’t be less than ${opts.min}.`);
  if (opts.max != null) n = n.max(opts.max, `${cap(label)} can be at most ${opts.max.toLocaleString("en-US")}.`);
  return z.preprocess(emptyToUndefined, n);
};

/** Optional whole number: blank becomes null. */
export const zOptNumber = (label: string, opts: { min?: number; max?: number } = {}) => {
  let n = z.coerce.number({ message: `Enter ${label} as a number.` }).int(`Use a whole number for ${label}.`);
  if (opts.min != null) n = n.min(opts.min, `${cap(label)} can’t be less than ${opts.min}.`);
  if (opts.max != null) n = n.max(opts.max, `${cap(label)} can be at most ${opts.max.toLocaleString("en-US")}.`);
  return z.preprocess((v) => (v === "" || v == null ? null : v), n.nullable());
};

/** A file input: absent or empty uploads become null. */
export const zOptFile = z.preprocess(
  (v) => (v instanceof Blob && v.size > 0 ? v : null),
  z.instanceof(Blob).nullable(),
);
