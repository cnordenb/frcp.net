// Simple mode (/simple): it loads no images, its loader still finds what it changes in index.html, and its extra
// elements stay hidden on the full page.
import assert from "node:assert/strict";
import { test } from "node:test";
import { exists, read } from "./helpers.js";

// The rules of a stylesheet as [selector, declarations], with @media blocks opened up
function cssRules(css) {
  const rules = [];
  const text = css.replace(/\/\*[\s\S]*?\*\//g, "");
  let i = 0;
  const walk = (end) => {
    while (i < end) {
      const open = text.indexOf("{", i);
      if (open < 0 || open >= end) return;
      const head = text.slice(i, open).trim();
      let depth = 1;
      let j = open + 1;
      while (depth && j < end) depth += text[j] === "{" ? 1 : text[j] === "}" ? -1 : 0, j++;
      if (head.startsWith("@")) {
        i = open + 1;
        walk(j - 1);
      } else {
        rules.push([head, text.slice(open + 1, j - 1)]);
      }
      i = j;
    }
  };
  walk(text.length);
  return rules;
}
// Declarations that load an image: a url() in any property but a custom one, which loads nothing until it's used
const loadsImage = (body) => body.split(";").some((d) => /url\(/.test(d) && !/^\s*--/.test(d));

test("simple mode's stylesheet loads no images", () => {
  assert.ok(exists("simple/simple.css"));
  assert.doesNotMatch(read("simple/simple.css").replace(/\/\*[\s\S]*?\*\//g, ""), /url\(/);
});

test("every image in style.css is scoped to the full page, so simple mode never loads it", () => {
  for (const [selector, body] of cssRules(read("style.css"))) {
    if (!loadsImage(body)) continue;
    for (const s of selector.split(/,(?![^(]*\))/)) {
      assert.match(s, /:not\(\[data-simple\]\)/, `style.css loads an image in simple mode for ${s.trim()}`);
    }
  }
});

test("the simple loader still finds everything it changes in index.html", () => {
  const loader = read("simple/index.html");
  const html = read("index.html");
  for (const [, from] of loader.matchAll(/\.replace\((['"])(.+?)\1,/g)) {
    assert.ok(html.includes(from), `simple/index.html replaces ${from}, which index.html no longer has`);
  }
  assert.ok(loader.includes('href="simple/simple.css"'));
});

test("simple mode's extra elements are hidden on the full page", () => {
  assert.ok(cssRules(read("style.css")).some(([s, body]) => s === ":root:not([data-simple]) .simple" && /display:\s*none\s*!important/.test(body)));
  assert.ok(/class="[^"]*\bsimple\b/.test(read("index.html")));
});
