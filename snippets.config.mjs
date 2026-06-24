// The snippet catalog for this site — hand-maintained, edit-in-one-place.
//
// This is website CURATION, not generator content: it declares which generator
// templates become pages and how they're presented. The actual LaTeX source
// (the <stem>.{preamble,example}.<lang>.tex templates) lives in the
// generator-latex-template submodule; this file just points at it and adds
// presentation metadata. Editing it is a single commit here — no submodule bump.
//
// PACKAGE-CENTRIC: one entry = one CTAN package = one page. Pages are grouped
// into feature categories (e.g. "Source Code" → minted, listings). Several
// packages can share one template *stem* (the source under
// generator-latex-template/generators/app/templates/<stem>.preamble|example.<lang>.tex)
// but render under a different generator config — that's how "Source Code"
// splits into minted vs listings (the `listings` switch) and "Comments & TODOs"
// into todonotes vs pdfcomment (the `todo` switch).
//
// scripts/build-snippets.mjs resolves the templates with the canonical IEEE
// config + this entry's `config` override, renders each example fragment to SVG,
// and uses the metadata here for the page title, category, CTAN badge and
// description.
//
// Bilingual: the site builds an English and a German locale. German pages use
// the <stem>.{example,preamble}.de.tex source where it exists (else English),
// the German category label from `categoryLabels.de`, and the entry's
// `de.description`.
//
// Shape per entry (key = page slug, normally the package name):
//   category    — feature group the page is filed under (see `categories` below)
//   stem        — template stem providing the preamble + example source
//   title       — page heading (defaults to the key, i.e. the package name)
//   ctan        — CTAN package id(s); link(s) to https://ctan.org/pkg/<id>.
//                 First is primary. Omit/empty for plain-LaTeX snippets.
//   description — one-sentence summary of what the package does (English)
//   config      — optional generator switch overrides that make THIS package the
//                 active one (e.g. { listings: "listings" }, { todo: "pdfcomment" })
//   de          — German overrides: { description }
//   companion   — optional verified cross-reference to "The LaTeX Companion"
//
// This is a seed batch. Grow as we go.

// Category display order in the sidebar.
export const categories = [
  "Source Code",
  "Comments & TODOs",
  "Cross-References",
  "Numbers & Units",
  "Quotations",
  "Lists",
  "Tables",
  "Notes",
  "Typography",
  "Glossaries",
];

// German labels for the categories above (sidebar group titles in the de locale).
export const categoryLabels = {
  de: {
    "Source Code": "Quelltext",
    "Comments & TODOs": "Kommentare & TODOs",
    "Cross-References": "Querverweise",
    "Numbers & Units": "Zahlen & Einheiten",
    Quotations: "Anführungszeichen",
    Lists: "Listen",
    Tables: "Tabellen",
    Notes: "Notizen",
    Typography: "Typografie",
    Glossaries: "Glossare",
  },
};

