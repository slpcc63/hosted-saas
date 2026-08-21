"use client";

import type { ReactNode } from "react";
import { useId, useState } from "react";

export function ResponsiveNavMenu({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const menuId = useId();

  return (
    <div className={`nav-menu${open ? " open" : ""}`}>
      <button
        aria-controls={menuId}
        aria-expanded={open}
        className="nav-menu-toggle"
        onClick={() => setOpen((current) => !current)}
        type="button"
      >
        Menu
      </button>
      <div
        className="nav-links"
        id={menuId}
        onClick={(event) => {
          if ((event.target as Element).closest("a")) setOpen(false);
        }}
      >
        {children}
      </div>
    </div>
  );
}
