import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Табель смен",
  description: "Автоматическое заполнение табеля смен по фото из Telegram-групп",
  icons: { icon: "/icon.svg" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
