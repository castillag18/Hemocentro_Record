export const BLOOD_TYPES = [
  "O+",
  "O-",
  "A+",
  "A-",
  "B+",
  "B-",
  "AB+",
  "AB-",
] as const;

export type BloodType = (typeof BLOOD_TYPES)[number];

export const CHANNELS = ["whatsapp", "email", "ambos"] as const;
export type PreferredChannel = (typeof CHANNELS)[number];

export const GENDERS = ["F", "M"] as const;
export type Gender = (typeof GENDERS)[number];

export const DONATION_TYPES = ["total", "aferesis"] as const;
export type DonationType = (typeof DONATION_TYPES)[number];

export const DONATION_TYPE_LABELS: Record<DonationType, string> = {
  total: "Sangre total",
  aferesis: "Aféresis",
};

export const GENDER_LABELS: Record<Gender, string> = {
  F: "Femenino",
  M: "Masculino",
};

export const SESSION_COOKIE = "hemocentro_session";

export const TEMPLATE_KINDS = ["reminder", "birthday", "special", "satisfaction"] as const;
export type TemplateKind = (typeof TEMPLATE_KINDS)[number];

export const TEMPLATE_KIND_LABELS: Record<TemplateKind, string> = {
  reminder: "Recordatorio de donación",
  birthday: "Felicitación de cumpleaños",
  special: "Fecha especial",
  satisfaction: "Encuesta de satisfacción",
};

export const TEMPLATE_VARIABLES = [
  "{donor_name}",
  "{last_donation_date}",
  "{next_donation_date}",
  "{blood_type}",
  "{donation_type}",
  "{appointment_link}",
  "{special_date_name}",
] as const;

export type SpecialDateEntry = {
  id: string;
  name: string;
  month: number;
  day: number;
};

export const DEFAULT_SPECIAL_DATES: SpecialDateEntry[] = [
  { id: "world-blood-donor-day", name: "Día Mundial del Donante de Sangre", month: 6, day: 14 },
  { id: "national-blood-day", name: "Día Nacional del Donante", month: 11, day: 30 },
];

export const DEFAULT_WHATSAPP_BODY = `Hola, *{donor_name}* 👋.

En *HUAV Banco de Sangre* recordamos con gratitud tu última donación el día {last_donation_date} (*{donation_type}*). Queremos contarte que ya puedes volver a donar a partir del {next_donation_date} y tu cuerpo está listo para salvar vidas. ❤️

¿Te gustaría agendar una cita para esta semana?
Responde *Sí* a este mensaje y le enviaremos las fechas disponibles para que elija la que prefiera.

*Tu sangre salva vidas.* 🩸`;

export const DEFAULT_EMAIL_SUBJECT =
  "{donor_name}, ¡es momento de volver a ser un héroe! 🩸";

export const DEFAULT_BIRTHDAY_WHATSAPP_BODY = `¡Feliz cumpleaños, *{donor_name}*! 🎂🎉

En *HUAV Banco de Sangre* celebramos contigo este día tan especial. Gracias por ser parte de nuestra familia de donantes y por salvar vidas con tu generosidad. ❤️

Si deseas agendar una donación, responde *Sí* a este mensaje.

*Tu sangre salva vidas.* 🩸`;

export const DEFAULT_BIRTHDAY_EMAIL_SUBJECT = "¡Feliz cumpleaños, {donor_name}! 🎂";

export const DEFAULT_BIRTHDAY_EMAIL_BODY = `<div style="font-family:Inter,Arial,sans-serif;max-width:560px;margin:0 auto;color:#111c2d;">
  <div style="background:#c8102e;padding:24px;text-align:center;">
    <h1 style="color:#ffffff;margin:0;font-size:24px;">¡Feliz cumpleaños!</h1>
  </div>
  <div style="padding:24px;background:#ffffff;">
    <p>Querido/a <strong>{donor_name}</strong>,</p>
    <p>En <strong>HUAV Banco de Sangre</strong> celebramos contigo este día tan especial. Gracias por ser donante y por salvar vidas. ❤️</p>
    <p style="text-align:center;margin:24px 0;">
      <a href="{appointment_link}" style="background:#9e001f;color:#ffffff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;">Agendar donación</a>
    </p>
  </div>
</div>`;

