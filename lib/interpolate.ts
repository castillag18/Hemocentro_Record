import { computeNextDonationDate, formatDate } from "./dates";

export type TemplateVars = {
  donor_name: string;
  last_donation_date: string;
  next_donation_date: string;
  blood_type: string;
  appointment_link: string;
  special_date_name: string;
};

export function interpolate(text: string, vars: TemplateVars) {
  return text
    .replaceAll("{donor_name}", vars.donor_name)
    .replaceAll("{last_donation_date}", vars.last_donation_date)
    .replaceAll("{next_donation_date}", vars.next_donation_date)
    .replaceAll("{blood_type}", vars.blood_type)
    .replaceAll("{appointment_link}", vars.appointment_link || "#")
    .replaceAll("{special_date_name}", vars.special_date_name || "");
}

export function buildTemplateVars(input: {
  name: string;
  lastDonationDate: Date;
  bloodType: string;
  appointmentLink: string;
  nextDonationDate?: Date;
  reminderDays?: number;
  specialDateName?: string;
}): TemplateVars {
  const nextDate =
    input.nextDonationDate ??
    computeNextDonationDate(input.lastDonationDate, input.reminderDays ?? 90);

  return {
    donor_name: input.name,
    last_donation_date: formatDate(input.lastDonationDate),
    next_donation_date: formatDate(nextDate),
    blood_type: input.bloodType,
    appointment_link: input.appointmentLink,
    special_date_name: input.specialDateName ?? "",
  };
}
