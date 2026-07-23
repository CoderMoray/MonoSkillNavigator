import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

const remarkPlugins = [remarkGfm];

export function MarkdownContent({
  children,
  className = "markdown-content"
}: {
  children: string;
  className?: string;
}) {
  return (
    <div className={className}>
      <ReactMarkdown remarkPlugins={remarkPlugins}>{children}</ReactMarkdown>
    </div>
  );
}
