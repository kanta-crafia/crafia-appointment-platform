import { useEffect, useState, useCallback } from 'react';
import { supabase, type Project, type Priority } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { PageHeader } from '@/components/PageHeader';
import { StatusBadge } from '@/components/StatusBadge';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus, Pencil, ArrowUp, ArrowRight, ArrowDown, ExternalLink, Infinity } from 'lucide-react';
import { toast } from 'sonner';

const priorityConfig = {
  high: { label: '高', icon: ArrowUp, className: 'text-red-600 bg-red-50' },
  normal: { label: '中', icon: ArrowRight, className: 'text-amber-600 bg-amber-50' },
  low: { label: '低', icon: ArrowDown, className: 'text-blue-600 bg-blue-50' },
};

export default function Projects() {
  const { user } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDialog, setShowDialog] = useState(false);
  const [editProject, setEditProject] = useState<Project | null>(null);
  const [saving, setSaving] = useState(false);

  // Form states
  const [projectNumber, setProjectNumber] = useState('');
  const [title, setTitle] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [serviceName, setServiceName] = useState('');
  const [serviceOverview, setServiceOverview] = useState('');
  const [projectDetail, setProjectDetail] = useState('');
  const [acquisitionConditions, setAcquisitionConditions] = useState('');
  const [unitPrice, setUnitPrice] = useState(0);
  const [schedulingUrl, setSchedulingUrl] = useState('');
  const [isUnlimited, setIsUnlimited] = useState(false);
  const [maxAppts, setMaxAppts] = useState(0);
  const [priority, setPriority] = useState<Priority>('normal');
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
    setProjectNumber(''); setTitle(''); setCompanyName(''); setServiceName('');
    setServiceOverview(''); setProjectDetail(''); setAcquisitionConditions('');
    setUnitPrice(0); setSchedulingUrl(''); setIsUnlimited(false); setMaxAppts(0);
    setPriority('normal'); setStatus('active');
    setShowDialog(true);
  };

  const openEdit = (p: Project) => {
    setEditProject(p);
    setProjectNumber(p.project_number || '');
    setTitle(p.title);
    setCompanyName(p.company_name || '');
    setServiceName(p.service_name || '');
    setServiceOverview(p.service_overview || '');
    setProjectDetail(p.project_detail || '');
    setAcquisitionConditions(p.acquisition_conditions || '');
    setUnitPrice(p.unit_price || 0);
    setSchedulingUrl(p.scheduling_url || '');
    setIsUnlimited(p.is_unlimited || false);
    setMaxAppts(p.max_appointments_total);
    setPriority(p.priority || 'normal');
    setStatus(p.status);
    setShowDialog(true);
  };

  const handleSave = async () => {
    if (!title) { toast.error('案件名を入力してください'); return; }
    setSaving(true);
    const payload = {
      title,
      project_number: projectNumber || null,
      company_name: companyName || null,
      service_name: serviceName || null,
      service_overview: serviceOverview || null,
      project_detail: projectDetail || null,
      acquisition_conditions: acquisitionConditions || null,
      unit_price: unitPrice,
      scheduling_url: schedulingUrl || null,
      is_unlimited: isUnlimited,
      max_appointments_total: isUnlimited ? 0 : maxAppts,
      priority,
      status,
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

  const getRemainingCount = (p: Project) => {
    if (p.is_unlimited) return '—';
    return p.max_appointments_total - p.confirmed_count;
  };

  const getMaxDisplay = (p: Project) => {
    if (p.is_unlimited) return <span className="inline-flex items-center gap-1 text-muted-foreground"><Infinity className="w-4 h-4" />無制限</span>;
    return p.max_appointments_total;
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
                <TableHead className="w-20">案件番号</TableHead>
                <TableHead>案件名</TableHead>
                <TableHead>企業名</TableHead>
                <TableHead>サービス</TableHead>
                <TableHead className="text-right">単価</TableHead>
                <TableHead className="text-center">月次上限</TableHead>
                <TableHead className="text-center">確定数</TableHead>
                <TableHead className="text-center">残数</TableHead>
                <TableHead className="text-center">優先度</TableHead>
                <TableHead>ステータス</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {projects.map((p) => {
                const pri = priorityConfig[p.priority || 'normal'];
                const PriIcon = pri.icon;
                return (
                  <TableRow key={p.id}>
                    <TableCell className="text-sm text-muted-foreground font-mono">{p.project_number || '—'}</TableCell>
                    <TableCell className="font-medium">{p.title}</TableCell>
                    <TableCell className="text-sm">{p.company_name || '—'}</TableCell>
                    <TableCell className="text-sm">{p.service_name || '—'}</TableCell>
                    <TableCell className="text-right font-mono">{p.unit_price ? `¥${p.unit_price.toLocaleString()}` : '—'}</TableCell>
                    <TableCell className="text-center">{getMaxDisplay(p)}</TableCell>
                    <TableCell className="text-center font-semibold text-emerald-700">{p.confirmed_count}</TableCell>
                    <TableCell className="text-center">{getRemainingCount(p)}</TableCell>
                    <TableCell className="text-center">
                      <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded ${pri.className}`}>
                        <PriIcon className="w-3 h-3" />{pri.label}
                      </span>
                    </TableCell>
                    <TableCell><StatusBadge status={p.status} /></TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" onClick={() => openEdit(p)}>
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
              {projects.length === 0 && (
                <TableRow><TableCell colSpan={11} className="text-center text-muted-foreground py-8">案件がまだありません</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* === Create / Edit Dialog === */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editProject ? '案件を編集' : '案件を作成'}</DialogTitle>
            <DialogDescription>{editProject ? '案件情報を変更します' : '新しい案件を登録します'}</DialogDescription>
          </DialogHeader>
          <div className="space-y-5 py-2">
            {/* Row 1: 案件番号 + 案件名 */}
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>案件番号</Label>
                <Input value={projectNumber} onChange={(e) => setProjectNumber(e.target.value)} placeholder="PRJ-001" />
              </div>
              <div className="col-span-2 space-y-2">
                <Label>案件名 <span className="text-destructive">*</span></Label>
                <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="〇〇サービス営業案件" />
              </div>
            </div>

            {/* Row 2: 企業名 + サービス */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>企業名</Label>
                <Input value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="株式会社〇〇" />
              </div>
              <div className="space-y-2">
                <Label>サービス</Label>
                <Input value={serviceName} onChange={(e) => setServiceName(e.target.value)} placeholder="〇〇サービス" />
              </div>
            </div>

            {/* サービス概要 */}
            <div className="space-y-2">
              <Label>サービス概要</Label>
              <Textarea value={serviceOverview} onChange={(e) => setServiceOverview(e.target.value)} placeholder="サービスの概要を記載" rows={2} />
            </div>

            {/* 案件詳細 */}
            <div className="space-y-2">
              <Label>案件詳細</Label>
              <Textarea value={projectDetail} onChange={(e) => setProjectDetail(e.target.value)} placeholder="案件の詳細な説明" rows={3} />
            </div>

            {/* 獲得条件 */}
            <div className="space-y-2">
              <Label>獲得条件</Label>
              <Textarea value={acquisitionConditions} onChange={(e) => setAcquisitionConditions(e.target.value)} placeholder="アポイント獲得の条件を記載" rows={3} />
            </div>

            {/* Row: 案件単価 + 日程調整URL */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>案件単価（円）</Label>
                <Input type="number" min={0} value={unitPrice} onChange={(e) => setUnitPrice(Number(e.target.value))} placeholder="15000" />
              </div>
              <div className="space-y-2">
                <Label className="flex items-center gap-1">日程調整URL <ExternalLink className="w-3 h-3" /></Label>
                <Input value={schedulingUrl} onChange={(e) => setSchedulingUrl(e.target.value)} placeholder="https://calendly.com/..." />
              </div>
            </div>

            {/* Row: 月次上限 + 無限トグル */}
            <div className="space-y-3">
              <Label>アポイント上限（月単位）</Label>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <Switch checked={isUnlimited} onCheckedChange={setIsUnlimited} />
                  <span className="text-sm text-muted-foreground">無制限</span>
                </div>
                {!isUnlimited && (
                  <Input
                    type="number"
                    min={0}
                    value={maxAppts}
                    onChange={(e) => setMaxAppts(Number(e.target.value))}
                    className="w-32"
                    placeholder="10"
                  />
                )}
              </div>
            </div>

            {/* Row: 優先順位 + ステータス */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>案件優先順位</Label>
                <Select value={priority} onValueChange={(v) => setPriority(v as Priority)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="high">高</SelectItem>
                    <SelectItem value="normal">中</SelectItem>
                    <SelectItem value="low">低</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>ステータス</Label>
                <Select value={status} onValueChange={(v) => setStatus(v as 'active' | 'inactive' | 'closed')}>
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
