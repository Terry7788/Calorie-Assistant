"use client";

import { Button } from "@nextui-org/react";
import { useSidebar } from "./SidebarContext";

export default function HamburgerButton() {
  const { isOpen, setIsOpen } = useSidebar();

  // Don't show hamburger when sidebar is open
  if (isOpen) return null;

  return (
    <Button
      isIconOnly
      variant="ghost"
      onClick={() => setIsOpen(true)}
      aria-label="Open menu"
      size="sm"
      style={{
        minWidth: '32px',
        height: '32px',
        padding: 0
      }}
    >
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <line x1="3" y1="12" x2="21" y2="12"></line>
        <line x1="3" y1="6" x2="21" y2="6"></line>
        <line x1="3" y1="18" x2="21" y2="18"></line>
      </svg>
    </Button>
  );
}

