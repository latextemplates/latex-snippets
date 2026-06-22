// build-snippets.mjs — resolve LTG templates → MDX + compiled SVG.
//
// Faithful, single-source design (the generator is the source of truth):
//
//   * PREAMBLE — produced by running the REAL generator (via yeoman-test, the
//     same way the test suite does) for the canonical IEEE config. We take
//     everything before \begin{document} from the generated paper.tex, strip
//     the \documentclass line, and host it under a `standalone` wrapper. No
//     re-derivation of index.js's prop logic, so the preamble never drifts.
//     The generated directory (with commands.tex, the .bib, etc.) is reused as
//     the compile working dir, so every \input{...} resolves.
//
//   * FRAGMENTS — each <stem>.example.en.tex is EJS-rendered on its own with
//     bexample/eexample set to unique markers, then split into individual
//     code+output fragments. This keeps a reliable stem→fragment mapping (the
//     generated paper.tex interleaves and wraps examples, which is ambiguous).
//     Example templates need only a small, stable prop set (EXAMPLE_PROPS).
//
// Each fragment is compiled (shared preamble + fragment, standalone class) to a
// cropped DVI via the texlive/texlive Docker image, then to SVG with dvisvgm
// (DVI route: dvisvgm --pdf needs Ghostscript<10.01/mutool, absent here).
//
// Generated outputs (docs/snippets/*.mdx, static/img/snippets/*.svg, build/)
// are gitignored — this script is the source of truth, never hand-edit them.
//
// Usage:  node scripts/build-snippets.mjs [stem ...]   (default: all in snippets.js)
//   env GENERATOR_DIR  path to the generator-latex-template checkout
//                      (default: ../generator-latex-template)

import { readFile, writeFile, mkdir, rm, cp } from "node:fs/promises";
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
const GEN_DIR = join(ROOT, "build", "_gen"); // reused as the LaTeX compile dir
const LANG = "en";

// Unique markers substituted for bexample/eexample so the resolved example can
// be split back into individual code+output fragments.
const BEGIN = "%%LTG-BEGIN%%";
const END = "%%LTG-END%%";

// The canonical global config: IEEE conference paper (papers are the main
// audience). Option names/values mirror __tests__/matrix.js → toOptions().
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

// Props needed only to render the *example* templates (small + stable). The
// heavy preamble props all come from the real generator, not from here.
// Identifiers actually referenced across *.example.en.tex (harvested): heading2,
// documentclass, reallatexcompiler, bquote/equote, tweakouterquote, todo,
// isThesis, filenames, available, plus the bexample/eexample markers. Kept in
// sync with the IEEE config above.
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

// --- generator-sourced preamble ------------------------------------------

// Run the real generator (yeoman-test) into GEN_DIR. yeoman-test and the
// generator's own deps resolve from the generator checkout, so we run a tiny
// helper via `node --eval` with cwd = GENERATOR_DIR.
async function generateBaseTemplate() {
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
        options: IEEE_OPTIONS,
        out: GEN_DIR,
      }),
    },
    maxBuffer: 32 * 1024 * 1024,
  });

  const paper = await readFile(join(GEN_DIR, "paper.tex"), "utf8");
  const at = paper.indexOf("\\begin{document}");
  if (at < 0) throw new Error("no \\begin{document} in generated paper.tex");
  // Preamble = everything before \begin{document}, minus the \documentclass
  // line (the standalone wrapper provides the class).
  return paper.slice(0, at).replace(/\\documentclass\b[^\n]*\n/, "");
}

// Tightly-cropped standalone box for one fragment. Floats inside the fragment
// (e.g. minted's `listing`) render in place, and in-block \label/\ref resolve
// across two passes. When `xrBase` is given, xr-hyper imports that context
// document's labels so references pointing OUTSIDE the block (e.g. cleveref's
// \Cref{fig:…}) resolve to the same numbers they'd have in the full example.
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

// Context document: the FULL example (bexample blocks unwrapped) typeset as a
// normal article, so every \caption/\label runs and the resulting .aux carries
// the real cross-reference numbers. Compiled once per stem; fragments import its
// labels via xr-hyper. Unlike preview(active), nothing here is gobbled.
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
      // Arbitrary host UID with no home in the image: give luaotfload (and
      // friends) a writable cache/home under the mount.
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

// DVI output (dvisvgm renders DVI without Ghostscript/mutool). -shell-escape:
// the canonical config uses minted (Pygments). Two passes resolve \label→\ref.
async function compileTwice(base) {
  for (let pass = 0; pass < 2; pass++) {
    await dockerTexlive(GEN_DIR, [
      "dvilualatex",
      "-interaction=nonstopmode",
      "-halt-on-error",
      "-shell-escape",
      `${base}.tex`,
    ]);
  }
}

