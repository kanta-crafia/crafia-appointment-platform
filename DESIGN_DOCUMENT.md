# Crafia 営業代行 案件/アポイント管理プラットフォーム — 設計ドキュメント

**Author:** Manus AI  
**Date:** 2026-02-27  
**Version:** 1.0 (MVP)

---

## 1. 要件の再整理

### ビジネス要件

Crafia（元請け営業代行会社）が案件を受注し、パートナー企業（一次代理店）に卸し、さらにその下（二次代理店）にも再委託される**多段構造**の中で、案件・アポイント・単価・上限数・承認・通知を一元管理するプラットフォームである。

### 絶対条件

| 条件 | 詳細 |
|------|------|
| **Admin全権管理** | 全案件・全構造・全単価階層を閲覧・操作可能 |
| **案件可視性制限** | パートナー企業にはAdminが割り当てた案件のみ表示 |
| **単価秘匿** | 単価は「親→子」の割り当てごとに設定。下位は上位の卸単価・構造を閲覧不可 |
| **同列他社の秘匿** | 同列の他社の案件・アポ・単価・上限は閲覧不可 |
| **残数自動更新** | アポイント承認時に案件の残数・割り当て残数を自動更新 |
| **通知** | アポイント登録/承認/却下/取消時にAdminへアプリ内通知 |

---

## 2. 画面一覧と画面遷移

### Admin側画面

| 画面 | パス | 機能 |
|------|------|------|
| ログイン | `/login` | メール/パスワード認証 |
| ダッシュボード | `/` | 案件別サマリー（総上限/確定/残数）、最近のアポイント |
| 企業管理 | `/organizations` | 企業CRUD、親子関係設定、ユーザー招待 |
| 案件管理 | `/projects` | 案件CRUD、ステータス管理、上限設定 |
| 割り当て管理 | `/allocations` | 案件→企業の割り当て、単価/上限/条件設定 |
| アポ承認 | `/approvals` | pending一覧、詳細表示、承認/却下/取消 |
| 通知 | `/notifications` | 未読管理、一括既読 |
| 監査ログ | `/audit-logs` | 主要操作の履歴確認 |

### Partner / SubPartner側画面

| 画面 | パス | 機能 |
|------|------|------|
| ログイン | `/login` | メール/パスワード認証 |
| ダッシュボード | `/` | 自社の案件進捗、承認待ち数、残りアポ枠 |
| 割り当て案件一覧 | `/my-allocations` | 自社に割り当てられた案件のみ表示（単価・上限・残数） |
| アポ登録 | `/appointments/new` | 案件選択→対象企業・商談日時・メモ・証跡URL入力 |
| アポ一覧 | `/appointments` | 自社が登録したアポイントの一覧・詳細・ステータス確認 |
| 通知 | `/notifications` | 自社宛の通知一覧 |

### 画面遷移図

```
[ログイン] → (認証成功)
  ├── Admin → [ダッシュボード]
  │     ├── [企業管理] → 企業追加/編集/ユーザー招待
  │     ├── [案件管理] → 案件作成/編集
  │     ├── [割り当て管理] → 割り当て追加/編集
  │     ├── [アポ承認] → 詳細 → 承認/却下/取消
  │     ├── [通知]
  │     └── [監査ログ]
  └── Partner/SubPartner → [ダッシュボード]
        ├── [割り当て案件] → [アポ登録]
        ├── [アポ一覧] → 詳細表示
        └── [通知]
```

---

## 3. データモデル案

### テーブル一覧

| テーブル名 | 説明 | 主要カラム |
|-----------|------|-----------|
| `organizations` | 企業マスタ | `id`, `name`, `parent_org_id`, `status` |
| `users` | ユーザーマスタ | `id`, `org_id`, `email`, `full_name`, `role`, `status` |
| `projects` | 案件マスタ | `id`, `title`, `description`, `start_date`, `end_date`, `max_appointments_total`, `confirmed_count`, `status`, `created_by` |
| `allocations` | 割り当て（案件×企業） | `id`, `project_id`, `parent_org_id`, `child_org_id`, `payout_per_appointment`, `max_appointments_for_child`, `confirmed_count`, `conditions_json`, `status` |
| `appointments` | アポイント | `id`, `project_id`, `allocation_id`, `created_by_user_id`, `org_id`, `target_company_name`, `contact_person`, `meeting_datetime`, `notes`, `evidence_url`, `status`, `approved_by`, `approved_at`, `rejected_reason` |
| `notifications` | 通知 | `id`, `recipient_user_id`, `type`, `payload_json`, `is_read` |
| `audit_logs` | 監査ログ | `id`, `actor_user_id`, `action`, `entity_type`, `entity_id`, `before_json`, `after_json` |

### ER関係

```
organizations (1) ← parent_org_id ← organizations (N)  [自己参照：親子関係]
organizations (1) ← org_id ← users (N)
projects (1) ← project_id ← allocations (N)
organizations (1) ← parent_org_id ← allocations (N)  [卸元]
organizations (1) ← child_org_id ← allocations (N)   [卸先]
allocations (1) ← allocation_id ← appointments (N)
projects (1) ← project_id ← appointments (N)
users (1) ← created_by_user_id ← appointments (N)
```

