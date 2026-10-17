import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("answered suggestions revise only their own draft and remain editable after success or failure", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Math.random = () => 0;
  });
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
  const personal = "Bursu kitaplar için kullanacağım.";
  const questions = [
    "Hangi beceriyi geliştirmek istiyorsun?",
    "Bu beceriyi nasıl kullanacaksın?",
  ];
  const replies = [
    "Python öğrenmek istiyorum.",
    "Açık kaynak eğitim araçları geliştireceğim.",
  ];
  const initial = "Bu destek, eğitimime odaklanmamı kolaylaştırabilir.";
  const revised =
    "Python öğrenerek açık kaynak eğitim araçları geliştirmek istiyorum. Bursu eğitim kitapları için kullanacağım.";
  let calls = 0;
  await page.route("**/api/draft", async (route) => {
    calls++;
    const request = route.request().postDataJSON();
    expect(request.requirement_id).toBe("motivation");
    expect(request.personal_info).toBe(personal);
    if (calls === 1) {
      expect(request.follow_up_answers).toEqual([]);
      await route.fulfill({
        json: {
          answer: initial,
          mode: "live",
          generic: false,
          follow_up_questions: questions,
        },
      });
    } else {
      expect(request.follow_up_answers).toEqual(
        questions.map((question, index) => ({
          question,
          answer: replies[index],
        })),
      );
      if (calls === 2)
        await route.fulfill({
          json: {
            answer: revised,
            mode: "live",
            generic: false,
            follow_up_questions: [],
          },
        });
      else
        await route.fulfill({
          status: 503,
          json: {
            detail: "Model geçici olarak erişilemiyor.",
            code: "ollama_unreachable",
            request_id: "followup-error-42",
          },
        });
    }
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
  await second
    .getByLabel("Düzenlenebilir yanıt")
    .fill("Diğer soruya kendi cevabım.");
  await first.getByLabel("Yanıtına hangi bilgileri ekleyelim?").fill(personal);
  await first
    .getByRole("button", { name: "Gemma 4 ile taslak oluştur" })
    .click();
  await expect(first.getByLabel("Düzenlenebilir yanıt")).toHaveValue(initial);
  const update = first.getByRole("button", {
    name: "Yanıtlarımla taslağı güncelle",
  });
  await expect(update).toBeDisabled();
  for (let index = 0; index < questions.length; index++)
    await first
      .getByLabel(questions[index], { exact: true })
      .fill(replies[index]);
  await expect(first.getByLabel("Düzenlenebilir yanıt")).toHaveValue(initial);
  await update.click();
  await expect(first.getByLabel("Düzenlenebilir yanıt")).toHaveValue(revised);
  await expect(second.getByLabel("Düzenlenebilir yanıt")).toHaveValue(
    "Diğer soruya kendi cevabım.",
  );
  await page.getByRole("tab", { name: "Genel bakış" }).click();
  await page.getByRole("tab", { name: "Yanıt asistanı" }).click();
  for (let index = 0; index < questions.length; index++)
    await expect(
      first.getByLabel(questions[index], { exact: true }),
    ).toHaveValue(replies[index]);
  await update.click();
  await expect(page.getByRole("alert")).toContainText("followup-error-42");
  await expect(first.getByLabel("Düzenlenebilir yanıt")).toHaveValue(revised);
  await expect(first.getByLabel(questions[0], { exact: true })).toHaveValue(
    replies[0],
  );
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  expect(calls).toBe(3);
});
