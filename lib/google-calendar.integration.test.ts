import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Settings } from "@prisma/client";

const mockEventsInsert = vi.hoisted(() => vi.fn());
const mockGenerateAuthUrl = vi.hoisted(() => vi.fn());
const mockRefreshAccessToken = vi.hoisted(() => vi.fn());

vi.mock("googleapis", () => ({
  google: {
    auth: {
      OAuth2: vi.fn().mockImplementation(function OAuth2Mock() {
        return {
          setCredentials: vi.fn(),
          refreshAccessToken: mockRefreshAccessToken,
          generateAuthUrl: mockGenerateAuthUrl,
          getToken: vi.fn(),
        };
      }),
      GoogleAuth: vi.fn().mockImplementation(function GoogleAuthMock() {
        return { getClient: vi.fn() };
      }),
    },
    calendar: vi.fn(() => ({
      events: { insert: mockEventsInsert },
    })),
    oauth2: vi.fn(),
  },
}));

const mockPrisma = vi.hoisted(() => ({
  adminUser: { findMany: vi.fn() },
  settings: { update: vi.fn() },
  appointment: { findMany: vi.fn(), update: vi.fn() },
}));

vi.mock("./prisma", () => ({ prisma: mockPrisma }));

import {
  googleCalendarConfigured,
  getGoogleRedirectUri,
  getGoogleAuthUrl,
  CALENDAR_SCOPE,
} from "./google-oauth";
import {
  createDonorAppointment,
  syncPendingAppointmentsToCalendar,
  buildAppointmentWhatsAppMessage,
  buildAppointmentConfirmationEmail,
} from "./google-calendar";
import { extractGoogleAuthCode } from "./google-calendar-connect";

function baseSettings(overrides: Partial<Settings> = {}): Settings {
  return {
    id: "default",
    reminderDays: 90,
    femaleWholeBloodMonths: 4,
    femaleApheresisMonths: 1,
    maleWholeBloodMonths: 3,
    maleApheresisMonths: 1,
    smtpHost: "",
    smtpPort: 587,
    smtpUser: "",
    smtpPass: "",
    smtpFrom: "",
    appointmentLink: "",
    siteName: "HUAV Banco de Sangre",
    siteAddress: "Carrera 13 # 13c-39, Valledupar",
    sitePhone: "3182616448",
    whatsappMode: "openwa",
    whatsappAccessToken: "",
    whatsappPhoneNumberId: "",
    whatsappApiVersion: "v21.0",
    whatsappVerifyToken: "",
    whatsappOpenWaUrl: "http://localhost:2785",
    whatsappOpenWaApiKey: "",
    whatsappOpenWaSessionId: "default",
    whatsappDailyLimit: 1000,
    autoRemindersEnabled: false,
    autoRemindersHour: 8,
    autoBirthdayEnabled: false,
    autoSpecialDatesEnabled: false,
    autoSatisfactionSurveyEnabled: false,
    autoSatisfactionSurveyHour: 18,
    specialDatesJson: null,
    googleCalendarId: "primary",
    googleCredentialsJson: null,
    googleRefreshToken: "refresh-token-test",
    googleAccessToken: "access-token-test",
    googleTokenExpiry: new Date(Date.now() + 3600_000),
    googleConnectedEmail: "admin@hemocentro.local",
    googleClientId: "",
    googleClientSecret: "",
    openwaWebhookSecret: "",
    ...overrides,
  };
}

describe("googleCalendarConfigured", () => {
  it("detecta OAuth con refresh token", () => {
    expect(googleCalendarConfigured(baseSettings())).toBe(true);
  });

  it("detecta cuenta de servicio", () => {
    expect(
      googleCalendarConfigured(
        baseSettings({
          googleRefreshToken: null,
          googleCredentialsJson: '{"client_email":"sa@test.iam.gserviceaccount.com"}',
          googleCalendarId: "cal@test",
        }),
      ),
    ).toBe(true);
  });

  it("rechaza configuración incompleta", () => {
    expect(
      googleCalendarConfigured(
        baseSettings({ googleRefreshToken: null, googleCredentialsJson: null }),
      ),
    ).toBe(false);
  });
});

