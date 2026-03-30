import { useAuth } from '@/contexts/AuthContext';
import { Link, useLocation } from 'wouter';
import { cn } from '@/lib/utils';
import {
  Building2, LayoutDashboard, Briefcase, GitBranch, ClipboardCheck,
  Bell, LogOut, ChevronLeft, ChevronRight, FileText, BarChart3, Menu, PieChart, Share2, Users, Settings
} from 'lucide-react';
import { useState, useEffect, useCallback } from 'react';
import { APP_VERSION } from '@shared/version';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/lib/supabase';

interface NavItem {
  label: string;
  href: string;
  icon: React.ElementType;
  adminOnly?: boolean;
  badge?: number;
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, isAdmin, signOut } = useAuth();
  const [location] = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [hasSubOrgs, setHasSubOrgs] = useState(false);

  // Stabilize dependency: use primitive values instead of user object
  const userId = user?.id;
  const userOrgId = user?.org_id;

  const fetchUnread = useCallback(async () => {
    if (!userId) return;
    try {
      const { count } = await supabase
        .from('notifications')
        .select('*', { count: 'exact', head: true })
        .eq('recipient_user_id', userId)
        .eq('is_read', false);
      setUnreadCount(count || 0);
    } catch (e) {
      console.error('Notification count fetch error:', e);
    }
  }, [userId]);

  // Check if current user has any descendant organizations (works for all roles)
  useEffect(() => {
    if (!userOrgId) return;
    const checkSubOrgs = async () => {
      try {
        // Check for direct child organizations (parent_org_id = current org)
        const { count } = await supabase
          .from('organizations')
          .select('*', { count: 'exact', head: true })
          .eq('parent_org_id', userOrgId)
          .eq('status', 'active');
        setHasSubOrgs((count || 0) > 0);
      } catch (e) {
        console.error('checkSubOrgs error:', e);
      }
    };
    checkSubOrgs();
  }, [userOrgId]);

  useEffect(() => {
    fetchUnread();
    const interval = setInterval(fetchUnread, 30000);
    return () => clearInterval(interval);
  }, [fetchUnread]);

  const adminNav: NavItem[] = [
    { label: 'ダッシュボード', href: '/', icon: LayoutDashboard },
    { label: '企業管理', href: '/organizations', icon: Building2, adminOnly: true },
    { label: '案件管理', href: '/projects', icon: Briefcase, adminOnly: true },
    { label: '割り当て管理', href: '/allocations', icon: GitBranch, adminOnly: true },
    { label: 'アポ一覧', href: '/approvals', icon: ClipboardCheck, adminOnly: true },
    { label: '代理店別集計', href: '/agency-stats', icon: PieChart, adminOnly: true },
    { label: 'SNSアカウント', href: '/sns-accounts', icon: Share2, adminOnly: true },
    { label: '二次代理店卸単価', href: '/sub-allocation-prices', icon: Users, adminOnly: true },
    { label: '通知', href: '/notifications', icon: Bell, badge: unreadCount },
    { label: '監査ログ', href: '/audit-logs', icon: FileText, adminOnly: true },
    ...(hasSubOrgs ? [{ label: '代理店管理', href: '/sub-partners', icon: Users }] : []),
    { label: '設定', href: '/settings', icon: Settings },
  ];

  const partnerNav: NavItem[] = [
    { label: 'ダッシュボード', href: '/', icon: BarChart3 },
    { label: '割り当て案件', href: '/my-allocations', icon: Briefcase },
    { label: 'アポ登録', href: '/appointments/new', icon: ClipboardCheck },
    { label: 'アポ一覧', href: '/appointments', icon: FileText },
    ...(hasSubOrgs ? [
      { label: '代理店管理', href: '/sub-partners', icon: Users },
      { label: '代理店別集計', href: '/partner-agency-stats', icon: PieChart },
    ] : []),
    { label: 'SNSアカウント', href: '/sns-accounts', icon: Share2 },
    { label: '設定', href: '/settings', icon: Settings },
    { label: '通知', href: '/notifications', icon: Bell, badge: unreadCount },
  ];

  const navItems = isAdmin ? adminNav : partnerNav;

  const SidebarContent = () => (
    <>
      {/* Logo + Version */}
      <div className="flex items-center gap-3 px-4 py-5 border-b border-sidebar-border">
        <div className="w-8 h-8 rounded-md bg-sidebar-primary flex items-center justify-center shrink-0">
          <Building2 className="w-5 h-5 text-sidebar-primary-foreground" />
        </div>
        {!collapsed && (
          <div className="flex flex-col">
            <span className="text-base font-semibold text-sidebar-foreground tracking-tight">Crafia</span>
            <span className="text-[10px] text-sidebar-foreground/40 font-mono leading-none">v{APP_VERSION}</span>
          </div>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 py-3 px-2 space-y-0.5 overflow-y-auto">
        {navItems.map((item) => {
          const isActive = location === item.href || (item.href !== '/' && location.startsWith(item.href));
          return (
            <Link key={item.href} href={item.href}>
              <div
                onClick={() => setMobileOpen(false)}
                className={cn(
                  'flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                    : 'text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/50'
                )}
              >
                <item.icon className="w-4.5 h-4.5 shrink-0" />
                {!collapsed && (
                  <span className="flex-1">{item.label}</span>
                )}
                {!collapsed && item.badge !== undefined && item.badge > 0 && (
                  <Badge variant="destructive" className="h-5 min-w-5 text-xs px-1.5">
                    {item.badge}
                  </Badge>
                )}
              </div>
            </Link>
          );
        })}
      </nav>

      {/* User info + logout */}
      <div className="border-t border-sidebar-border px-3 py-3">
        {!collapsed && user && (
          <div className="mb-2 px-1">
            <p className="text-xs font-medium text-sidebar-foreground truncate">{user.full_name || user.login_id || user.email}</p>
          </div>
        )}
        <Button
          variant="ghost"
          size="sm"
          onClick={signOut}
          className="w-full justify-start text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/50"
        >
          <LogOut className="w-4 h-4 mr-2" />
          {!collapsed && 'ログアウト'}
        </Button>
      </div>
    </>
  );

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-40 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar - mobile */}
      <aside className={cn(
        'fixed inset-y-0 left-0 z-50 w-64 bg-sidebar flex flex-col transition-transform lg:hidden',
        mobileOpen ? 'translate-x-0' : '-translate-x-full'
      )}>
        <SidebarContent />
      </aside>

      {/* Sidebar - desktop */}
      <aside className={cn(
        'hidden lg:flex flex-col bg-sidebar border-r border-sidebar-border transition-all duration-200 shrink-0',
        collapsed ? 'w-16' : 'w-60'
      )}>
        <SidebarContent />
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="absolute -right-3 top-8 w-6 h-6 rounded-full bg-background border border-border flex items-center justify-center shadow-sm hover:bg-accent transition-colors"
        >
          {collapsed ? <ChevronRight className="w-3 h-3" /> : <ChevronLeft className="w-3 h-3" />}
        </button>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Mobile header */}
        <header className="lg:hidden flex items-center gap-3 px-4 py-3 border-b border-border bg-card">
          <Button variant="ghost" size="icon" onClick={() => setMobileOpen(true)}>
            <Menu className="w-5 h-5" />
          </Button>
          <span className="font-semibold text-sm">Crafia</span>
        </header>

        <main className="flex-1 overflow-y-auto p-4 lg:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
