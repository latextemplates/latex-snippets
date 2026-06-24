import React from "react";

// Page heading for a snippet: the package title with its CTAN package(s)
// rendered as linked tags right next to it. Used with hide_title in the MDX
// front-matter so this is the page's only H1.
export default function PackageHeading({ title, ctan = [] }) {
  return (
    <header className="package-heading">
      <h1 className="package-heading__title">{title}</h1>
      {ctan.length > 0 && (
        <div className="ctan-tags">
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
        </div>
      )}
    </header>
  );
}
