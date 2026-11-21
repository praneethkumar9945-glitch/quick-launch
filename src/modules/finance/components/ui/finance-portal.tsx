import * as React from "react";

/**
 * Overlays (sheets, dialogs, drawers) render into a body-level root that carries the
 * `.finance-module` class, so the module's scoped styles apply and they stack above the host top bar.
 */
export function getModulePortalRoot(name: string): HTMLElement {
  const id = `${name}-portal-root`;
  let root = document.getElementById(id);
  if (!root) {
    root = document.createElement("div");
    root.id = id;
    root.className = `${name}-module module-portal-root`;
    root.style.cssText =
      "position:fixed;top:0;left:0;width:0;height:0;overflow:visible;z-index:60;background:transparent;isolation:auto;min-height:0;";
    document.body.appendChild(root);
  }
  return root;
}

export function useFinancePortalRoot(): HTMLElement | undefined {
  const [root, setRoot] = React.useState<HTMLElement | undefined>(undefined);
  React.useEffect(() => setRoot(getModulePortalRoot("finance")), []);
  return root;
}
