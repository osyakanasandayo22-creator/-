/**
 * Firebase 設定（投稿をネット上に保存）
 *
 * セットアップ手順:
 * 1. https://console.firebase.google.com/ でプロジェクトを作成
 * 2. 「プロジェクトの設定」→「一般」→「マイアプリ」で Web アプリを追加
 * 3. 表示された firebaseConfig をコピーして、下の firebaseConfig を置き換える
 * 4. 「Firestore Database」→「データベースを作成」（本番モードで開始後、ルールを下記のように変更可能）
 *
 * Firestore セキュリティルール（開発時は「ルール」タブで以下を設定）:
 *   rules_version = '2';
 *   service cloud.firestore {
 *     match /databases/{database}/documents {
 *       match /posts/{postId} {
 *         allow read, write: if true;  // 開発用。本番では認証条件を追加すること
 *       }
 *     }
 *   }
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
