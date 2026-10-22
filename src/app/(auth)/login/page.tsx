import type { Metadata } from "next";
import { Logo } from "@/components/brand/logo";
import { SwooshStripe } from "@/components/brand/swoosh-stripe";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string }>;
}) {
  const { callbackUrl } = await searchParams;
  return (
    <div className="w-full max-w-[400px]">
      <div className="overflow-hidden rounded-[14px] border border-line bg-surface">
        <SwooshStripe height={4} className="rounded-none" />
        <div className="px-6 pt-8 pb-7 sm:px-8">
          <Logo width={140} priority className="mx-auto" />
          <h1 className="mt-6 text-center text-[1.75rem] font-medium">Sign in</h1>
          <p className="mt-1 text-center text-sm text-ink-muted">Fashion Fiesta Studio</p>
          <div className="mt-7">
            <LoginForm callbackUrl={callbackUrl} />
          </div>
        </div>
      </div>
      <p className="mt-6 text-center text-xs leading-relaxed text-ink-muted">
        Fashion Fiesta Ladies Tailoring & Textiles
        <br />
        Shabiya 12, Mussafah, Abu Dhabi
      </p>
    </div>
  );
}
