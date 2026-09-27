import type { Task } from "@/lib/db/schema";

/** What the task page's client components need to know about a task (never the answers or codes). */
export type ActionTask = Pick<
  Task,
  "id" | "code" | "title" | "kind" | "mediaAccept" | "maxAttempts" | "contestRank" | "contestUnit"
> & {
  /** Answer tasks with accepted answers are checked instantly; others go to a judge. */
  autoChecked: boolean;
};

export type TeamTaskState = "todo" | "pending" | "approved" | "rejected";
