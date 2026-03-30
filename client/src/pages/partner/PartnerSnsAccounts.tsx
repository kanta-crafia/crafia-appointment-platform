import { useEffect, useState, useCallback, useMemo } from 'react';
import { supabase, type SnsAccount, type SnsAccountAssignment, type Organization, type Allocation, type SalesStaff } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { PageHeader } from '@/components/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription
} from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Eye, EyeOff, Copy, Check, Facebook, Share2, Users, Pencil, Search, Building2
} from 'lucide-react';
import { toast } from 'sonner';

interface AssignmentWithDetails extends SnsAccountAssignment {
  sns_account?: SnsAccount;
  assigned_org?: Organization;
  allocation?: Allocation;
  assigned_by_org?: Organization;
}

export default function PartnerSnsAccounts() {
  const { user } = useAuth();
  const userOrgId = user?.org_id;

  const [myAssignments, setMyAssignments] = useState<AssignmentWithDetails[]>([]);
  const [descendantAssignments, setDescendantAssignments] = useState<AssignmentWithDetails[]>([]);
  const [descendantOrgs, setDescendantOrgs] = useState<Organization[]>([]);
  const [childOrgs, setChildOrgs] = useState<Organization[]>([]);
  const [allocations, setAllocations] = useState<Allocation[]>([]);
  const [allSalesStaff, setAllSalesStaff] = useState<SalesStaff[]>([]);
  const [loading, setLoading] = useState(true);

  // Assign dialog
  const [showAssignDialog, setShowAssignDialog] = useState(false);
  const [assignAccount, setAssignAccount] = useState<SnsAccount | null>(null);
  const [assignOrgId, setAssignOrgId] = useState('');
  const [assignAllocationId, setAssignAllocationId] = useState('');
  const [assignStaffName, setAssignStaffName] = useState('');
  const [assignNotes, setAssignNotes] = useState('');
  const [saving, setSaving] = useState(false);

  // Edit assignment dialog
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editAssignment, setEditAssignment] = useState<AssignmentWithDetails | null>(null);
  const [editOrgId, setEditOrgId] = useState('');
  const [editAllocationId, setEditAllocationId] = useState('');
  const [editStaffName, setEditStaffName] = useState('');
  const [editNotes, setEditNotes] = useState('');

  // Search
  const [searchQuery, setSearchQuery] = useState('');

  // Password visibility
  const [visiblePasswords, setVisiblePasswords] = useState<Set<string>>(new Set());
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Helper: get all descendant org IDs recursively
  const getDescendantOrgIds = useCallback((orgId: string, allOrgs: Organization[]): string[] => {
    const directChildren = allOrgs.filter(o => o.parent_org_id === orgId);
    const ids: string[] = [];
    for (const child of directChildren) {
      ids.push(child.id);
      ids.push(...getDescendantOrgIds(child.id, allOrgs));
    }
    return ids;
  }, []);

  const fetchData = useCallback(async () => {
    if (!userOrgId) return;
    setLoading(true);
    try {
      // 1. Get ALL organizations to build hierarchy
      const { data: allOrgsData } = await supabase
        .from('organizations')
        .select('*')
        .eq('status', 'active')
        .order('name');
      const allOrgsList = allOrgsData || [];

      // Find direct children and all descendants
      const directChildren = allOrgsList.filter(o => o.parent_org_id === userOrgId);
      setChildOrgs(directChildren);

      const descendantIds = getDescendantOrgIds(userOrgId, allOrgsList);
      const descendants = allOrgsList.filter(o => descendantIds.includes(o.id));
      setDescendantOrgs(descendants);

      // 2. Get assignments TO my org (accounts assigned to me)
      const { data: myAssignData } = await supabase
        .from('sns_account_assignments')
        .select('*')
        .eq('assigned_org_id', userOrgId)
        .order('created_at', { ascending: false });

      // 3. Get assignments TO descendant orgs (to show in management tab)
      let descAssignData: any[] = [];
      if (descendantIds.length > 0) {
        const { data } = await supabase
          .from('sns_account_assignments')
          .select('*')
          .in('assigned_org_id', descendantIds)
          .order('created_at', { ascending: false });
        descAssignData = data || [];
      }

      // Also get assignments made BY my org (even to non-descendants, for editing)
      const { data: madeByMeData } = await supabase
        .from('sns_account_assignments')
        .select('*')
        .eq('assigned_by_org_id', userOrgId)
        .order('created_at', { ascending: false });

      // Merge descendant assignments and assignments made by me (deduplicate)
      const allDescAssign = [...descAssignData, ...(madeByMeData || [])];
      const uniqueDescAssign = allDescAssign.filter((a, i, arr) => arr.findIndex(x => x.id === a.id) === i);

      // 4. Collect all related IDs for enrichment
      const allAssignments = [...(myAssignData || []), ...uniqueDescAssign];
      const accountIds = Array.from(new Set(allAssignments.map(a => a.sns_account_id)));
      const orgIds = Array.from(new Set([
        ...allAssignments.map(a => a.assigned_org_id),
        ...allAssignments.map(a => a.assigned_by_org_id),
      ]));
      const allocIds = Array.from(new Set(
        allAssignments.map(a => a.allocation_id).filter(Boolean) as string[]
      ));

      // Fetch related data
      let accountsMap: Record<string, SnsAccount> = {};
      if (accountIds.length > 0) {
        const { data } = await supabase.from('sns_accounts').select('*').in('id', accountIds);
        (data || []).forEach(a => { accountsMap[a.id] = a; });
      }

      let orgsMap: Record<string, Organization> = {};
      if (orgIds.length > 0) {
        const { data } = await supabase.from('organizations').select('*').in('id', orgIds);
        (data || []).forEach(o => { orgsMap[o.id] = o; });
      }

      let allocsMap: Record<string, Allocation> = {};
      if (allocIds.length > 0) {
        const { data } = await supabase.from('allocations').select('*, project:projects(*)').in('id', allocIds);
        (data || []).forEach(a => { allocsMap[a.id] = a; });
      }

      // Enrich assignments
      const enrichMyAssign = (myAssignData || []).map(a => ({
        ...a,
        sns_account: accountsMap[a.sns_account_id],
        assigned_org: orgsMap[a.assigned_org_id],
        allocation: a.allocation_id ? allocsMap[a.allocation_id] : undefined,
        assigned_by_org: orgsMap[a.assigned_by_org_id],
      }));

      const enrichDescAssign = uniqueDescAssign.map(a => ({
        ...a,
        sns_account: accountsMap[a.sns_account_id],
        assigned_org: orgsMap[a.assigned_org_id],
        allocation: a.allocation_id ? allocsMap[a.allocation_id] : undefined,
        assigned_by_org: orgsMap[a.assigned_by_org_id],
      }));

      setMyAssignments(enrichMyAssign);
      setDescendantAssignments(enrichDescAssign);

      // 5. Get allocations for this org (for assignment dropdown)
      const { data: directAllocs } = await supabase
        .from('allocations')
        .select('*, project:projects(*)')
        .eq('child_org_id', userOrgId)
        .eq('status', 'active');

      const { data: subPrices } = await supabase
        .from('sub_allocation_prices')
        .select('*, allocation:allocations(*, project:projects(*))')
        .eq('sub_org_id', userOrgId);

      const inheritedAllocs = (subPrices || [])
        .map(sp => sp.allocation)
        .filter((a): a is Allocation => !!a);

      const allAllocs = [...(directAllocs || []), ...inheritedAllocs];
      const uniqueAllocs = allAllocs.filter((a, i, arr) => arr.findIndex(x => x.id === a.id) === i);
      setAllocations(uniqueAllocs);

      // 6. Get sales staff for all descendant orgs + self
      const staffOrgIds = [userOrgId, ...descendantIds];
      const { data: staffData } = await supabase
        .from('sales_staff')
        .select('*')
        .in('org_id', staffOrgIds)
        .eq('status', 'active')
        .order('name');
      setAllSalesStaff(staffData || []);

    } catch (e) {
      console.error('Failed to fetch SNS data:', e);
      toast.error('データの取得に失敗しました');
    } finally {
      setLoading(false);
    }
  }, [userOrgId, getDescendantOrgIds]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

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

  // Group my assignments by account for display
  const myAccountGroups = useMemo(() => {
    const groups: Record<string, { account: SnsAccount; assignments: AssignmentWithDetails[] }> = {};
    myAssignments.forEach(a => {
      if (!a.sns_account) return;
      if (!groups[a.sns_account_id]) {
        groups[a.sns_account_id] = { account: a.sns_account, assignments: [] };
      }
      groups[a.sns_account_id].assignments.push(a);
    });
    return Object.values(groups);
  }, [myAssignments]);

  // Filter my accounts by search
  const filteredAccountGroups = useMemo(() => {
    if (!searchQuery) return myAccountGroups;
    const q = searchQuery.toLowerCase();
    return myAccountGroups.filter(({ account }) =>
      account.account_name.toLowerCase().includes(q) ||
      (account.gmail_address || '').toLowerCase().includes(q) ||
      account.platform.toLowerCase().includes(q)
    );
  }, [myAccountGroups, searchQuery]);

  // Staff filtered by selected org in assign dialog
  const staffForAssignOrg = useMemo(() => {
    if (!assignOrgId) return [];
    return allSalesStaff.filter(s => s.org_id === assignOrgId);
  }, [assignOrgId, allSalesStaff]);

  // Staff filtered by selected org in edit dialog
  const staffForEditOrg = useMemo(() => {
    if (!editOrgId) return [];
    return allSalesStaff.filter(s => s.org_id === editOrgId);
  }, [editOrgId, allSalesStaff]);

  // Open assign dialog - assign to child/descendant org
  const openAssign = (account: SnsAccount) => {
    setAssignAccount(account);
    setAssignOrgId('');
    setAssignAllocationId('');
    setAssignStaffName('');
    setAssignNotes('');
    setShowAssignDialog(true);
  };

  const handleAssign = async () => {
    if (!assignAccount || !userOrgId || !assignOrgId) {
      toast.error('割り振り先企業を選択してください');
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase.from('sns_account_assignments').insert({
        sns_account_id: assignAccount.id,
        assigned_org_id: assignOrgId,
        allocation_id: assignAllocationId && assignAllocationId !== 'none' ? assignAllocationId : null,
        assigned_staff_name: assignStaffName && assignStaffName !== 'none' ? assignStaffName : null,
        assigned_by_org_id: userOrgId,
        notes: assignNotes || null,
      });
      if (error) throw error;
      toast.success('割り振りを設定しました');
      setShowAssignDialog(false);
      fetchData();
    } catch (e: any) {
      toast.error('割り振りに失敗しました', { description: e.message });
    } finally {
      setSaving(false);
    }
  };

  // Edit assignment (only assignments made by my org or to descendant orgs)
  const openEditAssignment = (assignment: AssignmentWithDetails) => {
    setEditAssignment(assignment);
    setEditOrgId(assignment.assigned_org_id);
    setEditAllocationId(assignment.allocation_id || '');
    setEditStaffName(assignment.assigned_staff_name || '');
    setEditNotes(assignment.notes || '');
    setShowEditDialog(true);
  };

  const handleEditAssignment = async () => {
    if (!editAssignment || !userOrgId) return;
    setSaving(true);
    try {
      const { error } = await supabase.from('sns_account_assignments').update({
        assigned_org_id: editOrgId || editAssignment.assigned_org_id,
        allocation_id: editAllocationId && editAllocationId !== 'none' ? editAllocationId : null,
        assigned_staff_name: editStaffName && editStaffName !== 'none' ? editStaffName : null,
        notes: editNotes || null,
        updated_at: new Date().toISOString(),
      }).eq('id', editAssignment.id);
      if (error) throw error;
      toast.success('割り振りを更新しました');
      setShowEditDialog(false);
      fetchData();
    } catch (e: any) {
      toast.error('更新に失敗しました', { description: e.message });
    } finally {
      setSaving(false);
    }
  };

  // Check if current org can edit an assignment
  // Can edit if: assigned_by_org_id === myOrgId, OR assigned_org_id is a descendant
  const canEditAssignment = useCallback((assignment: AssignmentWithDetails) => {
    if (!userOrgId) return false;
    if (assignment.assigned_by_org_id === userOrgId) return true;
    const descendantIds = descendantOrgs.map(o => o.id);
    return descendantIds.includes(assignment.assigned_org_id);
  }, [userOrgId, descendantOrgs]);

  const handleDeleteAssignment = async (assignmentId: string) => {
    if (!confirm('この割り振りを解除しますか？')) return;
    try {
      const { error } = await supabase.from('sns_account_assignments').delete().eq('id', assignmentId);
      if (error) throw error;
      toast.success('割り振りを解除しました');
      fetchData();
    } catch (e: any) {
      toast.error('解除に失敗しました', { description: e.message });
    }
  };

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

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  const hasDescendants = descendantOrgs.length > 0;

  return (
    <div>
      <PageHeader
        title="SNSアカウント"
        description="割り振られたSNSアカウントの確認と下位企業への割り振り管理"
      />

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
        <Card className="border shadow-sm">
          <CardContent className="p-4">
            <div className="text-sm text-muted-foreground">自社のアカウント数</div>
            <div className="text-2xl font-bold">{myAccountGroups.length}</div>
          </CardContent>
        </Card>
        {hasDescendants && (
          <>
            <Card className="border shadow-sm">
              <CardContent className="p-4">
                <div className="text-sm text-muted-foreground">下位企業への割り振り</div>
                <div className="text-2xl font-bold text-blue-600">{descendantAssignments.length}</div>
              </CardContent>
            </Card>
            <Card className="border shadow-sm">
              <CardContent className="p-4">
                <div className="text-sm text-muted-foreground">下位企業数</div>
                <div className="text-2xl font-bold text-purple-600">{descendantOrgs.length}</div>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      <Tabs defaultValue="my-accounts">
        <TabsList className="mb-4">
          <TabsTrigger value="my-accounts">自社のアカウント（{myAccountGroups.length}）</TabsTrigger>
          {hasDescendants && <TabsTrigger value="descendant-assignments">下位企業の割り振り（{descendantAssignments.length}）</TabsTrigger>}
        </TabsList>

        {/* My Accounts Tab */}
        <TabsContent value="my-accounts">
          {/* Search */}
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
          </div>

          <Card className="border shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold">
                割り振られたアカウント一覧（{filteredAccountGroups.length}件）
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
                      <TableHead>案件</TableHead>
                      <TableHead>担当者</TableHead>
                      <TableHead>備考</TableHead>
                      {hasDescendants && <TableHead className="text-right">操作</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredAccountGroups.map(({ account, assignments }) => (
                      assignments.map((assignment, idx) => (
                        <TableRow key={assignment.id} className={idx > 0 ? 'border-t-0 bg-muted/20' : ''}>
                          {idx === 0 && (
                            <>
                              <TableCell rowSpan={assignments.length} className="align-top">
                                <div className="flex items-center gap-1">
                                  <Facebook className="w-4 h-4 text-blue-600" />
                                  <span className="text-xs capitalize">{account.platform}</span>
                                </div>
                              </TableCell>
                              <TableCell rowSpan={assignments.length} className="align-top">
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
                              <TableCell rowSpan={assignments.length} className="align-top">
                                <PasswordCell value={account.gmail_password} id={`gp-${account.id}`} />
                              </TableCell>
                              <TableCell rowSpan={assignments.length} className="align-top font-medium text-sm">
                                {account.account_name}
                              </TableCell>
                              <TableCell rowSpan={assignments.length} className="align-top">
                                <PasswordCell value={account.login_password} id={`pw-${account.id}`} />
                              </TableCell>
                              <TableCell rowSpan={assignments.length} className="align-top">
                                <PasswordCell value={account.chat_password} id={`cp-${account.id}`} />
                              </TableCell>
                            </>
                          )}
                          <TableCell>
                            {assignment.allocation?.project ? (
                              <Badge variant="outline" className="text-xs">
                                {(assignment.allocation.project as any).project_number ? `[${(assignment.allocation.project as any).project_number}] ` : ''}{(assignment.allocation.project as any).title}
                              </Badge>
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {assignment.assigned_staff_name ? (
                              <span className="text-sm">{assignment.assigned_staff_name}</span>
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <span className="text-xs text-muted-foreground truncate max-w-[100px] block">
                              {assignment.notes || '—'}
                            </span>
                          </TableCell>
                          {hasDescendants && (
                            <TableCell className="text-right">
                              <Button
                                variant="outline"
                                size="sm"
                                className="text-xs"
                                onClick={() => openAssign(account)}
                              >
                                <Share2 className="w-3 h-3 mr-1" />
                                割り振り
                              </Button>
                            </TableCell>
                          )}
                        </TableRow>
                      ))
                    ))}
                    {filteredAccountGroups.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={hasDescendants ? 10 : 9} className="text-center text-muted-foreground py-12">
                          {myAccountGroups.length === 0
                            ? 'まだSNSアカウントが割り振られていません'
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

        {/* Descendant Assignments Tab */}
        {hasDescendants && (
          <TabsContent value="descendant-assignments">
            <Card className="border shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-semibold">
                  下位企業への割り振り一覧（{descendantAssignments.length}件）
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
                        <TableHead>担当者</TableHead>
                        <TableHead>割り振り元</TableHead>
                        <TableHead>備考</TableHead>
                        <TableHead className="text-right">操作</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {descendantAssignments.map((assignment) => {
                        const editable = canEditAssignment(assignment);
                        return (
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
                                  {(assignment.allocation.project as any).project_number ? `[${(assignment.allocation.project as any).project_number}] ` : ''}{(assignment.allocation.project as any).title}
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
                            <TableCell className="text-right">
                              {editable && (
                                <div className="flex items-center justify-end gap-1">
                                  <Button variant="ghost" size="sm" onClick={() => openEditAssignment(assignment)} title="編集">
                                    <Pencil className="w-3.5 h-3.5" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleDeleteAssignment(assignment.id)}
                                    title="割り振り解除"
                                    className="text-destructive hover:text-destructive"
                                  >
                                    <Share2 className="w-3.5 h-3.5" />
                                  </Button>
                                </div>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                      {descendantAssignments.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={8} className="text-center text-muted-foreground py-12">
                            下位企業への割り振りはまだありません
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>

      {/* Assign Dialog */}
      <Dialog open={showAssignDialog} onOpenChange={setShowAssignDialog}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>アカウントを割り振り</DialogTitle>
            <DialogDescription>
              「{assignAccount?.account_name}」を下位企業に割り振ります
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
                    // Build hierarchical descendant list
                    const result: { id: string; name: string; depth: number; parentName?: string }[] = [];
                    const addChildren = (parentId: string, depth: number) => {
                      const children = descendantOrgs.filter(o => o.parent_org_id === parentId);
                      for (const child of children) {
                        const parent = descendantOrgs.find(o => o.id === parentId) || (parentId === userOrgId ? { name: '自社' } : null);
                        result.push({ id: child.id, name: child.name, depth, parentName: parent?.name });
                        addChildren(child.id, depth + 1);
                      }
                    };
                    addChildren(userOrgId!, 0);
                    return result.map(o => (
                      <SelectItem key={o.id} value={o.id}>
                        {'\u00A0\u00A0'.repeat(o.depth)}{o.depth > 0 ? '└ ' : ''}{o.name}
                        {o.parentName ? ` (${o.parentName})` : ''}
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
                      <SelectItem key={staff.id} value={staff.name}>{staff.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {assignOrgId && staffForAssignOrg.length === 0 && (
              <div className="space-y-2">
                <Label>営業担当者（任意）</Label>
                <Input
                  placeholder="担当者名を入力（任意）"
                  value={assignStaffName}
                  onChange={(e) => setAssignStaffName(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">この企業には営業担当者が登録されていません</p>
              </div>
            )}
            <div className="space-y-2">
              <Label>案件（任意）</Label>
              <Select value={assignAllocationId || 'none'} onValueChange={(v) => setAssignAllocationId(v === 'none' ? '' : v)}>
                <SelectTrigger>
                  <SelectValue placeholder="案件を選択（任意）" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">指定なし</SelectItem>
                  {(() => {
                    const seenProjectIds = new Set<string>();
                    return allocations
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

      {/* Edit Assignment Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>割り振り編集</DialogTitle>
            <DialogDescription>
              「{editAssignment?.sns_account?.account_name}」の割り振り情報を編集します
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>割り振り先企業</Label>
              <Select value={editOrgId} onValueChange={(v) => {
                setEditOrgId(v);
                setEditStaffName('');
              }}>
                <SelectTrigger>
                  <SelectValue placeholder="企業を選択" />
                </SelectTrigger>
                <SelectContent>
                  {(() => {
                    const result: { id: string; name: string; depth: number; parentName?: string }[] = [];
                    const addChildren = (parentId: string, depth: number) => {
                      const children = descendantOrgs.filter(o => o.parent_org_id === parentId);
                      for (const child of children) {
                        const parent = descendantOrgs.find(o => o.id === parentId) || (parentId === userOrgId ? { name: '自社' } : null);
                        result.push({ id: child.id, name: child.name, depth, parentName: parent?.name });
                        addChildren(child.id, depth + 1);
                      }
                    };
                    addChildren(userOrgId!, 0);
                    return result.map(o => (
                      <SelectItem key={o.id} value={o.id}>
                        {'\u00A0\u00A0'.repeat(o.depth)}{o.depth > 0 ? '└ ' : ''}{o.name}
                        {o.parentName ? ` (${o.parentName})` : ''}
                      </SelectItem>
                    ));
                  })()}
                </SelectContent>
              </Select>
            </div>
            {editOrgId && staffForEditOrg.length > 0 && (
              <div className="space-y-2">
                <Label>営業担当者（任意）</Label>
                <Select value={editStaffName || 'none'} onValueChange={(v) => setEditStaffName(v === 'none' ? '' : v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="担当者を選択（任意）" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">指定なし</SelectItem>
                    {staffForEditOrg.map(staff => (
                      <SelectItem key={staff.id} value={staff.name}>{staff.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {editOrgId && staffForEditOrg.length === 0 && (
              <div className="space-y-2">
                <Label>営業担当者（任意）</Label>
                <Input
                  placeholder="担当者名を入力（任意）"
                  value={editStaffName}
                  onChange={(e) => setEditStaffName(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">この企業には営業担当者が登録されていません</p>
              </div>
            )}
            <div className="space-y-2">
              <Label>案件（任意）</Label>
              <Select value={editAllocationId || 'none'} onValueChange={(v) => setEditAllocationId(v === 'none' ? '' : v)}>
                <SelectTrigger>
                  <SelectValue placeholder="案件を選択（任意）" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">指定なし</SelectItem>
                  {(() => {
                    const seenProjectIds = new Set<string>();
                    return allocations
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
                value={editNotes}
                onChange={(e) => setEditNotes(e.target.value)}
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditDialog(false)}>キャンセル</Button>
            <Button onClick={handleEditAssignment} disabled={saving}>
              {saving ? '更新中...' : '更新'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
