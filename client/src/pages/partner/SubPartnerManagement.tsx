import { useState, useCallback, useEffect } from 'react';
import { supabase, type Organization, type Appointment, type SubPartnerPayment, type Allocation, type SubAllocationPrice } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { PageHeader } from '@/components/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import {
  Building2, Users, ClipboardCheck, TrendingUp, Clock, CheckCircle2,
  XCircle, DollarSign, Plus, Edit, Eye, EyeOff, Save, Pencil, ChevronRight, Download, ChevronLeft
} from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from 'sonner';
import { format, addMonths, subMonths, isSameMonth } from 'date-fns';
import { ja } from 'date-fns/locale';

// Helper: build a tree of descendant orgs from a flat list
function getDescendantOrgs(allOrgs: Organization[], rootOrgId: string): Organization[] {
  const descendants: Organization[] = [];
  const queue = [rootOrgId];
  while (queue.length > 0) {
    const parentId = queue.shift()!;
    const children = allOrgs.filter(o => o.parent_org_id === parentId && o.id !== rootOrgId);
    for (const child of children) {
      if (!descendants.some(d => d.id === child.id)) {
        descendants.push(child);
        queue.push(child.id);
      }
    }
  }
  return descendants;
}

// Helper: compute depth of an org relative to root
function getOrgDepth(org: Organization, allOrgs: Organization[], rootOrgId: string): number {
  let depth = 0;
  let current = org;
  while (current.parent_org_id && current.parent_org_id !== rootOrgId) {
    depth++;
    const parent = allOrgs.find(o => o.id === current.parent_org_id);
    if (!parent) break;
    current = parent;
  }
  return depth;
}

// Helper: sort orgs in tree order (parent before children, siblings alphabetically)
function sortOrgsTreeOrder(orgs: Organization[], rootOrgId: string): Organization[] {
  const result: Organization[] = [];
  const addChildren = (parentId: string) => {
    const children = orgs
      .filter(o => o.parent_org_id === parentId)
      .sort((a, b) => a.name.localeCompare(b.name));
    for (const child of children) {
      result.push(child);
      addChildren(child.id);
    }
  };
  addChildren(rootOrgId);
  return result;
}

