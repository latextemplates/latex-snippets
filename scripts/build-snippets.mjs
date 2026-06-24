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
const LANG = "en";

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

async function getBase(configOverride) {
  const options = { ...IEEE_OPTIONS, ...(configOverride ?? {}) };
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

  const paper = await readFile(join(genDir, "paper.tex"), "utf8");
  const at = paper.indexOf("\\begin{document}");
  if (at < 0) throw new Error("no \\begin{document} in generated paper.tex");
  const preamble = paper
    .slice(0, at)
    .replace(/\\documentclass\b[^\n]*\n/, "");

  const base = { genDir, preamble };
  baseCache.set(key, base);
  return base;
}

// --- hosts ----------------------------------------------------------------

function standaloneDoc(preamble, fragment, xrBase) {
  const xr = xrBase
    ? `\\usepackage{xr-hyper}\n\\externaldocument{${xrBase}}\n`
    : "";
  return `\\documentclass[varwidth=15cm,border=4pt]{standalone}
${preamble}
${xr}\\begin{document}
${fragment}
\\end{document}
`;
}

function contextDoc(preamble, exampleFull) {
  return `\\documentclass[a4paper,10pt]{article}
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

async function compileFragmentToSvg(slug, idx, genDir, preamble, fragment, xrBase) {
  const base = `_frag-${slug}-${idx}`;
  const write = (doc) => writeFile(join(genDir, `${base}.tex`), doc);

  let firstErr = null;
  await write(standaloneDoc(preamble, fragment, null));
  try {
    await compileTwice(genDir, base);
  } catch {
    firstErr = texError(await readLog(genDir, base));
  }
  const needsXr =
    xrBase &&
    (firstErr !== null || hasUndefinedRefs(await readLog(genDir, base)));
  if (needsXr) {
    await write(standaloneDoc(preamble, fragment, xrBase));
    try {
      await compileTwice(genDir, base);
    } catch {
      const e = texError(await readLog(genDir, base));
      throw new Error(
        `compile failed (${slug} frag ${idx}):\n${firstErr ? `[plain] ${firstErr}\n` : ""}[xr] ${e}`,
      );
    }
  } else if (firstErr !== null) {
    throw new Error(`compile failed (${slug} frag ${idx}):\n${firstErr}`);
  }

  await dockerTexlive(genDir, [
    "dvisvgm",
    "--no-fonts",
    "--bbox=preview",
    `--output=${base}.svg`,
    `${base}.dvi`,
  ]);

  const svgRel = `img/snippets/${slug}-${idx}.svg`;
  const svgOut = join(ROOT, "static", svgRel);
  await mkdir(dirname(svgOut), { recursive: true });
  await cp(join(genDir, `${base}.svg`), svgOut);
  return `/${svgRel}`;
}

// --- MDX ------------------------------------------------------------------

function mdx(slug, meta, fragments) {
  const title = meta.title ?? slug;
  const ctan = (meta.ctan ?? [])
    .map((p) => `[\`${p}\`](https://ctan.org/pkg/${p})`)
    .join(" · ");
  const blocks = fragments
    .map(
      (f) => `<Snippet svg="${f.svg}">

\`\`\`latex
${f.code}
\`\`\`

</Snippet>`,
    )
    .join("\n\n");

  // Flat, package-keyed canonical URL (/snippets/<package>), independent of the
  // category folder the file lives in. The folder still drives the sidebar
  // hierarchy; only the permalink is flattened.
  return `---
title: ${JSON.stringify(title)}
slug: /snippets/${slug}
---

import Snippet from '@site/src/components/Snippet';

# ${title}

${meta.description}

${ctan ? `**CTAN:** ${ctan}\n` : ""}
${blocks}
`;
}

async function buildPackage(slug, meta) {
  const stem = meta.stem ?? slug;
  const cfg = meta.config ?? {};
  const exampleProps = { ...EXAMPLE_PROPS, ...cfg };

  const exampleRaw = await renderTemplate(
    `${stem}.example.${LANG}.tex`,
    exampleProps,
  );
  if (exampleRaw === null) {
    console.log(`  (no example for stem '${stem}'; skipping)`);
    return false;
  }
  const fragments = extractFragments(exampleRaw);
  if (!fragments.length) {
    console.log(`  (no fragments for ${slug})`);
    return false;
  }

  const { genDir, preamble } = await getBase(cfg);

  // Context document for xr-hyper (only if the example defines labels).
  const exampleFull = await renderTemplate(`${stem}.example.${LANG}.tex`, {
    ...exampleProps,
    bexample: "",
    eexample: "",
    heading2: "\\section",
  });
  let xrBase = null;
  if (/\\label\b/.test(exampleFull)) {
    const ctxBase = `_ctx-${slug}`;
    await writeFile(join(genDir, `${ctxBase}.tex`), contextDoc(preamble, exampleFull));
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
        slug,
        i,
        genDir,
        preamble,
        fragments[i],
        xrBase,
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

  const catSlug = slugify(meta.category ?? "misc");
  const outMdx = join(ROOT, "docs/snippets", catSlug, `${slug}.mdx`);
  await mkdir(dirname(outMdx), { recursive: true });
  await writeFile(outMdx, mdx(slug, meta, built));
  console.log(`  wrote docs/snippets/${catSlug}/${slug}.mdx (${built.length} fragments)`);
  return true;
}

// Write _category_.json so the sidebar shows ordered, nicely-labelled groups.
async function writeCategoryMeta(categories, used) {
  const order = categories ?? [];
  const seen = [...used];
  // Keep declared order first, then any leftover categories.
  const ordered = [
    ...order.filter((c) => seen.includes(c)),
    ...seen.filter((c) => !order.includes(c)),
  ];
  for (let i = 0; i < ordered.length; i++) {
    const cat = ordered[i];
    const dir = join(ROOT, "docs/snippets", slugify(cat));
    if (!existsSync(dir)) continue;
    await writeFile(
      join(dir, "_category_.json"),
      JSON.stringify({ label: cat, position: i + 1 }, null, 2) + "\n",
    );
  }
}

async function main() {
  const mod = await import(join(GENERATOR_DIR, "generators/app/snippets.js"));
  const { snippets, categories } = mod;
  const requested = process.argv.slice(2);
  const slugs = requested.length ? requested : Object.keys(snippets);

  await rm(join(BUILD, "_gen"), { recursive: true, force: true });
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
      if (await buildPackage(slug, meta)) {
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

  await writeCategoryMeta(categories, usedCategories);

  console.log(`\nDone. built: ${ok.join(", ") || "(none)"}`);
  if (failed.length) console.log(`failed/empty: ${failed.join(", ")}`);
}

main().catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});
