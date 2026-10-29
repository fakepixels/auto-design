import { type CSSProperties, useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Message, ToolCall } from "@/components/ui/message";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

/** The corner radii the system offers here, in px. The system itself is built at 12. */
const CORNERS = [4, 8, 12, 16];

/** The radius steps the system derives from its base, the same way its CSS does. */
const steps = (r: number) => [
  ["rounded-sm", Math.max(0, r - 4)],
  ["rounded-md", Math.max(0, r - 2)],
  ["rounded-lg", r],
  ["rounded-xl", r + 4],
] as const;

/**
 * The system's radius tokens at another base. The steps resolve where the theme defines them, so they're
 * set here directly, not just the base they derive from.
 */
const radii = (r: number) =>
  Object.fromEntries([["--radius", `${r}px`], ...steps(r).map(([name, px]) => [`--${name.replace("rounded", "radius")}`, `${px}px`])]) as CSSProperties;

/**
 * Switch the page's color mode and remember it under the demo's key, so the demo opens in the same mode
 * (the build puts the class, default and key on <html>, read from the demo itself).
 */
function setMode(light: boolean) {
  const root = document.documentElement;
  const { modeClass = "light", defaultMode = "dark", storageKey } = root.dataset;
  const mode = light ? "light" : "dark";
  root.classList.toggle(modeClass, mode !== defaultMode);
  try {
    if (storageKey) localStorage.setItem(storageKey, mode);
  } catch {
    // No storage: the mode still switches on this page.
  }
}

const CHECKS = ["Colors come from roles", "Text passes AA, light and dark", "Sizes on the type scale", "Corners on the radius steps"];

/**
 * Three cards built from auto-design's own components. One choice, the corners, drives all of them: the
 * agent's change, the tokens it touched and every component's corners, through the system's own --radius.
 */
export function Showcase() {
  const [change, setChange] = useState({ from: 8, to: 12 });
  const [light, setLight] = useState(false);

  // The page's mode lives on <html>; follow it, including the reader's own setting.
  useEffect(() => {
    const root = document.documentElement;
    const sync = () => setLight(root.classList.contains("light"));
    sync();
    const watch = new MutationObserver(sync);
    watch.observe(root, { attributes: true, attributeFilter: ["class"] });
    return () => watch.disconnect();
  }, []);

  const pick = (to: number) => setChange((c) => (c.to === to ? c : { from: c.to, to }));
  const rounder = change.to >= change.from;

  return (
    <div style={radii(change.to)} className="grid gap-4 text-left md:grid-cols-3">
      <Card>
        <CardHeader>
          <CardTitle>Ask for a change</CardTitle>
          <CardDescription>Agents change the config, never the CSS.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Message from="user">Make the corners a little {rounder ? "rounder" : "sharper"}.</Message>
          <ToolCall name="update_config" status="done" open>
            radius: {change.from} → {change.to}
          </ToolCall>
          <Message from="assistant">
            Corners are {change.to}px now. Buttons, fields and cards follow, and the check still passes.
          </Message>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Review it</CardTitle>
          <CardDescription>Checked before you keep it.</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="checks">
            <TabsList>
              <TabsTrigger value="checks">Checks</TabsTrigger>
              <TabsTrigger value="tokens">Tokens</TabsTrigger>
            </TabsList>
            <TabsContent value="checks">
              <Table>
                <TableBody>
                  {CHECKS.map((c) => (
                    <TableRow key={c}>
                      <TableCell className="text-muted-foreground">{c}</TableCell>
                      <TableCell className="text-right">
                        <Badge variant="success">Pass</Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TabsContent>
            <TabsContent value="tokens">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Token</TableHead>
                    <TableHead className="text-right">Before</TableHead>
                    <TableHead className="text-right">After</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {steps(change.to).map(([name, after], i) => (
                    <TableRow key={name}>
                      <TableCell className="font-mono text-xs">{name}</TableCell>
                      <TableCell className="text-right text-muted-foreground tabular-nums">{steps(change.from)[i]![1]}px</TableCell>
                      <TableCell className="text-right tabular-nums">{after}px</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TabsContent>
          </Tabs>
        </CardContent>
        <CardFooter>
          <Button>Keep it</Button>
          <Button variant="outline">Undo</Button>
        </CardFooter>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Try a choice</CardTitle>
          <CardDescription>Every component on this page follows it.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <div className="flex flex-col gap-2.5">
            <Label id="corners-label">Corners</Label>
            <div role="group" aria-labelledby="corners-label" className="grid grid-cols-4 gap-1 rounded-lg bg-muted p-1">
              {CORNERS.map((r) => (
                <Button
                  key={r}
                  size="sm"
                  variant={change.to === r ? "outline" : "ghost"}
                  aria-pressed={change.to === r}
                  onClick={() => pick(r)}
                  className="tabular-nums"
                >
                  {r}px
                </Button>
              ))}
            </div>
          </div>
          <Separator />
          <div className="flex items-center justify-between gap-4">
            <Label htmlFor="light-mode">Light mode</Label>
            <Switch id="light-mode" checked={light} onCheckedChange={setMode} />
          </div>
          <Separator />
          <div className="flex flex-col gap-2.5">
            <Label htmlFor="system-name">Name your system</Label>
            <div className="flex gap-2">
              <Input id="system-name" defaultValue="Northwind" />
              <Button type="button" variant="secondary">
                Create
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
