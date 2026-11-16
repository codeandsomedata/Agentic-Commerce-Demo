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
    <header className="h-14 border-b border-slate-200 bg-white px-6 flex items-center justify-between gap-8 shrink-0">
      {/* Zone 1: Single text element wordmark */}
      <button
        type="button"
        onClick={() => onSelectTab('simulator')}
        className="font-display text-base font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-600"
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
              className={`h-full px-1 text-sm font-medium transition-colors whitespace-nowrap shrink-0 border-b-2 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 ${
                isActive
                  ? 'border-blue-600 text-slate-900'
                  : 'border-transparent text-slate-500 hover:text-slate-900'
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
          <span className="text-xs text-slate-400 whitespace-nowrap shrink-0">
            Checking session
          </span>
        ) : user ? (
          <button
            type="button"
            onClick={onSignOut}
            className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-blue-600"
            title={user.email ?? 'Signed in'}
          >
            <span className="max-w-[140px] truncate">
              {user.displayName || user.email}
            </span>
            <LogOut className="w-3.5 h-3.5 text-slate-500" aria-hidden="true" />
          </button>
        ) : (
          <button
            type="button"
            onClick={onSignIn}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
          >
            <LogIn className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Sign In with Google</span>
          </button>
        )}
      </div>
    </header>
  );
}
