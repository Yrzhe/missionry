import type { ReactNode } from 'react';

function linkIsSafe(value: string) {
  return /^(https?:|mailto:|\/|#)/i.test(value.trim());
}

function inlineMarkdown(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const pattern = /(`([^`]+)`)|(\*\*([^*]+)\*\*)|(\[([^\]]+)\]\(([^)]+)\))/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;
  while ((match = pattern.exec(text))) {
    if (match.index > lastIndex) nodes.push(text.slice(lastIndex, match.index));
    if (match[2]) nodes.push(<code key={`code-${key++}`}>{match[2]}</code>);
    if (match[4]) nodes.push(<strong key={`strong-${key++}`}>{match[4]}</strong>);
    if (match[6]) {
      const href = match[7].trim();
      nodes.push(linkIsSafe(href) ? <a key={`link-${key++}`} href={href} target="_blank" rel="noreferrer">{match[6]}</a> : match[6]);
    }
    lastIndex = pattern.lastIndex;
  }
  if (lastIndex < text.length) nodes.push(text.slice(lastIndex));
  return nodes;
}

export function Markdown({ value, compact = false }: { value?: string; compact?: boolean }) {
  const source = (value ?? '').trim();
  if (!source) return null;
  const blocks: ReactNode[] = [];
  const lines = source.split(/\r?\n/);
  let list: string[] = [];
  let code: string[] | null = null;

  function flushList() {
    if (!list.length) return;
    blocks.push(<ul key={`ul-${blocks.length}`}>{list.map((item, index) => <li key={index}>{inlineMarkdown(item)}</li>)}</ul>);
    list = [];
  }

  function flushCode() {
    if (!code) return;
    blocks.push(<pre key={`pre-${blocks.length}`}><code>{code.join('\n')}</code></pre>);
    code = null;
  }

  lines.forEach((line) => {
    if (line.trim().startsWith('```')) {
      if (code) flushCode();
      else {
        flushList();
        code = [];
      }
      return;
    }
    if (code) {
      code.push(line);
      return;
    }
    const trimmed = line.trim();
    if (!trimmed) {
      flushList();
      return;
    }
    const heading = trimmed.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      flushList();
      const Tag = heading[1].length === 1 ? 'h3' : 'h4';
      blocks.push(<Tag key={`h-${blocks.length}`}>{inlineMarkdown(heading[2])}</Tag>);
      return;
    }
    const listItem = trimmed.match(/^[-*]\s+(.+)$/);
    if (listItem) {
      list.push(listItem[1]);
      return;
    }
    flushList();
    blocks.push(<p key={`p-${blocks.length}`}>{inlineMarkdown(trimmed)}</p>);
  });

  flushList();
  flushCode();
  return <div className={`mp-markdown ${compact ? 'compact' : ''}`}>{blocks}</div>;
}
