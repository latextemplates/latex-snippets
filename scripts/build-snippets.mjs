// build-snippets.mjs — resolve LTG templates → categorized MDX + compiled SVG.
//
// Package-centric: one entry in the generator's snippets.js = one CTAN package =
// one page, filed under a feature category. Pages that share a template `stem`
// but select a different package (Source Code → minted/listings via the
// `listings` switch; Comments & TODOs → todonotes/pdfcomment via the `todo`
// switch) are rendered under that package's `config` override.
//
// Faithful, single-source design:
//   * PREAMBLE — produced by running the REAL generator (yeoman-test) for the
//     canonical IEEE config merged with the page's `config`. One base template
//     per distinct effective config, cached and reused as the compile dir so
//     every \input{...} resolves. No re-derivation of index.js's prop logic.
//   * FRAGMENTS — each <stem>.example.en.tex is EJS-rendered with bexample/
//     eexample markers (plus the page's config, e.g. todo=pdfcomment) and split
//     into code+output fragments. Reliable package→fragment mapping.
//
// Each fragment compiles (two passes, standalone host; xr-hyper fallback for
// out-of-block cross-references) to a cropped DVI via the texlive/texlive Docker
// image, then to SVG with dvisvgm (DVI route: dvisvgm --pdf needs GS<10.01).
//
// Generated outputs (docs/snippets/**, static/img/snippets/*.svg, build/) are
// gitignored — this script is the source of truth, never hand-edit them.
//
// Usage:  node scripts/build-snippets.mjs [package ...]   (default: all)
//   env GENERATOR_DIR  path to the generator-latex-template checkout

import { readFile, writeFile, mkdir, rm, cp } from "node:fs/promises";
import { existsSync } from "node:fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import ejs from "ejs";

const execFileAsync = promisify(execFile);
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function resolveGeneratorDir() {
  const candidates = [
    process.env.GENERATOR_DIR,
    "generator-latex-template",
    "../generator-latex-template",
  ].filter(Boolean);
  for (const c of candidates) {
    const abs = resolve(ROOT, c);
    if (existsSync(join(abs, "generators/app/snippets.js"))) return abs;
  }
  throw new Error(
    "generator checkout not found (no generators/app/snippets.js). " +
      "Set GENERATOR_DIR, or run: git submodule update --init",
  );
}

const GENERATOR_DIR = resolveGeneratorDir();
const TEMPLATES = join(GENERATOR_DIR, "generators/app/templates");
const BUILD = join(ROOT, "build");

const LANG = "en"; // default locale used by the prop templates below

// Locales to build. English is the default (served at the site root); German is
// served under /de/. German pages use <stem>.{example,preamble}.de.tex where it
// exists and fall back to the English source otherwise.
const LOCALES = ["en", "de"];
const DOCS = {
  en: join(ROOT, "docs/snippets"),
  de: join(ROOT, "i18n/de/docusaurus-plugin-content-docs/current/snippets"),
};

// Resolve a template file for a locale, falling back to English. Returns the
// file name and whether the localized (non-en) variant was used.
function resolveSrc(stem, kind, locale) {
  const localized = `${stem}.${kind}.${locale}.tex`;
  if (locale !== "en" && existsSync(join(TEMPLATES, localized))) {
    return { file: localized, localized: true };
  }
  const en = `${stem}.${kind}.en.tex`;
  return existsSync(join(TEMPLATES, en))
    ? { file: en, localized: false }
    : null;
}

const BEGIN = "%%LTG-BEGIN%%";
const END = "%%LTG-END%%";

// Canonical global config (IEEE conference paper). A page's `config` overrides
// merge on top. Option names/values mirror __tests__/matrix.js → toOptions().
const IEEE_OPTIONS = {
  documentclass: "ieee",
  ieeevariant: "conference",
  papersize: "a4",
  latexcompiler: "lualatex",
  bibtextool: "biblatex",
  texlive: 2026,
  docker: "no",
  overleaf: "no",
  lang: LANG,
  font: "default",
  listings: "minted",
  enquotes: "csquotes",
  tweakouterquote: "babel",
  todo: "todonotes",
  examples: "true",
  howtotext: "false",
};

