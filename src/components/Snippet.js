import React from "react";
import useBaseUrl from "@docusaurus/useBaseUrl";

// Renders one snippet fragment as a card: the LaTeX source (passed as MDX
// children, i.e. a fenced code block) next to the compiled SVG output.
// useBaseUrl prefixes the site baseUrl so the SVG resolves under /latex-snippets/.
export default function Snippet({ svg, children }) {
  return (
    <div className="ltg-snippet">
      <div className="ltg-snippet__output">
        <img src={useBaseUrl(svg)} alt="Rendered LaTeX output" loading="lazy" />
      </div>
      <div className="ltg-snippet__code">{children}</div>
    </div>
  );
}
