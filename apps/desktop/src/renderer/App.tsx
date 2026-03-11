import { useRoutes } from "react-router-dom";
import { AppShell } from "./components/layout/AppShell";
import { routes } from "./app/routes";

export function App(): JSX.Element {
  const element = useRoutes(routes);
  return <AppShell>{element}</AppShell>;
}

