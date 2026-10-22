export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-paper px-4 py-10">
      {children}
    </main>
  );
}
