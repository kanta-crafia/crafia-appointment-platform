import { useEffect, useState, useCallback, useMemo } from 'react';
import { supabase, type Allocation, type Organization, type Project } from '@/lib/supabase';
import { PageHeader } from '@/components/PageHeader';
import { StatusBadge } from '@/components/StatusBadge';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus, Pencil, Trash2, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import { toast } from 'sonner';

type SortField = 'project' | 'parent_org' | 'child_org' | 'created_at';
type SortDir = 'asc' | 'desc';

export default function Allocations() {
  const [allocations, setAllocations] = useState<Allocation[]>([]);
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDialog, setShowDialog] = useState(false);
  const [editAlloc, setEditAlloc] = useState<Allocation | null>(null);
  const [saving, setSaving] = useState(false);

  // Sort state
  const [sortField, setSortField] = useState<SortField>('created_at');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  // Delete state
  const [deleteTarget, setDeleteTarget] = useState<Allocation | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Form
  const [projectId, setProjectId] = useState('');
  const [parentOrgId, setParentOrgId] = useState('');
  const [childOrgId, setChildOrgId] = useState('');
  const [payout, setPayout] = useState(0);
  const [status, setStatus] = useState<'active' | 'inactive'>('active');

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [allocRes, orgRes, projRes] = await Promise.all([
        supabase.from('allocations').select('*, project:projects(*), parent_org:organizations!allocations_parent_org_id_fkey(name), child_org:organizations!allocations_child_org_id_fkey(name)').order('created_at', { ascending: false }),
        supabase.from('organizations').select('*').eq('status', 'active').order('name'),
        supabase.from('projects').select('*').eq('status', 'active').order('project_number', { ascending: true }),
      ]);
      setAllocations(allocRes.data || []);
      setOrgs(orgRes.data || []);
      setProjects(projRes.data || []);
    } catch (e) {
      console.error('Allocations fetch error:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Sorted allocations
  const sortedAllocations = useMemo(() => {
    const sorted = [...allocations];
    sorted.sort((a, b) => {
      let valA = '';
      let valB = '';

      switch (sortField) {
        case 'project': {
          const projA = (a as any).project;
          const projB = (b as any).project;
          valA = projA?.project_number || projA?.title || '';
          valB = projB?.project_number || projB?.title || '';
          break;
        }
        case 'parent_org':
          valA = (a as any).parent_org?.name || '';
          valB = (b as any).parent_org?.name || '';
          break;
        case 'child_org':
          valA = (a as any).child_org?.name || '';
          valB = (b as any).child_org?.name || '';
          break;
        case 'created_at':
          valA = a.created_at || '';
          valB = b.created_at || '';
          break;
      }

      const cmp = valA.localeCompare(valB, 'ja');
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return sorted;
  }, [allocations, sortField, sortDir]);

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <ArrowUpDown className="w-3.5 h-3.5 ml-1 text-muted-foreground/50" />;
    return sortDir === 'asc'
      ? <ArrowUp className="w-3.5 h-3.5 ml-1 text-primary" />
      : <ArrowDown className="w-3.5 h-3.5 ml-1 text-primary" />;
  };

  const openCreate = () => {
    setEditAlloc(null);
    setProjectId(''); setParentOrgId(''); setChildOrgId('');
    setPayout(0); setStatus('active');
    setShowDialog(true);
  };

  const openEdit = (a: Allocation) => {
    setEditAlloc(a);
    setProjectId(a.project_id);
    setParentOrgId(a.parent_org_id);
    setChildOrgId(a.child_org_id);
    setPayout(a.payout_per_appointment);
    setStatus(a.status);
    setShowDialog(true);
  };

  const handleSave = async () => {
    if (!projectId || !parentOrgId || !childOrgId) {
      toast.error('必須項目を選択してください');
      return;
    }
    setSaving(true);
    const payload = {
      project_id: projectId,
      parent_org_id: parentOrgId,
      child_org_id: childOrgId,
      payout_per_appointment: payout,
      status,
    };

    if (editAlloc) {
      const { error } = await supabase.from('allocations').update(payload).eq('id', editAlloc.id);
      if (error) toast.error('更新に失敗しました'); else toast.success('割り当てを更新しました');
    } else {
      const { error } = await supabase.from('allocations').insert(payload);
      if (error) toast.error('作成に失敗しました', { description: error.message }); else toast.success('割り当てを作成しました');
    }
    setSaving(false);
    setShowDialog(false);
    fetchData();
  };

  const openDelete = (a: Allocation) => {
    setDeleteTarget(a);
    setShowDeleteDialog(true);
  };

  const handleDelete = async (e: React.MouseEvent) => {
    e.preventDefault();
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      // まず関連するアポイントがあるか確認
      const { data: relatedAppts } = await supabase
        .from('appointments')
        .select('id')
        .eq('allocation_id', deleteTarget.id)
        .limit(1);

      if (relatedAppts && relatedAppts.length > 0) {
        toast.error('この割り当てに関連するアポイントが存在するため削除できません。先にアポイントを削除してください。');
        setDeleting(false);
        setShowDeleteDialog(false);
        return;
      }

      const { error } = await supabase.from('allocations').delete().eq('id', deleteTarget.id);
      if (error) {
        toast.error('削除に失敗しました', { description: error.message });
      } else {
        toast.success('割り当てを削除しました');
        setShowDeleteDialog(false);
        fetchData();
      }
    } catch (e) {
      toast.error('削除中にエラーが発生しました');
    } finally {
      setDeleting(false);
    }
  };

  // Get project info for display
  const getProjectInfo = (a: Allocation) => {
    const proj = (a as any).project;
    return proj || null;
  };

  if (loading) {
    return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>;
  }

  return (
    <div>
      <PageHeader
        title="割り当て管理"
        description="案件をパートナー企業に割り当て、卸単価を設定。アポ上限は案件全体で管理されます。"
        action={<Button onClick={openCreate}><Plus className="w-4 h-4 mr-2" />割り当てを追加</Button>}
      />

      <Card className="border shadow-sm">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>
                  <button className="flex items-center hover:text-primary transition-colors" onClick={() => toggleSort('project')}>
                    案件 <SortIcon field="project" />
                  </button>
                </TableHead>
                <TableHead>
                  <button className="flex items-center hover:text-primary transition-colors" onClick={() => toggleSort('parent_org')}>
                    卸元（親企業）<SortIcon field="parent_org" />
                  </button>
                </TableHead>
                <TableHead>
                  <button className="flex items-center hover:text-primary transition-colors" onClick={() => toggleSort('child_org')}>
                    卸先（代理店）<SortIcon field="child_org" />
                  </button>
                </TableHead>
                <TableHead className="text-right">卸単価</TableHead>
                <TableHead className="text-center">案件上限</TableHead>
                <TableHead className="text-center">案件確定</TableHead>
                <TableHead className="text-center">案件残数</TableHead>
                <TableHead>ステータス</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedAllocations.map((a) => {
                const proj = getProjectInfo(a);
                const isUnlimited = proj?.is_unlimited;
                const maxTotal = proj?.max_appointments_total || 0;
                const confirmed = proj?.confirmed_count || 0;
                return (
                  <TableRow key={a.id}>
                    <TableCell className="font-medium">
                      {proj?.project_number ? `[${proj.project_number}] ` : ''}{proj?.title || '—'}
                    </TableCell>
                    <TableCell>{(a as any).parent_org?.name || '—'}</TableCell>
                    <TableCell>{(a as any).child_org?.name || '—'}</TableCell>
                    <TableCell className="text-right font-mono">¥{Number(a.payout_per_appointment).toLocaleString()}</TableCell>
                    <TableCell className="text-center">{isUnlimited ? '無制限' : maxTotal}</TableCell>
                    <TableCell className="text-center font-semibold text-emerald-700">{confirmed}</TableCell>
                    <TableCell className="text-center">{isUnlimited ? '—' : maxTotal - confirmed}</TableCell>
                    <TableCell><StatusBadge status={a.status} /></TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="sm" onClick={() => openEdit(a)}>
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => openDelete(a)}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
              {allocations.length === 0 && (
                <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground py-8">割り当てがまだありません</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Create/Edit Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editAlloc ? '割り当てを編集' : '割り当てを追加'}</DialogTitle>
            <DialogDescription>{editAlloc ? '割り当て情報を変更します' : '案件をパートナー企業に割り当てます'}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>案件 <span className="text-destructive">*</span></Label>
              <Select value={projectId} onValueChange={setProjectId}>
                <SelectTrigger><SelectValue placeholder="案件を選択" /></SelectTrigger>
                <SelectContent>
                  {projects
                    .sort((a, b) => {
                      const numA = parseInt(a.project_number || '999', 10);
                      const numB = parseInt(b.project_number || '999', 10);
                      return numA - numB;
                    })
                    .map(p => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.project_number ? `[${p.project_number}] ` : ''}{p.title}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>卸元（親企業）<span className="text-destructive">*</span></Label>
                <Select value={parentOrgId} onValueChange={setParentOrgId}>
                  <SelectTrigger><SelectValue placeholder="選択" /></SelectTrigger>
                  <SelectContent>
                    {orgs.map(o => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>卸先（代理店）<span className="text-destructive">*</span></Label>
                <Select value={childOrgId} onValueChange={setChildOrgId}>
                  <SelectTrigger><SelectValue placeholder="選択" /></SelectTrigger>
                  <SelectContent>
                    {orgs.filter(o => o.id !== parentOrgId).map(o => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>卸単価（円/アポ）</Label>
                <Input type="number" min={0} value={payout} onChange={(e) => setPayout(Number(e.target.value))} placeholder="15000" />
              </div>
              <div className="space-y-2">
                <Label>ステータス</Label>
                <Select value={status} onValueChange={(v) => setStatus(v as 'active' | 'inactive')}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">有効</SelectItem>
                    <SelectItem value="inactive">無効</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              アポイント上限は案件全体で管理されます。代理店ごとの個別上限はありません。
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>キャンセル</Button>
            <Button onClick={handleSave} disabled={saving || !projectId || !parentOrgId || !childOrgId}>
              {saving ? '保存中...' : '保存'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>割り当てを削除しますか？</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget && (
                <>
                  <span className="font-medium">{(deleteTarget as any).project?.title || '案件'}</span>
                  {' → '}
                  <span className="font-medium">{(deleteTarget as any).child_org?.name || '代理店'}</span>
                  {' の割り当てを削除します。この操作は取り消せません。'}
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>キャンセル</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? '削除中...' : '削除する'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
