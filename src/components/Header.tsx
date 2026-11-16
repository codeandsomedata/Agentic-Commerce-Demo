import type { User } from 'firebase/auth';
import { LogIn, LogOut } from 'lucide-react';

export type ActiveTab = 'simulator' | 'catalog' | 'architecture' | 'prd';

interface HeaderProps {
  activeTab: ActiveTab;
  onSelectTab: (tab: ActiveTab) => void;
  user: User | null;
  authLoading: boolean;
  onSignIn: () => void;
  onSignOut: () => void;
}

export function Header({
  activeTab,
  onSelectTab,
  user,
  authLoading,
  onSignIn,
  onSignOut,
}: HeaderProps) {
  const navItems: { id: ActiveTab; label: string }[] = [
    { id: 'simulator', label: 'Copilot Simulator' },
    { id: 'catalog', label: 'Catalog Graph' },
    { id: 'architecture', label: 'Architecture' },
    { id: 'prd', label: 'PRD & Google Doc' },
  ];

  return (
    <header className="relative h-14 border-b border-[#dadce0] bg-white px-6 flex items-center justify-between gap-8 shrink-0">
      <div
        aria-hidden="true"
        className="absolute inset-x-0 top-0 h-[2.5px] bg-gradient-to-r from-[#4285F4] via-[#EA4335] via-55% to-[#34A853]"
      />

      {/* Zone 1: Single text element wordmark */}
      <button
        type="button"
        onClick={() => onSelectTab('simulator')}
        className="font-display text-base font-semibold tracking-tight text-[#1f1f1f] whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#1a73e8]"
      >
        Agentic Commerce Studio
      </button>

      {/* Zone 2: Clean single-line text navigation links */}
      <nav className="flex items-center gap-6 h-full">
        {navItems.map((item) => {
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelectTab(item.id)}
              className={`h-full px-1.5 text-sm font-medium transition-colors whitespace-nowrap shrink-0 border-b-[3px] cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1a73e8] ${
                isActive
                  ? 'border-[#1a73e8] text-[#1a73e8]'
                  : 'border-transparent text-[#5f6368] hover:text-[#1f1f1f]'
              }`}
            >
              {item.label}
            </button>
          );
        })}
      </nav>

      {/* Zone 3: Single primary action */}
      <div className="flex items-center shrink-0">
        {authLoading ? (
          <span className="text-xs text-[#747775] whitespace-nowrap shrink-0">
            Checking session
          </span>
        ) : user ? (
          <button
            type="button"
            onClick={onSignOut}
            className="inline-flex items-center gap-2 px-3.5 py-1.5 text-xs font-medium text-[#1f1f1f] bg-[#f0f4f9] hover:bg-[#e1e8f2] border border-[#dadce0] rounded-full transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-[#1a73e8]"
            title={user.email ?? 'Signed in'}
          >
            <span className="max-w-[140px] truncate">
              {user.displayName || user.email}
            </span>
            <LogOut className="w-3.5 h-3.5 text-[#5f6368]" aria-hidden="true" />
          </button>
        ) : (
          <button
            type="button"
            onClick={onSignIn}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-white bg-[#1a73e8] hover:bg-[#1557b0] rounded-full transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1a73e8]"
          >
            <LogIn className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Sign In with Google</span>
          </button>
        )}
      </div>
    </header>
  );
}
