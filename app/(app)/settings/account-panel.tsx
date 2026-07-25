"use client";

import { useState } from "react";

import { useAction } from "@/lib/use-action";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { changePassword } from "./actions";

export function AccountPanel() {
  const { run, pending } = useAction();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");

  return (
    <Card>
      <CardContent className="max-w-sm">
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            run(() => changePassword({ currentPassword, newPassword }), {
              successMessage: "Password changed.",
              onSuccess: () => {
                setCurrentPassword("");
                setNewPassword("");
              },
            });
          }}
        >
          <div className="grid gap-2">
            <Label htmlFor="current-password">Current password</Label>
            <Input
              id="current-password"
              type="password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="new-password">New password</Label>
            <Input
              id="new-password"
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
            <p className="text-muted-foreground text-xs">
              At least 8 characters. Other sessions are signed out.
            </p>
          </div>
          <Button type="submit" disabled={pending}>
            Change password
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
