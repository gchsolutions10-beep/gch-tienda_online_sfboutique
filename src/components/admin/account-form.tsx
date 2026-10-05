"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent, type ReactNode } from "react";
import { saveAccount } from "@/server/actions/admin/accounts";
import { ACCOUNT_TYPE_LABEL, VE_BANKS, type FinancialAccountType } from "@/lib/payments";
import { buttonPrimary, buttonSecondary, cn, inputClass, labelClass } from "@/components/ui/styles";

export type AccountValues = {
  id: string | null;
  name: string;
  type: FinancialAccountType;
  bankCode: string;
  bankName: string;
  accountNumber: string;
  holderName: string;
  holderId: string;
  phone: string;
  email: string;
  walletId: string;
  showInCheckout: boolean;
  isActive: boolean;
};

const EMPTY: AccountValues = {
  id: null,
  name: "",
  type: "PAGO_MOVIL",
  bankCode: "",
  bankName: "",
  accountNumber: "",
  holderName: "",
  holderId: "",
  phone: "",
  email: "",
  walletId: "",
  showInCheckout: true,
  isActive: true,
};

/** Formulario de una cuenta: muestra solo los campos de su tipo. */
export function AccountForm({ initial, onDone }: { initial?: AccountValues; onDone?: () => void }) {
  const router = useRouter();
  const v = initial ?? EMPTY;
  const [type, setType] = useState<FinancialAccountType>(v.type);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const isBank = type === "BANK_VES" || type === "BANK_USD" || type === "PAGO_MOVIL" || type === "POS_TERMINAL";
  const online = !["CASH_VES", "CASH_USD", "POS_TERMINAL"].includes(type);

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const get = (k: string) => String(f.get(k) ?? "");
    const bank = VE_BANKS.find(([code]) => code === get("bankCode"));
    setError(null);
    start(async () => {
      const r = await saveAccount({
        id: v.id,
        name: get("name"),
        type,
        bankCode: get("bankCode"),
        bankName: bank?.[1] ?? get("bankName"),
        accountNumber: get("accountNumber"),
        holderName: get("holderName"),
        holderId: get("holderId"),
        phone: get("phone"),
        email: get("email"),
        walletId: get("walletId"),
        showInCheckout: f.get("showInCheckout") === "on",
        isActive: f.get("isActive") === "on",
      });
      if (!r.ok) return setError(r.error);
      onDone?.();
      router.refresh();
    });
  }

  return (
    <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
      <div>
        <label className={labelClass} htmlFor={`type-${v.id}`}>Tipo</label>
        <select id={`type-${v.id}`} value={type} onChange={(e) => setType(e.target.value as FinancialAccountType)} className={inputClass}>
          {(Object.keys(ACCOUNT_TYPE_LABEL) as FinancialAccountType[]).map((t) => (
            <option key={t} value={t}>{ACCOUNT_TYPE_LABEL[t]}</option>
          ))}
        </select>
      </div>
      <div>
        <label className={labelClass} htmlFor={`name-${v.id}`}>Nombre (lo ve la clienta)</label>
        <input id={`name-${v.id}`} name="name" required defaultValue={v.name} placeholder="Banesco Pago Móvil" className={inputClass} />
      </div>
      {isBank ? (
        <div>
          <label className={labelClass} htmlFor={`bank-${v.id}`}>Banco</label>
          <select id={`bank-${v.id}`} name="bankCode" defaultValue={v.bankCode} className={inputClass}>
            <option value="">Elige…</option>
            {VE_BANKS.map(([code, name]) => <option key={code} value={code}>{code} · {name}</option>)}
          </select>
        </div>
      ) : null}
      {type === "BANK_USD" ? (
        <div>
          <label className={labelClass} htmlFor={`bankName-${v.id}`}>Banco (si es del exterior)</label>
          <input id={`bankName-${v.id}`} name="bankName" defaultValue={v.bankName} className={inputClass} />
        </div>
      ) : null}
      {type === "BANK_VES" || type === "BANK_USD" ? (
        <div>
          <label className={labelClass} htmlFor={`acc-${v.id}`}>Número de cuenta</label>
          <input id={`acc-${v.id}`} name="accountNumber" defaultValue={v.accountNumber} placeholder="0134-0000-00-0000000000" className={inputClass} />
        </div>
      ) : null}
      {type === "PAGO_MOVIL" ? (
        <div>
          <label className={labelClass} htmlFor={`phone-${v.id}`}>Teléfono del Pago Móvil</label>
          <input id={`phone-${v.id}`} name="phone" defaultValue={v.phone} placeholder="0414-1234567" className={inputClass} />
        </div>
      ) : null}
      {type === "ZELLE" ? (
        <div>
          <label className={labelClass} htmlFor={`email-${v.id}`}>Correo de Zelle</label>
          <input id={`email-${v.id}`} name="email" type="email" defaultValue={v.email} className={inputClass} />
        </div>
      ) : null}
      {type === "CRYPTO_USDT" ? (
        <div className="sm:col-span-2">
          <label className={labelClass} htmlFor={`wallet-${v.id}`}>Binance Pay ID, correo o dirección (red TRC20)</label>
          <input id={`wallet-${v.id}`} name="walletId" defaultValue={v.walletId} className={inputClass} />
        </div>
      ) : null}
      {online || type === "POS_TERMINAL" ? (
        <>
          <div>
            <label className={labelClass} htmlFor={`holder-${v.id}`}>Titular</label>
            <input id={`holder-${v.id}`} name="holderName" defaultValue={v.holderName} className={inputClass} />
          </div>
          {type !== "ZELLE" && type !== "CRYPTO_USDT" ? (
            <div>
              <label className={labelClass} htmlFor={`holderId-${v.id}`}>Cédula o RIF del titular</label>
              <input id={`holderId-${v.id}`} name="holderId" defaultValue={v.holderId} placeholder="V-12345678 o J-12345678-9" className={inputClass} />
            </div>
          ) : null}
        </>
      ) : null}
      <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm sm:col-span-2">
        {online ? (
          <label className="flex items-center gap-2"><input type="checkbox" name="showInCheckout" defaultChecked={v.showInCheckout} className="size-4" /> Mostrar en la tienda en línea</label>
        ) : (
          <span className="text-xs text-muted">Solo se usa en la caja de la tienda física.</span>
        )}
        <label className="flex items-center gap-2"><input type="checkbox" name="isActive" defaultChecked={v.isActive} className="size-4" /> Activa</label>
      </div>
      {error ? <p role="alert" className="text-sm font-semibold text-danger sm:col-span-2">{error}</p> : null}
      <div className="flex gap-2 sm:col-span-2">
        <button disabled={pending} className={buttonPrimary}>{pending ? "Guardando…" : v.id ? "Guardar" : "Crear cuenta"}</button>
        {onDone ? <button type="button" onClick={onDone} className={buttonSecondary}>Cancelar</button> : null}
      </div>
    </form>
  );
}

