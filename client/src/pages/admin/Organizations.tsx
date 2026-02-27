import { useEffect, useState, useCallback } from 'react';
import { supabase, type Organization } from '@/lib/supabase';
import { PageHeader } from '@/components/PageHeader';
import { StatusBadge } from '@/components/StatusBadge';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus, Pencil, UserPlus } from 'lucide-react';
import { toast } from 'sonner';

export default function Organizations() {
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [showInvite, setShowInvite] = useState(false);
  const [editOrg, setEditOrg] = useState<Organization | null>(null);
  const [inviteOrgId, setInviteOrgId] = useState('');

  // Form states
  const [formName, setFormName] = useState('');
  const [formParent, setFormParent] = useState('none');
  const [formStatus, setFormStatus] = useState<'active' | 'inactive'>('active');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteFullName, setInviteFullName] = useState('');
  const [inviteRole, setInviteRole] = useState<'partner' | 'sub_partner'>('partner');
  const [invitePassword, setInvitePassword] = useState('');
  const [saving, setSaving] = useState(false);

  const fetchOrgs = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from('organizations').select('*').order('created_at');
    setOrgs(data || []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchOrgs(); }, [fetchOrgs]);

  const getParentName = (parentId: string | null) => {
    if (!parentId) return '—';
    return orgs.find(o => o.id === parentId)?.name || '不明';
  };

  const handleSave = async () => {
    setSaving(true);
    if (editOrg) {
      const { error } = await supabase.from('organizations').update({
        name: formName,
        parent_org_id: formParent === 'none' ? null : formParent,
        status: formStatus,
      }).eq('id', editOrg.id);
      if (error) { toast.error('更新に失敗しました'); } else { toast.success('企業を更新しました'); }
    } else {
      const { error } = await supabase.from('organizations').insert({
        name: formName,
        parent_org_id: formParent === 'none' ? null : formParent,
        status: formStatus,
      });
      if (error) { toast.error('作成に失敗しました'); } else { toast.success('企業を作成しました'); }
    }
    setSaving(false);
    setShowCreate(false);
    setEditOrg(null);
    fetchOrgs();
  };

  const handleInvite = async () => {
    if (!inviteEmail || !invitePassword || !inviteOrgId) {
      toast.error('必須項目を入力してください');
      return;
    }
    setSaving(true);
    const { error } = await supabase.auth.signUp({
      email: inviteEmail,
      password: invitePassword,
      options: {
        data: {
          org_id: inviteOrgId,
          full_name: inviteFullName,
          role: inviteRole,
        },
      },
    });
    setSaving(false);
    if (error) {
      toast.error('招待に失敗しました', { description: error.message });
    } else {
      toast.success('ユーザーを作成しました');
      setShowInvite(false);
      setInviteEmail('');
      setInviteFullName('');
      setInvitePassword('');
    }
  };

  const openCreate = () => {
    setEditOrg(null);
    setFormName('');
    setFormParent('none');
    setFormStatus('active');
    setShowCreate(true);
  };

  const openEdit = (org: Organization) => {
    setEditOrg(org);
    setFormName(org.name);
    setFormParent(org.parent_org_id || 'none');
    setFormStatus(org.status);
    setShowCreate(true);
  };

  const openInvite = (orgId: string) => {
    setInviteOrgId(orgId);
    setInviteEmail('');
    setInviteFullName('');
    setInvitePassword('');
    setInviteRole('partner');
    setShowInvite(true);
  };

  if (loading) {
    return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>;
  }

  return (
    <div>
      <PageHeader
        title="企業管理"
        description="パートナー企業の登録・親子関係の設定・ユーザー招待"
        action={<Button onClick={openCreate}><Plus className="w-4 h-4 mr-2" />企業を追加</Button>}
      />

      <Card className="border shadow-sm">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>企業名</TableHead>
                <TableHead>親企業</TableHead>
                <TableHead>ステータス</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orgs.map((org) => (
                <TableRow key={org.id}>
                  <TableCell className="font-medium">{org.name}</TableCell>
                  <TableCell className="text-muted-foreground">{getParentName(org.parent_org_id)}</TableCell>
                  <TableCell><StatusBadge status={org.status} /></TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button variant="ghost" size="sm" onClick={() => openEdit(org)}>
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => openInvite(org.id)}>
                        <UserPlus className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {orgs.length === 0 && (
                <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">企業がまだ登録されていません</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Create/Edit Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editOrg ? '企業を編集' : '企業を追加'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>企業名</Label>
              <Input value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="株式会社〇〇" />
            </div>
            <div className="space-y-2">
              <Label>親企業</Label>
              <Select value={formParent} onValueChange={setFormParent}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">なし（トップレベル）</SelectItem>
                  {orgs.filter(o => o.id !== editOrg?.id).map(o => (
                    <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>ステータス</Label>
              <Select value={formStatus} onValueChange={(v) => setFormStatus(v as 'active' | 'inactive')}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">有効</SelectItem>
                  <SelectItem value="inactive">無効</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>キャンセル</Button>
            <Button onClick={handleSave} disabled={saving || !formName}>{saving ? '保存中...' : '保存'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Invite Dialog */}
      <Dialog open={showInvite} onOpenChange={setShowInvite}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>ユーザーを招待</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>氏名</Label>
              <Input value={inviteFullName} onChange={(e) => setInviteFullName(e.target.value)} placeholder="山田 太郎" />
            </div>
            <div className="space-y-2">
              <Label>メールアドレス</Label>
              <Input type="email" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} placeholder="user@example.com" />
            </div>
            <div className="space-y-2">
              <Label>初期パスワード</Label>
              <Input type="text" value={invitePassword} onChange={(e) => setInvitePassword(e.target.value)} placeholder="8文字以上" />
            </div>
            <div className="space-y-2">
              <Label>ロール</Label>
              <Select value={inviteRole} onValueChange={(v) => setInviteRole(v as 'partner' | 'sub_partner')}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="partner">Partner</SelectItem>
                  <SelectItem value="sub_partner">SubPartner</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowInvite(false)}>キャンセル</Button>
            <Button onClick={handleInvite} disabled={saving}>{saving ? '作成中...' : '作成'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
