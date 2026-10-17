import { expect, test } from "@playwright/test";

test("random examples change after analysis and every sample exposes several form questions", async ({
  page,
}) => {
  test.setTimeout(45000);
  await page.addInitScript(() => {
    Math.random = () => 0;
  });
  await page.route("**/api/status", (route) =>
    route.fulfill({
      json: {
        state: "unavailable",
        label: "AI Kullanılamıyor",
        detail: "Offline sample test",
      },
    }),
  );
  await page.goto("/");
  let previousSource = "";
  for (let index = 0; index < 3; index++) {
    await page.getByRole("button", { name: /Örnek ekle/ }).click();
    const source = await page.getByLabel("Başvuru yönergesi").inputValue();
    expect(source).not.toBe(previousSource);
    previousSource = source;
    await expect(
      page.getByLabel("Önceden hazırlanmış demo sonuçlarını kullan"),
    ).toBeChecked();
    await page.getByRole("button", { name: "Başvurumu Analiz Et" }).click();
    await page.getByRole("tab", { name: "Yanıt asistanı" }).click();
    const cards = page.getByRole("article", { name: /^\d+\. form sorusu$/ });
    await expect(cards).toHaveCount(3);
    await expect(
      page.locator(".answer-section").getByRole("combobox"),
    ).toHaveCount(0);
    const positions = await cards.evaluateAll((elements) =>
      elements.map((element) => element.getBoundingClientRect().top),
    );
    expect(positions[1]).toBeGreaterThan(positions[0]);
    expect(positions[2]).toBeGreaterThan(positions[1]);
    await page.getByLabel("Taslağı gerçek Gemma 4 ile oluştur").uncheck();
    const second = cards.nth(1);
    const third = cards.nth(2);
    await second.getByRole("button", { name: "Demo taslağı oluştur" }).click();
    const firstAnswer = await second
      .getByLabel("Düzenlenebilir yanıt")
      .inputValue();
    expect(firstAnswer.length).toBeGreaterThan(50);
    await third.getByRole("button", { name: "Demo taslağı oluştur" }).click();
    await expect(third.getByLabel("Düzenlenebilir yanıt")).not.toHaveValue(
      firstAnswer,
    );
    await expect(second.getByLabel("Düzenlenebilir yanıt")).toHaveValue(
      firstAnswer,
    );
    await expect(cards.first().getByLabel("Düzenlenebilir yanıt")).toHaveValue(
      "",
    );
    await expect(
      second.getByText("Şu soruları da yanıtlarsanız taslağınız güçlenir."),
    ).toBeVisible();
    await page.getByRole("tab", { name: "Genel bakış" }).click();
    await page.getByRole("tab", { name: "Yanıt asistanı" }).click();
    await expect(second.getByLabel("Düzenlenebilir yanıt")).toHaveValue(
      firstAnswer,
    );
    await expect(
      page.getByRole("button", { name: /Örnek ekle/ }),
    ).toBeVisible();
  }
});
