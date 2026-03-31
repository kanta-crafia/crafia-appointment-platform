import { useEffect, useState, useCallback, useMemo } from 'react';
import { supabase, type SnsAccount, type SnsAccountAssignment, type Organization, type Allocation, type User } from '@/lib/supabase';
import { PageHeader } from '@/components/PageHeader';
import { StatusBadge } from '@/components/StatusBadge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle
} from '@/components/ui/alert-dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  Plus, Pencil, Trash2, Eye, EyeOff, Copy, Check,
  Facebook, Search, Filter, Share2, Building2, Users, Download
} from 'lucide-react';
import { toast } from 'sonner';

interface AssignmentWithDetails extends SnsAccountAssignment {
  sns_account?: SnsAccount;
  assigned_org?: Organization;
  allocation?: Allocation;
  assigned_by_org?: Organization;
}

export default function SnsAccounts() {
  const [accounts, setAccounts] = useState<SnsAccount[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Organizations & allocations for assignment
  const [firstTierOrgs, setFirstTierOrgs] = useState<Organization[]>([]);
  const [allOrgs, setAllOrgs] = useState<Organization[]>([]);
  const [allAllocations, setAllAllocations] = useState<Allocation[]>([]);
  const [allAssignments, setAllAssignments] = useState<AssignmentWithDetails[]>([]);

  // Filter states
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [assignSearchQuery, setAssignSearchQuery] = useState('');
  const [assignOrgFilter, setAssignOrgFilter] = useState<string>('all');

  // Dialog states
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showAssignDialog, setShowAssignDialog] = useState(false);

  const [editAccount, setEditAccount] = useState<SnsAccount | null>(null);
  const [deleteAccount, setDeleteAccount] = useState<SnsAccount | null>(null);
  const [assignAccount, setAssignAccount] = useState<SnsAccount | null>(null);

  // Form states
  const [formPlatform, setFormPlatform] = useState('facebook');
  const [formGmailAddress, setFormGmailAddress] = useState('');
  const [formGmailPassword, setFormGmailPassword] = useState('');
  const [formAccountName, setFormAccountName] = useState('');
  const [formLoginPassword, setFormLoginPassword] = useState('');

  const [formChatPassword, setFormChatPassword] = useState('');
  const [formNotes, setFormNotes] = useState('');
  const [formStatus, setFormStatus] = useState<string>('available');

  // Sales staff for assignment
  const [allSalesStaff, setAllSalesStaff] = useState<{id: string; org_id: string; name: string}[]>([]);

  // Assign form
  const [assignOrgId, setAssignOrgId] = useState('');
  const [assignAllocationId, setAssignAllocationId] = useState('');
  const [assignStaffName, setAssignStaffName] = useState('');
  const [assignNotes, setAssignNotes] = useState('');
  const [adminOrgId, setAdminOrgId] = useState<string | null>(null);

  // Edit assignment dialog
  const [showEditAssignDialog, setShowEditAssignDialog] = useState(false);
  const [editAssignment, setEditAssignment] = useState<AssignmentWithDetails | null>(null);
  const [editAssignOrgId, setEditAssignOrgId] = useState('');
  const [editAssignAllocationId, setEditAssignAllocationId] = useState('');
  const [editAssignStaffName, setEditAssignStaffName] = useState('');
  const [editAssignNotes, setEditAssignNotes] = useState('');

  // Password visibility
  const [visiblePasswords, setVisiblePasswords] = useState<Set<string>>(new Set());
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const fetchAccounts = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('sns_accounts')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      setAccounts(data || []);
    } catch (e) {
      console.error('Failed to fetch SNS accounts:', e);
      toast.error('アカウント一覧の取得に失敗しました');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchUsers = useCallback(async () => {
    try {
      const { data } = await supabase
        .from('users')
        .select('*')
        .eq('status', 'active')
        .order('full_name');
      setUsers(data || []);
    } catch (e) {
      console.error('Failed to fetch users:', e);
    }
  }, []);

  const fetchOrgsAndAllocations = useCallback(async () => {
    try {
      // Get all organizations
      const { data: orgsData } = await supabase
        .from('organizations')
        .select('*')
        .eq('status', 'active')
        .order('name');
      setAllOrgs(orgsData || []);

      // Find Crafia本部 (the org with no parent)
      const adminOrg = (orgsData || []).find(o => !o.parent_org_id);
      if (adminOrg) setAdminOrgId(adminOrg.id);

      // Set all orgs for assignment (Crafia本部 can assign to any org)
      setFirstTierOrgs(orgsData || []);

      // Get all allocations
      const { data: allocData } = await supabase
        .from('allocations')
        .select('*, project:projects(*)')
        .eq('status', 'active')
        .order('created_at', { ascending: false });
      setAllAllocations(allocData || []);

      // Get all sales staff
      const { data: staffData } = await supabase
        .from('sales_staff')
        .select('id, org_id, name')
        .eq('status', 'active')
        .order('name');
      setAllSalesStaff(staffData || []);
    } catch (e) {
      console.error('Failed to fetch orgs/allocations:', e);
    }
  }, []);

  const fetchAssignments = useCallback(async () => {
    try {
      const { data: assignData } = await supabase
        .from('sns_account_assignments')
        .select('*')
        .order('created_at', { ascending: false });

      if (!assignData || assignData.length === 0) {
        setAllAssignments([]);
        return;
      }

      // Get unique IDs
      const accountIds = Array.from(new Set(assignData.map(a => a.sns_account_id)));
      const orgIds = Array.from(new Set([
        ...assignData.map(a => a.assigned_org_id),
        ...assignData.map(a => a.assigned_by_org_id),
      ]));
      const allocIds = Array.from(new Set(
        assignData.map(a => a.allocation_id).filter(Boolean) as string[]
      ));

      // Fetch related data
      const [accountsRes, orgsRes, allocsRes] = await Promise.all([
        accountIds.length > 0 ? supabase.from('sns_accounts').select('*').in('id', accountIds) : { data: [] },
        orgIds.length > 0 ? supabase.from('organizations').select('*').in('id', orgIds) : { data: [] },
        allocIds.length > 0 ? supabase.from('allocations').select('*, project:projects(*)').in('id', allocIds) : { data: [] },
      ]);

      const accountsMap: Record<string, SnsAccount> = {};
      (accountsRes.data || []).forEach(a => { accountsMap[a.id] = a; });
      const orgsMap: Record<string, Organization> = {};
      (orgsRes.data || []).forEach(o => { orgsMap[o.id] = o; });
      const allocsMap: Record<string, Allocation> = {};
      (allocsRes.data || []).forEach(a => { allocsMap[a.id] = a; });

      const enriched: AssignmentWithDetails[] = assignData.map(a => ({
        ...a,
        sns_account: accountsMap[a.sns_account_id],
        assigned_org: orgsMap[a.assigned_org_id],
        allocation: a.allocation_id ? allocsMap[a.allocation_id] : undefined,
        assigned_by_org: orgsMap[a.assigned_by_org_id],
      }));

      setAllAssignments(enriched);
    } catch (e) {
      console.error('Failed to fetch assignments:', e);
    }
  }, []);

  useEffect(() => {
    fetchAccounts();
    fetchUsers();
    fetchOrgsAndAllocations();
    fetchAssignments();
  }, [fetchAccounts, fetchUsers, fetchOrgsAndAllocations, fetchAssignments]);

  const togglePasswordVisibility = (id: string) => {
    setVisiblePasswords(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    toast.success('コピーしました');
    setTimeout(() => setCopiedId(null), 2000);
  };

  const resetForm = () => {
    setFormPlatform('facebook');
    setFormGmailAddress('');
    setFormGmailPassword('');
    setFormAccountName('');
    setFormLoginPassword('');

    setFormChatPassword('');
    setFormNotes('');
    setFormStatus('available');
  };

  // === Create ===
  const openCreate = () => {
    resetForm();
    setShowCreateDialog(true);
  };

  const handleCreate = async () => {
    if (!formAccountName || !formLoginPassword) {
      toast.error('アカウント名とパスワードは必須です');
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase.from('sns_accounts').insert({
        platform: formPlatform,
        gmail_address: formGmailAddress || null,
        gmail_password: formGmailPassword || null,
        account_name: formAccountName,
        login_id: formGmailAddress || formAccountName,
        login_password: formLoginPassword,
        chat_password: formChatPassword || null,
        notes: formNotes || null,
        status: formStatus,
      });
      if (error) throw error;
      toast.success('アカウントを登録しました');
      setShowCreateDialog(false);
      fetchAccounts();
    } catch (e: any) {
      toast.error('登録に失敗しました', { description: e.message });
    } finally {
      setSaving(false);
    }
  };

  // === Edit ===
  const openEdit = (account: SnsAccount) => {
    setEditAccount(account);
    setFormPlatform(account.platform);
    setFormGmailAddress(account.gmail_address || '');
    setFormGmailPassword(account.gmail_password || '');
    setFormAccountName(account.account_name);
    setFormLoginPassword(account.login_password);

    setFormChatPassword(account.chat_password || '');
    setFormNotes(account.notes || '');
    setFormStatus(account.status);
    setShowEditDialog(true);
  };

  const handleEdit = async () => {
    if (!editAccount) return;
    if (!formAccountName || !formLoginPassword) {
      toast.error('アカウント名とパスワードは必須です');
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase.from('sns_accounts').update({
        platform: formPlatform,
        gmail_address: formGmailAddress || null,
        gmail_password: formGmailPassword || null,
        account_name: formAccountName,
        login_id: formGmailAddress || formAccountName,
        login_password: formLoginPassword,
        chat_password: formChatPassword || null,
        notes: formNotes || null,
        status: formStatus,
        updated_at: new Date().toISOString(),
      }).eq('id', editAccount.id);
      if (error) throw error;
      toast.success('アカウント情報を更新しました');
      setShowEditDialog(false);
      setEditAccount(null);
      fetchAccounts();
    } catch (e: any) {
      toast.error('更新に失敗しました', { description: e.message });
    } finally {
      setSaving(false);
    }
  };

  // === Delete ===
  const openDelete = (account: SnsAccount) => {
    setDeleteAccount(account);
    setShowDeleteDialog(true);
  };

  const handleDelete = async () => {
    if (!deleteAccount) return;
    setSaving(true);
    try {
      const { error } = await supabase.from('sns_accounts').delete().eq('id', deleteAccount.id);
      if (error) throw error;
      toast.success('アカウントを削除しました');
      setShowDeleteDialog(false);
      setDeleteAccount(null);
      fetchAccounts();
      fetchAssignments();
    } catch (e: any) {
      toast.error('削除に失敗しました', { description: e.message });
    } finally {
      setSaving(false);
    }
  };

  // === Assign to org/staff ===
  const openAssign = (account: SnsAccount) => {
    setAssignAccount(account);
    setAssignOrgId('');
    setAssignAllocationId('');
    setAssignStaffName('');
    setAssignNotes('');
    setShowAssignDialog(true);
  };

  const handleAssign = async () => {
    if (!assignAccount || !assignOrgId) {
      toast.error('割り振り先企業を選択してください');
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase.from('sns_account_assignments').insert({
        sns_account_id: assignAccount.id,
        assigned_org_id: assignOrgId,
        allocation_id: assignAllocationId && assignAllocationId !== 'none' ? assignAllocationId : null,
        assigned_by_org_id: adminOrgId || assignOrgId,
        assigned_staff_name: assignStaffName && assignStaffName !== 'none' ? assignStaffName : null,
        notes: assignNotes || null,
      });
      if (error) throw error;
      toast.success('割り振りを設定しました');
      setShowAssignDialog(false);
      fetchAssignments();
    } catch (e: any) {
      toast.error('割り振りに失敗しました', { description: e.message });
    } finally {
      setSaving(false);
    }
  };

  // === Edit Assignment ===
  const openEditAssignment = (assignment: AssignmentWithDetails) => {
    setEditAssignment(assignment);
    setEditAssignOrgId(assignment.assigned_org_id);
    setEditAssignAllocationId(assignment.allocation_id || '');
    setEditAssignStaffName(assignment.assigned_staff_name || '');
    setEditAssignNotes(assignment.notes || '');
    setShowEditAssignDialog(true);
  };

  const handleEditAssignment = async () => {
    if (!editAssignment) return;
    setSaving(true);
    try {
      const { error } = await supabase.from('sns_account_assignments').update({
        assigned_org_id: editAssignOrgId || editAssignment.assigned_org_id,
        allocation_id: editAssignAllocationId && editAssignAllocationId !== 'none' ? editAssignAllocationId : null,
        assigned_staff_name: editAssignStaffName && editAssignStaffName !== 'none' ? editAssignStaffName : null,
        notes: editAssignNotes || null,
        updated_at: new Date().toISOString(),
      }).eq('id', editAssignment.id);
      if (error) throw error;
      toast.success('割り振りを更新しました');
      setShowEditAssignDialog(false);
      setEditAssignment(null);
      fetchAssignments();
    } catch (e: any) {
      toast.error('更新に失敗しました', { description: e.message });
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteAssignment = async (assignmentId: string) => {
    if (!confirm('この割り振りを削除しますか？')) return;
    try {
      const { error } = await supabase.from('sns_account_assignments').delete().eq('id', assignmentId);
      if (error) throw error;
      toast.success('割り振りを削除しました');
      fetchAssignments();
    } catch (e: any) {
      toast.error('削除に失敗しました', { description: e.message });
    }
  };

  // Filtering
  const filteredAccounts = accounts.filter(account => {
    const q = searchQuery.toLowerCase();
    const matchesSearch = searchQuery === '' ||
      account.account_name.toLowerCase().includes(q) ||
      (account.gmail_address || '').toLowerCase().includes(q) ||
      account.platform.toLowerCase().includes(q);
    const matchesStatus = statusFilter === 'all' || account.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const filteredAssignments = allAssignments.filter(a => {
    const q = assignSearchQuery.toLowerCase();
    const matchesSearch = assignSearchQuery === '' ||
      (a.sns_account?.account_name || '').toLowerCase().includes(q) ||
      (a.assigned_org?.name || '').toLowerCase().includes(q) ||
      (a.assigned_staff_name || '').toLowerCase().includes(q);
    const matchesOrg = assignOrgFilter === 'all' || a.assigned_org_id === assignOrgFilter;
    return matchesSearch && matchesOrg;
  });

  // Sales staff filtered by assign dialog org selection
  const staffForAssignOrg = useMemo(() => {
    if (!assignOrgId) return [];
    return allSalesStaff.filter(s => s.org_id === assignOrgId);
  }, [assignOrgId, allSalesStaff]);

  // Sales staff filtered by edit assignment dialog org selection
  const staffForEditAssignOrg = useMemo(() => {
    if (!editAssignOrgId) return [];
    return allSalesStaff.filter(s => s.org_id === editAssignOrgId);
  }, [editAssignOrgId, allSalesStaff]);

  // Stats
  const totalCount = accounts.length;
  const availableCount = accounts.filter(a => a.status === 'available').length;
  const assignedCount = accounts.filter(a => a.status === 'assigned').length;
  const suspendedCount = accounts.filter(a => a.status === 'suspended').length;

  // CSV download for assignments
  const downloadAssignmentsCsv = () => {
    const headers = ['アカウント名', 'PF', '割り振り先企業', '案件', '営業担当者', '割り振り元', '備考', '割り振り日'];
    const rows = filteredAssignments.map(a => [
      a.sns_account?.account_name || '',
      a.sns_account?.platform || '',
      a.assigned_org?.name || '',
      a.allocation?.project ? (a.allocation.project as any).title : '',
      a.assigned_staff_name || '',
      a.assigned_by_org?.name || '',
      a.notes || '',
      a.created_at ? new Date(a.created_at).toLocaleDateString('ja-JP') : '',
    ]);
    const csvContent = '\uFEFF' + [headers, ...rows].map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sns_account_assignments_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  // Shared form fields component
  const AccountFormFields = ({ isEdit = false }: { isEdit?: boolean }) => (
    <div className="space-y-4 py-2">
      <div className="space-y-2">
        <Label>プラットフォーム</Label>
        <Select value={formPlatform} onValueChange={setFormPlatform}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="facebook">Facebook</SelectItem>
            <SelectItem value="threads">Threads</SelectItem>
            <SelectItem value="twitter">Twitter / X</SelectItem>
            <SelectItem value="linkedin">LinkedIn</SelectItem>
            <SelectItem value="other">その他</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Gmail情報 */}
      <div className="border rounded-lg p-3 space-y-3 bg-muted/30">
        <p className="text-xs font-medium text-muted-foreground">Gmail情報</p>
        <div className="space-y-2">
          <Label>Gmailアドレス</Label>
          <Input
            type="email"
            placeholder="例: example@gmail.com"
            value={formGmailAddress}
            onChange={(e) => setFormGmailAddress(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label>Gmail パスワード</Label>
          <Input
            type="text"
            placeholder="Gmailのパスワード"
            value={formGmailPassword}
            onChange={(e) => setFormGmailPassword(e.target.value)}
          />
        </div>
      </div>

      {/* アカウント情報 */}
      <div className="border rounded-lg p-3 space-y-3 bg-muted/30">
        <p className="text-xs font-medium text-muted-foreground">アカウント情報</p>
        <div className="space-y-2">
          <Label>アカウント名 <span className="text-destructive">*</span></Label>
          <Input
            placeholder="例: Crafia営業用アカウント1"
            value={formAccountName}
            onChange={(e) => setFormAccountName(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label>パスワード <span className="text-destructive">*</span></Label>
          <Input
            type="text"
            placeholder="アカウントのパスワード"
            value={formLoginPassword}
            onChange={(e) => setFormLoginPassword(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label>チャットPW</Label>
          <Input
            type="text"
            placeholder="チャット用パスワード（任意）"
            value={formChatPassword}
            onChange={(e) => setFormChatPassword(e.target.value)}
          />
        </div>
      </div>

      {/* ステータス（編集時のみ） */}
      {isEdit && (
        <div className="space-y-2">
          <Label>ステータス</Label>
          <Select value={formStatus} onValueChange={setFormStatus}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="available">空き</SelectItem>
              <SelectItem value="assigned">割り振り済</SelectItem>
              <SelectItem value="suspended">停止中</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}

      {/* 備考 */}
      <div className="space-y-2">
        <Label>備考</Label>
        <Textarea
          placeholder="メモや注意事項など"
          value={formNotes}
          onChange={(e) => setFormNotes(e.target.value)}
          rows={3}
        />
      </div>
    </div>
  );

  const PasswordCell = ({ value, id }: { value: string | null; id: string }) => {
    if (!value) return <span className="text-xs text-muted-foreground">—</span>;
    return (
      <div className="flex items-center gap-1">
        <code className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono">
          {visiblePasswords.has(id) ? value : '••••••'}
        </code>
        <Button variant="ghost" size="sm" className="h-5 w-5 p-0" onClick={() => togglePasswordVisibility(id)}>
          {visiblePasswords.has(id) ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
        </Button>
        <Button variant="ghost" size="sm" className="h-5 w-5 p-0" onClick={() => copyToClipboard(value, id)}>
          {copiedId === id ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}
        </Button>
      </div>
    );
  };

  return (
    <div>
      <PageHeader
        title="SNSアカウント管理"
        description="SNSアカウントの登録・割り振り管理"
        action={
          <Button onClick={openCreate}>
            <Plus className="w-4 h-4 mr-2" />
            アカウント追加
          </Button>
        }
      />

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
        <Card className="border shadow-sm">
          <CardContent className="p-4">
            <div className="text-sm text-muted-foreground">合計</div>
            <div className="text-2xl font-bold">{totalCount}</div>
          </CardContent>
        </Card>
        <Card className="border shadow-sm">
          <CardContent className="p-4">
            <div className="text-sm text-blue-600">空き</div>
            <div className="text-2xl font-bold text-blue-600">{availableCount}</div>
          </CardContent>
        </Card>
        <Card className="border shadow-sm">
          <CardContent className="p-4">
            <div className="text-sm text-purple-600">割り振り済</div>
            <div className="text-2xl font-bold text-purple-600">{assignedCount}</div>
          </CardContent>
        </Card>
        <Card className="border shadow-sm">
          <CardContent className="p-4">
            <div className="text-sm text-orange-600">停止中</div>
            <div className="text-2xl font-bold text-orange-600">{suspendedCount}</div>
          </CardContent>
        </Card>
        <Card className="border shadow-sm">
          <CardContent className="p-4">
            <div className="text-sm text-green-600">割り振り数</div>
            <div className="text-2xl font-bold text-green-600">{allAssignments.length}</div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="accounts">
        <TabsList className="mb-4">
          <TabsTrigger value="accounts">アカウント管理</TabsTrigger>
          <TabsTrigger value="assignments">割り振り管理（{allAssignments.length}）</TabsTrigger>
        </TabsList>

        {/* Accounts Tab */}
        <TabsContent value="accounts">
          {/* Filters */}
          <div className="flex flex-col sm:flex-row gap-3 mb-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                placeholder="アカウント名、Gmailで検索..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[160px]">
                <Filter className="w-4 h-4 mr-2" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">すべて</SelectItem>
                <SelectItem value="available">空き</SelectItem>
                <SelectItem value="assigned">割り振り済</SelectItem>
                <SelectItem value="suspended">停止中</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Accounts Table */}
          <Card className="border shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold">
                アカウント一覧（{filteredAccounts.length}件）
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>PF</TableHead>
                      <TableHead>Gmailアドレス</TableHead>
                      <TableHead>Gmail PW</TableHead>
                      <TableHead>アカウント名</TableHead>
                      <TableHead>PW</TableHead>
                      <TableHead>チャットPW</TableHead>
                      <TableHead>割り振り先</TableHead>
                      <TableHead>ステータス</TableHead>
                      <TableHead>備考</TableHead>
                      <TableHead className="text-right">操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredAccounts.map((account) => (
                      <TableRow key={account.id}>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Facebook className="w-4 h-4 text-blue-600" />
                            <span className="text-xs capitalize">{account.platform}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          {account.gmail_address ? (
                            <div className="flex items-center gap-1">
                              <code className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono">
                                {account.gmail_address}
                              </code>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-5 w-5 p-0"
                                onClick={() => copyToClipboard(account.gmail_address!, `gmail-${account.id}`)}
                              >
                                {copiedId === `gmail-${account.id}` ? (
                                  <Check className="w-3 h-3 text-green-500" />
                                ) : (
                                  <Copy className="w-3 h-3" />
                                )}
                              </Button>
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <PasswordCell value={account.gmail_password} id={`gp-${account.id}`} />
                        </TableCell>
                        <TableCell className="font-medium text-sm">{account.account_name}</TableCell>
                        <TableCell>
                          <PasswordCell value={account.login_password} id={`ap-${account.id}`} />
                        </TableCell>
                        <TableCell>
                          <PasswordCell value={account.chat_password} id={`cp-${account.id}`} />
                        </TableCell>
                        <TableCell>
                          {(() => {
                            const accountAssignments = allAssignments.filter(a => a.sns_account_id === account.id);
                            if (accountAssignments.length === 0) return <span className="text-xs text-muted-foreground">未割り振り</span>;
                            return (
                              <div className="space-y-0.5">
                                {accountAssignments.slice(0, 2).map(a => (
                                  <div key={a.id} className="flex items-center gap-1 text-xs">
                                    <Building2 className="w-3 h-3 text-muted-foreground shrink-0" />
                                    <span className="font-medium truncate max-w-[100px]">{a.assigned_org?.name || '—'}</span>
                                    {a.assigned_staff_name && (
                                      <span className="text-muted-foreground">({a.assigned_staff_name})</span>
                                    )}
                                  </div>
                                ))}
                                {accountAssignments.length > 2 && (
                                  <span className="text-xs text-muted-foreground">他{accountAssignments.length - 2}件</span>
                                )}
                              </div>
                            );
                          })()}
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={account.status} />
                        </TableCell>
                        <TableCell>
                          <span className="text-xs text-muted-foreground truncate max-w-[120px] block">
                            {account.notes || '—'}
                          </span>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => openAssign(account)}
                              title="割り振り"
                              className="text-xs"
                            >
                              <Share2 className="w-3.5 h-3.5 mr-1" />
                              割り振り
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => openEdit(account)}
                              title="編集"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => openDelete(account)}
                              title="削除"
                              className="text-destructive hover:text-destructive"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                    {filteredAccounts.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={9} className="text-center text-muted-foreground py-12">
                          {accounts.length === 0
                            ? 'SNSアカウントがまだ登録されていません'
                            : '検索条件に一致するアカウントがありません'}
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Assignments Tab */}
        <TabsContent value="assignments">
          <div className="flex flex-col sm:flex-row gap-3 mb-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="アカウント名、企業名、担当者名で検索..."
                value={assignSearchQuery}
                onChange={(e) => setAssignSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={assignOrgFilter} onValueChange={setAssignOrgFilter}>
              <SelectTrigger className="w-[200px]">
                <Building2 className="w-4 h-4 mr-2" />
                <SelectValue placeholder="企業で絞り込み" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">すべての企業</SelectItem>
                {allOrgs.map(org => (
                  <SelectItem key={org.id} value={org.id}>{org.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" onClick={downloadAssignmentsCsv}>
              <Download className="w-4 h-4 mr-2" />
              CSV
            </Button>
          </div>

          <Card className="border shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold">
                全割り振り一覧（{filteredAssignments.length}件）
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>アカウント名</TableHead>
                      <TableHead>PF</TableHead>
                      <TableHead>割り振り先企業</TableHead>
                      <TableHead>案件</TableHead>
                      <TableHead>営業担当者</TableHead>
                      <TableHead>割り振り元</TableHead>
                      <TableHead>備考</TableHead>
                      <TableHead>割り振り日</TableHead>
                      <TableHead className="text-right">操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredAssignments.map((assignment) => (
                      <TableRow key={assignment.id}>
                        <TableCell className="font-medium text-sm">
                          {assignment.sns_account?.account_name || '—'}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Facebook className="w-4 h-4 text-blue-600" />
                            <span className="text-xs capitalize">{assignment.sns_account?.platform || '—'}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Building2 className="w-3.5 h-3.5 text-muted-foreground" />
                            <span className="text-sm">{assignment.assigned_org?.name || '—'}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          {assignment.allocation?.project ? (
                            <Badge variant="outline" className="text-xs">
                              {(assignment.allocation.project as any).title}
                            </Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {assignment.assigned_staff_name ? (
                            <div className="flex items-center gap-1">
                              <Users className="w-3.5 h-3.5 text-muted-foreground" />
                              <span className="text-sm">{assignment.assigned_staff_name}</span>
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <span className="text-xs text-muted-foreground">
                            {assignment.assigned_by_org?.name || '—'}
                          </span>
                        </TableCell>
                        <TableCell>
                          <span className="text-xs text-muted-foreground truncate max-w-[100px] block">
                            {assignment.notes || '—'}
                          </span>
                        </TableCell>
                        <TableCell>
                          <span className="text-xs text-muted-foreground">
                            {assignment.created_at ? new Date(assignment.created_at).toLocaleDateString('ja-JP') : '—'}
                          </span>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => openEditAssignment(assignment)}
                              title="編集"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDeleteAssignment(assignment.id)}
                              title="削除"
                              className="text-destructive hover:text-destructive"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                    {filteredAssignments.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={9} className="text-center text-muted-foreground py-12">
                          割り振りデータがありません
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* === Create Dialog === */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="sm:max-w-[520px] max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>SNSアカウント登録</DialogTitle>
            <DialogDescription>新しいSNSアカウントを登録します</DialogDescription>
          </DialogHeader>
          <AccountFormFields />
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
              キャンセル
            </Button>
            <Button onClick={handleCreate} disabled={saving}>
              {saving ? '登録中...' : '登録'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* === Edit Dialog === */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="sm:max-w-[520px] max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>アカウント編集</DialogTitle>
            <DialogDescription>アカウント情報を編集します</DialogDescription>
          </DialogHeader>
          <AccountFormFields isEdit />
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditDialog(false)}>
              キャンセル
            </Button>
            <Button onClick={handleEdit} disabled={saving}>
              {saving ? '更新中...' : '更新'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* === Delete Dialog === */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>アカウントを削除しますか？</AlertDialogTitle>
            <AlertDialogDescription>
              「{deleteAccount?.account_name}」を削除します。
              関連する割り振りも全て削除されます。この操作は取り消せません。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>キャンセル</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {saving ? '削除中...' : '削除する'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* === Assign Dialog === */}
      <Dialog open={showAssignDialog} onOpenChange={setShowAssignDialog}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>アカウントを割り振り</DialogTitle>
            <DialogDescription>
              「{assignAccount?.account_name}」を企業・担当者に割り振ります
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>割り振り先企業 <span className="text-destructive">*</span></Label>
              <Select value={assignOrgId} onValueChange={(v) => {
                setAssignOrgId(v);
                setAssignStaffName('');
              }}>
                <SelectTrigger>
                  <SelectValue placeholder="企業を選択" />
                </SelectTrigger>
                <SelectContent>
                  {(() => {
                    // Build hierarchical org list (same as Organizations.tsx)
                    const topLevel = allOrgs.filter(o => !o.parent_org_id);
                    const result: { id: string; name: string; depth: number; parentName?: string }[] = [];
                    const addChildren = (parentId: string, depth: number) => {
                      const children = allOrgs.filter(o => o.parent_org_id === parentId);
                      for (const child of children) {
                        const parent = allOrgs.find(o => o.id === parentId);
                        result.push({ id: child.id, name: child.name, depth, parentName: parent?.name });
                        addChildren(child.id, depth + 1);
                      }
                    };
                    for (const top of topLevel) {
                      result.push({ id: top.id, name: top.name, depth: 0 });
                      addChildren(top.id, 1);
                    }
                    return result.map(o => (
                      <SelectItem key={o.id} value={o.id}>
                        {'\u00A0\u00A0'.repeat(o.depth)}{o.depth > 0 ? '└ ' : ''}{o.name}
                        {o.parentName ? ` (${o.parentName})` : '（自社）'}
                      </SelectItem>
                    ));
                  })()}
                </SelectContent>
              </Select>
            </div>
            {assignOrgId && staffForAssignOrg.length > 0 && (
              <div className="space-y-2">
                <Label>営業担当者（任意）</Label>
                <Select value={assignStaffName || 'none'} onValueChange={(v) => setAssignStaffName(v === 'none' ? '' : v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="担当者を選択（任意）" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">指定なし</SelectItem>
                    {staffForAssignOrg.map(staff => (
                      <SelectItem key={staff.id} value={staff.name}>
                        {staff.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">選択した企業の営業担当者から選べます</p>
              </div>
            )}
            {assignOrgId && staffForAssignOrg.length === 0 && (
              <div className="space-y-2">
                <Label>営業担当者（任意）</Label>
                <Select value="none" disabled>
                  <SelectTrigger className="opacity-60">
                    <SelectValue placeholder="営業担当者が未登録です" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">営業担当者が未登録です</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">この企業には営業担当者が登録されていません。企業管理から営業担当者を追加してください。</p>
              </div>
            )}
            <div className="space-y-2">
              <Label>案件（任意）</Label>
              <Select value={assignAllocationId} onValueChange={setAssignAllocationId}>
                <SelectTrigger>
                  <SelectValue placeholder="案件を選択（任意）" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">指定なし</SelectItem>
                  {(() => {
                    // Deduplicate by project_id to show each project only once
                    const seenProjectIds = new Set<string>();
                    return allAllocations
                      .filter(alloc => {
                        const pid = alloc.project_id;
                        if (seenProjectIds.has(pid)) return false;
                        seenProjectIds.add(pid);
                        return true;
                      })
                      .map(alloc => {
                        const proj = alloc.project as any;
                        const projectNumber = proj?.project_number ? `[${proj.project_number}] ` : '';
                        return (
                          <SelectItem key={alloc.id} value={alloc.id}>
                            {projectNumber}{proj?.title || alloc.id}
                          </SelectItem>
                        );
                      });
                  })()}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>備考</Label>
              <Textarea
                placeholder="メモや注意事項など"
                value={assignNotes}
                onChange={(e) => setAssignNotes(e.target.value)}
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAssignDialog(false)}>キャンセル</Button>
            <Button onClick={handleAssign} disabled={saving || !assignOrgId}>
              {saving ? '割り振り中...' : '割り振り'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* === Edit Assignment Dialog === */}
      <Dialog open={showEditAssignDialog} onOpenChange={setShowEditAssignDialog}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>割り振り編集</DialogTitle>
            <DialogDescription>
              「{editAssignment?.sns_account?.account_name || editAssignment?.sns_account_id}」の割り振り情報を編集します
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>割り振り先企業 <span className="text-destructive">*</span></Label>
              <Select value={editAssignOrgId} onValueChange={(v) => {
                setEditAssignOrgId(v);
                setEditAssignStaffName('');
              }}>
                <SelectTrigger>
                  <SelectValue placeholder="企業を選択" />
                </SelectTrigger>
                <SelectContent>
                  {(() => {
                    const topLevel = allOrgs.filter(o => !o.parent_org_id);
                    const result: { id: string; name: string; depth: number; parentName?: string }[] = [];
                    const addChildren = (parentId: string, depth: number) => {
                      const children = allOrgs.filter(o => o.parent_org_id === parentId);
                      for (const child of children) {
                        const parent = allOrgs.find(o => o.id === parentId);
                        result.push({ id: child.id, name: child.name, depth, parentName: parent?.name });
                        addChildren(child.id, depth + 1);
                      }
                    };
                    for (const top of topLevel) {
                      result.push({ id: top.id, name: top.name, depth: 0 });
                      addChildren(top.id, 1);
                    }
                    return result.map(o => (
                      <SelectItem key={o.id} value={o.id}>
                        {'\u00A0\u00A0'.repeat(o.depth)}{o.depth > 0 ? '└ ' : ''}{o.name}
                        {o.parentName ? ` (${o.parentName})` : '（自社）'}
                      </SelectItem>
                    ));
                  })()}
                </SelectContent>
              </Select>
            </div>
            {editAssignOrgId && (
              <div className="space-y-2">
                <Label>営業担当者（任意）</Label>
                {staffForEditAssignOrg.length > 0 ? (
                  <Select value={editAssignStaffName || 'none'} onValueChange={(v) => setEditAssignStaffName(v === 'none' ? '' : v)}>
                    <SelectTrigger>
                      <SelectValue placeholder="担当者を選択（任意）" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">指定なし</SelectItem>
                      {staffForEditAssignOrg.map(staff => (
                        <SelectItem key={staff.id} value={staff.name}>
                          {staff.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <>
                    <Select value="none" disabled>
                      <SelectTrigger className="opacity-60">
                        <SelectValue placeholder="営業担当者が未登録です" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">営業担当者が未登録です</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">この企業には営業担当者が登録されていません。企業管理から営業担当者を追加してください。</p>
                  </>
                )}
              </div>
            )}
            <div className="space-y-2">
              <Label>案件（任意）</Label>
              <Select value={editAssignAllocationId || 'none'} onValueChange={(v) => setEditAssignAllocationId(v === 'none' ? '' : v)}>
                <SelectTrigger>
                  <SelectValue placeholder="案件を選択（任意）" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">指定なし</SelectItem>
                  {(() => {
                    const seenProjectIds = new Set<string>();
                    return allAllocations
                      .filter(alloc => {
                        const pid = alloc.project_id;
                        if (seenProjectIds.has(pid)) return false;
                        seenProjectIds.add(pid);
                        return true;
                      })
                      .map(alloc => {
                        const proj = alloc.project as any;
                        const projectNumber = proj?.project_number ? `[${proj.project_number}] ` : '';
                        return (
                          <SelectItem key={alloc.id} value={alloc.id}>
                            {projectNumber}{proj?.title || alloc.id}
                          </SelectItem>
                        );
                      });
                  })()}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>備考</Label>
              <Textarea
                placeholder="メモや注意事項など"
                value={editAssignNotes}
                onChange={(e) => setEditAssignNotes(e.target.value)}
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditAssignDialog(false)}>キャンセル</Button>
            <Button onClick={handleEditAssignment} disabled={saving || !editAssignOrgId}>
              {saving ? '更新中...' : '更新'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
