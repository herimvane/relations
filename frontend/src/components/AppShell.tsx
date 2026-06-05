import { ReactNode } from 'react';

type Props = {
  top: ReactNode;
  left: ReactNode;
  center: ReactNode;
  right: ReactNode;
  bottom: ReactNode;
};

export function AppShell({ top, left, center, right, bottom }: Props) {
  return (
    <div className="app-shell">
      {top}
      <main className="workspace">
        {left}
        <section className="graph-stage">{center}</section>
        {right}
      </main>
      {bottom}
    </div>
  );
}
