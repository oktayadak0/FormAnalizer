import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    Math.random = () => 0;
  });
});

test("generating one answer preserves edits in another visible question", async ({
  page,
}) => {
  await page.route("**/api/status", (route) =>
    route.fulfill({
      json: {
        state: "unavailable",
        label: "AI Kullanılamıyor",
        detail: "Test",
      },
    }),
  );
  let releaseResponse!: () => void;
  const released = new Promise<void>((resolve) => {
    releaseResponse = resolve;
  });
  await page.route("**/api/draft", async (route) => {
    expect(route.request().postDataJSON().requirement_id).toBe("motivation");
    await released;
    await route.fulfill({
      json: {
        answer: "Bu destek, eğitim kaynaklarına erişimimi kolaylaştırabilir.",
        mode: "live",
        generic: true,
        follow_up_questions: ["Eğitim hedefiniz nedir?"],
      },
    });
  });
  await page.goto("/");
  await page.getByRole("button", { name: /Örnek ekle/ }).click();
  await page.getByRole("button", { name: "Başvurumu Analiz Et" }).click();
  await page.getByRole("tab", { name: "Yanıt asistanı" }).click();
  const first = page.getByRole("article", {
    name: "1. form sorusu",
    exact: true,
  });
  const second = page.getByRole("article", {
    name: "2. form sorusu",
    exact: true,
  });
  await first
    .getByRole("button", { name: "Gemma 4 ile taslak oluştur" })
    .click();
  await expect(
    first.getByRole("button", { name: /Yanıt bekleniyor/ }),
  ).toBeVisible();
  await second
    .getByLabel("Düzenlenebilir yanıt")
    .fill("İkinci soruya kendim yazdığım yanıt.");
  releaseResponse();
  await expect(first.getByLabel("Düzenlenebilir yanıt")).toHaveValue(
    "Bu destek, eğitim kaynaklarına erişimimi kolaylaştırabilir.",
  );
  await expect(second.getByLabel("Düzenlenebilir yanıt")).toHaveValue(
    "İkinci soruya kendim yazdığım yanıt.",
  );
  await expect(first.getByText("Eğitim hedefiniz nedir?")).toBeVisible();
  await expect(second.getByText("Eğitim hedefiniz nedir?")).toHaveCount(0);
  await page.getByRole("tab", { name: "Genel bakış" }).click();
  await page
    .getByRole("button", {
      name: /Öğrendiğin bilgileri çevrene nasıl aktarmak istersin\? sorusunu yanıtla/,
    })
    .click();
  await expect(
    page.getByRole("article", { name: "3. form sorusu", exact: true }),
  ).toBeFocused();
});

test("draft button requests a newly written answer even with an empty information field", async ({
  page,
}) => {
  await page.route("**/api/status", (route) =>
    route.fulfill({
      json: {
        state: "unavailable",
        label: "AI Kullanılamıyor",
        model: "gemma4:e2b",
        detail: "Test",
      },
    }),
  );
  const answer =
    "Bu destek, eğitim kaynaklarından daha fazla yararlanmama ve öğrendiklerimi uygulamaya dönüştürmeme katkı sağlayabilir.";
  let calls = 0;
  await page.route("**/api/draft", (route) => {
    calls++;
    expect(route.request().postDataJSON()).toMatchObject({
      demo: false,
      personal_info: "",
      requirement_id: "motivation",
    });
    return route.fulfill({
      json: {
        answer,
        mode: "live",
        generic: true,
        follow_up_questions: [
          "Hangi eğitim hedefinize öncelik vermek istersiniz?",
        ],
      },
    });
  });
  await page.goto("/");
  await page.getByRole("button", { name: /Önce bir örnekle tanış/ }).click();
  await page.getByRole("button", { name: "Başvurumu Analiz Et" }).click();
  await page.getByRole("tab", { name: "Yanıt asistanı" }).click();
  const card = page.getByRole("article", {
    name: "1. form sorusu",
    exact: true,
  });
  await expect(
    card.getByLabel("Yanıtına hangi bilgileri ekleyelim?"),
  ).toHaveValue("");
  await card
    .getByRole("button", { name: "Gemma 4 ile taslak oluştur" })
    .click();
  await expect(card.getByLabel("Düzenlenebilir yanıt")).toHaveValue(answer);
  await expect(
    page.getByText(
      "Kişisel bilgi paylaşmadığınız için bu genel bir yanıt önerisidir.",
      { exact: false },
    ),
  ).toBeVisible();
  await expect(
    page.getByText("Hangi eğitim hedefinize öncelik vermek istersiniz?"),
  ).toBeVisible();
  await expect(
    card.getByRole("button", { name: "Kopyala", exact: true }),
  ).toBeEnabled();
  expect(calls).toBe(1);
});