---

## 4. 権限設計

### ロール定義

| ロール | 説明 |
|--------|------|
| `admin` | Crafia本部。全データの閲覧・操作権限 |
| `partner` | 一次代理店。割り当てられた案件のみ閲覧 |
| `sub_partner` | 二次代理店。割り当てられた案件のみ閲覧 |

### 権限マトリクス

| 操作 | Admin | Partner | SubPartner |
|------|-------|---------|------------|
| 企業の作成・編集 | ○ | × | × |
| ユーザー招待 | ○ | × | × |
| 案件の作成・編集 | ○ | × | × |
| 全案件の閲覧 | ○ | × | × |
| 割り当てられた案件の閲覧 | — | ○（自社分のみ） | ○（自社分のみ） |
| 割り当ての作成・編集 | ○ | × | × |
| 自社への割り当て閲覧 | — | ○ | ○ |
| 他社への割り当て閲覧 | — | × | × |
| アポイント登録 | ○ | ○ | ○ |
| 自社アポイント閲覧 | — | ○ | ○ |
| 全アポイント閲覧 | ○ | × | × |
| アポイント承認/却下 | ○ | × | × |
| アポイント取消 | ○ | × | × |
| 通知の閲覧 | ○（自分宛） | ○（自分宛） | ○（自分宛） |
| 監査ログ閲覧 | ○ | × | × |

### RLSによる実装

全テーブルでRow Level Security (RLS)を有効化し、`get_my_role()`関数でログインユーザーのロールを判定する。

- **Admin**: `get_my_role() = 'admin'` → 全データにアクセス可能
- **Partner/SubPartner**: `child_org_id = get_my_org_id()` → 自社が卸先の割り当てのみ閲覧可能
- **単価秘匿**: RLSにより、各企業は自社が`child_org_id`の割り当てレコードのみ閲覧可能。上位の卸単価は物理的にアクセス不可

---

## 5. 主要フロー

### 案件作成 → 割り当て → アポ登録 → 承認 → 通知 → 残数更新

```
1. [Admin] 案件を作成
   → projects テーブルに INSERT
   → max_appointments_total を設定

2. [Admin] パートナー企業に割り当て
   → allocations テーブルに INSERT
   → parent_org_id, child_org_id, payout_per_appointment, max_appointments_for_child を設定

3. [Partner] 割り当て案件一覧で案件を確認
   → RLS により自社の allocation のみ表示
   → 自社向けの単価・上限のみ閲覧可能

4. [Partner] アポイントを登録
   → appointments テーブルに INSERT (status = 'pending')
   → トリガーにより Admin 宛に通知を自動挿入

5. [Admin] アポイントを承認
   → approve_appointment() RPC を呼び出し
   → appointments.status を 'approved' に更新
   → allocations.confirmed_count を +1
   → projects.confirmed_count を +1
   → トリガーにより登録者宛に通知を自動挿入

6. [Admin] アポイントを却下（必要時）
   → reject_appointment() RPC を呼び出し
   → appointments.status を 'rejected' に更新
   → rejected_reason を記録

7. [Admin] 承認済みアポイントを取消（必要時）
   → cancel_appointment() RPC を呼び出し
   → appointments.status を 'cancelled' に更新
   → allocations.confirmed_count を -1
   → projects.confirmed_count を -1
```

---

## 6. MVP実装計画

### 実装済み機能（MVP）

| カテゴリ | 機能 | 状態 |
|---------|------|------|
| 認証 | Supabase Auth によるメール/パスワードログイン | 完了 |
| 認証 | ロールベースのルーティング（Admin / Partner） | 完了 |
| Admin | ダッシュボード（案件別サマリー、最近のアポ） | 完了 |
| Admin | 企業管理（CRUD、親子関係、ユーザー招待） | 完了 |
| Admin | 案件管理（CRUD、ステータス、上限設定） | 完了 |
| Admin | 割り当て管理（案件→企業、単価/上限/条件） | 完了 |
| Admin | アポ承認（pending一覧、承認/却下/取消） | 完了 |
| Admin | 通知一覧（未読管理、一括既読） | 完了 |
| Admin | 監査ログ | 完了 |
| Partner | ダッシュボード（自社進捗） | 完了 |
| Partner | 割り当て案件一覧 | 完了 |
| Partner | アポイント登録 | 完了 |
| Partner | アポイント一覧・詳細 | 完了 |
| Partner | 通知一覧 | 完了 |
| DB | RLS（全テーブル） | 完了 |
| DB | 承認/却下/取消のRPC関数（残数自動更新） | 完了 |
| DB | 通知自動挿入トリガー | 完了 |
| DB | 監査ログ自動記録トリガー | 完了 |

### 将来拡張候補

- メール通知（Supabase Edge Functions + Resend/SendGrid）
- CSV/Excelエクスポート
- アポイントの証跡ファイルアップロード（Supabase Storage）
- パートナー企業による下位企業への再割り当て機能
- 請求書自動生成
- ダッシュボードのグラフ可視化（Recharts）

