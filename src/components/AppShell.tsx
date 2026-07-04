"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

function Sidebar() {
  const pathname = usePathname();

  const links = [
    { href: "/", label: "Chat" },
    { href: "/documents", label: "Documents" },
  ];

  return (
    <aside className="w-56 border-r border-neutral-800 flex flex-col p-4 shrink-0">
      <nav className="space-y-1">
        {links.map((l) => {
          const active = pathname === l.href;
          return (
            <Link
              key={l.href}
              href={l.href}
              className={
                "block rounded-lg px-3 py-2 text-sm " +
                (active
                  ? "bg-neutral-800 text-neutral-100"
                  : "text-neutral-400 hover:bg-neutral-900 hover:text-neutral-200")
              }
            >
              {l.label}
            </Link>
          );
        })}
        <div className="block rounded-lg px-3 py-2 text-sm text-neutral-600 cursor-not-allowed">
          History <span className="text-xs">(soon)</span>
        </div>
      </nav>
    </aside>
  );
}

function Header({ userEmail }: { userEmail: string }) {
  return (
    <header className="h-14 border-b border-neutral-800 flex items-center justify-between px-6 shrink-0">
      <div className="flex items-baseline gap-2">
        <span className="text-lg font-semibold">AskDocs</span>
        <span className="text-xs text-neutral-500">chat with your documents</span>
      </div>
      <div className="flex items-center gap-4">
        <span className="text-sm text-neutral-400 truncate max-w-[200px]">
          {userEmail}
        </span>
        <Link
          href="/auth/logout"
          className="text-sm text-neutral-400 hover:text-red-400"
        >
          Logout
        </Link>
      </div>
    </header>
  );
}

export default function AppShell({
  userEmail,
  children,
}: {
  userEmail: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 flex flex-col">
      <Header userEmail={userEmail} />
      <div className="flex flex-1 min-h-0">
        <Sidebar />
        <div className="flex-1 flex flex-col min-h-0">{children}</div>
      </div>
    </div>
  );
}