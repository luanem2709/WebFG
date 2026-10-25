"use client";

import * as React from "react";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export function Input({ className, label, error, ...props }: InputProps) {
  return (
    <div className="mb-4">
      {label && <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">{label}</label>}
      <input
        {...props}
        className={[
          "w-full px-4 py-2.5 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white placeholder-zinc-400 dark:placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-[#ff6b6b] focus:border-transparent transition-all",
          error && "border-red-500 focus:ring-red-500",
          className,
        ].join(" ").trim()}
      />
      {error && <span className="mt-1 text-sm text-red-500 dark:text-red-400">{error}</span>}
    </div>
  );
}