// Props for rendering the *example* templates (small + stable). The page's
// config (e.g. { todo: "pdfcomment" }) is merged in per page.
const EXAMPLE_PROPS = {
  documentclass: "ieee",
  ieeevariant: "conference",
  ieeecompsoc: false,
  heading1: "\\section",
  heading2: "\\subsection",
  heading3: "\\subsubsection",
  bexample: BEGIN,
  eexample: END,
  bquote: "\\enquote{",
  equote: "}",
  tweakouterquote: "babel",
  isThesis: false,
  isPaper: true,
  reallatexcompiler: "lualatex",
  latexcompiler: "lualatex",
  todo: "todonotes",
  listings: "minted",
  enquotes: "csquotes",
  font: "default",
  bibtextool: "biblatex",
  papersize: "a4",
  lang: LANG,
  language: LANG,
  texlive: 2026,
  examples: true,
  useExampleEnvironment: true,
  filenames: { main: "paper", bib: "paper" },
  available: {},
};

const UID = process.getuid?.() ?? 0;
const GID = process.getgid?.() ?? 0;

const slugify = (s) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

// --- generator-sourced base template (one per distinct effective config) -----

const baseCache = new Map();

async function getBase(configOverride, locale = "en") {
  const options = {
    ...IEEE_OPTIONS,
    lang: locale,
    language: locale,
    ...(configOverride ?? {}),
  };
  const key = JSON.stringify(options, Object.keys(options).sort());
  if (baseCache.has(key)) return baseCache.get(key);

  const genDir = join(BUILD, "_gen", `cfg-${baseCache.size}`);
  const helper = `
import helpers from 'yeoman-test';
import { cp, rm } from 'node:fs/promises';
const { gen, options, out } = JSON.parse(process.env.LTG_OPTS);
const rr = await helpers.run(gen).withOptions(options);
await rm(out, { recursive: true, force: true });
await cp(rr.cwd, out, { recursive: true });
rr.cleanup();
`;
  await execFileAsync("node", ["--input-type=module", "--eval", helper], {
    cwd: GENERATOR_DIR,
    env: {
      ...process.env,
      LTG_OPTS: JSON.stringify({
        gen: join(GENERATOR_DIR, "generators/app"),
        options,
        out: genDir,
      }),
    },
    maxBuffer: 32 * 1024 * 1024,
  });

  // Main file name depends on the document class (mirrors index.js filenames).
  const mainFile =
    options.documentclass === "ustutt"
      ? "thesis-example.tex"
      : options.documentclass === "scientific-thesis"
        ? options.lang === "de"
          ? "main-german.tex"
          : "main-english.tex"
        : "paper.tex";
  const paper = await readFile(join(genDir, mainFile), "utf8");
  const at = paper.indexOf("\\begin{document}");
  if (at < 0) throw new Error(`no \\begin{document} in generated ${mainFile}`);
  // Strip the real \documentclass (options may span multiple lines for KOMA
  // thesis classes; an optional trailing [date] may follow), since the
  // standalone wrapper supplies its own class.
  const preamble = paper
    .slice(0, at)
    .replace(
      /\\documentclass\s*\[[\s\S]*?\]\s*\{[^}]*\}(\s*\[[^\]]*\])?/,
      "",
    );

  const base = { genDir, preamble };
  baseCache.set(key, base);
  return base;
}

// --- hosts ----------------------------------------------------------------

