import { asc, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { assessors, semesters, students, teams, topics } from "@/db/schema";
import { PageHeader } from "@/components/page-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SemestersPanel } from "./semesters-panel";
import { TeamsPanel } from "./teams-panel";
import { TopicsPanel } from "./topics-panel";
import { AccountPanel } from "./account-panel";

export const metadata = { title: "Settings — Internship Coordination" };

export default async function SettingsPage() {
  const [allSemesters, allTeams, allTopics, studentCounts, teamUsage] =
    await Promise.all([
      db.select().from(semesters).orderBy(asc(semesters.name)),
      db.select().from(teams).orderBy(asc(teams.name)),
      db
        .select({
          id: topics.id,
          name: topics.name,
          teamId: topics.teamId,
          teamName: teams.name,
          studentCount: sql<number>`(select count(*)::int from ${students} s where s.topic_id = ${topics.id})`,
        })
        .from(topics)
        .innerJoin(teams, sql`${teams.id} = ${topics.teamId}`)
        .orderBy(asc(teams.name), asc(topics.name)),
      db
        .select({
          semesterId: students.semesterId,
          n: sql<number>`count(*)::int`,
        })
        .from(students)
        .groupBy(students.semesterId),
      db
        .select({
          teamId: teams.id,
          topicCount: sql<number>`(select count(*)::int from ${topics} t where t.team_id = ${teams.id})`,
          assessorCount: sql<number>`(select count(*)::int from ${assessors} a where a.team_id = ${teams.id})`,
        })
        .from(teams),
    ]);

  const studentsBySemester = new Map(
    studentCounts.map((r) => [r.semesterId, r.n])
  );
  const usageByTeam = new Map(teamUsage.map((r) => [r.teamId, r]));

  return (
    <>
      <PageHeader
        title="Settings"
        description="Semesters, teams, the topic catalog and your account. Everything here is editable without touching the database."
      />
      <Tabs defaultValue="semesters">
        <TabsList>
          <TabsTrigger value="semesters">Semesters</TabsTrigger>
          <TabsTrigger value="teams">Teams</TabsTrigger>
          <TabsTrigger value="topics">Topics</TabsTrigger>
          <TabsTrigger value="account">Account</TabsTrigger>
        </TabsList>

        <TabsContent value="semesters" className="mt-4">
          <SemestersPanel
            semesters={allSemesters}
            studentCounts={Object.fromEntries(studentsBySemester)}
          />
        </TabsContent>
        <TabsContent value="teams" className="mt-4">
          <TeamsPanel
            teams={allTeams.map((t) => ({
              ...t,
              topicCount: usageByTeam.get(t.id)?.topicCount ?? 0,
              assessorCount: usageByTeam.get(t.id)?.assessorCount ?? 0,
            }))}
          />
        </TabsContent>
        <TabsContent value="topics" className="mt-4">
          <TopicsPanel topics={allTopics} teams={allTeams} />
        </TabsContent>
        <TabsContent value="account" className="mt-4">
          <AccountPanel />
        </TabsContent>
      </Tabs>
    </>
  );
}
