# latex-snippets

A runnable showcase of the LaTeX packages used across the
[latextemplates](https://github.com/latextemplates) templates — each "ingredient"
shown as **the LaTeX you write** beside its **compiled output**. A modern,
runnable complement to *The LaTeX Companion*.

## Source of truth

Nothing in `docs/snippets/` or `static/img/snippets/` is hand-written. The
snippets come from the
[generator-latex-template](https://github.com/latextemplates/generator-latex-template)
repository:

- **Templates:** `generators/app/templates/<stem>.preamble.en.tex` and
  `<stem>.example.en.tex` (EJS).
- **Metadata:** `generators/app/snippets.js` (title, CTAN package ids,
  description).

`scripts/build-snippets.mjs` resolves those templates under the canonical
**IEEE conference** config, splits each example into fragments, compiles each to
a cropped SVG with the `texlive/texlive` Docker image, and writes the MDX pages.

## Prerequisites

- Node ≥ 18
- Docker (for LaTeX compilation via `texlive/texlive:latest` — no host TeX Live
  needed)
- A checkout of `generator-latex-template` (by default expected as a sibling
  directory `../generator-latex-template`; override with `GENERATOR_DIR`). It
  will become a git submodule once this repo is published.

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
