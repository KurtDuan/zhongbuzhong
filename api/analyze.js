function sendJson(res, statusCode, payload) {
  res.status(statusCode).json(payload);
}

async function analyzeMedicine(medicine) {
  const apiKey = process.env.DEEPSEEK_API_KEY;

  if (!apiKey) {
    throw new Error("Missing DEEPSEEK_API_KEY");
  }

  if (medicine.trim().length < 2) {
    return {
      verdict: "uncertain",
      headline: "写得太短，老中医不好判断",
      summary: "只写一个字或过短内容，看不出是何药、何方、何用处，没法稳妥下结论。",
      reasons: [
        "内容太短，看不出具体是什么药或什么方。",
        "没有成分、用途、宣传说法，无法辨别风险轻重。",
        "药方不清，好比只看见药柜一角，难知全貌。"
      ],
      expert_advice: "请写清楚具体的药方，老夫才好判断。药名、成分、功效说法，最好都写明白。"
    };
  }

  const response = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: "deepseek-chat",
      messages: [
        {
          role: "system",
          content:
            "你要扮演一位慈祥、稳重、见多识广的老中医，专门帮中老年人辨别药品、保健品、中药方子或宣传文案是否值得轻信。你的判断必须谨慎，重点检查：是否夸大疗效、是否包治百病、是否缺少适应证和禁忌说明、是否可能与慢病常用药同服冲突、是否不适合自行长期服用、是否会误导人拖延就医。你不是临床医生，不要做确定诊断。若信息不足但存在风险，宁可判 unsafe 或 uncertain，也不要轻易判 safe。写 expert_advice 和 reasons 时，要多用老中医式的形象比喻，例如“火气太大，容易烧着脾胃”“药不对路，好比南辕北辙”。请始终只返回一个 JSON 对象，不要输出 Markdown，不要输出额外解释。"
        },
        {
          role: "user",
          content:
            "请分析下面内容，并输出结构化结论：\n\n" + medicine + "\n\n要求：\n1. 结论 verdict 只能是 safe、unsafe、uncertain 三选一。\n2. 如果存在夸大宣传、虚假承诺、明显不适合自行服用、禁忌不清、适应证不明、可能延误就医等情况，优先判为 unsafe。\n3. 如果信息不足以确认安全，但可能误导老人自行服用，也不要轻易判 safe。\n4. headline 用一句大白话，适合老年人阅读。\n5. summary 用通俗中文总结。\n6. reasons 提供 3 到 5 条简明理由。\n7. expert_advice 用慈祥老中医口吻写，语气要有劝诫感，并尽量加入形象比喻，但不要吓唬人，也不要假装亲自治疗。\n8. 只返回严格 JSON，字段必须是：verdict、headline、summary、reasons、expert_advice。"
        }
      ],
      response_format: {
        type: "json_object"
      },
      temperature: 0.3
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || "DeepSeek request failed");
  }

  const data = await response.json();
  const rawText = data?.choices?.[0]?.message?.content;

  if (!rawText) {
    throw new Error("模型没有返回可解析内容");
  }

  const parsed = JSON.parse(rawText);
  const verdict = parsed.verdict === "safe" ? "safe" : (parsed.verdict === "unsafe" ? "unsafe" : "uncertain");
  const reasons = Array.isArray(parsed.reasons) ? parsed.reasons.slice(0, 5) : [];

  return {
    verdict,
    headline: parsed.headline || (verdict === "safe" ? "这项内容可以算“中”" : "这项内容应当判作“不中”"),
    summary: parsed.summary || (verdict === "safe" ? "当前没有发现特别夸张或明显危险的表述，但仍应谨慎。" : "存在夸大宣传、风险不清或不适合自行判断的情况。"),
    reasons,
    expert_advice: parsed.expert_advice || (verdict === "safe" ? "药可用，也得讲对证，讲分寸，别一看“中”就放松警惕。" : "药不是神符，话说得越满，越要多留一分疑心。")
  };
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    sendJson(res, 405, { error: "Method Not Allowed" });
    return;
  }

  try {
    const medicine = String(req.body?.medicine || "").trim();

    if (!medicine) {
      sendJson(res, 400, { error: "请输入药名、成分或宣传内容。" });
      return;
    }

    const result = await analyzeMedicine(medicine);
    sendJson(res, 200, result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "服务异常";
    sendJson(res, 500, { error: message });
  }
};
