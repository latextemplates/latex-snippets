# Contributing to latex-snippets

We welcome contributions to this repository and encourage you to create a fork, clone, **create a new branch** (such as `fix-for-issue-121`), **work on that new branch — not on the default branch**, and create a pull request.
Be sure to create a **separate branch** for each improvement you implement.
Take a look at GitHub's [help documentation](https://docs.github.com/en/pull-requests) for a detailed explanation and at the [Feature Branch Workflow](https://www.atlassian.com/git/tutorials/comparing-workflows/feature-branch-workflow) for the idea behind this kind of development.

Alternatively, you can just use the edit button of a single file in the web browser.

## Part of it is generated

This site is a [Docusaurus](https://docusaurus.io/) showcase of the LaTeX packages used across the
[latextemplates](https://github.com/latextemplates) templates, and it embeds the
[LaTeX Template Generator](https://github.com/latextemplates/generator-latex-template) as a git submodule at `generator-latex-template/`.

- **The LaTeX of a snippet** comes from the generator's micro-templates — everything under `docs/snippets/` and `static/img/snippets/` is generated and **overwritten** by the build scripts.
  Improve the LaTeX at [generator-latex-template](https://github.com/latextemplates/generator-latex-template); see [How the templates are generated](https://github.com/latextemplates/generator-latex-template/blob/main/CONTRIBUTING.md#how-the-templates-are-generated).
- **Which snippets are shown, and their categories,** is `snippets.config.mjs` — here.
- **The site itself** (pages, styling, scripts) — here.

When you add a snippet here, please also add or update the matching decision record in
[gadr-latex-packages](https://github.com/latextemplates/gadr-latex-packages), so that *why* this package
was picked for the problem is written down next to *how* it is used.

## Create a pull request

Create a pull request on GitHub.
For text inspirations, consider [How to write the perfect pull request](https://github.blog/2015-01-21-how-to-write-the-perfect-pull-request/).

You can add the prefix `[WIP]` to indicate that the pull request is not yet complete, but you want to discuss something or inform about the current state of affairs.