// Space paragraphs apart (and drop first-line indent) in the rendered output, so
// multi-paragraph examples are readable in the narrow snippet box. Set as the
// first body content (inside standalone's varwidth / the preview box) so it
// isn't overridden by the host's own hooks, and after \baselineskip is real.
const PAR_SPACING =
  "\\setlength{\\parskip}{0.8\\baselineskip}\\setlength{\\parindent}{0pt}%\n";

// innerClass: when set (thesis configs), standalone hosts the fragment inside
// that base class (e.g. scrbook) so book-only machinery like the `chapter`
// counter exists.
function standaloneDoc(preamble, fragment, xrBase, innerClass) {
  const xr = xrBase
    ? `\\usepackage{xr-hyper}\n\\externaldocument{${xrBase}}\n`
    : "";
  const cls = innerClass ? `class=${innerClass},` : "";
  return `\\documentclass[${cls}varwidth=15cm,border=4pt]{standalone}
${preamble}
${xr}\\begin{document}
${PAR_SPACING}${fragment}
\\end{document}
`;
}

// Host for thesis configs: the heavy thesis preamble installs page-layout
// machinery (scrlayer-scrpage) that overflows in a standalone page. The preview
// package ships only the wrapped fragment via its own shipout, bypassing the
// normal page output routine entirely, while a real book class keeps the
// chapter counter etc. available.
function previewDoc(preamble, fragment, xrBase, innerClass) {
  const xr = xrBase
    ? `\\usepackage{xr-hyper}\n\\externaldocument{${xrBase}}\n`
    : "";
  return `\\documentclass[a4paper,10pt]{${innerClass}}
${preamble}
${xr}\\usepackage[active,tightpage]{preview}
\\setlength\\PreviewBorder{4pt}
\\begin{document}
\\begin{preview}
${PAR_SPACING}${fragment}
\\end{preview}
\\end{document}
`;
}

function contextDoc(preamble, exampleFull, innerClass) {
  const cls = innerClass ?? "article";
  return `\\documentclass[a4paper,10pt]{${cls}}
${preamble}
\\begin{document}
${exampleFull}
\\end{document}
`;
}

// --- fragments ------------------------------------------------------------

async function renderTemplate(file, props) {
  const path = join(TEMPLATES, file);
  if (!existsSync(path)) return null;
  const src = await readFile(path, "utf8");
  return ejs.render(src, props, { filename: path });
}

function extractFragments(rendered) {
  const frags = [];
  const re = new RegExp(`${BEGIN}([\\s\\S]*?)${END}`, "g");
  let m;
  while ((m = re.exec(rendered)) !== null) {
    const code = m[1].replace(/^\n+/, "").replace(/\n+$/, "");
    if (code.trim()) frags.push(code);
  }
  return frags;
}

// --- compilation ----------------------------------------------------------

async function dockerTexlive(workdir, args) {
  return execFileAsync(
    "docker",
    [
      "run",
      "--rm",
      "-u",
      `${UID}:${GID}`,
      "-e",
      "HOME=/workdir",
      "-v",
      `${workdir}:/workdir`,
      "texlive/texlive:latest",
      ...args,
    ],
    { cwd: workdir, maxBuffer: 32 * 1024 * 1024 },
  );
}

async function compileTwice(genDir, base) {
  for (let pass = 0; pass < 2; pass++) {
    await dockerTexlive(genDir, [
      "dvilualatex",
      "-interaction=nonstopmode",
      "-halt-on-error",
      "-shell-escape",
      `${base}.tex`,
    ]);
  }
}

async function readLog(genDir, base) {
  const p = join(genDir, `${base}.log`);
  return existsSync(p) ? readFile(p, "utf8") : "";
}

function texError(log) {
  return (
    log
      .split("\n")
      .filter((l) => l.startsWith("! ") || /^l\.\d+/.test(l))
      .slice(0, 6)
      .join("\n") || "(no ! error in log)"
  );
}

