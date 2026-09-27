"use client";

import { Fragment } from "react";
import { Dialog } from "@/components/ui/dialog";
import { Kbd } from "@/components/ui/misc";

/** Each row: alternative key combinations (joined with "or"), each a list of keys pressed together. */
type Row = { keys: string[][]; what: string };

const GROUPS: { title: string; rows: Row[] }[] = [
  {
    title: "Decide",
    rows: [
      { keys: [["A"]], what: "Approve" },
      { keys: [["R"]], what: "Reject" },
      { keys: [["S"]], what: "Skip for now" },
      { keys: [["Ctrl", "Enter"]], what: "Approve while typing (⌘ Enter on a Mac)" },
      { keys: [["U"], ["Ctrl", "Z"]], what: "Undo the last decision" },
    ],
  },
  {
    title: "Move",
    rows: [
      { keys: [["J"], ["↓"]], what: "Next in the queue" },
      { keys: [["K"], ["↑"]], what: "Previous in the queue" },
      { keys: [["←"], ["→"]], what: "Other photos in the same submission" },
    ],
  },
  {
    title: "Write",
    rows: [
      { keys: [["F"]], what: "Type feedback" },
      { keys: [["1"], ["9"]], what: "Add saved reply 1 to 9" },
      { keys: [["P"]], what: "Points to award, or the measured value in contests" },
      { keys: [["Esc"]], what: "Leave a text field, or fit a zoomed photo back" },
      { keys: [["?"]], what: "Show these shortcuts" },
    ],
  },
];

function Keys({ keys, range }: { keys: string[][]; range: boolean }) {
  return (
    <span className="flex flex-wrap items-center gap-1 text-xs text-ink-3">
      {keys.map((combo, i) => (
        <Fragment key={combo.join("+")}>
          {i > 0 ? <span className="px-0.5">{range ? "to" : "or"}</span> : null}
          <span className="flex items-center gap-0.5">
            {combo.map((k) => (
              <Kbd key={k} className="h-6 min-w-6 text-xs">
                {k}
              </Kbd>
            ))}
          </span>
        </Fragment>
      ))}
    </span>
  );
}

export function ShortcutSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Keyboard shortcuts"
      description="Shortcuts pause while you type in a field."
      className="sm:max-w-2xl"
    >
      <div className="grid gap-x-8 gap-y-6 sm:grid-cols-2">
        {GROUPS.map((group) => (
          <section key={group.title} className={group.title === "Write" ? "sm:col-span-2" : undefined}>
            <h3 className="mb-2 font-semibold">{group.title}</h3>
            <dl className="divide-y divide-line border-y border-line">
              {group.rows.map((row) => (
                <div key={row.what} className="flex items-center justify-between gap-4 py-2">
                  <dt className="text-sm text-ink">{row.what}</dt>
                  <dd className="shrink-0">
                    <Keys keys={row.keys} range={row.keys[0]?.[0] === "1"} />
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
    </Dialog>
  );
}
