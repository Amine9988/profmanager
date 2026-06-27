import { getStudents } from "@/server/actions/students";
import { StudentsTable } from "@/components/students/students-table";
import { StudentCreateDialog } from "@/components/students/student-create-dialog";
import { ExportStudentsButton } from "@/components/students/export-students-button";
import { ImportStudentsDialog } from "@/components/students/import-students-dialog";
import { getT, getInitialLocale } from "@/lib/i18n";

export const dynamic = "force-dynamic";

export default async function StudentsPage() {
  const students = await getStudents();
  const locale = await getInitialLocale();
  const t = await getT(locale);

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t("students.title")}</h1>
        <div className="flex items-center gap-2">
          <ExportStudentsButton data={students} />
          <ImportStudentsDialog />
          <StudentCreateDialog />
        </div>
      </div>
      <StudentsTable data={students} />
    </div>
  );
}
