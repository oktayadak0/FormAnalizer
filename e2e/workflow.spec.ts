import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    Math.random = () => 0;
  });
});

test("complete sample workflow, editing, source evidence, checklist and clearing", async ({
  page,
}) => {
  // No backend or model required. Explicitly exercise the offline product.
  await page.route("**/api/status", (route) =>
    route.fulfill({
      json: {
        state: "unavailable",
        label: "AI Kullanılamıyor",
        detail: "Offline test",
      },
    }),
  );
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "Başvurunu anlamak kolay.",
  );
  await expect(
    page.getByRole("button", { name: "Başvurumu Analiz Et" }),
  ).toBeDisabled();
  await page.screenshot({
    path: `test-results/landing-${test.info().project.name}.png`,
    fullPage: true,
  });
  await page.getByRole("button", { name: /Önce bir örnekle tanış/ }).click();
  await expect(
    page.getByLabel("Önceden hazırlanmış demo sonuçlarını kullan"),
  ).toBeChecked();
  await page.getByRole("button", { name: "Başvurumu Analiz Et" }).click();
  await expect(
    page.getByRole("heading", { name: "Umut Bursu 2026" }),
  ).toBeVisible();
  await expect(
    page.getByText("analiz için canlı AI kullanılmadı.", { exact: false }),
  ).toBeVisible();
  await page
    .getByRole("tabpanel")
    .getByText("Kaynak cümlesini gör")
    .first()
    .click();
  await expect(
    page.getByRole("tabpanel").getByRole("blockquote"),
  ).toContainText("üniversite öğrencilerinin");
  const select = page.getByRole("combobox", {
    name: "Güncel öğrenci belgesi durumu",
  });
  await select.selectOption("in_progress");
  await expect(page.getByText("%0", { exact: true })).toBeVisible();
  await select.selectOption("completed");
  await expect(page.getByText("%9", { exact: true })).toBeVisible();
  await page.getByRole("tab", { name: "Eksik bilgiler" }).click();
  await expect(
    page.getByLabel("Güncel transkript", { exact: true }),
  ).toBeVisible();
  await page
    .getByLabel("Aktif lisans öğrencisi olduğunu doğrula", { exact: true })
    .fill("Aktif lisans öğrencisiyim.");
  await page.getByRole("button", { name: "Karşılaştır" }).click();
  await expect(
    page.getByText("Sizin beyanınız:", { exact: false }),
  ).toContainText("Aktif lisans öğrencisiyim.");
  await page.getByRole("tab", { name: "Yanıt asistanı" }).click();
  const card = page.getByRole("article", {
    name: "1. form sorusu",
    exact: true,
  });
  await expect(
    page.getByLabel("Taslağı gerçek Gemma 4 ile oluştur"),
  ).toBeChecked();
  await page.getByLabel("Taslağı gerçek Gemma 4 ile oluştur").uncheck();
  await card.getByRole("button", { name: "Demo taslağı oluştur" }).click();
  await expect(
    page.getByText("Şu soruları da yanıtlarsanız taslağınız güçlenir."),
  ).toBeVisible();
  await expect(card.getByLabel("Düzenlenebilir yanıt")).toHaveValue(/Bu burs/);
  await card
    .getByLabel("Yanıtına hangi bilgileri ekleyelim?")
    .fill("Öğrenciyim.");
  await card.getByRole("button", { name: "Demo taslağı oluştur" }).click();
  await expect(card.getByLabel("Düzenlenebilir yanıt")).toHaveValue(
    "Öğrenciyim.",
  );
  await expect(
    page.getByText("Şu soruları da yanıtlarsanız taslağınız güçlenir."),
  ).toBeVisible();
  const facts =
    "Yazılım alanında eğitimimi geliştirmek istiyorum.\nBursu eğitim kitapları için kullanacağım.";
  await card.getByLabel("Yanıtına hangi bilgileri ekleyelim?").fill(facts);
  await card.getByRole("button", { name: "Demo taslağı oluştur" }).click();
  await expect(card.getByLabel("Düzenlenebilir yanıt")).toHaveValue(facts);
  await card.getByLabel("Düzenlenebilir yanıt").fill("a".repeat(501));
  await expect(
    page.getByText("501 / 500 karakter · Sınır aşıldı"),
  ).toBeVisible();
  await card.getByLabel("Düzenlenebilir yanıt").fill(facts);
  await page.getByRole("tab", { name: "Genel bakış" }).click();
  await page.screenshot({
    path: `test-results/analysis-${test.info().project.name}.png`,
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBeTruthy();
  await page
    .getByRole("button", { name: "Başvuru verilerini temizle" })
    .click();
  await page
    .getByRole("button", { name: "Verileri temizle", exact: true })
    .click();
  await expect(page.getByLabel("Başvuru yönergesi")).toHaveValue("");
  expect(errors).toEqual([]);
});

test("custom text never gets substituted with demo and sessions stay separate", async ({
  page,
  isMobile,
}) => {
  await page.route("**/api/status", (route) =>
    route.fulfill({
      json: {
        state: "unavailable",
        label: "AI Kullanılamıyor",
        detail: "Offline",
      },
    }),
  );
  await page.route("**/api/analyze", (route) =>
    route.fulfill({
      status: 503,
      json: { detail: "Yerel Gemma 4 servisine ulaşılamadı." },
    }),
  );
  await page.goto("/");
  const custom =
    "Bu farklı bir başvuru yönergesidir. Öğrenci belgesi ve iletişim bilgileri gereklidir.";
  await page.getByLabel("Başvuru yönergesi").fill(custom);
  await page.getByRole("button", { name: "Başvurumu Analiz Et" }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Yerel Gemma 4 servisine ulaşılamadı.",
  );
  await expect(page.getByLabel("Başvuru yönergesi")).toHaveValue(custom);
  if (isMobile)
    await page.getByRole("button", { name: "Menüyü aç/kapat" }).click();
  await page
    .getByRole("button", { name: /Yeni başvuru/ })
    .first()
    .click();
  await expect(page.getByLabel("Başvuru yönergesi")).toHaveValue("");
  await page.reload();
  expect(await page.evaluate(() => localStorage.length)).toBe(0);
  await expect(page.getByLabel("Başvuru yönergesi")).toHaveValue("");
});

test("landing and analyzed workspace pass core WCAG automated checks", async ({
  page,
}) => {
  await page.route("**/api/status", (route) =>
    route.fulfill({
      json: {
        state: "unavailable",
        label: "AI Kullanılamıyor",
        detail: "Offline",
      },
    }),
  );
  await page.goto("/");
  const landing = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect
    .soft(
      landing.violations.map((v) => ({
        id: v.id,
        nodes: v.nodes.map((n) => ({
          target: n.target,
          summary: n.failureSummary,
        })),
      })),
    )
    .toEqual([]);
  await page.getByRole("button", { name: /Önce bir örnekle tanış/ }).click();
  await page.getByRole("button", { name: "Başvurumu Analiz Et" }).click();
  const workspace = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect
    .soft(
      workspace.violations.map((v) => ({
        id: v.id,
        nodes: v.nodes.map((n) => ({
          target: n.target,
          summary: n.failureSummary,
        })),
      })),
    )
    .toEqual([]);
  for (const tab of ["Eksik bilgiler", "Yanıt asistanı", "Kaynak metin"]) {
    await page.getByRole("tab", { name: tab }).click();
    const result = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    expect
      .soft(
        result.violations.map((v) => ({
          tab,
          id: v.id,
          nodes: v.nodes.map((n) => ({
            target: n.target,
            summary: n.failureSummary,
          })),
        })),
      )
      .toEqual([]);
  }
});
