import React from "react";
import useBaseUrl from "@docusaurus/useBaseUrl";

// Bad/Good card (as on java.by-comparison.com): the same LaTeX source (passed
// as MDX children) rendered without the package (red) and with it (green),
// each with a one-line problem/solution text. `before`/`after` are lists of
// SVGs; with `pages`, each SVG is one page and gets a page frame.
function Output({ svgs, label, pages }) {
  return (
    <div className={`ltg-compare__output${pages ? " ltg-compare__output--pages" : ""}`}>
      {svgs.map((svg, i) => (
        <Img key={svg} svg={svg} alt={pages ? `${label}, page ${i + 1}` : label} />
      ))}
    </div>
  );
}

function Img({ svg, alt }) {
  return <img src={useBaseUrl(svg)} alt={alt} loading="lazy" />;
}

export default function Comparison({
  before,
  after,
  pages = false,
  beforeLabel,
  afterLabel,
  problem,
  solution,
  children,
}) {
  return (
    <div className="ltg-compare">
      <div className="ltg-compare__side ltg-compare__side--bad">
        <div className="ltg-compare__label">{beforeLabel}</div>
        <Output svgs={before} label={beforeLabel} pages={pages} />
        <p className="ltg-compare__text">{problem}</p>
      </div>
      <div className="ltg-compare__side ltg-compare__side--good">
        <div className="ltg-compare__label">{afterLabel}</div>
        <Output svgs={after} label={afterLabel} pages={pages} />
        <p className="ltg-compare__text">{solution}</p>
      </div>
      <div className="ltg-compare__code">{children}</div>
    </div>
  );
}
