"use client";

import Sidebar from "./Sidebar";
import { SidebarProvider } from "./SidebarContext";

export default function SidebarWrapper({ children }) {
  return (
    <SidebarProvider>
      <Sidebar />
      {children}
    </SidebarProvider>
  );
}

