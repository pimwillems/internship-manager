import "dotenv/config";
import { eq, sql } from "drizzle-orm";

import { db } from "../db";
import {
  assessorCapacity,
  assessors,
  semesters,
  students,
  teams,
  topics,
} from "../db/schema";

// The real team → topic catalog supplied by the coordinator.
const CATALOG: Record<string, string[]> = {
  "Team 1": [
    "AI Machine Learning & Data",
    "Applied Generative AI",
    "Business IT & Data Analysis",
  ],
  "Team 2": ["FED", "FSD"],
  "Team 3": [
    "Cyber Security Essentials",
    "Network & Cloud Automation",
    "Intelligent Devices",
  ],
  "Team 4": ["Game Design", "Open Learning", "Mobile Apps Development"],
};

async function upsertTeam(name: string) {
  const existing = await db.query.teams.findFirst({
    where: eq(teams.name, name),
  });
  if (existing) return existing;
  const [row] = await db.insert(teams).values({ name }).returning();
  return row;
}

async function main() {
  console.log("Seeding teams and topics…");
  const teamByName = new Map<string, number>();
  for (const teamName of Object.keys(CATALOG)) {
    const team = await upsertTeam(teamName);
    teamByName.set(teamName, team.id);
    for (const topicName of CATALOG[teamName]) {
      const exists = await db.query.topics.findFirst({
        where: (t, { and }) =>
          and(eq(t.name, topicName), eq(t.teamId, team.id)),
      });
      if (!exists) {
        await db.insert(topics).values({ name: topicName, teamId: team.id });
      }
    }
  }

  // Active semester.
  let semester = await db.query.semesters.findFirst({
    where: eq(semesters.isActive, true),
  });
  if (!semester) {
    [semester] = await db
      .insert(semesters)
      .values({
        name: "2026-2027 S1",
        startsOn: "2026-09-01",
        endsOn: "2027-01-31",
        isActive: true,
      })
      .returning();
    console.log(`Created active semester ${semester.name}`);
  }

  // A few placeholder assessors with per-semester capacity (replaced by the
  // real Excel import later). Only seed when there are none yet.
  const assessorCount = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(assessors);
  if (assessorCount[0].n === 0) {
    console.log("Seeding placeholder assessors + capacity…");
    const placeholders = [
      { name: "Alex de Vries", team: "Team 2", max: 2 },
      { name: "Bo Jansen", team: "Team 2", max: 1 },
      { name: "Chris Bakker", team: "Team 1", max: 3 },
      { name: "Dana Smit", team: "Team 3", max: 2 },
      { name: "Eli Meijer", team: "Team 4", max: 2 },
    ];
    for (const p of placeholders) {
      const [a] = await db
        .insert(assessors)
        .values({
          name: p.name,
          email: `${p.name.split(" ")[0].toLowerCase()}@example.com`,
          teamId: teamByName.get(p.team)!,
        })
        .returning();
      await db.insert(assessorCapacity).values({
        assessorId: a.id,
        semesterId: semester.id,
        maxAsFirst: p.max,
      });
    }
  }

  // A couple of placeholder students.
  const studentCount = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(students);
  if (studentCount[0].n === 0) {
    const fedTopic = await db.query.topics.findFirst({
      where: eq(topics.name, "FED"),
    });
    const fsdTopic = await db.query.topics.findFirst({
      where: eq(topics.name, "FSD"),
    });
    await db.insert(students).values([
      {
        semesterId: semester.id,
        studentNumber: "2100001",
        name: "Sam Visser",
        email: "sam.visser@student.example.com",
        topicId: fedTopic?.id,
        internshipStatus: "approved",
        company: "Acme Web",
        assignmentDescription: "Build a component library.",
      },
      {
        semesterId: semester.id,
        studentNumber: "2100002",
        name: "Robin Koning",
        email: "robin.koning@student.example.com",
        topicId: fsdTopic?.id,
        internshipStatus: "pending",
        company: "Beta Apps",
      },
    ]);
    console.log("Seeded placeholder students.");
  }

  console.log("Seed complete.");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
