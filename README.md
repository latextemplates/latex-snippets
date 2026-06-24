# latex-snippets

A runnable showcase of the LaTeX packages used across the
[latextemplates](https://github.com/latextemplates) templates — each "ingredient"
shown as **the LaTeX you write** beside its **compiled output**. A modern,
runnable complement to *The LaTeX Companion*.

## Source of truth

Nothing in `docs/snippets/` or `static/img/snippets/` is hand-written:

- **Templates** (the LaTeX source) come from the
  [generator-latex-template](https://github.com/latextemplates/generator-latex-template)
  submodule: `generators/app/templates/<stem>.{preamble,example}.<lang>.tex`.
- **Catalog** (which templates become pages, plus categories, descriptions, CTAN
  tags, German labels) is curated here in **`snippets.config.mjs`** — edit it in
  one commit; no submodule bump needed.

`scripts/build-snippets.mjs` resolves those templates under the canonical
**IEEE conference** config, splits each example into fragments, compiles each to
a cropped SVG with the `texlive/texlive` Docker image, and writes the MDX pages.

## Prerequisites

- Node ≥ 18
- Docker (for LaTeX compilation via `texlive/texlive:latest` — no host TeX Live
  needed)
- The `generator-latex-template` git submodule (the source of truth). After
  cloning: `git submodule update --init`, then install its deps once:
  `npm ci --prefix generator-latex-template`. The build resolves the generator
  in this order: `GENERATOR_DIR` → `./generator-latex-template` (submodule) →
  `../generator-latex-template` (flat dev workspace).

The submodule is pinned to a generator commit; Dependabot bumps it daily. Bump
it manually with `git -C generator-latex-template pull` + commit when the
generator templates change and you want them sooner.

## Build the snippets

```sh
npm install
npm run build:snippets            # all stems in snippets.js
npm run build:snippets siunitx    # a single stem
GENERATOR_DIR=/path/to/generator-latex-template npm run build:snippets
```

Outputs: `docs/snippets/<stem>.mdx` + `static/img/snippets/<stem>-N.svg`.

## Run the site

Docusaurus deps are added in a later milestone; once present:

```sh
npm start     # dev server
npm run build # build:snippets + static site
```
