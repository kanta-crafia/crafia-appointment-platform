import { useEffect, useState, useCallback } from 'react';
import { supabase, type Project } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { PageHeader } from '@/components/PageHeader';
import { StatusBadge } from '@/components/StatusBadge';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus, Pencil } from 'lucide-react';
import { toast } from 'sonner';

export default function Projects() {
  const { user } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDialog, setShowDialog] = useState(false);
  const [editProject, setEditProject] = useState<Project | null>(null);
  const [saving, setSaving] = useState(false);

  // Form
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [maxAppts, setMaxAppts] = useState(0);
  const [status, setStatus] = useState<'active' | 'inactive' | 'closed'>('active');

  const fetchProjects = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from('projects').select('*').order('created_at', { ascending: false });
    setProjects(data || []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchProjects(); }, [fetchProjects]);

  const openCreate = () => {
    setEditProject(null);
    setTitle(''); setDescription(''); setStartDate(''); setEndDate(''); setMaxAppts(0); setStatus('active');
    setShowDialog(true);
  };

  const openEdit = (p: Project) => {
    setEditProject(p);
    setTitle(p.title);
    setDescription(p.description || '');
    setStartDate(p.start_date || '');
    setEndDate(p.end_date || '');
    setMaxAppts(p.max_appointments_total);
    setStatus(p.status);
    setShowDialog(true);
  };

  const handleSave = async () => {
    if (!title) { toast.error('案件名を入力してください'); return; }
    setSaving(true);
    const payload = {
      title, description: description || null,
      start_date: startDate || null, end_date: endDate || null,
      max_appointments_total: maxAppts, status,
    };

    if (editProject) {
      const { error } = await supabase.from('projects').update(payload).eq('id', editProject.id);
      if (error) toast.error('更新に失敗しました'); else toast.success('案件を更新しました');
    } else {
      const { error } = await supabase.from('projects').insert({ ...payload, created_by: user?.id });
      if (error) toast.error('作成に失敗しました'); else toast.success('案件を作成しました');
    }
    setSaving(false);
    setShowDialog(false);
    fetchProjects();
  };

  if (loading) {
    return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>;
  }

  return (
    <div>
      <PageHeader
        title="案件管理"
        description="案件の作成・編集・ステータス管理"
        action={<Button onClick={openCreate}><Plus className="w-4 h-4 mr-2" />案件を作成</Button>}
      />

      <Card className="border shadow-sm">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>案件名</TableHead>
                <TableHead>期間</TableHead>
                <TableHead className="text-center">総上限</TableHead>
                <TableHead className="text-center">確定数</TableHead>
                <TableHead className="text-center">残数</TableHead>
                <TableHead>ステータス</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {projects.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">{p.title}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {p.start_date || '—'} ~ {p.end_date || '—'}
                  </TableCell>
                  <TableCell className="text-center">{p.max_appointments_total}</TableCell>
                  <TableCell className="text-center font-semibold text-emerald-700">{p.confirmed_count}</TableCell>
                  <TableCell className="text-center">{p.max_appointments_total - p.confirmed_count}</TableCell>
                  <TableCell><StatusBadge status={p.status} /></TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm" onClick={() => openEdit(p)}>
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {projects.length === 0 && (
                <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">案件がまだありません</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editProject ? '案件を編集' : '案件を作成'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>案件名 *</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="〇〇サービス営業案件" />
            </div>
            <div className="space-y-2">
              <Label>説明</Label>
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="案件の詳細、条件など" rows={3} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>開始日</Label>
                <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>終了日</Label>
                <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>総上限アポ数</Label>
                <Input type="number" min={0} value={maxAppts} onChange={(e) => setMaxAppts(Number(e.target.value))} />
              </div>
              <div className="space-y-2">
                <Label>ステータス</Label>
                <Select value={status} onValueChange={(v) => setStatus(v as any)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">有効</SelectItem>
                    <SelectItem value="inactive">無効</SelectItem>
                    <SelectItem value="closed">終了</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>キャンセル</Button>
            <Button onClick={handleSave} disabled={saving || !title}>{saving ? '保存中...' : '保存'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
