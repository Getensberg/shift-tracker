"use client";

import { useActionState } from "react";
import { loginAction } from "../actions";
import { Submit } from "@/components/Submit";

export function LoginForm({ next }: { next: string }) {
  const [state, action] = useActionState(loginAction, null);
  return (
    <form action={action} className="stack">
      <input type="hidden" name="next" value={next} />
      <label className="field">
        Пароль
        <input type="password" name="password" autoFocus required />
      </label>
      {state?.error ? <div className="flash err" style={{ margin: 0 }}>{state.error}</div> : null}
      <Submit pendingText="Вход…">Войти</Submit>
    </form>
  );
}
