// build-snippets.mjs — resolve LTG templates → MDX + compiled SVG.
//
// For each snippet stem (from the generator's snippets.js metadata) this:
//   1. EJS-renders <stem>.preamble.en.tex and <stem>.example.en.tex with the
//      canonical IEEE config (the site's global config),
//   2. splits the example into fragments on the bexample/eexample markers,
//   3. compiles each fragment (shared preamble + fragment, standalone class) to
//      a tightly-cropped PDF via the texlive/texlive Docker image, then to SVG
//      with dvisvgm,
//   4. writes docs/snippets/<stem>.mdx referencing the metadata, the fragment
//      source (code block) and the rendered SVG.
//
// Generated outputs (docs/snippets/*.mdx, static/img/snippets/*.svg, build/)
// are gitignored — this script is the source of truth, never hand-edit them.
//
// Usage:  node scripts/build-snippets.mjs [stem ...]   (default: all in snippets.js)
//   env GENERATOR_DIR  path to the generator-latex-template checkout
//                      (default: ../generator-latex-template)

import { readFile, writeFile, mkdir, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import ejs from "ejs";

const execFileAsync = promisify(execFile);

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const GENERATOR_DIR = resolve(
  ROOT,
  process.env.GENERATOR_DIR ?? "../generator-latex-template",
);
const TEMPLATES = join(GENERATOR_DIR, "generators/app/templates");
const LANG = "en";

// Unique markers we substitute for bexample/eexample so the resolved example
// can be split back into individual code+output fragments.
const BEGIN = "%%LTG-BEGIN%%";
const END = "%%LTG-END%%";

// Canonical IEEE config — the site renders every snippet under this global
// config (papers are the main audience). Mirrors the relevant parts of
// generators/app/index.js. Grow this as more snippets need more props.
function canonicalProps() {
  return {
    documentclass: "ieee",
    ieeevariant: "conference",
    language: LANG,
    lang: LANG,
    isPaper: true,
    isThesis: false,
    examples: true,
    useExampleEnvironment: true,
    bexample: BEGIN,
    eexample: END,
    heading1: "\\section",
    heading2: "\\subsection",
    heading3: "\\subsubsection",
    listings: "minted",
    todo: "todonotes",
    reallatexcompiler: "lualatex",
    bquote: "\\enquote{",
    equote: "}",
  };
}

async function renderTemplate(file, props) {
  const path = join(TEMPLATES, file);
  if (!existsSync(path)) return null;
  const src = await readFile(path, "utf8");
  return ejs.render(src, props, { rmWhitespace: false });
}

// Split a rendered example into fragments between BEGIN/END markers.
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

// Minimal extra preamble needed for isolated compilation of any fragment.
// (hyperref provides \href used inline in several examples.)
const EXTRA_PREAMBLE = String.raw`
\usepackage{hyperref}
`;

function standaloneDoc(preamble, fragment) {
  return `\\documentclass[varwidth=15cm,border=4pt]{standalone}
${preamble}
${EXTRA_PREAMBLE}
\\begin{document}
${fragment}
\\end{document}
`;
}

const UID = process.getuid?.() ?? 0;
const GID = process.getgid?.() ?? 0;

async function dockerTexlive(workdir, args) {
  return execFileAsync(
    "docker",
    [
      "run",
      "--rm",
      "-u",
      `${UID}:${GID}`,
      // We run as an arbitrary host UID with no home in the image; give
      // luaotfload (and friends) a writable cache/home under the mount.
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

async function compileFragmentToSvg(stem, idx, preamble, fragment) {
  const workdir = join(ROOT, "build", stem);
  await mkdir(workdir, { recursive: true });
  const base = `frag-${idx}`;
  await writeFile(
    join(workdir, `${base}.tex`),
    standaloneDoc(preamble, fragment),
  );

  try {
    // DVI output (not PDF): dvisvgm renders DVI natively without needing
    // Ghostscript/mutool. dvilualatex keeps LuaLaTeX semantics.
    await dockerTexlive(workdir, [
      "dvilualatex",
      "-interaction=nonstopmode",
      "-halt-on-error",
      `${base}.tex`,
    ]);
  } catch (e) {
    // Surface the real TeX error (! ... / l.<n>) rather than the full log.
    const log = existsSync(join(workdir, `${base}.log`))
      ? await readFile(join(workdir, `${base}.log`), "utf8")
      : (e.stdout ?? "");
    const errLines = log
      .split("\n")
      .filter((l) => l.startsWith("! ") || /^l\.\d+/.test(l))
      .slice(0, 8)
      .join("\n");
    throw new Error(`lualatex failed for ${stem} frag ${idx}:\n${errLines}`);
  }

  await dockerTexlive(workdir, [
    "dvisvgm",
    "--no-fonts",
    "--bbox=preview",
    `--output=${base}.svg`,
    `${base}.dvi`,
  ]);

  const svgRel = `img/snippets/${stem}-${idx}.svg`;
  const svgOut = join(ROOT, "static", svgRel);
  await mkdir(dirname(svgOut), { recursive: true });
  const svg = await readFile(join(workdir, `${base}.svg`), "utf8");
  await writeFile(svgOut, svg);
  return `/${svgRel}`;
}

function mdx(meta, stem, fragments) {
  const ctan = (meta.ctan ?? [])
    .map(
      (p) => `[\`${p}\`](https://ctan.org/pkg/${p})`,
    )
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

  return `---
title: ${JSON.stringify(meta.title)}
---

import Snippet from '@site/src/components/Snippet';

# ${meta.title}

${meta.description}

${ctan ? `**CTAN:** ${ctan}\n` : ""}
${blocks}
`;
}

async function buildStem(stem, meta) {
  const preamble = (await renderTemplate(
    `${stem}.preamble.${LANG}.tex`,
    canonicalProps(),
  )) ?? "";
  const exampleRaw = await renderTemplate(
    `${stem}.example.${LANG}.tex`,
    canonicalProps(),
  );
  if (exampleRaw === null) {
    console.log(`  (no example for ${stem}, skipping render)`);
    return;
  }
  const fragments = extractFragments(exampleRaw);
  if (!fragments.length) {
    console.log(`  (no fragments found for ${stem})`);
    return;
  }

  const built = [];
  for (let i = 0; i < fragments.length; i++) {
    process.stdout.write(`  fragment ${i}: compiling… `);
    const svg = await compileFragmentToSvg(stem, i, preamble, fragments[i]);
    console.log("svg ✓");
    built.push({ code: fragments[i], svg });
  }

  const outMdx = join(ROOT, "docs/snippets", `${stem}.mdx`);
  await mkdir(dirname(outMdx), { recursive: true });
  await writeFile(outMdx, mdx(meta, stem, built));
  console.log(`  wrote docs/snippets/${stem}.mdx (${built.length} fragments)`);
}

async function main() {
  const { snippets } = await import(
    join(GENERATOR_DIR, "generators/app/snippets.js")
  );
  const requested = process.argv.slice(2);
  const stems = requested.length ? requested : Object.keys(snippets);

  await rm(join(ROOT, "build"), { recursive: true, force: true });
  for (const stem of stems) {
    const meta = snippets[stem];
    if (!meta) {
      console.warn(`! ${stem}: not in snippets.js, skipping`);
      continue;
    }
    console.log(`▶ ${stem}`);
    await buildStem(stem, meta);
  }
}

main().catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});
