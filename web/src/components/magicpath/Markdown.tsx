import ReactMarkdown from 'react-markdown';
import rehypeSanitize from 'rehype-sanitize';
import remarkGfm from 'remark-gfm';

export function Markdown({ value, compact = false }: { value?: string; compact?: boolean }) {
  const source = (value ?? '').trim();
  if (!source) return null;
  return (
    <div className={`mp-markdown ${compact ? 'compact' : ''}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeSanitize]}
        components={{
          a: ({ href, children }) => <a href={href} target="_blank" rel="noreferrer">{children}</a>,
        }}
      >
        {source}
      </ReactMarkdown>
    </div>
  );
}
