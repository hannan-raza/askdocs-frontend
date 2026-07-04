import { redirect } from "next/navigation";
import { auth0 } from "@/lib/auth0";
import AppShell from "@/components/AppShell";
import ChatApp from "./ChatApp";

export default async function Page() {
  const session = await auth0.getSession();

  if (!session) {
    redirect("/auth/login");
  }

  const email = session.user.email ?? "";

  return (
    <AppShell userEmail={email}>
      <ChatApp />
    </AppShell>
  );
}