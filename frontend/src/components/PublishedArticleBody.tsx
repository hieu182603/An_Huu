import type { ReactNode } from "react";
export const articleBlocks = (content: string) => content.replace(/\r/g, "").split(/\n\s*\n/).filter(Boolean);
export const blockHeading = (block: string) => block.match(/^(#{1,3})\s+([^\n]+)/);
function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\))/g).map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**")) return <strong key={index}>{part.slice(2,-2)}</strong>;
    const link = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (link && /^https:\/\//i.test(link[2])) return <a key={index} href={link[2]} target="_blank" rel="noopener noreferrer">{link[1]}</a>;
    return part;
  });
}
// Published text is rendered as React nodes. Raw HTML and executable URLs remain
// text; no injected HTML, scripts, event attributes or embedded frames.
export default function PublishedArticleBody({ content }: { content: string }) {
  return <div className="discovery-article-body">{articleBlocks(content).map((block, index) => {
    const heading = blockHeading(block), lines = block.split("\n");
    if (heading) { const rest = block.slice(heading[0].length).trim(); return <section key={index} id={`article-section-${index}`}><h2>{inline(heading[2])}</h2>{rest && <p>{inline(rest)}</p>}</section>; }
    if (lines.every(line => /^[-*]\s/.test(line))) return <ul key={index}>{lines.map((line,i) => <li key={i}>{inline(line.replace(/^[-*]\s/, ""))}</li>)}</ul>;
    if (lines.every(line => /^\d+\.\s/.test(line))) return <ol key={index}>{lines.map((line,i) => <li key={i}>{inline(line.replace(/^\d+\.\s/, ""))}</li>)}</ol>;
    if (block.startsWith("```")) return <pre key={index}>{block.replace(/^```[^\n]*\n?/, "").replace(/\n?```$/, "")}</pre>;
    if (lines.length > 1 && lines.every(line => line.includes("|"))) { const cells = (line: string) => line.replace(/^\||\|$/g, "").split("|").map(cell => cell.trim()); const rows = lines.filter(line => !/^\s*\|?[\s:|-]+\|?\s*$/.test(line)); return <div className="discovery-table" key={index}><table><thead><tr>{cells(rows[0]).map((cell,i) => <th key={i}>{inline(cell)}</th>)}</tr></thead><tbody>{rows.slice(1).map((row,i) => <tr key={i}>{cells(row).map((cell,j) => <td key={j}>{inline(cell)}</td>)}</tr>)}</tbody></table></div>; }
    if (block.startsWith("> ")) return <blockquote key={index}>{inline(block.replace(/^>\s?/gm, ""))}</blockquote>;
    return <p key={index}>{inline(block)}</p>;
  })}</div>;
}
