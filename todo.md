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
- [x] GitHubプッシュ・Vercel再デプロイ

## v1.7.1 バグ修正: 案件削除の外部キー制約エラー
- [x] allocations_project_id_fkey違反を修正（削除順序: appointments→allocations→projects）
- [x] AlertDialogActionのe.preventDefault()でダイアログ自動閉じを防止

## v1.7.2 バグ修正: 案件作成時に保存できない場合がある
- [x] handleSaveをtry-catch-finallyで堅牢化、エラー詳細表示、user検証追加、saving状態の確実なリセット

## v1.7.3 ユーザーPW変更を無効化
- [x] ユーザーのパスワード変更機能を無効化する（リセットボタン・ダイアログ・関数を削除）

## v1.7.4 バグ修正: パートナーに割り当て済み案件が表示されない
- [x] パートナー側の案件表示ロジックを調査・修正（ユーザーのorg_idが全員Crafia本部になっていたためDB修正）

## v1.7.5 バグ修正: 全ユーザーでタブ切り替え時にロード中のまま止まる
- [x] 全ページのデータ取得・ローディングロジックを調査・修正（10ファイル: try-catch-finally統一、user null時のloading解除）
- [x] GitHubプッシュ・Vercel確認

## v1.8.0 UI改善・承認再要求機能
- [x] アポ登録画面: 卸単価を非表示にし、残枠のみ表示
- [x] パートナーダッシュボード: 「自社承認」「自社待ち」「卸単価」を非表示
- [x] アポ一覧: 保留中アポに「承認再要求」ボタンを追加
- [x] 承認再要求ボタン押下時に本部メアドにメール通知を送信（/api/email/approval-requestエンドポイント）
- [x] GitHubプッシュ

## v1.8.1 アポ一覧に月別フィルター機能を追加
- [x] アポ一覧に月選択UIを追加し、月毎にアポを絞り込めるようにする
- [x] GitHubプッシュ

## v1.9.0 商談日時修正・アポ編集機能・編集通知
- [x] 商談日時のタイムゾーン問題を修正（datetime-local→ISO変換でTZ考慮）
- [x] 保留中アポの編集機能を追加（編集ダイアログ・変更検出）
- [x] アポ編集時にCrafia本部にメール通知を送信（/api/email/appointment-edit）
- [x] GitHubプッシュ

## v1.9.1 アポ編集画面に削除機能を追加
- [x] 保留中アポの編集ダイアログに削除ボタンを追加（確認ダイアログ付き）
- [x] GitHubプッシュ

## v1.9.2 バグ修正: アポイント削除ボタンが動作しない
- [x] 削除が実行できない原因を調査・修正（RLSにDELETEポリシーがなかったため追加: partner_delete_own_pending_appointments）
- [x] GitHubプッシュ

## v1.9.3 代理店別アポ集計を商談日時ベースの月別集計に修正
- [x] 代理店別アポ集計を商談日時（meeting_datetime）で月別に分けて表示
- [x] GitHubプッシュ

## v2.0.0 アポステータスに「キャンセル」を追加
- [x] appointmentsテーブルのstatusカラムに「cancelled」を追加 (既に実装済み)
- [x] 管理者のアポ承認画面でキャンセル振り分けボタンを追加 (保留中アポにも追加)
- [x] 代理店別集計でキャンセル件数を表示 (既に実装済み)
- [x] アポ一覧・詳細でキャンセルステータスを表示 (既に実装済み)
- [x] GitHubプッシュ

## v2.1.0 承認済みアポの編集機能（Crafia本部のみ）
- [x] 管理者のアポ承認画面: 承認済みアポの編集ボタンを追加（Crafia本部のみ表示）
- [x] 承認済みアポの編集ダイアログを実装
- [x] 代理店のアポ一覧: 承認済みアポの編集ボタンを追加（Crafia本部のみ表示）
- [x] 承認済みアポ編集時にCrafia本部にメール通知を送信
- [ ] GitHubプッシュ

## v2.2.0 UI改善とバリデーション機能
- [x] アポ一覧に獲得者名を表示
- [x] 代理店のアポ一覧に取消項目を表示（管理者画面と同じ形式）
- [x] 案件管理の詳細にアプローチ禁止リストを追加（スプレッドシート埋め込み、代理店にも表示）
- [x] 先方企業名の重複チェック（同じ案件内で被った場合にエラー表示）
- [x] アポ登録に「獲得時の名乗り会社」プルダウンを追加（クライエント名/Crafia名乗り/自己着座）
- [ ] GitHubプッシュ

## v2.3.0 アポ一覧UI改善と機能制御
- [x] 管理画面のアポ一覧表示順序を変更（案件→先方企業名→...→獲得者名→商談日時）
- [x] 代理店画面のアポ一覧表示順序を変更（同じ順序）
- [x] Crafia本部のみ承認済みアポを編集可能に制限
- [x] 他のアカウントは保留中のアポのみ編集可能に制限
- [x] キャンセル済みアポの日程修正で再承認フローを実行
- [ ] GitHub プッシュ

## v2.3.1 キャッシュ制御
- [x] Vercelのキャッシュヘッダーを設定してデプロイ後に自動で最新バージョンが表示されるようにする
- [x] GitHubプッシュとVercelデプロイ

## v2.4.0 案件番号表示・DB修正・名乗り会社保存
- [x] アポ一覧の案件項目の左側に案件番号を表示（管理者・代理店両方）
- [x] Supabaseのprojectsテーブルにprohibited_list_urlカラムを追加
- [x] Supabaseのappointmentsテーブルにacquisition_company_typeカラムを追加
- [x] スプレッドシート（アプローチ禁止リスト）の保存エラーを修正
- [x] 「獲得時の名乗り会社」の値がDBに正しく保存されるように修正
- [x] TypeScript型定義を更新（Project, Appointment）
- [x] GitHubプッシュとVercelデプロイ

