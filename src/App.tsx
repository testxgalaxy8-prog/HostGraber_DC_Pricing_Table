import { useCallback, useState } from 'react';
import {
  BarChart3,
  BookOpen,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  LayoutDashboard,
  LayoutGrid,
  Layers,
  Lock,
  LogIn,
  LogOut,
  Menu,
  MessageSquareText,
  PhoneCall,
  ScrollText,
  Server,
  Settings,
  UserCircle2,
  Users,
  Webhook,
  X,
} from 'lucide-react';
import { AuthProvider, useAuth } from './context/AuthContext.tsx';
import { LoginView } from './components/LoginView.tsx';
import { ChangePasswordView } from './components/ChangePasswordView.tsx';
import { PortalView } from './components/PortalView.tsx';
import { LeadManageView } from './components/leads/LeadManageView.tsx';
import { LeadReminderCenter } from './components/leads/LeadReminderCenter.tsx';
import { AdminPanel, type AdminTab } from './components/AdminPanel.tsx';
import { BrandMark } from './components/BrandMark.tsx';
import { UserAvatar } from './components/UserAvatar.tsx';
import { ToastContainer, type ToastMessage } from './components/Toast.tsx';
import {
  COMMUNICATION_CATEGORIES,
  KNOWLEDGEBASE_CATEGORIES,
} from './shared/leads.ts';
import type {
  CommunicationCategory,
  HostingPlanFull,
  KnowledgebaseCategory,
} from './shared/types.ts';
import type { ReportsSubTab } from './components/portal/ReportsAnalyticsView.tsx';
import type { TeamManagementSubTab } from './components/portal/TeamManagementView.tsx';
import type { LogsCenterTab } from './components/portal/LogsCenterView.tsx';
import type { ProfileSubTab } from './components/portal/ProfileView.tsx';

