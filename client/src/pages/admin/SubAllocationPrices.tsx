import { useEffect, useState, useCallback } from 'react';
import { supabase, type Organization, type Allocation, type SubAllocationPrice } from '@/lib/supabase';
import { PageHeader } from '@/components/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Pencil, Save, Building2, ChevronDown, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';

interface OrgWithChildren extends Organization {
  children: Organization[];
}

interface PriceEntry {
  allocationId: string;
  projectTitle: string;
  projectNumber: string;
  parentPayout: number;
  subPrice: number | null; // null = 親の単価を継承
  subPriceId: string | null;
}

export default function SubAllocationPrices() {
  const [parentOrgs, setParentOrgs] = useState<OrgWithChildren[]>([]);
  const [allAllocations, setAllAllocations] = useState<Allocation[]>([]);
  const [allSubPrices, setAllSubPrices] = useState<SubAllocationPrice[]>([]);
  const [loading, setLoading] = useState(true);

  // Editing state
  const [editingOrg, setEditingOrg] = useState<Organization | null>(null);
  const [editingPrices, setEditingPrices] = useState<PriceEntry[]>([]);
  const [showDialog, setShowDialog] = useState(false);
  const [saving, setSaving] = useState(false);

  // Expanded parent orgs
  const [expandedOrgs, setExpandedOrgs] = useState<Set<string>>(new Set());

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      // 全組織を取得
      const { data: orgsData } = await supabase
        .from('organizations')
        .select('*')
        .eq('status', 'active')
        .order('name');
      const orgs = orgsData || [];

      // 親子関係を構築（子を持つ組織のみ表示）
      const orgMap = new Map<string, Organization>();
      orgs.forEach(o => orgMap.set(o.id, o));

      const parentMap = new Map<string, OrgWithChildren>();
      orgs.forEach(o => {
        if (o.parent_org_id && orgMap.has(o.parent_org_id)) {
          const parent = orgMap.get(o.parent_org_id)!;
          if (!parentMap.has(parent.id)) {
            parentMap.set(parent.id, { ...parent, children: [] });
          }
          parentMap.get(parent.id)!.children.push(o);
        }
      });

      // Crafia本部の直接の子のみ（一次代理店）をparentOrgsとする
      // Crafia本部を見つける
      const crafiaOrg = orgs.find(o => !o.parent_org_id || o.name === 'Crafia本部');
      const relevantParents: OrgWithChildren[] = [];
      parentMap.forEach((parent) => {
        if (parent.children.length > 0) {
          relevantParents.push(parent);
        }
      });
      setParentOrgs(relevantParents);

      // 全allocationsを取得
      const { data: allocData } = await supabase
        .from('allocations')
        .select('*, project:projects(title, project_number, status)')
        .order('created_at', { ascending: false });
      setAllAllocations(allocData || []);

      // 全sub_allocation_pricesを取得
      const { data: priceData } = await supabase
        .from('sub_allocation_prices')
        .select('*');
      setAllSubPrices(priceData || []);

      // 全て展開
      const allIds = new Set<string>();
      relevantParents.forEach(p => allIds.add(p.id));
      setExpandedOrgs(allIds);

    } catch (e) {
      console.error('SubAllocationPrices fetch error:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const toggleExpand = (orgId: string) => {
    setExpandedOrgs(prev => {
      const next = new Set(prev);
      if (next.has(orgId)) next.delete(orgId);
      else next.add(orgId);
      return next;
    });
  };

  // 子企業の卸単価を編集
  const openEditPrices = (childOrg: Organization, parentOrgId: string) => {
    // 親企業のallocationsを取得
    const parentAllocs = allAllocations.filter(a => a.child_org_id === parentOrgId);
    
    const prices: PriceEntry[] = parentAllocs
      .filter(a => (a as any).project?.status !== 'closed')
      .map(a => {
        const proj = (a as any).project;
        const existingPrice = allSubPrices.find(
          p => p.allocation_id === a.id && p.sub_org_id === childOrg.id
        );
        return {
          allocationId: a.id,
          projectTitle: proj?.title || '—',
          projectNumber: proj?.project_number || '',
          parentPayout: Number(a.payout_per_appointment),
          subPrice: existingPrice ? Number(existingPrice.payout_per_appointment) : null,
          subPriceId: existingPrice?.id || null,
        };
      });

    setEditingOrg(childOrg);
    setEditingPrices(prices);
    setShowDialog(true);
  };

  const handlePriceChange = (index: number, value: string) => {
    setEditingPrices(prev => {
      const next = [...prev];
      next[index] = {
        ...next[index],
        subPrice: value === '' ? null : Number(value),
      };
      return next;
    });
  };

  const handleSavePrices = async () => {
    if (!editingOrg) return;
    setSaving(true);
    try {
      for (const entry of editingPrices) {
        if (entry.subPrice !== null) {
          // 卸単価が設定されている場合 → upsert
          if (entry.subPriceId) {
            await supabase
              .from('sub_allocation_prices')
              .update({
                payout_per_appointment: entry.subPrice,
                updated_at: new Date().toISOString(),
              })
              .eq('id', entry.subPriceId);
          } else {
            await supabase
              .from('sub_allocation_prices')
              .insert({
                allocation_id: entry.allocationId,
                sub_org_id: editingOrg.id,
                payout_per_appointment: entry.subPrice,
              });
          }
        } else {
          // nullの場合 → 既存レコードがあれば削除（親の単価を継承）
          if (entry.subPriceId) {
            await supabase
              .from('sub_allocation_prices')
              .delete()
              .eq('id', entry.subPriceId);
          }
        }
      }
      toast.success(`${editingOrg.name}の卸単価を更新しました`);
      setShowDialog(false);
      fetchData();
    } catch (e: any) {
      toast.error('保存に失敗しました: ' + (e.message || ''));
    } finally {
      setSaving(false);
    }
  };

  // 子企業の現在の卸単価サマリーを取得
  const getChildPriceSummary = (childOrgId: string, parentOrgId: string) => {
    const parentAllocs = allAllocations.filter(a => a.child_org_id === parentOrgId);
    const activeAllocs = parentAllocs.filter(a => (a as any).project?.status !== 'closed');
    const customPrices = allSubPrices.filter(p => p.sub_org_id === childOrgId);
    const customCount = customPrices.filter(p => 
      activeAllocs.some(a => a.id === p.allocation_id)
    ).length;
    return { total: activeAllocs.length, custom: customCount };
  };

  if (loading) {
    return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>;
  }

  return (
    <div>
      <PageHeader
        title="二次代理店 卸単価設定"
        description="一次代理店の案件を二次代理店に自動継承。卸単価のみ個別設定できます。"
      />

      {parentOrgs.length === 0 ? (
        <Card className="border shadow-sm">
          <CardContent className="py-12 text-center">
            <Building2 className="w-12 h-12 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-muted-foreground">子企業を持つ代理店がありません</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {parentOrgs.map(parent => (
            <Card key={parent.id} className="border shadow-sm">
              <CardHeader className="pb-3 cursor-pointer" onClick={() => toggleExpand(parent.id)}>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base font-semibold flex items-center gap-2">
                    {expandedOrgs.has(parent.id) ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                    <Building2 className="w-4 h-4 text-muted-foreground" />
                    {parent.name}
                    <Badge variant="outline" className="text-xs ml-2">
                      {parent.children.length}社
                    </Badge>
                  </CardTitle>
                  <span className="text-sm text-muted-foreground">
                    割り当て案件: {allAllocations.filter(a => a.child_org_id === parent.id && (a as any).project?.status !== 'closed').length}件
                  </span>
                </div>
              </CardHeader>
              {expandedOrgs.has(parent.id) && (
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>二次代理店名</TableHead>
                        <TableHead className="text-center">継承案件数</TableHead>
                        <TableHead className="text-center">個別単価設定</TableHead>
                        <TableHead className="text-right">操作</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {parent.children.map(child => {
                        const summary = getChildPriceSummary(child.id, parent.id);
                        return (
                          <TableRow key={child.id}>
                            <TableCell className="font-medium">{child.name}</TableCell>
                            <TableCell className="text-center">{summary.total}件</TableCell>
                            <TableCell className="text-center">
                              {summary.custom > 0 ? (
                                <Badge className="bg-blue-100 text-blue-700 border-0">{summary.custom}件設定済</Badge>
                              ) : (
                                <span className="text-sm text-muted-foreground">親単価を継承</span>
                              )}
                            </TableCell>
                            <TableCell className="text-right">
                              <Button variant="outline" size="sm" onClick={() => openEditPrices(child, parent.id)}>
                                <Pencil className="w-3.5 h-3.5 mr-1" /> 卸単価設定
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </CardContent>
              )}
            </Card>
          ))}
        </div>
      )}

      {/* 卸単価編集ダイアログ */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingOrg?.name} — 卸単価設定</DialogTitle>
            <DialogDescription>
              各案件の卸単価を設定します。空欄の場合は親企業の卸単価がそのまま適用されます。
            </DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>案件</TableHead>
                  <TableHead className="text-right">親企業への卸単価</TableHead>
                  <TableHead className="text-right">この代理店への卸単価</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {editingPrices.map((entry, i) => (
                  <TableRow key={entry.allocationId}>
                    <TableCell>
                      {entry.projectNumber ? `[${entry.projectNumber}] ` : ''}{entry.projectTitle}
                    </TableCell>
                    <TableCell className="text-right font-mono text-muted-foreground">
                      ¥{entry.parentPayout.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <span className="text-sm text-muted-foreground">¥</span>
                        <Input
                          type="number"
                          min={0}
                          className="w-28 text-right"
                          placeholder={`${entry.parentPayout}`}
                          value={entry.subPrice ?? ''}
                          onChange={(e) => handlePriceChange(i, e.target.value)}
                        />
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {editingPrices.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center text-muted-foreground py-6">
                      親企業に割り当てられた案件がありません
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
            <p className="text-xs text-muted-foreground mt-3">
              空欄の場合、親企業の卸単価がそのまま適用されます。
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>キャンセル</Button>
            <Button onClick={handleSavePrices} disabled={saving}>
              {saving ? '保存中...' : <><Save className="w-4 h-4 mr-1" /> 保存</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
