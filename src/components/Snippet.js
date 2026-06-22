import React from "react";

// Renders one snippet fragment as a card: the LaTeX source (passed as MDX
// children, i.e. a fenced code block) next to the compiled SVG output.
export default function Snippet({ svg, children }) {
  return (
    <div className="ltg-snippet">
      <div className="ltg-snippet__code">{children}</div>
      <div className="ltg-snippet__output">
        <img src={svg} alt="Rendered LaTeX output" loading="lazy" />
      </div>
    </div>
  );
}
