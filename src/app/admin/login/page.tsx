"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Đăng nhập thất bại");
      router.push("/admin/dashboard");
      router.refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Đăng nhập thất bại");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#ff6b6b]/5 px-4">
      <Card className="w-full max-w-md p-8 shadow-2xl">
        <CardHeader className="pb-6">
          <div className="flex items-center gap-2 mb-4">
            <span className="text-3xl">🎮</span>
            <span className="text-2xl font-bold text-[#ff6b6b]">funnygame Admin</span>
          </div>
          <h2 className="text-center font-bold text-lg">Đăng nhập quản trị</h2>
        </CardHeader>
        <CardContent>
          {error && (
            <div className="mb-4 p-3 rounded-lg bg-red-50 text-red-600 text-sm border border-red-100">
              {error}
            </div>
          )}
          <form onSubmit={handleSubmit} className="space-y-4">
            <Input label="Tên đăng nhập" value={username} onChange={(e) => setUsername(e.target.value)} required />
            <Input label="Mật khẩu" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            <Button type="submit" className="w-full bg-[#ff6b6b] text-white" disabled={loading}>
              {loading ? "Đang đăng nhập..." : "Đăng nhập"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
