import { useCallback, useState } from 'react';
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  FileSpreadsheet,
  History,
  Image as ImageIcon,
  KeyRound,
  Layers,
  LayoutDashboard,
  LayoutGrid,
  LogIn,
  LogOut,
  Menu,
  Server,
  Settings,
  Users,
  X,
} from 'lucide-react';
import { AuthProvider, useAuth } from './context/AuthContext.tsx';
import { LoginView } from './components/LoginView.tsx';
import { ChangePasswordView } from './components/ChangePasswordView.tsx';
import { PortalView } from './components/PortalView.tsx';
import { AdminPanel, type AdminTab } from './components/AdminPanel.tsx';
import { BrandMark } from './components/BrandMark.tsx';
import { ToastContainer, type ToastMessage } from './components/Toast.tsx';
import type { HostingPlanFull } from './shared/types.ts';

const ADMIN_NAV_ITEMS: Array<{
  id: AdminTab;
  label: string;
  icon: typeof LayoutDashboard;
}> = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'upload', label: 'Upload Excel', icon: FileSpreadsheet },
  { id: 'plans', label: 'Manage Plans', icon: Server },
  { id: 'history', label: 'Pricing History', icon: History },
  { id: 'users', label: 'User Management', icon: Users },
  { id: 'logo', label: 'Logo Management', icon: ImageIcon },
  { id: 'settings', label: 'Settings', icon: Settings },
];

