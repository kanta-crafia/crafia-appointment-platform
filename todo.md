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
- [x] 原因調査: sendEmailNotificationがawaitされず、直後のnavigate()でfetchがキャンセルされていた
- [x] 修正: await sendEmailNotification()を追加し、メール送信完了後にページ遷移するように変更
- [x] GitHubプッシュ・Vercel再デプロイ完了

## v1.4.0 UI改善・項目変更
- [x] 割り当て案件から案件の詳細を確認できるようにする（目アイコンで詳細ダイアログ表示）
- [x] ステータスが有効以外の時にアポ登録をできないようにする（割当・案件両方のステータスをチェック）
- [x] 案件管理のサービス項目を削除（テーブル・ダイアログ両方）
- [x] アポ登録: 証跡URLを削除
- [x] アポ登録: 獲得日と獲得者名を追加（DBカラムも追加済み）
- [x] アポ登録: 対象企業名→先方企業名、担当者名→先方担当者名にラベル変更（承認画面・パートナー一覧も対応）
- [x] DB: appointmentsテーブルにacquisition_date, acquirer_nameカラム追加
- [x] GitHubプッシュ・Vercel再デプロイ

## v1.5.0 アポ登録UI改善・残数管理
- [x] アポ登録: 案件選択時に案件番号と案件名をセットで表示
- [x] アポ登録: 全ての項目を必須入力にする
- [x] メール件名を【代理店/アポ獲得】(パートナー企業名) に変更（Edge Function更新済み）
- [x] 案件残数管理: confirmed_countを使った残数計算（max_appointments_total - confirmed_count）
- [x] 案件残数管理: アポ承認時にconfirmed_countを+1（approve_appointment関数で自動減算）
- [x] 案件残数管理: 管理者が案件編集ダイアログで残数を直接編集可能
- [x] 案件残数管理: パートナー側MyAllocationsに残数表示済み
- [x] 月次残数リセット: pg_cronで毎月1日JST 0:00にconfirmed_countを0にリセット
- [x] GitHubプッシュ・Vercel再デプロイ

## v1.6.0 通知改善・SNSアカウント変更・単価非表示
- [x] 通知: 当日分のみ表示し、日付選択で過去の通知を閲覧可能にする
- [x] SNSアカウント: Gmailアドレス/PW、アカウント名/PW、備考、貸出先企業に項目変更（DBカラム追加済み）
- [x] パートナー画面: 案件詳細で案件単価を非表示にし、割り当て金額のみ表示する
- [x] GitHubプッシュ・Vercel再デプロイ

## v1.7.0 案件削除機能
- [x] 案件管理画面に案件削除ボタンを追加（確認ダイアログ付き）
- [ ] GitHubプッシュ・Vercel再デプロイ
