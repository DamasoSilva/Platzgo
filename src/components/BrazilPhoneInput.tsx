"use client";

import type { ChangeEvent } from "react";

function onlyDigits(value: string): string {
  return (value ?? "").replace(/\D/g, "");
}

function clampBrNationalDigits(digits: string): string {
  // BR national without country code: DDD (2) + number (8 or 9) => 10 or 11 digits
  const d = onlyDigits(digits);
  return d.slice(0, 11);
}

function formatBrNational(digitsRaw: string): string {
  const digits = clampBrNationalDigits(digitsRaw);
  if (!digits) return "";

  const ddd = digits.slice(0, 2);
  const rest = digits.slice(2);

  if (digits.length < 3) {
    return `(${ddd}`;
  }

  if (rest.length <= 4) {
    return `(${ddd}) ${rest}`;
  }

  // Decide mask: landline 8 digits (4-4) vs mobile 9 digits (5-4)
  if (rest.length <= 8) {
    const a = rest.slice(0, 4);
    const b = rest.slice(4);
    return `(${ddd}) ${a}${b ? `-${b}` : ""}`;
  }

  const a = rest.slice(0, 5);
  const b = rest.slice(5, 9);
  return `(${ddd}) ${a}${b ? `-${b}` : ""}`;
}

export function toBrazilE164FromNationalDigits(nationalDigits: string): string {
  const d = clampBrNationalDigits(nationalDigits);
  return `+55${d}`;
}

export function toBrazilNationalDigitsFromAnyPhone(value: string | null | undefined): string {
  const digits = onlyDigits(value ?? "");
  // If it looks like BR E.164 (55 + 10/11), strip the country code.
  if (digits.startsWith("55") && (digits.length === 12 || digits.length === 13)) {
    return clampBrNationalDigits(digits.slice(2));
  }
  return clampBrNationalDigits(digits);
}

export function isValidBrazilNationalDigits(nationalDigits: string): boolean {
  const d = clampBrNationalDigits(nationalDigits);
  return d.length === 10 || d.length === 11;
}

export function BrazilPhoneInput(props: {
  label: string;
  valueDigits: string;
  onChangeDigits: (digits: string) => void;
  required?: boolean;
  placeholder?: string;
  helpText?: string;
  disabled?: boolean;
}) {
  const displayValue = formatBrNational(props.valueDigits);

  function onChange(e: ChangeEvent<HTMLInputElement>) {
    const nextDigits = clampBrNationalDigits(e.target.value);
    props.onChangeDigits(nextDigits);
  }

  return (
    <div>
      <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">{props.label}</label>
      <div className="mt-2 flex overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
        <div className="flex items-center justify-center px-4 text-sm font-semibold text-zinc-700 dark:text-zinc-300 bg-zinc-100/80 dark:bg-zinc-900/60">
          +55
        </div>
        <input
          value={displayValue}
          onChange={onChange}
          className="w-full bg-transparent px-4 py-3 text-sm text-zinc-900 outline-none focus:ring-2 focus:ring-inset focus:ring-[#CCFF00] dark:text-zinc-100"
          placeholder={props.placeholder ?? "(11) 99999-9999"}
          inputMode="numeric"
          autoComplete="tel"
          required={props.required}
          disabled={props.disabled}
        />
      </div>
      {props.helpText ? <p className="ph-help mt-2">{props.helpText}</p> : null}
    </div>
  );
}
