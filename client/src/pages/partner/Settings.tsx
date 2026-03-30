import { useEffect, useState, useCallback } from 'react';
import { supabase, type SalesStaff } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { PageHeader } from '@/components/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, UserPlus, Users } from 'lucide-react';
import { format } from 'date-fns';

export default function Settings() {
  const { user } = useAuth();
  const userOrgId = user?.org_id;

  const [staffList, setStaffList] = useState<SalesStaff[]>([]);
  const [loading, setLoading] = useState(true);

  // Dialog state
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [editingStaff, setEditingStaff] = useState<SalesStaff | null>(null);
  const [deletingStaff, setDeletingStaff] = useState<SalesStaff | null>(null);
  const [staffName, setStaffName] = useState('');
  const [saving, setSaving] = useState(false);

  const fetchStaff = useCallback(async () => {
    if (!userOrgId) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('sales_staff')
        .select('*')
        .eq('org_id', userOrgId)
        .eq('status', 'active')
        .order('created_at', { ascending: true });
      if (error) throw error;
      setStaffList(data || []);
    } catch (e) {
      console.error('Failed to fetch sales staff:', e);
      toast.error('営業担当者の取得に失敗しました');
    } finally {
      setLoading(false);
    }
  }, [userOrgId]);

  useEffect(() => { fetchStaff(); }, [fetchStaff]);

  const handleAdd = async () => {
    if (!staffName.trim() || !userOrgId) return;
    setSaving(true);
    try {
      const { error } = await supabase.from('sales_staff').insert({
        org_id: userOrgId,
        name: staffName.trim(),
      });
      if (error) throw error;
      toast.success('営業担当者を追加しました');
      setStaffName('');
      setShowAddDialog(false);
      fetchStaff();
    } catch (e: any) {
      toast.error('追加に失敗しました', { description: e.message });
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = async () => {
    if (!staffName.trim() || !editingStaff) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from('sales_staff')
        .update({ name: staffName.trim(), updated_at: new Date().toISOString() })
        .eq('id', editingStaff.id);
      if (error) throw error;
      toast.success('営業担当者を更新しました');
      setStaffName('');
      setShowEditDialog(false);
      setEditingStaff(null);
      fetchStaff();
    } catch (e: any) {
      toast.error('更新に失敗しました', { description: e.message });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deletingStaff) return;
    setSaving(true);
    try {
      // Soft delete: set status to inactive
      const { error } = await supabase
        .from('sales_staff')
        .update({ status: 'inactive', updated_at: new Date().toISOString() })
        .eq('id', deletingStaff.id);
      if (error) throw error;
      toast.success('営業担当者を削除しました');
      setShowDeleteConfirm(false);
      setDeletingStaff(null);
      fetchStaff();
    } catch (e: any) {
      toast.error('削除に失敗しました', { description: e.message });
    } finally {
      setSaving(false);
    }
  };

  const openEdit = (staff: SalesStaff) => {
    setEditingStaff(staff);
    setStaffName(staff.name);
    setShowEditDialog(true);
  };

  const openDelete = (staff: SalesStaff) => {
    setDeletingStaff(staff);
    setShowDeleteConfirm(true);
  };

  if (loading) {
    return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>;
  }

  return (
    <div className="max-w-3xl">
      <PageHeader title="設定" description="組織の設定を管理します" />

      <Card className="border shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Users className="w-5 h-5 text-muted-foreground" />
              <CardTitle className="text-base">営業担当者</CardTitle>
            </div>
            <Button size="sm" className="gap-1.5" onClick={() => { setStaffName(''); setShowAddDialog(true); }}>
              <UserPlus className="w-4 h-4" />
              追加
            </Button>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            アポ登録時の「獲得者名」で選択できる営業担当者を管理します。
          </p>
        </CardHeader>
        <CardContent>
          {staffList.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Users className="w-10 h-10 mx-auto mb-2 opacity-40" />
              <p className="text-sm">営業担当者が登録されていません</p>
              <p className="text-xs mt-1">「追加」ボタンから営業担当者を登録してください</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>名前</TableHead>
                  <TableHead className="w-[140px]">登録日</TableHead>
                  <TableHead className="w-[100px] text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {staffList.map(staff => (
                  <TableRow key={staff.id}>
                    <TableCell className="font-medium">{staff.name}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {format(new Date(staff.created_at), 'yyyy/MM/dd')}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex gap-1 justify-end">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(staff)}>
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => openDelete(staff)}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* 追加ダイアログ */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>営業担当者を追加</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>担当者名 <span className="text-destructive">*</span></Label>
              <Input
                value={staffName}
                onChange={e => setStaffName(e.target.value)}
                placeholder="山田 太郎"
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAdd(); } }}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDialog(false)}>キャンセル</Button>
            <Button onClick={handleAdd} disabled={saving || !staffName.trim()}>
              {saving ? '追加中...' : '追加'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 編集ダイアログ */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>営業担当者を編集</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>担当者名 <span className="text-destructive">*</span></Label>
              <Input
                value={staffName}
                onChange={e => setStaffName(e.target.value)}
                placeholder="山田 太郎"
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleEdit(); } }}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditDialog(false)}>キャンセル</Button>
            <Button onClick={handleEdit} disabled={saving || !staffName.trim()}>
              {saving ? '更新中...' : '更新'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 削除確認ダイアログ */}
      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>営業担当者を削除</AlertDialogTitle>
            <AlertDialogDescription>
              「{deletingStaff?.name}」を削除してもよろしいですか？
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>キャンセル</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {saving ? '削除中...' : '削除'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
