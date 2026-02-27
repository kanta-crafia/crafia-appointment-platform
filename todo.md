# ログイン方式変更 TODO

- [ ] Supabase: usersテーブルにlogin_id, password_hash カラム追加
- [ ] Supabase: login_idのユニーク制約追加
- [ ] Supabase: カスタムログイン用RPC関数作成（login_id + password → JWT）
- [ ] Supabase: Adminユーザーのlogin_id設定
- [ ] フロント: ログイン画面をユーザーID+PW方式に変更
- [ ] フロント: AuthContextをカスタム認証に対応
- [ ] フロント: 企業管理画面でユーザーのlogin_id/PW表示・編集機能追加
- [ ] フロント: Admin用ユーザー管理でPWリセット機能追加
- [ ] テスト・動作確認
- [ ] チェックポイント保存
