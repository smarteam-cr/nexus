"use client";

import { useState } from "react";
import { ChevronRight } from "lucide-react";

interface Props {
  title: string;
  count?: number;
  defaultOpen?: boolean;
  children: React.ReactNode;
}

export default function CollapsibleSection({ title, count, defaultOpen = true, children }: Props) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="border-t border-gray-800/60">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 w-full py-3 text-left group"
      >
        <ChevronRight
          className={`w-3.5 h-3.5 text-gray-500 transition-transform ${open ? "rotate-90" : ""}`}
        />
        <span className="text-2xs font-semibold text-gray-500 uppercase tracking-wider">
          {title}
        </span>
        {count !== undefined && (
          <span className="text-2xs text-gray-600">({count})</span>
        )}
      </button>

      {open && <div className="pb-4">{children}</div>}
    </div>
  );
}