function PortalShell() {
  const { user, settings, categories, loading, logout, refreshSession } = useAuth();
  const [view, setView] = useState<
    'portal' | 'login' | 'admin' | 'leads' | 'change_password'
  >('portal');
  const [postLoginView, setPostLoginView] = useState<'admin' | 'leads'>('admin');
  const [adminTab, setAdminTab] = useState<AdminTab>('dashboard');

  const [kbCategory, setKbCategory] = useState<KnowledgebaseCategory | 'all'>('all');
  const [commCategory, setCommCategory] = useState<CommunicationCategory | 'all'>('all');
  const [reportsTab, setReportsTab] = useState<ReportsSubTab>('sales');
  const [teamTab, setTeamTab] = useState<TeamManagementSubTab>('directory');
  const [logsTab, setLogsTab] = useState<LogsCenterTab>('access');
  const [profileTab, setProfileTab] = useState<ProfileSubTab>('avatar');

  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [portalInspectPlan, setPortalInspectPlan] =
    useState<HostingPlanFull | null>(null);
  const [adminInspectPlan, setAdminInspectPlan] =
    useState<HostingPlanFull | null>(null);

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  // Collapsible sidebar sections
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({
    products: true,
    categories: false,
    knowledgebase: false,
    communication: false,
    reports: false,
    team: false,
    logs: false,
    profile: false,
  });

  const [pendingOpenLeadId, setPendingOpenLeadId] = useState<number | null>(null);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const toggleGroup = (key: string) => {
    setOpenGroups((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const addToast = useCallback((type: 'success' | 'error', text: string) => {
    const id = Date.now() + Math.floor(Math.random() * 1000);
    setToasts((prev) => [...prev, { id, type, text }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3500);
  }, []);

  const handleOpenLeadFromReminder = useCallback((leadId: number) => {
    setPendingOpenLeadId(leadId);
    setView('leads');
    setMobileSidebarOpen(false);
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
  const isSuperAdmin = user?.role === 'super_admin';
  const roleLabel = isSuperAdmin ? 'Super Admin' : 'Admin';

  const effectiveView = (() => {
    if (user?.mustChangePassword) {
      return 'change_password';
    }
    if (view === 'login' && user) {
      return postLoginView;
    }
    if (
      (view === 'admin' || view === 'leads' || view === 'change_password') &&
      !user
    ) {
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

  const navigateToLeads = () => {
    if (user?.mustChangePassword) return;
    setMobileSidebarOpen(false);
    if (!user || !isAdmin) {
      setPostLoginView('leads');
      setView('login');
      addToast('error', 'Please sign in as Admin to access Lead Management.');
      return;
    }
    setView('leads');
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
    if (effectiveView === 'leads') {
      return { title: 'Lead Management', crumbs: ['Home', 'Lead Management'] };
    }
    if (effectiveView === 'admin') {
      const tabTitles: Record<AdminTab, string> = {
        dashboard: 'Dashboard',
        upload: 'Upload Excel',
        plans: 'Manage Plans',
        history: 'Pricing History',
        knowledgebase: 'Knowledgebase',
        communication: 'Communication Center',
        reports: 'Reports & Analytics',
        team: 'Team Management',
        integrations: 'Integrations & API',
        logs: 'Logs',
        profile: 'Profile',
        settings: 'General Settings',
      };
      const tabLabel = tabTitles[adminTab] || 'Dashboard';
      if (adminInspectPlan) {
        return {
          title: adminInspectPlan.name,
          crumbs: ['Home', 'Portal', tabLabel, adminInspectPlan.name],
        };
      }
      return { title: tabLabel, crumbs: ['Home', tabLabel] };
    }
    if (portalInspectPlan) {
      return {
        title: portalInspectPlan.name,
        crumbs: [
          'Home',
          'Product & Pricing',
          portalInspectPlan.categoryName,
          portalInspectPlan.name,
        ],
      };
    }
    if (selectedCategory !== 'all') {
      return {
        title: selectedCategory,
        crumbs: ['Home', 'Product & Pricing', selectedCategory],
      };
    }
    return {
      title: 'All Plans',
      crumbs: ['Home', 'Product & Pricing', 'All Plans'],
    };
  })();

  const navBtnClass = (active: boolean, compact: boolean) =>
    `w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[13px] transition-colors cursor-pointer whitespace-nowrap ${
      active
        ? 'bg-[#2B3240] text-white font-medium'
        : 'text-[#B6C2CF] hover:bg-[#252B36] hover:text-white'
    } ${compact ? 'justify-center' : ''}`;

  const subNavBtnClass = (active: boolean) =>
    `w-full text-left px-2.5 py-1.5 rounded-md text-[12.5px] transition-colors cursor-pointer truncate ${
      active
        ? 'bg-[#2B3240] text-[#17C964] font-medium'
        : 'text-[#94A3B8] hover:text-white hover:bg-[#252B36]'
    }`;

  const sidebarContent = (isMobile: boolean) => {
    const compact = !isMobile && sidebarCollapsed;
    return (
      <div className="flex flex-col h-full bg-[#1D2129] text-[#CBD5E1] select-none">
        {/* HostGraber Brand Header */}
        <div
          className={`h-16 bg-[#14181F] border-b border-[#2A303C] flex items-center gap-2 shrink-0 ${
            compact ? 'justify-center px-2' : 'justify-between px-4'
          }`}
        >
          <button
            type="button"
            onClick={() =>
              isAdmin ? navigateToAdminTab('dashboard') : navigateToPortal('all')
            }
            className="flex items-center min-w-0 text-left cursor-pointer"
          >
            <BrandMark
              logoUrl={settings.logoUrl}
              companyName={settings.companyName}
              showCompanyName={settings.logoShowCompanyName}
              subtitle={
                user ? user.displayName || user.username : 'Sales Portal'
              }
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
          className="sidebar-scroll flex-1 overflow-y-auto py-4 px-3 space-y-1.5"
        >
          {isAdmin && !user?.mustChangePassword ? (
            <>
              {/* 1. Dashboard */}
              <button
                type="button"
                onClick={() => navigateToAdminTab('dashboard')}
                title="Dashboard"
                className={navBtnClass(
                  effectiveView === 'admin' && adminTab === 'dashboard',
                  compact
                )}
              >
                <LayoutDashboard
                  className={`w-4 h-4 shrink-0 ${
                    effectiveView === 'admin' && adminTab === 'dashboard'
                      ? 'text-[#17C964]'
                      : 'text-[#8C9BAB]'
                  }`}
                />
                {!compact && <span className="truncate">Dashboard</span>}
              </button>

              {/* 2. Product & Pricing Management */}
              <div>
                <button
                  type="button"
                  onClick={() =>
                    compact
                      ? navigateToPortal('all')
                      : toggleGroup('products')
                  }
                  title="Product & Pricing Management"
                  className={`w-full flex items-center justify-between gap-2 px-2.5 py-2 rounded-lg text-[13px] transition-colors cursor-pointer whitespace-nowrap ${
                    effectiveView === 'portal' ||
                    (effectiveView === 'admin' &&
                      (adminTab === 'upload' ||
                        adminTab === 'plans' ||
                        adminTab === 'history'))
                      ? 'text-white font-medium bg-[#252B36]'
                      : 'text-[#B6C2CF] hover:bg-[#252B36] hover:text-white'
                  } ${compact ? 'justify-center' : ''}`}
                >
                  <span className="flex items-center gap-2.5 min-w-0">
                    <Server
                      className={`w-4 h-4 shrink-0 ${
                        effectiveView === 'portal' ||
                        (effectiveView === 'admin' &&
                          (adminTab === 'upload' ||
                            adminTab === 'plans' ||
                            adminTab === 'history'))
                          ? 'text-[#17C964]'
                          : 'text-[#8C9BAB]'
                      }`}
                    />
                    {!compact && (
                      <span className="truncate">Product &amp; Pricing</span>
                    )}
                  </span>
                  {!compact &&
                    (openGroups.products ? (
                      <ChevronDown className="w-3.5 h-3.5 text-[#8C9BAB] shrink-0" />
                    ) : (
                      <ChevronRight className="w-3.5 h-3.5 text-[#8C9BAB] shrink-0" />
                    ))}
                </button>

                {!compact && openGroups.products && (
                  <div className="mt-1 ml-3 pl-3 border-l border-[#2E3542] space-y-0.5">
                    <button
                      type="button"
                      onClick={() => navigateToPortal('all')}
                      className={subNavBtnClass(
                        effectiveView === 'portal' &&
                          selectedCategory === 'all' &&
                          !portalInspectPlan
                      )}
                    >
                      All Plans
                    </button>

                    {categories.length > 0 && (
                      <div>
                        <button
                          type="button"
                          onClick={() => toggleGroup('categories')}
                          className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-md text-[12.5px] text-[#94A3B8] hover:text-white hover:bg-[#252B36] cursor-pointer"
                        >
                          <span className="truncate">Categories</span>
                          {openGroups.categories ? (
                            <ChevronDown className="w-3 h-3 shrink-0" />
                          ) : (
                            <ChevronRight className="w-3 h-3 shrink-0" />
                          )}
                        </button>
                        {openGroups.categories && (
                          <div className="mt-0.5 ml-2.5 pl-2.5 border-l border-[#2E3542] space-y-0.5">
                            {categories.map((cat) => (
                              <button
                                key={cat.id}
                                type="button"
                                onClick={() => navigateToPortal(cat.name)}
                                className={subNavBtnClass(
                                  effectiveView === 'portal' &&
                                    selectedCategory.toLowerCase() ===
                                      cat.name.toLowerCase()
                                )}
                              >
                                {cat.name}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {isSuperAdmin && (
                      <button
                        type="button"
                        onClick={() => navigateToAdminTab('upload')}
                        className={subNavBtnClass(
                          effectiveView === 'admin' && adminTab === 'upload'
                        )}
                      >
                        Upload Excel
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => navigateToAdminTab('plans')}
                      className={subNavBtnClass(
                        effectiveView === 'admin' && adminTab === 'plans'
                      )}
                    >
                      Manage Plans
                    </button>
                    <button
                      type="button"
                      onClick={() => navigateToAdminTab('history')}
                      className={subNavBtnClass(
                        effectiveView === 'admin' && adminTab === 'history'
                      )}
                    >
                      Pricing History
                    </button>
                  </div>
                )}
              </div>

              {/* 3. Lead Management */}
              <button
                type="button"
                onClick={navigateToLeads}
                title="Lead Management"
                className={navBtnClass(effectiveView === 'leads', compact)}
              >
                <PhoneCall
                  className={`w-4 h-4 shrink-0 ${
                    effectiveView === 'leads'
                      ? 'text-[#17C964]'
                      : 'text-[#8C9BAB]'
                  }`}
                />
                {!compact && <span className="truncate">Lead Management</span>}
              </button>

              {/* 4. Knowledgebase */}
              <div>
                <button
                  type="button"
                  onClick={() => {
                    if (compact) {
                      setKbCategory('all');
                      navigateToAdminTab('knowledgebase');
                    } else {
                      toggleGroup('knowledgebase');
                    }
                  }}
                  title="Knowledgebase"
                  className={`w-full flex items-center justify-between gap-2 px-2.5 py-2 rounded-lg text-[13px] transition-colors cursor-pointer whitespace-nowrap ${
                    effectiveView === 'admin' && adminTab === 'knowledgebase'
                      ? 'bg-[#2B3240] text-white font-medium'
                      : 'text-[#B6C2CF] hover:bg-[#252B36] hover:text-white'
                  } ${compact ? 'justify-center' : ''}`}
                >
                  <span className="flex items-center gap-2.5 min-w-0">
                    <BookOpen
                      className={`w-4 h-4 shrink-0 ${
                        effectiveView === 'admin' && adminTab === 'knowledgebase'
                          ? 'text-[#17C964]'
                          : 'text-[#8C9BAB]'
                      }`}
                    />
                    {!compact && <span className="truncate">Knowledgebase</span>}
                  </span>
                  {!compact &&
                    (openGroups.knowledgebase ? (
                      <ChevronDown className="w-3.5 h-3.5 text-[#8C9BAB] shrink-0" />
                    ) : (
                      <ChevronRight className="w-3.5 h-3.5 text-[#8C9BAB] shrink-0" />
                    ))}
                </button>

                {!compact && openGroups.knowledgebase && (
                  <div className="mt-1 ml-3 pl-3 border-l border-[#2E3542] space-y-0.5">
                    {KNOWLEDGEBASE_CATEGORIES.map((cat) => (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => {
                          setKbCategory(cat.id);
                          navigateToAdminTab('knowledgebase');
                        }}
                        className={subNavBtnClass(
                          effectiveView === 'admin' &&
                            adminTab === 'knowledgebase' &&
                            kbCategory === cat.id
                        )}
                      >
                        {cat.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* 5. Communication Center */}
              <div>
                <button
                  type="button"
                  onClick={() => {
                    if (compact) {
                      setCommCategory('all');
                      navigateToAdminTab('communication');
                    } else {
                      toggleGroup('communication');
                    }
                  }}
                  title="Communication Center"
                  className={`w-full flex items-center justify-between gap-2 px-2.5 py-2 rounded-lg text-[13px] transition-colors cursor-pointer whitespace-nowrap ${
                    effectiveView === 'admin' && adminTab === 'communication'
                      ? 'bg-[#2B3240] text-white font-medium'
                      : 'text-[#B6C2CF] hover:bg-[#252B36] hover:text-white'
                  } ${compact ? 'justify-center' : ''}`}
                >
                  <span className="flex items-center gap-2.5 min-w-0">
                    <MessageSquareText
                      className={`w-4 h-4 shrink-0 ${
                        effectiveView === 'admin' && adminTab === 'communication'
                          ? 'text-[#17C964]'
                          : 'text-[#8C9BAB]'
                      }`}
                    />
                    {!compact && (
                      <span className="truncate">Communication Center</span>
                    )}
                  </span>
                  {!compact &&
                    (openGroups.communication ? (
                      <ChevronDown className="w-3.5 h-3.5 text-[#8C9BAB] shrink-0" />
                    ) : (
                      <ChevronRight className="w-3.5 h-3.5 text-[#8C9BAB] shrink-0" />
                    ))}
                </button>

                {!compact && openGroups.communication && (
                  <div className="mt-1 ml-3 pl-3 border-l border-[#2E3542] space-y-0.5">
                    {COMMUNICATION_CATEGORIES.map((cat) => (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => {
                          setCommCategory(cat.id);
                          navigateToAdminTab('communication');
                        }}
                        className={subNavBtnClass(
                          effectiveView === 'admin' &&
                            adminTab === 'communication' &&
                            commCategory === cat.id
                        )}
                      >
                        {cat.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* 6. Reports & Analytics */}
              <div>
                <button
                  type="button"
                  onClick={() => {
                    if (compact) {
                      setReportsTab('sales');
                      navigateToAdminTab('reports');
                    } else {
                      toggleGroup('reports');
                    }
                  }}
                  title="Reports & Analytics"
                  className={`w-full flex items-center justify-between gap-2 px-2.5 py-2 rounded-lg text-[13px] transition-colors cursor-pointer whitespace-nowrap ${
                    effectiveView === 'admin' && adminTab === 'reports'
                      ? 'bg-[#2B3240] text-white font-medium'
                      : 'text-[#B6C2CF] hover:bg-[#252B36] hover:text-white'
                  } ${compact ? 'justify-center' : ''}`}
                >
                  <span className="flex items-center gap-2.5 min-w-0">
                    <BarChart3
                      className={`w-4 h-4 shrink-0 ${
                        effectiveView === 'admin' && adminTab === 'reports'
                          ? 'text-[#17C964]'
                          : 'text-[#8C9BAB]'
                      }`}
                    />
                    {!compact && (
                      <span className="truncate">Reports &amp; Analytics</span>
                    )}
                  </span>
                  {!compact &&
                    (openGroups.reports ? (
                      <ChevronDown className="w-3.5 h-3.5 text-[#8C9BAB] shrink-0" />
                    ) : (
                      <ChevronRight className="w-3.5 h-3.5 text-[#8C9BAB] shrink-0" />
                    ))}
                </button>

                {!compact && openGroups.reports && (
                  <div className="mt-1 ml-3 pl-3 border-l border-[#2E3542] space-y-0.5">
                    <button
                      type="button"
                      onClick={() => {
                        setReportsTab('sales');
                        navigateToAdminTab('reports');
                      }}
                      className={subNavBtnClass(
                        effectiveView === 'admin' &&
                          adminTab === 'reports' &&
                          reportsTab === 'sales'
                      )}
                    >
                      Sales Performance
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setReportsTab('revenue');
                        navigateToAdminTab('reports');
                      }}
                      className={subNavBtnClass(
                        effectiveView === 'admin' &&
                          adminTab === 'reports' &&
                          reportsTab === 'revenue'
                      )}
                    >
                      Revenue Reports
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setReportsTab('team');
                        navigateToAdminTab('reports');
                      }}
                      className={subNavBtnClass(
                        effectiveView === 'admin' &&
                          adminTab === 'reports' &&
                          reportsTab === 'team'
                      )}
                    >
                      Team Performance
                    </button>
                  </div>
                )}
              </div>

              {/* 7. Team Management (Super Admin Only) */}
              {isSuperAdmin && (
                <div>
                  <button
                    type="button"
                    onClick={() => {
                      if (compact) {
                        setTeamTab('directory');
                        navigateToAdminTab('team');
                      } else {
                        toggleGroup('team');
                      }
                    }}
                    title="Team Management"
                    className={`w-full flex items-center justify-between gap-2 px-2.5 py-2 rounded-lg text-[13px] transition-colors cursor-pointer whitespace-nowrap ${
                      effectiveView === 'admin' && adminTab === 'team'
                        ? 'bg-[#2B3240] text-white font-medium'
                        : 'text-[#B6C2CF] hover:bg-[#252B36] hover:text-white'
                    } ${compact ? 'justify-center' : ''}`}
                  >
                    <span className="flex items-center gap-2.5 min-w-0">
                      <Users
                        className={`w-4 h-4 shrink-0 ${
                          effectiveView === 'admin' && adminTab === 'team'
                            ? 'text-[#17C964]'
                            : 'text-[#8C9BAB]'
                        }`}
                      />
                      {!compact && (
                        <span className="truncate">Team Management</span>
                      )}
                    </span>
                    {!compact &&
                      (openGroups.team ? (
                        <ChevronDown className="w-3.5 h-3.5 text-[#8C9BAB] shrink-0" />
                      ) : (
                        <ChevronRight className="w-3.5 h-3.5 text-[#8C9BAB] shrink-0" />
                      ))}
                  </button>

                  {!compact && openGroups.team && (
                    <div className="mt-1 ml-3 pl-3 border-l border-[#2E3542] space-y-0.5">
                      <button
                        type="button"
                        onClick={() => {
                          setTeamTab('directory');
                          navigateToAdminTab('team');
                        }}
                        className={subNavBtnClass(
                          effectiveView === 'admin' &&
                            adminTab === 'team' &&
                            teamTab === 'directory'
                        )}
                      >
                        Team Directory
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setTeamTab('departments');
                          navigateToAdminTab('team');
                        }}
                        className={subNavBtnClass(
                          effectiveView === 'admin' &&
                            adminTab === 'team' &&
                            teamTab === 'departments'
                        )}
                      >
                        Department Management
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setTeamTab('targets');
                          navigateToAdminTab('team');
                        }}
                        className={subNavBtnClass(
                          effectiveView === 'admin' &&
                            adminTab === 'team' &&
                            teamTab === 'targets'
                        )}
                      >
                        Team Targets
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setTeamTab('users');
                          navigateToAdminTab('team');
                        }}
                        className={subNavBtnClass(
                          effectiveView === 'admin' &&
                            adminTab === 'team' &&
                            teamTab === 'users'
                        )}
                      >
                        Users
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* 8. Integrations & API (Super Admin Only) */}
              {isSuperAdmin && (
                <button
                  type="button"
                  onClick={() => navigateToAdminTab('integrations')}
                  title="Integrations & API"
                  className={navBtnClass(
                    effectiveView === 'admin' && adminTab === 'integrations',
                    compact
                  )}
                >
                  <Webhook
                    className={`w-4 h-4 shrink-0 ${
                      effectiveView === 'admin' && adminTab === 'integrations'
                        ? 'text-[#17C964]'
                        : 'text-[#8C9BAB]'
                    }`}
                  />
                  {!compact && (
                    <span className="truncate">Integrations &amp; API</span>
                  )}
                </button>
              )}

              {/* 9. Logs */}
              <div>
                <button
                  type="button"
                  onClick={() => {
                    if (compact) {
                      setLogsTab('access');
                      navigateToAdminTab('logs');
                    } else {
                      toggleGroup('logs');
                    }
                  }}
                  title="Logs"
                  className={`w-full flex items-center justify-between gap-2 px-2.5 py-2 rounded-lg text-[13px] transition-colors cursor-pointer whitespace-nowrap ${
                    effectiveView === 'admin' && adminTab === 'logs'
                      ? 'bg-[#2B3240] text-white font-medium'
                      : 'text-[#B6C2CF] hover:bg-[#252B36] hover:text-white'
                  } ${compact ? 'justify-center' : ''}`}
                >
                  <span className="flex items-center gap-2.5 min-w-0">
                    <ScrollText
                      className={`w-4 h-4 shrink-0 ${
                        effectiveView === 'admin' && adminTab === 'logs'
                          ? 'text-[#17C964]'
                          : 'text-[#8C9BAB]'
                      }`}
                    />
                    {!compact && <span className="truncate">Logs</span>}
                  </span>
                  {!compact &&
                    (openGroups.logs ? (
                      <ChevronDown className="w-3.5 h-3.5 text-[#8C9BAB] shrink-0" />
                    ) : (
                      <ChevronRight className="w-3.5 h-3.5 text-[#8C9BAB] shrink-0" />
                    ))}
                </button>

                {!compact && openGroups.logs && (
                  <div className="mt-1 ml-3 pl-3 border-l border-[#2E3542] space-y-0.5">
                    <button
                      type="button"
                      onClick={() => {
                        setLogsTab('access');
                        navigateToAdminTab('logs');
                      }}
                      className={subNavBtnClass(
                        effectiveView === 'admin' &&
                          adminTab === 'logs' &&
                          logsTab === 'access'
                      )}
                    >
                      Lead Access Logs
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setLogsTab('imports');
                        navigateToAdminTab('logs');
                      }}
                      className={subNavBtnClass(
                        effectiveView === 'admin' &&
                          adminTab === 'logs' &&
                          logsTab === 'imports'
                      )}
                    >
                      Excel Import History
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setLogsTab('pricing');
                        navigateToAdminTab('logs');
                      }}
                      className={subNavBtnClass(
                        effectiveView === 'admin' &&
                          adminTab === 'logs' &&
                          logsTab === 'pricing'
                      )}
                    >
                      Plan &amp; Pricing Logs
                    </button>
                  </div>
                )}
              </div>

              {/* 10. Profile */}
              <div>
                <button
                  type="button"
                  onClick={() => {
                    if (compact) {
                      setProfileTab('avatar');
                      navigateToAdminTab('profile');
                    } else {
                      toggleGroup('profile');
                    }
                  }}
                  title="Profile"
                  className={`w-full flex items-center justify-between gap-2 px-2.5 py-2 rounded-lg text-[13px] transition-colors cursor-pointer whitespace-nowrap ${
                    effectiveView === 'admin' && adminTab === 'profile'
                      ? 'bg-[#2B3240] text-white font-medium'
                      : 'text-[#B6C2CF] hover:bg-[#252B36] hover:text-white'
                  } ${compact ? 'justify-center' : ''}`}
                >
                  <span className="flex items-center gap-2.5 min-w-0">
                    <UserCircle2
                      className={`w-4 h-4 shrink-0 ${
                        effectiveView === 'admin' && adminTab === 'profile'
                          ? 'text-[#17C964]'
                          : 'text-[#8C9BAB]'
                      }`}
                    />
                    {!compact && <span className="truncate">Profile</span>}
                  </span>
                  {!compact &&
                    (openGroups.profile ? (
                      <ChevronDown className="w-3.5 h-3.5 text-[#8C9BAB] shrink-0" />
                    ) : (
                      <ChevronRight className="w-3.5 h-3.5 text-[#8C9BAB] shrink-0" />
                    ))}
                </button>

                {!compact && openGroups.profile && (
                  <div className="mt-1 ml-3 pl-3 border-l border-[#2E3542] space-y-0.5">
                    <button
                      type="button"
                      onClick={() => {
                        setProfileTab('avatar');
                        navigateToAdminTab('profile');
                      }}
                      className={subNavBtnClass(
                        effectiveView === 'admin' &&
                          adminTab === 'profile' &&
                          profileTab === 'avatar'
                      )}
                    >
                      Profile Picture
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setProfileTab('security_code');
                        navigateToAdminTab('profile');
                      }}
                      className={subNavBtnClass(
                        effectiveView === 'admin' &&
                          adminTab === 'profile' &&
                          profileTab === 'security_code'
                      )}
                    >
                      Lead Security Code
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setProfileTab('password');
                        navigateToAdminTab('profile');
                      }}
                      className={subNavBtnClass(
                        effectiveView === 'admin' &&
                          adminTab === 'profile' &&
                          profileTab === 'password'
                      )}
                    >
                      Change Password
                    </button>
                  </div>
                )}
              </div>

              {/* 11. General Settings */}
              <button
                type="button"
                onClick={() => navigateToAdminTab('settings')}
                title="General Settings"
                className={navBtnClass(
                  effectiveView === 'admin' && adminTab === 'settings',
                  compact
                )}
              >
                <Settings
                  className={`w-4 h-4 shrink-0 ${
                    effectiveView === 'admin' && adminTab === 'settings'
                      ? 'text-[#17C964]'
                      : 'text-[#8C9BAB]'
                  }`}
                />
                {!compact && <span className="truncate">General Settings</span>}
              </button>
            </>
          ) : !user?.mustChangePassword ? (
            /* Public / Unauthenticated Catalog Navigation */
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
                className={navBtnClass(
                  effectiveView === 'portal' &&
                    selectedCategory === 'all' &&
                    !portalInspectPlan,
                  compact
                )}
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
                    onClick={() => toggleGroup('categories')}
                    className="w-full flex items-center justify-between gap-2 px-2.5 py-2 rounded-lg text-[13px] text-[#B6C2CF] hover:bg-[#252B36] hover:text-white transition-colors cursor-pointer whitespace-nowrap"
                  >
                    <span className="flex items-center gap-2.5 min-w-0">
                      <Layers className="w-4 h-4 shrink-0 text-[#8C9BAB]" />
                      <span className="truncate">Categories</span>
                    </span>
                    {openGroups.categories ? (
                      <ChevronDown className="w-3.5 h-3.5 text-[#8C9BAB] shrink-0" />
                    ) : (
                      <ChevronRight className="w-3.5 h-3.5 text-[#8C9BAB] shrink-0" />
                    )}
                  </button>

                  {openGroups.categories && (
                    <div className="mt-1 ml-3 pl-3 border-l border-[#2E3542] space-y-0.5">
                      {categories.map((cat) => (
                        <button
                          key={cat.id}
                          type="button"
                          onClick={() => navigateToPortal(cat.name)}
                          className={subNavBtnClass(
                            effectiveView === 'portal' &&
                              selectedCategory.toLowerCase() ===
                                cat.name.toLowerCase()
                          )}
                        >
                          {cat.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <button
                type="button"
                onClick={navigateToLeads}
                title="Lead Management"
                className={`w-full flex items-center justify-between gap-2 px-2.5 py-2 rounded-lg text-[13px] transition-colors cursor-pointer whitespace-nowrap text-[#B6C2CF] hover:bg-[#252B36] hover:text-white ${
                  compact ? 'justify-center' : ''
                }`}
              >
                <span className="flex items-center gap-2.5 min-w-0">
                  <PhoneCall className="w-4 h-4 shrink-0 text-[#8C9BAB]" />
                  {!compact && <span className="truncate">Lead Management</span>}
                </span>
                {!compact && (
                  <Lock className="w-3.5 h-3.5 text-[#64748B] shrink-0" />
                )}
              </button>

              <div className="pt-3 border-t border-[#2A303C]">
                <button
                  type="button"
                  onClick={() => {
                    setPostLoginView('admin');
                    setView('login');
                    setMobileSidebarOpen(false);
                  }}
                  title="Admin Login"
                  className={navBtnClass(effectiveView === 'login', compact)}
                >
                  <LogIn className="w-4 h-4 shrink-0 text-[#17C964]" />
                  {!compact && <span className="truncate">Admin Login</span>}
                </button>
              </div>
            </div>
          ) : null}
        </nav>

        {/* Bottom Collapse Toggle */}
        {!isMobile && (
          <button
            type="button"
            onClick={() => setSidebarCollapsed((c) => !c)}
            className="h-11 bg-[#14181F] border-t border-[#2A303C] flex items-center justify-center text-[#94A3B8] hover:text-white hover:bg-[#1D2129] transition-colors cursor-pointer shrink-0"
            aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {sidebarCollapsed ? (
              <ChevronRight className="w-4 h-4" />
            ) : (
              <ChevronLeft className="w-4 h-4" />
            )}
          </button>
        )}
      </div>
    );
  };

  return (
    <div className="min-h-screen flex bg-[#F2F4F7] text-[#0F172A] overflow-x-clip">
      {/* Desktop Persistent Sidebar */}
      <aside
        className={`hidden lg:block shrink-0 self-start border-r border-[#2A303C] transition-[width] duration-200 sticky top-0 h-screen overflow-hidden ${
          sidebarCollapsed ? 'w-[72px]' : 'w-60 xl:w-64'
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
        {/* Crisp White Top Header */}
        <header className="h-16 bg-white border-b border-[#E2E8F0] sticky top-0 z-30 px-4 sm:px-6 lg:px-8 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileSidebarOpen(true)}
              className="lg:hidden p-2 -ml-2 text-[#475569] hover:text-[#0F172A] hover:bg-[#F8FAFC] rounded-lg cursor-pointer shrink-0"
              aria-label="Open navigation menu"
            >
              <Menu className="w-5 h-5" />
            </button>

            <div className="flex items-baseline gap-3 min-w-0">
              <h1 className="text-base sm:text-[17px] font-semibold text-[#0F172A] whitespace-nowrap">
                {pageMeta.title}
              </h1>
              <nav
                aria-label="Breadcrumb"
                className="hidden xl:flex items-center gap-1.5 text-xs text-[#64748B] whitespace-nowrap"
              >
                {pageMeta.crumbs.map((crumb, idx) => (
                  <span
                    key={`${crumb}-${idx}`}
                    className="inline-flex items-center gap-1.5"
                  >
                    {idx > 0 && <span aria-hidden="true">/</span>}
                    {idx === 0 ? (
                      <button
                        type="button"
                        onClick={() =>
                          isAdmin
                            ? navigateToAdminTab('dashboard')
                            : navigateToPortal('all')
                        }
                        className="hover:text-[#059669] cursor-pointer"
                      >
                        {crumb}
                      </button>
                    ) : (
                      <span
                        className={
                          idx === pageMeta.crumbs.length - 1
                            ? 'text-[#334155] font-medium truncate max-w-[200px]'
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

          <div className="flex items-center gap-2.5 sm:gap-3 shrink-0">
            {user ? (
              <>
                <button
                  type="button"
                  onClick={() => {
                    setProfileTab('avatar');
                    navigateToAdminTab('profile');
                  }}
                  title="Open Profile"
                  className="hidden md:flex items-center gap-2 pr-2.5 border-r border-[#E2E8F0] text-xs text-[#64748B] hover:text-[#0F172A] whitespace-nowrap cursor-pointer"
                >
                  <UserAvatar
                    avatarUrl={user.avatarUrl}
                    name={user.displayName || user.username}
                    size="xs"
                  />
                  <span className="font-medium text-[#0F172A] max-w-[140px] truncate">
                    {user.displayName || user.username}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>{roleLabel}</span>
                </button>

                {isAdmin && !user.mustChangePassword && (
                  <LeadReminderCenter
                    onOpenLead={handleOpenLeadFromReminder}
                    onToast={addToast}
                  />
                )}

                <button
                  type="button"
                  onClick={async () => {
                    await logout();
                    setView('portal');
                    addToast('success', 'Signed out of HostGraber Portal.');
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
                onClick={() => {
                  setPostLoginView('admin');
                  setView('login');
                }}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-[#04120A] bg-[#17C964] hover:bg-[#10B981] rounded-lg transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                <LogIn className="w-3.5 h-3.5" />
                <span>Admin Login</span>
              </button>
            )}
          </div>
        </header>

        {/* Main Scrollable Canvas */}
        <main className="flex-1 min-w-0 p-4 sm:p-6">
          {effectiveView === 'change_password' && user ? (
            <ChangePasswordView
              forced={Boolean(user.mustChangePassword)}
              onSuccess={() => setView(postLoginView)}
              onCancel={
                user.mustChangePassword ? undefined : () => setView('admin')
              }
              onToast={addToast}
            />
          ) : effectiveView === 'login' ? (
            <LoginView onCancel={() => setView('portal')} />
          ) : effectiveView === 'leads' && user && isAdmin ? (
            <LeadManageView
              settings={settings}
              openLeadId={pendingOpenLeadId}
              onOpenedLeadHandled={() => setPendingOpenLeadId(null)}
              onToast={addToast}
            />
          ) : effectiveView === 'admin' && user && isAdmin ? (
            <AdminPanel
              user={user}
              settings={settings}
              categories={categories}
              activeTab={adminTab}
              kbCategory={kbCategory}
              commCategory={commCategory}
              reportsTab={reportsTab}
              teamTab={teamTab}
              logsTab={logsTab}
              profileTab={profileTab}
              inspectPlan={adminInspectPlan}
              onInspectPlanChange={setAdminInspectPlan}
              onChangeTab={navigateToAdminTab}
              onNavigateLeads={navigateToLeads}
              onOpenLead={handleOpenLeadFromReminder}
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
