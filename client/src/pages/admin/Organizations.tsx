import { useEffect, useState, useCallback } from 'react';
import { supabase, type Organization, type User } from '@/lib/supabase';
import { PageHeader } from '@/components/PageHeader';
import { StatusBadge } from '@/components/StatusBadge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Plus, Pencil, UserPlus, Users, Building2, KeyRound, Eye, EyeOff, Copy, Check } from 'lucide-react';
import { toast } from 'sonner';

export default function Organizations() {
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [showInvite, setShowInvite] = useState(false);
  const [showResetPw, setShowResetPw] = useState(false);
  const [editOrg, setEditOrg] = useState<Organization | null>(null);
  const [inviteOrgId, setInviteOrgId] = useState('');
  const [resetPwUser, setResetPwUser] = useState<User | null>(null);

  // Form states
  const [formName, setFormName] = useState('');
  const [formParent, setFormParent] = useState('none');
  const [formStatus, setFormStatus] = useState<'active' | 'inactive'>('active');
  const [inviteLoginId, setInviteLoginId] = useState('');
  const [inviteFullName, setInviteFullName] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'partner' | 'sub_partner'>('partner');
  const [invitePassword, setInvitePassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const fetchOrgs = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from('organizations').select('*').order('created_at');
    setOrgs(data || []);
    setLoading(false);
  }, []);

  const fetchUsers = useCallback(async () => {
    const { data } = await supabase.from('users').select('*').order('created_at');
    setUsers(data || []);
  }, []);

  useEffect(() => { fetchOrgs(); fetchUsers(); }, [fetchOrgs, fetchUsers]);

  const getParentName = (parentId: string | null) => {
    if (!parentId) return '—';
    return orgs.find(o => o.id === parentId)?.name || '不明';
  };

  const getOrgName = (orgId: string) => {
    return orgs.find(o => o.id === orgId)?.name || '不明';
  };

  const getRoleLabel = (role: string) => {
    switch (role) {
      case 'admin': return 'Admin';
      case 'partner': return 'Partner';
      case 'sub_partner': return 'SubPartner';
      default: return role;
    }
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
    if (!inviteLoginId || !invitePassword || !inviteOrgId) {
      toast.error('ユーザーID、パスワード、所属企業は必須です');
      return;
    }
    if (invitePassword.length < 6) {
      toast.error('パスワードは6文字以上にしてください');
      return;
    }
    setSaving(true);

    // admin_create_user RPCを使用
    const { data, error } = await supabase.rpc('admin_create_user', {
      p_login_id: inviteLoginId,
      p_password: invitePassword,
      p_full_name: inviteFullName || inviteLoginId,
      p_email: inviteEmail || '',
      p_role: inviteRole,
      p_org_id: inviteOrgId,
    });

    setSaving(false);

    if (error) {
      toast.error('ユーザー作成に失敗しました', { description: error.message });
      return;
    }

    if (data?.error) {
      toast.error('ユーザー作成に失敗しました', { description: data.error });
      return;
    }

    toast.success('ユーザーを作成しました', {
      description: `ユーザーID: ${inviteLoginId}`,
    });
    setShowInvite(false);
    setInviteLoginId('');
    setInviteFullName('');
    setInviteEmail('');
    setInvitePassword('');
    fetchUsers();
  };

  const handleResetPassword = async () => {
    if (!resetPwUser || !newPassword) return;
    if (newPassword.length < 6) {
      toast.error('パスワードは6文字以上にしてください');
      return;
    }
    setSaving(true);

    const { data, error } = await supabase.rpc('admin_reset_password', {
      p_user_id: resetPwUser.id,
      p_new_password: newPassword,
    });

    setSaving(false);

    if (error) {
      toast.error('パスワードリセットに失敗しました', { description: error.message });
      return;
    }

    if (data?.error) {
      toast.error('パスワードリセットに失敗しました', { description: data.error });
      return;
    }

    // Supabase Authのパスワードも更新
    // Note: admin_reset_passwordはpublic.usersのpassword_hashのみ更新
    // auth.usersのencrypted_passwordも更新する必要がある
    toast.success('パスワードをリセットしました');
    setShowResetPw(false);
    setNewPassword('');
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const generatePassword = () => {
    const chars = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let pw = '';
    for (let i = 0; i < 10; i++) pw += chars[Math.floor(Math.random() * chars.length)];
    return pw;
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
    setInviteLoginId('');
    setInviteFullName('');
    setInviteEmail('');
    setInvitePassword(generatePassword());
    setInviteRole('partner');
    setShowInvite(true);
  };

  const openResetPw = (user: User) => {
    setResetPwUser(user);
    setNewPassword(generatePassword());
    setShowResetPw(true);
  };

  if (loading) {
    return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>;
  }

  return (
    <div>
      <PageHeader
        title="企業・ユーザー管理"
        description="パートナー企業の登録・ユーザーの作成・認証情報の管理"
      />

      <Tabs defaultValue="organizations" className="space-y-4">
        <TabsList>
          <TabsTrigger value="organizations" className="gap-2">
            <Building2 className="w-4 h-4" />
            企業一覧
          </TabsTrigger>
          <TabsTrigger value="users" className="gap-2">
            <Users className="w-4 h-4" />
            ユーザー一覧
          </TabsTrigger>
        </TabsList>

        {/* 企業一覧タブ */}
        <TabsContent value="organizations">
          <div className="flex justify-end mb-4">
            <Button onClick={openCreate}><Plus className="w-4 h-4 mr-2" />企業を追加</Button>
          </div>
          <Card className="border shadow-sm">
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>企業名</TableHead>
                    <TableHead>親企業</TableHead>
                    <TableHead>ステータス</TableHead>
                    <TableHead>ユーザー数</TableHead>
                    <TableHead className="text-right">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {orgs.map((org) => (
                    <TableRow key={org.id}>
                      <TableCell className="font-medium">{org.name}</TableCell>
                      <TableCell className="text-muted-foreground">{getParentName(org.parent_org_id)}</TableCell>
                      <TableCell><StatusBadge status={org.status} /></TableCell>
                      <TableCell>{users.filter(u => u.org_id === org.id).length}名</TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="sm" onClick={() => openEdit(org)} title="編集">
                            <Pencil className="w-3.5 h-3.5" />
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => openInvite(org.id)} title="ユーザー追加">
                            <UserPlus className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {orgs.length === 0 && (
                    <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">企業がまだ登録されていません</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ユーザー一覧タブ */}
        <TabsContent value="users">
          <Card className="border shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold">全ユーザー</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>ユーザーID</TableHead>
                    <TableHead>氏名</TableHead>
                    <TableHead>所属企業</TableHead>
                    <TableHead>ロール</TableHead>
                    <TableHead>ステータス</TableHead>
                    <TableHead className="text-right">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map((user) => (
                    <TableRow key={user.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <code className="text-sm bg-muted px-2 py-0.5 rounded font-mono">{user.login_id || '—'}</code>
                          {user.login_id && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 w-6 p-0"
                              onClick={() => copyToClipboard(user.login_id!, user.id + '_id')}
                              title="コピー"
                            >
                              {copiedId === user.id + '_id' ? <Check className="w-3 h-3 text-green-600" /> : <Copy className="w-3 h-3" />}
                            </Button>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="font-medium">{user.full_name || '—'}</TableCell>
                      <TableCell className="text-muted-foreground">{getOrgName(user.org_id)}</TableCell>
                      <TableCell>
                        <span className={`text-xs font-medium px-2 py-0.5 rounded ${
                          user.role === 'admin' ? 'bg-red-100 text-red-700' :
                          user.role === 'partner' ? 'bg-blue-100 text-blue-700' :
                          'bg-gray-100 text-gray-700'
                        }`}>
                          {getRoleLabel(user.role)}
                        </span>
                      </TableCell>
                      <TableCell><StatusBadge status={user.status} /></TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="sm" onClick={() => openResetPw(user)} title="パスワードリセット">
                          <KeyRound className="w-3.5 h-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {users.length === 0 && (
                    <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">ユーザーがまだ登録されていません</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Create/Edit Org Dialog */}
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

      {/* Create User Dialog */}
      <Dialog open={showInvite} onOpenChange={setShowInvite}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>ユーザーを作成</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>ユーザーID <span className="text-destructive">*</span></Label>
              <Input value={inviteLoginId} onChange={(e) => setInviteLoginId(e.target.value)} placeholder="user123" />
              <p className="text-xs text-muted-foreground">ログイン時に使用するIDです。英数字で入力してください。</p>
            </div>
            <div className="space-y-2">
              <Label>パスワード <span className="text-destructive">*</span></Label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Input
                    type={showPassword ? 'text' : 'password'}
                    value={invitePassword}
                    onChange={(e) => setInvitePassword(e.target.value)}
                    placeholder="6文字以上"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 p-0"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </Button>
                </div>
                <Button type="button" variant="outline" size="sm" onClick={() => setInvitePassword(generatePassword())}>
                  自動生成
                </Button>
              </div>
            </div>
            <div className="space-y-2">
              <Label>氏名</Label>
              <Input value={inviteFullName} onChange={(e) => setInviteFullName(e.target.value)} placeholder="山田 太郎" />
            </div>
            <div className="space-y-2">
              <Label>メールアドレス（任意）</Label>
              <Input type="email" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} placeholder="user@example.com" />
            </div>
            <div className="space-y-2">
              <Label>ロール</Label>
              <Select value={inviteRole} onValueChange={(v) => setInviteRole(v as 'partner' | 'sub_partner')}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="partner">Partner（一次代理店）</SelectItem>
                  <SelectItem value="sub_partner">SubPartner（二次代理店）</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowInvite(false)}>キャンセル</Button>
            <Button onClick={handleInvite} disabled={saving || !inviteLoginId || !invitePassword}>
              {saving ? '作成中...' : 'ユーザーを作成'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reset Password Dialog */}
      <Dialog open={showResetPw} onOpenChange={setShowResetPw}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>パスワードリセット</DialogTitle>
          </DialogHeader>
          {resetPwUser && (
            <div className="space-y-4 py-2">
              <div className="bg-muted/50 rounded-lg p-3 space-y-1">
                <p className="text-sm"><span className="text-muted-foreground">ユーザーID:</span> <code className="font-mono">{resetPwUser.login_id || '—'}</code></p>
                <p className="text-sm"><span className="text-muted-foreground">氏名:</span> {resetPwUser.full_name || '—'}</p>
                <p className="text-sm"><span className="text-muted-foreground">所属:</span> {getOrgName(resetPwUser.org_id)}</p>
              </div>
              <div className="space-y-2">
                <Label>新しいパスワード</Label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Input
                      type={showPassword ? 'text' : 'password'}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="6文字以上"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 p-0"
                      onClick={() => setShowPassword(!showPassword)}
                    >
                      {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </Button>
                  </div>
                  <Button type="button" variant="outline" size="sm" onClick={() => setNewPassword(generatePassword())}>
                    自動生成
                  </Button>
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowResetPw(false)}>キャンセル</Button>
            <Button onClick={handleResetPassword} disabled={saving || !newPassword || newPassword.length < 6}>
              {saving ? 'リセット中...' : 'パスワードをリセット'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