test("answer assistant explains keyless setup and can use live Gemma with a demo analysis", async ({
  page,
}) => {
  await page.route("**/api/status", (route) =>
    route.fulfill({
      json: {
        state: "unavailable",
        label: "Gemma 4 Kurulu Değil",
        detail: "Ollama çalışıyor; model indirilmemiş. API key gerekmez.",
        code: "model_missing",
        model: "gemma4:e4b",
        ollama_reachable: true,
        model_installed: false,
        api_key_required: false,
        inference_verified: false,
      },
    }),
  );
  let calls = 0;
  const personal =
    "Yazılım eğitimimi geliştirmek istiyorum.\nBursu kitaplar için kullanacağım.";
  const generated =
    "Bu burs sayesinde eğitim kitaplarına erişimimi kolaylaştırmayı ve yazılım alanındaki gelişimime odaklanmayı amaçlıyorum.";
  await page.route("**/api/draft", async (route) => {
    calls++;
    const request = route.request().postDataJSON();
    expect(request.demo).toBe(false);
    expect(request.personal_info).toBe(personal);
    if (calls === 1)
      await route.fulfill({
        status: 503,
        json: {
          detail:
            "Gemma modeli bulunamadı. installer.bat çalıştırın. API key gerekmez.",
          code: "model_missing",
          request_id: "test-trace-182",
        },
      });
    else
      await route.fulfill({
        json: {
          answer: generated,
          follow_up_questions: [
            "Bu kaynaklarla hangi projeyi yapmak istersiniz?",
          ],
          mode: "live",
        },
      });
  });
  await page.goto("/");
  await page.getByRole("button", { name: /Önce bir örnekle tanış/ }).click();
  await page.getByRole("button", { name: "Başvurumu Analiz Et" }).click();
  await page.getByRole("tab", { name: "Yanıt asistanı" }).click();
  const card = page.getByRole("article", {
    name: "1. form sorusu",
    exact: true,
  });
  await expect(
    page.getByLabel("Taslağı gerçek Gemma 4 ile oluştur"),
  ).toBeChecked();
  await page
    .getByRole("button", { name: "Model kurulumunu kontrol et" })
    .click();
  const modal = page.getByRole("dialog");
  await expect(
    modal.getByText(
      "API key gerekmez. Gemma 4, Ollama üzerinden bu bilgisayarda çalışır.",
    ),
  ).toBeVisible();
  await expect(modal.getByText("Hayır", { exact: true })).toBeVisible();
  await expect(modal.getByText("gemma4:e4b", { exact: true })).toBeVisible();
  await modal.getByRole("button", { name: "Pencereyi kapat" }).click();
  await page.getByLabel("Taslağı gerçek Gemma 4 ile oluştur").check();
  await card.getByLabel("Yanıtına hangi bilgileri ekleyelim?").fill(personal);
  await card
    .getByRole("button", { name: "Gemma 4 ile taslak oluştur" })
    .click();
  await expect(page.getByRole("alert")).toContainText("Tanı: test-trace-182");
  await expect(card.getByLabel("Düzenlenebilir yanıt")).toHaveValue("");
  await card
    .getByRole("button", { name: "Gemma 4 ile taslak oluştur" })
    .click();
  await expect(card.getByLabel("Düzenlenebilir yanıt")).toHaveValue(generated);
  await expect(page.getByText("AI önerisi · Düzenlenebilir")).toBeVisible();
  const suggestions = page.getByText(
    "Şu soruları da yanıtlarsanız taslağınız güçlenir.",
  );
  await expect(suggestions).toBeVisible();
  await expect(
    page.getByText("Bu kaynaklarla hangi projeyi yapmak istersiniz?"),
  ).toBeVisible();
  await expect(
    card.getByRole("button", { name: "Kopyala", exact: true }),
  ).toBeEnabled();
  const answerBox = await card.getByLabel("Düzenlenebilir yanıt").boundingBox();
  const suggestionsBox = await suggestions.boundingBox();
  expect(suggestionsBox!.y).toBeGreaterThan(answerBox!.y + answerBox!.height);
  expect(calls).toBe(2);
});
