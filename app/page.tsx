import Link from "next/link";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-[#f5f5f5]">
      <h1 className="text-4xl font-bold text-gray-900">Answer Sheet Grader</h1>
      <p className="max-w-md text-center text-sm text-gray-500">
        Upload a question paper and student answer sheets to automatically map,
        grade, and review answers.
      </p>
      <Link
        href="/exams/upload"
        className="rounded-full bg-black px-6 py-3 text-sm font-medium text-white hover:bg-gray-800"
      >
        Get Started
      </Link>
    </main>
  );
}
