import { useEffect, useState, useCallback } from 'react';
import { supabase, type Organization, type User } from '@/lib/supabase';
import { PageHeader } from '@/components/PageHeader';
import { StatusBadge } from '@/components/StatusBadge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Plus, Pencil, UserPlus, Users, Building2, KeyRound, Eye, EyeOff, Copy, Check, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';

export default function Organizations() {
  const { user: currentUser } = useAuth();
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  // Dialog states
  const [showOrgDialog, setShowOrgDialog] = useState(false);
  const [showUserCreateDialog, setShowUserCreateDialog] = useState(false);
  const [showUserEditDialog, setShowUserEditDialog] = useState(false);
  const [showResetPwDialog, setShowResetPwDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showDeleteOrgDialog, setShowDeleteOrgDialog] = useState(false);
  const [deleteOrg, setDeleteOrg] = useState<Organization | null>(null);

  const [editOrg, setEditOrg] = useState<Organization | null>(null);
  const [editUser, setEditUser] = useState<User | null>(null);
  const [deleteUser, setDeleteUser] = useState<User | null>(null);
  const [resetPwUser, setResetPwUser] = useState<User | null>(null);
  const [createUserOrgId, setCreateUserOrgId] = useState('');

  // Org form states
  const [formName, setFormName] = useState('');
  const [formParent, setFormParent] = useState('none');
  const [formOrgStatus, setFormOrgStatus] = useState<'active' | 'inactive'>('active');

  // User create form states
  const [createLoginId, setCreateLoginId] = useState('');
  const [createFullName, setCreateFullName] = useState('');
  const [createEmail, setCreateEmail] = useState('');
  const [createRole, setCreateRole] = useState<'partner' | 'sub_partner'>('partner');
  const [createPassword, setCreatePassword] = useState('');

  // User edit form states
  const [editLoginId, setEditLoginId] = useState('');
  const [editFullName, setEditFullName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editRole, setEditRole] = useState('');
  const [editOrgId, setEditOrgId] = useState('');
  const [editStatus, setEditStatus] = useState('');

  // Password reset
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

  const generatePassword = () => {
    const chars = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let pw = '';
    for (let i = 0; i < 10; i++) pw += chars[Math.floor(Math.random() * chars.length)];
    return pw;
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // === Org CRUD ===
  const handleSaveOrg = async () => {
    setSaving(true);
    if (editOrg) {
      const { error } = await supabase.from('organizations').update({
        name: formName,
        parent_org_id: formParent === 'none' ? null : formParent,
        status: formOrgStatus,
      }).eq('id', editOrg.id);
      if (error) toast.error('更新に失敗しました');
      else toast.success('企業を更新しました');
    } else {
      const { error } = await supabase.from('organizations').insert({
        name: formName,
        parent_org_id: formParent === 'none' ? null : formParent,
        status: formOrgStatus,
      });
      if (error) toast.error('作成に失敗しました');
      else toast.success('企業を作成しました');
    }
    setSaving(false);
    setShowOrgDialog(false);
    setEditOrg(null);
    fetchOrgs();
  };

  // === User Create ===
  const handleCreateUser = async () => {
    if (!createLoginId || !createPassword || !createUserOrgId) {
      toast.error('ユーザーID、パスワード、所属企業は必須です');
      return;
    }
    if (createPassword.length < 6) {
      toast.error('パスワードは6文字以上にしてください');
      return;
    }
    setSaving(true);
    const { data, error } = await supabase.rpc('admin_create_user', {
      p_login_id: createLoginId,
      p_password: createPassword,
      p_full_name: createFullName || createLoginId,
      p_email: createEmail || '',
      p_role: createRole,
      p_org_id: createUserOrgId,
    });
    setSaving(false);
    if (error) { toast.error('ユーザー作成に失敗しました', { description: error.message }); return; }
    if (data?.error) { toast.error('ユーザー作成に失敗しました', { description: data.error }); return; }
    toast.success('ユーザーを作成しました', { description: `ユーザーID: ${createLoginId}` });
    setShowUserCreateDialog(false);
    fetchUsers();
  };

  // === User Edit ===
  const handleUpdateUser = async () => {
    if (!editUser) return;
    setSaving(true);
    const { data, error } = await supabase.rpc('admin_update_user', {
      p_user_id: editUser.id,
      p_login_id: editLoginId || null,
      p_full_name: editFullName || null,
      p_email: editEmail || null,
      p_role: editRole || null,
      p_org_id: editOrgId || null,
      p_status: editStatus || null,
    });
    setSaving(false);
    if (error) { toast.error('更新に失敗しました', { description: error.message }); return; }
    if (data?.error) { toast.error('更新に失敗しました', { description: data.error }); return; }
    toast.success('ユーザー情報を更新しました');
    setShowUserEditDialog(false);
    setEditUser(null);
    fetchUsers();
  };

  // === User Delete ===
  const handleDeleteUser = async () => {
    if (!deleteUser) return;
    setSaving(true);
    const { data, error } = await supabase.rpc('admin_delete_user', {
      p_user_id: deleteUser.id,
    });
    setSaving(false);
    if (error) { toast.error('削除に失敗しました', { description: error.message }); return; }
    if (data?.error) { toast.error('削除に失敗しました', { description: data.error }); return; }
    toast.success('ユーザーを削除しました');
    setShowDeleteDialog(false);
    setDeleteUser(null);
    fetchUsers();
  };

  // === Password Reset ===
  const handleResetPassword = async () => {
    if (!resetPwUser || !newPassword) return;
    if (newPassword.length < 6) { toast.error('パスワードは6文字以上にしてください'); return; }
    setSaving(true);
    const { data, error } = await supabase.rpc('admin_reset_password', {
      p_user_id: resetPwUser.id,
      p_new_password: newPassword,
    });
    setSaving(false);
    if (error) { toast.error('パスワードリセットに失敗しました', { description: error.message }); return; }
    if (data?.error) { toast.error('パスワードリセットに失敗しました', { description: data.error }); return; }
    toast.success('パスワードをリセットしました');
    setShowResetPwDialog(false);
    setNewPassword('');
  };

  // === Org Delete ===
  const handleDeleteOrg = async () => {
    if (!deleteOrg) return;
    // Check if org has users
    const orgUsers = users.filter(u => u.org_id === deleteOrg.id);
    if (orgUsers.length > 0) {
      toast.error('この企業にはユーザーが紐づいているため削除できません', { description: `${orgUsers.length}名のユーザーを先に削除または移動してください` });
      setShowDeleteOrgDialog(false);
      return;
    }
    setSaving(true);
    const { error } = await supabase.from('organizations').delete().eq('id', deleteOrg.id);
    setSaving(false);
    if (error) {
      toast.error('削除に失敗しました', { description: error.message });
    } else {
      toast.success('企業を削除しました');
    }
    setShowDeleteOrgDialog(false);
    setDeleteOrg(null);
    fetchOrgs();
  };

  const openDeleteOrg = (org: Organization) => {
    setDeleteOrg(org);
    setShowDeleteOrgDialog(true);
  };

  // === Open helpers ===
  const openCreateOrg = () => {
    setEditOrg(null);
    setFormName('');
    setFormParent('none');
    setFormOrgStatus('active');
    setShowOrgDialog(true);
  };

  const openEditOrg = (org: Organization) => {
    setEditOrg(org);
    setFormName(org.name);
    setFormParent(org.parent_org_id || 'none');
    setFormOrgStatus(org.status);
    setShowOrgDialog(true);
  };

  const openCreateUser = (orgId?: string) => {
    setCreateUserOrgId(orgId || (orgs[0]?.id || ''));
    setCreateLoginId('');
    setCreateFullName('');
    setCreateEmail('');
    setCreatePassword(generatePassword());
    setCreateRole('partner');
    setShowPassword(false);
    setShowUserCreateDialog(true);
  };

  const openEditUser = (user: User) => {
    setEditUser(user);
    setEditLoginId(user.login_id || '');
    setEditFullName(user.full_name || '');
    setEditEmail(user.email || '');
    setEditRole(user.role);
    setEditOrgId(user.org_id);
    setEditStatus(user.status);
    setShowUserEditDialog(true);
  };

  const openDeleteUser = (user: User) => {
    setDeleteUser(user);
    setShowDeleteDialog(true);
  };

  const openResetPw = (user: User) => {
    setResetPwUser(user);
    setNewPassword(generatePassword());
    setShowPassword(false);
    setShowResetPwDialog(true);
  };

  if (loading) {
    return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>;
  }

  return (
    <div>
      <PageHeader
        title="企業・ユーザー管理"
        description="パートナー企業の登録・ユーザーの作成・編集・削除・認証情報の管理"
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

        {/* === 企業一覧タブ === */}
        <TabsContent value="organizations">
          <div className="flex justify-end mb-4">
            <Button onClick={openCreateOrg}><Plus className="w-4 h-4 mr-2" />企業を追加</Button>
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
                          <Button variant="ghost" size="sm" onClick={() => openEditOrg(org)} title="編集">
                            <Pencil className="w-3.5 h-3.5" />
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => openCreateUser(org.id)} title="ユーザー追加">
                            <UserPlus className="w-3.5 h-3.5" />
                          </Button>
                          {!org.parent_org_id ? null : (
                            <Button variant="ghost" size="sm" onClick={() => openDeleteOrg(org)} title="削除" className="text-destructive hover:text-destructive">
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          )}
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

        {/* === ユーザー一覧タブ === */}
        <TabsContent value="users">
          <div className="flex justify-end mb-4">
            <Button onClick={() => openCreateUser()}><Plus className="w-4 h-4 mr-2" />ユーザーを追加</Button>
          </div>
          <Card className="border shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold">全ユーザー（{users.length}名）</CardTitle>
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
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="sm" onClick={() => openEditUser(user)} title="編集">
                            <Pencil className="w-3.5 h-3.5" />
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => openResetPw(user)} title="パスワードリセット">
                            <KeyRound className="w-3.5 h-3.5" />
                          </Button>
                          {user.id !== currentUser?.id && (
                            <Button variant="ghost" size="sm" onClick={() => openDeleteUser(user)} title="削除" className="text-destructive hover:text-destructive">
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          )}
                        </div>
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

      {/* === Create/Edit Org Dialog === */}
      <Dialog open={showOrgDialog} onOpenChange={setShowOrgDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editOrg ? '企業を編集' : '企業を追加'}</DialogTitle>
            <DialogDescription>{editOrg ? '企業情報を編集します' : '新しいパートナー企業を登録します'}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>企業名 <span className="text-destructive">*</span></Label>
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
              <Select value={formOrgStatus} onValueChange={(v) => setFormOrgStatus(v as 'active' | 'inactive')}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">有効</SelectItem>
                  <SelectItem value="inactive">無効</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowOrgDialog(false)}>キャンセル</Button>
            <Button onClick={handleSaveOrg} disabled={saving || !formName}>{saving ? '保存中...' : '保存'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* === Create User Dialog === */}
      <Dialog open={showUserCreateDialog} onOpenChange={setShowUserCreateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>ユーザーを作成</DialogTitle>
            <DialogDescription>新しいユーザーアカウントを作成します</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>所属企業 <span className="text-destructive">*</span></Label>
              <Select value={createUserOrgId} onValueChange={setCreateUserOrgId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {orgs.map(o => (
                    <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>ユーザーID <span className="text-destructive">*</span></Label>
              <Input value={createLoginId} onChange={(e) => setCreateLoginId(e.target.value)} placeholder="user123" />
              <p className="text-xs text-muted-foreground">ログイン時に使用するIDです。英数字で入力してください。</p>
            </div>
            <div className="space-y-2">
              <Label>パスワード <span className="text-destructive">*</span></Label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Input
                    type={showPassword ? 'text' : 'password'}
                    value={createPassword}
                    onChange={(e) => setCreatePassword(e.target.value)}
                    placeholder="6文字以上"
                  />
                  <Button type="button" variant="ghost" size="sm" className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 p-0" onClick={() => setShowPassword(!showPassword)}>
                    {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </Button>
                </div>
                <Button type="button" variant="outline" size="sm" onClick={() => setCreatePassword(generatePassword())}>自動生成</Button>
              </div>
            </div>
            <div className="space-y-2">
              <Label>氏名</Label>
              <Input value={createFullName} onChange={(e) => setCreateFullName(e.target.value)} placeholder="山田 太郎" />
            </div>
            <div className="space-y-2">
              <Label>メールアドレス（任意）</Label>
              <Input type="email" value={createEmail} onChange={(e) => setCreateEmail(e.target.value)} placeholder="user@example.com" />
            </div>
            <div className="space-y-2">
              <Label>ロール</Label>
              <Select value={createRole} onValueChange={(v) => setCreateRole(v as 'partner' | 'sub_partner')}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="partner">Partner（一次代理店）</SelectItem>
                  <SelectItem value="sub_partner">SubPartner（二次代理店）</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowUserCreateDialog(false)}>キャンセル</Button>
            <Button onClick={handleCreateUser} disabled={saving || !createLoginId || !createPassword || !createUserOrgId}>
              {saving ? '作成中...' : 'ユーザーを作成'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* === Edit User Dialog === */}
      <Dialog open={showUserEditDialog} onOpenChange={setShowUserEditDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>ユーザーを編集</DialogTitle>
            <DialogDescription>ユーザー情報を変更します</DialogDescription>
          </DialogHeader>
          {editUser && (
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label>ユーザーID</Label>
                <Input value={editLoginId} onChange={(e) => setEditLoginId(e.target.value)} placeholder="user123" />
              </div>
              <div className="space-y-2">
                <Label>氏名</Label>
                <Input value={editFullName} onChange={(e) => setEditFullName(e.target.value)} placeholder="山田 太郎" />
              </div>
              <div className="space-y-2">
                <Label>メールアドレス</Label>
                <Input type="email" value={editEmail} onChange={(e) => setEditEmail(e.target.value)} placeholder="user@example.com" />
              </div>
              <div className="space-y-2">
                <Label>所属企業</Label>
                <Select value={editOrgId} onValueChange={setEditOrgId}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {orgs.map(o => (
                      <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>ロール</Label>
                <Select value={editRole} onValueChange={setEditRole}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">Admin（管理者）</SelectItem>
                    <SelectItem value="partner">Partner（一次代理店）</SelectItem>
                    <SelectItem value="sub_partner">SubPartner（二次代理店）</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>ステータス</Label>
                <Select value={editStatus} onValueChange={setEditStatus}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">有効</SelectItem>
                    <SelectItem value="inactive">無効</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowUserEditDialog(false)}>キャンセル</Button>
            <Button onClick={handleUpdateUser} disabled={saving}>
              {saving ? '保存中...' : '保存'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* === Reset Password Dialog === */}
      <Dialog open={showResetPwDialog} onOpenChange={setShowResetPwDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>パスワードリセット</DialogTitle>
            <DialogDescription>ユーザーのパスワードを変更します</DialogDescription>
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
                    <Button type="button" variant="ghost" size="sm" className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 p-0" onClick={() => setShowPassword(!showPassword)}>
                      {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </Button>
                  </div>
                  <Button type="button" variant="outline" size="sm" onClick={() => setNewPassword(generatePassword())}>自動生成</Button>
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowResetPwDialog(false)}>キャンセル</Button>
            <Button onClick={handleResetPassword} disabled={saving || !newPassword || newPassword.length < 6}>
              {saving ? 'リセット中...' : 'パスワードをリセット'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* === Delete Org Confirmation === */}
      <AlertDialog open={showDeleteOrgDialog} onOpenChange={setShowDeleteOrgDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>企業を削除しますか？</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteOrg && (
                <>
                  <strong>{deleteOrg.name}</strong>を削除します。
                  この操作は取り消せません。紐づくユーザーがいる場合は削除できません。
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>キャンセル</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteOrg}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {saving ? '削除中...' : '削除する'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* === Delete User Confirmation === */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>ユーザーを削除しますか？</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteUser && (
                <>
                  <strong>{deleteUser.full_name || deleteUser.login_id}</strong>（{getOrgName(deleteUser.org_id)}）を削除します。
                  この操作は取り消せません。関連するアポイントデータは残りますが、このユーザーでのログインはできなくなります。
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>キャンセル</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteUser}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {saving ? '削除中...' : '削除する'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
