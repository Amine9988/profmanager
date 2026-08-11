import { getWeeklyProgram } from "@/server/actions/weekly-program";
import WeeklyProgramView from "@/components/weekly-program/weekly-program-view";

export const dynamic = "force-dynamic";

export default async function WeeklyProgramPage() {
  const data = await getWeeklyProgram();
  return <WeeklyProgramView data={data} />;
}