function hasUndefinedRefs(log) {
  return /undefined reference|Reference `[^']*' .*undefined/i.test(log);
}

async function compileFragmentToSvg(
  svgSlug,
  idx,
  genDir,
  preamble,
  fragment,
  xrBase,
  innerClass,
) {
  const svgRel = `img/snippets/${svgSlug}-${idx}.svg`;
  const svgOut = join(ROOT, "static", svgRel);
  // Dev shortcut: reuse an already-compiled SVG (skip Docker) when iterating on
  // MDX/layout. Never set in CI, which always recompiles from a clean tree.
  if (process.env.REUSE_SVG && existsSync(svgOut)) return `/${svgRel}`;

  const base = `_frag-${svgSlug}-${idx}`;
  const write = (doc) => writeFile(join(genDir, `${base}.tex`), doc);
  // Thesis configs use the preview host (bypasses the page output routine).
  const host = innerClass ? previewDoc : standaloneDoc;

  let firstErr = null;
  await write(host(preamble, fragment, null, innerClass));
  try {
    await compileTwice(genDir, base);
  } catch {
    firstErr = texError(await readLog(genDir, base));
  }
  const needsXr =
    xrBase &&
    (firstErr !== null || hasUndefinedRefs(await readLog(genDir, base)));
  if (needsXr) {
    await write(host(preamble, fragment, xrBase, innerClass));
    try {
      await compileTwice(genDir, base);
    } catch {
      const e = texError(await readLog(genDir, base));
      throw new Error(
        `compile failed (${svgSlug} frag ${idx}):\n${firstErr ? `[plain] ${firstErr}\n` : ""}[xr] ${e}`,
      );
    }
  } else if (firstErr !== null) {
    throw new Error(`compile failed (${svgSlug} frag ${idx}):\n${firstErr}`);
  }

  await dockerTexlive(genDir, [
    "dvisvgm",
    "--no-fonts",
    "--bbox=preview",
    `--output=${base}.svg`,
    `${base}.dvi`,
  ]);

  await mkdir(dirname(svgOut), { recursive: true });
  await cp(join(genDir, `${base}.svg`), svgOut);
  return `/${svgRel}`;
}

// --- MDX ------------------------------------------------------------------

function mdx(slug, meta, description, preamble, fragments) {
  const title = meta.title ?? slug;
  const ctanJson = JSON.stringify(
    (meta.ctan ?? []).map((p) => ({
      name: p,
      url: `https://ctan.org/pkg/${p}`,
    })),
  );
  const blocks = fragments
    .map(
      (f) => `<Snippet svg="${f.svg}">

\`\`\`latex
${f.code}
\`\`\`

</Snippet>`,
    )
    .join("\n\n");

  // Example + Preamble as tabs, Example first (default).
  const preambleTab = preamble
    ? `<TabItem value="preamble" label="Preamble">

\`\`\`latex
${preamble.trim()}
\`\`\`

</TabItem>`
    : "";

  // hide_title: PackageHeading renders the only H1 (title + CTAN tags).
  // Flat, package-keyed canonical URL (/snippets/<package>), independent of the
  // category folder the file lives in (the folder drives the sidebar hierarchy).
  return `---
title: ${JSON.stringify(title)}
slug: /snippets/${slug}
hide_title: true
---

import Snippet from '@site/src/components/Snippet';
import PackageHeading from '@site/src/components/PackageHeading';
import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

<PackageHeading title=${JSON.stringify(title)} ctan={${ctanJson}} />

${description}

<Tabs>
<TabItem value="example" label="Example" default>

${blocks}

</TabItem>
${preambleTab}
</Tabs>
`;
}

// Remembers the English example build (code + svg per fragment) so a German
// fallback page (no .de example) reuses the exact same SVGs — including which
// fragments were skipped — instead of recompiling.
const enExampleBuilt = new Map();

