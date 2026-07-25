import { notFound } from "next/navigation";

import { getActiveSemester } from "@/lib/semester";
import { getStudentById, getTopicOptions } from "@/lib/students";
import { getAssessorOptions } from "@/lib/assessor-options";
import { PageHeader } from "@/components/page-header";
import { StudentForm, type StudentFormValues } from "../student-form";

export default async function StudentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  // `/students/new` is handled by this same route.
  if (id === "new") {
    const semester = await getActiveSemester();
    if (!semester) notFound();
    const [topics, assessorOptions] = await Promise.all([
      getTopicOptions(),
      getAssessorOptions(semester.id),
    ]);

    const blank: StudentFormValues = {
      studentNumber: "",
      name: "",
      email: "",
      topicId: null,
      internshipStatus: "none",
      company: "",
      assignmentDescription: "",
      remarks: "",
      firstAssessorId: null,
      secondAssessorId: null,
    };

    return (
      <>
        <PageHeader
          title="New student"
          description={`Added to ${semester.name}.`}
        />
        <StudentForm
          semesterId={semester.id}
          initial={blank}
          topics={topics}
          assessorOptions={assessorOptions}
        />
      </>
    );
  }

  const studentId = Number(id);
  if (!Number.isInteger(studentId)) notFound();

  const student = await getStudentById(studentId);
  if (!student) notFound();

  const [topics, assessorOptions] = await Promise.all([
    getTopicOptions(),
    getAssessorOptions(student.semesterId),
  ]);

  const initial: StudentFormValues = {
    studentNumber: student.studentNumber,
    name: student.name,
    email: student.email ?? "",
    topicId: student.topicId,
    internshipStatus: student.internshipStatus,
    company: student.company ?? "",
    assignmentDescription: student.assignmentDescription ?? "",
    remarks: student.remarks ?? "",
    firstAssessorId: student.firstAssessorId,
    secondAssessorId: student.secondAssessorId,
  };

  return (
    <>
      <PageHeader
        title={student.name}
        description={`${student.studentNumber}${student.topicName ? ` · ${student.topicName} (${student.topicTeamName})` : ""}`}
      />
      <StudentForm
        studentId={student.id}
        semesterId={student.semesterId}
        initial={initial}
        topics={topics}
        assessorOptions={assessorOptions}
      />
    </>
  );
}