## v2.5.0 CSV・UI改善
- [x] アポ一覧のCSVダウンロード機能を追加（管理者・代理店両方）
- [x] 案件番号に［］括弧を付ける（管理者・代理店両方のアポ一覧・アポ登録）
- [x] メモ欄のプレースホルダーを詳細内容に変更（補足情報を記入・先方ニーズ/課題・取得チャネル・温度感 など）
- [x] GitHubプッシュとVercelデプロイ

## v2.6.0 重複チェック改善・表記修正
- [x] 重複チェックをブロックから確認ダイアログに変更（重複があっても登録可能に）
- [x] 「クライエント名」→「クライアント名」に修正
- [x] GitHubプッシュとVercelデプロイ

## v3.0.0 二次代理店機能
- [x] DB: organizationsテーブルにparent_org_id（親子代理店紐づけ）は既に存在
- [x] DB: usersテーブルにplain_passwordカラムを追加
- [x] Crafia本部が全ユーザーのパスワードを確認できる機能
- [x] 一次代理店が二次代理店のアポを確認できる機能
- [x] 二次代理店のアポ登録時にCrafia本部にメール通知（既存の通知機能で対応済み）
- [x] 代理店別集計で一次＋二次の合算表示
- [x] 一次代理店の詳細から二次代理店の内訳表示（タブ切り替え）
- [x] GitHubプッシュとVercelデプロイ

## v3.1.0 割り当て管理改善
- [x] 割り当て管理で企業ごと・案件ごとでソートできるようにする
- [x] 案件選択プルダウンを案件番号順にソートする
- [x] 割り当て案件を削除できるようにする
- [x] GitHubプッシュとVercelデプロイ

## v3.2.0 企業管理PW機能
- [x] 企業管理でCrafia本部が代理店のPWを登録できるようにする
- [x] 企業管理でCrafia本部が代理店のPWを編集できるようにする
- [x] 企業管理でCrafia本部が代理店のPWを確認できるようにする
- [x] GitHubプッシュとVercelデプロイ

## v3.3.0 二次代理店管理タブ・PW更新
- [x] パスワード更新（feelson→feelson123, useful→useful123, resta→resta0314）
- [x] 一次代理店画面に「二次代理店管理」タブを追加
- [x] 二次代理店のアポ数・状況の管理機能
- [x] 二次代理店の支払い管理機能
- [x] GitHubプッシュとVercelデプロイ

## v3.4.0 案件ステータス「無効」「終了」の挙動修正
- [x] 無効(inactive): 割り当て案件一覧に表示するがアポ登録不可（上限到達時と同じUI表示）
- [x] 無効(inactive): アポ登録画面のプルダウンで選択不可（disabled）
- [x] 終了(closed): 代理店の割り当て案件一覧から非表示
- [x] 終了(closed): アポ登録画面のプルダウンから非表示
- [x] 両ステータス共通: 既存アポ・ダッシュボード・承認画面には影響なし
- [x] GitHubプッシュとVercelデプロイ

## v3.4.1 割り当て案件が代理店に表示されない問題の修正
- [x] 大藏一登アカウントで割り当て案件が表示されない原因調査
- [x] 問題の修正（DB修正 + RPC修正 + UI改善）
- [x] 同様の問題が起こらないよう根本対策（admin_create_user RPC修正 + 階層表示UI）
- [x] GitHubプッシュ

## v3.5.0 割り当て案件の自動継承システム
- [x] 親企業の割り当て案件を子企業に自動継承する仕組み
- [x] 子企業ごと・案件ごとの卸単価テーブル（sub_allocation_prices）
- [x] 代理店側の割り当て案件表示を継承対応に修正（MyAllocations, NewAppointment）
- [x] 管理者（Crafia）の卸単価設定UI
- [x] 親企業（useful）の卸単価設定UI
- [x] アポ登録・ダッシュボード等の関連画面を継承対応に修正
- [x] 既存データの移行（大藏等の個別割り当てを卸単価データに変換）
- [x] テスト追加（15件のユニットテスト全パス）
- [x] GitHubプッシュ

## v3.5.1 二次代理店卸単価画面の修正
- [x] 管理者の二次代理店卸単価画面で一次代理店が二次代理店として表示される問題を修正
- [x] 「親単価を継承」の表現をわかりやすく変更（「未設定（一次代理店と同額）」に変更）
- [x] 継承案件数が0件と表示される問題を修正（一次代理店のallocationsを正しく参照）
- [x] GitHubプッシュ

## v3.5.2 二次代理店で案件が見れない問題の修正
- [x] 二次代理店アカウントで案件が表示されない原因調査（RLSポリシーが親企業のallocationsへのアクセスをブロック）
- [x] 問題の修正（RLS無限再帰をSECURITY DEFINER関数get_my_parent_org_id()で解決）
- [x] GitHubプッシュ

## v3.5.3 UI修正
- [x] サイドバーの「Sub Partner」表示を消す
- [x] 二次代理店に卸単価未設定時は単価を非表示にする（1次受けの単価を見せない）
- [x] GitHubプッシュ

## v3.5.4 バグ修正: タブ切り替え・時間経過でローディングが止まらなくなる
- [x] 原因調査（AuthContext・データ取得ロジック・Supabaseセッション管理）
- [x] 修正実装
- [x] GitHubプッシュ

## v3.5.5 UI修正: 二次代理店卸単価設定ページの横幅を広げる
- [x] 卸単価設定ページの横幅を広げる
- [ ] GitHubプッシュ
