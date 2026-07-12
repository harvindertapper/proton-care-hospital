import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("homepage source contains the Protone public experience", async () => {
  const [page, shell, data] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/components/SiteShell.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/lib/data.ts", import.meta.url), "utf8"),
  ]);

  assert.match(page, /Protone Care Hospital/);
  assert.match(page, /Department-only request/);
  assert.match(page, /24x7 confirmed/);
  assert.match(shell, /tel:\+919220463438|hospital\.phoneHref/);
  assert.match(shell, /https:\/\/wa\.me\/919220463438|hospital\.whatsappHref/);
  assert.match(data, /1\/23 Laxmi Garden, Sector 11/);
  assert.match(data, /सामान्य चिकित्सा/);
});

test("starter preview files are no longer referenced", async () => {
  const [page, layout, packageJson] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);

  assert.doesNotMatch(page, /SkeletonPreview|codex-preview/);
  assert.doesNotMatch(layout, /Starter Project|codex-preview/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
});
