import { type Source } from "@/lib/types";

export default function SourceList({ sources }: { sources: Source[] }) {
  if (!sources.length) {
    return (
      <p className="muted small">
        No verified sources. Information could not be verified from the web.
      </p>
    );
  }

  return (
    <ol className="source-list">
      {sources.map((source) => (
        <li
          key={source.ordinal}
          id={`source-${source.ordinal}`}
          className="source-item"
        >
          <div className="font-medium">
            <a href={source.url} target="_blank" rel="noreferrer noopener">
              [{source.ordinal}] {source.title}
            </a>
          </div>

          <div className="muted small break-all">{source.url}</div>

          <div className="mt-1 flex flex-wrap gap-2">
            <span className="badge">{source.domain || "unknown"}</span>
            <span
              className={`badge ${
                source.reliability >= 80
                  ? "badge-ok"
                  : source.reliability >= 50
                    ? "badge-warn"
                    : "badge-danger"
              }`}
            >
              reliability {source.reliability}
            </span>
            {source.publishedAt ? (
              <span className="badge">{source.publishedAt}</span>
            ) : null}
          </div>

          {source.snippet ? (
            <p className="small mt-2">{source.snippet}</p>
          ) : null}

          {source.excerpt ? (
            <details className="mt-2">
              <summary className="small muted cursor-pointer">
                Show evidence excerpt
              </summary>
              <p className="small mt-1">{source.excerpt}</p>
            </details>
          ) : null}
        </li>
      ))}
    </ol>
  );
}
