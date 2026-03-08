/**
 * Firebase 設定（投稿をネット上に保存）
 *
 * セットアップ手順:
 * 1. https://console.firebase.google.com/ でプロジェクトを作成
 * 2. 「プロジェクトの設定」→「一般」→「マイアプリ」で Web アプリを追加
 * 3. 表示された firebaseConfig をコピーして、下の firebaseConfig を置き換える
 * 4. 「Firestore Database」→「データベースを作成」
 * 5. 「Authentication」→「始める」→「Sign-in method」で「メール/パスワード」と「Google」を有効化
 *
 * Firestore セキュリティルール（「ルール」タブで、ログイン済みユーザーのみ読み書きする例）:
 *   allow read, write: if request.auth != null;
 *
 * 開発用（誰でも読み書き）:
 *   match /posts/{postId} { allow read, write: if true; }
 *   match /users/{userId} { allow read, write: if request.auth != null && request.auth.uid == userId; }  // プロフィール（アイコン）用
 */
var firebaseConfig = {
    apiKey: "AIzaSyAzzkgrAor-T8SlObNHj7Ukkkns3_kcnbs",
    authDomain: "philostream.firebaseapp.com",
    projectId: "philostream",
    storageBucket: "philostream.firebasestorage.app",
    messagingSenderId: "644154075638",
    appId: "1:644154075638:web:bc5bf18d1e437a27703fd7",
    measurementId: "G-VHHCHE2N2C"
};