async function buildPackage(slug, meta, locale) {
  const stem = meta.stem ?? slug;
  const cfg = meta.config ?? {};

  const exampleSrc = resolveSrc(stem, "example", locale);
  if (!exampleSrc) {
    console.log(`  (no example for stem '${stem}'; skipping)`);
    return false;
  }
  const localized = exampleSrc.localized; // true → genuine .de content
  const contentLocale = localized ? locale : "en";

  const exampleProps = {
    ...EXAMPLE_PROPS,
    ...cfg,
    lang: contentLocale,
    language: contentLocale,
  };
  // Derive the quote commands from the (possibly overridden) enquotes switch,
  // mirroring index.js, so e.g. the textcmds page uses \qq instead of \enquote.
  if (exampleProps.enquotes === "textcmds") {
    exampleProps.bquote = "\\qq{";
    exampleProps.equote = "}";
  } else if (exampleProps.enquotes === "csquotes") {
    exampleProps.bquote = "\\enquote{";
    exampleProps.equote = "}";
  }

  const fragments = extractFragments(
    await renderTemplate(exampleSrc.file, exampleProps),
  );
  if (!fragments.length) {
    console.log(`  (no fragments for ${slug})`);
    return false;
  }

  // The package's own preamble snippet (\usepackage … setup), shown on the page.
  // Uses the .de preamble where available even when the example falls back to en
  // (e.g. cleveref/siunitx have a German preamble but English example).
  let packagePreamble = null;
  const preambleSrc = resolveSrc(meta.preambleStem ?? stem, "preamble", locale);
  if (preambleSrc) {
    try {
      packagePreamble = await renderTemplate(preambleSrc.file, exampleProps);
    } catch (e) {
      console.warn(`    ↳ preamble render failed: ${e.message.split("\n")[0]}`);
    }
  }

  const description =
    locale === "de"
      ? (meta.de?.description ?? meta.description)
      : meta.description;
  const catSlug = slugify(meta.category ?? "misc");
  const outMdx = join(DOCS[locale], catSlug, `${slug}.mdx`);

  const writePage = async (built) => {
    await mkdir(dirname(outMdx), { recursive: true });
    await writeFile(outMdx, mdx(slug, meta, description, packagePreamble, built));
  };

  // German fallback (no .de example): reuse the English example build verbatim.
  if (locale !== "en" && !localized) {
    const built = enExampleBuilt.get(slug);
    if (!built) {
      console.log(`  (no English build to reuse for ${slug})`);
      return false;
    }
    await writePage(built);
    console.log(`  wrote ${locale}/${catSlug}/${slug}.mdx (reused en svgs)`);
    return true;
  }

  // Compile (English, or a genuine localized example). Localized examples get a
  // locale-suffixed SVG slug so they don't clash with the English ones.
  const svgSlug = localized ? `${slug}.${locale}` : slug;
  // Thesis configs need a book base class (chapter counter, etc.).
  const innerClass = ["scientific-thesis", "ustutt"].includes(cfg.documentclass)
    ? "scrbook"
    : null;
  const { genDir, preamble } = await getBase(cfg, contentLocale);

  // Context document for xr-hyper (only if the example defines labels).
  const exampleFull = await renderTemplate(exampleSrc.file, {
    ...exampleProps,
    bexample: "",
    eexample: "",
    heading2: "\\section",
  });
  let xrBase = null;
  if (/\\label\b/.test(exampleFull)) {
    const ctxBase = `_ctx-${svgSlug}`;
    await writeFile(
      join(genDir, `${ctxBase}.tex`),
      contextDoc(preamble, exampleFull, innerClass),
    );
    try {
      await compileTwice(genDir, ctxBase);
      xrBase = ctxBase;
    } catch {
      console.warn(`    ↳ context doc failed; cross-refs may stay unresolved`);
    }
  }

  const built = [];
  for (let i = 0; i < fragments.length; i++) {
    process.stdout.write(`  fragment ${i}: compiling… `);
    try {
      const svg = await compileFragmentToSvg(
        svgSlug,
        i,
        genDir,
        preamble,
        fragments[i],
        xrBase,
        innerClass,
      );
      console.log("svg ✓");
      built.push({ code: fragments[i], svg });
    } catch (e) {
      console.log("skipped");
      console.warn(`    ↳ ${e.message.replace(/\n/g, "\n      ")}`);
    }
  }
  if (!built.length) {
    console.log(`  (no fragments compiled for ${slug})`);
    return false;
  }

  if (locale === "en") enExampleBuilt.set(slug, built);
  await writePage(built);
  console.log(`  wrote ${locale}/${catSlug}/${slug}.mdx (${built.length} fragments)`);
  return true;
}

