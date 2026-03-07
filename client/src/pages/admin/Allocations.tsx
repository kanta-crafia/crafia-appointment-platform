import { useEffect, useState, useCallback } from 'react';
import { supabase, type Allocation, type Organization, type Project } from '@/lib/supabase';
import { PageHeader } from '@/components/PageHeader';
import { StatusBadge } from '@/components/StatusBadge';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus, Pencil } from 'lucide-react';
import { toast } from 'sonner';

export default function Allocations() {
  const [allocations, setAllocations] = useState<Allocation[]>([]);
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDialog, setShowDialog] = useState(false);
  const [editAlloc, setEditAlloc] = useState<Allocation | null>(null);
  const [saving, setSaving] = useState(false);

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
        supabase.from('projects').select('*').eq('status', 'active').order('title'),
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
                <TableHead>案件</TableHead>
                <TableHead>卸元（親企業）</TableHead>
                <TableHead>卸先（代理店）</TableHead>
                <TableHead className="text-right">卸単価</TableHead>
                <TableHead className="text-center">案件上限</TableHead>
                <TableHead className="text-center">案件確定</TableHead>
                <TableHead className="text-center">案件残数</TableHead>
                <TableHead>ステータス</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {allocations.map((a) => {
                const proj = getProjectInfo(a);
                const isUnlimited = proj?.is_unlimited;
                const maxTotal = proj?.max_appointments_total || 0;
                const confirmed = proj?.confirmed_count || 0;
                return (
                  <TableRow key={a.id}>
                    <TableCell className="font-medium">{proj?.title || '—'}</TableCell>
                    <TableCell>{(a as any).parent_org?.name || '—'}</TableCell>
                    <TableCell>{(a as any).child_org?.name || '—'}</TableCell>
                    <TableCell className="text-right font-mono">¥{Number(a.payout_per_appointment).toLocaleString()}</TableCell>
                    <TableCell className="text-center">{isUnlimited ? '無制限' : maxTotal}</TableCell>
                    <TableCell className="text-center font-semibold text-emerald-700">{confirmed}</TableCell>
                    <TableCell className="text-center">{isUnlimited ? '—' : maxTotal - confirmed}</TableCell>
                    <TableCell><StatusBadge status={a.status} /></TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" onClick={() => openEdit(a)}>
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
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
                  {projects.map(p => (
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
    </div>
  );
}
