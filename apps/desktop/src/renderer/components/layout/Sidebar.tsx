import { APP_PRODUCT_NAME_UPPER } from "@shared";
import { NavLink } from "react-router-dom";
import { bgText } from "../../app/i18n/bg";

const items = [
  { to: "/import", label: bgText.navigation.import },
  { to: "/analysis", label: bgText.navigation.analysis },
  { to: "/history", label: bgText.navigation.history },
  { to: "/settings", label: bgText.navigation.settings },
];

export function Sidebar(): JSX.Element {
  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <div>{APP_PRODUCT_NAME_UPPER}</div>
        <div className="sidebar-brand-subtitle">{bgText.appTagline}</div>
      </div>
      <nav className="sidebar-nav">
        {items.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) => (isActive ? "sidebar-link sidebar-link-active" : "sidebar-link")}
          >
            {item.label}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
