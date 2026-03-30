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
  Eye, EyeOff, Copy, Check, Facebook, Share2, Users, ChevronDown, ChevronRight, Pencil, Trash2
} from 'lucide-react';
import { toast } from 'sonner';

interface AssignmentWithDetails extends SnsAccountAssignment {
  sns_account?: SnsAccount;
  assigned_org?: Organization;
  allocation?: Allocation;
}

export default function PartnerSnsAccounts() {
  const { user } = useAuth();
  const userOrgId = user?.org_id;

  const [myAssignments, setMyAssignments] = useState<AssignmentWithDetails[]>([]);
  const [childAssignments, setChildAssignments] = useState<AssignmentWithDetails[]>([]);
  const [childOrgs, setChildOrgs] = useState<Organization[]>([]);
  const [allocations, setAllocations] = useState<Allocation[]>([]);
  const [salesStaff, setSalesStaff] = useState<SalesStaff[]>([]);
  const [loading, setLoading] = useState(true);

  // Assign dialog
  const [showAssignDialog, setShowAssignDialog] = useState(false);
  const [assignAccount, setAssignAccount] = useState<SnsAccount | null>(null);
  const [assignSourceAssignment, setAssignSourceAssignment] = useState<AssignmentWithDetails | null>(null);
  const [assignOrgId, setAssignOrgId] = useState('');
  const [assignAllocationId, setAssignAllocationId] = useState('');
  const [assignStaffName, setAssignStaffName] = useState('');
  const [assignNotes, setAssignNotes] = useState('');
  const [saving, setSaving] = useState(false);

  // Edit dialog
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editAssignment, setEditAssignment] = useState<AssignmentWithDetails | null>(null);
  const [editOrgId, setEditOrgId] = useState('');
  const [editAllocationId, setEditAllocationId] = useState('');
  const [editStaffName, setEditStaffName] = useState('');
  const [editNotes, setEditNotes] = useState('');

  // Password visibility
  const [visiblePasswords, setVisiblePasswords] = useState<Set<string>>(new Set());
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Expanded accounts
  const [expandedAccounts, setExpandedAccounts] = useState<Set<string>>(new Set());

  const fetchData = useCallback(async () => {
    if (!userOrgId) return;
    setLoading(true);
    try {
      // 1. Get assignments to my org (accounts assigned to me)
      const { data: myAssignData } = await supabase
        .from('sns_account_assignments')
        .select('*')
        .eq('assigned_org_id', userOrgId)
        .order('created_at', { ascending: false });

      // 2. Get the account details for my assignments
      const myAccountIds = Array.from(new Set((myAssignData || []).map(a => a.sns_account_id)));
      let accountsMap: Record<string, SnsAccount> = {};
      if (myAccountIds.length > 0) {
        const { data: accountsData } = await supabase
          .from('sns_accounts')
          .select('*')
          .in('id', myAccountIds);
        (accountsData || []).forEach(a => { accountsMap[a.id] = a; });
      }

      // 3. Get child organizations
      const { data: childOrgsData } = await supabase
        .from('organizations')
        .select('*')
        .eq('parent_org_id', userOrgId)
        .eq('status', 'active')
        .order('name');
      setChildOrgs(childOrgsData || []);

      // 4. Get assignments made by my org (to child orgs)
      const { data: childAssignData } = await supabase
        .from('sns_account_assignments')
        .select('*')
        .eq('assigned_by_org_id', userOrgId)
        .order('created_at', { ascending: false });

      // Get additional account IDs from child assignments
      const childAccountIds = Array.from(new Set((childAssignData || []).map(a => a.sns_account_id)));
      const allAccountIds = Array.from(new Set([...myAccountIds, ...childAccountIds]));
      if (allAccountIds.length > myAccountIds.length) {
        const { data: moreAccounts } = await supabase
          .from('sns_accounts')
          .select('*')
          .in('id', allAccountIds);
        (moreAccounts || []).forEach(a => { accountsMap[a.id] = a; });
      }

      // Get org details for child assignments
      const childOrgIds = Array.from(new Set((childAssignData || []).map(a => a.assigned_org_id)));
      let orgsMap: Record<string, Organization> = {};
      if (childOrgIds.length > 0) {
        const { data: orgsData } = await supabase
          .from('organizations')
          .select('*')
          .in('id', childOrgIds);
        (orgsData || []).forEach(o => { orgsMap[o.id] = o; });
      }

      // Get allocation details
      const allAllocIds = Array.from(new Set([
        ...(myAssignData || []).map(a => a.allocation_id).filter(Boolean),
        ...(childAssignData || []).map(a => a.allocation_id).filter(Boolean),
      ] as string[]));
      let allocMap: Record<string, Allocation> = {};
      if (allAllocIds.length > 0) {
        const { data: allocData } = await supabase
          .from('allocations')
          .select('*, project:projects(*)')
          .in('id', allAllocIds);
        (allocData || []).forEach(a => { allocMap[a.id] = a; });
      }

      // Build enriched assignments
      const enrichedMy = (myAssignData || []).map(a => ({
        ...a,
        sns_account: accountsMap[a.sns_account_id],
        allocation: a.allocation_id ? allocMap[a.allocation_id] : undefined,
      }));

      const enrichedChild = (childAssignData || []).map(a => ({
        ...a,
        sns_account: accountsMap[a.sns_account_id],
        assigned_org: orgsMap[a.assigned_org_id],
        allocation: a.allocation_id ? allocMap[a.allocation_id] : undefined,
      }));

      setMyAssignments(enrichedMy);
      setChildAssignments(enrichedChild);

      // 5. Get allocations for this org (for assignment dropdown)
      // Get direct allocations
      const { data: directAllocs } = await supabase
        .from('allocations')
        .select('*, project:projects(*)')
        .eq('child_org_id', userOrgId)
        .eq('status', 'active');
      
      // Also get inherited allocations via sub_allocation_prices
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

      // 6. Get sales staff for this org
      const { data: staffData } = await supabase
        .from('sales_staff')
        .select('*')
        .eq('org_id', userOrgId)
        .eq('status', 'active')
        .order('name');
      setSalesStaff(staffData || []);

    } catch (e) {
      console.error('Failed to fetch SNS data:', e);
      toast.error('データの取得に失敗しました');
    } finally {
      setLoading(false);
    }
  }, [userOrgId]);

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

  const toggleExpand = (accountId: string) => {
    setExpandedAccounts(prev => {
      const next = new Set(prev);
      if (next.has(accountId)) next.delete(accountId);
      else next.add(accountId);
      return next;
    });
  };

  // Group my assignments by account
  const accountGroups = useMemo(() => {
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

  // Open assign dialog
  const openAssign = (account: SnsAccount, sourceAssignment: AssignmentWithDetails) => {
    setAssignAccount(account);
    setAssignSourceAssignment(sourceAssignment);
    setAssignOrgId('');
    setAssignAllocationId(sourceAssignment.allocation_id || '');
    setAssignStaffName('');
    setAssignNotes('');
    setShowAssignDialog(true);
  };

  const handleAssign = async () => {
    if (!assignAccount || !userOrgId) return;
    if (!assignOrgId && !assignStaffName) {
      toast.error('割り振り先の企業または営業担当者を選択してください');
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase.from('sns_account_assignments').insert({
        sns_account_id: assignAccount.id,
        assigned_org_id: assignOrgId || userOrgId,
        allocation_id: assignAllocationId || null,
        assigned_staff_name: assignStaffName || null,
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

  // Edit assignment
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
        assigned_org_id: editOrgId || userOrgId,
        allocation_id: editAllocationId || null,
        assigned_staff_name: editStaffName || null,
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

  const handleDeleteAssignment = async (assignmentId: string) => {
    if (!confirm('この割り振りを削除しますか？')) return;
    try {
      const { error } = await supabase.from('sns_account_assignments').delete().eq('id', assignmentId);
      if (error) throw error;
      toast.success('割り振りを削除しました');
      fetchData();
    } catch (e: any) {
      toast.error('削除に失敗しました', { description: e.message });
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

  const hasChildOrgs = childOrgs.length > 0;

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
            <div className="text-sm text-muted-foreground">割り振りアカウント数</div>
            <div className="text-2xl font-bold">{accountGroups.length}</div>
          </CardContent>
        </Card>
        {hasChildOrgs && (
          <>
            <Card className="border shadow-sm">
              <CardContent className="p-4">
                <div className="text-sm text-muted-foreground">下位への割り振り数</div>
                <div className="text-2xl font-bold text-blue-600">{childAssignments.length}</div>
              </CardContent>
            </Card>
            <Card className="border shadow-sm">
              <CardContent className="p-4">
                <div className="text-sm text-muted-foreground">下位企業数</div>
                <div className="text-2xl font-bold text-purple-600">{childOrgs.length}</div>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      <Tabs defaultValue="my-accounts">
        <TabsList className="mb-4">
          <TabsTrigger value="my-accounts">自社のアカウント</TabsTrigger>
          {hasChildOrgs && <TabsTrigger value="child-assignments">下位企業への割り振り</TabsTrigger>}
        </TabsList>

        {/* My Accounts Tab */}
        <TabsContent value="my-accounts">
          <Card className="border shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold">
                割り振られたアカウント一覧（{accountGroups.length}件）
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-8"></TableHead>
                      <TableHead>PF</TableHead>
                      <TableHead>アカウント名</TableHead>
                      <TableHead>ログインID</TableHead>
                      <TableHead>PW</TableHead>
                      <TableHead>チャットPW</TableHead>
                      <TableHead>案件</TableHead>
                      <TableHead>担当者</TableHead>
                      {hasChildOrgs && <TableHead className="text-right">操作</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {accountGroups.map(({ account, assignments }) => (
                      assignments.map((assignment, idx) => (
                        <TableRow key={assignment.id} className={idx > 0 ? 'border-t-0 bg-muted/20' : ''}>
                          {idx === 0 && (
                            <TableCell rowSpan={assignments.length} className="align-top">
                              {hasChildOrgs && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-6 w-6 p-0"
                                  onClick={() => toggleExpand(account.id)}
                                >
                                  {expandedAccounts.has(account.id) ? (
                                    <ChevronDown className="w-4 h-4" />
                                  ) : (
                                    <ChevronRight className="w-4 h-4" />
                                  )}
                                </Button>
                              )}
                            </TableCell>
                          )}
                          {idx === 0 && (
                            <>
                              <TableCell rowSpan={assignments.length} className="align-top">
                                <div className="flex items-center gap-1">
                                  <Facebook className="w-4 h-4 text-blue-600" />
                                  <span className="text-xs capitalize">{account.platform}</span>
                                </div>
                              </TableCell>
                              <TableCell rowSpan={assignments.length} className="align-top font-medium text-sm">
                                {account.account_name}
                              </TableCell>
                              <TableCell rowSpan={assignments.length} className="align-top">
                                <code className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono">
                                  {account.login_id || account.account_name}
                                </code>
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
                                {(assignment.allocation.project as any).title}
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
                          {hasChildOrgs && (
                            <TableCell className="text-right">
                              <Button
                                variant="outline"
                                size="sm"
                                className="text-xs"
                                onClick={() => openAssign(account, assignment)}
                              >
                                <Share2 className="w-3 h-3 mr-1" />
                                割り振り
                              </Button>
                            </TableCell>
                          )}
                        </TableRow>
                      ))
                    ))}
                    {accountGroups.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={hasChildOrgs ? 8 : 7} className="text-center text-muted-foreground py-12">
                          まだSNSアカウントが割り振られていません
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Child Assignments Tab */}
        {hasChildOrgs && (
          <TabsContent value="child-assignments">
            <Card className="border shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-semibold">
                  下位企業への割り振り一覧（{childAssignments.length}件）
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
                        <TableHead>備考</TableHead>
                        <TableHead className="text-right">操作</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {childAssignments.map((assignment) => (
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
                            <span className="text-sm">{assignment.assigned_org?.name || '—'}</span>
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
                              <span className="text-sm">{assignment.assigned_staff_name}</span>
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <span className="text-xs text-muted-foreground truncate max-w-[120px] block">
                              {assignment.notes || '—'}
                            </span>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button variant="ghost" size="sm" onClick={() => openEditAssignment(assignment)} title="編集">
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
                      {childAssignments.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={7} className="text-center text-muted-foreground py-12">
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
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>アカウントを割り振り</DialogTitle>
            <DialogDescription>
              「{assignAccount?.account_name}」を下位企業・営業担当者に割り振ります
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>割り振り先企業</Label>
              <Select value={assignOrgId} onValueChange={setAssignOrgId}>
                <SelectTrigger>
                  <SelectValue placeholder="企業を選択" />
                </SelectTrigger>
                <SelectContent>
                  {childOrgs.map(org => (
                    <SelectItem key={org.id} value={org.id}>{org.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>案件（任意）</Label>
              <Select value={assignAllocationId} onValueChange={setAssignAllocationId}>
                <SelectTrigger>
                  <SelectValue placeholder="案件を選択（任意）" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">指定なし</SelectItem>
                  {allocations.map(alloc => (
                    <SelectItem key={alloc.id} value={alloc.id}>
                      {(alloc.project as any)?.title || alloc.id}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>営業担当者（任意）</Label>
              <Select value={assignStaffName} onValueChange={setAssignStaffName}>
                <SelectTrigger>
                  <SelectValue placeholder="担当者を選択（任意）" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">指定なし</SelectItem>
                  {salesStaff.map(staff => (
                    <SelectItem key={staff.id} value={staff.name}>{staff.name}</SelectItem>
                  ))}
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
                className="!field-sizing-normal resize-y"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAssignDialog(false)}>キャンセル</Button>
            <Button onClick={handleAssign} disabled={saving}>
              {saving ? '割り振り中...' : '割り振り'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Assignment Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>割り振り編集</DialogTitle>
            <DialogDescription>割り振り情報を編集します</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>割り振り先企業</Label>
              <Select value={editOrgId} onValueChange={setEditOrgId}>
                <SelectTrigger>
                  <SelectValue placeholder="企業を選択" />
                </SelectTrigger>
                <SelectContent>
                  {childOrgs.map(org => (
                    <SelectItem key={org.id} value={org.id}>{org.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>案件（任意）</Label>
              <Select value={editAllocationId} onValueChange={setEditAllocationId}>
                <SelectTrigger>
                  <SelectValue placeholder="案件を選択（任意）" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">指定なし</SelectItem>
                  {allocations.map(alloc => (
                    <SelectItem key={alloc.id} value={alloc.id}>
                      {(alloc.project as any)?.title || alloc.id}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>営業担当者（任意）</Label>
              <Select value={editStaffName} onValueChange={setEditStaffName}>
                <SelectTrigger>
                  <SelectValue placeholder="担当者を選択（任意）" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">指定なし</SelectItem>
                  {salesStaff.map(staff => (
                    <SelectItem key={staff.id} value={staff.name}>{staff.name}</SelectItem>
                  ))}
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
                className="!field-sizing-normal resize-y"
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
