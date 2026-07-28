import { AppShell } from "../../components/AppShell";
import { DocsSidebar } from "../../components/DocsSidebar";

export default function DocsLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppShell title="文档">
      <div className="docs-shell">
        <DocsSidebar />
        <div className="docs-article">{children}</div>
      </div>
    </AppShell>
  );
}
