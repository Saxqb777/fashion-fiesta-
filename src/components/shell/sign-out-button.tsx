import { LogOutIcon } from "lucide-react";
import { logoutAction } from "@/actions/auth";
import { Button } from "@/components/ui/button";

export function SignOutButton() {
  return (
    <form action={logoutAction}>
      <Button type="submit" variant="ghost" size="icon-sm" aria-label="Sign out" title="Sign out">
        <LogOutIcon className="text-ink-muted" />
      </Button>
    </form>
  );
}