/** Tarjeta de cuenta con botón para editar. */
export function AccountCard({ values, summary, warning, children }: { values: AccountValues; summary: string; warning: string | null; children?: ReactNode }) {
  const [editing, setEditing] = useState(false);
  return (
    <li className={cn("rounded-2xl border bg-paper p-4", warning ? "border-amber-300" : "border-line", !values.isActive && "opacity-60")}>
      {editing ? (
        <AccountForm initial={values} onDone={() => setEditing(false)} />
      ) : (
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-semibold">{values.name}</p>
            <p className="text-xs text-muted">{ACCOUNT_TYPE_LABEL[values.type]}{values.isActive ? "" : " · inactiva"}</p>
            <p className="mt-1 text-sm">{summary}</p>
            {warning ? <p className="mt-1 text-xs font-semibold text-amber-800">⚠️ {warning}</p> : null}
            {children}
          </div>
          <button type="button" onClick={() => setEditing(true)} className={buttonSecondary}>Editar</button>
        </div>
      )}
    </li>
  );
}

export function NewAccount() {
  const [open, setOpen] = useState(false);
  return open ? (
    <div className="rounded-2xl border border-line bg-paper p-4">
      <AccountForm onDone={() => setOpen(false)} />
    </div>
  ) : (
    <button type="button" onClick={() => setOpen(true)} className={buttonPrimary}>+ Nueva cuenta</button>
  );
}
