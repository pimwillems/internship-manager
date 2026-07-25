import { alias } from "drizzle-orm/pg-core";
import { asc, eq } from "drizzle-orm";

import { assessors, students, teams, topics } from "@/db/schema";
import { db } from "@/lib/db";

const firstAssessor = alias(assessors, "first_assessor");
const secondAssessor = alias(assessors, "second_assessor");

export type StudentRow = Awaited<
  ReturnType<typeof getStudentsForSemester>
>[number];

/**
 * Students in a semester with their topic, the team that owns that topic, and
 * both assessors resolved. Shared by the students table, the dashboard, the
 * planning board and the Excel export so they never drift apart.
 */
export async function getStudentsForSemester(semesterId: number) {
  return db
    .select({
      id: students.id,
      studentNumber: students.studentNumber,
      name: students.name,
      email: students.email,
      topicId: students.topicId,
      topicName: topics.name,
      topicTeamId: topics.teamId,
      topicTeamName: teams.name,
      internshipStatus: students.internshipStatus,
      company: students.company,
      assignmentDescription: students.assignmentDescription,
      remarks: students.remarks,
      firstAssessorId: students.firstAssessorId,
      firstAssessorName: firstAssessor.name,
      secondAssessorId: students.secondAssessorId,
      secondAssessorName: secondAssessor.name,
    })
    .from(students)
    .leftJoin(topics, eq(topics.id, students.topicId))
    .leftJoin(teams, eq(teams.id, topics.teamId))
    .leftJoin(firstAssessor, eq(firstAssessor.id, students.firstAssessorId))
    .leftJoin(secondAssessor, eq(secondAssessor.id, students.secondAssessorId))
    .where(eq(students.semesterId, semesterId))
    .orderBy(asc(students.name));
}

/** One student with the same shape as the list rows. */
export async function getStudentById(id: number) {
  const [row] = await db
    .select({
      id: students.id,
      semesterId: students.semesterId,
      studentNumber: students.studentNumber,
      name: students.name,
      email: students.email,
      topicId: students.topicId,
      topicName: topics.name,
      topicTeamId: topics.teamId,
      topicTeamName: teams.name,
      internshipStatus: students.internshipStatus,
      company: students.company,
      assignmentDescription: students.assignmentDescription,
      remarks: students.remarks,
      firstAssessorId: students.firstAssessorId,
      secondAssessorId: students.secondAssessorId,
    })
    .from(students)
    .leftJoin(topics, eq(topics.id, students.topicId))
    .leftJoin(teams, eq(teams.id, topics.teamId))
    .where(eq(students.id, id));
  return row ?? null;
}

/** Topics with their owning team, for the topic picker. */
export async function getTopicOptions() {
  return db
    .select({
      id: topics.id,
      name: topics.name,
      teamId: topics.teamId,
      teamName: teams.name,
    })
    .from(topics)
    .innerJoin(teams, eq(teams.id, topics.teamId))
    .orderBy(asc(teams.name), asc(topics.name));
}
