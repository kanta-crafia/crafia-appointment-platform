# 3次代理店アポ表示問題の調査メモ

## 発見事項 - Appointments.tsx (代理店側アポ一覧)

### 問題箇所: fetchAppointments関数 (62-93行目)
```typescript
// 自組織の子組織（二次代理店）を取得
const { data: childOrgs } = await supabase
  .from('organizations')
  .select('id, name')
  .eq('parent_org_id', userOrgId);  // ← 直接の子のみ取得

const childOrgIds = (childOrgs || []).map(o => o.id);

// 自組織 + 子組織のアポを取得
const allOrgIds = [userOrgId, ...childOrgIds];
```

### 問題の原因
- `eq('parent_org_id', userOrgId)` は**直接の子組織のみ**を取得
- 孫（3次代理店）以降の組織は取得されない
- 例: 1次代理店(useful) → 2次代理店(大藏) → 3次代理店(X社)
  - usefulでログインすると、大藏のアポは見えるが、X社のアポは見えない

### 必要な修正
- Appointments.tsxのみが問題。直接の子のみ取得している。
- 他の画面（PartnerAgencyStats, SubPartnerManagement, PartnerSnsAccounts）は既に再帰的に全子孫を取得している

### 影響範囲
- Appointments.tsx: fetchAppointments関数でeq('parent_org_id', userOrgId)→直接の子のみ
- 修正: getDescendantOrgIdsのような再帰的取得を使うように変更
