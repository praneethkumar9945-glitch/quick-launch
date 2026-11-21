import * as React from "react";

/**
 * Overlay content renders into a body-level root that carries the `.admin-module` class,
 * so the module's scoped styles apply and overlays stack above the host top bar.
 */
function getAdminPortalRoot(): HTMLElement {
  const id = "admin-portal-root";
  let root = document.getElementById(id);
  if (!root) {
    root = document.createElement("div");
    root.id = id;
    root.className = "admin-module module-portal-root";
    root.style.cssText =
      "position:fixed;top:0;left:0;width:0;height:0;overflow:visible;z-index:60;background:transparent;isolation:auto;min-height:0;";
    document.body.appendChild(root);
  }
  return root;
}

export function AdminPortalContainer({ children }: { children: (container: HTMLElement) => React.ReactNode }) {
  const [container, setContainer] = React.useState<HTMLElement | null>(null);
  React.useEffect(() => {
    setContainer(getAdminPortalRoot());
  }, []);
  return container ? children(container) : null;
}
