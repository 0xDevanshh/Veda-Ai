import { notFound } from "next/navigation";
import AppShell from "@/components/AppShell";
import ResultView from "@/components/ResultView";
import { getSession } from "@/lib/session-store";

export default function ResultPage({
  params,
}: {
  params: { sessionId: string };
}) {
  const session = getSession(params.sessionId);

  if (!session) {
    notFound();
  }

  return (
    <AppShell breadcrumb="Exams" collapsed>
      <ResultView sessionId={params.sessionId} />
    </AppShell>
  );
}
