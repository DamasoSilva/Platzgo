import { prisma } from "@/lib/prisma";
import { extractAsaasErrorMessage } from "@/lib/payments";
import { isValidCpfCnpj, normalizeCpfCnpj } from "@/lib/utils/cpfCnpj";

function onlyDigits(v: string | null | undefined): string {
  return (v ?? "").replace(/\D/g, "");
}

export async function ensureAsaasCustomer(
  userId: string,
  config: { apiKey?: string; baseUrl?: string },
): Promise<string> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, email: true, whatsapp_number: true, cpf_cnpj: true, asaas_customer_id: true },
  });

  if (!user) throw new Error("Usuário não encontrado");
  if (!config.apiKey) throw new Error("Asaas não configurado");
  const baseUrl = config.baseUrl ?? "https://sandbox.asaas.com/api/v3";
  const cpfCnpj = normalizeCpfCnpj(user.cpf_cnpj ?? "");

  if (!cpfCnpj) {
    throw new Error("CPF/CNPJ é obrigatório para pagamentos online. Atualize seu perfil.");
  }
  if (!isValidCpfCnpj(cpfCnpj)) {
    throw new Error("CPF/CNPJ inválido. Atualize seu perfil.");
  }

  if (user.asaas_customer_id) {
    const checkRes = await fetch(`${baseUrl}/customers/${user.asaas_customer_id}`, {
      headers: { access_token: config.apiKey },
    }).catch(() => null);
    if (checkRes?.ok) {
      return user.asaas_customer_id;
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { asaas_customer_id: null },
      select: { id: true },
    });
  }

  const payload = {
    name: user.name ?? user.email,
    email: user.email,
    phone: onlyDigits(user.whatsapp_number) || undefined,
    cpfCnpj,
  };

  const res = await fetch(`${baseUrl}/customers`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      access_token: config.apiKey,
    },
    body: JSON.stringify(payload),
  });

  const data = await res.json().catch(() => null);
  const detail = extractAsaasErrorMessage(data);
  if (!res.ok || !data?.id) {
    throw new Error(detail ? `Falha ao criar cliente no Asaas: ${detail}` : "Falha ao criar cliente no Asaas");
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { asaas_customer_id: String(data.id) },
    select: { id: true },
  });

  return String(data.id);
}