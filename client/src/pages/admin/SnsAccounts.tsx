import { useEffect, useState, useCallback } from 'react';
import { supabase, type SnsAccount, type User } from '@/lib/supabase';
import { PageHeader } from '@/components/PageHeader';
import { StatusBadge } from '@/components/StatusBadge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
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
  Facebook, Search, Filter
} from 'lucide-react';
import { toast } from 'sonner';

export default function SnsAccounts() {
  const [accounts, setAccounts] = useState<SnsAccount[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Filter states
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  // Dialog states
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  const [editAccount, setEditAccount] = useState<SnsAccount | null>(null);
  const [deleteAccount, setDeleteAccount] = useState<SnsAccount | null>(null);

  // Form states
  const [formPlatform, setFormPlatform] = useState('facebook');
  const [formGmailAddress, setFormGmailAddress] = useState('');
  const [formGmailPassword, setFormGmailPassword] = useState('');
  const [formAccountName, setFormAccountName] = useState('');
  const [formLoginPassword, setFormLoginPassword] = useState('');
  const [formAssignedCompanyName, setFormAssignedCompanyName] = useState('');
  const [formNotes, setFormNotes] = useState('');
  const [formStatus, setFormStatus] = useState<string>('available');

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

  useEffect(() => {
    fetchAccounts();
    fetchUsers();
  }, [fetchAccounts, fetchUsers]);

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
    setFormAssignedCompanyName('');
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
        login_id: formGmailAddress || formAccountName, // login_idはgmailアドレスまたはアカウント名をフォールバック
        login_password: formLoginPassword,
        assigned_company_name: formAssignedCompanyName || null,
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
    setFormAssignedCompanyName(account.assigned_company_name || '');
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
        assigned_company_name: formAssignedCompanyName || null,
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
    } catch (e: any) {
      toast.error('削除に失敗しました', { description: e.message });
    } finally {
      setSaving(false);
    }
  };

  // Filtering
  const filteredAccounts = accounts.filter(account => {
    const q = searchQuery.toLowerCase();
    const matchesSearch = searchQuery === '' ||
      account.account_name.toLowerCase().includes(q) ||
      (account.gmail_address || '').toLowerCase().includes(q) ||
      (account.assigned_company_name || '').toLowerCase().includes(q) ||
      account.platform.toLowerCase().includes(q);
    const matchesStatus = statusFilter === 'all' || account.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  // Stats
  const totalCount = accounts.length;
  const availableCount = accounts.filter(a => a.status === 'available').length;
  const assignedCount = accounts.filter(a => a.status === 'assigned').length;
  const suspendedCount = accounts.filter(a => a.status === 'suspended').length;

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
            <SelectItem value="instagram">Instagram</SelectItem>
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
      </div>

      {/* 貸出先企業 */}
      <div className="space-y-2">
        <Label>貸出先企業名</Label>
        <Input
          placeholder="例: 株式会社〇〇"
          value={formAssignedCompanyName}
          onChange={(e) => setFormAssignedCompanyName(e.target.value)}
        />
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
              <SelectItem value="assigned">貸出中</SelectItem>
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

  return (
    <div>
      <PageHeader
        title="SNSアカウント管理"
        description="SNSアカウントの登録・貸出管理"
        action={
          <Button onClick={openCreate}>
            <Plus className="w-4 h-4 mr-2" />
            アカウント追加
          </Button>
        }
      />

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
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
            <div className="text-sm text-purple-600">貸出中</div>
            <div className="text-2xl font-bold text-purple-600">{assignedCount}</div>
          </CardContent>
        </Card>
        <Card className="border shadow-sm">
          <CardContent className="p-4">
            <div className="text-sm text-orange-600">停止中</div>
            <div className="text-2xl font-bold text-orange-600">{suspendedCount}</div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="アカウント名、Gmail、貸出先企業で検索..."
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
            <SelectItem value="assigned">貸出中</SelectItem>
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
                  <TableHead>貸出先企業</TableHead>
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
                      {account.gmail_password ? (
                        <div className="flex items-center gap-1">
                          <code className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono">
                            {visiblePasswords.has(`gp-${account.id}`)
                              ? account.gmail_password
                              : '••••••'}
                          </code>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-5 w-5 p-0"
                            onClick={() => togglePasswordVisibility(`gp-${account.id}`)}
                          >
                            {visiblePasswords.has(`gp-${account.id}`) ? (
                              <EyeOff className="w-3 h-3" />
                            ) : (
                              <Eye className="w-3 h-3" />
                            )}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-5 w-5 p-0"
                            onClick={() => copyToClipboard(account.gmail_password!, `gpw-${account.id}`)}
                          >
                            {copiedId === `gpw-${account.id}` ? (
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
                    <TableCell className="font-medium text-sm">{account.account_name}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <code className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono">
                          {visiblePasswords.has(`ap-${account.id}`)
                            ? account.login_password
                            : '••••••'}
                        </code>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-5 w-5 p-0"
                          onClick={() => togglePasswordVisibility(`ap-${account.id}`)}
                        >
                          {visiblePasswords.has(`ap-${account.id}`) ? (
                            <EyeOff className="w-3 h-3" />
                          ) : (
                            <Eye className="w-3 h-3" />
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-5 w-5 p-0"
                          onClick={() => copyToClipboard(account.login_password, `apw-${account.id}`)}
                        >
                          {copiedId === `apw-${account.id}` ? (
                            <Check className="w-3 h-3 text-green-500" />
                          ) : (
                            <Copy className="w-3 h-3" />
                          )}
                        </Button>
                      </div>
                    </TableCell>
                    <TableCell>
                      {account.assigned_company_name ? (
                        <span className="text-sm font-medium">{account.assigned_company_name}</span>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
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
              この操作は取り消せません。
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
    </div>
  );
}