function PortalShell() {
  const { user, settings, categories, loading, logout, refreshSession } = useAuth();
  const [view, setView] = useState<'portal' | 'login' | 'admin' | 'change_password'>('portal');
  const [adminTab, setAdminTab] = useState<AdminTab>('dashboard');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [portalInspectPlan, setPortalInspectPlan] = useState<HostingPlanFull | null>(null);
  const [adminInspectPlan, setAdminInspectPlan] = useState<HostingPlanFull | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [categoriesOpen, setCategoriesOpen] = useState(true);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const addToast = useCallback((type: 'success' | 'error', text: string) => {
    const id = Date.now() + Math.floor(Math.random() * 1000);
    setToasts((prev) => [...prev, { id, type, text }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3500);
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F2F4F7] flex items-center justify-center">
        <div className="text-sm font-medium text-[#475569]">
          Loading HostGraber...
        </div>
      </div>
    );
  }

  const isAdmin = Boolean(
    user && (user.role === 'admin' || user.role === 'super_admin')
  );
  const roleLabel = user?.role === 'super_admin' ? 'Super Admin' : 'Admin';

  const effectiveView = (() => {
    if (user?.mustChangePassword) {
      return 'change_password';
    }
    if (view === 'login' && user) {
      return 'admin';
    }
    if ((view === 'admin' || view === 'change_password') && !user) {
      return 'login';
    }
    return view;
  })();

  const navigateToPortal = (category: string) => {
    if (user?.mustChangePassword) return;
    setSelectedCategory(category);
    setPortalInspectPlan(null);
    setView('portal');
    setMobileSidebarOpen(false);
  };

  const navigateToAdminTab = (tab: AdminTab) => {
    if (user?.mustChangePassword) return;
    setAdminInspectPlan(null);
    setAdminTab(tab);
    setView('admin');
    setMobileSidebarOpen(false);
  };

  const pageMeta = (() => {
    if (effectiveView === 'login') {
      return { title: 'Admin Login', crumbs: ['Home', 'Admin Login'] };
    }
    if (effectiveView === 'change_password') {
      return { title: 'Update Password', crumbs: ['Home', 'Security'] };
    }
    if (effectiveView === 'admin') {
      const tabLabel =
        ADMIN_NAV_ITEMS.find((t) => t.id === adminTab)?.label || 'Dashboard';
      if (adminInspectPlan) {
        return {
          title: adminInspectPlan.name,
          crumbs: ['Home', 'Admin', tabLabel, adminInspectPlan.name],
        };
      }
      return { title: tabLabel, crumbs: ['Home', 'Admin', tabLabel] };
    }
    if (portalInspectPlan) {
      return {
        title: portalInspectPlan.name,
        crumbs: ['Home', 'Plans', portalInspectPlan.categoryName, portalInspectPlan.name],
      };
    }
    if (selectedCategory !== 'all') {
      return {
        title: selectedCategory,
        crumbs: ['Home', 'Plans', selectedCategory],
      };
    }
    return { title: 'Plans Catalog', crumbs: ['Home', 'Plans Catalog'] };
  })();

  const sidebarContent = (isMobile: boolean) => {
    const compact = !isMobile && sidebarCollapsed;
    return (
      <div className="flex flex-col h-full bg-[#1D2129] text-[#CBD5E1] select-none">
        {/* Sidebar Brand Header */}
        <div
          className={`h-16 bg-[#14181F] border-b border-[#2A303C] flex items-center gap-2 shrink-0 ${
            compact ? 'justify-center px-2' : 'justify-between px-4'
          }`}
        >
          <button
            type="button"
            onClick={() => navigateToPortal('all')}
            className="flex items-center min-w-0 text-left cursor-pointer"
          >
            <BrandMark
              logoUrl={settings.logoUrl}
              companyName={settings.companyName}
              showCompanyName={settings.logoShowCompanyName}
              subtitle={user ? user.displayName || user.username : 'Pricing Portal'}
              compact={compact}
              tone="dark"
            />
          </button>

          {isMobile && (
            <button
              type="button"
              onClick={() => setMobileSidebarOpen(false)}
              className="p-1.5 text-[#94A3B8] hover:text-white rounded-md cursor-pointer"
              aria-label="Close navigation menu"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Navigation Links */}
        <nav
          aria-label="Workspace Navigation"
          className="sidebar-scroll flex-1 overflow-y-auto py-4 px-3 space-y-6"
        >
          {!user?.mustChangePassword && (
            <div className="space-y-1">
              {!compact && (
                <div className="px-2.5 pb-1 text-[11px] font-medium text-[#64748B]">
                  Catalog
                </div>
              )}

              <button
                type="button"
                onClick={() => navigateToPortal('all')}
                title="All Plans"
                className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[13.5px] transition-colors cursor-pointer whitespace-nowrap ${
                  effectiveView === 'portal' &&
                  selectedCategory === 'all' &&
                  !portalInspectPlan
                    ? 'bg-[#2B3240] text-white font-medium'
                    : 'text-[#B6C2CF] hover:bg-[#252B36] hover:text-white'
                } ${compact ? 'justify-center' : ''}`}
              >
                <LayoutGrid
                  className={`w-4 h-4 shrink-0 ${
                    effectiveView === 'portal' && selectedCategory === 'all'
                      ? 'text-[#17C964]'
                      : 'text-[#8C9BAB]'
                  }`}
                />
                {!compact && <span className="truncate">All Plans</span>}
              </button>

              {!compact && categories.length > 0 && (
                <div>
                  <button
                    type="button"
                    onClick={() => setCategoriesOpen((v) => !v)}
                    className="w-full flex items-center justify-between gap-2 px-2.5 py-2 rounded-lg text-[13.5px] text-[#B6C2CF] hover:bg-[#252B36] hover:text-white transition-colors cursor-pointer whitespace-nowrap"
                  >
                    <span className="flex items-center gap-2.5 min-w-0">
                      <Layers className="w-4 h-4 shrink-0 text-[#8C9BAB]" />
                      <span className="truncate">Categories</span>
                    </span>
                    {categoriesOpen ? (
                      <ChevronDown className="w-3.5 h-3.5 text-[#8C9BAB] shrink-0" />
                    ) : (
                      <ChevronRight className="w-3.5 h-3.5 text-[#8C9BAB] shrink-0" />
                    )}
                  </button>

                  {categoriesOpen && (
                    <div className="mt-1 ml-3 pl-3 border-l border-[#2E3542] space-y-0.5">
                      {categories.map((cat) => {
                        const isCatActive =
                          effectiveView === 'portal' &&
                          selectedCategory.toLowerCase() === cat.name.toLowerCase();
                        return (
                          <button
                            key={cat.id}
                            type="button"
                            onClick={() => navigateToPortal(cat.name)}
                            className={`w-full text-left px-2.5 py-1.5 rounded-md text-[12.5px] transition-colors cursor-pointer truncate ${
                              isCatActive
                                ? 'bg-[#2B3240] text-[#17C964] font-medium'
                                : 'text-[#94A3B8] hover:text-white hover:bg-[#252B36]'
                            }`}
                          >
                            {cat.name}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {isAdmin && !user?.mustChangePassword && (
            <div className="space-y-1">
              {!compact && (
                <div className="px-2.5 pb-1 text-[11px] font-medium text-[#64748B]">
                  Admin
                </div>
              )}

              {ADMIN_NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                const active = effectiveView === 'admin' && adminTab === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => navigateToAdminTab(item.id)}
                    title={item.label}
                    className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[13.5px] transition-colors cursor-pointer whitespace-nowrap ${
                      active
                        ? 'bg-[#2B3240] text-white font-medium'
                        : 'text-[#B6C2CF] hover:bg-[#252B36] hover:text-white'
                    } ${compact ? 'justify-center' : ''}`}
                  >
                    <Icon
                      className={`w-4 h-4 shrink-0 ${
                        active ? 'text-[#17C964]' : 'text-[#8C9BAB]'
                      }`}
                    />
                    {!compact && <span className="truncate">{item.label}</span>}
                  </button>
                );
              })}
            </div>
          )}

          {!user && (
            <div className="space-y-1 pt-3 border-t border-[#2A303C]">
              <button
                type="button"
                onClick={() => {
                  setView('login');
                  setMobileSidebarOpen(false);
                }}
                title="Admin Login"
                className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[13.5px] transition-colors cursor-pointer whitespace-nowrap ${
                  effectiveView === 'login'
                    ? 'bg-[#2B3240] text-white font-medium'
                    : 'text-[#B6C2CF] hover:bg-[#252B36] hover:text-white'
                } ${compact ? 'justify-center' : ''}`}
              >
                <LogIn className="w-4 h-4 shrink-0 text-[#17C964]" />
                {!compact && <span className="truncate">Admin Login</span>}
              </button>
            </div>
          )}
        </nav>

        {/* Bottom Collapse Bar */}
        {!isMobile && (
          <div className="h-11 bg-[#14181F] border-t border-[#2A303C] flex items-center shrink-0">
            <button
              type="button"
              onClick={() => setSidebarCollapsed((c) => !c)}
              className="w-full h-full flex items-center justify-center text-[#94A3B8] hover:text-white hover:bg-[#1D2129] transition-colors cursor-pointer"
              aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              {sidebarCollapsed ? (
                <ChevronRight className="w-4 h-4" />
              ) : (
                <ChevronLeft className="w-4 h-4" />
              )}
            </button>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="min-h-screen flex bg-[#F2F4F7] text-[#0F172A] overflow-x-clip">
      {/* Desktop Persistent Sidebar */}
      <aside
        className={`hidden lg:block shrink-0 transition-[width] duration-200 border-r border-[#2A303C] sticky top-0 h-screen ${
          sidebarCollapsed ? 'w-[72px]' : 'w-60'
        }`}
      >
        {sidebarContent(false)}
      </aside>

      {/* Mobile Slide-Over Sidebar */}
      {mobileSidebarOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs"
            onClick={() => setMobileSidebarOpen(false)}
          />
          <aside className="relative z-10 w-64 max-w-[82vw] h-full shadow-xl">
            {sidebarContent(true)}
          </aside>
        </div>
      )}

      {/* Main Workspace Area */}
      <div className="flex-1 min-w-0 flex flex-col min-h-screen">
        {/* Crisp White Top Breadcrumb Header */}
        <header className="h-16 bg-white border-b border-[#E2E8F0] sticky top-0 z-30 px-4 sm:px-8 flex items-center justify-between gap-3 sm:gap-6">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileSidebarOpen(true)}
              className="lg:hidden p-2 -ml-2 text-[#475569] hover:text-[#0F172A] hover:bg-[#F8FAFC] rounded-lg cursor-pointer"
              aria-label="Open navigation menu"
            >
              <Menu className="w-5 h-5" />
            </button>

            <div className="flex items-baseline gap-3 min-w-0">
              <h1 className="text-[17px] font-semibold text-[#0F172A] truncate">
                {pageMeta.title}
              </h1>
              <nav
                aria-label="Breadcrumb"
                className="hidden sm:flex items-center gap-1.5 text-xs text-[#64748B] truncate"
              >
                {pageMeta.crumbs.map((crumb, idx) => (
                  <span key={`${crumb}-${idx}`} className="inline-flex items-center gap-1.5">
                    {idx > 0 && <span aria-hidden="true">/</span>}
                    {idx === 0 ? (
                      <button
                        type="button"
                        onClick={() => navigateToPortal('all')}
                        className="hover:text-[#059669] cursor-pointer"
                      >
                        {crumb}
                      </button>
                    ) : (
                      <span
                        className={
                          idx === pageMeta.crumbs.length - 1
                            ? 'text-[#334155] font-medium truncate max-w-[180px]'
                            : 'truncate max-w-[140px]'
                        }
                      >
                        {crumb}
                      </span>
                    )}
                  </span>
                ))}
              </nav>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {user ? (
              <>
                {!user.mustChangePassword && (
                  <button
                    type="button"
                    onClick={() => navigateToAdminTab('upload')}
                    className="hidden sm:inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-[#04120A] bg-[#17C964] hover:bg-[#10B981] rounded-lg transition-colors cursor-pointer whitespace-nowrap shrink-0"
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5" />
                    <span>Upload Excel</span>
                  </button>
                )}

                <div className="hidden md:flex items-center gap-1.5 pl-3 border-l border-[#E2E8F0] text-xs text-[#64748B] whitespace-nowrap">
                  <span className="font-medium text-[#0F172A]">
                    {user.displayName || user.username}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>{roleLabel}</span>
                </div>

                {!user.mustChangePassword && (
                  <button
                    type="button"
                    onClick={() => setView('change_password')}
                    title="Change Password"
                    className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-[#334155] bg-white border border-[#CBD5E1] hover:bg-[#F8FAFC] rounded-lg transition-colors cursor-pointer whitespace-nowrap shrink-0"
                  >
                    <KeyRound className="w-3.5 h-3.5 text-[#10B981]" />
                    <span className="hidden xl:inline">Password</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={async () => {
                    await logout();
                    setView('portal');
                    addToast('success', 'Signed out of Admin Panel.');
                  }}
                  title="Sign Out"
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-[#334155] bg-white border border-[#CBD5E1] hover:bg-[#F8FAFC] rounded-lg transition-colors cursor-pointer whitespace-nowrap shrink-0"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Sign Out</span>
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => setView('login')}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-[#04120A] bg-[#17C964] hover:bg-[#10B981] rounded-lg transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                <LogIn className="w-3.5 h-3.5" />
                <span>Admin Login</span>
              </button>
            )}
          </div>
        </header>

        {/* Main Scrollable Canvas */}
        <main className="flex-1 min-w-0 p-4 sm:p-8">
          {effectiveView === 'change_password' && user ? (
            <ChangePasswordView
              forced={Boolean(user.mustChangePassword)}
              onSuccess={() => setView('admin')}
              onCancel={user.mustChangePassword ? undefined : () => setView('admin')}
              onToast={addToast}
            />
          ) : effectiveView === 'login' ? (
            <LoginView onCancel={() => setView('portal')} />
          ) : effectiveView === 'admin' && user && isAdmin ? (
            <AdminPanel
              user={user}
              settings={settings}
              categories={categories}
              activeTab={adminTab}
              inspectPlan={adminInspectPlan}
              onInspectPlanChange={setAdminInspectPlan}
              onChangeTab={navigateToAdminTab}
              onRefreshContext={refreshSession}
              onToast={addToast}
            />
          ) : (
            <PortalView
              settings={settings}
              categories={categories}
              selectedCategory={selectedCategory}
              onSelectCategory={setSelectedCategory}
              selectedPlan={portalInspectPlan}
              onSelectPlan={setPortalInspectPlan}
              onToast={addToast}
            />
          )}
        </main>
      </div>

      <ToastContainer
        toasts={toasts}
        onDismiss={(id) => setToasts((prev) => prev.filter((t) => t.id !== id))}
      />
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <PortalShell />
    </AuthProvider>
  );
}
