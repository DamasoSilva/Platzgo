export function normalizeCpfCnpj(value: string | null | undefined): string {
  return (value ?? "").replace(/\D/g, "");
}

function allDigitsEqual(value: string): boolean {
  return /^(\d)\1+$/.test(value);
}

export function isValidCpf(value: string | null | undefined): boolean {
  const digits = normalizeCpfCnpj(value);
  if (digits.length !== 11) return false;
  if (allDigitsEqual(digits)) return false;

  const nums = digits.split("").map((d) => Number(d));
  if (nums.some((n) => Number.isNaN(n))) return false;

  const calcDigit = (base: number, weightStart: number) => {
    let sum = 0;
    for (let i = 0; i < base; i += 1) {
      sum += nums[i] * (weightStart - i);
    }
    const remainder = sum % 11;
    return remainder < 2 ? 0 : 11 - remainder;
  };

  const digit1 = calcDigit(9, 10);
  if (digit1 !== nums[9]) return false;
  const digit2 = calcDigit(10, 11);
  if (digit2 !== nums[10]) return false;

  return true;
}

export function isValidCnpj(value: string | null | undefined): boolean {
  const digits = normalizeCpfCnpj(value);
  if (digits.length !== 14) return false;
  if (allDigitsEqual(digits)) return false;

  const nums = digits.split("").map((d) => Number(d));
  if (nums.some((n) => Number.isNaN(n))) return false;

  const weights1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const weights2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];

  const calcDigit = (weights: number[], length: number) => {
    let sum = 0;
    for (let i = 0; i < length; i += 1) {
      sum += nums[i] * weights[i];
    }
    const remainder = sum % 11;
    return remainder < 2 ? 0 : 11 - remainder;
  };

  const digit1 = calcDigit(weights1, 12);
  if (digit1 !== nums[12]) return false;
  const digit2 = calcDigit(weights2, 13);
  if (digit2 !== nums[13]) return false;

  return true;
}

export function isValidCpfCnpj(value: string | null | undefined): boolean {
  const digits = normalizeCpfCnpj(value);
  if (digits.length === 11) return isValidCpf(digits);
  if (digits.length === 14) return isValidCnpj(digits);
  return false;
}