// Write _category_.json so the sidebar shows ordered, nicely-labelled groups
// (with the German label for the de locale).
async function writeCategoryMeta(categories, used, locale, labels) {
  const order = categories ?? [];
  const seen = [...used];
  // Keep declared order first, then any leftover categories.
  const ordered = [
    ...order.filter((c) => seen.includes(c)),
    ...seen.filter((c) => !order.includes(c)),
  ];
  for (let i = 0; i < ordered.length; i++) {
    const cat = ordered[i];
    const dir = join(DOCS[locale], slugify(cat));
    if (!existsSync(dir)) continue;
    const label = locale === "de" ? (labels?.de?.[cat] ?? cat) : cat;
    await writeFile(
      join(dir, "_category_.json"),
      JSON.stringify({ label, position: i + 1 }, null, 2) + "\n",
    );
  }
}

// Translate the autogenerated sidebar's category labels for a locale. Docusaurus
// reads these from current.json (keyed sidebar.<id>.category.<Name>), not from
// the per-folder _category_.json.
async function writeSidebarTranslations(categories, labels) {
  const out = {};
  for (const cat of categories ?? []) {
    out[`sidebar.snippetsSidebar.category.${cat}`] = {
      message: labels?.de?.[cat] ?? cat,
    };
  }
  const file = join(
    ROOT,
    "i18n/de/docusaurus-plugin-content-docs/current.json",
  );
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(out, null, 2) + "\n");
}

async function main() {
  const mod = await import(join(GENERATOR_DIR, "generators/app/snippets.js"));
  const { snippets, categories, categoryLabels } = mod;
  const requested = process.argv.slice(2);
  const slugs = requested.length ? requested : Object.keys(snippets);

  await rm(join(BUILD, "_gen"), { recursive: true, force: true });

  // English first (its SVGs are reused by German fallback pages), then German.
  for (const locale of LOCALES) {
    console.log(`\n=== locale: ${locale} ===`);
    // Full build (no explicit packages): clear generated pages so removed/
    // renamed packages and stale categories don't linger. SVGs are left in
    // place so REUSE_SVG can still skip recompiles.
    if (!requested.length) {
      await rm(DOCS[locale], { recursive: true, force: true });
    }
    const ok = [];
    const failed = [];
    const usedCategories = new Set();
    for (const slug of slugs) {
      const meta = snippets[slug];
      if (!meta) {
        console.warn(`! ${slug}: not in snippets.js, skipping`);
        continue;
      }
      console.log(`▶ ${slug}  [${meta.category}]`);
      try {
        if (await buildPackage(slug, meta, locale)) {
          ok.push(slug);
          usedCategories.add(meta.category);
        } else {
          failed.push(slug);
        }
      } catch (e) {
        console.warn(`  ✗ ${e.message}`);
        failed.push(slug);
      }
    }
    await writeCategoryMeta(categories, usedCategories, locale, categoryLabels);
    if (locale === "de") {
      await writeSidebarTranslations(categories, categoryLabels);
    }
    console.log(`${locale} built: ${ok.join(", ") || "(none)"}`);
    if (failed.length) console.log(`${locale} failed/empty: ${failed.join(", ")}`);
  }
}

main().catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});