export const snippets = {
  minted: {
    category: "Source Code",
    stem: "minted",
    ctan: ["minted"],
    description:
      "Source-code listings with Pygments-powered syntax highlighting (requires shell-escape and Python).",
    config: { listings: "minted" },
    de: {
      description:
        "Quelltext-Listings mit Pygments-basierter Syntaxhervorhebung (benötigt shell-escape und Python).",
    },
  },
  listings: {
    category: "Source Code",
    stem: "listings",
    ctan: ["listings"],
    description:
      "Source-code listings typeset entirely in LaTeX — no external tools required.",
    config: { listings: "listings" },
    de: {
      description:
        "Quelltext-Listings, vollständig in LaTeX gesetzt – ohne externe Werkzeuge.",
    },
  },
  todonotes: {
    category: "Comments & TODOs",
    stem: "todos",
    ctan: ["todonotes"],
    description:
      "Inline and margin TODO notes (\\todo, \\todofix, \\missingfigure) for marking work in progress.",
    config: { todo: "todonotes" },
    de: {
      description:
        "Inline- und Randnotizen für TODOs (\\todo, \\todofix, \\missingfigure), um offene Aufgaben zu markieren.",
    },
  },
  pdfcomment: {
    category: "Comments & TODOs",
    stem: "todos",
    ctan: ["pdfcomment"],
    description:
      "TODOs and review comments as PDF annotations and highlighted text (\\textcomment, \\sidecomment, \\change).",
    config: { todo: "pdfcomment" },
    de: {
      description:
        "TODOs und Review-Kommentare als PDF-Anmerkungen und hervorgehobener Text (\\textcomment, \\sidecomment, \\change).",
    },
  },
  cleveref: {
    category: "Cross-References",
    stem: "cleveref",
    ctan: ["cleveref"],
    description:
      "Cross-references that prepend the right label (Figure, Section, …) automatically and merge ranges.",
    de: {
      description:
        "Querverweise, die automatisch die richtige Bezeichnung (Abbildung, Abschnitt, …) voranstellen und Bereiche zusammenfassen.",
    },
  },
  siunitx: {
    category: "Numbers & Units",
    stem: "siunitx",
    ctan: ["siunitx"],
    description:
      "Typeset physical quantities, SI units and well-formatted numbers with automatic digit grouping.",
    de: {
      description:
        "Physikalische Größen, SI-Einheiten und gut formatierte Zahlen mit automatischer Zifferngruppierung setzen.",
    },
  },
  csquotes: {
    category: "Quotations",
    stem: "csquotes",
    ctan: ["csquotes"],
    description:
      "Context-sensitive, language-aware quotation marks via \\enquote instead of hard-coded glyphs.",
    de: {
      description:
        "Kontextsensitive, sprachabhängige Anführungszeichen über \\enquote statt fest kodierter Zeichen.",
    },
  },
  paralist: {
    category: "Lists",
    stem: "paralist",
    ctan: ["paralist"],
    description:
      "Compact and inline list variants (compactitem, inparaenum, …) beyond the standard environments.",
    de: {
      description:
        "Kompakte und Inline-Listenvarianten (compactitem, inparaenum, …) über die Standardumgebungen hinaus.",
    },
  },
  diagbox: {
    category: "Tables",
    stem: "diagbox",
    ctan: ["diagbox"],
    description:
      "Diagonally divided table cells for labelling both a row and a column header at once.",
    de: {
      description:
        "Diagonal geteilte Tabellenzellen, um zugleich eine Zeilen- und eine Spaltenüberschrift zu beschriften.",
    },
  },
  mindflow: {
    category: "Notes",
    stem: "mindflow",
    ctan: ["mindflow"],
    description:
      "Margin notes and annotations kept visually separate from the running text.",
    de: {
      description:
        "Randnotizen und Anmerkungen, optisch vom laufenden Text getrennt.",
    },
  },
  textcmds: {
    category: "Quotations",
    stem: "textcmds",
    ctan: ["textcmds"],
    description:
      "Quotation marks and text commands via \\qq, an alternative to csquotes.",
    config: { enquotes: "textcmds" },
    de: {
      description:
        "Anführungszeichen und Textbefehle über \\qq, eine Alternative zu csquotes.",
    },
  },
  booktabs: {
    category: "Tables",
    stem: "tables", // example lives in tables.example.*.tex
    preambleStem: "booktabs", // but the package preamble is booktabs.preamble.*
    ctan: ["booktabs"],
    description:
      "Professional table rules (\\toprule, \\midrule, \\bottomrule) for clean, readable tables.",
    de: {
      description:
        "Professionelle Tabellenlinien (\\toprule, \\midrule, \\bottomrule) für saubere, gut lesbare Tabellen.",
    },
  },
  paragraphs: {
    category: "Typography",
    stem: "paragraphs",
    title: "Paragraphs",
    ctan: [],
    description:
      "How LaTeX handles lines and paragraphs — one sentence per line, paragraphs via blank lines.",
    de: {
      description:
        "Wie LaTeX Zeilen und Absätze behandelt – eine Zeile pro Satz, Absätze durch Leerzeilen.",
    },
  },
  hyphenation: {
    category: "Typography",
    stem: "hyphenation",
    title: "Hyphenation",
    ctan: [],
    description:
      "Control word hyphenation: manual break points and hyphenation exceptions, aided by microtype.",
    de: {
      description:
        "Worttrennung steuern: manuelle Trennstellen und Trennausnahmen, unterstützt durch microtype.",
    },
  },
  abbreviations: {
    category: "Glossaries",
    stem: "abbreviations",
    title: "Abbreviations",
    ctan: ["glossaries-extra"],
    // Needs a thesis class — abbreviations are a thesis-only feature.
    config: { documentclass: "scientific-thesis" },
    // Also show the \newabbreviation definitions (abbreviations.<lang>.tex) in a
    // "Definitions" tab, so the \gls{...} keys in the example are explained.
    defs: "abbreviations",
    description:
      "Acronyms via \\gls: the long form on first use, the short form afterwards, plus an auto-built list.",
    de: {
      description:
        "Akronyme über \\gls: beim ersten Gebrauch die Langform, danach die Kurzform, mit automatisch erzeugtem Verzeichnis.",
    },
  },
};
