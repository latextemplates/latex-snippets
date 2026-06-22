---
title: Introduction
slug: /
sidebar_position: 1
---

# LaTeX Snippets

A runnable showcase of the LaTeX packages used by the
[latextemplates](https://github.com/latextemplates) family of templates. Each
page takes one "ingredient" — a package such as `siunitx`, `cleveref` or
`todonotes` — and shows the **LaTeX you write** next to the **rendered output**,
compiled from the real source.

This is meant as a modern, runnable complement to
[**The LaTeX Companion**](https://www.latex-project.org/help/books/): the
Companion explains the packages in depth; here you see each one working and can
copy the snippet straight into your document.

## How it works

Every snippet is **generated** from the
[generator-latex-template](https://github.com/latextemplates/generator-latex-template)
repository (the single source of truth). Its metadata lives in
`generators/app/snippets.js`; the source and output you see below are produced
by resolving the generator's templates under the canonical **IEEE conference**
configuration and compiling each example to SVG. Nothing on these pages is
hand-written — fix things in the generator and regenerate.
