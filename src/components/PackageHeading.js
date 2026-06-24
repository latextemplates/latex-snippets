import React from "react";

// Page heading for a snippet: the package title with its CTAN package(s)
// rendered as linked tags right next to it. Used with hide_title in the MDX
// front-matter so this is the page's only H1.
export default function PackageHeading({ title, ctan = [] }) {
  return (
    <h1 className="package-heading">
      <span className="package-heading__title">{title}</span>
      {ctan.map((p) => (
        <a
          key={p.name}
          className="ctan-tag"
          href={p.url}
          target="_blank"
          rel="noreferrer"
          title={`${p.name} on CTAN`}
        >
          {p.name}
        </a>
      ))}
    </h1>
  );
}
