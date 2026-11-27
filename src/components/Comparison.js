import React from "react";
import useBaseUrl from "@docusaurus/useBaseUrl";

// Bad/Good card (as on java.by-comparison.com): the same LaTeX source (passed
// as MDX children) rendered without the package (red) and with it (green),
// each with a one-line problem/solution text.
export default function Comparison({
  before,
  after,
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
        <div className="ltg-compare__output">
          <img src={useBaseUrl(before)} alt={beforeLabel} loading="lazy" />
        </div>
        <p className="ltg-compare__text">{problem}</p>
      </div>
      <div className="ltg-compare__side ltg-compare__side--good">
        <div className="ltg-compare__label">{afterLabel}</div>
        <div className="ltg-compare__output">
          <img src={useBaseUrl(after)} alt={afterLabel} loading="lazy" />
        </div>
        <p className="ltg-compare__text">{solution}</p>
      </div>
      <div className="ltg-compare__code">{children}</div>
    </div>
  );
}
