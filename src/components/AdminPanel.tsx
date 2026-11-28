import { useState } from 'react';
import type {
  CategoryItem,
  CommunicationCategory,
  HostingPlanFull,
  KnowledgebaseCategory,
  PortalSettings,
  PortalUser,
} from '../shared/types.ts';
import { AdminDashboard, type DashboardTargetTab } from './admin/AdminDashboard.tsx';
import { ExcelUploadView } from './admin/ExcelUploadView.tsx';
import { ManagePlansView } from './admin/ManagePlansView.tsx';
import { PricingHistoryView } from './admin/PricingHistoryView.tsx';
import { SettingsView } from './admin/SettingsView.tsx';
import { PlanDetailsView } from './PlanDetailsView.tsx';
import { KnowledgebaseView } from './portal/KnowledgebaseView.tsx';
import { CommunicationCenterView } from './portal/CommunicationCenterView.tsx';
import {
  ReportsAnalyticsView,
  type ReportsSubTab,
} from './portal/ReportsAnalyticsView.tsx';
import {
  TeamManagementView,
  type TeamManagementSubTab,
} from './portal/TeamManagementView.tsx';
import { IntegrationsApiView } from './portal/IntegrationsApiView.tsx';
import {
  LogsCenterView,
  type LogsCenterTab,
} from './portal/LogsCenterView.tsx';
import { ProfileView, type ProfileSubTab } from './portal/ProfileView.tsx';

export type AdminTab =
  | 'dashboard'
  | 'upload'
  | 'plans'
  | 'history'
  | 'knowledgebase'
  | 'communication'
  | 'reports'
  | 'team'
  | 'integrations'
  | 'logs'
  | 'profile'
  | 'settings';

export function AdminPanel({
  user,
  settings,
  categories,
  activeTab,
  kbCategory = 'all',
  commCategory = 'all',
  reportsTab = 'sales',
  teamTab = 'directory',
  logsTab = 'access',
  profileTab = 'avatar',
  inspectPlan,
  onInspectPlanChange,
  onChangeTab,
  onNavigateLeads,
  onOpenLead,
  onRefreshContext,
  onToast,
}: {
  user: PortalUser;
  settings: PortalSettings;
  categories: CategoryItem[];
  activeTab: AdminTab;
  kbCategory?: KnowledgebaseCategory | 'all';
  commCategory?: CommunicationCategory | 'all';
  reportsTab?: ReportsSubTab;
  teamTab?: TeamManagementSubTab;
  logsTab?: LogsCenterTab;
  profileTab?: ProfileSubTab;
  inspectPlan: HostingPlanFull | null;
  onInspectPlanChange: (plan: HostingPlanFull | null) => void;
  onChangeTab: (tab: AdminTab) => void;
  onNavigateLeads: () => void;
  onOpenLead: (leadId: number) => void;
  onRefreshContext: () => Promise<void>;
  onToast: (type: 'success' | 'error', text: string) => void;
}) {
  const [editPlan, setEditPlan] = useState<HostingPlanFull | null>(null);

  if (inspectPlan) {
    return (
      <PlanDetailsView
        plan={inspectPlan}
        settings={settings}
        canEdit={user.role === 'super_admin'}
        onBack={() => onInspectPlanChange(null)}
        onEdit={(p) => {
          onInspectPlanChange(null);
          setEditPlan(p);
          onChangeTab('plans');
        }}
        onToast={onToast}
      />
    );
  }

  const handleDashboardNavigate = (target: DashboardTargetTab) => {
    if (target === 'leads') {
      onNavigateLeads();
      return;
    }
    onChangeTab(target);
  };

  return (
    <div className="max-w-7xl mx-auto">
      {activeTab === 'dashboard' && (
        <AdminDashboard
          user={user}
          settings={settings}
          onNavigate={handleDashboardNavigate}
          onOpenLead={onOpenLead}
          onViewPlan={(p) => onInspectPlanChange(p)}
          onEditPlan={(p) => {
            setEditPlan(p);
            onChangeTab('plans');
          }}
        />
      )}

      {activeTab === 'upload' &&
        (user.role === 'super_admin' ? (
          <ExcelUploadView
            settings={settings}
            categories={categories}
            onImportCompleted={onRefreshContext}
            onToast={onToast}
          />
        ) : (
          <div className="bg-white border border-[#E2E8F0] rounded-xl p-8 text-center text-sm text-[#64748B]">
            Excel Catalog Import is restricted to Super Admin accounts.
          </div>
        ))}

      {activeTab === 'plans' && (
        <ManagePlansView
          settings={settings}
          categories={categories}
          userRole={user.role}
          initialEditPlan={editPlan}
          onClearInitialEdit={() => setEditPlan(null)}
          onViewPlan={(p) => onInspectPlanChange(p)}
          onCategoriesChanged={onRefreshContext}
          onToast={onToast}
        />
      )}

      {activeTab === 'history' && (
        <PricingHistoryView settings={settings} onToast={onToast} />
      )}

      {activeTab === 'knowledgebase' && (
        <KnowledgebaseView
          initialCategory={kbCategory}
          userRole={user.role}
          onToast={onToast}
        />
      )}

      {activeTab === 'communication' && (
        <CommunicationCenterView
          initialCategory={commCategory}
          userRole={user.role}
          onToast={onToast}
        />
      )}

      {activeTab === 'reports' && (
        <ReportsAnalyticsView
          initialTab={reportsTab}
          settings={settings}
          onToast={onToast}
        />
      )}

      {activeTab === 'team' &&
        (user.role === 'super_admin' ? (
          <TeamManagementView
            currentUser={user}
            settings={settings}
            initialTab={teamTab}
            onToast={onToast}
          />
        ) : (
          <div className="bg-white border border-[#E2E8F0] rounded-xl p-8 text-center text-sm text-[#64748B]">
            Team Management is restricted to Super Admin accounts.
          </div>
        ))}

      {activeTab === 'integrations' &&
        (user.role === 'super_admin' ? (
          <IntegrationsApiView onToast={onToast} />
        ) : (
          <div className="bg-white border border-[#E2E8F0] rounded-xl p-8 text-center text-sm text-[#64748B]">
            Integrations &amp; API is restricted to Super Admin accounts.
          </div>
        ))}

      {activeTab === 'logs' && (
        <LogsCenterView
          settings={settings}
          initialTab={logsTab}
          onToast={onToast}
        />
      )}

      {activeTab === 'profile' && (
        <ProfileView
          user={user}
          settings={settings}
          initialTab={profileTab}
          onRefreshSession={onRefreshContext}
          onToast={onToast}
        />
      )}

      {activeTab === 'settings' && (
        <SettingsView
          settings={settings}
          userRole={user.role}
          onSaved={onRefreshContext}
          onToast={onToast}
        />
      )}
    </div>
  );
}
