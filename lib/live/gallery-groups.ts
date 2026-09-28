/*
 * Grouping and paging of the photo gallery (pure, client-safe). A big hunt
 * has thousands of accepted photos; a page shows a bounded slice of them so
 * phones never download, hydrate and lay out the whole event at once.
 */

import { describeMedia, type FeedTask, type FeedTeam, type GalleryItem } from "./types";

type GroupBase = {
  key: string;
  items: GalleryItem[];
  /** "45 photos and 2 videos": the whole group, also when a page shows only part of it. */
  summary: string;
  /** The group began on an earlier page. */
  continued: boolean;
};

export type GalleryGroup = (GroupBase & { by: "task"; task: FeedTask }) | (GroupBase & { by: "team"; team: FeedTeam });

/** Photos and videos per page. */
export const GALLERY_PAGE_SIZE = 96;

/** One group per task (in the organizers' order, as loaded) or per team (alphabetical). */
export function groupGallery(items: GalleryItem[], by: "task" | "team"): GalleryGroup[] {
  const groups = new Map<string, GalleryGroup>();
  for (const item of items) {
    const key = by === "task" ? item.task.id : item.team.id;
    let group = groups.get(key);
    if (!group) {
      const base = { key, items: [], summary: "", continued: false };
      group = by === "task" ? { ...base, by, task: item.task } : { ...base, by, team: item.team };
      groups.set(key, group);
    }
    group.items.push(item);
  }
  const list = [...groups.values()];
  for (const group of list) group.summary = describeMedia(group.items);
  if (by === "team") {
    const name = (g: GalleryGroup) => (g.by === "team" ? g.team.name : "");
    list.sort((a, b) => name(a).localeCompare(name(b)));
  }
  return list;
}

/** The page number asked for in the URL (`?page=`), 1 when missing or invalid. */
export function parsePage(value: string | string[] | undefined): number {
  const n = Number(Array.isArray(value) ? value[0] : value);
  return Number.isInteger(n) && n >= 1 ? n : 1;
}

/**
 * Page `page` (1-based, clamped) of the groups in display order: at most
 * `size` items, cutting a group where the page ends and continuing it on
 * the next one.
 */
export function galleryPage(
  groups: GalleryGroup[],
  page: number,
  size = GALLERY_PAGE_SIZE,
): { groups: GalleryGroup[]; page: number; pages: number } {
  const total = groups.reduce((n, g) => n + g.items.length, 0);
  const pages = Math.max(1, Math.ceil(total / size));
  const current = Math.min(Math.max(1, Math.floor(page)), pages);
  const start = (current - 1) * size;
  const end = start + size;
  const out: GalleryGroup[] = [];
  let offset = 0;
  for (const group of groups) {
    if (offset >= end) break;
    const from = Math.max(0, start - offset);
    const to = Math.min(group.items.length, end - offset);
    if (from < to) out.push({ ...group, items: group.items.slice(from, to), continued: from > 0 });
    offset += group.items.length;
  }
  return { groups: out, page: current, pages };
}
