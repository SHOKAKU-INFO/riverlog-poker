# RIVERLOG

海外遠征する日本人ポーカープレイヤー向けの、マルチ通貨収支・プレイヤーメモ PWA。スクリーンショットは機能の参考として使い、独自の UI にしました。

## ローカルで動かす

Node.js 22 以上を使用します。

```sh
npm ci
npm run dev
```

Firebase を設定していない場合も、端末内に保存するデモとして使えます。デモデータは本番アカウントに自動移行されません。

```sh
cp .env.example .env.local
```

`.env.local` に Firebase Web アプリの `apiKey`、`authDomain`、`projectId`、`appId` を設定すると、Google ログインと Firestore 同期が有効になります。Firebase Console で Google プロバイダーを有効にし、Pages の本番ドメインを承認済みドメインに登録します。初版の認証方式はポップアップです。Firebase は Spark プランを使い、Storage と Functions は使用しません。

## Cloudflare Pages

GitHub リポジトリを Pages に接続し、ビルドコマンドを `npm run build`、出力先を `dist`、本番ブランチを `main` にします。`functions/api/rate.ts` が同時に Pages Function としてデプロイされ、Frankfurter の日次レートを取得します。Cloudflare の無料枠内で動作する構成です。独自ドメインは必須ではありません。

Vite の `npm run dev` は Pages Functions を起動しません。為替の実動作は `npm run build` 後に `npx wrangler pages dev dist` または Pages プレビューで確認します。

## Firebase セキュリティルール

`firestore.rules` と `firestore.indexes.json` はコード管理します。ルールは所有者 UID のみアクセス可能で、主要な入力項目を検証します。Firebase プロジェクトへの初回適用には下記を実行します。

```sh
npm run test:rules:emu
npx firebase login
npx firebase deploy --only firestore:rules,firestore:indexes --project YOUR_PROJECT_ID
```

GitHub Actions の `verify` は PR と main で lint、計算テスト、Rules Emulator テスト、ビルドを実行します。main の `deploy-firestore` は成功した検証後に Workload Identity Federation でルールを公開します。GitHub リポジトリで `GCP_WORKLOAD_IDENTITY_PROVIDER`、`GCP_FIREBASE_DEPLOY_SERVICE_ACCOUNT`、`FIREBASE_PROJECT_ID` の Repository Variables を設定し、対象リポジトリからのみ impersonate できる Google Cloud service account を設定してください。`main` に `verify` 必須チェックを設定し、直接 push を制限します。Pages の Git 連携が main マージ後に本番サイトを公開します。

Cloudflare のプレビュー URL は公開されます。プレビューでは本番 Firebase の環境変数を渡さず、デモモードにするか別の Spark プロジェクトを使います。

## データと為替の扱い

金額は通貨の最小単位の整数で保存します。円換算はセッション終了時の Frankfurter 参考レートを固定保存し、後日レートが変わっても記録時の円換算は変えません。実際の両替やカード決済レートではありません。為替が取得できない場合は現地通貨のみ保存します。

エクスポートはブラウザ内で CSV を生成します。画像のアップロードと Firebase Storage は使用しません。

## 検証

```sh
npm run lint
npm test
npm run test:rules:emu
npm run build
```

詳しい仕様と未実装の拡張候補は [PRODUCT_SPEC.md](PRODUCT_SPEC.md) を参照してください。