export const DEFAULT_SPECIAL_WHATSAPP_BODY = `Hola, *{donor_name}* 👋

Hoy conmemoramos *{special_date_name}* y queremos recordarte lo valioso que es tu compromiso como donante de sangre en *HUAV Banco de Sangre*. ❤️

¿Te gustaría agendar una cita esta semana? Responde *Sí* a este mensaje.

*Tu sangre salva vidas.* 🩸`;

export const DEFAULT_SPECIAL_EMAIL_SUBJECT = "{special_date_name} — HUAV Banco de Sangre";

export const DEFAULT_SATISFACTION_WHATSAPP_BODY = `¡Hola, *{donor_name}*! 🩸

Gracias por donar hoy en *HUAV Banco de Sangre*. Su generosidad salva vidas. ❤️

¿Cómo calificaría su experiencia hoy?
Responda con un número del *1* (muy mala) al *5* (excelente).

Su opinión nos ayuda a mejorar. ¡Gracias!`;

export const DEFAULT_SATISFACTION_EMAIL_SUBJECT =
  "¿Cómo fue su experiencia de donación? — HUAV Banco de Sangre";

export const DEFAULT_SATISFACTION_EMAIL_BODY = `<div style="font-family:Inter,Arial,sans-serif;max-width:560px;margin:0 auto;color:#111c2d;">
  <div style="background:#c8102e;padding:24px;text-align:center;">
    <h1 style="color:#ffffff;margin:0;font-size:22px;">Encuesta de satisfacción</h1>
  </div>
  <div style="padding:24px;background:#ffffff;">
    <p>Hola <strong>{donor_name}</strong>,</p>
    <p>Gracias por donar hoy en <strong>HUAV Banco de Sangre</strong>. ¿Cómo calificaría su experiencia del 1 (muy mala) al 5 (excelente)?</p>
    <p style="font-size:12px;color:#5c5f61;">Responda a este correo con su calificación.</p>
  </div>
</div>`;

export const DEFAULT_SPECIAL_EMAIL_BODY = `<div style="font-family:Inter,Arial,sans-serif;max-width:560px;margin:0 auto;color:#111c2d;">
  <div style="background:#c8102e;padding:24px;text-align:center;">
    <h1 style="color:#ffffff;margin:0;font-size:22px;">{special_date_name}</h1>
  </div>
  <div style="padding:24px;background:#ffffff;">
    <p>Hola <strong>{donor_name}</strong>,</p>
    <p>Hoy conmemoramos <strong>{special_date_name}</strong>. Gracias por ser donante y salvar vidas en <strong>HUAV Banco de Sangre</strong>.</p>
    <p style="text-align:center;margin:24px 0;">
      <a href="{appointment_link}" style="background:#9e001f;color:#ffffff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;">Agendar donación</a>
    </p>
  </div>
</div>`;

export const DEFAULT_EMAIL_BODY = `<div style="font-family:Inter,Arial,sans-serif;max-width:560px;margin:0 auto;color:#111c2d;background:#f9f9ff;">
  <div style="background:#c8102e;padding:24px;text-align:center;">
    <h1 style="color:#ffffff;margin:0;font-size:24px;letter-spacing:-0.02em;">HUAV</h1>
    <p style="color:#ffdad8;margin:8px 0 0;font-size:12px;letter-spacing:0.12em;font-weight:600;">BANCO DE SANGRE</p>
  </div>
  <div style="padding:32px 24px;background:#ffffff;">
    <p>Hola <strong>{donor_name}</strong>,</p>
    <p>En <strong>HUAV Banco de Sangre</strong> recordamos con gratitud tu última donación el día <strong>{last_donation_date}</strong>. Queremos contarte que ya puedes volver a donar a partir del <strong>{next_donation_date}</strong>. ❤️</p>
    <p>Tu sangre tipo <strong>{blood_type}</strong> es fundamental para nuestros pacientes. Puedes volver a donar a partir del <strong>{next_donation_date}</strong>.</p>
    <p style="text-align:center;margin:32px 0;">
      <a href="{appointment_link}" style="background:#9e001f;color:#ffffff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block;">Agendar mi Donación</a>
    </p>
    <p style="font-size:12px;color:#5c5f61;border-top:1px solid #e5bdbb;padding-top:16px;margin-bottom:0;">
      Tu sangre salva vidas. 🩸
    </p>
  </div>
</div>`;
