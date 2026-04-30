import { currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

export default async function DashboardPage() {
  const user = await currentUser();

  if (!user) {
    redirect("/sign-in");
  }

  const primaryEmail = user.emailAddresses.find(
    (e) => e.id === user.primaryEmailAddressId
  )?.emailAddress;

  return (
    <main className="min-h-screen p-8">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-3xl font-bold mb-6">Dashboard</h1>
        <div className="rounded-lg border p-6 space-y-4">
          <h2 className="text-lg font-semibold text-gray-500">
            Auth verification
          </h2>
          <dl className="space-y-2">
            <div className="flex gap-4">
              <dt className="w-32 font-medium text-gray-600">Clerk ID</dt>
              <dd className="font-mono text-sm">{user.id}</dd>
            </div>
            <div className="flex gap-4">
              <dt className="w-32 font-medium text-gray-600">Name</dt>
              <dd>
                {user.firstName} {user.lastName}
              </dd>
            </div>
            <div className="flex gap-4">
              <dt className="w-32 font-medium text-gray-600">Email</dt>
              <dd>{primaryEmail ?? "—"}</dd>
            </div>
            <div className="flex gap-4">
              <dt className="w-32 font-medium text-gray-600">Username</dt>
              <dd>{user.username ?? "—"}</dd>
            </div>
          </dl>
        </div>
      </div>
    </main>
  );
}
