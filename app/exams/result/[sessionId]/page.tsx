import AppShell from "@/components/AppShell";
import ResultView from "@/components/ResultView";

// No server-side session lookup here: completed sessions live in the browser
// (IndexedDB), so the server has nothing to check. Gating on the server store
// would 404 every client-side session before ResultView could ever look for it.
export default function ResultPage({
  params,
}: {
  params: { sessionId: string };
}) {
  return (
    <AppShell breadcrumb="Exams" collapsed>
      <ResultView sessionId={params.sessionId} />
    </AppShell>
  );
}