export default function SubPartnerManagement() {
  const { user, isAdmin } = useAuth();
  const userOrgId = user?.org_id;
  const [allOrgs, setAllOrgs] = useState<Organization[]>([]);
  const [subOrgs, setSubOrgs] = useState<Organization[]>([]);
  const [subUsers, setSubUsers] = useState<Record<string, { login_id: string; full_name: string | null; plain_password: string | null }[]>>({});
  const [subAppointments, setSubAppointments] = useState<Appointment[]>([]);
  const [payments, setPayments] = useState<SubPartnerPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');
  const [selectedMonth, setSelectedMonth] = useState(() => new Date());

  // Payment dialog
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [editingPayment, setEditingPayment] = useState<SubPartnerPayment | null>(null);
  const [paymentForm, setPaymentForm] = useState({
    sub_org_id: '',
    period: format(new Date(), 'yyyy-MM'),
    unit_price: 0,
    paid_amount: 0,
    status: 'unpaid' as 'unpaid' | 'paid' | 'partial',
    notes: '',
  });

  // PW visibility
  const [visiblePw, setVisiblePw] = useState<Record<string, boolean>>({});

  // Sub allocation prices
  const [parentAllocations, setParentAllocations] = useState<Allocation[]>([]);
  const [subPrices, setSubPrices] = useState<SubAllocationPrice[]>([]);
  const [priceDialogOpen, setPriceDialogOpen] = useState(false);
  const [editingPriceOrg, setEditingPriceOrg] = useState<Organization | null>(null);
  const [editingPriceEntries, setEditingPriceEntries] = useState<Array<{
    allocationId: string;
    projectTitle: string;
    projectNumber: string;
    parentPayout: number | null;
    subPrice: number | null;
    subPriceId: string | null;
  }>>([]);
  const [savingPrices, setSavingPrices] = useState(false);

  const fetchData = useCallback(async () => {
    if (!userOrgId) return;
    setLoading(true);
    try {
      // Get ALL organizations visible via RLS (includes descendants + ancestors)
      const { data: orgsData } = await supabase
        .from('organizations')
        .select('*')
        .eq('status', 'active');
      const allOrgList = orgsData || [];
      setAllOrgs(allOrgList);

      // Build descendant list (excludes self and ancestors)
      const descendants = getDescendantOrgs(allOrgList, userOrgId);
      const sortedDescendants = sortOrgsTreeOrder(descendants, userOrgId);
      setSubOrgs(sortedDescendants);

      if (sortedDescendants.length === 0) {
        setLoading(false);
        return;
      }

      const subOrgIds = sortedDescendants.map(o => o.id);

      // Get users for each descendant org
      const { data: usersData } = await supabase
        .from('users')
        .select('org_id, login_id, full_name, plain_password')
        .in('org_id', subOrgIds)
        .eq('status', 'active');

      const usersByOrg: Record<string, { login_id: string; full_name: string | null; plain_password: string | null }[]> = {};
      (usersData || []).forEach((u: any) => {
        if (!usersByOrg[u.org_id]) usersByOrg[u.org_id] = [];
        usersByOrg[u.org_id].push({ login_id: u.login_id, full_name: u.full_name, plain_password: u.plain_password });
      });
      setSubUsers(usersByOrg);

      // Get appointments from ALL descendant orgs
      const { data: appts } = await supabase
        .from('appointments')
        .select('*, project:projects(title, project_number)')
        .in('org_id', subOrgIds)
        .order('created_at', { ascending: false });
      setSubAppointments(appts || []);

      // Get payments (direct children only for payment management)
      const { data: payData } = await supabase
        .from('sub_partner_payments')
        .select('*, sub_org:organizations!sub_partner_payments_sub_org_id_fkey(name)')
        .eq('parent_org_id', userOrgId)
        .order('period', { ascending: false });
      setPayments(payData || []);

      // Get ALL allocations visible to this org (direct + inherited from ancestors)
      // 1. Direct allocations
      const { data: directAllocData } = await supabase
        .from('allocations')
        .select('*, project:projects(title, project_number, status)')
        .eq('child_org_id', userOrgId);
      const directAllocs = directAllocData || [];

      // 2. Inherited allocations from ancestor chain
      const myOrg = allOrgList.find(o => o.id === userOrgId);
      let allVisibleAllocs: (Allocation & { _effectivePayout?: number | null })[] = [...directAllocs];
      const collectedProjectIds = new Set(directAllocs.map(a => a.project_id));

      if (myOrg?.parent_org_id) {
        // Build ancestor chain (up to Crafia HQ)
        const ancestorOrgIds: string[] = [];
        let currentParentId: string | null = myOrg.parent_org_id;
        const maxDepth = 10;
        let depthCounter = 0;
        while (currentParentId && depthCounter < maxDepth) {
          const ancestorOrg = allOrgList.find(o => o.id === currentParentId);
          if (!ancestorOrg) break;
          // Skip Crafia HQ (parent_org_id is null)
          if (ancestorOrg.parent_org_id) {
            ancestorOrgIds.push(ancestorOrg.id);
          }
          currentParentId = ancestorOrg.parent_org_id;
          depthCounter++;
        }

        // Fetch ancestor allocations and inherit (closest first)
        for (const ancestorId of ancestorOrgIds) {
          const { data: ancestorAllocData } = await supabase
            .from('allocations')
            .select('*, project:projects(title, project_number, status)')
            .eq('child_org_id', ancestorId);

          const newAllocations = (ancestorAllocData || []).filter(
            a => !collectedProjectIds.has(a.project_id)
          );

          if (newAllocations.length > 0) {
            // Get my org's sub_allocation_prices for these allocations
            const allocIds = newAllocations.map(a => a.id);
            const { data: myPriceData } = await supabase
              .from('sub_allocation_prices')
              .select('*')
              .in('allocation_id', allocIds)
              .eq('sub_org_id', userOrgId);

            const myPriceMap = new Map<string, number>();
            (myPriceData || []).forEach((p: SubAllocationPrice) => {
              myPriceMap.set(p.allocation_id, Number(p.payout_per_appointment));
            });

            const inherited = newAllocations.map(a => ({
              ...a,
              _effectivePayout: myPriceMap.has(a.id) ? myPriceMap.get(a.id)! : null,
            }));
            allVisibleAllocs = [...allVisibleAllocs, ...inherited];
            newAllocations.forEach(a => collectedProjectIds.add(a.project_id));
          }
        }
      }

      setParentAllocations(allVisibleAllocs);

      // Get sub allocation prices for descendant orgs
      const { data: priceData } = await supabase
        .from('sub_allocation_prices')
        .select('*')
        .in('sub_org_id', subOrgIds);
      setSubPrices(priceData || []);

    } catch (e) {
      console.error('SubPartnerManagement fetch error:', e);
    } finally {
      setLoading(false);
    }
  }, [userOrgId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Month-filtered appointments (by meeting_datetime)
  const monthFilteredAppts = subAppointments.filter(a => {
    if (!a.meeting_datetime) return false;
    return isSameMonth(new Date(a.meeting_datetime), selectedMonth);
  });

  // CSV download for appointments tab
  const handleApptCsvDownload = () => {
    const appts = monthFilteredAppts;
    if (appts.length === 0) return;
    const statusLabel = (s: string) => {
      switch (s) {
        case 'approved': return '承認済';
        case 'pending': return '保留中';
        case 'rejected': return '却下';
        case 'cancelled': return '取消';
        default: return s;
      }
    };
    const headers = ['登録企業', '案件番号', '案件名', '先方企業名', '先方担当者名', '獲得者名', '商談日時', 'ステータス', 'メモ', '登録日'];
    const rows = appts.map(a => {
      const org = subOrgs.find(o => o.id === a.org_id);
      const proj = (a as any).project;
      return [
        org?.name || '',
        proj?.project_number || '',
        proj?.title || '',
        a.target_company_name,
        a.contact_person || '',
        a.acquirer_name || '',
        a.meeting_datetime ? format(new Date(a.meeting_datetime), 'yyyy/MM/dd HH:mm') : '',
        statusLabel(a.status),
        (a.notes || '').replace(/\n/g, ' '),
        format(new Date(a.created_at), 'yyyy/MM/dd'),
      ];
    });
    const csvContent = '\uFEFF' + [headers, ...rows].map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const el = document.createElement('a');
    el.href = url;
    el.download = `傘下代理店アポ一覧_${format(selectedMonth, 'yyyyMM')}.csv`;
    el.click();
    URL.revokeObjectURL(url);
    toast.success('CSVをダウンロードしました');
  };

  // CSV download for overview tab
  const handleOverviewCsvDownload = () => {
    if (subOrgs.length === 0) return;
    const headers = ['代理店名', '階層', '合計アポ', '承認済', '保留中', '却下'];
    const rows = subOrgs.map(org => {
      const stats = getSubOrgStats(org.id);
      return [
        org.name,
        getTierLabel(org),
        stats.total,
        stats.approved,
        stats.pending,
        stats.rejected,
      ];
    });
    const csvContent = '\uFEFF' + [headers, ...rows].map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const el = document.createElement('a');
    el.href = url;
    el.download = `代理店概要_${format(new Date(), 'yyyyMMdd')}.csv`;
    el.click();
    URL.revokeObjectURL(url);
    toast.success('CSVをダウンロードしました');
  };

  // Stats per sub org (including its own descendants)
  const getSubOrgStats = (orgId: string) => {
    // Get this org + its descendants
    const thisOrgDescendants = getDescendantOrgs(allOrgs, orgId);
    const relevantOrgIds = [orgId, ...thisOrgDescendants.map(o => o.id)];
    const appts = subAppointments.filter(a => relevantOrgIds.includes(a.org_id));
    return {
      total: appts.length,
      approved: appts.filter(a => a.status === 'approved').length,
      pending: appts.filter(a => a.status === 'pending').length,
      rejected: appts.filter(a => a.status === 'rejected').length,
    };
  };

  // Total stats
  const totalStats = {
    total: subAppointments.length,
    approved: subAppointments.filter(a => a.status === 'approved').length,
    pending: subAppointments.filter(a => a.status === 'pending').length,
    rejected: subAppointments.filter(a => a.status === 'rejected').length,
  };

  // Payment handlers
  const directChildren = subOrgs.filter(o => o.parent_org_id === userOrgId);

  const openNewPayment = () => {
    setEditingPayment(null);
    setPaymentForm({
      sub_org_id: directChildren[0]?.id || '',
      period: format(new Date(), 'yyyy-MM'),
      unit_price: 0,
      paid_amount: 0,
      status: 'unpaid',
      notes: '',
    });
    setPaymentDialogOpen(true);
  };

  const openEditPayment = (p: SubPartnerPayment) => {
    setEditingPayment(p);
    setPaymentForm({
      sub_org_id: p.sub_org_id,
      period: p.period,
      unit_price: p.unit_price,
      paid_amount: p.paid_amount,
      status: p.status,
      notes: p.notes || '',
    });
    setPaymentDialogOpen(true);
  };

  const handleSavePayment = async () => {
    if (!user || !paymentForm.sub_org_id) return;

    const periodAppts = subAppointments.filter(a => {
      const apptMonth = a.created_at?.substring(0, 7);
      return a.org_id === paymentForm.sub_org_id && apptMonth === paymentForm.period;
    });
    const appointmentCount = periodAppts.length;
    const approvedCount = periodAppts.filter(a => a.status === 'approved').length;
    const totalAmount = approvedCount * paymentForm.unit_price;

    const payload = {
      parent_org_id: user.org_id,
      sub_org_id: paymentForm.sub_org_id,
      period: paymentForm.period,
      appointment_count: appointmentCount,
      approved_count: approvedCount,
      unit_price: paymentForm.unit_price,
      total_amount: totalAmount,
      paid_amount: paymentForm.status === 'paid' ? totalAmount : paymentForm.paid_amount,
      status: paymentForm.status,
      notes: paymentForm.notes || null,
    };

    try {
      if (editingPayment) {
        const { error } = await supabase
          .from('sub_partner_payments')
          .update(payload)
          .eq('id', editingPayment.id);
        if (error) throw error;
        toast.success('支払い情報を更新しました');
      } else {
        const { error } = await supabase
          .from('sub_partner_payments')
          .insert(payload);
        if (error) throw error;
        toast.success('支払い情報を登録しました');
      }
      setPaymentDialogOpen(false);
      fetchData();
    } catch (e: any) {
      toast.error('保存に失敗しました: ' + (e.message || ''));
    }
  };

  // Price editing handlers
  const openPriceEdit = (childOrg: Organization) => {
    const activeAllocs = parentAllocations.filter(a => (a as any).project?.status !== 'closed');
    const entries = activeAllocs.map(a => {
      const proj = (a as any).project;
      const existing = subPrices.find(p => p.allocation_id === a.id && p.sub_org_id === childOrg.id);
      // For inherited allocations, use _effectivePayout (my org's price) as the parent payout
      // For direct allocations, use payout_per_appointment
      const isInherited = a.child_org_id !== userOrgId;
      const myPayout = isInherited
        ? (a as any)._effectivePayout ?? null
        : Number(a.payout_per_appointment);
      return {
        allocationId: a.id,
        projectTitle: proj?.title || '—',
        projectNumber: proj?.project_number || '',
        parentPayout: myPayout,
        subPrice: existing ? Number(existing.payout_per_appointment) : null,
        subPriceId: existing?.id || null,
      };
    });
    setEditingPriceOrg(childOrg);
    setEditingPriceEntries(entries);
    setPriceDialogOpen(true);
  };

  const handlePriceEntryChange = (index: number, value: string) => {
    setEditingPriceEntries(prev => {
      const next = [...prev];
      next[index] = { ...next[index], subPrice: value === '' ? null : Number(value) };
      return next;
    });
  };

  const handleSavePrices = async () => {
    if (!editingPriceOrg) return;
    setSavingPrices(true);
    try {
      for (const entry of editingPriceEntries) {
        if (entry.subPrice !== null) {
          if (entry.subPriceId) {
            await supabase.from('sub_allocation_prices').update({
              payout_per_appointment: entry.subPrice,
              updated_at: new Date().toISOString(),
            }).eq('id', entry.subPriceId);
          } else {
            await supabase.from('sub_allocation_prices').insert({
              allocation_id: entry.allocationId,
              sub_org_id: editingPriceOrg.id,
              payout_per_appointment: entry.subPrice,
            });
          }
        } else {
          if (entry.subPriceId) {
            await supabase.from('sub_allocation_prices').delete().eq('id', entry.subPriceId);
          }
        }
      }
      toast.success(`${editingPriceOrg.name}の卸単価を更新しました`);
      setPriceDialogOpen(false);
      fetchData();
    } catch (e: any) {
      toast.error('保存に失敗しました: ' + (e.message || ''));
    } finally {
      setSavingPrices(false);
    }
  };

  const getChildPriceCount = (childOrgId: string) => {
    const activeAllocs = parentAllocations.filter(a => (a as any).project?.status !== 'closed');
    const custom = subPrices.filter(p => p.sub_org_id === childOrgId && activeAllocs.some(a => a.id === p.allocation_id));
    return { total: activeAllocs.length, custom: custom.length };
  };

  const statusBadge = (status: string) => {
    switch (status) {
      case 'approved': return <Badge className="bg-emerald-100 text-emerald-700 border-0">承認済</Badge>;
      case 'pending': return <Badge className="bg-amber-100 text-amber-700 border-0">保留中</Badge>;
      case 'rejected': return <Badge className="bg-red-100 text-red-700 border-0">却下</Badge>;
      case 'cancelled': return <Badge className="bg-gray-100 text-gray-700 border-0">取消</Badge>;
      default: return <Badge variant="outline">{status}</Badge>;
    }
  };

  const paymentStatusBadge = (status: string) => {
    switch (status) {
      case 'paid': return <Badge className="bg-emerald-100 text-emerald-700 border-0">支払済</Badge>;
      case 'unpaid': return <Badge className="bg-red-100 text-red-700 border-0">未払い</Badge>;
      case 'partial': return <Badge className="bg-amber-100 text-amber-700 border-0">一部支払</Badge>;
      default: return <Badge variant="outline">{status}</Badge>;
    }
  };

  // Helper: get org display name with tree indent
  const getOrgDisplayName = (org: Organization) => {
    const depth = getOrgDepth(org, allOrgs, userOrgId!);
    const indent = depth > 0 ? '└ '.repeat(1) : '';
    const prefix = '　'.repeat(depth);
    return `${prefix}${indent}${org.name}`;
  };

  // Helper: get tier label
  const getTierLabel = (org: Organization): string => {
    const depth = getOrgDepth(org, allOrgs, userOrgId!);
    if (org.parent_org_id === userOrgId) return '直下';
    return `${depth + 1}階層下`;
  };

  if (loading) {
    return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>;
  }

  if (subOrgs.length === 0) {
    return (
      <div>
        <PageHeader title="代理店管理" description="傘下代理店のアポ状況と支払いを管理" />
        <Card className="border shadow-sm">
          <CardContent className="py-12 text-center">
            <Building2 className="w-12 h-12 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-muted-foreground">傘下代理店はまだ登録されていません</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="代理店管理" description="傘下代理店のアポ状況と支払いを管理" />

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Card className="border shadow-sm">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground font-medium">傘下代理店数</p>
                <p className="text-3xl font-bold mt-1">{subOrgs.length}</p>
              </div>
              <div className="w-11 h-11 rounded-lg flex items-center justify-center text-blue-600 bg-blue-50">
                <Building2 className="w-5 h-5" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border shadow-sm">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground font-medium">合計アポ数</p>
                <p className="text-3xl font-bold mt-1">{totalStats.total}</p>
              </div>
              <div className="w-11 h-11 rounded-lg flex items-center justify-center text-violet-600 bg-violet-50">
                <ClipboardCheck className="w-5 h-5" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border shadow-sm">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground font-medium">承認済</p>
                <p className="text-3xl font-bold mt-1">{totalStats.approved}</p>
              </div>
              <div className="w-11 h-11 rounded-lg flex items-center justify-center text-emerald-600 bg-emerald-50">
                <CheckCircle2 className="w-5 h-5" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border shadow-sm">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground font-medium">承認待ち</p>
                <p className="text-3xl font-bold mt-1">{totalStats.pending}</p>
              </div>
              <div className="w-11 h-11 rounded-lg flex items-center justify-center text-amber-600 bg-amber-50">
                <Clock className="w-5 h-5" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="mb-4">
          <TabsTrigger value="overview">概要</TabsTrigger>
          <TabsTrigger value="prices">卸単価設定</TabsTrigger>
          <TabsTrigger value="appointments">アポ一覧</TabsTrigger>
          <TabsTrigger value="payments">支払い管理</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview">
          <div className="flex justify-end mb-3">
            <Button variant="outline" size="sm" className="gap-1.5" onClick={handleOverviewCsvDownload} disabled={subOrgs.length === 0}>
              <Download className="w-4 h-4" />
              CSV
            </Button>
          </div>
          <div className="space-y-2">
            {subOrgs.map(org => {
              const stats = getSubOrgStats(org.id);
              const users = subUsers[org.id] || [];
              const depth = getOrgDepth(org, allOrgs, userOrgId!);
              const isDirectChild = org.parent_org_id === userOrgId;
              const parentOrg = allOrgs.find(o => o.id === org.parent_org_id);

              return (
                <Card key={org.id} className="border shadow-sm"
                  style={{ marginLeft: depth > 0 ? `${depth * 1.5}rem` : undefined }}>
                  <CardContent className="py-3 px-4">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2 min-w-0">
                        {depth > 0 && <ChevronRight className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />}
                        <Building2 className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                        <span className="font-semibold text-sm truncate">{org.name}</span>
                        {!isDirectChild && parentOrg && (
                          <span className="text-xs text-muted-foreground">(親: {parentOrg.name})</span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <Badge variant="outline" className="text-xs py-0">{getTierLabel(org)}</Badge>
                        <Badge variant="outline" className="text-xs py-0">{org.status === 'active' ? '有効' : '無効'}</Badge>
                      </div>
                    </div>
                    <div className="grid grid-cols-4 gap-2">
                      <div className="text-center py-1.5 bg-muted/30 rounded">
                        <p className="text-lg font-bold leading-tight">{stats.total}</p>
                        <p className="text-[10px] text-muted-foreground">合計</p>
                      </div>
                      <div className="text-center py-1.5 bg-emerald-50 rounded">
                        <p className="text-lg font-bold text-emerald-600 leading-tight">{stats.approved}</p>
                        <p className="text-[10px] text-muted-foreground">承認</p>
                      </div>
                      <div className="text-center py-1.5 bg-amber-50 rounded">
                        <p className="text-lg font-bold text-amber-600 leading-tight">{stats.pending}</p>
                        <p className="text-[10px] text-muted-foreground">保留</p>
                      </div>
                      <div className="text-center py-1.5 bg-red-50 rounded">
                        <p className="text-lg font-bold text-red-600 leading-tight">{stats.rejected}</p>
                        <p className="text-[10px] text-muted-foreground">却下</p>
                      </div>
                    </div>
                    {/* Users info - compact */}
                    {users.length > 0 && (
                      <div className="border-t mt-2 pt-2">
                        <div className="flex flex-wrap gap-2">
                          {users.map((u, i) => (
                            <div key={i} className="flex items-center gap-2 text-xs bg-muted/20 rounded px-2 py-1">
                              <span className="font-medium">{u.full_name || u.login_id}</span>
                              <span className="text-muted-foreground">ID: {u.login_id}</span>
                              <span className="text-muted-foreground flex items-center gap-0.5">
                                PW:
                                {visiblePw[`${org.id}-${i}`] ? (
                                  <>
                                    <span className="font-mono">{u.plain_password || '未設定'}</span>
                                    <button onClick={() => setVisiblePw(prev => ({ ...prev, [`${org.id}-${i}`]: false }))}>
                                      <EyeOff className="w-3 h-3" />
                                    </button>
                                  </>
                                ) : (
                                  <>
                                    <span className="font-mono">••••</span>
                                    <button onClick={() => setVisiblePw(prev => ({ ...prev, [`${org.id}-${i}`]: true }))}>
                                      <Eye className="w-3 h-3" />
                                    </button>
                                  </>
                                )}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>

        {/* Prices Tab - only show direct children for price management */}
        <TabsContent value="prices">
          <Card className="border shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold">代理店への卸単価設定</CardTitle>
              <p className="text-sm text-muted-foreground">自社に割り当てられた案件は傘下代理店に自動継承されます。直下の代理店への卸単価を個別設定できます。</p>
            </CardHeader>
            <CardContent>
              {directChildren.length === 0 ? (
                <p className="text-sm text-muted-foreground py-8 text-center">直下の代理店がありません</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>代理店名</TableHead>
                      <TableHead className="text-center">継承案件数</TableHead>
                      <TableHead className="text-center">個別単価設定</TableHead>
                      <TableHead className="text-right">操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {directChildren.map(org => {
                      const pc = getChildPriceCount(org.id);
                      return (
                        <TableRow key={org.id}>
                          <TableCell className="font-medium">{org.name}</TableCell>
                          <TableCell className="text-center">{pc.total}件</TableCell>
                          <TableCell className="text-center">
                            {pc.custom > 0 ? (
                              <Badge className="bg-blue-100 text-blue-700 border-0">{pc.custom}件設定済</Badge>
                            ) : (
                              <span className="text-sm text-muted-foreground">未設定（単価非表示）</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button variant="outline" size="sm" onClick={() => openPriceEdit(org)}>
                              <Pencil className="w-3.5 h-3.5 mr-1" /> 卸単価設定
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Appointments Tab - shows ALL descendant appointments */}
        <TabsContent value="appointments">
          <Card className="border shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base font-semibold">傘下代理店アポ一覧</CardTitle>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setSelectedMonth(prev => subMonths(prev, 1))}>
                      <ChevronLeft className="w-4 h-4" />
                    </Button>
                    <span className="text-sm font-medium min-w-[100px] text-center">
                      {format(selectedMonth, 'yyyy年M月', { locale: ja })}
                    </span>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setSelectedMonth(prev => addMonths(prev, 1))}>
                      <ChevronRight className="w-4 h-4" />
                    </Button>
                  </div>
                  <Button variant="outline" size="sm" className="gap-1.5" onClick={handleApptCsvDownload} disabled={monthFilteredAppts.length === 0}>
                    <Download className="w-4 h-4" />
                    CSV
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {monthFilteredAppts.length === 0 ? (
                <p className="text-sm text-muted-foreground py-8 text-center">{format(selectedMonth, 'yyyy年M月', { locale: ja })}のアポイントはありません</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/30">
                        <th className="text-left p-3 font-medium">登録企業</th>
                        <th className="text-left p-3 font-medium">案件</th>
                        <th className="text-left p-3 font-medium">先方企業名</th>
                        <th className="text-left p-3 font-medium">担当者</th>
                        <th className="text-left p-3 font-medium">商談日時</th>
                        <th className="text-left p-3 font-medium">ステータス</th>
                        <th className="text-left p-3 font-medium">登録日</th>
                      </tr>
                    </thead>
                    <tbody>
                      {monthFilteredAppts.map(a => {
                        const org = subOrgs.find(o => o.id === a.org_id);
                        const proj = (a as any).project;
                        return (
                          <tr key={a.id} className="border-b hover:bg-muted/20 transition-colors">
                            <td className="p-3">
                              <span className="font-medium">{org?.name || '-'}</span>
                            </td>
                            <td className="p-3">
                              {proj?.project_number && <span className="text-muted-foreground">[{proj.project_number}] </span>}
                              {proj?.title || '-'}
                            </td>
                            <td className="p-3 font-medium">{a.target_company_name}</td>
                            <td className="p-3">{a.contact_person || '-'}</td>
                            <td className="p-3">{a.meeting_datetime ? format(new Date(a.meeting_datetime), 'yyyy/MM/dd HH:mm') : '-'}</td>
                            <td className="p-3">{statusBadge(a.status)}</td>
                            <td className="p-3 text-muted-foreground">{format(new Date(a.created_at), 'yyyy/MM/dd')}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Payments Tab - direct children only */}
        <TabsContent value="payments">
          <Card className="border shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base font-semibold">支払い管理</CardTitle>
                {directChildren.length > 0 && (
                  <Button size="sm" onClick={openNewPayment}>
                    <Plus className="w-4 h-4 mr-1" />
                    支払い登録
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {payments.length === 0 ? (
                <p className="text-sm text-muted-foreground py-8 text-center">支払い記録はまだありません</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/30">
                        <th className="text-left p-3 font-medium">対象期間</th>
                        <th className="text-left p-3 font-medium">代理店</th>
                        <th className="text-right p-3 font-medium">アポ数</th>
                        <th className="text-right p-3 font-medium">承認数</th>
                        <th className="text-right p-3 font-medium">単価</th>
                        <th className="text-right p-3 font-medium">合計金額</th>
                        <th className="text-right p-3 font-medium">支払額</th>
                        <th className="text-left p-3 font-medium">ステータス</th>
                        <th className="text-left p-3 font-medium">操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      {payments.map(p => (
                        <tr key={p.id} className="border-b hover:bg-muted/20 transition-colors">
                          <td className="p-3 font-medium">{p.period}</td>
                          <td className="p-3">{(p.sub_org as any)?.name || '-'}</td>
                          <td className="p-3 text-right">{p.appointment_count}</td>
                          <td className="p-3 text-right">{p.approved_count}</td>
                          <td className="p-3 text-right">¥{p.unit_price.toLocaleString()}</td>
                          <td className="p-3 text-right font-medium">¥{p.total_amount.toLocaleString()}</td>
                          <td className="p-3 text-right">¥{p.paid_amount.toLocaleString()}</td>
                          <td className="p-3">{paymentStatusBadge(p.status)}</td>
                          <td className="p-3">
                            <Button variant="ghost" size="sm" onClick={() => openEditPayment(p)}>
                              <Edit className="w-3.5 h-3.5" />
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Price Edit Dialog */}
      <Dialog open={priceDialogOpen} onOpenChange={setPriceDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingPriceOrg?.name} — 卸単価設定</DialogTitle>
          </DialogHeader>
          <div className="py-2">
            <p className="text-sm text-muted-foreground mb-3">各案件の卸単価を設定します。空欄の場合、代理店には単価が表示されません。</p>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>案件</TableHead>
                  <TableHead className="text-right">自社への卸単価</TableHead>
                  <TableHead className="text-right">この代理店への卸単価</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {editingPriceEntries.map((entry, i) => (
                  <TableRow key={entry.allocationId}>
                    <TableCell>
                      {entry.projectNumber ? `[${entry.projectNumber}] ` : ''}{entry.projectTitle}
                    </TableCell>
                    <TableCell className="text-right font-mono text-muted-foreground">
                      {entry.parentPayout !== null ? `¥${entry.parentPayout.toLocaleString()}` : <span className="text-xs">未設定</span>}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <span className="text-sm text-muted-foreground">¥</span>
                        <Input
                          type="number"
                          min={0}
                          className="w-36 text-right"
                          placeholder={entry.parentPayout !== null ? `${entry.parentPayout}` : '単価を入力'}
                          value={entry.subPrice ?? ''}
                          onChange={(e) => handlePriceEntryChange(i, e.target.value)}
                        />
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {editingPriceEntries.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center text-muted-foreground py-6">
                      割り当てられた案件がありません
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPriceDialogOpen(false)}>キャンセル</Button>
            <Button onClick={handleSavePrices} disabled={savingPrices}>
              {savingPrices ? '保存中...' : <><Save className="w-4 h-4 mr-1" /> 保存</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Payment Dialog */}
      <Dialog open={paymentDialogOpen} onOpenChange={setPaymentDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingPayment ? '支払い情報を編集' : '支払い情報を登録'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>代理店 *</Label>
              <Select value={paymentForm.sub_org_id} onValueChange={v => setPaymentForm(f => ({ ...f, sub_org_id: v }))}>
                <SelectTrigger><SelectValue placeholder="選択してください" /></SelectTrigger>
                <SelectContent>
                  {directChildren.map(o => (
                    <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>対象期間 *</Label>
              <Input type="month" value={paymentForm.period} onChange={e => setPaymentForm(f => ({ ...f, period: e.target.value }))} />
            </div>
            <div>
              <Label>単価（円）</Label>
              <Input type="number" value={paymentForm.unit_price} onChange={e => setPaymentForm(f => ({ ...f, unit_price: parseInt(e.target.value) || 0 }))} />
            </div>
            <div>
              <Label>支払いステータス</Label>
              <Select value={paymentForm.status} onValueChange={(v: any) => setPaymentForm(f => ({ ...f, status: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="unpaid">未払い</SelectItem>
                  <SelectItem value="partial">一部支払</SelectItem>
                  <SelectItem value="paid">支払済</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {paymentForm.status === 'partial' && (
              <div>
                <Label>支払額（円）</Label>
                <Input type="number" value={paymentForm.paid_amount} onChange={e => setPaymentForm(f => ({ ...f, paid_amount: parseInt(e.target.value) || 0 }))} />
              </div>
            )}
            <div>
              <Label>備考</Label>
              <Textarea value={paymentForm.notes} onChange={e => setPaymentForm(f => ({ ...f, notes: e.target.value }))} placeholder="メモを入力" className="!field-sizing-normal resize-y" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPaymentDialogOpen(false)}>キャンセル</Button>
            <Button onClick={handleSavePayment}>{editingPayment ? '更新' : '登録'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
