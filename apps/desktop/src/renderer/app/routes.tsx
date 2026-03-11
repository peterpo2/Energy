import { Navigate, RouteObject } from "react-router-dom";
import { AnalysisPage } from "../pages/AnalysisPage";
import { HistoryPage } from "../pages/HistoryPage";
import { ImportPage } from "../pages/ImportPage";
import { SettingsPage } from "../pages/SettingsPage";

export const routes: RouteObject[] = [
  { path: "/", element: <Navigate to="/import" replace /> },
  { path: "/import", element: <ImportPage /> },
  { path: "/analysis", element: <AnalysisPage /> },
  { path: "/history", element: <HistoryPage /> },
  { path: "/settings", element: <SettingsPage /> },
];
