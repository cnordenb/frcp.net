// Measurements the WCAG tests take inside the page, which they inject as a script. Each returns a list of the
// problems it finds, as text, and an empty list when there are none.
window.wcag = (() => {
  const visible = (el) => {
    if (!(el instanceof Element) || !el.checkVisibility({ visibilityProperty: true })) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  const describe = (el) => {
    let s = el.tagName.toLowerCase() + (el.id ? "#" + el.id : "");
    const text = (el.getAttribute("aria-label") || el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 30);
    return text ? `${s} "${text}"` : s;
  };

  // Colours: [r, g, b, a] from rgb() and rgba(), WCAG's relative luminance and contrast ratio, and the opaque
  // colour behind an element, with any translucent layers laid over white
  const rgba = (c) => {
    const m = /rgba?\(([^)]+)\)/.exec(c);
    if (!m) return null;
    const p = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
    return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1];
  };
  const luminance = ([r, g, b]) => {
    const f = (v) => ((v /= 255) <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const ratio = (a, b) => {
    const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
  };
  function background(el) {
    const layers = [];
    for (let e = el; e; e = e.parentElement) {
      const c = rgba(getComputedStyle(e).backgroundColor);
      if (c && c[3] > 0) {
        layers.push(c);
        if (c[3] >= 1) break;
      }
    }
    let base = [255, 255, 255];
    for (const c of layers.reverse()) base = base.map((v, i) => v * (1 - c[3]) + c[i] * c[3]);
    return base;
  }

  // Text, as the boxes of its lines, cut to what the scrolling and clipping boxes around it let show. Text only
  // screen readers read is left out.
  const SKIP = "script, style, option, .sr-only, [hidden]";
  function clipOf(el) {
    const c = { left: -Infinity, top: -Infinity, right: Infinity, bottom: Infinity };
    for (let e = el.parentElement; e && e !== document.documentElement; e = e.parentElement) {
      const cs = getComputedStyle(e);
      if (/hidden|clip|auto|scroll/.test(cs.overflowX + cs.overflowY)) {
        const r = e.getBoundingClientRect();
        c.left = Math.max(c.left, r.left); c.top = Math.max(c.top, r.top); c.right = Math.min(c.right, r.right); c.bottom = Math.min(c.bottom, r.bottom);
      }
    }
    return c;
  }
  function textBoxes(root) {
    const boxes = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (!n.textContent.trim() || !visible(n.parentElement) || n.parentElement.closest(SKIP)) continue;
      const clip = clipOf(n.parentElement);
      const range = document.createRange();
      range.selectNodeContents(n);
      for (const r of range.getClientRects()) {
        const box = { left: Math.max(r.left, clip.left), top: Math.max(r.top, clip.top), right: Math.min(r.right, clip.right), bottom: Math.min(r.bottom, clip.bottom) };
        if (box.right - box.left > 1 && box.bottom - box.top > 1) boxes.push({ n, el: n.parentElement, r: box });
      }
    }
    return boxes;
  }
  const topLayer = () => document.querySelector("dialog[open]") || document.body;

  // 2.5.5: every target is at least min x min px. Links inside sentences are exempt, and so are a checkbox in a
  // label and a field's label when the label or the field, at full size, is the equivalent target.
  const big = (el, min) => {
    const r = el.getBoundingClientRect();
    return visible(el) && r.width >= min - 0.5 && r.height >= min - 0.5;
  };
  function targets(min = 44) {
    const bad = [];
    for (const el of document.querySelectorAll("button, a[href], input:not([type=hidden]), select, textarea, [role=tab], [tabindex]:not([tabindex='-1']), label")) {
      if (!visible(el) || el.closest("[inert]") || big(el, min)) continue;
      if (el.tagName === "LABEL" && (!el.control || (!el.contains(el.control) && big(el.control, min)))) continue;
      if (el.tagName === "A" && el.closest("p, dd, li") && el.parentElement.textContent.trim().length > el.textContent.trim().length + 5) continue;
      if (el.matches("input, select") && el.labels && [...el.labels].some((l) => big(l, min))) continue;
      const r = el.getBoundingClientRect();
      bad.push(`${describe(el)} is ${Math.round(r.width)} x ${Math.round(r.height)}`);
    }
    return bad;
  }

  // 1.4.6: all text at least min:1 against what's behind it, apart from disabled controls
  function contrast(min = 7) {
    const bad = new Set();
    for (const { el } of textBoxes(document.body)) {
      if (el.closest(":disabled")) continue;
      const fg = rgba(getComputedStyle(el).color);
      if (!fg) continue;
      const bg = background(el);
      const ink = fg[3] < 1 ? fg.slice(0, 3).map((v, i) => v * fg[3] + bg[i] * (1 - fg[3])) : fg;
      const r = ratio(ink, bg);
      if (r < min) bad.add(`${describe(el)} is ${r.toFixed(2)}:1`);
    }
    return [...bad];
  }

  // 1.4.10 and 1.4.8: nothing scrolls sideways, and no text sits outside the viewport
  function reflow() {
    const bad = new Set();
    const de = document.documentElement;
    if (de.scrollWidth > de.clientWidth + 1) bad.add(`the page is ${de.scrollWidth} px wide in ${de.clientWidth}`);
    for (const el of document.querySelectorAll("*")) {
      if (!visible(el)) continue;
      const cs = getComputedStyle(el);
      if ((el.tagName === "DIALOG" || /auto|scroll/.test(cs.overflowX)) && el.scrollWidth > el.clientWidth + 1) bad.add(`${describe(el)} scrolls sideways`);
    }
    for (const b of textBoxes(document.body)) {
      if (b.r.right > innerWidth + 1 || b.r.left < -1) bad.add(`"${b.n.textContent.trim().slice(0, 25)}" is outside the viewport`);
    }
    return [...bad];
  }

  // 1.4.12: no text runs into other text, out of the side of its control, or past a box that cuts it off
  function overlaps() {
    const root = topLayer();
    const boxes = textBoxes(root);
    const bad = new Set();
    const inMenu = (b) => !!b.el.closest(".menu-list");
    const hit = (a, b) => a.left < b.right - 2 && b.left < a.right - 2 && a.top < b.bottom - 2 && b.top < a.bottom - 2;
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const [a, b] = [boxes[i], boxes[j]];
        // An open menu covers what's under it on purpose.
        if (a.n !== b.n && inMenu(a) === inMenu(b) && hit(a.r, b.r)) bad.add(`"${a.n.textContent.trim().slice(0, 20)}" overlaps "${b.n.textContent.trim().slice(0, 20)}"`);
      }
    }
    for (const el of root.querySelectorAll("*")) {
      if (!visible(el) || el.closest(SKIP) || !el.textContent.trim()) continue;
      const cs = getComputedStyle(el);
      if ((/hidden|clip/.test(cs.overflowX) && el.scrollWidth > el.clientWidth + 1) || (/hidden|clip/.test(cs.overflowY) && el.scrollHeight > el.clientHeight + 1)) {
        bad.add(`${describe(el)} cuts its text off`);
      }
    }
    for (const el of root.querySelectorAll("button, label, .label, a, legend, h1, h2, h3, dt, dd, li, p")) {
      if (!visible(el)) continue;
      const r = el.getBoundingClientRect();
      if (textBoxes(el).some((b) => b.r.right > r.right + 1.5 || b.r.left < r.left - 1.5)) bad.add(`text spills out of ${describe(el)}`);
    }
    return [...bad];
  }

  // 1.4.8: blocks of text, which WCAG takes to be more than one sentence, have lines of at most max characters, line
  // spacing of 1.5 or more, paragraph spacing of 1.5 times that, and aren't justified
  const BLOCKS = "p, dd, li, .hint";
  function visualPresentation(max = 80) {
    const bad = [];
    for (const el of document.querySelectorAll(BLOCKS)) {
      if (!visible(el) || (el.innerText.match(/[.!?](\s|$)/g) || []).length < 2) continue;
      const cs = getComputedStyle(el);
      const fontSize = parseFloat(cs.fontSize);
      const lineHeight = parseFloat(cs.lineHeight);
      if (!(lineHeight >= 1.5 * fontSize - 0.5)) bad.push(`${describe(el)} has line height ${cs.lineHeight} for ${cs.fontSize} text`);
      if (cs.textAlign === "justify") bad.push(`${describe(el)} is justified`);
      const next = el.nextElementSibling;
      if (el.tagName === "P" && next && next.tagName === "P" && visible(next) && el.closest("dialog")) {
        const gap = next.getBoundingClientRect().top - el.getBoundingClientRect().bottom;
        if (gap < 1.5 * lineHeight - 1) bad.push(`${describe(el)} is ${Math.round(gap)} px from the next paragraph, under 1.5 lines`);
      }
      if (el.textContent.trim().length <= max) continue;
      const lines = new Map();
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        if (n.parentElement.closest(SKIP)) continue;
        for (let i = 0; i < n.length; i++) {
          const range = document.createRange();
          range.setStart(n, i);
          range.setEnd(n, i + 1);
          const r = range.getClientRects()[0];
          // Collapsed white space has no width.
          if (r && r.width >= 0.5) lines.set(Math.round(r.top / 4), (lines.get(Math.round(r.top / 4)) || 0) + 1);
        }
      }
      const longest = Math.max(0, ...lines.values());
      if (longest > max) bad.push(`${describe(el)} has a line of ${longest} characters`);
    }
    return bad;
  }

  // 2.4.7, 2.4.11-13 for the focused element: its focus ring is at least 2 px wide, 3:1 against what's around it,
  // and nothing else covers the element. A checkbox's ring goes round its label.
  function focus() {
    const el = document.activeElement;
    if (!el || el === document.body) return null;
    const label = el.matches("input[type=checkbox], input[type=radio]") ? el.closest("label") : null;
    const ring = label && getComputedStyle(label).outlineStyle !== "none" ? label : el;
    const cs = getComputedStyle(ring);
    const color = rgba(cs.outlineColor);
    const width = parseFloat(cs.outlineWidth);
    const behind = parseFloat(cs.outlineOffset) >= 0 ? background(ring.parentElement || ring) : background(ring);
    const problems = [];
    if (cs.outlineStyle === "none" || width < 2) problems.push(`${describe(el)} has a ${cs.outlineStyle} ${cs.outlineWidth} focus ring`);
    else if (!color || ratio(color, behind) < 3) problems.push(`${describe(el)}'s focus ring is ${color ? ratio(color, behind).toFixed(2) : 0}:1`);
    const r = el.getBoundingClientRect();
    const points = [[r.left + r.width / 2, r.top + r.height / 2], [r.left + 2, r.top + 2], [r.right - 2, r.top + 2], [r.left + 2, r.bottom - 2], [r.right - 2, r.bottom - 2]];
    for (const [x, y] of points) {
      if (x < 0 || y < 0 || x >= innerWidth || y >= innerHeight) continue;
      const top = document.elementFromPoint(x, y);
      if (top && top !== el && !el.contains(top) && !top.contains(el) && !(label && label.contains(top))) {
        problems.push(`${describe(el)} is covered by ${describe(top)}`);
        break;
      }
    }
    return { el: describe(el), problems };
  }

  // 3.2.5: everything that opens a new tab says so, to the eye and to screen readers
  function newTabs() {
    const bad = [];
    const openers = [...document.querySelectorAll("a[target='_blank'], [data-act='techtree'], #techBtn")];
    for (const el of openers) {
      if (!/\(opens in a new tab\)/.test(el.textContent) || !el.querySelector(".new-tab")) bad.push(`${describe(el)} doesn't say it opens a new tab`);
    }
    return bad;
  }

  function textSpacing(on) {
    document.getElementById("wcag-spacing")?.remove();
    if (!on) return;
    const style = document.createElement("style");
    style.id = "wcag-spacing";
    // The text-spacing overrides of WCAG 1.4.12
    style.textContent = "* { line-height: 1.5 !important; letter-spacing: 0.12em !important; word-spacing: 0.16em !important; } p { margin-bottom: 2em !important; }";
    document.head.append(style);
  }

  return { visible, describe, targets, contrast, reflow, overlaps, visualPresentation, focus, newTabs, textSpacing };
})();
