import { ReactNode } from "react";

export function StepShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex w-full flex-col gap-6">
      <div>
        <h2 className="text-2xl font-semibold sm:text-3xl">{title}</h2>
        {subtitle ? <p className="mt-2 text-sm opacity-70">{subtitle}</p> : null}
      </div>
      {children}
    </div>
  );
}
