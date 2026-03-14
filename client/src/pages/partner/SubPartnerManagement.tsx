import { useEffect, useState, useCallback } from 'react';
import { supabase, type Organization, type Appointment, type SubPartnerPayment } from '@/lib/supabase';
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
  XCircle, DollarSign, Plus, Edit, Eye, EyeOff
} from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';

export default function SubPartnerManagement() {
  const { user } = useAuth();
  const [subOrgs, setSubOrgs] = useState<Organization[]>([]);
  const [subUsers, setSubUsers] = useState<Record<string, { login_id: string; full_name: string | null; plain_password: string | null }[]>>({});
  const [subAppointments, setSubAppointments] = useState<Appointment[]>([]);
  const [payments, setPayments] = useState<SubPartnerPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');

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

  const fetchData = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      // Get sub organizations (children of current org)
      const { data: orgs } = await supabase
        .from('organizations')
        .select('*')
        .eq('parent_org_id', user.org_id)
        .eq('status', 'active');
      const subOrgList = orgs || [];
      setSubOrgs(subOrgList);

      if (subOrgList.length === 0) {
        setLoading(false);
        return;
      }

      const subOrgIds = subOrgList.map(o => o.id);

      // Get users for each sub org
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

      // Get appointments from sub orgs
      const { data: appts } = await supabase
        .from('appointments')
        .select('*, project:projects(title, project_number)')
        .in('org_id', subOrgIds)
        .order('created_at', { ascending: false });
      setSubAppointments(appts || []);

      // Get payments
      const { data: payData } = await supabase
        .from('sub_partner_payments')
        .select('*, sub_org:organizations!sub_partner_payments_sub_org_id_fkey(name)')
        .eq('parent_org_id', user.org_id)
        .order('period', { ascending: false });
      setPayments(payData || []);

    } catch (e) {
      console.error('SubPartnerManagement fetch error:', e);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Stats per sub org
  const getSubOrgStats = (orgId: string) => {
    const appts = subAppointments.filter(a => a.org_id === orgId);
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
  const openNewPayment = () => {
    setEditingPayment(null);
    setPaymentForm({
      sub_org_id: subOrgs[0]?.id || '',
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

    // Calculate counts for the period
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
      status: paymentForm.status,
      paid_amount: paymentForm.status === 'paid' ? totalAmount : paymentForm.paid_amount,
      paid_at: paymentForm.status === 'paid' ? new Date().toISOString() : null,
      notes: paymentForm.notes || null,
      updated_at: new Date().toISOString(),
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

  if (loading) {
    return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>;
  }

  if (subOrgs.length === 0) {
    return (
      <div>
        <PageHeader title="二次代理店管理" description="二次代理店のアポ状況と支払いを管理" />
        <Card className="border shadow-sm">
          <CardContent className="py-12 text-center">
            <Building2 className="w-12 h-12 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-muted-foreground">二次代理店はまだ登録されていません</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="二次代理店管理" description="二次代理店のアポ状況と支払いを管理" />

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Card className="border shadow-sm">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground font-medium">二次代理店数</p>
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
          <TabsTrigger value="appointments">アポ一覧</TabsTrigger>
          <TabsTrigger value="payments">支払い管理</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview">
          <div className="space-y-4">
            {subOrgs.map(org => {
              const stats = getSubOrgStats(org.id);
              const users = subUsers[org.id] || [];
              return (
                <Card key={org.id} className="border shadow-sm">
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base font-semibold flex items-center gap-2">
                        <Building2 className="w-4 h-4 text-muted-foreground" />
                        {org.name}
                      </CardTitle>
                      <Badge variant="outline" className="text-xs">{org.status === 'active' ? '有効' : '無効'}</Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
                      <div className="text-center p-3 bg-muted/30 rounded-lg">
                        <p className="text-2xl font-bold">{stats.total}</p>
                        <p className="text-xs text-muted-foreground">合計アポ</p>
                      </div>
                      <div className="text-center p-3 bg-emerald-50 rounded-lg">
                        <p className="text-2xl font-bold text-emerald-600">{stats.approved}</p>
                        <p className="text-xs text-muted-foreground">承認済</p>
                      </div>
                      <div className="text-center p-3 bg-amber-50 rounded-lg">
                        <p className="text-2xl font-bold text-amber-600">{stats.pending}</p>
                        <p className="text-xs text-muted-foreground">保留中</p>
                      </div>
                      <div className="text-center p-3 bg-red-50 rounded-lg">
                        <p className="text-2xl font-bold text-red-600">{stats.rejected}</p>
                        <p className="text-xs text-muted-foreground">却下</p>
                      </div>
                    </div>

                    {/* Users info */}
                    {users.length > 0 && (
                      <div className="border-t pt-3">
                        <p className="text-sm font-medium mb-2 flex items-center gap-1.5">
                          <Users className="w-3.5 h-3.5 text-muted-foreground" />
                          ユーザー情報
                        </p>
                        <div className="space-y-1.5">
                          {users.map((u, i) => (
                            <div key={i} className="flex items-center gap-3 text-sm bg-muted/20 rounded px-3 py-1.5">
                              <span className="font-medium min-w-[80px]">{u.full_name || u.login_id}</span>
                              <span className="text-muted-foreground">ID: {u.login_id}</span>
                              <span className="text-muted-foreground flex items-center gap-1">
                                PW:
                                {visiblePw[`${org.id}-${i}`] ? (
                                  <>
                                    <span className="font-mono">{u.plain_password || '未設定'}</span>
                                    <button onClick={() => setVisiblePw(prev => ({ ...prev, [`${org.id}-${i}`]: false }))} className="ml-1">
                                      <EyeOff className="w-3.5 h-3.5" />
                                    </button>
                                  </>
                                ) : (
                                  <>
                                    <span className="font-mono">••••••</span>
                                    <button onClick={() => setVisiblePw(prev => ({ ...prev, [`${org.id}-${i}`]: true }))} className="ml-1">
                                      <Eye className="w-3.5 h-3.5" />
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

        {/* Appointments Tab */}
        <TabsContent value="appointments">
          <Card className="border shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold">二次代理店アポ一覧</CardTitle>
            </CardHeader>
            <CardContent>
              {subAppointments.length === 0 ? (
                <p className="text-sm text-muted-foreground py-8 text-center">アポイントはまだありません</p>
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
                      {subAppointments.map(a => {
                        const org = subOrgs.find(o => o.id === a.org_id);
                        const proj = a.project as any;
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

        {/* Payments Tab */}
        <TabsContent value="payments">
          <Card className="border shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base font-semibold">支払い管理</CardTitle>
                <Button size="sm" onClick={openNewPayment}>
                  <Plus className="w-4 h-4 mr-1" />
                  支払い登録
                </Button>
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
                        <th className="text-left p-3 font-medium">二次代理店</th>
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

      {/* Payment Dialog */}
      <Dialog open={paymentDialogOpen} onOpenChange={setPaymentDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingPayment ? '支払い情報を編集' : '支払い情報を登録'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>二次代理店 *</Label>
              <Select value={paymentForm.sub_org_id} onValueChange={v => setPaymentForm(f => ({ ...f, sub_org_id: v }))}>
                <SelectTrigger><SelectValue placeholder="選択してください" /></SelectTrigger>
                <SelectContent>
                  {subOrgs.map(o => (
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
              <Textarea value={paymentForm.notes} onChange={e => setPaymentForm(f => ({ ...f, notes: e.target.value }))} placeholder="メモを入力" />
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
