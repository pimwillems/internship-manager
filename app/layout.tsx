import type { Metadata } from "next";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";

export const metadata: Metadata = {
  title: "Internship Coordination",
  description: "Coordinate internship students, assessors and capacity.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased" suppressHydrationWarning>
      <head>
        <script
          // Applies the saved high-contrast preference before paint so
          // toggling it doesn't cause a flash of the wrong theme.
          dangerouslySetInnerHTML={{
            __html: `try{if(localStorage.getItem("a11y-high-contrast")==="1"){document.documentElement.classList.add("a11y-high-contrast")}}catch(e){}`,
          }}
        />
      </head>
      <body className="min-h-full">
        <a
          href="#main-content"
          className="bg-background text-foreground focus-visible:ring-ring sr-only rounded-md border px-4 py-2 text-sm font-medium focus-visible:not-sr-only focus-visible:fixed focus-visible:top-4 focus-visible:left-4 focus-visible:z-50 focus-visible:ring-2"
        >
          Skip to main content
        </a>
        {children}
        <Toaster richColors closeButton />
      </body>
    </html>
  );
}