---

## 7. リスクと落とし穴

| リスク | 対策 |
|--------|------|
| **単価漏洩** | RLSにより、各企業は自社が`child_org_id`の割り当てレコードのみ閲覧可能。上位の卸単価はDBレベルでアクセス不可。フロントエンドでも不要な単価情報を表示しない設計 |
| **二重計上** | `approve_appointment()`関数内でSELECT FOR UPDATEによる行ロックを実施。同時承認による二重カウントを防止 |
| **取消時の残数不整合** | `cancel_appointment()`関数内でconfirmed_countを-1する際、承認済みステータスの確認を必須化 |
| **権限漏れ** | 全テーブルでRLS有効化。`get_my_role()`関数でロール判定し、AdminのみALL権限、Partner/SubPartnerはSELECT+条件付きINSERT/UPDATEのみ |
| **同列他社の情報漏洩** | RLSポリシーで`child_org_id = get_my_org_id()`条件を強制。他社の割り当て・アポイントは物理的にクエリ不可 |
| **上限超過** | `approve_appointment()`関数内でallocation・projectの上限チェックを実施。上限到達時はRAISE EXCEPTIONで拒否 |
| **Supabase Auth と users テーブルの同期** | `handle_new_user`トリガーにより、auth.usersへのINSERT時にpublic.usersへ自動同期 |

---

## 8. プロジェクト構成と環境変数

### プロジェクト構成

```
crafia-appointment-platform/
├── client/
│   ├── index.html
│   ├── src/
│   │   ├── App.tsx                    # ルーティング・レイアウト
│   │   ├── index.css                  # グローバルスタイル
│   │   ├── main.tsx                   # エントリーポイント
│   │   ├── components/
│   │   │   ├── DashboardLayout.tsx     # サイドバー付きレイアウト
│   │   │   ├── PageHeader.tsx          # ページヘッダー
│   │   │   ├── StatusBadge.tsx         # ステータスバッジ
│   │   │   └── ui/                    # shadcn/ui コンポーネント
│   │   ├── contexts/
│   │   │   ├── AuthContext.tsx         # 認証コンテキスト
│   │   │   └── ThemeContext.tsx        # テーマコンテキスト
│   │   ├── lib/
│   │   │   ├── supabase.ts            # Supabaseクライアント・型定義
│   │   │   └── utils.ts               # ユーティリティ
│   │   └── pages/
│   │       ├── Login.tsx               # ログイン
│   │       ├── Notifications.tsx       # 通知（共通）
│   │       ├── NotFound.tsx            # 404
│   │       ├── admin/
│   │       │   ├── Dashboard.tsx       # Adminダッシュボード
│   │       │   ├── Organizations.tsx   # 企業管理
│   │       │   ├── Projects.tsx        # 案件管理
│   │       │   ├── Allocations.tsx     # 割り当て管理
│   │       │   ├── Approvals.tsx       # アポ承認
│   │       │   └── AuditLogs.tsx       # 監査ログ
│   │       └── partner/
│   │           ├── PartnerDashboard.tsx # Partnerダッシュボード
│   │           ├── MyAllocations.tsx    # 割り当て案件一覧
│   │           ├── NewAppointment.tsx   # アポ登録
│   │           └── Appointments.tsx     # アポ一覧
│   └── public/
├── server/                             # プレースホルダー
├── shared/                             # 共有定数
├── package.json
├── vite.config.ts
└── tsconfig.json
```

### 必要な環境変数

| 変数名 | 説明 | 設定場所 |
|--------|------|---------|
| `VITE_SUPABASE_URL` | SupabaseプロジェクトのURL | Manus Secrets / Vercel環境変数 |
| `VITE_SUPABASE_ANON_KEY` | Supabaseの匿名キー | Manus Secrets / Vercel環境変数 |

### Vercelデプロイ設定

Vercelにデプロイする際は、以下の設定が必要である。

- **Framework Preset**: Vite
- **Build Command**: `pnpm build`
- **Output Directory**: `dist/public`
- **Environment Variables**: 上記2つの環境変数を設定
- **Root Directory**: プロジェクトルート

---

## 9. Supabase DB関数一覧

| 関数名 | 引数 | 機能 |
|--------|------|------|
| `get_my_role()` | なし | 現在のログインユーザーのロールを返す |
| `get_my_org_id()` | なし | 現在のログインユーザーの所属企業IDを返す |
| `approve_appointment()` | `p_appointment_id`, `p_approver_id` | アポイントを承認し、残数を更新（行ロック付き） |
| `reject_appointment()` | `p_appointment_id`, `p_approver_id`, `p_reason` | アポイントを却下 |
| `cancel_appointment()` | `p_appointment_id`, `p_reason` | 承認済みアポイントを取消し、残数を戻す |

---

## 10. テストアカウント

| ロール | メールアドレス | 備考 |
|--------|---------------|------|
| Admin | `admin@crafia.jp` | Supabase Authで作成済み。パスワードはSupabaseダッシュボードで確認・リセット可能 |
