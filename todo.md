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

## バグ修正
- [x] パートナーアカウントでログイン時「Database error querying schema」エラーを修正
  - 原因: admin_create_user関数でauth.usersにINSERT時、recovery_token/email_change/email_change_token_newがNULLのまま
  - 修正1: userAのauth.usersレコードのNULLカラムを空文字列に更新
  - 修正2: admin_create_user関数を修正し、全トークンカラムに空文字列を設定するよう変更
- [x] リロード時に無限ローディングになる問題を修正（キャッシュクリアで復帰する）
  - 原因: supabase-js v2のWeb Locks API (navigator.locks) がリロード時にデッドロック
  - 修正: AuthContextでlocalStorageからの即時セッション読み取りを追加し、getSession()のハングを回避
- [x] アポ承認時のエラーを修正
  - 原因: appointmentsテーブルにupdated_atカラムが存在しないのに、approve/reject/cancel関数が参照していた
  - 修正: appointmentsテーブルにupdated_atカラムを追加
- [x] approve_appointment関数のシグネチャ不一致エラーを修正（フロントが2引数で呼び出し、DB関数は1引数）
  - approve_appointment: (p_appointment_id, p_approver_id) に修正、approved_by/approved_atも設定
  - reject_appointment: (p_appointment_id, p_approver_id, p_reason) に修正
  - cancel_appointment: (p_appointment_id, p_reason) に修正
- [x] リロード時の無限ローディング問題を確実に解消する（前回の修正では不十分）
  - 根本原因: Supabase Auth JS v2のWeb Locks API (navigator.locks) がsignInWithPasswordとgetSessionの両方でデッドロック
  - 修正: supabase.tsにnoOpLock関数を追加してWeb Locksを完全にバイパス
  - AuthContextをシンプルなgetSession()ベースの実装に簡素化
  - ログイン・リロード両方が本番環境で正常動作を確認

## アポ登録時の管理者メール通知
- [x] パートナーがアポ登録した際に管理者（kanta@crafia-hd.com）にメール通知を送信する
  - Supabase Edge Function (send-appointment-email) + Resend APIで実装
  - Vercel静的デプロイでも動作する方式
- [x] テスト・動作確認（curlでEdge Functionの直接テスト成功）
- [x] GitHubプッシュ・Vercel再デプロイ完了

## システムバージョン表示
- [x] サイドバー上部（ダッシュボードの上）にバージョン番号を表示する
- [x] バージョン定数を一元管理するファイルを作成する (shared/version.ts)
- [x] GitHubプッシュ・Vercel再デプロイ

## バグ修正: アポ登録時のメール通知が届かない
- [ ] 原因調査（フロントエンドのメール送信コード、Edge Functionの呼び出し）
- [ ] 修正・テスト
- [ ] GitHubプッシュ・Vercel再デプロイ
