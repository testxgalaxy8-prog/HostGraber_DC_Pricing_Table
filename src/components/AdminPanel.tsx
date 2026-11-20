import { useState } from 'react';
import type {
  CategoryItem,
  HostingPlanFull,
  PortalSettings,
  PortalUser,
} from '../shared/types.ts';
import { AdminDashboard } from './admin/AdminDashboard.tsx';
import { ExcelUploadView } from './admin/ExcelUploadView.tsx';
import { ManagePlansView } from './admin/ManagePlansView.tsx';
import { PricingHistoryView } from './admin/PricingHistoryView.tsx';
import { UserManagementView } from './admin/UserManagementView.tsx';
import { LogoManagementView } from './admin/LogoManagementView.tsx';
import { SettingsView } from './admin/SettingsView.tsx';
import { PlanDetailsView } from './PlanDetailsView.tsx';

export type AdminTab =
  | 'dashboard'
  | 'upload'
  | 'plans'
  | 'history'
  | 'users'
  | 'logo'
  | 'settings';

export function AdminPanel({
  user,
  settings,
  categories,
  activeTab,
  inspectPlan,
  onInspectPlanChange,
  onChangeTab,
  onRefreshContext,
  onToast,
}: {
  user: PortalUser;
  settings: PortalSettings;
  categories: CategoryItem[];
  activeTab: AdminTab;
  inspectPlan: HostingPlanFull | null;
  onInspectPlanChange: (plan: HostingPlanFull | null) => void;
  onChangeTab: (tab: AdminTab) => void;
  onRefreshContext: () => Promise<void>;
  onToast: (type: 'success' | 'error', text: string) => void;
}) {
  const [editPlan, setEditPlan] = useState<HostingPlanFull | null>(null);

  if (inspectPlan) {
    return (
      <PlanDetailsView
        plan={inspectPlan}
        settings={settings}
        canEdit={true}
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

  return (
    <div className="max-w-7xl mx-auto">
      {activeTab === 'dashboard' && (
        <AdminDashboard
          user={user}
          settings={settings}
          categoriesCount={categories.length}
          onNavigate={onChangeTab}
          onViewPlan={(p) => onInspectPlanChange(p)}
          onEditPlan={(p) => {
            setEditPlan(p);
            onChangeTab('plans');
          }}
        />
      )}

      {activeTab === 'upload' && (
        <ExcelUploadView
          settings={settings}
          categories={categories}
          onImportCompleted={onRefreshContext}
          onToast={onToast}
        />
      )}

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

      {activeTab === 'users' && (
        <UserManagementView currentUser={user} onToast={onToast} />
      )}

      {activeTab === 'logo' && (
        <LogoManagementView
          settings={settings}
          onSaved={onRefreshContext}
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
