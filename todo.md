# 変更タスク TODO

## DB変更
- [ ] projectsテーブルにカラム追加: project_number, company_name, service_name, service_overview, project_detail, acquisition_conditions, scheduling_url, priority, monthly_limit(null=無限)
- [ ] allocationsテーブルからmax_appointments, conditionsを削除（シンプル化）

## フロントエンド
- [ ] 案件管理画面: 入力項目を拡張
- [ ] 割り当て管理画面: パートナーごとの上限・条件を削除
- [ ] ユーザー一覧: 削除ボタンが表示されるよう修正

## メール通知
- [x] 現状のアポ登録フロー（NewAppointment.tsx）を確認
- [x] メール送信方法の選定 → Gmail + Nodemailer
- [x] メール送信機能の実装（server/email.ts, server/emailRoutes.ts）
- [x] アポ登録フローにメール送信を組み込む（NewAppointment.tsx）
- [x] テスト・動作確認（vitest + API テスト成功）
- [x] GitHub push・Vercel再デプロイ

## Facebookアカウント貸出管理
- [x] Supabaseにsns_accountsテーブルを作成（ID/PW/アカウント名/貸出先/ステータス）
- [x] 管理者向けアカウント一覧画面の実装
- [x] アカウント新規登録機能の実装
- [x] アカウント編集・削除機能の実装
- [x] パートナーへの貸出割り当て・解除機能の実装
- [x] サイドバーにメニュー追加
- [ ] テスト・動作確認
- [ ] GitHub push・Vercel再デプロイ
