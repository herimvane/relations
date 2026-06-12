import { ReactNode } from 'react';

type Props = {
  top: ReactNode;
  center: ReactNode;
  right: ReactNode;
};

export function AppShell({ top, center, right }: Props) {
  return (
    <div className="app-shell">
      {top}
      <main className="workspace">
        <section className="graph-stage">{center}</section>
        {right}
      </main>
    </div>
  );
}
