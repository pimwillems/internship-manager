import { redirect } from "next/navigation";

import { getSession } from "@/lib/session";
import { getActiveSemester, getSemesters } from "@/lib/semester";
import { AppSidebar } from "@/components/app-sidebar";
import { MobileNav } from "@/components/mobile-nav";
import { SemesterSwitcher } from "@/components/semester-switcher";
import { UserMenu } from "@/components/user-menu";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  const [semesters, active] = await Promise.all([
    getSemesters(),
    getActiveSemester(),
  ]);

  return (
    <div className="flex min-h-dvh">
      <AppSidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center gap-3 border-b px-4">
          <MobileNav />
          <SemesterSwitcher
            semesters={semesters}
            activeId={active?.id ?? null}
          />
          <div className="ml-auto">
            <UserMenu email={session.user.email} />
          </div>
        </header>
        <main id="main-content" className="min-w-0 flex-1 p-4 md:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