describe("getGoogleAuthUrl", () => {
  beforeEach(() => {
    process.env.GOOGLE_CLIENT_ID = "client-id";
    process.env.GOOGLE_CLIENT_SECRET = "client-secret";
    mockGenerateAuthUrl.mockReturnValue("https://accounts.google.com/o/oauth2/auth?test=1");
  });

  it("incluye scope de Calendar en modo calendar", async () => {
    const url = await getGoogleAuthUrl("state-123", { mode: "calendar" });
    expect(url).toContain("accounts.google.com");
    expect(mockGenerateAuthUrl).toHaveBeenCalledWith(
      expect.objectContaining({
        access_type: "offline",
        prompt: "consent",
        scope: expect.arrayContaining([
          "openid",
          "email",
          "profile",
          CALENDAR_SCOPE,
        ]),
        state: "state-123",
      }),
    );
  });

  it("no incluye Calendar en login sin requestCalendar", async () => {
    await getGoogleAuthUrl("state-login", { mode: "login", requestCalendar: false });
    const call = mockGenerateAuthUrl.mock.calls.at(-1)?.[0];
    expect(call.scope).not.toContain(CALENDAR_SCOPE);
  });
});

describe("extractGoogleAuthCode", () => {
  it("acepta código plano", () => {
    expect(extractGoogleAuthCode("4/abc123")).toBe("4/abc123");
  });

  it("extrae code de URL de redirección", () => {
    expect(
      extractGoogleAuthCode(
        "http://192.168.1.4:3000/api/auth/google/callback?code=4%2Fxyz&scope=calendar",
      ),
    ).toBe("4/xyz");
  });
});

describe("createDonorAppointment", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEventsInsert.mockResolvedValue({ data: { id: "google-event-001" } });
    mockPrisma.adminUser.findMany.mockResolvedValue([
      { email: "staff@hemocentro.local" },
    ]);
    mockPrisma.settings.update.mockResolvedValue({});
  });

  it("crea evento en Calendar con zona horaria Colombia y asistentes", async () => {
    const scheduledAt = new Date("2026-10-15T14:00:00.000Z");
    const settings = baseSettings();

    const result = await createDonorAppointment({
      settings,
      donorName: "María López",
      donorEmail: "maria@example.com",
      bloodType: "O+",
      scheduledAt,
    });

    expect(result.googleEventId).toBe("google-event-001");
    expect(result.formattedDate).toBeTruthy();
    expect(result.formattedTime).toMatch(/09:00\s*a\.?\s*m\.?/i);
    expect(mockEventsInsert).toHaveBeenCalledOnce();

    const insertCall = mockEventsInsert.mock.calls[0][0];
    expect(insertCall.calendarId).toBe("primary");
    expect(insertCall.sendUpdates).toBe("all");
    expect(insertCall.requestBody.summary).toBe("Donación de sangre — María López");
    expect(insertCall.requestBody.location).toBe(settings.siteAddress);
    expect(insertCall.requestBody.start.timeZone).toBe("America/Bogota");
    expect(insertCall.requestBody.end.timeZone).toBe("America/Bogota");
    expect(insertCall.requestBody.attendees).toEqual(
      expect.arrayContaining([
        { email: "maria@example.com" },
        { email: "staff@hemocentro.local" },
      ]),
    );
    expect(insertCall.requestBody.description).toContain("Grupo sanguíneo: O+");
  });

  it("lanza error si Calendar no está configurado", async () => {
    await expect(
      createDonorAppointment({
        settings: baseSettings({ googleRefreshToken: null, googleCredentialsJson: null }),
        donorName: "Test",
        bloodType: "A+",
        scheduledAt: new Date(),
      }),
    ).rejects.toThrow(/no está configurado/i);
  });

  it("refresca token OAuth expirado antes de crear evento", async () => {
    mockRefreshAccessToken.mockResolvedValue({
      credentials: {
        access_token: "new-access",
        expiry_date: Date.now() + 3600_000,
      },
    });

    const settings = baseSettings({
      googleTokenExpiry: new Date(Date.now() - 60_000),
    });

    await createDonorAppointment({
      settings,
      donorName: "Juan Pérez",
      bloodType: "B+",
      scheduledAt: new Date("2026-11-01T15:00:00.000Z"),
    });

    expect(mockRefreshAccessToken).toHaveBeenCalled();
    expect(mockPrisma.settings.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "default" },
        data: expect.objectContaining({ googleAccessToken: "new-access" }),
      }),
    );
  });
});

