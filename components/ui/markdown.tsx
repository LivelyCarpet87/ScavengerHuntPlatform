import ReactMarkdown from "react-markdown";
import { cn } from "@/lib/utils";

/**
 * Renders organizer-written Markdown (hunt intro, task descriptions,
 * announcements). Raw HTML is never rendered; links open in a new tab.
 */
export function Markdown({ children, className }: { children: string; className?: string }) {
  return (
    <div className={cn("flex flex-col gap-3 leading-relaxed text-ink [&_strong]:font-semibold", className)}>
      <ReactMarkdown
        skipHtml
        components={{
          h1: ({ children }) => <h3 className="font-cond text-xl font-bold">{children}</h3>,
          h2: ({ children }) => <h3 className="font-cond text-xl font-bold">{children}</h3>,
          h3: ({ children }) => <h4 className="font-semibold">{children}</h4>,
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-accent underline decoration-2 underline-offset-2"
            >
              {children}
            </a>
          ),
          ul: ({ children }) => <ul className="ml-5 list-disc space-y-1 marker:text-accent">{children}</ul>,
          ol: ({ children }) => (
            <ol className="ml-5 list-decimal space-y-1 marker:font-bib marker:text-accent">{children}</ol>
          ),
          blockquote: ({ children }) => (
            <blockquote className="border-l-4 border-sun pl-3 text-ink-2">{children}</blockquote>
          ),
          code: ({ children }) => <code className="rounded-xs bg-mist px-1 py-0.5 text-[0.9em]">{children}</code>,
          img: () => null,
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
