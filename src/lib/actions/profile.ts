"use server";

import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isValidCpfCnpj, normalizeCpfCnpj } from "@/lib/utils/cpfCnpj";

type UpdateMyProfileInput = {
  name?: string;
  whatsapp_number?: string;
  cpf_cnpj?: string;
  address_text?: string;
  latitude?: number;
  longitude?: number;
  image?: string | null;
};


export async function updateMyProfile(input: UpdateMyProfileInput) {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  if (!userId) throw new Error("Não autenticado");

  const name = typeof input.name === "string" ? input.name.trim() : undefined;
  const whatsapp_number =
    typeof input.whatsapp_number === "string" ? input.whatsapp_number.trim() : undefined;
  const cpfCnpjRaw = typeof input.cpf_cnpj === "string" ? input.cpf_cnpj.trim() : undefined;
  const address_text = typeof input.address_text === "string" ? input.address_text.trim() : undefined;

  const latitude = input.latitude;
  const longitude = input.longitude;

  if (name !== undefined && !name) throw new Error("Nome é obrigatório");
  if (whatsapp_number !== undefined && !whatsapp_number) throw new Error("Telefone/WhatsApp é obrigatório");

  const cpf_cnpj =
    cpfCnpjRaw === undefined
      ? undefined
      : cpfCnpjRaw === ""
        ? null
        : normalizeCpfCnpj(cpfCnpjRaw);

  if (cpf_cnpj && !isValidCpfCnpj(cpf_cnpj)) {
    throw new Error("CPF/CNPJ inválido");
  }

  if (
    (latitude !== undefined || longitude !== undefined) &&
    !(typeof latitude === "number" && typeof longitude === "number" && Number.isFinite(latitude) && Number.isFinite(longitude))
  ) {
    throw new Error("Localização inválida");
  }

  await prisma.user.update({
    where: { id: userId },
    data: {
      name,
      whatsapp_number,
      cpf_cnpj: cpf_cnpj === undefined ? undefined : cpf_cnpj,
      address_text: address_text === undefined ? undefined : address_text || null,
      latitude: latitude === undefined ? undefined : latitude,
      longitude: longitude === undefined ? undefined : longitude,
      image: input.image === undefined ? undefined : input.image,
    },
    select: { id: true },
  });

  return { ok: true };
}