describe("syncPendingAppointmentsToCalendar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEventsInsert.mockResolvedValue({ data: { id: "sync-event-99" } });
    mockPrisma.adminUser.findMany.mockResolvedValue([]);
    mockPrisma.settings.update.mockResolvedValue({});
    mockPrisma.appointment.update.mockResolvedValue({});
  });

  it("sincroniza citas confirmadas sin googleEventId", async () => {
    const scheduledAt = new Date(Date.now() + 86400000);
    mockPrisma.appointment.findMany.mockResolvedValue([
      {
        id: "appt-1",
        scheduledAt,
        donor: { name: "Orlando Castilla", email: null, bloodType: "O+" },
      },
    ]);

    const result = await syncPendingAppointmentsToCalendar(baseSettings());

    expect(result).toEqual({ synced: 1, failed: 0, failures: [] });
    expect(mockPrisma.appointment.update).toHaveBeenCalledWith({
      where: { id: "appt-1" },
      data: { googleEventId: "sync-event-99" },
    });
  });

  it("retorna ceros si Calendar no está conectado", async () => {
    const result = await syncPendingAppointmentsToCalendar(
      baseSettings({ googleRefreshToken: null, googleCredentialsJson: null }),
    );
    expect(result).toEqual({ synced: 0, failed: 0, failures: [] });
    expect(mockPrisma.appointment.findMany).not.toHaveBeenCalled();
  });
});

describe("createDonorAppointment — correo donante inválido", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEventsInsert.mockResolvedValue({ data: { id: "google-event-invalid-email" } });
    mockPrisma.adminUser.findMany.mockResolvedValue([]);
    mockPrisma.settings.update.mockResolvedValue({});
  });

  it("crea el evento sin invitar al donante si el correo no es válido", async () => {
    await createDonorAppointment({
      settings: baseSettings(),
      donorName: "PRUEBA PRUEBA",
      donorEmail: "0",
      bloodType: "AB-",
      scheduledAt: new Date("2026-10-02T14:00:00.000Z"),
    });

    const insertCall = mockEventsInsert.mock.calls[0][0];
    expect(insertCall.sendUpdates).toBe("none");
    expect(insertCall.requestBody.attendees).toBeUndefined();
  });
});

describe("mensajes de confirmación de cita", () => {
  it("buildAppointmentWhatsAppMessage incluye fecha, sede y teléfono", () => {
    const msg = buildAppointmentWhatsAppMessage({
      donorName: "Ana",
      siteName: "HUAV Banco de Sangre",
      siteAddress: "Carrera 13 # 13c-39",
      sitePhone: "3182616448",
      formattedDate: "15/10/2026",
      formattedTime: "09:00 a. m.",
    });
    expect(msg).toContain("Ana");
    expect(msg).toContain("15/10/2026");
    expect(msg).toContain("Carrera 13");
    expect(msg).toContain("3182616448");
  });

  it("buildAppointmentConfirmationEmail incluye datos de la cita", () => {
    const html = buildAppointmentConfirmationEmail({
      donorName: "Carlos",
      siteName: "HUAV Banco de Sangre",
      siteAddress: "Valledupar",
      formattedDate: "20/10/2026",
      formattedTime: "10:30 a. m.",
    });
    expect(html).toContain("Carlos");
    expect(html).toContain("20/10/2026");
    expect(html).toContain("Valledupar");
  });
});

describe("getGoogleRedirectUri", () => {
  it("usa GOOGLE_REDIRECT_URI cuando Google la acepta", () => {
    process.env.GOOGLE_REDIRECT_URI = "http://localhost:3000/api/auth/google/callback";
    expect(getGoogleRedirectUri()).toBe("http://localhost:3000/api/auth/google/callback");
  });

  it("cae a localhost cuando GOOGLE_REDIRECT_URI es IP privada", () => {
    process.env.GOOGLE_REDIRECT_URI = "http://192.168.1.4:3000/api/auth/google/callback";
    expect(getGoogleRedirectUri()).toBe("http://localhost:3000/api/auth/google/callback");
  });
});
