import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";

export const REPO = "https://github.com/fakepixels/auto-design";

/** What people copy to start. One command per line. */
export const START = `git clone ${REPO}
cd auto-design
npm install
npx auto-design init`;

export const TITLE = "auto-design";
export const DESCRIPTION = "A design system in minutes, and agents that never go off-brand.";

/** Each line arrives after the one before it, the system's stagger apart. */
const after = (n: number) => ({ animationDelay: `calc(var(--stagger) * ${n * 2})` });

function Mark() {
  return (
    <span aria-hidden className="grid size-6 place-items-center rounded-sm bg-foreground">
      <span className="size-2.5 rounded-full bg-background" />
    </span>
  );
}

function GitHubIcon() {
  return (
    <svg aria-hidden viewBox="0 0 16 16" fill="currentColor">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
    </svg>
  );
}

function CopyButton({ text }: { text: string }) {
  return (
    <Button
      variant="ghost"
      size="icon"
      data-copy={text}
      aria-label="Copy the commands"
      className="group size-7 text-muted-foreground hover:text-foreground"
    >
      <svg aria-hidden viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="group-data-copied:hidden">
        <rect x="5.25" y="5.25" width="8.5" height="8.5" rx="2" />
        <path d="M10.75 5.25V3.75a1.5 1.5 0 0 0-1.5-1.5h-5.5a1.5 1.5 0 0 0-1.5 1.5v5.5a1.5 1.5 0 0 0 1.5 1.5h1.5" />
      </svg>
      <svg aria-hidden viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="hidden group-data-copied:block">
        <path d="m3.5 8.5 3 3 6-7" />
      </svg>
    </Button>
  );
}

/** Where the demo lives: auto-design's own design site, copied next to this page by the build. */
export const DEMO = "demo/";

/**
 * The whole page. `start` is the commands as a rendered CodeBlock (it's async, so the build renders it
 * first); `showcase` is the showcase's own prerendered HTML, which the browser hydrates on its own.
 */
export function Page({ start, showcase }: { start: ReactNode; showcase: string }) {
  return (
    <div className="flex min-h-svh flex-col">
      <header className="mx-auto flex h-16 w-full max-w-5xl items-center justify-between px-6">
        <a href="./" className="flex items-center gap-2.5 text-sm font-medium">
          <Mark />
          auto-design
        </a>
        <nav className="flex items-center gap-1">
          <Button asChild variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground">
            <a href={DEMO}>Demo</a>
          </Button>
          <Button asChild variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground">
            <a href={REPO}>
              <GitHubIcon />
              GitHub
            </a>
          </Button>
        </nav>
      </header>

      <main className="flex-1">
        <section className="mx-auto flex max-w-5xl flex-col items-center px-6 pt-24 text-center sm:pt-32">
          <h1 style={after(0)} className="max-w-3xl animate-reveal text-4xl font-medium sm:text-5xl lg:max-w-none lg:text-6xl">
            <span className="lg:block">A design system in minutes,</span>{" "}
            <span className="lg:block">and agents that never go off-brand.</span>
          </h1>
          <p style={after(1)} className="mt-6 max-w-xl animate-reveal text-lg text-pretty text-muted-foreground">
            Make a few choices by looking. Get a repo with a locked Tailwind theme, shadcn components, a design
            site and a checker that fails the build when anything drifts.
          </p>
          <div style={after(2)} className="mt-10 flex animate-reveal flex-wrap items-center justify-center gap-3">
            <Button asChild size="lg" className="rounded-full">
              <a href="#start">Start your system</a>
            </Button>
            <Button asChild size="lg" variant="outline" className="rounded-full">
              <a href={REPO}>View on GitHub</a>
            </Button>
          </div>
        </section>

        <section style={after(3)} className="mx-auto mt-20 max-w-5xl animate-reveal px-4 sm:mt-24 sm:px-6">
          <div id="showcase" dangerouslySetInnerHTML={{ __html: showcase }} />
          <p className="mt-6 text-center text-sm text-balance text-muted-foreground">
            Real components from auto-design&rsquo;s own system.{" "}
            <a href={DEMO} className="text-foreground underline-offset-4 hover:underline">
              See the whole system
            </a>
          </p>
        </section>

        <section id="start" className="mx-auto max-w-2xl scroll-mt-8 px-6 pt-24 pb-32 sm:pt-32">
          <h2 className="text-2xl font-medium">Start in a minute</h2>
          <p className="mt-2 text-muted-foreground">
            You need Node 20 or newer. Onboarding opens in your browser, and nothing is written until you publish.
          </p>
          <div data-slot="terminal" className="mt-6 overflow-hidden rounded-lg border bg-muted">
            <div className="flex h-10 items-center justify-between pr-1.5 pl-4 text-xs text-muted-foreground">
              Terminal
              <CopyButton text={START} />
            </div>
            {start}
          </div>
        </section>
      </main>

      <footer className="border-t">
        <div className="mx-auto flex max-w-5xl flex-col gap-2 px-6 py-8 text-sm text-muted-foreground sm:flex-row sm:justify-between">
          <p>Open source under the MIT license.</p>
          <p>
            Built with{" "}
            <a href={`${REPO}/tree/main/brand`} className="text-foreground underline-offset-4 hover:underline">
              auto-design&rsquo;s own design system
            </a>
            , made in its onboarding.
          </p>
        </div>
      </footer>
    </div>
  );
}
