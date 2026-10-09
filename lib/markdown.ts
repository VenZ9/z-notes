function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function inline(text: string, sourceCount: number) {
  let output = escapeHtml(text);

  output = output.replace(/`([^`]+)`/g, "<code>$1</code>");
  output = output.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  output = output.replace(/\*([^*]+)\*/g, "<em>$1</em>");

  output = output.replace(/\[(\d+)\]/g, (_match, num) => {
    const n = Number(num);
    if (n >= 1 && n <= sourceCount) {
      return `<sup><a class="citation" href="#source-${n}">[${n}]</a></sup>`;
    }
    return `<span class="unverified">[unverified]</span>`;
  });

  output = output.replace(
    /\[unverified\]/g,
    '<span class="unverified">[unverified]</span>'
  );

  return output;
}

export function renderMarkdown(markdown: string, sourceCount: number) {
  const lines = markdown.split(/\r?\n/);
  let html = "";
  let listType: "ul" | "ol" | null = null;

  const closeList = () => {
    if (listType) {
      html += `</${listType}>`;
      listType = null;
    }
  };

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();

    if (!line) {
      closeList();
      continue;
    }

    const hr = /^---+$/.test(line);
    if (hr) {
      closeList();
      continue;
    }

    const h3 = line.match(/^###\s+(.*)$/);
    const h2 = line.match(/^##\s+(.*)$/);
    const h1 = line.match(/^#\s+(.*)$/);

    if (h1 || h2 || h3) {
      closeList();
      const level = h1 ? 1 : h2 ? 2 : 3;
      const content = (h1 || h2 || h3)![1];
      html += `<h${level}>${inline(content, sourceCount)}</h${level}>`;
      continue;
    }

    const quote = line.match(/^>\s?(.*)$/);
    if (quote) {
      closeList();
      html += `<blockquote>${inline(quote[1], sourceCount)}</blockquote>`;
      continue;
    }

    const ul = line.match(/^[-*+]\s+(.*)$/);
    if (ul) {
      if (listType !== "ul") {
        closeList();
        html += "<ul>";
        listType = "ul";
      }
      html += `<li>${inline(ul[1], sourceCount)}</li>`;
      continue;
    }

    const ol = line.match(/^\d+[.)]\s+(.*)$/);
    if (ol) {
      if (listType !== "ol") {
        closeList();
        html += "<ol>";
        listType = "ol";
      }
      html += `<li>${inline(ol[1], sourceCount)}</li>`;
      continue;
    }

    closeList();
    html += `<p>${inline(line, sourceCount)}</p>`;
  }

  closeList();

  return html;
}
