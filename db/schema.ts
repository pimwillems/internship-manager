import { relations, sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";

/* ------------------------------------------------------------------ *
 * Better Auth owned tables.
 * Property keys use Better Auth's field names (camelCase); the global
 * `casing: "snake_case"` in drizzle.config.ts maps them to snake_case
 * columns. Do not hand-add columns here beyond `role` (an additionalField
 * declared in lib/auth.ts).
 * ------------------------------------------------------------------ */

export const user = pgTable("user", {
  id: text().primaryKey(),
  name: text().notNull(),
  email: text().notNull().unique(),
  emailVerified: boolean().notNull().default(false),
  image: text(),
  role: text().notNull().default("coordinator"),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

export const session = pgTable("session", {
  id: text().primaryKey(),
  expiresAt: timestamp({ withTimezone: true }).notNull(),
  token: text().notNull().unique(),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  ipAddress: text(),
  userAgent: text(),
  userId: text()
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
});

export const account = pgTable("account", {
  id: text().primaryKey(),
  accountId: text().notNull(),
  providerId: text().notNull(),
  userId: text()
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text(),
  refreshToken: text(),
  idToken: text(),
  accessTokenExpiresAt: timestamp({ withTimezone: true }),
  refreshTokenExpiresAt: timestamp({ withTimezone: true }),
  scope: text(),
  password: text(),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

export const verification = pgTable("verification", {
  id: text().primaryKey(),
  identifier: text().notNull(),
  value: text().notNull(),
  expiresAt: timestamp({ withTimezone: true }).notNull(),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

/* ------------------------------------------------------------------ *
 * Application tables.
 * ------------------------------------------------------------------ */

export const internshipStatus = pgEnum("internship_status", [
  "none",
  "pending",
  "approved",
  "rejected",
]);

export const semesters = pgTable("semesters", {
  id: integer().generatedAlwaysAsIdentity().primaryKey(),
  name: text().notNull(),
  startsOn: date(),
  endsOn: date(),
  isActive: boolean().notNull().default(false),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

export const teams = pgTable("teams", {
  id: integer().generatedAlwaysAsIdentity().primaryKey(),
  name: text().notNull().unique(),
});

export const topics = pgTable("topics", {
  id: integer().generatedAlwaysAsIdentity().primaryKey(),
  name: text().notNull(),
  teamId: integer()
    .notNull()
    .references(() => teams.id, { onDelete: "restrict" }),
});

export const assessors = pgTable("assessors", {
  id: integer().generatedAlwaysAsIdentity().primaryKey(),
  name: text().notNull(),
  email: text(),
  teamId: integer()
    .notNull()
    .references(() => teams.id, { onDelete: "restrict" }),
  isActive: boolean().notNull().default(true),
});

export const assessorCapacity = pgTable(
  "assessor_capacity",
  {
    id: integer().generatedAlwaysAsIdentity().primaryKey(),
    assessorId: integer()
      .notNull()
      .references(() => assessors.id, { onDelete: "cascade" }),
    semesterId: integer()
      .notNull()
      .references(() => semesters.id, { onDelete: "cascade" }),
    maxAsFirst: integer().notNull().default(0),
  },
  (t) => [unique("assessor_capacity_assessor_semester").on(t.assessorId, t.semesterId)]
);

export const students = pgTable(
  "students",
  {
    id: integer().generatedAlwaysAsIdentity().primaryKey(),
    semesterId: integer()
      .notNull()
      .references(() => semesters.id, { onDelete: "restrict" }),
    studentNumber: text().notNull(),
    firstName: text().notNull(),
    lastName: text().notNull(),
    email: text(),
    topicId: integer().references(() => topics.id, { onDelete: "restrict" }),
    internshipStatus: internshipStatus().notNull().default("none"),
    company: text(),
    assignmentDescription: text(),
    remarks: text(),
    firstAssessorId: integer().references(() => assessors.id, {
      onDelete: "restrict",
    }),
    secondAssessorId: integer().references(() => assessors.id, {
      onDelete: "restrict",
    }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("students_semester_number").on(t.semesterId, t.studentNumber),
    // A person cannot be both assessors on one student. Both NULL is allowed
    // (unassigned), so guard the equality rather than using IS DISTINCT FROM.
    check(
      "students_distinct_assessors",
      sql`${t.firstAssessorId} IS NULL OR ${t.secondAssessorId} IS NULL OR ${t.firstAssessorId} <> ${t.secondAssessorId}`
    ),
  ]
);

export const auditLog = pgTable("audit_log", {
  id: integer().generatedAlwaysAsIdentity().primaryKey(),
  userId: text().references(() => user.id, { onDelete: "set null" }),
  entity: text().notNull(),
  entityId: text().notNull(),
  action: text().notNull(),
  changes: jsonb(),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

/* ------------------------------------------------------------------ *
 * Relations (enable db.query relational lookups).
 * ------------------------------------------------------------------ */

export const teamsRelations = relations(teams, ({ many }) => ({
  topics: many(topics),
  assessors: many(assessors),
}));

export const topicsRelations = relations(topics, ({ one, many }) => ({
  team: one(teams, { fields: [topics.teamId], references: [teams.id] }),
  students: many(students),
}));

export const assessorsRelations = relations(assessors, ({ one, many }) => ({
  team: one(teams, { fields: [assessors.teamId], references: [teams.id] }),
  capacities: many(assessorCapacity),
}));

export const assessorCapacityRelations = relations(
  assessorCapacity,
  ({ one }) => ({
    assessor: one(assessors, {
      fields: [assessorCapacity.assessorId],
      references: [assessors.id],
    }),
    semester: one(semesters, {
      fields: [assessorCapacity.semesterId],
      references: [semesters.id],
    }),
  })
);

export const semestersRelations = relations(semesters, ({ many }) => ({
  students: many(students),
  capacities: many(assessorCapacity),
}));

export const studentsRelations = relations(students, ({ one }) => ({
  semester: one(semesters, {
    fields: [students.semesterId],
    references: [semesters.id],
  }),
  topic: one(topics, { fields: [students.topicId], references: [topics.id] }),
  firstAssessor: one(assessors, {
    fields: [students.firstAssessorId],
    references: [assessors.id],
    relationName: "firstAssessor",
  }),
  secondAssessor: one(assessors, {
    fields: [students.secondAssessorId],
    references: [assessors.id],
    relationName: "secondAssessor",
  }),
}));

export type Semester = typeof semesters.$inferSelect;
export type Team = typeof teams.$inferSelect;
export type Topic = typeof topics.$inferSelect;
export type Assessor = typeof assessors.$inferSelect;
export type AssessorCapacity = typeof assessorCapacity.$inferSelect;
export type Student = typeof students.$inferSelect;
export type InternshipStatus = (typeof internshipStatus.enumValues)[number];
