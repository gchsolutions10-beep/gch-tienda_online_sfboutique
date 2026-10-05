import type { ReactNode } from "react";

/**
 * Markdown sencillo y SEGURO para el blog (sin HTML crudo, sin
 * dangerouslySetInnerHTML): párrafos, ## títulos, listas, **negrita**,
 * *cursiva* y [enlaces](https://…). Suficiente para artículos de moda.
 */
export function Markdown({ source }: { source: string }) {
  const blocks = source.replace(/\r\n/g, "\n").split(/\n{2,}/);
  return (
    <div className="space-y-4 leading-relaxed">
      {blocks.map((block, i) => {
        const b = block.trim();
        if (!b) return null;
        if (b.startsWith("### ")) return <h3 key={i} className="pt-2 font-display text-xl font-semibold">{inline(b.slice(4))}</h3>;
        if (b.startsWith("## ")) return <h2 key={i} className="pt-4 font-display text-2xl font-semibold">{inline(b.slice(3))}</h2>;
        const lines = b.split("\n");
        if (lines.every((l) => /^[-*] /.test(l))) {
          return (
            <ul key={i} className="list-disc space-y-1 pl-6">
              {lines.map((l, j) => (
                <li key={j}>{inline(l.slice(2))}</li>
              ))}
            </ul>
          );
        }
        if (lines.every((l) => /^\d+\. /.test(l))) {
          return (
            <ol key={i} className="list-decimal space-y-1 pl-6">
              {lines.map((l, j) => (
                <li key={j}>{inline(l.replace(/^\d+\. /, ""))}</li>
              ))}
            </ol>
          );
        }
        if (b.startsWith("> ")) return <blockquote key={i} className="border-l-4 border-accent pl-4 italic">{inline(b.replace(/^> /gm, ""))}</blockquote>;
        return <p key={i}>{inline(b)}</p>;
      })}
    </div>
  );
}

/** **negrita**, *cursiva* y [texto](url) — solo http(s) o rutas internas. */
function inline(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /\*\*(.+?)\*\*|\*(.+?)\*|\[(.+?)\]\((https?:\/\/[^\s)]+|\/[^\s)]*)\)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let k = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    if (m[1]) out.push(<strong key={k++}>{m[1]}</strong>);
    else if (m[2]) out.push(<em key={k++}>{m[2]}</em>);
    else {
      const external = m[4].startsWith("http");
      out.push(
        <a key={k++} href={m[4]} className="font-semibold text-brand-strong underline" {...(external ? { target: "_blank", rel: "noopener noreferrer nofollow" } : {})}>
          {m[3]}
        </a>,
      );
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}
