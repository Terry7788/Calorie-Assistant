"use client";

import { useRouter, usePathname } from "next/navigation";
import { Button } from "@nextui-org/react";
import { useSidebar } from "./SidebarContext";

export default function Sidebar() {
  const { isOpen, setIsOpen } = useSidebar();
  const router = useRouter();
  const pathname = usePathname();

  const menuItems = [
    { label: "Food Database", path: "/" },
    { label: "Saved Meals", path: "/saved-meals" },
  ];

  function handleNavigation(path) {
    router.push(path);
    setIsOpen(false);
  }

  return (
    <>
      {/* Overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div
        className={`fixed top-0 left-0 h-full w-64 bg-white z-40 transform transition-transform duration-300 ease-in-out ${
          isOpen ? "translate-x-0" : "-translate-x-full"
        }`}
        style={{
          boxShadow: isOpen ? "2px 0 8px rgba(0,0,0,0.1)" : "none",
          borderRight: "1px solid var(--border, #e5e7eb)",
        }}
      >
        <div style={{ padding: "16px" }}>
          {/* Close button */}
          <div className="flex justify-between items-center mb-8">
            <h2 className="heading-1" style={{ fontSize: "20px", margin: 0 }}>
              Menu
            </h2>
            <Button
              isIconOnly
              variant="ghost"
              onClick={() => setIsOpen(false)}
              aria-label="Close menu"
              size="sm"
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
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </Button>
          </div>

          {/* Menu items */}
          <nav className="space-y-2">
            {menuItems.map((item) => {
              const isActive = pathname === item.path;
              return (
                <button
                  key={item.path}
                  onClick={() => handleNavigation(item.path)}
                  className={`w-full text-left px-4 py-3 rounded-lg transition-colors ${
                    isActive
                      ? "bg-green-100 text-green-800 font-semibold"
                      : "hover:bg-gray-100 text-gray-700"
                  }`}
                  style={{
                    backgroundColor: isActive ? "var(--accent-light, #d6f5e7)" : "transparent",
                    color: isActive ? "var(--accent-dark, #236a4d)" : "var(--text, #1a1a1a)",
                  }}
                >
                  {item.label}
                </button>
              );
            })}
          </nav>
        </div>
      </div>
    </>
  );
}