async function readLog(base) {
  const p = join(GEN_DIR, `${base}.log`);
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

async function compileFragmentToSvg(stem, idx, preamble, fragment, xrBase) {
  const base = `_frag-${stem}-${idx}`;
  const write = (doc) => writeFile(join(GEN_DIR, `${base}.tex`), doc);

  // 1) Standalone, no external labels (fast; floats render in place).
  let firstErr = null;
  await write(standaloneDoc(preamble, fragment, null));
  try {
    await compileTwice(base);
  } catch {
    firstErr = texError(await readLog(base));
  }
  // 2) If it failed, or left references that point outside the block, retry
  //    importing the context document's labels via xr-hyper.
  const needsXr =
    xrBase && (firstErr !== null || hasUndefinedRefs(await readLog(base)));
  if (needsXr) {
    await write(standaloneDoc(preamble, fragment, xrBase));
    try {
      await compileTwice(base);
    } catch {
      const e = texError(await readLog(base));
      throw new Error(
        `compile failed (${stem} frag ${idx}):\n${firstErr ? `[plain] ${firstErr}\n` : ""}[xr] ${e}`,
      );
    }
  } else if (firstErr !== null) {
    throw new Error(`compile failed (${stem} frag ${idx}):\n${firstErr}`);
  }

  await dockerTexlive(GEN_DIR, [
    "dvisvgm",
    "--no-fonts",
    "--bbox=preview",
    `--output=${base}.svg`,
    `${base}.dvi`,
  ]);

  const svgRel = `img/snippets/${stem}-${idx}.svg`;
  const svgOut = join(ROOT, "static", svgRel);
  await mkdir(dirname(svgOut), { recursive: true });
  await cp(join(GEN_DIR, `${base}.svg`), svgOut);
  return `/${svgRel}`;
}

// --- MDX ------------------------------------------------------------------

function mdx(meta, fragments) {
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

async function buildStem(stem, meta, preamble) {
  const exampleRaw = await renderTemplate(
    `${stem}.example.${LANG}.tex`,
    EXAMPLE_PROPS,
  );
  if (exampleRaw === null) {
    console.log(`  (no example for ${stem}; preamble-only snippet, skipping)`);
    return false;
  }
  const fragments = extractFragments(exampleRaw);
  if (!fragments.length) {
    console.log(`  (no fragments found for ${stem})`);
    return false;
  }

  // Build a context document (full example as a normal article) when the
  // example defines labels, so fragments can import their numbers via xr-hyper.
  // bexample/eexample empty → the example renders the way it does in the real
  // document. Compiled once; reused by every fragment of this stem.
  const exampleFull = await renderTemplate(`${stem}.example.${LANG}.tex`, {
    ...EXAMPLE_PROPS,
    bexample: "",
    eexample: "",
    // Top-level heading in the article context doc so a referenced section
    // numbers as "Section 1" rather than "Section 0.1".
    heading2: "\\section",
  });
  let xrBase = null;
  if (/\\label\b/.test(exampleFull)) {
    const ctxBase = `_ctx-${stem}`;
    await writeFile(
      join(GEN_DIR, `${ctxBase}.tex`),
      contextDoc(preamble, exampleFull),
    );
    try {
      await compileTwice(ctxBase);
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
        stem,
        i,
        preamble,
        fragments[i],
        xrBase,
      );
      console.log("svg ✓");
      built.push({ code: fragments[i], svg });
    } catch (e) {
      // Skip just this fragment (e.g. margin notes can't render in a tight
      // standalone box) — keep the others rather than dropping the page.
      console.log("skipped");
      console.warn(`    ↳ ${e.message.replace(/\n/g, "\n      ")}`);
    }
  }
  if (!built.length) {
    console.log(`  (no fragments compiled for ${stem})`);
    return false;
  }

  const outMdx = join(ROOT, "docs/snippets", `${stem}.mdx`);
  await mkdir(dirname(outMdx), { recursive: true });
  await writeFile(outMdx, mdx(meta, built));
  console.log(`  wrote docs/snippets/${stem}.mdx (${built.length} fragments)`);
  return true;
}

async function main() {
  const { snippets } = await import(
    join(GENERATOR_DIR, "generators/app/snippets.js")
  );
  const requested = process.argv.slice(2);
  const stems = requested.length ? requested : Object.keys(snippets);

  console.log("▶ generating canonical IEEE template (source of truth)…");
  const preamble = await generateBaseTemplate();
  console.log(`  preamble: ${(preamble.match(/\\usepackage/g) || []).length} packages\n`);

  const ok = [];
  const failed = [];
  for (const stem of stems) {
    const meta = snippets[stem];
    if (!meta) {
      console.warn(`! ${stem}: not in snippets.js, skipping`);
      continue;
    }
    console.log(`▶ ${stem}`);
    try {
      if (await buildStem(stem, meta, preamble)) ok.push(stem);
    } catch (e) {
      console.warn(`  ✗ ${e.message}`);
      failed.push(stem);
    }
  }

  console.log(`\nDone. built: ${ok.join(", ") || "(none)"}`);
  if (failed.length) console.log(`failed: ${failed.join(", ")}`);
}

main().catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});
