import { ReactNode } from "react";

export function Workspace(props: { children: ReactNode }): JSX.Element {
  return <main className="workspace">{props.children}</main>;
}

