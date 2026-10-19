import type { SpecimenCopy } from "../site/copy.js";
import type { DesignSystem } from "../system.js";
import { componentSources } from "./components.js";

/**
 * Live examples for the design site: real components, written with the
 * product's own copy. Each one is a module whose default export renders the
 * example. The first example for a component is its preview; the rest are
 * listed under "Examples" on its page. Every example passes `auto-design check`.
 */
export interface ComponentExample {
  /** "button" for the main preview, "button-sizes" for a variant. */
  name: string;
  /** The component this example belongs to. */
  component: string;
  title: string;
  code: string;
}

/** JSX text: plain when safe, an expression when it holds characters JSX would read. */
const text = (s: string) => (/[{}<>&]/.test(s) ? `{${JSON.stringify(s)}}` : s);
/** A JSX attribute value. */
const attr = (s: string) => (/["\\]/.test(s) ? `{${JSON.stringify(s)}}` : `"${s}"`);
const initials = (name: string) =>
  name
    .split(/\s+/)
    .map((w) => w[0] ?? "")
    .join("")
    .slice(0, 2)
    .toUpperCase();

export function componentExamples(s: DesignSystem, copy: SpecimenCopy): ComponentExample[] {
  const has = new Set(componentSources(s).filter((c) => !c.custom).map((c) => c.name));
  const rows = copy.table.rows;
  const [c0, c1, c2, c3] = copy.table.columns;
  const people = rows.map((r) => r.detail);
  const out: ComponentExample[] = [];
  const add = (component: string, name: string, title: string, code: string) => {
    if (has.has(component)) out.push({ component, name, title, code: code.trimStart() });
  };

  add(
    "button",
    "button",
    "Button",
    `
import { Button } from "@/components/ui/button";

export default function ButtonExample() {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button>${text(copy.primaryAction)}</Button>
      <Button variant="secondary">Share</Button>
      <Button variant="outline">Export</Button>
      <Button variant="ghost">Cancel</Button>
    </div>
  );
}
`,
  );
  add(
    "button",
    "button-sizes",
    "Sizes",
    `
import { Button } from "@/components/ui/button";

export default function ButtonSizes() {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button size="sm">Small</Button>
      <Button>Default</Button>
      <Button size="lg">Large</Button>
    </div>
  );
}
`,
  );
  add(
    "button",
    "button-destructive",
    "Destructive and link",
    `
import { Button } from "@/components/ui/button";

export default function ButtonDestructive() {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button variant="destructive">Delete project</Button>
      <Button variant="link">Learn more</Button>
      <Button disabled>Saving</Button>
    </div>
  );
}
`,
  );

  add(
    "card",
    "card",
    "Card",
    `
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";

export default function CardExample() {
  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>${text(copy.pageTitle)}</CardTitle>
        <CardDescription>${text(copy.pageSummary)}</CardDescription>
      </CardHeader>
      <CardContent>
        <dl className="grid grid-cols-3 gap-4">
${copy.metrics
  .slice(0, 3)
  .map(
    (m) => `          <div>
            <dt className="text-xs text-muted-foreground">${text(m.label)}</dt>
            <dd className="text-2xl font-semibold tabular-nums">${text(m.value)}</dd>
          </div>`,
  )
  .join("\n")}
        </dl>
      </CardContent>
      <CardFooter className="gap-2">
        <Button>${text(copy.primaryAction)}</Button>
        <Button variant="ghost">View details</Button>
      </CardFooter>
    </Card>
  );
}
`,
  );

  add(
    "input",
    "input",
    "Input",
    `
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function InputExample() {
  return (
    <div className="grid w-full max-w-sm gap-2">
      <Label htmlFor="project-name">Project name</Label>
      <Input id="project-name" placeholder=${attr(rows[0]?.name ?? "Website refresh")} />
      <p className="text-sm text-muted-foreground">Shown to everyone on the team.</p>
    </div>
  );
}
`,
  );
  add(
    "input",
    "input-with-button",
    "With a button",
    `
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function InputWithButton() {
  return (
    <form className="flex w-full max-w-sm items-center gap-2">
      <Input type="email" placeholder="name@company.com" aria-label="Email" />
      <Button type="submit" variant="secondary">Invite</Button>
    </form>
  );
}
`,
  );

  add(
    "badge",
    "badge",
    "Badge",
    `
import { Badge } from "@/components/ui/badge";

export default function BadgeExample() {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Badge>${text(copy.statusLabel)}</Badge>
      <Badge variant="secondary">Draft</Badge>
      <Badge variant="outline">Archived</Badge>
      <Badge variant="success">On track</Badge>
      <Badge variant="warning">Needs review</Badge>
      <Badge variant="destructive">Over budget</Badge>
    </div>
  );
}
`,
  );

  add(
    "toaster",
    "toaster",
    "Toaster",
    `
"use client";

import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Toaster } from "@/components/ui/toaster";

export default function ToasterExample() {
  return (
    <>
      <Button
        variant="outline"
        onClick={() => toast(${JSON.stringify(copy.done)}, { description: ${JSON.stringify(copy.pageSummary)} })}
      >
        Show a toast
      </Button>
      <Toaster />
    </>
  );
}
`,
  );

  add(
    "message",
    "message",
    "Message",
    `
import { Message, ToolCall } from "@/components/ui/message";

export default function MessageExample() {
  return (
    <div className="flex w-full max-w-lg flex-col gap-4">
      <Message from="user">${text(copy.chat.question)}</Message>
      <ToolCall name=${attr(copy.chat.tool)} status="done">
        ${text(copy.chat.toolArgs)}
      </ToolCall>
      <Message from="assistant">${text(copy.chat.answer)}</Message>
    </div>
  );
}
`,
  );

  add(
    "label",
    "label",
    "Label",
    `
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export default function LabelExample() {
  return (
    <div className="grid w-full max-w-sm gap-2">
      <Label htmlFor="note">Note for the team</Label>
      <Textarea id="note" placeholder="What changed and why" />
    </div>
  );
}
`,
  );

  add(
    "textarea",
    "textarea",
    "Textarea",
    `
import { Textarea } from "@/components/ui/textarea";

export default function TextareaExample() {
  return <Textarea className="max-w-sm" placeholder="Add a note for the team" aria-label="Note" />;
}
`,
  );

  add(
    "separator",
    "separator",
    "Separator",
    `
import { Separator } from "@/components/ui/separator";

export default function SeparatorExample() {
  return (
    <div className="w-full max-w-sm">
      <p className="text-sm font-medium">${text(copy.product)}</p>
      <p className="text-sm text-muted-foreground">${text(copy.subhead)}</p>
      <Separator className="my-4" />
      <div className="flex h-5 items-center gap-4 text-sm">
${copy.nav
  .slice(0, 3)
  .map((n, i) => `${i ? `        <Separator orientation="vertical" />\n` : ""}        <span>${text(n)}</span>`)
  .join("\n")}
      </div>
    </div>
  );
}
`,
  );

  add(
    "skeleton",
    "skeleton",
    "Skeleton",
    `
import { Skeleton } from "@/components/ui/skeleton";

export default function SkeletonExample() {
  return (
    <div className="flex items-center gap-4">
      <Skeleton className="size-10 rounded-full" />
      <div className="grid gap-2">
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-4 w-32" />
      </div>
    </div>
  );
}
`,
  );

  add(
    "table",
    "table",
    "Table",
    `
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const rows = ${JSON.stringify(
      rows.map((r) => ({ name: r.name, owner: r.detail, value: r.value, ok: r.status === "ok" })),
      null,
      2,
    ).replace(/\n/g, "\n")};

export default function TableExample() {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>${text(c0)}</TableHead>
          <TableHead>${text(c1)}</TableHead>
          <TableHead className="text-right">${text(c2)}</TableHead>
          <TableHead>${text(c3)}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.name}>
            <TableCell className="font-medium">{row.name}</TableCell>
            <TableCell className="text-muted-foreground">{row.owner}</TableCell>
            <TableCell className="text-right tabular-nums">{row.value}</TableCell>
            <TableCell>
              <Badge variant={row.ok ? "success" : "warning"}>{row.ok ? "On track" : "Needs review"}</Badge>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
`,
  );

  add(
    "tabs",
    "tabs",
    "Tabs",
    `
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function TabsExample() {
  return (
    <Tabs defaultValue="overview" className="w-full max-w-md">
      <TabsList>
        <TabsTrigger value="overview">${text(copy.nav[0] ?? "Overview")}</TabsTrigger>
        <TabsTrigger value="projects">${text(copy.nav[1] ?? "Projects")}</TabsTrigger>
        <TabsTrigger value="reports">${text(copy.nav[2] ?? "Reports")}</TabsTrigger>
      </TabsList>
      <TabsContent value="overview" className="pt-4 text-sm text-muted-foreground">
        ${text(copy.pageSummary)}
      </TabsContent>
      <TabsContent value="projects" className="pt-4 text-sm text-muted-foreground">
        ${text(`${rows.length} projects, ${rows.filter((r) => r.status !== "ok").length} waiting on a decision.`)}
      </TabsContent>
      <TabsContent value="reports" className="pt-4 text-sm text-muted-foreground">
        ${text(`${copy.card.title} is ready to share.`)}
      </TabsContent>
    </Tabs>
  );
}
`,
  );

  add(
    "dialog",
    "dialog",
    "Dialog",
    `
"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export default function DialogExample() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button>${text(copy.primaryAction)}</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>${text(`${copy.primaryAction}?`)}</DialogTitle>
          <DialogDescription>${text(copy.pageSummary)}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Cancel</Button>
          </DialogClose>
          <DialogClose asChild>
            <Button>${text(copy.primaryAction)}</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
`,
  );

  add(
    "switch",
    "switch",
    "Switch",
    `
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

export default function SwitchExample() {
  return (
    <div className="flex items-center gap-3">
      <Switch id="weekly-summary" defaultChecked />
      <Label htmlFor="weekly-summary">Email me a weekly summary</Label>
    </div>
  );
}
`,
  );

  add(
    "avatar",
    "avatar",
    "Avatar",
    `
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

export default function AvatarExample() {
  return (
    <div className="flex items-center gap-2">
${people
  .slice(0, 4)
  .map((p) => `      <Avatar>\n        <AvatarFallback>${text(initials(p))}</AvatarFallback>\n      </Avatar>`)
  .join("\n")}
    </div>
  );
}
`,
  );

  add(
    "code-block",
    "code-block",
    "Code block",
    `
import { CodeBlock } from "@/components/ui/code-block";

const code = \`import { Button } from "@/components/ui/button";

export function Approve({ count }: { count: number }) {
  return <Button>${copy.primaryAction.replace(/[`$\\]/g, "")} ({count})</Button>;
}\`;

export default function CodeBlockExample() {
  return <CodeBlock code={code} lang="tsx" className="w-full max-w-lg" />;
}
`,
  );

  add(
    "approval",
    "approval",
    "Approval",
    `
"use client";

import * as React from "react";

import { Approval } from "@/components/ui/approval";

export default function ApprovalExample() {
  const [status, setStatus] = React.useState<"pending" | "approved" | "denied">("pending");
  return (
    <Approval
      className="w-full max-w-md"
      title="Send this summary to the project owners"
      status={status}
      approveLabel="Send"
      denyLabel="Don't send"
      approvedLabel="Sent"
      deniedLabel="Not sent"
      onApprove={() => setStatus("approved")}
      onDeny={() => setStatus("denied")}
    >
      3 people, by email. They can reply in the thread.
    </Approval>
  );
}
`,
  );

  add(
    "citation",
    "citation",
    "Citation",
    `
import { Citation, Sources } from "@/components/ui/citation";

const sources = [
  { title: ${JSON.stringify(`${copy.card.title}`)}, href: "https://example.com/reports/october" },
  { title: "Contractor hours by project", href: "https://example.com/data/hours" },
];

export default function CitationExample() {
  return (
    <div className="flex w-full max-w-lg flex-col gap-4">
      <p className="text-base">
        ${text(copy.chat.answer)}
        <Citation index={1} title={sources[0].title} href={sources[0].href} />
        <Citation index={2} title={sources[1].title} href={sources[1].href} />
      </p>
      <Sources sources={sources} />
    </div>
  );
}
`,
  );

  add(
    "streaming-text",
    "streaming-text",
    "Streaming text",
    `
"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import { StreamingText } from "@/components/ui/streaming-text";

const answer = ${JSON.stringify(copy.chat.answer)};

export default function StreamingTextExample() {
  const [count, setCount] = React.useState(0);
  const words = answer.split(" ");
  React.useEffect(() => {
    if (count >= words.length) return;
    const id = setTimeout(() => setCount((c) => c + 1), 60);
    return () => clearTimeout(id);
  }, [count, words.length]);
  return (
    <div className="flex w-full max-w-lg flex-col items-start gap-4">
      <StreamingText text={words.slice(0, count).join(" ")} streaming={count < words.length} />
      <Button size="sm" variant="outline" onClick={() => setCount(0)}>
        Replay
      </Button>
    </div>
  );
}
`,
  );

  add(
    "file-card",
    "file-card",
    "File card",
    `
import { FileCard } from "@/components/ui/file-card";

export default function FileCardExample() {
  return (
    <div className="flex flex-wrap gap-2">
      <FileCard name=${attr(`${copy.card.title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.pdf`)} size={284000} />
      <FileCard name="budget.csv" size={18200} />
    </div>
  );
}
`,
  );

  add(
    "reasoning",
    "reasoning",
    "Reasoning",
    `
import { Reasoning } from "@/components/ui/reasoning";

export default function ReasoningExample() {
  return (
    <Reasoning seconds={12} className="w-full max-w-lg" open>
      Compared this month's spend with the plan for each project, then looked for the single largest change.
    </Reasoning>
  );
}
`,
  );

  return out;
}
