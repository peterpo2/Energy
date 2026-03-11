import { ReactNode } from "react";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";
import { Workspace } from "./Workspace";

export function AppShell(props: { children: ReactNode }): JSX.Element {
  return (
    <div className="app-shell">
      <Sidebar />
      <div className="app-main-column">
        <TopBar />
        <Workspace>{props.children}</Workspace>
      </div>
    </div>
  );
}

