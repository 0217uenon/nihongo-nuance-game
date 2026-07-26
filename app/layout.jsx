export const metadata = {
  title: "ことばの森｜日本語ニュアンスゲーム",
  description: "生き物たちと、似ている日本語の微妙な違いを学ぶ子ども向けクイズアプリ",
};

export default function RootLayout({ children }) {
  return (
    <html lang="ja">
      <body style={{ margin: 0 }}>{children}</body>
    </html>
  );
}
